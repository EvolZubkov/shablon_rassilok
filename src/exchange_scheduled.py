"""
exchange_scheduled.py — письма, ожидающие отложенной отправки.

Отложенное письмо лежит в «Исходящих» (см. exchange_sender._submit_deferred).
Удаление оттуда отменяет отправку; менять такое письмо на месте сервер
не разрешает (ErrorAccessDenied).
"""
import base64
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

_RECIPIENT_KINDS = ('to', 'cc', 'bcc')

_LIST_FIELDS = (
    'subject', 'to_recipients', 'cc_recipients', 'bcc_recipients',
    'has_attachments', 'deferred_delivery_time', 'schedule_message_flags',
    'pochtelye_schedule_id',
)


#: Запас времени: и старое, и новое время должны быть не ближе этого к «сейчас».
MIN_LEAD = datetime.timedelta(minutes=2)

_TOO_CLOSE_MESSAGE = ('До отправки слишком близко (меньше 2 минут) — '
                      'письмо уже не изменить.')

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
        'schedule_id': getattr(item, 'pochtelye_schedule_id', None),
    }


def list_scheduled(account) -> list:
    """Ожидающие письма ящика, ближайшие по времени — первыми.

    :returns: список словарей ``id, subject, to, cc, bcc, send_at (ISO, UTC),
        has_attachments, waiting, schedule_id``. ``waiting=False`` — письмо сняли с отправки
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

    def build(old):
        recipients = _new_recipients(account, old, {'to': to, 'cc': cc, 'bcc': bcc})
        return _build_replacement(
            account, old, subject=subject.strip(), recipients=recipients,
            body=old.body or '', when=ex._to_ews_datetime(send_at, timezone),
            attachments=_copy_files(old.attachments))

    _swap(account, lambda item: item.id == item_id, build, now)
    _logger.info('scheduled: письмо изменено, subject=%r', subject)


def replace_body(account, schedule_id: str, html_body: str, *,
                 attachments: list = None, now: datetime.datetime = None) -> None:
    """Меняет текст ожидающего письма; тема, получатели и время остаются.

    Картинки берутся из нового HTML, обычные вложения — из письма на сервере.

    :param schedule_id: метка письма (``pochtelye_schedule_id``): в отличие от
        id она не меняется при заменах.
    :param attachments: новые файлы ``{name, content (base64), mime_type}``;
        вложение с тем же именем (и прежний файл согласования) заменяется.
    :raises ValueError: до отправки меньше двух минут.
    :raises ScheduledNotFound: письма уже нет в «Исходящих».
    :raises RuntimeError: заменить или отправить письмо не удалось.
    """
    now = now or datetime.datetime.now(datetime.timezone.utc)
    added = [FileAttachment(name=a['name'], content=base64.b64decode(a['content']),
                            content_type=a.get('mime_type') or 'application/octet-stream')
             for a in attachments or []]
    replaced_names = {a['name'] for a in attachments or []}

    new_review = any(_is_review_file(name) for name in replaced_names)

    def build(old):
        html, pictures = ex._convert_data_images_to_cid(html_body)
        files = [a for a in old.attachments or []
                 if not a.is_inline and a.name not in replaced_names
                 and not (new_review and _is_review_file(a.name))]
        return _build_replacement(
            account, old, subject=old.subject,
            recipients={f'{kind}_recipients': getattr(old, f'{kind}_recipients')
                        for kind in _RECIPIENT_KINDS},
            body=html, when=old.deferred_delivery_time,
            attachments=[*_copy_files(files), *pictures, *added])

    _swap(account, lambda item: getattr(item, 'pochtelye_schedule_id', None) == schedule_id,
          build, now)
    _logger.info('scheduled: изменён текст письма')


def _is_review_file(name: str) -> bool:
    """JSON с блоками, который прикладывается к письму «На согласование»."""
    name = name or ''
    return name.startswith('review_') and name.endswith('.json')


def _swap(account, matches, build, now) -> None:
    """Находит письмо в «Исходящих» и заменяет его построенным ``build(old)``."""
    try:
        old = next((i for i in account.outbox.all() if matches(i)), None)
        if old is None:
            raise ScheduledNotFound(_GONE_MESSAGE)
        waiting = bool((old.schedule_message_flags or 0) & _FLAG_SUBMITTED)
        if waiting and old.deferred_delivery_time - now < MIN_LEAD:
            raise ValueError(_TOO_CLOSE_MESSAGE)
        new = build(old)
        new.save()
    except (ScheduledNotFound, ValueError):
        raise
    except Exception as e:
        _raise_readable(e)
    _replace(account, old, new)


def _check_changes(subject, to, cc, bcc, send_at, timezone, now) -> None:
    if not (subject or '').strip():
        raise ValueError('Тема обязательна')
    if not (to or cc or bcc):
        raise ValueError('Укажите хотя бы одного получателя')
    send_at_utc = (send_at - datetime.timedelta(hours=timezone)).replace(
        tzinfo=datetime.timezone.utc)
    if send_at_utc - now < MIN_LEAD:
        raise ValueError('Новое время должно быть не раньше чем через 2 минуты')


def _new_recipients(account, old, addresses_by_kind: dict) -> dict:
    """Получатели нового письма; неизменённые поля не разрешаются заново."""
    result = {}
    for kind, addresses in addresses_by_kind.items():
        current = getattr(old, f'{kind}_recipients')
        if addresses == _addresses(current):
            result[f'{kind}_recipients'] = current
        else:
            result[f'{kind}_recipients'] = (
                ex._to_mailboxes(addresses, account) if addresses else None)
    return result


def _copy_files(attachments) -> list:
    """Копии файловых вложений письма."""
    copies = []
    for attachment in attachments or []:
        content = getattr(attachment, 'content', None)
        if content is None:
            raise ValueError('В письме есть вложенное письмо или элемент Outlook — '
                             'измените его в самом Outlook.')
        copies.append(FileAttachment(
            name=attachment.name, content_type=attachment.content_type,
            content=content, is_inline=attachment.is_inline,
            content_id=attachment.content_id))
    return copies


def _build_replacement(account, old, *, subject, recipients: dict, body, when,
                       attachments: list):
    """Новое письмо взамен старого (ещё не сохранено)."""
    new = Message(account=account, folder=account.outbox, subject=subject,
                  body=HTMLBody(body), **recipients)
    new.importance = old.importance
    new.is_read_receipt_requested = old.is_read_receipt_requested
    new.deferred_delivery_time = when
    new.client_deferred_delivery_time = when
    new.pochtelye_schedule_id = getattr(old, 'pochtelye_schedule_id', None)
    for attachment in attachments:
        new.attach(attachment)
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
