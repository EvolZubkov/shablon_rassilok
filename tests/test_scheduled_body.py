"""Правка текста запланированного письма: локальные блоки, метка, замена."""
import base64
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
SEND_AT = datetime.datetime(2026, 12, 1, 12, 0, tzinfo=UTC)
SID = 'a' * 32
LETTER = {'blocks': [{'id': 1, 'type': 'text'}], 'comment': '', 'review': False,
          'send_at': '2026-12-01T12:00:00+00:00'}


class TestLetterStore:

    def test_save_load_delete(self, tmp_path):
        base = str(tmp_path)
        store.save_letter(base, SID, LETTER)

        assert store.load_letter(base, SID) == LETTER
        assert store.has_letter(base, SID) is True
        store.delete_letter(base, SID)
        assert store.load_letter(base, SID) is None

    @pytest.mark.parametrize('bad', ['../state', '', 'a' * 31, 'A/..' * 8])
    def test_foreign_identifiers_never_reach_the_disk(self, tmp_path, bad):
        with pytest.raises(ValueError):
            store.save_letter(str(tmp_path), bad, LETTER)
        assert store.load_letter(str(tmp_path), bad) is None
        store.delete_letter(str(tmp_path), bad)

    def test_letters_are_removed_a_week_after_sending(self, tmp_path):
        base = str(tmp_path)
        old, fresh = 'b' * 32, 'c' * 32
        store.save_letter(base, old, {**LETTER, 'send_at': '2026-11-01T12:00:00+00:00'})
        store.save_letter(base, fresh, LETTER)

        store.prune_letters(base, SEND_AT + datetime.timedelta(days=6))

        assert store.has_letter(base, old) is False
        assert store.has_letter(base, fresh) is True


def _item(**extra):
    item = MagicMock()
    item.id = '1'
    item.pochtelye_schedule_id = SID
    item.subject = 'Тема'
    item.deferred_delivery_time = SEND_AT
    item.schedule_message_flags = 0x40D
    item.to_recipients = [MagicMock(email_address='a@rt.ru')]
    item.cc_recipients = None
    item.bcc_recipients = None
    item.body = '<p>старое</p>'
    item.importance = 'Normal'
    item.is_read_receipt_requested = False
    item.attachments = []
    for key, value in extra.items():
        setattr(item, key, value)
    return item


def _attachment(name, is_inline=False):
    attachment = MagicMock(content=b'x', content_type='application/octet-stream',
                           is_inline=is_inline, content_id=None)
    attachment.name = name
    return attachment


class _Folder(list):
    def only(self, *fields):
        return list(self)


def _account(*snapshots):
    account = MagicMock()
    states = iter(snapshots)
    account.outbox.all.side_effect = lambda: _Folder(next(states))
    return account


def _replace_body(account, new, **extra):
    inline = {'name': 'new.png'}
    with patch.object(scheduled, 'Message', return_value=new) as factory, \
         patch.object(scheduled, 'HTMLBody', side_effect=str), \
         patch.object(scheduled, 'FileAttachment', side_effect=lambda **kw: kw), \
         patch.object(scheduled.ex, '_convert_data_images_to_cid',
                      return_value=('<p>новое</p>', [inline])):
        scheduled.replace_body(account, SID, '<p>исходник</p>', now=NOW, **extra)
    return factory


class TestReplaceBody:

    def test_new_body_keeps_subject_recipients_time_and_mark(self):
        old, new = _item(), MagicMock()

        factory = _replace_body(_account([old], []), new)

        kwargs = factory.call_args.kwargs
        assert kwargs['body'] == '<p>новое</p>'
        assert kwargs['subject'] == 'Тема'
        assert kwargs['to_recipients'] is old.to_recipients
        assert new.deferred_delivery_time == SEND_AT
        assert new.pochtelye_schedule_id == SID
        new.send.assert_called_once()
        old.move_to_trash.assert_called_once()

    def test_keeps_files_and_swaps_pictures(self):
        old = _item(attachments=[_attachment('отчёт.xlsx'), _attachment('old.png', True)])
        new = MagicMock()

        _replace_body(_account([old], []), new)

        attached = [call.args[0]['name'] for call in new.attach.call_args_list]
        assert attached == ['отчёт.xlsx', 'new.png']

    def test_new_review_file_replaces_old_one(self):
        old = _item(attachments=[_attachment('review_старое.json'), _attachment('a.txt')])
        new = MagicMock()
        review = {'name': 'review_Тема.json', 'mime_type': 'application/json',
                  'content': base64.b64encode(b'{}').decode()}

        _replace_body(_account([old], []), new, attachments=[review])

        attached = [call.args[0] for call in new.attach.call_args_list]
        assert [a['name'] for a in attached] == ['a.txt', 'new.png', 'review_Тема.json']
        assert attached[-1]['content'] == b'{}'

    def test_missing_letter(self):
        with pytest.raises(scheduled.ScheduledNotFound):
            _replace_body(_account([_item(pochtelye_schedule_id='other')]), MagicMock())

    def test_too_close_to_sending(self):
        old = _item(deferred_delivery_time=NOW + datetime.timedelta(seconds=60))

        with pytest.raises(ValueError, match='слишком близко'):
            _replace_body(_account([old]), MagicMock())

        old.move_to_trash.assert_not_called()


