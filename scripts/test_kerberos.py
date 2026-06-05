#!/usr/bin/env python3
"""
Kerberos Exchange connectivity probe.

Connects to Exchange via Kerberos (gssapi + preemptive Negotiate token)
and sends a minimal test email.  Run this to verify that Kerberos auth
works on the target machine BEFORE building / deploying the full app.

Usage:
    python scripts/test_kerberos.py \\
        --server  cas.rt.ru \\
        --from    eranui.tonoyan@rt.ru \\
        --to      eranui.tonoyan@rt.ru \\
        [--realm  RT.RU]               # optional; auto-guessed from server if omitted
        [--skip-send]                  # only check auth, skip the actual send

The script prints step-by-step diagnostics so you can see exactly where
the failure is (klist / gssapi token / SSL handshake / EWS 401 / success).

IMPORTANT — KRB5_CONFIG lifetime:
    MIT Kerberos reads KRB5_CONFIG *once* on the first gssapi context
    initialisation in the process.  Changing os.environ afterwards has no
    effect.  Therefore a single temporary krb5.conf is written at startup
    in main() and kept alive for the entire script run.  All steps share
    that one config file.
"""

import argparse
import base64
import os
import subprocess
import sys
import tempfile
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


# ── Pretty-print helpers ───────────────────────────────────────────────────

def step(n, text):
    print(f'\n[{n}] {text}')

def ok(msg='OK'):
    print(f'    ✓ {msg}')

def fail(msg):
    print(f'    ✗ {msg}')
    sys.exit(1)

def info(msg):
    print(f'    · {msg}')


# ── Steps ──────────────────────────────────────────────────────────────────

def check_klist(server):
    step(1, 'klist — проверяем наличие Kerberos-тикетов')
    try:
        r = subprocess.run(['klist'], capture_output=True, text=True, timeout=5)
        if r.returncode != 0:
            fail(f'klist вернул код {r.returncode}. Выполните kinit.')
        lines = (r.stdout + r.stderr).splitlines()
        for line in lines:
            info(line)

        import re
        pat = re.compile(rf'HTTP/{re.escape(server)}@(\S*)', re.IGNORECASE)
        found = None
        for line in lines:
            m = pat.search(line)
            if m:
                found = m.group(1) or '(empty realm!)'
                break

        if found:
            ok(f'Тикет HTTP/{server}@ найден. Realm в тикете: {found}')
            if found == '(empty realm!)':
                info('ПРЕДУПРЕЖДЕНИЕ: realm пустой — нет [domain_realm] маппинга в krb5.conf.')
                info('Скрипт подставит realm через временный krb5.conf — это должно сработать.')
        else:
            info(f'Тикет HTTP/{server} не найден — попробуем получить при подключении.')
    except FileNotFoundError:
        fail('klist не найден. Установите Kerberos (krb5-user / krb5-workstation).')


def check_gssapi(server):
    """KRB5_CONFIG уже выставлен в main() — просто генерируем токен."""
    step(2, 'gssapi — генерируем Negotiate-токен')
    try:
        import gssapi
    except ImportError:
        fail('gssapi не установлен: pip install gssapi')

    try:
        sn = gssapi.Name(f'HTTP@{server}', gssapi.NameType.hostbased_service)
        ctx = gssapi.SecurityContext(name=sn, usage='initiate')
        token = ctx.step()
        if not token:
            fail('gssapi.step() вернул пустой токен.')
        token_b64 = base64.b64encode(token).decode()
        ok(f'Токен получен ({len(token)} байт): {token_b64[:40]}…')
        return token_b64
    except Exception as e:
        fail(f'gssapi ошибка: {e}')


def check_ssl(server, token_b64):
    step(3, f'HTTPS + Negotiate — проверяем подключение к {server}')
    import urllib.request, ssl
    url = f'https://{server}/EWS/Exchange.asmx'
    ctx_ssl = ssl.create_default_context()
    ctx_ssl.check_hostname = False
    ctx_ssl.verify_mode = ssl.CERT_NONE

    req = urllib.request.Request(url, method='POST')
    req.add_header('Authorization', f'Negotiate {token_b64}')
    req.add_header('Content-Type', 'text/xml; charset=utf-8')
    req.add_header('User-Agent', 'kerberos-probe/1.0')
    req.data = b'<ping/>'   # invalid XML — we only care about the HTTP status code

    try:
        with urllib.request.urlopen(req, context=ctx_ssl, timeout=15) as resp:
            info(f'HTTP {resp.status}')
            ok('Сервер ответил 200 — аутентификация прошла!')
    except urllib.error.HTTPError as e:
        info(f'HTTP {e.code}')
        if e.code == 401:
            www_auth = e.headers.get('WWW-Authenticate', '')
            info(f'WWW-Authenticate: {www_auth or "(пусто)"}')
            fail('Сервер вернул 401. Токен отвергнут. Проверьте realm и наличие TGT.')
        elif e.code in (400, 500, 503):
            ok(f'HTTP {e.code} — XML был невалидным, но аутентификация прошла.')
        else:
            fail(f'Неожиданный HTTP {e.code}: {e}')
    except Exception as e:
        fail(f'Ошибка подключения: {e}')


