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
        ExtendedProperty,
    )
    from exchangelib.errors import UnauthorizedError, TransportError
    EXCHANGELIB_AVAILABLE = True
except ImportError:
    EXCHANGELIB_AVAILABLE = False

_logger = logging.getLogger(__name__)

# DeferredDeliveryTime отсутствует в Message.FIELDS по умолчанию —
# регистрируем как MAPI extended property.
# PR_DEFERRED_DELIVERY_TIME = tag 0x000F, type PT_SYSTIME (0x0040)
if EXCHANGELIB_AVAILABLE:
    class _DeferredDeliveryTimeProp(ExtendedProperty):
        property_tag  = 0x000F
        property_type = 'SystemTime'

    try:
        Message.register('deferred_delivery_time', _DeferredDeliveryTimeProp)
    except Exception:
        pass  # уже зарегистрировано при повторной загрузке модуля


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
    """No-op: recipient resolution is delegated to Exchange."""
    pass


def _resolve_to_mailbox(account: 'Account', name: str) -> 'Mailbox':
    """Resolves a name or address to a proper Mailbox object.

    - SMTP address  → Mailbox(email_address=...)
    - Private DL    → Mailbox(item_id=..., routing_type='MAPIPDL') so Exchange expands it
    - Public DL     → Mailbox(email_address=smtp_addr)
    Raises ValueError if resolution fails.
    """
    if '@' in name:
        return Mailbox(email_address=name)
    try:
        from exchangelib.services import ResolveNames
        service = ResolveNames(protocol=account.protocol)
        resolutions = list(service.call(
            unresolved_entries=[name],
            return_full_contact_data=False,
            search_scope='ContactsActiveDirectory',
        ))
        if resolutions:
            item = resolutions[0]
            mb = item[0] if isinstance(item, tuple) else item
            addr          = getattr(mb, 'email_address', None)
            routing_type  = getattr(mb, 'routing_type',  None)
            mailbox_type  = getattr(mb, 'mailbox_type',  None)
            item_id       = getattr(mb, 'item_id',       None)
            mb_name       = getattr(mb, 'name', name)

            # Regular SMTP address (Mailbox, Contact, PublicDL with smtp)
            if addr and '@' in addr:
                _logger.info('resolve_to_mailbox %r -> SMTP %r', name, addr)
                return Mailbox(email_address=addr)

            # PrivateDL — MAPI personal contact group: no smtp, use ItemId
            if item_id and (mailbox_type == 'PrivateDL' or routing_type == 'MAPIPDL'):
                _logger.info('resolve_to_mailbox %r -> PrivateDL item_id=%r', name, item_id.id)
                return Mailbox(
                    name=mb_name,
                    routing_type='MAPIPDL',
                    mailbox_type='PrivateDL',
                    item_id=item_id,
                )
    except Exception as exc:
        _logger.warning('resolve_to_mailbox failed for %r: %s', name, exc)

    raise ValueError(
        f'Не удалось найти получателя «{name}» в адресной книге Exchange. '
        f'Укажите email-адрес или точное имя группы контактов.'
    )


def _to_mailboxes(emails: list, account: 'Account' = None) -> list:
    """Конвертирует список строк в список Mailbox.
    Строки без @ разрешаются через EWS ResolveNames (включая личные группы).
    """
    if account:
        return [_resolve_to_mailbox(account, e) for e in emails]
    return [Mailbox(email_address=e) for e in emails]


def _to_attendees(emails: list, account: 'Account' = None) -> list:
    """Конвертирует список строк в список Attendee (для встреч)."""
    if account:
        return [Attendee(mailbox=_resolve_to_mailbox(account, e)) for e in emails]
    return [Attendee(mailbox=Mailbox(email_address=e)) for e in emails]


# ─── Подключение ─────────────────────────────────────────────────────────────

