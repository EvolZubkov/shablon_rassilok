"""
smtp_sender.py — отправка писем через SMTP с опциональным сохранением в IMAP.

Использует только стандартную библиотеку Python: smtplib, imaplib, email.
"""

import base64
import binascii
import hashlib
import html as _html
import imaplib
import logging
import mimetypes
import re
import smtplib
from email import encoders
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formatdate, make_msgid

_logger = logging.getLogger(__name__)

# Таймаут сетевых операций SMTP/IMAP, секунд. Без него недоступный порт
# подвешивает рассылку на минуты без единого сообщения в интерфейсе.
NETWORK_TIMEOUT = 15


# ── Результат отправки ────────────────────────────────────────────────────────

class SentMessage(bytes):
    """Сырые байты письма плюс то, что известно о его отправке.

    Остаётся ``bytes``, поэтому подходит везде, где раньше возвращались байты
    (сохранение в IMAP). Атрибуты нужны для журнала рассылки.
    """

    message_id: str
    server_reply: str

    def __new__(cls, raw: bytes, message_id: str = '', server_reply: str = ''):
        obj = super().__new__(cls, raw)
        obj.message_id = message_id
        obj.server_reply = server_reply
        return obj


# ── Подключение SMTP ──────────────────────────────────────────────────────────

def connect_smtp(host: str, port: int, username: str, password: str) -> smtplib.SMTP:
    """Открывает SMTP-соединение и авторизуется.

    port=587 → STARTTLS
    port=25  → plaintext (без TLS)

    Raises:
        ConnectionError — сервер недоступен или отказал
        ValueError      — неверные учётные данные
    """
    try:
        if port == 587:
            smtp = smtplib.SMTP(host, port, timeout=NETWORK_TIMEOUT)
            smtp.ehlo()
            smtp.starttls()
            smtp.ehlo()
        else:
            smtp = smtplib.SMTP(host, port, timeout=NETWORK_TIMEOUT)
            smtp.ehlo()

        if username and password:
            smtp.login(username, password)

        _logger.info('smtp connect: %s:%s user=%s', host, port, username)
        return smtp

    except smtplib.SMTPAuthenticationError as e:
        raise ValueError(f'Неверный логин или пароль SMTP: {e}') from e
    except (smtplib.SMTPConnectError, smtplib.SMTPServerDisconnected, OSError) as e:
        raise ConnectionError(f'SMTP сервер недоступен ({host}:{port}): {e}') from e
    except smtplib.SMTPException as e:
        raise ConnectionError(f'SMTP ошибка: {e}') from e


# ── Подключение IMAP ──────────────────────────────────────────────────────────

def connect_imap(host: str, port: int, username: str, password: str) -> imaplib.IMAP4:
    """Открывает IMAP-соединение.

    port=993 → SSL
    port=143 → STARTTLS
    """
    try:
        if port == 993:
            imap = imaplib.IMAP4_SSL(host, port, timeout=NETWORK_TIMEOUT)
        else:
            imap = imaplib.IMAP4(host, port, timeout=NETWORK_TIMEOUT)
            imap.starttls()

        imap.login(username, password)
        _logger.info('imap connect: %s:%s user=%s', host, port, username)
        return imap

    except imaplib.IMAP4.error as e:
        raise ConnectionError(f'IMAP ошибка ({host}:{port}): {e}') from e
    except OSError as e:
        raise ConnectionError(f'IMAP сервер недоступен ({host}:{port}): {e}') from e


# ── HTML → вложения и текстовая версия ────────────────────────────────────────

_DATA_IMG_RE = re.compile(r'''src=(["'])data:(image/[\w.+-]+);base64,([^"']+)\1''', re.I)
_HIDDEN_BLOCK_RE = re.compile(r'<(script|style|head)\b.*?</\1\s*>', re.I | re.S)
_LINK_RE = re.compile(r'''<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>(.*?)</a\s*>''', re.I | re.S)
_BREAK_RE = re.compile(r'<\s*(?:br|/p|/div|/tr|/li|/table|/h[1-6])\b[^>]*>', re.I)
_TAG_RE = re.compile(r'<[^>]+>')


def _extract_inline_images(html_body: str) -> tuple:
    """Заменяет ``src="data:image/...;base64,..."`` на ``src="cid:..."``.

    Outlook не показывает картинки, вшитые в текст письма как data: URI —
    вместо них красный крестик. Тот же приём использует Exchange-канал.
    Одинаковые картинки (буллеты, разделители) попадают в письмо один раз.

    Returns: (html с cid, список MIME-частей inline-картинок)
    """
    parts: list = []
    cid_by_digest: dict = {}

    def replace(match: re.Match) -> str:
        mime_type = match.group(2).lower()
        try:
            raw = base64.b64decode(re.sub(r'\s+', '', match.group(3)), validate=True)
        except (binascii.Error, ValueError):
            return match.group(0)
        if not raw:
            return match.group(0)

        digest = hashlib.sha1(raw).hexdigest()
        cid = cid_by_digest.get(digest)
        if cid is None:
            cid = f'img{len(parts) + 1}.{digest[:12]}@pochtelye'
            cid_by_digest[digest] = cid
            subtype = mime_type.split('/', 1)[1]
            ext = (mimetypes.guess_extension(mime_type) or '.png').replace('.jpe', '.jpg')
            part = MIMEBase('image', subtype)
            part.set_payload(raw)
            encoders.encode_base64(part)
            part.add_header('Content-ID', f'<{cid}>')
            part.add_header('Content-Disposition', 'inline', filename=f'image{len(parts) + 1}{ext}')
            parts.append(part)
        return f'src="cid:{cid}"'

    return _DATA_IMG_RE.sub(replace, html_body), parts


