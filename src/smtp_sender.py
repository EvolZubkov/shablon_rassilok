"""
smtp_sender.py — отправка писем через SMTP с опциональным сохранением в IMAP.

Использует только стандартную библиотеку Python: smtplib, imaplib, email.
"""

import imaplib
import logging
import mimetypes
import smtplib
import time
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email import encoders

_logger = logging.getLogger(__name__)


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
            smtp = smtplib.SMTP(host, port, timeout=15)
            smtp.ehlo()
            smtp.starttls()
            smtp.ehlo()
        else:
            smtp = smtplib.SMTP(host, port, timeout=15)
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
            imap = imaplib.IMAP4_SSL(host, port)
        else:
            imap = imaplib.IMAP4(host, port)
            imap.starttls()

        imap.login(username, password)
        _logger.info('imap connect: %s:%s user=%s', host, port, username)
        return imap

    except imaplib.IMAP4.error as e:
        raise ConnectionError(f'IMAP ошибка ({host}:{port}): {e}') from e
    except OSError as e:
        raise ConnectionError(f'IMAP сервер недоступен ({host}:{port}): {e}') from e


# ── Формирование MIME-письма ──────────────────────────────────────────────────

def _build_message(from_email: str, to: list, cc: list, bcc: list,
                   subject: str, html_body: str,
                   attachments: list = None,
                   importance: str = 'normal',
                   read_receipt: bool = False) -> MIMEMultipart:
    """Собирает MIME-письмо из компонентов.

    attachments: список dict {'name': str, 'content': bytes, 'mime_type': str}
    """
    msg = MIMEMultipart('mixed')
    msg['From']    = from_email
    msg['To']      = ', '.join(to)
    if cc:
        msg['Cc']  = ', '.join(cc)
    msg['Subject'] = subject

    body_part = MIMEMultipart('alternative')
    body_part.attach(MIMEText(html_body, 'html', 'utf-8'))
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

def smtp_send_email(smtp: smtplib.SMTP, from_email: str, subject: str,
                    html_body: str, to: list, cc: list = None, bcc: list = None,
                    attachments: list = None,
                    importance: str = 'normal',
                    read_receipt: bool = False) -> bytes:
    """Отправляет одно письмо через открытую SMTP-сессию.

    Возвращает сырые байты письма (для сохранения в IMAP).

    Raises:
        ValueError       — ошибка валидации адресов
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
        smtp.sendmail(from_email, all_recipients, raw)
        _logger.info('smtp sent: from=%s to=%s subject=%r', from_email, all_recipients, subject)
        return raw
    except smtplib.SMTPRecipientsRefused as e:
        raise ValueError(f'Адрес отклонён сервером: {e}') from e
    except (smtplib.SMTPServerDisconnected, smtplib.SMTPException) as e:
        raise ConnectionError(f'Ошибка отправки SMTP: {e}') from e


# ── Сохранение в IMAP Sent ────────────────────────────────────────────────────

def imap_save_sent(imap: imaplib.IMAP4, raw_message: bytes,
                   folder: str = 'Sent') -> None:
    """Сохраняет письмо в папку Sent через IMAP APPEND.

    Пробует стандартные имена папок: Sent, INBOX.Sent, Отправленные.
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
                return
        except Exception:
            continue
    _logger.warning('imap_save_sent: не удалось сохранить ни в одну из папок %s', folders_to_try)


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