def connect_exchange(server: str, username: str, password: str,
                     from_email: str, auth_type: str = 'ntlm',
                     krb_realm: str = '') -> 'Account':
    """Build an Exchange ``Account`` object (no network I/O at this stage).

    ``Account(autodiscover=False)`` does **not** open a connection — the real
    network handshake happens on the first EWS call (``msg.send()``, etc.).

    Args:
        auth_type: 'ntlm' (default) or 'kerberos' (uses system GSSAPI ticket,
                   no password required — needs requests-kerberos installed).

    Raises:
        ValueError       — неверный логин/пароль (при первом сетевом вызове)
        ConnectionError  — сервер недоступен
        RuntimeError     — любая другая ошибка Exchange
    """
    if not EXCHANGELIB_AVAILABLE:
        raise RuntimeError(
            'exchangelib не установлен: pip install exchangelib')

    # Guard against empty from_email coming from the frontend "default" option.
    effective_from = (from_email or '').strip() or (username or '').strip()

    _logger.info('exchange connect: server=%s username=%s from=%s auth_type=%s',
                 server, username, effective_from, auth_type)
    try:
        if auth_type == 'kerberos':
            try:
                import gssapi  # noqa: F401
                from requests_kerberos import HTTPKerberosAuth, OPTIONAL
                import urllib3 as _urllib3
                _urllib3.disable_warnings(_urllib3.exceptions.InsecureRequestWarning)
            except ImportError as _kerb_err:
                raise RuntimeError(
                    'Для Kerberos-аутентификации требуется gssapi: '
                    f'{_kerb_err}')
            # This server returns 401 without WWW-Authenticate: Negotiate,
            # so requests_kerberos never retries with a token unless we send
            # it proactively on the first request (opportunistic/preemptive).
            # opportunistic_auth=True was added in requests_kerberos 0.12.0;
            # for compatibility we subclass and inject the token via gssapi.
            import base64 as _b64, urllib.parse as _up
            import os as _os, tempfile as _tf

            # Resolve realm: from credentials or guess from server hostname
            _realm = (krb_realm or '').strip().upper()
            if not _realm:
                _parts = server.rsplit('.', 2)
                _realm = '.'.join(_parts[-2:]).upper() if len(_parts) >= 2 else server.upper()

            def _tmp_krb5(realm, hostname):
                """Write a temp krb5.conf with [domain_realm] for this realm
                and set KRB5_CONFIG so gssapi picks it up.
                Returns (tmp_path, old_env_value)."""
                domain = realm.lower()
                # Also map the exact hostname
                cfg = (
                    'includedir /etc/krb5.conf.d/\n'
                    '[libdefaults]\n'
                    f'default_realm = {realm}\n'
                    'dns_lookup_kdc = true\n'
                    '[domain_realm]\n'
                    f'.{domain} = {realm}\n'
                    f'{domain} = {realm}\n'
                    f'{hostname} = {realm}\n'
                )
                tmp = _tf.NamedTemporaryFile(
                    mode='w', suffix='.conf',
                    prefix='pochtelye_krb5_', delete=False,
                )
                tmp.write(cfg)
                tmp.close()
                old = _os.environ.get('KRB5_CONFIG')
                _os.environ['KRB5_CONFIG'] = tmp.name
                return tmp.name, old

            def _restore_krb5(tmp_path, old_value):
                try:
                    if tmp_path:
                        _os.unlink(tmp_path)
                except OSError:
                    pass
                if old_value is not None:
                    _os.environ['KRB5_CONFIG'] = old_value
                else:
                    _os.environ.pop('KRB5_CONFIG', None)

            class _PreemptiveKerberosAuth(HTTPKerberosAuth):
                """Send Kerberos Negotiate token on the first request without
                waiting for a 401 challenge — works on all requests_kerberos.
                Uses a temp krb5.conf with explicit [domain_realm] so gssapi
                produces a properly-realmified ticket (e.g. HTTP/cas.rt.ru@RT.RU)."""
                def __call__(self, r):
                    r = super().__call__(r)   # registers 401 retry hook
                    if 'Authorization' not in r.headers:
                        host = _up.urlparse(r.url).hostname
                        tmp_path, old_cfg = _tmp_krb5(_realm, host)
                        try:
                            sn = gssapi.Name(
                                f'HTTP@{host}',
                                gssapi.NameType.hostbased_service,
                            )
                            ctx = gssapi.SecurityContext(name=sn, usage='initiate')
                            token = ctx.step()
                            if token:
                                r.headers['Authorization'] = (
                                    'Negotiate ' + _b64.b64encode(token).decode()
                                )
                        except Exception as _ge:
                            _logger.warning('gssapi preemptive token: %s', _ge)
                        finally:
                            _restore_krb5(tmp_path, old_cfg)
                    return r

            from exchangelib.transport import NOAUTH
            from exchangelib.protocol import BaseProtocol
            _orig_create_session = BaseProtocol.create_session
            def _kerberos_create_session(self):
                s = _orig_create_session(self)
                s.auth = _PreemptiveKerberosAuth(mutual_authentication=OPTIONAL)
                s.verify = False  # GOST cert — skip SSL verification
                return s
            BaseProtocol.create_session = _kerberos_create_session
            from exchangelib import Version, Build
            config = Configuration(server=server, auth_type=NOAUTH,
                                   version=Version(build=Build(15, 1)))
        else:
            credentials = Credentials(username=username, password=password)
            # Specify NTLM explicitly to bypass exchangelib's auth-type
            # auto-detection, which fails on some corporate Exchange setups
            # ("Failed to get auth type from service").
            from exchangelib import NTLM, Version, Build
            config = Configuration(
                server=server,
                credentials=credentials,
                auth_type=NTLM,
                version=Version(build=Build(15, 1)),  # Exchange 2016 — avoids ConvertId round-trip
            )

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


