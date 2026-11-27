"""Запланированные массовые рассылки: локальные данные, группы, правка."""
import os
import queue
import sys
import threading
from unittest.mock import MagicMock, patch

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, 'src'))

import scheduled_store as store  # noqa: E402

CID = 'c' * 32
SID_1, SID_2 = '1' * 32, '2' * 32
CAMPAIGN = {'subject_template': 'Привет, {{ФИО}}', 'mapping': {'{{ФИО}}': 'ФИО'},
            'blocks': [{'id': 1}], 'from_email': 'me@rt.ru'}
SEND_AT = '2030-01-01T10:00:00+00:00'


def _letter(name):
    return {'campaign_id': CID, 'row': {'ФИО': name}, 'send_at': SEND_AT}


def _seed(base):
    store.save_letter(base, SID_1, _letter('Анна'))
    store.save_letter(base, SID_2, _letter('Борис'))
    store.save_campaign(base, CID, CAMPAIGN)


class TestCampaignStore:

    def test_campaign_lives_while_it_has_letters(self, tmp_path):
        import datetime
        base = str(tmp_path)
        _seed(base)
        now = datetime.datetime(2029, 12, 31, tzinfo=datetime.timezone.utc)

        store.delete_letter(base, SID_1)
        store.prune_letters(base, now)
        assert store.load_campaign(base, CID) == CAMPAIGN

        store.delete_letter(base, SID_2)
        store.prune_letters(base, now)
        assert store.load_campaign(base, CID) is None

    def test_counts_letters_of_campaign(self, tmp_path):
        _seed(str(tmp_path))

        assert store.campaign_size(str(tmp_path), CID) == 2

    def test_foreign_campaign_id_rejected(self, tmp_path):
        with pytest.raises(ValueError):
            store.save_campaign(str(tmp_path), '../x', CAMPAIGN)
        assert store.load_campaign(str(tmp_path), '../x') is None


def _run_bulk(base, mode='admin', **extra):
    import app as _app
    from routes import bulk_mail
    data = {
        'rows': [{'Email': 'a@rt.ru', 'ФИО': 'Анна', 'Оклад': '1'},
                 {'Email': 'b@rt.ru', 'ФИО': 'Борис', 'Оклад': '2'}],
        'mapping': {'{{ФИО}}': 'ФИО'}, 'template_html': '<p>{{ФИО}}</p>',
        'subject': 'Привет, {{ФИО}}', 'send_at': '2030-01-01T13:00', 'timezone': 3,
        'source': {'blocks': [{'id': 1}]}, **extra}
    with patch.object(_app, 'CACHE_BASE', base), \
         patch.object(_app, 'get_app_mode', return_value=mode), \
         patch.object(_app, 'prepare_html_for_email', side_effect=lambda h: h), \
         patch.object(_app, 'log_send'), \
         patch.object(_app, 'exchange_send_email', return_value=False) as send, \
         patch.object(bulk_mail, '_connect', return_value=(MagicMock(), {'from_email': 'me@rt.ru'})):
        bulk_mail._run_bulk_send('job', data, queue.Queue(), threading.Event())
    return [call.kwargs.get('schedule_id') for call in send.call_args_list]


class TestBulkSendStoresCampaign:

    def test_deferred_campaign_is_saved_with_only_used_columns(self, tmp_path):
        ids = _run_bulk(str(tmp_path))

        first = store.load_letter(str(tmp_path), ids[0])
        assert first['row'] == {'ФИО': 'Анна'}
        assert first['send_at'] == SEND_AT
        campaign = store.load_campaign(str(tmp_path), first['campaign_id'])
        assert campaign['blocks'] == [{'id': 1}]
        assert campaign['subject_template'] == 'Привет, {{ФИО}}'
        assert campaign['from_email'] == 'me@rt.ru'
        assert store.campaign_size(str(tmp_path), first['campaign_id']) == 2

    @pytest.mark.parametrize('mode, extra', [
        ('user', {}), ('admin', {'send_at': ''}), ('admin', {'source': None}),
    ])
    def test_nothing_stored_otherwise(self, tmp_path, mode, extra):
        assert _run_bulk(str(tmp_path), mode, **extra) == [None, None]
        assert not os.path.exists(os.path.join(str(tmp_path), 'scheduled', 'letters'))


