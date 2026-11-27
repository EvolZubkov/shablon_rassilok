"""
exchange_scheduled.py — письма, ожидающие отложенной отправки.

Отложенное письмо лежит в «Исходящих» (см. exchange_sender._submit_deferred).
Удаление оттуда отменяет отправку; менять такое письмо на месте сервер
не разрешает (ErrorAccessDenied).
"""
import datetime
import logging

import exchange_sender as ex

if ex.EXCHANGELIB_AVAILABLE:
    from exchangelib import ExtendedProperty, FileAttachment, HTMLBody, Message

    class _MessageFlagsProp(ExtendedProperty):
        property_tag = 0x0E07  # PidTagMessageFlags
        property_type = 'Integer'

    try:
        Message.register('schedule_message_flags', _MessageFlagsProp)
    except ValueError:
        pass  # свойство уже зарегистрировано (повторный импорт модуля)

_logger = logging.getLogger(__name__)

#: PidTagMessageFlags: письмо передано на отправку и ждёт своего времени.
_FLAG_SUBMITTED = 0x4

_LIST_FIELDS = (
    'subject', 'to_recipients', 'cc_recipients', 'bcc_recipients',
    'has_attachments', 'deferred_delivery_time', 'schedule_message_flags',
)


#: Запас времени: и старое, и новое время должны быть не ближе этого к «сейчас».
MIN_LEAD = datetime.timedelta(minutes=2)

_GONE_MESSAGE = ('Письма уже нет в «Исходящих»: оно отправлено, отменено или изменено. '
                 'Обновите список.')


class ScheduledNotFound(LookupError):
    """Письма уже нет в «Исходящих»: отправлено, отменено или изменено."""


def _outbox_items(account) -> list:
    """Отложенные письма из «Исходящих» (обычные письма не включаются)."""
    items = account.outbox.all().only(*_LIST_FIELDS)
    return [item for item in items
            if getattr(item, 'deferred_delivery_time', None) is not None]


def _addresses(mailboxes) -> list:
    return [m.email_address for m in (mailboxes or []) if m.email_address]


def _describe(item) -> dict:
    flags = getattr(item, 'schedule_message_flags', None) or 0
    return {
        'id': item.id,
        'subject': item.subject or '',
        'to': _addresses(item.to_recipients),
        'cc': _addresses(item.cc_recipients),
        'bcc': _addresses(item.bcc_recipients),
        'send_at': item.deferred_delivery_time.isoformat(),
        'has_attachments': bool(item.has_attachments),
        'waiting': bool(flags & _FLAG_SUBMITTED),
    }


def list_scheduled(account) -> list:
    """Ожидающие письма ящика, ближайшие по времени — первыми.

    :returns: список словарей ``id, subject, to, cc, bcc, send_at (ISO, UTC),
        has_attachments, waiting``. ``waiting=False`` — письмо сняли с отправки
        (например, открыли в Outlook и не отправили снова).
    """
    try:
        described = [_describe(item) for item in _outbox_items(account)]
    except Exception as e:
        _raise_readable(e)
    return sorted(described, key=lambda row: row['send_at'])


def cancel_scheduled(account, item_id: str) -> str:
    """Отменяет отправку: переносит письмо из «Исходящих» в «Удалённые».

    :returns: тема отменённого письма.
    :raises ScheduledNotFound: письма уже нет в «Исходящих».
    :raises RuntimeError: письмо не удалось убрать из «Исходящих».
    """
    try:
        item = next((i for i in _outbox_items(account) if i.id == item_id), None)
        if item is None:
            raise ScheduledNotFound(_GONE_MESSAGE)
        subject = item.subject or ''
        item.move_to_trash()
        still_there = any(i.id == item_id for i in _outbox_items(account))
    except ScheduledNotFound:
        raise
    except Exception as e:
        _raise_readable(e)
    if still_there:
        raise RuntimeError('Письмо не удалено из «Исходящих» — проверьте его в Outlook')
    _logger.info('scheduled: отправка отменена, subject=%r', subject)
    return subject