def _html_to_text(html_body: str) -> str:
    """Грубая текстовая версия письма для части ``text/plain``.

    Нужна не для красоты: почтовые фильтры считают письмо без текстовой
    версии подозрительным, а клиенты без HTML показывают хотя бы смысл.
    """
    text = _HIDDEN_BLOCK_RE.sub('', html_body)

    def link(match: re.Match) -> str:
        href = match.group(1).strip()
        label = _html.unescape(_TAG_RE.sub('', match.group(2))).strip()
        if not href.lower().startswith(('http://', 'https://')) or label == href:
            return label or href
        return f'{label} ({href})' if label else href

    text = _LINK_RE.sub(link, text)
    text = _BREAK_RE.sub('\n', text)
    text = _html.unescape(_TAG_RE.sub('', text))

    lines = [re.sub(r'[ \t\xa0]+', ' ', line).strip() for line in text.splitlines()]
    collapsed: list = []
    for line in lines:
        if line or (collapsed and collapsed[-1]):
            collapsed.append(line)
    return '\n'.join(collapsed).strip()


def _message_id_domain(from_email: str) -> str:
    """Домен для Message-ID: домен отправителя, чтобы id совпадал с DKIM-доменом."""
    domain = from_email.rsplit('@', 1)[-1].strip().strip('<>') if '@' in from_email else ''
    return domain or 'localhost'


# ── Формирование MIME-письма ──────────────────────────────────────────────────

def _build_message(from_email: str, to: list, cc: list, bcc: list,
                   subject: str, html_body: str,
                   attachments: list = None,
                   importance: str = 'normal',
                   read_receipt: bool = False) -> MIMEMultipart:
    """Собирает MIME-письмо из компонентов.

    Структура: mixed → alternative → (plain, related → (html, inline-картинки)),
    затем вложения. ``Date`` и ``Message-ID`` задаются здесь, чтобы номер
    письма был известен приложению и попадал в журнал рассылки.

    attachments: список dict {'name': str, 'content': bytes, 'mime_type': str}
    """
    msg = MIMEMultipart('mixed')
    msg['From']       = from_email
    msg['To']         = ', '.join(to)
    if cc:
        msg['Cc']     = ', '.join(cc)
    msg['Subject']    = subject
    msg['Date']       = formatdate(localtime=True)
    msg['Message-ID'] = make_msgid(domain=_message_id_domain(from_email))

    html_with_cid, inline_images = _extract_inline_images(html_body)

    body_part = MIMEMultipart('alternative')
    body_part.attach(MIMEText(_html_to_text(html_body), 'plain', 'utf-8'))
    if inline_images:
        related = MIMEMultipart('related')
        related.attach(MIMEText(html_with_cid, 'html', 'utf-8'))
        for image in inline_images:
            related.attach(image)
        body_part.attach(related)
    else:
        body_part.attach(MIMEText(html_with_cid, 'html', 'utf-8'))
    msg.attach(body_part)

    imp = str(importance).lower()
    if imp == 'high':
        msg['Importance']        = 'high'
        msg['X-Priority']        = '1'
        msg['X-MSMail-Priority'] = 'High'
    elif imp == 'low':
        msg['Importance']        = 'low'
        msg['X-Priority']        = '5'
        msg['X-MSMail-Priority'] = 'Low'

    if read_receipt:
        msg['Disposition-Notification-To'] = from_email

    for att in (attachments or []):
        mime_type = att.get('mime_type') or 'application/octet-stream'
        main_type, sub_type = mime_type.split('/', 1) if '/' in mime_type else ('application', 'octet-stream')
        part = MIMEBase(main_type, sub_type)
        part.set_payload(att['content'])
        encoders.encode_base64(part)
        part.add_header('Content-Disposition', 'attachment', filename=att['name'])
        msg.attach(part)

    return msg


# ── Отправка письма ───────────────────────────────────────────────────────────

def _format_reply(reply) -> str:
    """('250', b'ok: queued as 42') → '250 ok: queued as 42'."""
    try:
        code, text = reply
    except (TypeError, ValueError):
        return ''
    if isinstance(text, bytes):
        text = text.decode('utf-8', errors='replace')
    return f'{code} {text}'.strip()


