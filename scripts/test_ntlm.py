#!/usr/bin/env python3
"""
NTLM Exchange connectivity probe.

Usage:
    python3 test_ntlm.py \
        --server   cas.rt.ru \
        --user     "GD.RT.RU\\eranui.tonoyan" \
        --password "secret" \
        --from     eranui.tonoyan@rt.ru \
        --to       eranui.tonoyan@rt.ru \
        [--skip-send]

Dependencies:
    pip install requests requests-ntlm exchangelib
"""

import argparse
import getpass
import sys
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


def step(n, text): print(f'\n[{n}] {text}')
def ok(msg='OK'):  print(f'    ✓ {msg}')
def fail(msg):     print(f'    ✗ {msg}'); sys.exit(1)
def info(msg):     print(f'    · {msg}')


def check_ntlm(server, username, password):
    step(1, f'NTLM auth — прямой запрос к EWS на {server}')
    try:
        from requests_ntlm import HttpNtlmAuth
        import requests
    except ImportError:
        fail('pip install requests requests-ntlm')

    url = f'https://{server}/EWS/Exchange.asmx'
    info(f'URL  : {url}')
    info(f'User : {username}')

    try:
        resp = requests.post(
            url,
            auth=HttpNtlmAuth(username, password),
            headers={'Content-Type': 'text/xml; charset=utf-8'},
            data=b'<ping/>',
            verify=False,
            timeout=15,
        )
        info(f'HTTP : {resp.status_code}')
        info(f'WWW-Authenticate: {resp.headers.get("WWW-Authenticate", "(нет)")}')

        if resp.status_code == 401:
            fail('NTLM отвергнут (401). Проверьте логин / пароль / домен.')
        elif resp.status_code in (200, 400, 500, 503):
            ok(f'HTTP {resp.status_code} — NTLM аутентификация прошла!')
        else:
            info(f'Тело (первые 300 байт): {resp.text[:300]}')
            fail(f'Неожиданный статус: {resp.status_code}')
    except Exception as e:
        fail(f'Ошибка подключения: {e}')


def send_email(server, username, password, from_email, to_email):
    step(2, 'exchangelib + NTLM — отправляем тестовое письмо')
    try:
        from exchangelib import (
            Account, Configuration, DELEGATE,
            Message, HTMLBody, Mailbox, Credentials, NTLM,
        )
    except ImportError:
        fail('pip install exchangelib')

    try:
        config = Configuration(
            server=server,
            credentials=Credentials(username=username, password=password),
            auth_type=NTLM,
        )
        account = Account(
            primary_smtp_address=from_email,
            config=config,
            autodiscover=False,
            access_type=DELEGATE,
        )
        info(f'Account: {account.primary_smtp_address}')

        Message(
            account=account,
            subject='[NTLM probe] Тестовое письмо',
            body=HTMLBody('<p>Автоматическая проверка NTLM-подключения.</p>'),
            to_recipients=[Mailbox(email_address=to_email)],
        ).send()
        ok(f'Письмо отправлено → {to_email}')
    except Exception as e:
        fail(f'{type(e).__name__}: {e}')


def main():
    p = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument('--server',    default='cas.rt.ru')
    p.add_argument('--user',      default='GD.RT.RU\\eranui.tonoyan')
    p.add_argument('--password',  default='')
    p.add_argument('--from',      dest='from_email', default='eranui.tonoyan@rt.ru')
    p.add_argument('--to',        dest='to_email',   default='eranui.tonoyan@rt.ru')
    p.add_argument('--skip-send', action='store_true')
    args = p.parse_args()

    password = args.password or getpass.getpass(f'Пароль для {args.user}: ')

    print('=' * 60)
    print('  Exchange NTLM probe')
    print(f'  server : {args.server}')
    print(f'  user   : {args.user}')
    print(f'  from   : {args.from_email}')
    print('=' * 60)

    check_ntlm(args.server, args.user, password)

    if not args.skip_send:
        send_email(args.server, args.user, password, args.from_email, args.to_email)

    print('\n' + '=' * 60)
    print('  Все проверки пройдены.')
    print('=' * 60)


if __name__ == '__main__':
    main()
