"""Локальная лаборатория SMTP: поддельный сервер + настоящий цикл рассылки.

Поднимает на 127.0.0.1 маленький SMTP-сервер с настраиваемым «характером»
(лимит писем за сессию, отказ адресатам домена, обрыв связи) и прогоняет через
него настоящий ``_run_bulk_send`` по нескольким строкам. Показывает, кому
письмо дошло, а что получило статус ошибки.

Запуск (из корня репозитория):
    python scripts/smtp_lab.py
"""
import asyncio
import queue
import sys
import threading
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import app  # noqa: E402,F401  (сначала app: иначе циклический импорт routes.bulk_mail)
from routes import bulk_mail  # noqa: E402


class LabServer:
    """SMTP-сервер без TLS и авторизации; письма складывает в ``delivered``."""

    def __init__(self, drop_after=None, reject_domain=None, rate_limit_code=None):
        self.drop_after = drop_after          # закрыть сессию после N принятых писем
        self.reject_domain = reject_domain    # отвечать 550 на адреса этого домена
        self.rate_limit_code = rate_limit_code  # после первого письма отвечать 4xx на MAIL
        self.delivered = []
        self.sessions = 0
        self.port = None
        self._loop = None

    async def _handle(self, reader, writer):
        self.sessions += 1
        accepted = 0
        rcpts = []

        def send(line):
            writer.write((line + '\r\n').encode())

        send('220 lab ESMTP')
        await writer.drain()
        while True:
            raw = await reader.readline()
            if not raw:
                break
            cmd = raw.decode(errors='replace').strip()
            up = cmd.upper()
            if up.startswith('EHLO'):
                send('250 lab')
            elif up.startswith('HELO'):
                send('250 lab')
            elif up.startswith('MAIL FROM'):
                if self.rate_limit_code and accepted >= 1:
                    send(f'{self.rate_limit_code} too many messages, try later')
                else:
                    rcpts = []
                    send('250 ok')
            elif up.startswith('RCPT TO'):
                addr = cmd[cmd.index(':') + 1:].strip().strip('<>')
                if self.reject_domain and addr.lower().endswith('@' + self.reject_domain):
                    send('550 relay denied')
                else:
                    rcpts.append(addr)
                    send('250 ok')
            elif up == 'DATA':
                send('354 go')
                await writer.drain()
                while True:
                    line = await reader.readline()
                    if line in (b'.\r\n', b''):
                        break
                accepted += 1
                self.delivered.append(list(rcpts))
                send(f'250 ok: queued as {len(self.delivered)}')
                if self.drop_after and accepted >= self.drop_after:
                    await writer.drain()
                    writer.close()
                    return
            elif up == 'RSET':
                send('250 ok')
            elif up == 'NOOP':
                send('250 ok')
            elif up == 'QUIT':
                send('221 bye')
                await writer.drain()
                break
            else:
                send('502 not implemented')
            await writer.drain()
        writer.close()

    def start(self):
        ready = threading.Event()

        def run():
            self._loop = asyncio.new_event_loop()
            asyncio.set_event_loop(self._loop)
            server = self._loop.run_until_complete(
                asyncio.start_server(self._handle, '127.0.0.1', 0))
            self.port = server.sockets[0].getsockname()[1]
            ready.set()
            self._loop.run_forever()

        threading.Thread(target=run, daemon=True).start()
        ready.wait(5)
        return self

    def stop(self):
        if self._loop:
            self._loop.call_soon_threadsafe(self._loop.stop)


ROWS = [{'ФИО': f'Тест {n}', 'Почта': f'u{n}@{d}'}
        for n, d in [(1, 'ok.ru'), (2, 'ok.ru'), (3, 'bad.ru'), (4, 'ok.ru'), (5, 'ok.ru')]]


def run_bulk(server: LabServer, stop_on_error=False):
    import smtplib
    creds = {'smtp_host': '127.0.0.1', 'smtp_port': server.port,
             'smtp_from_email': 'me@lab.ru'}

    def fake_connect(_from, _channel):
        smtp = smtplib.SMTP('127.0.0.1', server.port, timeout=5)
        smtp.ehlo()
        return smtp, creds

    original_connect = bulk_mail._connect
    original_log_send = bulk_mail._m.log_send
    bulk_mail._connect = fake_connect
    bulk_mail._m.log_send = lambda _n: None   # не писать лабораторные письма в статистику
    q = queue.Queue()
    data = {'rows': ROWS, 'mapping': {'{{ФИО}}': 'ФИО'}, 'template_html': '<p>{{ФИО}}</p>',
            'subject': 'Лаборатория', 'email_column': 'Почта', 'channel': 'smtp',
            'stop_on_error': stop_on_error}
    try:
        bulk_mail._run_bulk_send('lab', data, q, threading.Event())
    finally:
        bulk_mail._connect = original_connect
        bulk_mail._m.log_send = original_log_send
    events = []
    while not q.empty():
        events.append(q.get())
    return [e for e in events if e.get('type') in ('progress', 'done', 'cancelled', 'error')]


def report(title, server, **kw):
    print(f'\n=== {title}')
    for e in run_bulk(server, **kw):
        if e['type'] == 'progress':
            print(f"  {e['email']:<14} {e['status']:<6} {e.get('comment', '')[:90]}")
        else:
            print(f"  [{e['type']}] {({k: v for k, v in e.items() if k != 'type'})}")
    print(f'  сессий: {server.sessions}; реально принято сервером: {server.delivered}')


if __name__ == '__main__':
    scenarios = [
        ('Нормальный сервер', dict()),
        ('Сервер закрывает сессию после 1-го письма', dict(drop_after=1)),
        ('Лимит: после 1-го письма отвечает 421', dict(rate_limit_code=421)),
        ('Домен bad.ru отклоняется (550)', dict(reject_domain='bad.ru')),
    ]
    for title, kw in scenarios:
        srv = LabServer(**kw).start()
        try:
            report(title, srv)
        finally:
            srv.stop()