def _sendmail_with_reply(smtp: smtplib.SMTP, from_email: str,
                         recipients: list, raw: bytes) -> tuple:
    """``smtp.sendmail`` + ответ сервера на DATA.

    ``sendmail`` отбрасывает финальный ответ сервера, а именно в нём стоит
    номер, под которым письмо принято («250 … queued as …»). По этому номеру
    администратор находит письмо в журнале почтового сервера.

    Returns: (refused: dict {адрес: (код, текст)}, server_reply: str)
    """
    captured: list = []
    original_data = smtp.data

    def capturing_data(msg):
        reply = original_data(msg)
        captured.append(reply)
        return reply

    smtp.data = capturing_data
    try:
        refused = smtp.sendmail(from_email, recipients, raw)
    finally:
        smtp.data = original_data

    refused = refused if isinstance(refused, dict) else {}
    return refused, _format_reply(captured[-1]) if captured else ''


def _describe_refused(refused: dict) -> str:
    return '; '.join(f'{addr}: {_format_reply(reply)}' for addr, reply in refused.items())


def smtp_send_email(smtp: smtplib.SMTP, from_email: str, subject: str,
                    html_body: str, to: list, cc: list = None, bcc: list = None,
                    attachments: list = None,
                    importance: str = 'normal',
                    read_receipt: bool = False) -> bytes:
    """Отправляет одно письмо через открытую SMTP-сессию.

    Возвращает ``SentMessage`` — байты письма (для сохранения в IMAP) с
    атрибутами ``message_id`` и ``server_reply`` для журнала.

    Raises:
        ValueError       — адрес получателя отклонён сервером / нет получателей
        ConnectionError  — разрыв соединения
    """
    if not to and not cc and not bcc:
        raise ValueError('Не указаны получатели')

    all_recipients = list(to or []) + list(cc or []) + list(bcc or [])
    msg = _build_message(from_email, to or [], cc or [], bcc or [],
                         subject, html_body, attachments,
                         importance=importance, read_receipt=read_receipt)
    raw = msg.as_bytes()

    try:
        refused, server_reply = _sendmail_with_reply(smtp, from_email, all_recipients, raw)
    except smtplib.SMTPRecipientsRefused as e:
        raise ValueError(f'Адрес отклонён сервером: {_describe_refused(e.recipients)}') from e
    except smtplib.SMTPSenderRefused as e:
        raise ValueError(f'Адрес отправителя отклонён сервером: {_format_reply((e.smtp_code, e.smtp_error))}') from e
    except smtplib.SMTPDataError as e:
        raise ValueError(f'Сервер не принял письмо: {_format_reply((e.smtp_code, e.smtp_error))}') from e
    except (smtplib.SMTPServerDisconnected, smtplib.SMTPException) as e:
        raise ConnectionError(f'Ошибка отправки SMTP: {e}') from e

    # sendmail молча принимает письмо, если отказано лишь части адресатов.
    # Отказ основному получателю — это ошибка строки, а не успех.
    primary_refused = {a: r for a, r in refused.items() if a in (to or [])}
    if primary_refused:
        raise ValueError(f'Адрес отклонён сервером: {_describe_refused(primary_refused)}')
    if refused:
        server_reply = f'{server_reply} (отклонены копии: {_describe_refused(refused)})'.strip()

    message_id = msg['Message-ID'] or ''
    _logger.info('smtp sent: from=%s to=%s message_id=%s reply=%r',
                 from_email, all_recipients, message_id, server_reply)
    return SentMessage(raw, message_id=message_id, server_reply=server_reply)


# ── Сохранение в IMAP Sent ────────────────────────────────────────────────────

def imap_save_sent(imap: imaplib.IMAP4, raw_message: bytes,
                   folder: str = 'Sent') -> bool:
    """Сохраняет письмо в папку Sent через IMAP APPEND.

    Пробует стандартные имена папок: Sent, INBOX.Sent, Отправленные.
    Returns: True, если письмо сохранено.
    """
    import time as _time
    folders_to_try = [folder, 'Sent', 'INBOX.Sent', 'Отправленные', 'Sent Items']
    for f in folders_to_try:
        try:
            result, _ = imap.append(
                f, '\\Seen', _time.localtime(), raw_message,
            )
            if result == 'OK':
                _logger.debug('imap_save_sent: saved to %r', f)
                return True
        except Exception:
            continue
    _logger.warning('imap_save_sent: не удалось сохранить ни в одну из папок %s', folders_to_try)
    return False


# ── Тест подключения ──────────────────────────────────────────────────────────

def test_smtp_connection(host: str, port: int, username: str, password: str,
                         from_email: str) -> None:
    """Проверяет SMTP-подключение. Не отправляет письма.

    Raises ValueError / ConnectionError при ошибке.
    """
    smtp = connect_smtp(host, port, username, password)
    try:
        smtp.verify(from_email)
    except smtplib.SMTPException:
        pass  # VRFY часто отключён — игнорируем
    finally:
        try:
            smtp.quit()
        except Exception:
            pass