@pytest.fixture()
def client(tmp_path):
    import app as _app
    _seed(str(tmp_path))
    with patch.object(_app, 'CACHE_BASE', str(tmp_path)), \
         patch.object(_app, 'get_app_mode', return_value='admin'), \
         patch.object(_app, 'prepare_html_for_email', side_effect=lambda h: h), \
         patch('routes.scheduled._open_account', return_value=MagicMock()):
        yield _app.app.test_client(), str(tmp_path)


class TestCampaignRoutes:

    def test_list_describes_campaigns(self, client):
        http, _ = client
        rows = [{'id': '1', 'schedule_id': SID_1}, {'id': '3', 'schedule_id': None}]
        with patch('routes.scheduled.list_scheduled', return_value=rows):
            data = http.get('/api/scheduled/list').get_json()

        assert [i['campaign_id'] for i in data['items']] == [CID, None]
        assert data['items'][0]['editable'] is True
        assert data['campaigns'] == {CID: {'subject_template': 'Привет, {{ФИО}}', 'total': 2}}

    def test_old_copies_are_removed_on_application_start(self, client):
        http, base = client
        store.save_letter(base, SID_1, {**_letter('Анна'),
                                        'send_at': '2020-01-01T00:00:00+00:00'})

        http.get('/api/scheduled/state')

        assert store.has_letter(base, SID_1) is False
        assert store.has_letter(base, SID_2) is True

    def test_source_of_campaign_and_of_its_letter(self, client):
        http, _ = client

        whole = http.get(f'/api/scheduled/source?campaign_id={CID}').get_json()['letter']
        single = http.get(f'/api/scheduled/source?schedule_id={SID_1}').get_json()['letter']

        assert whole['blocks'] == single['blocks'] == CAMPAIGN['blocks']
        assert single['campaign_id'] == CID

    def test_single_letter_body_is_filled_with_its_row(self, client):
        http, base = client
        with patch('routes.scheduled.replace_body') as replace:
            http.post('/api/scheduled/body', json={
                'schedule_id': SID_1, 'html_body': '<p>{{ФИО}}!</p>', 'blocks': [{'id': 9}]})

        assert replace.call_args.args[2] == '<p>Анна!</p>'
        assert store.load_letter(base, SID_1)['blocks'] == [{'id': 9}]
        assert store.load_campaign(base, CID)['blocks'] == CAMPAIGN['blocks']

    def test_whole_campaign_body_updates_shared_blocks(self, client):
        http, base = client
        store.save_letter(base, SID_1, {**_letter('Анна'), 'blocks': [{'id': 5}]})
        with patch('routes.scheduled.replace_body'):
            http.post('/api/scheduled/body', json={
                'schedule_id': SID_1, 'html_body': '<p>x</p>', 'blocks': [{'id': 9}],
                'whole_campaign': True})

        assert store.load_campaign(base, CID)['blocks'] == [{'id': 9}]
        assert 'blocks' not in store.load_letter(base, SID_1)

    def test_subject_template_is_filled_per_letter(self, client):
        http, base = client
        with patch('routes.scheduled.update_scheduled') as update:
            response = http.post('/api/scheduled/update', json={
                'id': '2', 'schedule_id': SID_2, 'subject': 'старая',
                'subject_template': '{{ФИО}}, новое', 'to': ['b@rt.ru'],
                'send_at': '2030-01-02T13:00', 'timezone': 3})

        assert response.status_code == 200
        assert update.call_args.kwargs['subject'] == 'Борис, новое'
        assert store.load_campaign(base, CID)['subject_template'] == '{{ФИО}}, новое'

    def test_subject_template_without_campaign_data_is_refused(self, client):
        http, _ = client
        with patch('routes.scheduled.update_scheduled') as update:
            response = http.post('/api/scheduled/update', json={
                'id': '9', 'schedule_id': 'f' * 32, 'subject_template': '{{ФИО}}',
                'to': 'a@rt.ru', 'send_at': '2030-01-02T13:00'})

        assert response.status_code == 400
        update.assert_not_called()


class TestAccountCache:

    def test_connection_is_reused_between_requests(self):
        import app as _app
        from routes import scheduled as routes
        creds = {'server': 's', 'username': 'u', 'password': 'p', 'from_email': 'me@rt.ru'}
        routes._forget_account()
        with patch.object(routes, '_load_credentials', return_value=creds), \
             patch.object(_app, 'connect_exchange', side_effect=lambda *a, **k: MagicMock()) as connect:
            first = routes._open_account('')
            second = routes._open_account('')
            routes._open_account('hr@rt.ru')

        routes._forget_account()
        assert first is second
        assert connect.call_count == 2
