"""
exchange_sender.py — отправка писем и встреч через MS Exchange (EWS).

Использует exchangelib. Не требует установленного Outlook.
"""

import datetime
import logging
import re
import uuid
import base64
import mimetypes

try:
    from exchangelib import (
        Account, Configuration, Credentials, DELEGATE,
        HTMLBody, Mailbox, EWSDateTime, EWSTimeZone,
        CalendarItem, Message, Attendee, FileAttachment,
    )
    from exchangelib.errors import UnauthorizedError, TransportError
    EXCHANGELIB_AVAILABLE = True
except ImportError:
    EXCHANGELIB_AVAILABLE = False

_logger = logging.getLogger(__name__)


# ─── Утилиты ─────────────────────────────────────────────────────────────────

def parse_datetime(s: str) -> datetime.datetime:
    """
    Парсит ISO 8601 строку в datetime.
    Принимает только формат с датой И временем: '2025-06-01T10:00:00'
    Строки без времени ('2025-06-01') отклоняются.
    """
    if not s:
        raise ValueError('Пустая строка datetime')
    s = str(s)
    if 'T' not in s:
        raise ValueError(f'Некорректный формат даты: {s}')
    try:
        return datetime.datetime.fromisoformat(s)
    except (ValueError, TypeError):
        raise ValueError(f'Некорректный формат даты: {s}')


def parse_recipients(raw) -> list:
    """
    Принимает список или строку 'a@rt.ru, b@rt.ru'.
    Возвращает список stripped строк без пустых.
    """
    if isinstance(raw, list):
        return [e.strip() for e in raw if str(e).strip()]
    if not raw:
        return []
    return [e.strip() for e in str(raw).split(',') if e.strip()]


def validate_recipients(emails: list) -> None:
    """Raises ValueError если есть адрес без @."""
    invalid = [e for e in emails if '@' not in e]
    if invalid:
        raise ValueError(f'Некорректные адреса: {invalid}')


def _to_mailboxes(emails: list) -> list:
    """Конвертирует список строк в список Mailbox (для писем)."""
    return [Mailbox(email_address=e) for e in emails]


def _to_attendees(emails: list) -> list:
    """Конвертирует список строк в список Attendee (для встреч)."""
    return [Attendee(mailbox=Mailbox(email_address=e)) for e in emails]


# ─── Подключение ─────────────────────────────────────────────────────────────

def connect_exchange(server: str, username: str, password: str,
                     from_email: str) -> 'Account':
    """Build an Exchange ``Account`` object (no network I/O at this stage).

    ``Account(autodiscover=False)`` does **not** open a connection — the real
    network handshake happens on the first EWS call (``msg.send()``, etc.).
    Errors raised here are limited to bad argument types; actual auth/network
    failures surface later and are caught in the send helpers.

    Raises:
        ValueError       — неверный логин/пароль (при первом сетевом вызове)
        ConnectionError  — сервер недоступен
        RuntimeError     — любая другая ошибка Exchange
    """
    if not EXCHANGELIB_AVAILABLE:
        raise RuntimeError(
            'exchangelib не установлен: pip install exchangelib')

    # Guard against empty from_email coming from the frontend "default" option.
    effective_from = (from_email or '').strip() or username.strip()

    _logger.info('exchange connect: server=%s username=%s from=%s',
                 server, username, effective_from)
    try:
        credentials = Credentials(username=username, password=password)
        config = Configuration(server=server, credentials=credentials)
        account = Account(
            primary_smtp_address=effective_from,
            config=config,
            autodiscover=False,
            access_type=DELEGATE,
        )
        _logger.debug('Account object created (no network call yet)')
        return account
    except Exception as e:
        _logger.error('connect_exchange failed: %s: %s', type(e).__name__, e,
                      exc_info=True)
        _wrap_exchange_error(e)