class TestMarkOnLetter:

    def test_deferred_letter_gets_schedule_id(self):
        import exchange_sender as sender
        message = MagicMock()
        with patch.object(sender, 'Message', return_value=message), \
             patch.object(sender, 'HTMLBody', side_effect=str), \
             patch.object(sender, '_to_mailboxes', return_value=[]), \
             patch.object(sender, '_submit_deferred', return_value=False):
            sender.exchange_send_email(
                MagicMock(), 'Тема', '<p>x</p>', ['a@rt.ru'],
                send_at=datetime.datetime(2030, 1, 1, 10, 0), schedule_id=SID)

        assert message.pochtelye_schedule_id == SID


@pytest.fixture()
def app_client(tmp_path):
    import app as _app
    with patch.object(_app, 'CACHE_BASE', str(tmp_path)), \
         patch.object(_app, 'get_app_mode', return_value='admin'):
        yield _app, _app.app.test_client(), str(tmp_path)


class TestSendStoresLetter:

    def _send(self, app_module, client, **extra):
        creds = {'server': 's', 'username': 'u', 'password': 'p', 'from_email': 'me@rt.ru'}
        with patch.object(app_module, 'credentials_exist', return_value=True), \
             patch.object(app_module, 'load_credentials', return_value=creds), \
             patch.object(app_module, 'connect_exchange', return_value=MagicMock()), \
             patch.object(app_module, 'log_send'), \
             patch.object(app_module, 'exchange_send_email', return_value=False) as send:
            response = client.post('/api/send/email', json={
                'subject': 'Тема', 'to': ['a@rt.ru'], 'html_body': '<p>x</p>', **extra})
        assert response.status_code == 200
        return send.call_args.kwargs.get('schedule_id')

    def test_admin_deferred_letter_is_saved_locally(self, app_client):
        app_module, client, base = app_client

        schedule_id = self._send(app_module, client, send_at='2030-01-01T13:00',
                                 timezone=3, source=LETTER)

        saved = store.load_letter(base, schedule_id)
        assert saved['blocks'] == LETTER['blocks']
        assert saved['send_at'] == '2030-01-01T10:00:00+00:00'

    def test_immediate_letter_is_not_saved(self, app_client):
        app_module, client, base = app_client

        assert self._send(app_module, client, source=LETTER) is None
        assert not os.path.exists(os.path.join(base, 'scheduled', 'letters'))

    def test_user_mode_stores_nothing(self, app_client):
        app_module, client, base = app_client
        with patch.object(app_module, 'get_app_mode', return_value='user'):
            schedule_id = self._send(app_module, client, send_at='2030-01-01T13:00',
                                     source=LETTER)

        assert schedule_id is None


class TestBodyRoutes:

    def test_list_marks_editable_letters(self, app_client):
        _, client, base = app_client
        store.save_letter(base, SID, {**LETTER, 'send_at': '2030-01-01T00:00:00+00:00'})
        rows = [{'id': '1', 'schedule_id': SID}, {'id': '2', 'schedule_id': None}]
        with patch('routes.scheduled._open_account', return_value=MagicMock()), \
             patch('routes.scheduled.list_scheduled', return_value=rows):
            items = client.get('/api/scheduled/list').get_json()['items']

        assert [i['editable'] for i in items] == [True, False]

    def test_source_returns_saved_blocks(self, app_client):
        _, client, base = app_client
        store.save_letter(base, SID, LETTER)

        data = client.get(f'/api/scheduled/source?schedule_id={SID}').get_json()

        assert data['letter']['blocks'] == LETTER['blocks']
        missing = client.get('/api/scheduled/source?schedule_id=' + 'f' * 32)
        assert missing.status_code == 404

    def test_body_replaces_letter_and_updates_local_copy(self, app_client):
        _, client, base = app_client
        store.save_letter(base, SID, LETTER)
        with patch('routes.scheduled._open_account', return_value=MagicMock()), \
             patch('routes.scheduled.replace_body') as replace:
            response = client.post('/api/scheduled/body', json={
                'schedule_id': SID, 'html_body': '<p>новое</p>',
                'blocks': [{'id': 2}], 'comment': 'к'})

        assert response.status_code == 200
        replace.assert_called_once()
        saved = store.load_letter(base, SID)
        assert (saved['blocks'], saved['comment']) == ([{'id': 2}], 'к')
        assert saved['send_at'] == LETTER['send_at']

    @pytest.mark.parametrize('payload', [
        {'schedule_id': SID, 'blocks': [{'id': 2}]},
        {'schedule_id': SID, 'html_body': '<p>x</p>', 'blocks': []},
        {'html_body': '<p>x</p>', 'blocks': [{'id': 2}]},
    ])
    def test_body_rejects_incomplete_request(self, app_client, payload):
        _, client, _ = app_client

        assert client.post('/api/scheduled/body', json=payload).status_code == 400

    def test_cancel_forgets_local_copy(self, app_client):
        _, client, base = app_client
        store.save_letter(base, SID, LETTER)
        with patch('routes.scheduled._open_account', return_value=MagicMock()), \
             patch('routes.scheduled.cancel_scheduled', return_value='Тема'):
            client.post('/api/scheduled/cancel', json={'id': '1', 'schedule_id': SID})

        assert store.has_letter(base, SID) is False

    def test_new_time_is_stored(self, app_client):
        _, client, base = app_client
        store.save_letter(base, SID, LETTER)
        with patch('routes.scheduled._open_account', return_value=MagicMock()), \
             patch('routes.scheduled.update_scheduled'):
            client.post('/api/scheduled/update', json={
                'id': '1', 'schedule_id': SID, 'subject': 'Тема', 'to': 'a@rt.ru',
                'send_at': '2030-01-02T13:00', 'timezone': 3})

        assert store.load_letter(base, SID)['send_at'] == '2030-01-02T10:00:00+00:00'
