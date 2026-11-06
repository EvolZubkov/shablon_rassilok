"""Рассылка по SMTP переживает закрытие сессии сервером (scripts/smtp_lab.py)."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'scripts'))
import smtp_lab  # noqa: E402


@pytest.mark.parametrize('server_kwargs', [
    {'drop_after': 1},
    {'rate_limit_code': 421},
])
def test_all_rows_delivered_after_session_loss(server_kwargs):
    server = smtp_lab.LabServer(**server_kwargs).start()
    try:
        events = smtp_lab.run_bulk(server)
    finally:
        server.stop()

    statuses = [e['status'] for e in events if e['type'] == 'progress']
    assert statuses == ['sent'] * len(smtp_lab.ROWS)
    assert len(server.delivered) == len(smtp_lab.ROWS)


def test_refused_recipient_does_not_stop_next_rows():
    server = smtp_lab.LabServer(reject_domain='bad.ru').start()
    try:
        events = smtp_lab.run_bulk(server)
    finally:
        server.stop()

    statuses = [e['status'] for e in events if e['type'] == 'progress']
    assert statuses == ['sent', 'sent', 'error', 'sent', 'sent']