def update_scheduled(account, item_id: str, *, subject: str, to: list, cc: list,
                     bcc: list, send_at: datetime.datetime, timezone: float,
                     now: datetime.datetime = None) -> None:
    """Меняет тему, получателей и время ожидающего письма.

    Сервер не разрешает править такое письмо на месте, поэтому оно заменяется:
    новое сохраняется в «Исходящие» → старое убирается (и это проверяется) →
    новое отправляется. Так сбой не приводит к двум письмам.

    :param send_at: новое местное время пользователя (без часового пояса).
    :param timezone: смещение местного времени от UTC в часах.
    :param now: текущее время (UTC), подставляется в тестах.
    :raises ValueError: неверные данные или до отправки меньше двух минут.
    :raises ScheduledNotFound: письма уже нет в «Исходящих».
    :raises RuntimeError: заменить или отправить письмо не удалось.
    """
    now = now or datetime.datetime.now(datetime.timezone.utc)
    _check_changes(subject, to, cc, bcc, send_at, timezone, now)
    try:
        old = next((i for i in account.outbox.all() if i.id == item_id), None)
        if old is None:
            raise ScheduledNotFound(_GONE_MESSAGE)
        waiting = bool((old.schedule_message_flags or 0) & _FLAG_SUBMITTED)
        if waiting and old.deferred_delivery_time - now < MIN_LEAD:
            raise ValueError('До отправки слишком близко (меньше 2 минут) — '
                             'письмо уже не изменить.')
        new = _build_replacement(account, old, subject.strip(),
                                 {'to': to, 'cc': cc, 'bcc': bcc},
                                 ex._to_ews_datetime(send_at, timezone))
        new.save()
    except (ScheduledNotFound, ValueError):
        raise
    except Exception as e:
        _raise_readable(e)
    _replace(account, old, new)
    _logger.info('scheduled: письмо изменено, subject=%r', subject)


def _check_changes(subject, to, cc, bcc, send_at, timezone, now) -> None:
    if not (subject or '').strip():
        raise ValueError('Тема обязательна')
    if not (to or cc or bcc):
        raise ValueError('Укажите хотя бы одного получателя')
    send_at_utc = (send_at - datetime.timedelta(hours=timezone)).replace(
        tzinfo=datetime.timezone.utc)
    if send_at_utc - now < MIN_LEAD:
        raise ValueError('Новое время должно быть не раньше чем через 2 минуты')


def _build_replacement(account, old, subject: str, recipients: dict, when):
    """Копия письма с новыми темой, получателями и временем (ещё не сохранена)."""
    mailboxes = {}
    for kind, addresses in recipients.items():
        current = getattr(old, f'{kind}_recipients')
        if addresses == _addresses(current):
            mailboxes[f'{kind}_recipients'] = current  # без повторного разрешения имён
        else:
            mailboxes[f'{kind}_recipients'] = (
                ex._to_mailboxes(addresses, account) if addresses else None)
    new = Message(account=account, folder=account.outbox, subject=subject,
                  body=HTMLBody(old.body or ''), **mailboxes)
    new.importance = old.importance
    new.is_read_receipt_requested = old.is_read_receipt_requested
    new.deferred_delivery_time = when
    new.client_deferred_delivery_time = when
    for attachment in old.attachments or []:
        content = getattr(attachment, 'content', None)
        if content is None:
            raise ValueError('В письме есть вложенное письмо или элемент Outlook — '
                             'измените его в самом Outlook.')
        new.attach(FileAttachment(
            name=attachment.name, content_type=attachment.content_type,
            content=content, is_inline=attachment.is_inline,
            content_id=attachment.content_id))
    return new


def _replace(account, old, new) -> None:
    """Убирает старое письмо и отправляет уже сохранённое новое."""
    old_id = old.id
    try:
        old.move_to_trash()
        removed = not any(i.id == old_id for i in _outbox_items(account))
    except Exception as e:
        _logger.error('scheduled: старое письмо не убрано: %s', e, exc_info=True)
        removed = False
    if not removed:
        ex._discard_unsent(new)
        raise RuntimeError('Письмо не удалось заменить: старое осталось без изменений. '
                           'Обновите список.')
    try:
        new.send(save_copy=True, copy_to_folder=account.sent)
    except Exception as e:
        _logger.error('scheduled: новое письмо не отправлено: %s', e, exc_info=True)
        _keep_as_draft(account, new)
        raise RuntimeError(
            'Старое письмо отменено, а новое отправить не удалось. Оно сохранено в папку '
            '«Черновики» (или осталось в «Исходящих») — отправьте его из Outlook.') from e


def _keep_as_draft(account, message) -> None:
    try:
        message.move(account.drafts)
    except Exception as e:  # исходная ошибка отправки важнее
        _logger.warning('scheduled: письмо не перенесено в «Черновики»: %s', e)


def _raise_readable(exc: Exception):
    """Превращает ошибку exchangelib в понятную пользователю и бросает её."""
    if ex._is_mailbox_folders_unavailable(exc):
        raise RuntimeError(
            'Нет доступа к папкам ящика (есть только право SendAs): '
            'запланированные письма для него не видны.') from exc
    ex._wrap_exchange_error(exc)
    raise exc