def _wrap_exchange_error(exc: Exception) -> None:
    """Translate exchangelib / network exceptions into standard Python types.

    Logs the original exception class and message so the protocol.log always
    contains the raw error regardless of how the caller surfaces it to the UI.
    """
    name = type(exc).__name__
    msg  = str(exc)
    _logger.error('Exchange error [%s]: %s', name, msg)

    # Authentication / authorisation
    if any(k in name for k in ('Unauthorized', 'AuthenticationFailed',
                                'ErrorAccessDenied')):
        raise ValueError('Неверный логин или пароль / нет доступа к ящику')

    # Non-existent mailbox
    if 'NonExistentMailbox' in name or 'ErrorNonExistentMailbox' in name:
        raise ValueError('Почтовый ящик не найден на сервере Exchange')

    # Network / transport
    if any(k in name for k in ('Transport', 'Connection', 'Connect')):
        raise ConnectionError(f'Сервер Exchange недоступен: {msg}')

    # Timeout (requests.exceptions.Timeout, socket.timeout, etc.)
    if 'Timeout' in name or 'timeout' in msg.lower():
        raise ConnectionError(f'Превышено время ожидания ответа от Exchange: {msg}')

    # SSL / TLS
    if 'SSL' in name or 'ssl' in msg.lower() or 'certificate' in msg.lower():
        raise ConnectionError(
            f'Ошибка SSL/TLS при подключении к Exchange — возможно, '
            f'сервер использует самоподписанный сертификат: {msg}')

    # DNS resolution failure
    if 'gaierror' in name or 'Name or service not known' in msg:
        raise ConnectionError(f'Не удалось разрешить имя сервера Exchange: {msg}')

    raise RuntimeError(f'Ошибка Exchange [{name}]: {msg}')


# ─── Отправка письма ─────────────────────────────────────────────────────────

def _convert_data_images_to_cid(html_body: str):
    """
    Заменяет все data:image/... на CID-вложения.
    Outlook не показывает data: URI — нужны CID.
    Возвращает (html_with_cid, список FileAttachment).
    """
    attachments = []
    counter = [0]

    def replace_data_src(match):
        mime_type = match.group(1)
        b64_data = match.group(2)
        cid = f"img_{counter[0]}_{uuid.uuid4().hex[:8]}"
        counter[0] += 1
        try:
            raw = base64.b64decode(b64_data)
        except Exception:
            return match.group(0)
        ext = (mimetypes.guess_extension(mime_type)
               or '.png').replace('.jpe', '.jpg')
        filename = f"img_{counter[0]}{ext}"
        
        att = FileAttachment(
            name=filename,
            content_type=mime_type,
            content_id=cid,
            is_inline=True,
            content=raw,
        )
        attachments.append(att)
        return f'src="cid:{cid}"'

    html_out = re.sub(
        r'src="data:([^;]+);base64,([^"]+)"',
        replace_data_src,
        html_body
    )
    return html_out, attachments


def exchange_send_email(account: 'Account', subject: str, html_body: str,
                        to: list, cc: list = None, bcc: list = None,
                        attachments: list = None) -> None:
    """
    Отправляет HTML-письмо через Exchange.
    Args:
        account   — объект Account из connect_exchange()
        subject   — тема письма
        html_body — HTML содержимое (наш сгенерированный шаблон)
        to        — список адресов получателей
        cc        — копия (необязательно)
        bcc       — скрытая копия (необязательно)
    """
    if not to and not cc and not bcc:
        raise ValueError('Не указаны получатели')
    if to:  validate_recipients(to)
    if cc:  validate_recipients(cc)
    if bcc: validate_recipients(bcc)
    attachments_raw = attachments or []
    _logger.info('send_email: subject=%r to=%s cc=%s bcc=%s attachments=%d',
                 subject, to, cc, bcc, len(attachments_raw))
    try:
        html_with_cid, attachments = _convert_data_images_to_cid(html_body)
        _logger.debug('send_email: %d inline CID images converted', len(attachments))
        msg = Message(
            account=account,
            subject=subject,
            body=HTMLBody(html_with_cid),
            to_recipients=_to_mailboxes(to) if to else None,
            cc_recipients=_to_mailboxes(cc) if cc else None,
            bcc_recipients=_to_mailboxes(bcc) if bcc else None,
        )
        for att in attachments:
            msg.attach(att)
        # Прикрепляем пользовательские файлы
        for file_data in (attachments_raw or []):
            try:
                raw = base64.b64decode(file_data['content'])
                file_att = FileAttachment(
                    name=file_data['name'],
                    content_type=file_data.get('mime_type', 'application/octet-stream'),
                    content=raw,
                )
                msg.attach(file_att)
            except Exception as e:
                print(f'⚠️  Вложение {file_data.get("name")}: {e}')
        _logger.debug('send_email: calling msg.send()')
        msg.send()
        _logger.info('send_email: success subject=%r', subject)
    except (ValueError, ConnectionError):
        raise
    except Exception as e:
        _logger.error('send_email failed at msg.send(): %s: %s',
                      type(e).__name__, e, exc_info=True)
        _wrap_exchange_error(e)


