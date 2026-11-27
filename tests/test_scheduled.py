"""Панель «Запланированные письма»: список, отмена, маршруты."""
import datetime
import os
import sys
from unittest.mock import MagicMock, patch

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, 'src'))

import exchange_scheduled as scheduled  # noqa: E402

UTC = datetime.timezone.utc


def _item(item_id, subject='Тема', when=None, flags=0x40D, to=('a@rt.ru',)):
    item = MagicMock()
    item.id = item_id
    item.subject = subject
    item.deferred_delivery_time = when
    item.schedule_message_flags = flags
    item.to_recipients = [MagicMock(email_address=a) for a in to]
    item.cc_recipients = None
    item.bcc_recipients = None
    item.has_attachments = False
    item.pochtelye_schedule_id = None
    return item


def _account(*snapshots):
    """Каждый вызов outbox.all().only(...) возвращает следующий «снимок» папки."""
    account = MagicMock()
    account.outbox.all.return_value.only.side_effect = [list(s) for s in snapshots]
    return account


class TestListScheduled:

    def test_returns_only_deferred_items_sorted_by_time(self):
        later = _item('2', 'позже', datetime.datetime(2026, 12, 2, 9, 0, tzinfo=UTC))
        sooner = _item('1', 'раньше', datetime.datetime(2026, 12, 1, 9, 0, tzinfo=UTC))
        ordinary = _item('3', 'без отсрочки', None)

        result = scheduled.list_scheduled(_account([later, ordinary, sooner]))

        assert [r['id'] for r in result] == ['1', '2']
        assert result[0] == {
            'id': '1', 'subject': 'раньше', 'to': ['a@rt.ru'], 'cc': [], 'bcc': [],
            'send_at': '2026-12-01T09:00:00+00:00', 'has_attachments': False,
            'waiting': True, 'schedule_id': None,
        }

    def test_item_without_submit_flag_is_not_waiting(self):
        """Письмо открыли в Outlook и не отправили снова — само оно не уйдёт."""
        draft = _item('1', when=datetime.datetime(2026, 12, 1, tzinfo=UTC), flags=0x409)

        assert scheduled.list_scheduled(_account([draft]))[0]['waiting'] is False


class TestCancelScheduled:

    def test_moves_item_to_trash_and_checks_it_is_gone(self):
        item = _item('1', 'отменяемое', datetime.datetime(2026, 12, 1, tzinfo=UTC))
        account = _account([item], [])

        assert scheduled.cancel_scheduled(account, '1') == 'отменяемое'
        item.move_to_trash.assert_called_once()

    def test_unknown_id_means_already_sent_or_cancelled(self):
        with pytest.raises(scheduled.ScheduledNotFound):
            scheduled.cancel_scheduled(_account([]), 'нет')

    def test_fails_if_item_is_still_in_outbox(self):
        item = _item('1', when=datetime.datetime(2026, 12, 1, tzinfo=UTC))

        with pytest.raises(RuntimeError, match='не удалено'):
            scheduled.cancel_scheduled(_account([item], [item]), '1')


class TestScheduledRoutes:

    @pytest.fixture()
    def client(self, tmp_path):
        import app as _app
        with patch.object(_app, 'CACHE_BASE', str(tmp_path)), \
             patch.object(_app, 'get_app_mode', return_value='admin'):
            yield _app.app.test_client()

    def test_routes_are_admin_only(self):
        import app as _app
        with patch.object(_app, 'get_app_mode', return_value='user'):
            client = _app.app.test_client()
            assert client.get('/api/scheduled/list').status_code == 403
            assert client.get('/api/scheduled/state').status_code == 403
            assert client.post('/api/scheduled/cancel', json={'id': '1'}).status_code == 403

    def test_unlock_state_is_persisted(self, client):
        assert client.get('/api/scheduled/state').get_json()['unlocked'] is False

        client.post('/api/scheduled/state', json={'unlocked': True})

        assert client.get('/api/scheduled/state').get_json()['unlocked'] is True

    def test_cancel_requires_id(self, client):
        assert client.post('/api/scheduled/cancel', json={}).status_code == 400

    def test_cancel_of_missing_letter_returns_404(self, client):
        with patch('routes.scheduled._open_account', return_value=MagicMock()), \
             patch('routes.scheduled.cancel_scheduled',
                   side_effect=scheduled.ScheduledNotFound('уже отправлено')):
            response = client.post('/api/scheduled/cancel', json={'id': '1'})

        assert response.status_code == 404
        assert response.get_json() == {'success': False, 'error': 'уже отправлено'}