class ExchangeAuthError(Exception):
    """Raised for authentication / authorisation failures (→ HTTP 401)."""


def _wrap_exchange_error(exc: Exception) -> None:
    """Translate exchangelib / network exceptions into standard Python types.

    Logs the original exception class and message so the protocol.log always
    contains the raw error regardless of how the caller surfaces it to the UI.
    """
    name = type(exc).__name__
    msg  = str(exc)
    _logger.error('Exchange error [%s]: %s', name, msg)

    # Kerberos / GSSAPI ticket errors
    if any(k in name for k in ('GSSError', 'KerberosError', 'MutualAuthenticationError')):
        raise ConnectionError(
            f'Ошибка Kerberos — нет действующего тикета (выполните kinit): {msg}')
    if 'gss' in msg.lower() or 'kerberos' in msg.lower() or 'negotiate' in msg.lower():
        raise ConnectionError(f'Ошибка Kerberos-аутентификации: {msg}')

    # Authentication / authorisation
    if any(k in name for k in ('Unauthorized', 'AuthenticationFailed',
                                'ErrorAccessDenied')):
        raise ExchangeAuthError('Неверный логин или пароль / нет доступа к ящику')

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


def _to_ews_datetime(dt: datetime.datetime, utc_offset: float = 3.0) -> 'EWSDateTime':
    """Конвертирует naive datetime пользователя в EWSDateTime (UTC).

    Args:
        dt:         naive datetime — время как ввёл пользователь
        utc_offset: числовой UTC-сдвиг часов, например 3 для UTC+3, 4 для UTC+4.
                    Берётся напрямую из браузера (-(getTimezoneOffset()/60)),
                    поэтому не зависит от версии pytz и актуальности IANA-базы.
    """
    # Вычитаем сдвиг — получаем UTC, затем оборачиваем в EWSDateTime UTC
    try:
        utc_offset_h = float(utc_offset)
    except (TypeError, ValueError):
        _logger.warning('_to_ews_datetime: invalid utc_offset %r, falling back to UTC+3', utc_offset)
        utc_offset_h = 3.0

    aware = dt.replace(tzinfo=datetime.timezone(datetime.timedelta(hours=utc_offset_h)))
    utc   = aware.astimezone(datetime.timezone.utc)

    from exchangelib import UTC as _EWS_UTC
    return EWSDateTime(utc.year, utc.month, utc.day,
                       utc.hour, utc.minute, utc.second,
                       tzinfo=_EWS_UTC)


def exchange_send_email(account: 'Account', subject: str, html_body: str,
                        to: list, cc: list = None, bcc: list = None,
                        attachments: list = None,
                        send_at: datetime.datetime = None,
                        timezone: float = 3.0) -> None:
    """
    Отправляет HTML-письмо через Exchange.

    Args:
        account   — объект Account из connect_exchange()
        subject   — тема письма
        html_body — HTML содержимое (наш сгенерированный шаблон)
        to        — список адресов получателей
        cc        — копия (необязательно)
        bcc       — скрытая копия (необязательно)
        send_at   — если задан, письмо откладывается до указанного времени
                    (Exchange держит его в Outbox и отправляет сам)
    """
    if not to and not cc and not bcc:
        raise ValueError('Не указаны получатели')
    if to:  validate_recipients(to)
    if cc:  validate_recipients(cc)
    if bcc: validate_recipients(bcc)
    attachments_raw = attachments or []
    _logger.info('send_email: subject=%r to=%s cc=%s bcc=%s attachments=%d send_at=%s',
                 subject, to, cc, bcc, len(attachments_raw), send_at)
    try:
        html_with_cid, attachments = _convert_data_images_to_cid(html_body)
        _logger.debug('send_email: %d inline CID images converted', len(attachments))
        msg = Message(
            account=account,
            subject=subject,
            body=HTMLBody(html_with_cid),
            to_recipients=_to_mailboxes(to, account) if to else None,
            cc_recipients=_to_mailboxes(cc, account) if cc else None,
            bcc_recipients=_to_mailboxes(bcc, account) if bcc else None,
        )
        if send_at is not None:
            msg.deferred_delivery_time = _DeferredDeliveryTimeProp(
                value=_to_ews_datetime(send_at, timezone)
            )
            _logger.info('send_email: deferred until %s (%s)', send_at, timezone)
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
                _logger.warning('attachment skipped %s: %s', file_data.get('name'), e)
        _logger.debug('send_email: calling msg.send()')
        msg.send()
        _logger.info('send_email: success subject=%r', subject)
    except (ValueError, ConnectionError):
        raise
    except Exception as e:
        _logger.error('send_email failed at msg.send(): %s: %s',
                      type(e).__name__, e, exc_info=True)
        _wrap_exchange_error(e)


