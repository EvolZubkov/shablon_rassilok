"""
exchange_sender.py — отправка писем и встреч через MS Exchange (EWS).

Использует exchangelib. Не требует установленного Outlook.
"""

import datetime
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
    """
    Создаёт подключение к Exchange.
    Raises:
        ValueError  — неверный логин/пароль
        ConnectionError — сервер недоступен
        RuntimeError — любая другая ошибка Exchange
    """
    if not EXCHANGELIB_AVAILABLE:
        raise RuntimeError(
            'exchangelib не установлен: pip install exchangelib')
    try:
        credentials = Credentials(username=username, password=password)
        config = Configuration(server=server, credentials=credentials)
        account = Account(
            primary_smtp_address=from_email,
            config=config,
            autodiscover=False,
            access_type=DELEGATE,
        )
        return account
    except Exception as e:
        _wrap_exchange_error(e)


def _wrap_exchange_error(exc: Exception) -> None:
    """Преобразует ошибки exchangelib в стандартные Python исключения."""
    name = type(exc).__name__
    if 'Unauthorized' in name or 'AuthenticationFailed' in name:
        raise ValueError('Неверный логин или пароль')
    if 'Transport' in name or 'Connection' in name:
        raise ConnectionError('Сервер Exchange недоступен')
    raise RuntimeError(f'Ошибка Exchange: {exc}')


# ─── Отправка письма ─────────────────────────────────────────────────────────

def _convert_data_images_to_cid(html_body: str):
    """
    Заменяет все data:image/... на CID-вложения.
    Outlook не показывает data: URI — нужны CID.
    Возвращает (html_with_cid, список FileAttachment).
    """
    import re
    import base64
    import uuid

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
        import mimetypes as _mt
        ext = (_mt.guess_extension(mime_type)
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
    try:
        html_with_cid, attachments = _convert_data_images_to_cid(html_body)
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
        msg.send()
    except Exception as e:
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

    user_attachments = attachments or []  # ← сохраняем до перезаписи

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

        # 3. Сохраняем без рассылки, чтобы появился item.id
        item.save(send_meeting_invitations='SendToNone')

        # 4. Добавляем inline-вложения (картинки из письма)
        for att in inline_atts:
            item.attach(att)

        # 5. Добавляем пользовательские файлы
        for file_data in user_attachments:  # ← исправлено
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

        # 6. Ещё раз явно проставляем body
        item.body = HTMLBody(html_with_cid)

        # 7. Отправляем приглашения вместе с телом и вложениями
        item._update(
            update_fieldnames=['body'],
            message_disposition='SaveOnly',
            conflict_resolution='AutoResolve',
            send_meeting_invitations='SendToAllAndSaveCopy',
        )

    except (ValueError, ConnectionError):
        raise
    except Exception as e:
        _wrap_exchange_error(e)