# ─── Отправка встречи ────────────────────────────────────────────────────────

def exchange_send_meeting(account: 'Account', subject: str, html_body: str,
                          to: list, cc: list = None, bcc: list = None,
                          location: str = '', start_dt: datetime.datetime = None,
                          end_dt: datetime.datetime = None,
                          attachments: list = None) -> None:
    """
    Создаёт встречу через EWS с попыткой встроить inline CID-картинки.
    """
    if not to and not bcc:
        raise ValueError('Не указаны участники')
    if not start_dt or not end_dt:
        raise ValueError('Дата и время обязательны')
    if end_dt <= start_dt:
        raise ValueError('Время окончания должно быть позже начала')

    validate_recipients(to)
    if cc:
        validate_recipients(cc)

    user_attachments = attachments or []
    _logger.info('send_meeting: subject=%r to=%s bcc=%s start=%s end=%s attachments=%d',
                 subject, to, bcc, start_dt, end_dt, len(user_attachments))
    try:
        import pytz

        tz = EWSTimeZone.from_pytz(pytz.timezone('Europe/Moscow'))

        start_ews = EWSDateTime(
            start_dt.year, start_dt.month, start_dt.day,
            start_dt.hour, start_dt.minute, start_dt.second,
            tzinfo=tz
        )
        end_ews = EWSDateTime(
            end_dt.year, end_dt.month, end_dt.day,
            end_dt.hour, end_dt.minute, end_dt.second,
            tzinfo=tz
        )

        # 1. Конвертируем data:image -> cid:
        html_with_cid, inline_atts = _convert_data_images_to_cid(html_body)  # ← переименовано

        # 2. Создаём встречу
        required = to if to else bcc
        item = CalendarItem(
            account=account,
            folder=account.calendar,
            subject=subject,
            body=HTMLBody(html_with_cid),
            location=location or '',
            start=start_ews,
            end=end_ews,
            required_attendees=_to_attendees(required),
            optional_attendees=_to_attendees(cc) if cc else None,
        )

        # 3. Save without sending so we get item.id and can attach files.
        item.save(send_meeting_invitations='SendToNone')

        # 4. Attach inline CID images (converted from data: URIs)
        for att in inline_atts:
            item.attach(att)

        # 5. Attach user-supplied files
        for file_data in user_attachments:
            try:
                raw = base64.b64decode(file_data['content'])
                file_att = FileAttachment(
                    name=file_data['name'],
                    content_type=file_data.get('mime_type', 'application/octet-stream'),
                    content=raw,
                )
                item.attach(file_att)
            except Exception as e:
                print(f'⚠️  Вложение {file_data.get("name")}: {e}')

        # 6. Send invitations via the public save() API.
        #    Calling save() a second time with SendToAllAndSaveCopy triggers
        #    Exchange to dispatch the meeting request to all attendees.
        #    This avoids the private _update() method whose signature varies
        #    across exchangelib versions.
        _logger.debug('send_meeting: dispatching invitations')
        item.save(send_meeting_invitations='SendToAllAndSaveCopy')
        _logger.info('send_meeting: success subject=%r', subject)

    except (ValueError, ConnectionError):
        raise
    except Exception as e:
        _logger.error('send_meeting failed: %s: %s',
                      type(e).__name__, e, exc_info=True)
        _wrap_exchange_error(e)