def send_test_email(server, from_email, to_email):
    """KRB5_CONFIG уже выставлен в main() — gssapi читает его автоматически."""
    step(4, 'exchangelib — отправляем тестовое письмо')
    try:
        from exchangelib import (
            Account, Configuration, DELEGATE, Message,
            HTMLBody, Mailbox,
        )
        from exchangelib.transport import NOAUTH
        from exchangelib.protocol import BaseProtocol
        from requests_kerberos import HTTPKerberosAuth, OPTIONAL
        import gssapi, base64 as _b64, urllib.parse as _up
    except ImportError as e:
        fail(f'Не хватает пакета: {e}')

    # Auth hook: KRB5_CONFIG already set globally — just generate the token.
    class _PreemptiveKerberosAuth(HTTPKerberosAuth):
        def __call__(self, r):
            r = super().__call__(r)   # registers 401 retry hook
            if 'Authorization' not in r.headers:
                host = _up.urlparse(r.url).hostname
                try:
                    sn = gssapi.Name(f'HTTP@{host}', gssapi.NameType.hostbased_service)
                    ctx = gssapi.SecurityContext(name=sn, usage='initiate')
                    token = ctx.step()
                    if token:
                        r.headers['Authorization'] = (
                            'Negotiate ' + _b64.b64encode(token).decode()
                        )
                        info('Negotiate токен вставлен в запрос')
                except Exception as ge:
                    info(f'gssapi в auth-hook: {ge}')
            return r

    orig = BaseProtocol.create_session
    def _patched(self):
        s = orig(self)
        s.auth = _PreemptiveKerberosAuth(mutual_authentication=OPTIONAL)
        s.verify = False
        return s
    BaseProtocol.create_session = _patched

    try:
        config = Configuration(
            server=server,
            auth_type=NOAUTH,
            # No version pin — let exchangelib auto-detect via EWS autodiscover.
            # Uncomment the line below if auto-detect fails:
            # version=Version(build=Build(15, 1)),  # Exchange 2016
        )
        account = Account(
            primary_smtp_address=from_email,
            config=config,
            autodiscover=False,
            access_type=DELEGATE,
        )
        info(f'Account объект создан: {account.primary_smtp_address}')

        msg = Message(
            account=account,
            subject='[Kerberos probe] Тестовое письмо',
            body=HTMLBody('<p>Это автоматическая проверка Kerberos-подключения.</p>'),
            to_recipients=[Mailbox(email_address=to_email)],
        )
        msg.send()
        ok(f'Письмо отправлено → {to_email}')
    except Exception as e:
        fail(f'Ошибка отправки: {type(e).__name__}: {e}')
    finally:
        BaseProtocol.create_session = orig


# ── Main ───────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument('--server',    required=True, help='Exchange CAS hostname, e.g. cas.rt.ru')
    parser.add_argument('--from',      dest='from_email', required=True, help='Sender email')
    parser.add_argument('--to',        dest='to_email',   required=True, help='Recipient email')
    parser.add_argument('--realm',     default='', help='Kerberos realm, e.g. RT.RU (auto-guessed if omitted)')
    parser.add_argument('--skip-send', action='store_true', help='Only check auth, do not send email')
    args = parser.parse_args()

    server = args.server.strip().lower()
    realm  = args.realm.strip().upper()
    if not realm:
        parts = server.rsplit('.', 2)
        realm = '.'.join(parts[-2:]).upper() if len(parts) >= 2 else server.upper()
        print(f'Realm не указан — используем: {realm}')

    print('=' * 60)
    print(f'  Exchange Kerberos probe')
    print(f'  server : {server}')
    print(f'  from   : {args.from_email}')
    print(f'  to     : {args.to_email}')
    print(f'  realm  : {realm}')
    print('=' * 60)

    # ── Single process-wide krb5.conf ──────────────────────────────────────
    # MIT Kerberos reads KRB5_CONFIG only once per process.  Write it here
    # before any gssapi call so all subsequent steps share the same config.
    domain = realm.lower()
    cfg = (
        'includedir /etc/krb5.conf.d/\n'
        '[libdefaults]\n'
        f'default_realm = {realm}\n'
        'dns_lookup_kdc = true\n'
        '[domain_realm]\n'
        f'.{domain} = {realm}\n'
        f'{domain} = {realm}\n'
        f'{server} = {realm}\n'
    )
    tmp = tempfile.NamedTemporaryFile(
        mode='w', suffix='.conf', prefix='kerbtest_', delete=False,
    )
    tmp.write(cfg)
    tmp.close()
    old_cfg = os.environ.get('KRB5_CONFIG')
    os.environ['KRB5_CONFIG'] = tmp.name
    print(f'· Глобальный KRB5_CONFIG: {tmp.name}')
    # ───────────────────────────────────────────────────────────────────────

    try:
        check_klist(server)
        token_b64 = check_gssapi(server)
        check_ssl(server, token_b64)

        if not args.skip_send:
            send_test_email(server, args.from_email, args.to_email)

        print('\n' + '=' * 60)
        print('  Все проверки пройдены.')
        print('=' * 60)

    finally:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass
        if old_cfg is not None:
            os.environ['KRB5_CONFIG'] = old_cfg
        else:
            os.environ.pop('KRB5_CONFIG', None)


if __name__ == '__main__':
    main()
