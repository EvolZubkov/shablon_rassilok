"""Панель «Запланированные»: выбор ящика и изменение письма заменой."""
import datetime
import os
import sys
from unittest.mock import MagicMock, patch

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, 'src'))

import exchange_scheduled as scheduled  # noqa: E402
import scheduled_store as store  # noqa: E402

UTC = datetime.timezone.utc
NOW = datetime.datetime(2026, 12, 1, 8, 0, tzinfo=UTC)
OLD_TIME = datetime.datetime(2026, 12, 1, 12, 0, tzinfo=UTC)
NEW_LOCAL = datetime.datetime(2026, 12, 2, 15, 30)  # местное время, UTC+3


# ─── Хранилище и список ящиков ──────────────────────────────────────────────

class TestScheduledStore:

    def test_remembers_mailboxes_without_duplicates(self, tmp_path):
        for address in ('HR@rt.ru', 'hr@rt.ru', 'news@rt.ru', '  '):
            store.remember_mailbox(str(tmp_path), address)

        assert store.recent_mailboxes(str(tmp_path)) == ['HR@rt.ru', 'news@rt.ru']

    def test_unlock_and_mailboxes_do_not_overwrite_each_other(self, tmp_path):
        store.remember_mailbox(str(tmp_path), 'a@rt.ru')
        store.set_unlocked(str(tmp_path), True)

        assert store.is_unlocked(str(tmp_path)) is True
        assert store.recent_mailboxes(str(tmp_path)) == ['a@rt.ru']

    def test_broken_state_file_is_treated_as_empty(self, tmp_path):
        (tmp_path / 'scheduled').mkdir()
        (tmp_path / 'scheduled' / 'state.json').write_text('[не json', encoding='utf-8')

        assert store.is_unlocked(str(tmp_path)) is False
        assert store.recent_mailboxes(str(tmp_path)) == []

    def test_merged_list_starts_with_default(self):
        result = store.merge_mailboxes('me@rt.ru', ['hr@rt.ru', 'ME@rt.ru'],
                                       ['news@rt.ru', 'hr@rt.ru'])

        assert result == ['me@rt.ru', 'hr@rt.ru', 'news@rt.ru']


class TestMailboxesRoute:

    def test_lists_default_senders_and_recent(self, tmp_path):
        import app as _app
        store.remember_mailbox(str(tmp_path), 'news@rt.ru')
        creds = {'from_email': 'me@rt.ru', 'default_senders': ['hr@rt.ru']}
        with patch.object(_app, 'CACHE_BASE', str(tmp_path)), \
             patch.object(_app, 'get_app_mode', return_value='admin'), \
             patch.object(_app, 'credentials_exist', return_value=True), \
             patch.object(_app, 'load_credentials', return_value=creds):
            data = _app.app.test_client().get('/api/scheduled/mailboxes').get_json()

        assert data['mailboxes'] == ['me@rt.ru', 'hr@rt.ru', 'news@rt.ru']


# ─── Изменение письма (замена) ──────────────────────────────────────────────

class _Folder(list):
    def only(self, *fields):
        return list(self)


def _full_item():
    item = MagicMock()
    item.id = '1'
    item.subject = 'Старая тема'
    item.deferred_delivery_time = OLD_TIME
    item.schedule_message_flags = 0x40D
    item.to_recipients = [MagicMock(email_address='a@rt.ru')]
    item.cc_recipients = None
    item.bcc_recipients = None
    item.body = '<p>тело</p>'
    item.attachments = []
    item.importance = 'High'
    item.is_read_receipt_requested = True
    return item


def _account(*snapshots):
    """Каждое обращение к outbox.all() возвращает следующий «снимок» папки."""
    account = MagicMock()
    states = iter(snapshots)
    account.outbox.all.side_effect = lambda: _Folder(next(states))
    return account


def _update(account, new_message, **overrides):
    params = {'subject': 'Новая тема', 'to': ['a@rt.ru'], 'cc': [], 'bcc': [],
              'send_at': NEW_LOCAL, 'timezone': 3.0, 'now': NOW}
    params.update(overrides)
    with patch.object(scheduled, 'Message', return_value=new_message) as factory, \
         patch.object(scheduled, 'HTMLBody', side_effect=str), \
         patch.object(scheduled, 'FileAttachment', side_effect=lambda **kw: kw), \
         patch.object(scheduled.ex, '_to_ews_datetime', return_value='UTC-TIME'), \
         patch.object(scheduled.ex, '_to_mailboxes', side_effect=lambda a, acc: list(a)):
        scheduled.update_scheduled(account, '1', **params)
    return factory