# ─── Сохранение черновика ────────────────────────────────────────────────────

def exchange_save_draft(account: 'Account', subject: str, html_body: str,
                        to: list, cc: list = None, bcc: list = None,
                        attachments: list = None) -> None:
    """
    Сохраняет письмо в папку Черновики (Drafts) через EWS без отправки.
    Использует Message.save() с folder=account.drafts (MessageDisposition=SaveOnly).
    """
    if to:  validate_recipients(to)
    if cc:  validate_recipients(cc)
    if bcc: validate_recipients(bcc)
    attachments_raw = attachments or []
    _logger.info('save_draft: subject=%r to=%s cc=%s bcc=%s attachments=%d',
                 subject, to, cc, bcc, len(attachments_raw))
    try:
        html_with_cid, inline_atts = _convert_data_images_to_cid(html_body)
        msg = Message(
            account=account,
            folder=account.drafts,
            subject=subject,
            body=HTMLBody(html_with_cid),
            to_recipients=_to_mailboxes(to, account) if to else None,
            cc_recipients=_to_mailboxes(cc, account) if cc else None,
            bcc_recipients=_to_mailboxes(bcc, account) if bcc else None,
        )
        for att in inline_atts:
            msg.attach(att)
        for file_data in attachments_raw:
            try:
                raw = base64.b64decode(file_data['content'])
                msg.attach(FileAttachment(
                    name=file_data['name'],
                    content_type=file_data.get('mime_type', 'application/octet-stream'),
                    content=raw,
                ))
            except Exception as e:
                _logger.warning('draft attachment skipped %s: %s', file_data.get('name'), e)
        msg.save()
        _logger.info('save_draft: success subject=%r', subject)
    except (ValueError, ConnectionError):
        raise
    except Exception as e:
        _logger.error('save_draft failed: %s: %s', type(e).__name__, e, exc_info=True)
        _wrap_exchange_error(e)


# ─── Отправка встречи ────────────────────────────────────────────────────────

def exchange_send_meeting(account: 'Account', subject: str, html_body: str,
                          to: list, cc: list = None, bcc: list = None,
                          location: str = '', start_dt: datetime.datetime = None,
                          end_dt: datetime.datetime = None,
                          attachments: list = None,
                          timezone: float = 3.0) -> None:
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
    if bcc:
        validate_recipients(bcc)

    user_attachments = attachments or []
    _logger.info('send_meeting: subject=%r to=%s bcc=%s start=%s end=%s attachments=%d',
                 subject, to, bcc, start_dt, end_dt, len(user_attachments))
    try:
        start_ews = _to_ews_datetime(start_dt, timezone)
        end_ews   = _to_ews_datetime(end_dt,   timezone)

        # 1. Convert data:image -> cid: attachments so Outlook renders inline images.
        html_with_cid, inline_atts = _convert_data_images_to_cid(html_body)

        # 2. Build user-supplied FileAttachment objects before the EWS call.
        user_file_atts = []
        for file_data in user_attachments:
            try:
                raw = base64.b64decode(file_data['content'])
                user_file_atts.append(FileAttachment(
                    name=file_data['name'],
                    content_type=file_data.get('mime_type', 'application/octet-stream'),
                    content=raw,
                ))
            except Exception as e:
                _logger.warning('attachment skipped %s: %s', file_data.get('name'), e)

        # 3. Create and save the meeting in a single CreateItem call so that
        #    invitations are dispatched at creation time.  Using two save() calls
        #    (SendToNone then SendToAllAndSaveCopy) relies on UpdateItem, which
        #    some Exchange servers silently ignore for invitation dispatch.
        required = to if to else bcc
        item = CalendarItem(
            account=account,
            folder=account.calendar,
            subject=subject,
            body=HTMLBody(html_with_cid),
            location=location or '',
            start=start_ews,
            end=end_ews,
            required_attendees=_to_attendees(required, account),
            optional_attendees=_to_attendees(cc, account) if cc else None,
            attachments=inline_atts + user_file_atts,
        )
        _logger.debug('send_meeting: dispatching invitations via CreateItem')
        item.save(send_meeting_invitations='SendToAllAndSaveCopy')
        _logger.info('send_meeting: success subject=%r', subject)

    except (ValueError, ConnectionError):
        raise
    except Exception as e:
        _logger.error('send_meeting failed: %s: %s',
                      type(e).__name__, e, exc_info=True)
        _wrap_exchange_error(e)