class TestUpdateScheduled:

    def test_saves_new_removes_old_then_submits(self):
        old, new = _full_item(), MagicMock()
        order = []
        new.save.side_effect = lambda: order.append('save new')
        old.move_to_trash.side_effect = lambda: order.append('remove old')
        new.send.side_effect = lambda **kw: order.append('send new')
        account = _account([old], [])

        factory = _update(account, new)

        assert order == ['save new', 'remove old', 'send new']
        kwargs = factory.call_args.kwargs
        assert kwargs['subject'] == 'Новая тема'
        assert kwargs['body'] == '<p>тело</p>'
        assert kwargs['folder'] is account.outbox
        assert new.importance == 'High'
        assert new.is_read_receipt_requested is True
        assert new.deferred_delivery_time == 'UTC-TIME'
        assert new.client_deferred_delivery_time == 'UTC-TIME'
        new.send.assert_called_once_with(save_copy=True, copy_to_folder=account.sent)

    def test_unchanged_recipients_keep_original_objects(self):
        old, new = _full_item(), MagicMock()

        factory = _update(_account([old], []), new)

        assert factory.call_args.kwargs['to_recipients'] is old.to_recipients

    def test_changed_recipients_are_replaced(self):
        old, new = _full_item(), MagicMock()

        factory = _update(_account([old], []), new, to=['b@rt.ru'])

        assert factory.call_args.kwargs['to_recipients'] == ['b@rt.ru']

    def test_copies_attachments_including_inline(self):
        old, new = _full_item(), MagicMock()
        inline = MagicMock(content=b'png', content_type='image/png',
                           is_inline=True, content_id='img_0')
        inline.name = 'img.png'
        old.attachments = [inline]

        _update(_account([old], []), new)

        new.attach.assert_called_once_with({
            'name': 'img.png', 'content_type': 'image/png', 'content': b'png',
            'is_inline': True, 'content_id': 'img_0'})

    def test_old_letter_not_removed_means_new_is_discarded(self):
        old, new = _full_item(), MagicMock()

        with pytest.raises(RuntimeError, match='не удалось заменить'):
            _update(_account([old], [old]), new)

        new.send.assert_not_called()
        new.delete.assert_called_once()

    def test_send_failure_moves_new_letter_to_drafts(self):
        old, new = _full_item(), MagicMock()
        new.send.side_effect = ConnectionError('обрыв')
        account = _account([old], [])

        with pytest.raises(RuntimeError, match='Черновики'):
            _update(account, new)

        new.move.assert_called_once_with(account.drafts)

    def test_unsubmitted_letter_with_passed_time_can_be_rescheduled(self):
        old, new = _full_item(), MagicMock()
        old.schedule_message_flags = 0x409

        _update(_account([old], []), new, now=OLD_TIME + datetime.timedelta(hours=1),
                send_at=datetime.datetime(2026, 12, 3, 10, 0))

        new.send.assert_called_once()

    @pytest.mark.parametrize('overrides, message', [
        ({'now': OLD_TIME - datetime.timedelta(seconds=60)}, 'слишком близко'),
        ({'send_at': datetime.datetime(2026, 12, 1, 11, 1)}, 'не раньше чем через'),
        ({'subject': '  '}, 'Тема'),
        ({'to': [], 'cc': [], 'bcc': []}, 'получател'),
    ])
    def test_rejects_unsafe_changes_without_touching_letter(self, overrides, message):
        old, new = _full_item(), MagicMock()

        with pytest.raises(ValueError, match=message):
            _update(_account([old], []), new, **overrides)

        old.move_to_trash.assert_not_called()
        new.save.assert_not_called()


class TestUpdateRoute:

    def test_passes_parsed_values(self):
        import app as _app
        with patch.object(_app, 'get_app_mode', return_value='admin'), \
             patch('routes.scheduled._open_account', return_value=MagicMock()), \
             patch('routes.scheduled.update_scheduled') as update:
            response = _app.app.test_client().post('/api/scheduled/update', json={
                'id': '1', 'subject': 'Тема', 'to': 'a@rt.ru; b@rt.ru',
                'send_at': '2026-12-02T15:30', 'timezone': 4})

        assert response.status_code == 200
        kwargs = update.call_args.kwargs
        assert kwargs['to'] == ['a@rt.ru', 'b@rt.ru']
        assert kwargs['send_at'] == datetime.datetime(2026, 12, 2, 15, 30)
        assert kwargs['timezone'] == 4.0

    def test_bad_time_is_400(self):
        import app as _app
        with patch.object(_app, 'get_app_mode', return_value='admin'):
            response = _app.app.test_client().post('/api/scheduled/update', json={
                'id': '1', 'subject': 'Тема', 'to': 'a@rt.ru', 'send_at': 'завтра'})

        assert response.status_code == 400
