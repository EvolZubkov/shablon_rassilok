"""
tests/test_bulk_mail.py

Тесты для routes/bulk_mail.py:
  - _substitute()        — подстановка плейсхолдеров
  - _rows_to_result()    — преобразование сырых строк в словари
  - /api/bulk/parse      — загрузка и парсинг xlsx/ods файлов
  - /api/bulk/send-test  — тестовая отправка письма
  - /api/bulk/send/start — старт задачи рассылки
  - /api/bulk/send/cancel — отмена задачи

Запуск: pytest tests/test_bulk_mail.py -v
"""

import io
import json
import os
import sys
import tempfile
import threading
import time
import unittest.mock as mock
from unittest.mock import MagicMock, patch, call

# ─── Мокаем Windows-зависимости до импорта app ───────────────────────────────
for mod in ('win32com', 'win32com.client', 'pythoncom', 'pywin32_runtime'):
    if mod not in sys.modules:
        sys.modules[mod] = MagicMock()
sys.modules['win32com'].client = MagicMock()
sys.modules.setdefault('exchangelib', MagicMock())
sys.modules.setdefault('exchangelib.errors', MagicMock())

FAKE_NETWORK = tempfile.mkdtemp(prefix='eb_bm_net_')
FAKE_CACHE   = tempfile.mkdtemp(prefix='eb_bm_cache_')

with mock.patch.dict(os.environ, {'APP_MODE': 'admin'}):
    sys.modules.setdefault('app_admin', MagicMock())
    sys.modules.setdefault('app_user',  MagicMock())
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

    import app as email_app
    email_app.NETWORK_RESOURCES_PATH = FAKE_NETWORK
    email_app.CACHE_DIR              = FAKE_CACHE
    email_app.CACHE_VERSION_FILE     = os.path.join(FAKE_CACHE, 'cache_version.txt')
    email_app.NETWORK_VERSION_FILE   = os.path.join(FAKE_NETWORK, 'version.txt')

import pytest
from routes.bulk_mail import _substitute, _rows_to_result


def _future_iso(days=30, hour=10):
    """ISO-время в будущем (относительно «сейчас»), чтобы тесты не протухали."""
    import datetime as _dt
    moment = _dt.datetime.now() + _dt.timedelta(days=days)
    return moment.replace(hour=hour, minute=0, second=0, microsecond=0).isoformat()


# ─── Фикстуры ────────────────────────────────────────────────────────────────

@pytest.fixture(scope='session')
def app_instance():
    email_app.app.config['TESTING'] = True
    yield email_app.app


@pytest.fixture
def client(app_instance):
    return app_instance.test_client()


@pytest.fixture(autouse=True)
def reset_paths():
    email_app.NETWORK_RESOURCES_PATH = FAKE_NETWORK
    email_app.CACHE_DIR              = FAKE_CACHE
    yield


# ─── _substitute ─────────────────────────────────────────────────────────────

class TestSubstitute:

    def test_simple_replacement(self):
        result = _substitute('Привет, {{ФИО}}!', {'{{ФИО}}': 'ФИО'}, {'ФИО': 'Иван Иванов'})
        assert result == 'Привет, Иван Иванов!'

    def test_multiple_placeholders(self):
        tpl = '{{ФИО}}, {{Должность}}'
        mapping = {'{{ФИО}}': 'ФИО', '{{Должность}}': 'Должность'}
        row = {'ФИО': 'Мария', 'Должность': 'Менеджер'}
        result = _substitute(tpl, mapping, row)
        assert result == 'Мария, Менеджер'

    def test_html_escaping(self):
        result = _substitute('{{X}}', {'{{X}}': 'X'}, {'X': '<b>bold</b>'})
        assert '&lt;b&gt;' in result
        assert '<b>' not in result

    def test_missing_column_gives_empty(self):
        result = _substitute('{{ФИО}}', {'{{ФИО}}': 'НесуществующаяКолонка'}, {'ФИО': 'Иван'})
        assert result == ''

    def test_missing_key_in_row(self):
        result = _substitute('{{X}}', {'{{X}}': 'X'}, {})
        assert result == ''

    def test_span_wrapper_replaced(self):
        tpl = '<span class="bm-inline-ph" data-ph="{{ФИО}}">{{ФИО}}</span>'
        result = _substitute(tpl, {'{{ФИО}}': 'ФИО'}, {'ФИО': 'Тест'})
        assert 'bm-inline-ph' not in result
        assert 'Тест' in result

    def test_empty_template(self):
        result = _substitute('', {'{{ФИО}}': 'ФИО'}, {'ФИО': 'Иван'})
        assert result == ''

    def test_empty_mapping(self):
        result = _substitute('Текст без плейсхолдеров', {}, {'ФИО': 'Иван'})
        assert result == 'Текст без плейсхолдеров'

    def test_none_value_gives_empty(self):
        result = _substitute('{{X}}', {'{{X}}': 'X'}, {'X': None})
        assert result == ''

    def test_url_in_text_becomes_styled_link(self):
        result = _substitute('Ссылка: {{L}}', {'{{L}}': 'L'}, {'L': 'https://a.ru/x?y=1&z=2'})
        assert '<a href="https://a.ru/x?y=1&amp;z=2"' in result
        assert 'color:' in result

    def test_url_inside_sentence_is_linked_and_punctuation_kept_outside(self):
        result = _substitute('{{L}}', {'{{L}}': 'L'}, {'L': 'Смотри https://a.ru/p, пожалуйста'})
        assert '<a href="https://a.ru/p"' in result
        assert '</a>, пожалуйста' in result

    def test_no_nested_anchor_when_placeholder_inside_link(self):
        tpl = '<a href="{{L}}">{{L}}</a>'
        result = _substitute(tpl, {'{{L}}': 'L'}, {'L': 'https://a.ru'})
        assert result == '<a href="https://a.ru">https://a.ru</a>'

    def test_placeholder_in_partial_href_stays_plain(self):
        tpl = '<a href="https://a.ru/?id={{ID}}">go</a>'
        result = _substitute(tpl, {'{{ID}}': 'ID'}, {'ID': 'https://b.ru'})
        assert result.count('<a ') == 1
        assert 'href="https://a.ru/?id=https://b.ru"' in result

    def test_attribute_value_cannot_break_out(self):
        tpl = '<a href="{{L}}">x</a>'
        result = _substitute(tpl, {'{{L}}': 'L'}, {'L': 'https://a.ru" onclick="evil'})
        assert 'onclick="evil' not in result
        assert '&quot;' in result

    def test_substituted_value_not_rescanned(self):
        mapping = {'{{A}}': 'A', '{{B}}': 'B'}
        result = _substitute('{{A}}', mapping, {'A': '{{B}}', 'B': 'secret'})
        assert result == '{{B}}'

    def test_ampersand_escaped(self):
        result = _substitute('{{X}}', {'{{X}}': 'X'}, {'X': 'A&B'})
        assert '&amp;' in result

    def test_quotes_escaped(self):
        result = _substitute('{{X}}', {'{{X}}': 'X'}, {'X': '"quoted"'})
        assert '&quot;' in result


# ─── _rows_to_result ─────────────────────────────────────────────────────────

class TestRowsToResult:

    def test_basic(self):
        rows = [['ФИО', 'Email'], ['Иван', 'ivan@test.ru'], ['Мария', 'maria@test.ru']]
        result = _rows_to_result(rows, ['Sheet1'], header_row=1)
        assert result['headers'] == ['ФИО', 'Email']
        assert result['total'] == 2
        assert result['rows'][0] == {'ФИО': 'Иван', 'Email': 'ivan@test.ru'}

    def test_empty_rows(self):
        result = _rows_to_result([], ['Sheet1'], header_row=1)
        assert result['headers'] == []
        assert result['rows'] == []
        assert result['total'] == 0

    def test_trailing_empty_columns_stripped(self):
        rows = [['ФИО', 'Email', '', ''], ['Иван', 'ivan@test.ru', '', '']]
        result = _rows_to_result(rows, ['Sheet1'], header_row=1)
        assert result['headers'] == ['ФИО', 'Email']

    def test_blank_rows_skipped(self):
        rows = [['ФИО', 'Email'], ['', ''], ['Иван', 'ivan@test.ru']]
        result = _rows_to_result(rows, ['Sheet1'], header_row=1)
        assert result['total'] == 1

    def test_header_row_offset(self):
        rows = [['Пропустить'], ['ФИО', 'Email'], ['Иван', 'ivan@test.ru']]
        result = _rows_to_result(rows, ['Sheet1'], header_row=2)
        assert result['headers'] == ['ФИО', 'Email']
        assert result['total'] == 1

    def test_sheets_preserved(self):
        rows = [['ФИО'], ['Иван']]
        result = _rows_to_result(rows, ['Лист1', 'Лист2'], header_row=1)
        assert result['sheets'] == ['Лист1', 'Лист2']

    def test_short_row_padded(self):
        rows = [['ФИО', 'Email', 'Телефон'], ['Иван']]
        result = _rows_to_result(rows, ['Sheet1'], header_row=1)
        assert result['rows'][0]['Email'] == ''
        assert result['rows'][0]['Телефон'] == ''

    def test_header_whitespace_stripped(self):
        rows = [['  ФИО  ', ' Email '], ['Иван', 'ivan@test.ru']]
        result = _rows_to_result(rows, ['Sheet1'], header_row=1)
        assert 'ФИО' in result['headers']
        assert 'Email' in result['headers']


# ─── /api/bulk/parse ─────────────────────────────────────────────────────────

class TestBulkParse:

    def test_no_file_returns_400(self, client):
        resp = client.post('/api/bulk/parse')
        assert resp.status_code == 400
        assert 'error' in resp.get_json()

    def test_unsupported_format_returns_400(self, client):
        # .pdf is not a supported format
        data = {'file': (io.BytesIO(b'%PDF-1.4 fake'), 'report.pdf')}
        resp = client.post('/api/bulk/parse', data=data, content_type='multipart/form-data')
        assert resp.status_code == 400
        body = resp.get_json()
        assert 'error' in body
        assert 'pdf' in body['error'].lower() or 'формат' in body['error'].lower()

    def test_csv_comma_parsed(self, client):
        csv_content = 'ФИО,Email,Должность\nИван,ivan@test.ru,Менеджер\nМария,maria@test.ru,Аналитик\n'
        data = {'file': (io.BytesIO(csv_content.encode('utf-8')), 'contacts.csv')}
        resp = client.post('/api/bulk/parse', data=data, content_type='multipart/form-data')
        assert resp.status_code == 200
        body = resp.get_json()
        assert body['headers'] == ['ФИО', 'Email', 'Должность']
        assert body['total'] == 2
        assert body['rows'][0]['Email'] == 'ivan@test.ru'

    def test_csv_semicolon_parsed(self, client):
        csv_content = 'ФИО;Email\nПётр;petr@test.ru\nАнна;anna@test.ru\n'
        data = {'file': (io.BytesIO(csv_content.encode('utf-8')), 'contacts.csv')}
        resp = client.post('/api/bulk/parse', data=data, content_type='multipart/form-data')
        assert resp.status_code == 200
        body = resp.get_json()
        assert body['headers'] == ['ФИО', 'Email']
        assert body['total'] == 2

    def test_csv_bom_utf8_parsed(self, client):
        # UTF-8 with BOM — encode('utf-8-sig') prepends BOM automatically
        csv_content = 'Имя,Почта\nТест,test@example.com\n'
        data = {'file': (io.BytesIO(csv_content.encode('utf-8-sig')), 'export.csv')}
        resp = client.post('/api/bulk/parse', data=data, content_type='multipart/form-data')
        assert resp.status_code == 200
        body = resp.get_json()
        assert body['headers'] == ['Имя', 'Почта']
        assert body['total'] == 1

    def test_xlsx_parsed(self, client):
        import openpyxl
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.append(['ФИО', 'Email'])
        ws.append(['Иван', 'ivan@test.ru'])
        ws.append(['Мария', 'maria@test.ru'])
        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)

        data = {'file': (buf, 'test.xlsx')}
        resp = client.post('/api/bulk/parse', data=data, content_type='multipart/form-data')
        assert resp.status_code == 200
        body = resp.get_json()
        assert body['headers'] == ['ФИО', 'Email']
        assert body['total'] == 2

    def test_xlsx_with_sheet_param(self, client):
        import openpyxl
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = 'Данные'
        ws.append(['Имя', 'Почта'])
        ws.append(['Тест', 'test@test.ru'])
        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)

        data = {'file': (buf, 'test.xlsx'), 'sheet': 'Данные'}
        resp = client.post('/api/bulk/parse', data=data, content_type='multipart/form-data')
        assert resp.status_code == 200
        body = resp.get_json()
        assert body['headers'] == ['Имя', 'Почта']

    def test_xlsx_header_row_param(self, client):
        import openpyxl
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.append(['Пропустить эту строку'])
        ws.append(['ФИО', 'Email'])
        ws.append(['Иван', 'ivan@test.ru'])
        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)

        data = {'file': (buf, 'test.xlsx'), 'header_row': '2'}
        resp = client.post('/api/bulk/parse', data=data, content_type='multipart/form-data')
        assert resp.status_code == 200
        body = resp.get_json()
        assert body['headers'] == ['ФИО', 'Email']
        assert body['total'] == 1

    def test_corrupt_xlsx_returns_422(self, client):
        data = {'file': (io.BytesIO(b'not-an-xlsx'), 'bad.xlsx')}
        resp = client.post('/api/bulk/parse', data=data, content_type='multipart/form-data')
        assert resp.status_code == 422


# ─── /api/bulk/send-test ─────────────────────────────────────────────────────

class TestBulkSendTest:

    def _mock_creds(self):
        return {
            'server':     'exchange.test.ru',
            'username':   'user@test.ru',
            'password':   'pass',
            'from_email': 'sender@test.ru',
            'auth_type':  'ntlm',
        }

    def test_no_credentials_returns_401(self, client):
        with patch.object(email_app, 'credentials_exist', return_value=False):
            resp = client.post('/api/bulk/send-test',
                               json={'template_html': '<p>test</p>', 'row': {}, 'mapping': {}})
        assert resp.status_code == 401

    def test_success(self, client):
        creds = self._mock_creds()
        mock_account = MagicMock()
        with patch.object(email_app, 'credentials_exist', return_value=True), \
             patch.object(email_app, 'load_credentials', return_value=creds), \
             patch.object(email_app, 'connect_exchange', return_value=mock_account), \
             patch.object(email_app, 'exchange_send_email') as mock_send, \
             patch.object(email_app, 'prepare_html_for_email', return_value='<html/>'):
            resp = client.post('/api/bulk/send-test', json={
                'template_html': '<p>Привет {{ФИО}}</p>',
                'row':     {'ФИО': 'Иван'},
                'mapping': {'{{ФИО}}': 'ФИО'},
                'subject': 'Тест',
            })
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['success'] is True
        assert data['to'] == 'sender@test.ru'
        mock_send.assert_called_once()

    def test_subject_prefixed_with_test(self, client):
        creds = self._mock_creds()
        mock_account = MagicMock()
        captured = {}
        def capture_send(account, subject, body, to, *args, **kwargs):
            captured['subject'] = subject
        with patch.object(email_app, 'credentials_exist', return_value=True), \
             patch.object(email_app, 'load_credentials', return_value=creds), \
             patch.object(email_app, 'connect_exchange', return_value=mock_account), \
             patch.object(email_app, 'exchange_send_email', side_effect=capture_send), \
             patch.object(email_app, 'prepare_html_for_email', return_value='<html/>'):
            client.post('/api/bulk/send-test', json={
                'template_html': '<p>test</p>',
                'row':     {},
                'mapping': {},
                'subject': 'Мой сабж',
            })
        assert captured.get('subject', '').startswith('[Тест]')
        assert 'Мой сабж' in captured.get('subject', '')

    def test_placeholder_substituted_in_body(self, client):
        creds = self._mock_creds()
        mock_account = MagicMock()
        captured = {}
        def capture_prepare(html):
            captured['html'] = html
            return html
        with patch.object(email_app, 'credentials_exist', return_value=True), \
             patch.object(email_app, 'load_credentials', return_value=creds), \
             patch.object(email_app, 'connect_exchange', return_value=mock_account), \
             patch.object(email_app, 'exchange_send_email'), \
             patch.object(email_app, 'prepare_html_for_email', side_effect=capture_prepare):
            client.post('/api/bulk/send-test', json={
                'template_html': 'Привет {{ФИО}}',
                'row':     {'ФИО': 'Иван'},
                'mapping': {'{{ФИО}}': 'ФИО'},
            })
        assert 'Иван' in captured.get('html', '')
        assert '{{ФИО}}' not in captured.get('html', '')

    def test_exchange_error_returns_503(self, client):
        with patch.object(email_app, 'credentials_exist', return_value=True), \
             patch.object(email_app, 'load_credentials', return_value=self._mock_creds()), \
             patch.object(email_app, 'connect_exchange',
                          side_effect=ConnectionError('Сервер недоступен')):
            resp = client.post('/api/bulk/send-test',
                               json={'template_html': '<p/>', 'row': {}, 'mapping': {}})
        assert resp.status_code == 503


# ─── /api/bulk/send/start + stream + cancel ──────────────────────────────────

class TestBulkSendStart:

    def _mock_creds(self):
        return {
            'server':     'exchange.test.ru',
            'username':   'user@test.ru',
            'password':   'pass',
            'from_email': 'sender@test.ru',
            'auth_type':  'ntlm',
        }

    def test_returns_job_id(self, client):
        creds = self._mock_creds()
        mock_account = MagicMock()
        with patch.object(email_app, 'credentials_exist', return_value=True), \
             patch.object(email_app, 'load_credentials', return_value=creds), \
             patch.object(email_app, 'connect_exchange', return_value=mock_account), \
             patch.object(email_app, 'exchange_send_email'), \
             patch.object(email_app, 'prepare_html_for_email', return_value='<html/>'):
            resp = client.post('/api/bulk/send/start', json={
                'template_html': '<p>{{ФИО}}</p>',
                'rows':    [{'ФИО': 'Иван', 'Email': 'ivan@test.ru'}],
                'mapping': {'{{ФИО}}': 'ФИО'},
                'subject': 'Тест',
                'email_column': 'Email',
            })
            # задача идёт в фоне: ждём её внутри подмен, иначе она допишет вызовы
            # в подмены следующего теста
            time.sleep(0.3)
        assert resp.status_code == 200
        data = resp.get_json()
        assert 'job_id' in data
        assert len(data['job_id']) == 16

    def test_cancel_unknown_job_returns_ok(self, client):
        # cancel всегда возвращает 200 — даже для несуществующих задач
        resp = client.post('/api/bulk/send/cancel/nonexistent_job_id_xyz')
        assert resp.status_code == 200
        assert resp.get_json()['ok'] is True

    def test_stream_unknown_job_returns_404(self, client):
        resp = client.get('/api/bulk/send/stream/nonexistent_job_id_xyz')
        assert resp.status_code == 404

    def test_draft_mode_uses_save_draft(self, client):
        creds = self._mock_creds()
        mock_account = MagicMock()
        with patch.object(email_app, 'credentials_exist', return_value=True), \
             patch.object(email_app, 'load_credentials', return_value=creds), \
             patch.object(email_app, 'connect_exchange', return_value=mock_account), \
             patch.object(email_app, 'exchange_save_draft') as mock_draft, \
             patch.object(email_app, 'exchange_send_email') as mock_send, \
             patch.object(email_app, 'prepare_html_for_email', return_value='<html/>'):
            resp = client.post('/api/bulk/send/start', json={
                'template_html': '<p>test</p>',
                'rows':    [{'ФИО': 'Иван', 'Email': 'ivan@test.ru'}],
                'mapping': {},
                'subject': 'Тест',
                'email_column': 'Email',
                'draft_mode': True,
            })
            assert resp.status_code == 200
            time.sleep(0.3)

        mock_send.assert_not_called()
        mock_draft.assert_called_once()

    def test_no_credentials_job_emits_error_event(self, client):
        with patch.object(email_app, 'credentials_exist', return_value=False):
            resp = client.post('/api/bulk/send/start', json={
                'template_html': '<p>test</p>',
                'rows':    [{'Email': 'ivan@test.ru'}],
                'mapping': {},
                'subject': 'Тест',
                'email_column': 'Email',
            })
        assert resp.status_code == 200
        job_id = resp.get_json()['job_id']

        time.sleep(0.3)
        stream_resp = client.get(f'/api/bulk/send/stream/{job_id}',
                                 headers={'Accept': 'text/event-stream'})
        raw = stream_resp.get_data(as_text=True)
        assert 'error' in raw or 'cancelled' in raw or 'done' in raw

    def test_send_at_passed_to_exchange_send_email(self, client):
        """send_at из запроса должен дойти до exchange_send_email как datetime."""
        import datetime as dt_mod
        creds = self._mock_creds()
        mock_account = MagicMock()
        captured = {}
        def capture_send(account, subject, body, to, *args, **kwargs):
            captured['send_at'] = kwargs.get('send_at')
        with patch.object(email_app, 'credentials_exist', return_value=True), \
             patch.object(email_app, 'load_credentials', return_value=creds), \
             patch.object(email_app, 'connect_exchange', return_value=mock_account), \
             patch.object(email_app, 'exchange_send_email', side_effect=capture_send), \
             patch.object(email_app, 'prepare_html_for_email', return_value='<html/>'):
            resp = client.post('/api/bulk/send/start', json={
                'template_html': '<p>test</p>',
                'rows':    [{'Email': 'ivan@test.ru'}],
                'mapping': {},
                'subject': 'Тест',
                'email_column': 'Email',
                'send_at': _future_iso(),
            })
            assert resp.status_code == 200
            time.sleep(0.4)

        assert isinstance(captured.get('send_at'), dt_mod.datetime)
        assert captured['send_at'].isoformat() == _future_iso()

    def _post_scheduled(self, client, extra, channel_patches=None):
        """Запускает рассылку из одной строки; возвращает (текст SSE, mock exchange_send_email)."""
        creds = self._mock_creds()
        payload = {
            'template_html': '<p>test</p>',
            'rows':    [{'Email': 'ivan@test.ru'}],
            'mapping': {},
            'subject': 'Тест',
            'email_column': 'Email',
        }
        payload.update(extra)
        with patch.object(email_app, 'credentials_exist', return_value=True),              patch.object(email_app, 'load_credentials', return_value=creds),              patch.object(email_app, 'connect_exchange', return_value=MagicMock()),              patch.object(email_app, 'connect_smtp', return_value=MagicMock()),              patch.object(email_app, 'smtp_send_email') as smtp_send,              patch.object(email_app, 'exchange_send_email') as send,              patch.object(email_app, 'exchange_save_draft') as draft,              patch.object(email_app, 'prepare_html_for_email', return_value='<html/>'):
            resp = client.post('/api/bulk/send/start', json=payload)
            assert resp.status_code == 200
            job_id = resp.get_json()['job_id']
            time.sleep(0.4)
            stream = client.get(f'/api/bulk/send/stream/{job_id}',
                                headers={'Accept': 'text/event-stream'})
            raw = stream.get_data(as_text=True)
        return raw, send, smtp_send, draft

    def test_invalid_send_at_aborts_instead_of_sending_immediately(self, client):
        """Некорректный send_at прерывает рассылку: письма не должны уйти сразу."""
        raw, send, smtp_send, _ = self._post_scheduled(client, {'send_at': 'not-a-date'})
        assert '"type": "error"' in raw
        send.assert_not_called()
        smtp_send.assert_not_called()

    def test_past_send_at_aborts(self, client):
        raw, send, _, _ = self._post_scheduled(client, {'send_at': _future_iso(days=-1)})
        assert '"type": "error"' in raw
        send.assert_not_called()

    def test_send_at_uses_client_timezone_for_future_check(self, client):
        """Локальное время в будущем по часовому поясу клиента не считается прошлым."""
        import datetime as dt_mod
        # 23:59 сегодня по UTC+14 — это ещё в будущем только для такого пояса
        soon_local = (dt_mod.datetime.now(dt_mod.timezone.utc).replace(tzinfo=None)
                      + dt_mod.timedelta(hours=14, minutes=30)).replace(microsecond=0)
        raw, send, _, _ = self._post_scheduled(
            client, {'send_at': soon_local.isoformat(), 'timezone': 14})
        assert '"type": "error"' not in raw
        send.assert_called_once()

    def test_send_at_with_smtp_channel_aborts(self, client):
        raw, send, smtp_send, _ = self._post_scheduled(
            client, {'send_at': _future_iso(), 'channel': 'smtp'})
        assert '"type": "error"' in raw
        send.assert_not_called()
        smtp_send.assert_not_called()

    def test_send_at_with_draft_mode_aborts(self, client):
        raw, send, _, draft = self._post_scheduled(
            client, {'send_at': _future_iso(), 'draft_mode': True})
        assert '"type": "error"' in raw
        send.assert_not_called()
        draft.assert_not_called()

    def test_send_at_comment_in_progress(self, client):
        """При send_at в прогрессе должно быть 'Запланировано', а не 'Отправлено'."""
        creds = self._mock_creds()
        mock_account = MagicMock()
        with patch.object(email_app, 'credentials_exist', return_value=True), \
             patch.object(email_app, 'load_credentials', return_value=creds), \
             patch.object(email_app, 'connect_exchange', return_value=mock_account), \
             patch.object(email_app, 'exchange_send_email'), \
             patch.object(email_app, 'prepare_html_for_email', return_value='<html/>'):
            resp = client.post('/api/bulk/send/start', json={
                'template_html': '<p>test</p>',
                'rows':    [{'Email': 'ivan@test.ru'}],
                'mapping': {},
                'subject': 'Тест',
                'email_column': 'Email',
                'send_at': _future_iso(),
            })
            job_id = resp.get_json()['job_id']
            time.sleep(0.4)
            stream_resp = client.get(f'/api/bulk/send/stream/{job_id}',
                                     headers={'Accept': 'text/event-stream'})
            raw = stream_resp.get_data(as_text=True)
        assert 'Запланировано' in raw


# ─── /api/bulk/send-test: SMTP channel + importance ─────────────────────────

class TestBulkSendTestSmtp:

    def _mock_creds(self):
        return {
            'server':          'exchange.test.ru',
            'username':        'user@test.ru',
            'password':        'pass',
            'from_email':      'sender@test.ru',
            'auth_type':       'ntlm',
            'smtp_host':       'mail.test.ru',
            'smtp_port':       587,
            'smtp_username':   'smtp_u',
            'smtp_password':   'smtp_p',
            'smtp_from_email': 'noreply@test.ru',
        }

    def test_smtp_channel_calls_smtp_send_email(self, client):
        mock_smtp = MagicMock()
        with patch.object(email_app, 'credentials_exist', return_value=True), \
             patch.object(email_app, 'load_credentials', return_value=self._mock_creds()), \
             patch.object(email_app, 'connect_smtp', return_value=mock_smtp), \
             patch.object(email_app, 'smtp_send_email') as mock_send, \
             patch.object(email_app, 'prepare_html_for_email', return_value='<html/>'):
            resp = client.post('/api/bulk/send-test', json={
                'template_html': '<p>Тест</p>', 'row': {}, 'mapping': {},
                'subject': 'Тест', 'channel': 'smtp',
            })
        assert resp.status_code == 200
        mock_send.assert_called_once()

    def test_smtp_channel_does_not_call_exchange(self, client):
        mock_smtp = MagicMock()
        with patch.object(email_app, 'credentials_exist', return_value=True), \
             patch.object(email_app, 'load_credentials', return_value=self._mock_creds()), \
             patch.object(email_app, 'connect_smtp', return_value=mock_smtp), \
             patch.object(email_app, 'smtp_send_email'), \
             patch.object(email_app, 'exchange_send_email') as mock_exch, \
             patch.object(email_app, 'prepare_html_for_email', return_value='<html/>'):
            client.post('/api/bulk/send-test', json={
                'template_html': '<p/>', 'row': {}, 'mapping': {}, 'channel': 'smtp',
            })
        mock_exch.assert_not_called()

    def test_smtp_channel_sends_to_from_email(self, client):
        captured = {}
        def cap(smtp, from_e, subj, body, to, *args, **kwargs):
            captured['to'] = to
        with patch.object(email_app, 'credentials_exist', return_value=True), \
             patch.object(email_app, 'load_credentials', return_value=self._mock_creds()), \
             patch.object(email_app, 'connect_smtp', return_value=MagicMock()), \
             patch.object(email_app, 'smtp_send_email', side_effect=cap), \
             patch.object(email_app, 'prepare_html_for_email', return_value='<html/>'):
            resp = client.post('/api/bulk/send-test', json={
                'template_html': '<p/>', 'row': {}, 'mapping': {}, 'channel': 'smtp',
            })
        assert resp.status_code == 200
        assert 'noreply@test.ru' in captured.get('to', [])

    def test_smtp_channel_importance_passed(self, client):
        captured = {}
        def cap(smtp, from_e, subj, body, to, *args, **kwargs):
            captured.update(kwargs)
        with patch.object(email_app, 'credentials_exist', return_value=True), \
             patch.object(email_app, 'load_credentials', return_value=self._mock_creds()), \
             patch.object(email_app, 'connect_smtp', return_value=MagicMock()), \
             patch.object(email_app, 'smtp_send_email', side_effect=cap), \
             patch.object(email_app, 'prepare_html_for_email', return_value='<html/>'):
            client.post('/api/bulk/send-test', json={
                'template_html': '<p/>', 'row': {}, 'mapping': {},
                'channel': 'smtp', 'importance': 'high',
            })
        assert captured.get('importance') == 'high'

    def test_smtp_channel_read_receipt_passed(self, client):
        captured = {}
        def cap(smtp, from_e, subj, body, to, *args, **kwargs):
            captured.update(kwargs)
        with patch.object(email_app, 'credentials_exist', return_value=True), \
             patch.object(email_app, 'load_credentials', return_value=self._mock_creds()), \
             patch.object(email_app, 'connect_smtp', return_value=MagicMock()), \
             patch.object(email_app, 'smtp_send_email', side_effect=cap), \
             patch.object(email_app, 'prepare_html_for_email', return_value='<html/>'):
            client.post('/api/bulk/send-test', json={
                'template_html': '<p/>', 'row': {}, 'mapping': {},
                'channel': 'smtp', 'read_receipt': True,
            })
        assert captured.get('read_receipt') is True

    def test_smtp_connection_error_returns_503(self, client):
        creds = self._mock_creds()
        with patch.object(email_app, 'credentials_exist', return_value=True), \
             patch.object(email_app, 'load_credentials', return_value=creds), \
             patch.object(email_app, 'connect_smtp',
                          side_effect=ConnectionError('Недоступен')):
            resp = client.post('/api/bulk/send-test', json={
                'template_html': '<p/>', 'row': {}, 'mapping': {}, 'channel': 'smtp',
            })
        assert resp.status_code == 503

    def test_smtp_not_configured_returns_401(self, client):
        creds = dict(self._mock_creds())
        creds['smtp_host'] = ''
        with patch.object(email_app, 'credentials_exist', return_value=True), \
             patch.object(email_app, 'load_credentials', return_value=creds):
            resp = client.post('/api/bulk/send-test', json={
                'template_html': '<p/>', 'row': {}, 'mapping': {}, 'channel': 'smtp',
            })
        assert resp.status_code == 401


# ─── /api/bulk/send/start: SMTP channel + importance ────────────────────────

class TestBulkSendStartSmtp:

    def _mock_creds(self):
        return {
            'server':            'exchange.test.ru',
            'username':          'user@test.ru',
            'password':          'pass',
            'from_email':        'sender@test.ru',
            'auth_type':         'ntlm',
            'smtp_host':         'mail.test.ru',
            'smtp_port':         587,
            'smtp_username':     'smtp_u',
            'smtp_password':     'smtp_p',
            'smtp_from_email':   'noreply@test.ru',
            'smtp_imap_enabled': False,
        }

    def test_smtp_channel_calls_smtp_send_email(self, client):
        mock_smtp = MagicMock()
        with patch.object(email_app, 'credentials_exist', return_value=True), \
             patch.object(email_app, 'load_credentials', return_value=self._mock_creds()), \
             patch.object(email_app, 'connect_smtp', return_value=mock_smtp), \
             patch.object(email_app, 'smtp_send_email', return_value=b'raw') as mock_send, \
             patch.object(email_app, 'exchange_send_email') as mock_exch, \
             patch.object(email_app, 'prepare_html_for_email', return_value='<html/>'):
            resp = client.post('/api/bulk/send/start', json={
                'template_html': '<p>{{ФИО}}</p>',
                'rows':    [{'ФИО': 'Иван', 'Email': 'ivan@test.ru'}],
                'mapping': {'{{ФИО}}': 'ФИО'},
                'subject': 'Тест', 'email_column': 'Email', 'channel': 'smtp',
            })
            assert resp.status_code == 200
            time.sleep(0.3)

        mock_send.assert_called_once()
        mock_exch.assert_not_called()

    def test_smtp_channel_importance_passed(self, client):
        captured = {}
        def cap(smtp, from_e, subj, body, to, *args, **kwargs):
            captured.update(kwargs)
            return b'raw'
        with patch.object(email_app, 'credentials_exist', return_value=True), \
             patch.object(email_app, 'load_credentials', return_value=self._mock_creds()), \
             patch.object(email_app, 'connect_smtp', return_value=MagicMock()), \
             patch.object(email_app, 'smtp_send_email', side_effect=cap), \
             patch.object(email_app, 'prepare_html_for_email', return_value='<html/>'):
            resp = client.post('/api/bulk/send/start', json={
                'template_html': '<p>test</p>',
                'rows':    [{'Email': 'ivan@test.ru'}],
                'mapping': {}, 'subject': 'Тест', 'email_column': 'Email',
                'channel': 'smtp', 'importance': 'high',
            })
            assert resp.status_code == 200
            time.sleep(0.3)

        assert captured.get('importance') == 'high'

    def test_smtp_channel_read_receipt_passed(self, client):
        captured = {}
        def cap(smtp, from_e, subj, body, to, *args, **kwargs):
            captured.update(kwargs)
            return b'raw'
        with patch.object(email_app, 'credentials_exist', return_value=True), \
             patch.object(email_app, 'load_credentials', return_value=self._mock_creds()), \
             patch.object(email_app, 'connect_smtp', return_value=MagicMock()), \
             patch.object(email_app, 'smtp_send_email', side_effect=cap), \
             patch.object(email_app, 'prepare_html_for_email', return_value='<html/>'):
            resp = client.post('/api/bulk/send/start', json={
                'template_html': '<p>test</p>',
                'rows':    [{'Email': 'ivan@test.ru'}],
                'mapping': {}, 'subject': 'Тест', 'email_column': 'Email',
                'channel': 'smtp', 'read_receipt': True,
            })
            assert resp.status_code == 200
            time.sleep(0.3)

        assert captured.get('read_receipt') is True

    def test_smtp_quits_after_sending(self, client):
        mock_smtp = MagicMock()
        with patch.object(email_app, 'credentials_exist', return_value=True), \
             patch.object(email_app, 'load_credentials', return_value=self._mock_creds()), \
             patch.object(email_app, 'connect_smtp', return_value=mock_smtp), \
             patch.object(email_app, 'smtp_send_email', return_value=b'raw'), \
             patch.object(email_app, 'prepare_html_for_email', return_value='<html/>'):
            resp = client.post('/api/bulk/send/start', json={
                'template_html': '<p>test</p>',
                'rows':    [{'Email': 'ivan@test.ru'}],
                'mapping': {}, 'subject': 'Тест', 'email_column': 'Email',
                'channel': 'smtp',
            })
            assert resp.status_code == 200
            time.sleep(0.3)

        mock_smtp.quit.assert_called_once()

    def test_smtp_imap_saves_sent(self, client):
        creds = dict(self._mock_creds())
        creds['smtp_imap_enabled'] = True
        creds['smtp_imap_host']    = 'mail.test.ru'
        creds['smtp_imap_port']    = 993
        mock_imap = MagicMock()
        with patch.object(email_app, 'credentials_exist', return_value=True), \
             patch.object(email_app, 'load_credentials', return_value=creds), \
             patch.object(email_app, 'connect_smtp', return_value=MagicMock()), \
             patch.object(email_app, 'connect_imap', return_value=mock_imap), \
             patch.object(email_app, 'smtp_send_email', return_value=b'raw_msg'), \
             patch.object(email_app, 'imap_save_sent') as mock_imap_save, \
             patch.object(email_app, 'prepare_html_for_email', return_value='<html/>'):
            resp = client.post('/api/bulk/send/start', json={
                'template_html': '<p>test</p>',
                'rows':    [{'Email': 'ivan@test.ru'}],
                'mapping': {}, 'subject': 'Тест', 'email_column': 'Email',
                'channel': 'smtp',
            })
            assert resp.status_code == 200
            time.sleep(0.4)

        mock_imap_save.assert_called_once_with(mock_imap, b'raw_msg')

    def test_exchange_importance_passed(self, client):
        creds = {
            'server': 'exchange.test.ru', 'username': 'u', 'password': 'p',
            'from_email': 'sender@test.ru', 'auth_type': 'ntlm',
        }
        captured = {}
        def cap(account, subject, body, to, *args, **kwargs):
            captured.update(kwargs)
        with patch.object(email_app, 'credentials_exist', return_value=True), \
             patch.object(email_app, 'load_credentials', return_value=creds), \
             patch.object(email_app, 'connect_exchange', return_value=MagicMock()), \
             patch.object(email_app, 'exchange_send_email', side_effect=cap), \
             patch.object(email_app, 'prepare_html_for_email', return_value='<html/>'):
            resp = client.post('/api/bulk/send/start', json={
                'template_html': '<p>test</p>',
                'rows':    [{'Email': 'ivan@test.ru'}],
                'mapping': {}, 'subject': 'Тест', 'email_column': 'Email',
                'importance': 'low',
            })
            assert resp.status_code == 200
            time.sleep(0.3)

        assert captured.get('importance') == 'low'

    def test_exchange_read_receipt_passed(self, client):
        creds = {
            'server': 'exchange.test.ru', 'username': 'u', 'password': 'p',
            'from_email': 'sender@test.ru', 'auth_type': 'ntlm',
        }
        captured = {}
        def cap(account, subject, body, to, *args, **kwargs):
            captured.update(kwargs)
        with patch.object(email_app, 'credentials_exist', return_value=True), \
             patch.object(email_app, 'load_credentials', return_value=creds), \
             patch.object(email_app, 'connect_exchange', return_value=MagicMock()), \
             patch.object(email_app, 'exchange_send_email', side_effect=cap), \
             patch.object(email_app, 'prepare_html_for_email', return_value='<html/>'):
            resp = client.post('/api/bulk/send/start', json={
                'template_html': '<p>test</p>',
                'rows':    [{'Email': 'ivan@test.ru'}],
                'mapping': {}, 'subject': 'Тест', 'email_column': 'Email',
                'read_receipt': True,
            })
            assert resp.status_code == 200
            time.sleep(0.3)

        assert captured.get('read_receipt') is True


# ── Attachments: name from template or from a table column ───────────────────

class TestResolveAttachment:
    MAPPING = {'{{ФИО}}': 'ФИО'}

    def test_finds_file_by_name_template(self, tmp_path):
        from routes.bulk_mail import _resolve_attachment
        (tmp_path / 'Попов Иван.docx').write_bytes(b'x')
        row = {'ФИО': 'Попов Иван'}
        found = _resolve_attachment(str(tmp_path), '{{ФИО}}.docx', self.MAPPING, row)
        assert found == str(tmp_path / 'Попов Иван.docx')

    def test_column_mode_takes_file_name_from_row(self, tmp_path):
        from routes.bulk_mail import _resolve_attachment
        (tmp_path / 'Условия активации.docx').write_bytes(b'x')
        row = {'ФИО': 'Попов Иван', 'Файл': 'Условия активации.docx'}
        found = _resolve_attachment(str(tmp_path), '{{ФИО}}.docx', self.MAPPING, row, 'Файл')
        assert found == str(tmp_path / 'Условия активации.docx')

    def test_matches_ignoring_case_yo_and_extra_spaces(self, tmp_path):
        from routes.bulk_mail import _resolve_attachment
        (tmp_path / 'Всё в одном.docx').write_bytes(b'x')
        row = {'Файл': '  все  В ОДНОМ.DOCX '}
        found = _resolve_attachment(str(tmp_path), '', {}, row, 'Файл')
        assert found == str(tmp_path / 'Всё в одном.docx')

    def test_returns_none_when_file_is_missing(self, tmp_path):
        from routes.bulk_mail import _resolve_attachment
        row = {'Файл': 'нет такого.docx'}
        assert _resolve_attachment(str(tmp_path), '', {}, row, 'Файл') is None

    def test_returns_none_when_column_cell_is_empty(self, tmp_path):
        from routes.bulk_mail import _resolve_attachment
        assert _resolve_attachment(str(tmp_path), '', {}, {'Файл': ''}, 'Файл') is None

    def test_path_separators_in_cell_cannot_escape_folder(self, tmp_path):
        from routes.bulk_mail import _resolve_attachment
        (tmp_path.parent / 'secret.docx').write_bytes(b'x')
        row = {'Файл': '../secret.docx'}
        assert _resolve_attachment(str(tmp_path), '', {}, row, 'Файл') is None

    def test_cell_without_extension_matches_file_stem(self, tmp_path):
        from routes.bulk_mail import _resolve_attachment
        (tmp_path / 'Условия активации Мерчшоп.docx').write_bytes(b'x')
        row = {'Файл': 'Условия активации Мерчшоп'}
        found = _resolve_attachment(str(tmp_path), '', {}, row, 'Файл')
        assert found == str(tmp_path / 'Условия активации Мерчшоп.docx')

    def test_template_placeholder_not_in_mapping_is_resolved_by_column_name(self, tmp_path):
        from routes.bulk_mail import _resolve_attachment
        (tmp_path / 'Лист 1.docx').write_bytes(b'x')
        row = {'ФИО': 'Попов Иван', 'Файл': 'Лист 1'}
        # {{Файл}} is used only in the file name, so the letter-body mapping lacks it
        found = _resolve_attachment(str(tmp_path), '{{файл}}.docx', self.MAPPING, row)
        assert found == str(tmp_path / 'Лист 1.docx')

    def test_unknown_placeholder_in_template_is_left_unresolved(self, tmp_path):
        from routes.bulk_mail import _resolve_attachment
        assert _resolve_attachment(str(tmp_path), '{{Нет}}.docx', {}, {'ФИО': 'x'}) is None

    def test_ambiguous_stem_attaches_nothing(self, tmp_path):
        from routes.bulk_mail import _resolve_attachment
        (tmp_path / 'Договор.docx').write_bytes(b'x')
        (tmp_path / 'Договор.pdf').write_bytes(b'x')
        row = {'Файл': 'Договор'}
        # .docx and .pdf share the stem: never guess which one to send
        assert _resolve_attachment(str(tmp_path), '', {}, row, 'Файл') is None

    def test_exact_name_wins_over_ambiguous_stem(self, tmp_path):
        from routes.bulk_mail import _resolve_attachment
        (tmp_path / 'Договор.docx').write_bytes(b'x')
        (tmp_path / 'Договор.pdf').write_bytes(b'x')
        row = {'Файл': 'Договор.pdf'}
        found = _resolve_attachment(str(tmp_path), '', {}, row, 'Файл')
        assert found == str(tmp_path / 'Договор.pdf')

    def test_folder_is_listed_once_with_cache(self, tmp_path):
        from routes.bulk_mail import _resolve_attachment
        (tmp_path / 'Лист.docx').write_bytes(b'x')
        cache = {}
        with patch('routes.bulk_mail.os.listdir', wraps=os.listdir) as listing:
            for _ in range(3):
                _resolve_attachment(str(tmp_path), '', {}, {'Файл': 'лист'}, 'Файл', cache)
        assert listing.call_count == 1


# ─── Журнал рассылки по SMTP: события, ответ сервера, защита потока ───────────

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))
import queue as _queue
from smtp_sender import SentMessage
from routes.bulk_mail import _run_bulk_send, _run_bulk_send_guarded


def _drain(q):
    events = []
    while True:
        try:
            events.append(q.get_nowait())
        except _queue.Empty:
            return events


class TestBulkSendSmtpEvents:

    CREDS = {
        'smtp_host': 'mail.test.ru', 'smtp_port': 25,
        'smtp_username': 'u', 'smtp_password': 'p',
        'smtp_from_email': 'opros@test.ru',
    }

    def _run(self, rows, creds=None, send_side_effect=None, imap_side_effect=None, **extra):
        q = _queue.Queue()
        data = {
            'template_html': '<p>x</p>', 'rows': rows, 'mapping': {},
            'subject': 'S', 'email_column': 'Email', 'channel': 'smtp',
            **extra,
        }
        sent_ok = SentMessage(b'raw', message_id='<id1@test.ru>',
                              server_reply='250 ok: queued as 42')
        with patch.object(email_app, 'credentials_exist', return_value=True), \
             patch.object(email_app, 'load_credentials', return_value=creds or self.CREDS), \
             patch.object(email_app, 'connect_smtp', return_value=MagicMock()), \
             patch.object(email_app, 'connect_imap', side_effect=imap_side_effect,
                          return_value=MagicMock()), \
             patch.object(email_app, 'imap_save_sent', return_value=True), \
             patch.object(email_app, 'smtp_send_email',
                          side_effect=send_side_effect, return_value=sent_ok), \
             patch.object(email_app, 'prepare_html_for_email', return_value='<html/>'):
            _run_bulk_send('job', data, q, threading.Event())
        return _drain(q)

    def test_progress_carries_message_id_and_server_reply(self):
        events = self._run([{'Email': 'a@t.ru'}])
        row = next(e for e in events if e['type'] == 'progress')
        assert row['message_id'] == '<id1@test.ru>'
        assert row['server_reply'] == '250 ok: queued as 42'
        assert row['comment'].startswith('Принято сервером')
        assert row['time']

    def test_status_events_precede_progress(self):
        events = self._run([{'Email': 'a@t.ru'}])
        types = [e['type'] for e in events]
        assert types[0] == 'status'
        assert 'Подключаюсь' in events[0]['message']
        assert types.index('status') < types.index('progress')
        assert any('mail.test.ru:25' in e.get('message', '') for e in events)

    def test_refused_recipient_is_error_and_run_continues(self):
        ok = SentMessage(b'raw', message_id='<id2@test.ru>', server_reply='250 ok')
        events = self._run(
            [{'Email': 'bad@t.ru'}, {'Email': 'good@t.ru'}],
            send_side_effect=[ValueError('Адрес отклонён сервером: bad@t.ru: 550 no user'), ok],
        )
        rows = [e for e in events if e['type'] == 'progress']
        assert [r['status'] for r in rows] == ['error', 'sent']
        assert '550' in rows[0]['comment']
        done = events[-1]
        assert (done['type'], done['sent'], done['errors']) == ('done', 1, 1)

    def test_imap_failure_emits_warning_but_sends(self):
        creds = {**self.CREDS, 'smtp_imap_enabled': True,
                 'smtp_imap_host': 'mail.test.ru', 'smtp_imap_port': 993}
        events = self._run([{'Email': 'a@t.ru'}], creds=creds,
                           imap_side_effect=ConnectionError('IMAP сервер недоступен'))
        warnings = [e for e in events if e['type'] == 'warning']
        assert warnings and 'Отправленные' in warnings[0]['message']
        assert any(e['type'] == 'progress' and e['status'] == 'sent' for e in events)

    def test_unsaved_copy_is_reported_in_row_comment(self):
        creds = {**self.CREDS, 'smtp_imap_enabled': True,
                 'smtp_imap_host': 'mail.test.ru', 'smtp_imap_port': 143}
        q = _queue.Queue()
        data = {'template_html': '<p/>', 'rows': [{'Email': 'a@t.ru'}], 'mapping': {},
                'subject': 'S', 'email_column': 'Email', 'channel': 'smtp'}
        with patch.object(email_app, 'credentials_exist', return_value=True), \
             patch.object(email_app, 'load_credentials', return_value=creds), \
             patch.object(email_app, 'connect_smtp', return_value=MagicMock()), \
             patch.object(email_app, 'connect_imap', return_value=MagicMock()), \
             patch.object(email_app, 'imap_save_sent', return_value=False), \
             patch.object(email_app, 'smtp_send_email',
                          return_value=SentMessage(b'r', '<i@t.ru>', '250 ok')), \
             patch.object(email_app, 'prepare_html_for_email', return_value='<html/>'):
            _run_bulk_send('job', data, q, threading.Event())
        row = next(e for e in _drain(q) if e['type'] == 'progress')
        assert 'не сохранена' in row['comment']

    def test_crash_before_first_row_becomes_error_event(self):
        q = _queue.Queue()
        # delay=None роняет float(None) ещё до подключения — раньше поток умирал молча
        _run_bulk_send_guarded('job', {'rows': [], 'delay': None, 'channel': 'smtp'},
                               q, threading.Event())
        events = _drain(q)
        assert events and events[-1]['type'] == 'error'
        assert 'Внутренняя ошибка' in events[-1]['message']

    def test_send_test_returns_message_id(self, client):
        creds = {**self.CREDS}
        with patch.object(email_app, 'credentials_exist', return_value=True), \
             patch.object(email_app, 'load_credentials', return_value=creds), \
             patch.object(email_app, 'connect_smtp', return_value=MagicMock()), \
             patch.object(email_app, 'smtp_send_email',
                          return_value=SentMessage(b'r', '<t@test.ru>', '250 queued')), \
             patch.object(email_app, 'prepare_html_for_email', return_value='<html/>'):
            resp = client.post('/api/bulk/send-test', json={
                'template_html': '<p/>', 'row': {}, 'mapping': {}, 'channel': 'smtp',
            })
        data = resp.get_json()
        assert data['message_id'] == '<t@test.ru>'
        assert data['server_reply'] == '250 queued'


class TestEffectiveMapping:
    """Несопоставленные плейсхолдеры подставляются пустым значением, а не остаются буквально."""

    def test_unmapped_placeholder_becomes_empty(self):
        from routes.bulk_mail import _effective_mapping
        data = {'mapping': {'{{ФИО}}': 'ФИО'}, 'placeholders': ['{{ФИО}}', '{{Город}}']}
        mapping = _effective_mapping(data)
        assert mapping == {'{{ФИО}}': 'ФИО', '{{Город}}': ''}
        assert _substitute('Привет, {{ФИО}} из {{Город}}!', mapping, {'ФИО': 'Иван'}) == 'Привет, Иван из !'

    def test_unmapped_in_subject_does_not_stay_literal(self):
        from routes.bulk_mail import _effective_mapping
        mapping = _effective_mapping({'mapping': {}, 'placeholders': ['{{Тема}}']})
        assert _substitute('Для {{Тема}}', mapping, {}) == 'Для '

    def test_old_client_without_placeholders_keeps_mapping(self):
        from routes.bulk_mail import _effective_mapping
        assert _effective_mapping({'mapping': {'{{A}}': 'a'}}) == {'{{A}}': 'a'}
        assert _effective_mapping({}) == {}

    def test_input_mapping_is_not_mutated(self):
        from routes.bulk_mail import _effective_mapping
        original = {'{{A}}': 'a'}
        _effective_mapping({'mapping': original, 'placeholders': ['{{B}}']})
        assert original == {'{{A}}': 'a'}

    def test_non_string_placeholders_are_ignored(self):
        from routes.bulk_mail import _effective_mapping
        assert _effective_mapping({'placeholders': [None, 5, '{{X}}']}) == {'{{X}}': ''}

    def test_file_name_with_unmapped_placeholder_is_empty_part(self, tmp_path):
        from routes.bulk_mail import _effective_mapping, _resolve_attachment
        (tmp_path / '.pdf').write_text('x')
        mapping = _effective_mapping({'placeholders': ['{{Файл}}']})
        assert _resolve_attachment(str(tmp_path), '{{Файл}}.pdf', mapping, {'Файл': 'doc'}) is not None


# ─── Вложения: общие и индивидуальные, загрузка, проверка до отправки ─────────

from routes import bulk_attachments as _att_mod


@pytest.fixture
def attach_store(tmp_path, monkeypatch):
    monkeypatch.setattr(_att_mod, 'STORE_DIR', str(tmp_path / 'store'))
    return tmp_path


class TestAttachmentRoutes:
    def _upload(self, client, files, **form):
        import io as _io
        data = {'files': [(_io.BytesIO(body), name) for name, body in files], **form}
        return client.post('/api/bulk/attach/upload', data=data, content_type='multipart/form-data')

    def test_limits_describe_size_and_blocked_types(self, client):
        data = client.get('/api/bulk/attach/limits').get_json()
        assert data['limit_bytes'] == 10 * 1024 * 1024
        assert data['budget_bytes'] < data['limit_bytes']
        assert '.exe' in data['blocked']
        assert data['max_files'] == _att_mod.MAX_COMMON_FILES

    def test_upload_several_files_at_once(self, client, attach_store):
        data = self._upload(client, [('a.pdf', b'111'), ('b.docx', b'22')]).get_json()
        assert [f['name'] for f in data['files']] == ['a.pdf', 'b.docx']
        assert data['rejected'] == []
        assert all(_att_mod.store_path(f['token']) for f in data['files'])

    def test_blocked_file_is_rejected_others_are_kept(self, client, attach_store):
        data = self._upload(client, [('ok.pdf', b'1'), ('virus.exe', b'2')]).get_json()
        assert [f['name'] for f in data['files']] == ['ok.pdf']
        assert data['rejected'][0]['name'] == 'virus.exe'
        assert '.exe' in data['rejected'][0]['error']

    def test_file_over_budget_is_rejected(self, client, attach_store):
        big = b'x' * (_att_mod.files_budget(_att_mod.message_limit_bytes()) + 1)
        data = self._upload(client, [('big.pdf', big)]).get_json()
        assert data['files'] == []
        assert 'Не помещается' in data['rejected'][0]['error']

    def test_existing_bytes_count_toward_the_budget(self, client, attach_store):
        budget = _att_mod.files_budget(_att_mod.message_limit_bytes())
        data = self._upload(client, [('a.pdf', b'x' * 1000)], existing_bytes=str(budget - 10)).get_json()
        assert data['files'] == []

    def test_no_files_is_400(self, client):
        resp = client.post('/api/bulk/attach/upload', data={}, content_type='multipart/form-data')
        assert resp.status_code == 400

    def test_delete_removes_the_file(self, client, attach_store):
        token = self._upload(client, [('a.pdf', b'1')]).get_json()['files'][0]['token']
        assert client.post('/api/bulk/attach/delete', json={'token': token}).get_json()['ok'] is True
        assert _att_mod.store_path(token) is None

    def test_preflight_reports_missing_files(self, client, attach_store):
        folder = attach_store / 'files'
        folder.mkdir()
        (folder / 'Иван.pdf').write_bytes(b'x')
        resp = client.post('/api/bulk/preflight', json={
            'rows': [{'ФИО': 'Иван', 'Email': 'i@x.ru'}, {'ФИО': 'Пётр', 'Email': 'p@x.ru'}],
            'mapping': {'{{ФИО}}': 'ФИО'}, 'email_column': 'Email',
            'attachments': [{'kind': 'individual', 'folder': str(folder), 'mode': 'template',
                             'template': '{{ФИО}}.pdf', 'missing': 'skip'}],
        })
        entry = resp.get_json()['attachments'][0]
        assert (entry['found'], entry['missing']) == (1, 1)
        assert entry['problems'][0]['expected'] == 'Пётр.pdf'

    def test_preflight_without_rows_is_400(self, client):
        assert client.post('/api/bulk/preflight', json={}).status_code == 400


class TestBulkSendAttachments:
    CREDS = {'server': 'x', 'username': 'u', 'password': 'p', 'from_email': 's@t.ru', 'auth_type': 'ntlm'}

    def _run(self, rows, **extra):
        q = _queue.Queue()
        data = {'template_html': '<p>{{ФИО}}</p>', 'rows': rows, 'mapping': {'{{ФИО}}': 'ФИО'},
                'subject': 'S', 'email_column': 'Email', **extra}
        with patch.object(email_app, 'credentials_exist', return_value=True), \
             patch.object(email_app, 'load_credentials', return_value=self.CREDS), \
             patch.object(email_app, 'connect_exchange', return_value=MagicMock()), \
             patch.object(email_app, 'exchange_send_email') as send, \
             patch.object(email_app, 'log_send'), \
             patch.object(email_app, 'prepare_html_for_email', return_value='<html/>'):
            _run_bulk_send('job', data, q, threading.Event())
        return _drain(q), send

    def individual(self, folder, missing='send', template='{{ФИО}}.pdf'):
        return {'kind': 'individual', 'folder': str(folder), 'mode': 'template',
                'template': template, 'missing': missing}

    def test_common_and_individual_files_go_in_one_letter(self, attach_store):
        folder = attach_store / 'f'
        folder.mkdir()
        (folder / 'Иван.pdf').write_bytes(b'personal')
        common = _att_mod.save_upload('Общий.docx', b'shared')
        events, send = self._run(
            [{'ФИО': 'Иван', 'Email': 'i@x.ru'}],
            attachments=[{'kind': 'common', 'files': [common['token']]}, self.individual(folder)])
        names = [a['name'] for a in send.call_args.kwargs['attachments']]
        assert names == ['Общий.docx', 'Иван.pdf']
        assert events[-1]['sent'] == 1

    def test_several_common_files(self, attach_store):
        tokens = [_att_mod.save_upload(n, b'x')['token'] for n in ('a.pdf', 'b.pdf', 'c.pdf')]
        _events, send = self._run([{'ФИО': 'Иван', 'Email': 'i@x.ru'}],
                                  attachments=[{'kind': 'common', 'files': tokens}])
        assert [a['name'] for a in send.call_args.kwargs['attachments']] == ['a.pdf', 'b.pdf', 'c.pdf']

    def test_missing_individual_file_sends_without_it_and_says_so(self, attach_store):
        folder = attach_store / 'f'
        folder.mkdir()
        common = _att_mod.save_upload('Общий.docx', b'shared')
        events, send = self._run(
            [{'ФИО': 'Пётр', 'Email': 'p@x.ru'}],
            attachments=[{'kind': 'common', 'files': [common['token']]}, self.individual(folder)])
        assert [a['name'] for a in send.call_args.kwargs['attachments']] == ['Общий.docx']
        row = next(e for e in events if e['type'] == 'progress')
        assert row['status'] == 'sent'
        assert 'Пётр.pdf' in row['comment'] and 'без вложения' in row['comment']

    def test_skip_policy_skips_the_row(self, attach_store):
        folder = attach_store / 'f'
        folder.mkdir()
        events, send = self._run([{'ФИО': 'Пётр', 'Email': 'p@x.ru'}],
                                 attachments=[self.individual(folder, 'skip')])
        send.assert_not_called()
        row = next(e for e in events if e['type'] == 'progress')
        assert row['status'] == 'skip'
        assert 'Пропущено' in row['comment']

    def test_stop_policy_stops_the_mailing(self, attach_store):
        folder = attach_store / 'f'
        folder.mkdir()
        (folder / 'Иван.pdf').write_bytes(b'x')
        events, send = self._run(
            [{'ФИО': 'Иван', 'Email': 'i@x.ru'}, {'ФИО': 'Пётр', 'Email': 'p@x.ru'},
             {'ФИО': 'Анна', 'Email': 'a@x.ru'}],
            attachments=[self.individual(folder, 'stop')])
        assert send.call_count == 1
        assert events[-1]['type'] == 'cancelled'
        assert 'Пётр.pdf' in events[-1]['message']

    def test_strictest_policy_wins_between_two_attachments(self, attach_store):
        folder = attach_store / 'f'
        folder.mkdir()
        (folder / 'Иван.pdf').write_bytes(b'x')
        _events, send = self._run(
            [{'ФИО': 'Иван', 'Email': 'i@x.ru'}],
            attachments=[self.individual(folder, 'send'),
                         self.individual(folder, 'skip', '{{ФИО}} акт.pdf')])
        send.assert_not_called()

    def test_row_over_the_limit_is_an_error_not_a_server_rejection(self, attach_store, monkeypatch):
        big = _att_mod.save_upload('big.pdf', b'x' * 5000)
        monkeypatch.setattr(_att_mod, 'message_limit_bytes',
                            lambda *a, **k: _att_mod.estimated_message_bytes(1000))
        events, send = self._run([{'ФИО': 'Иван', 'Email': 'i@x.ru'}],
                                 attachments=[{'kind': 'common', 'files': [big['token']]}])
        send.assert_not_called()
        row = next(e for e in events if e['type'] == 'progress')
        assert row['status'] == 'error'
        assert 'больше допустимых' in row['comment']

    def test_vanished_common_file_stops_before_any_letter(self, attach_store):
        events, send = self._run([{'ФИО': 'Иван', 'Email': 'i@x.ru'}],
                                 attachments=[{'kind': 'common', 'files': ['f' * 32]}])
        send.assert_not_called()
        assert events[-1]['type'] == 'error'
        assert 'заново' in events[-1]['message']

    def test_old_client_fields_still_work(self, attach_store):
        folder = attach_store / 'f'
        folder.mkdir()
        (folder / 'Иван.pdf').write_bytes(b'x')
        _events, send = self._run(
            [{'ФИО': 'Иван', 'Email': 'i@x.ru'}],
            attach_enabled=True, attach_folder=str(folder), attach_template='{{ФИО}}.pdf',
            attach_mode='template', attach_missing='send')
        assert [a['name'] for a in send.call_args.kwargs['attachments']] == ['Иван.pdf']

    def test_unmapped_placeholder_in_file_name_gives_empty_part(self, attach_store):
        folder = attach_store / 'f'
        folder.mkdir()
        (folder / 'Отчёт .pdf').write_bytes(b'x')
        _events, send = self._run(
            [{'ФИО': 'Иван', 'Email': 'i@x.ru'}], placeholders=['{{Дата}}'],
            attachments=[self.individual(folder, template='Отчёт {{Дата}}.pdf')])
        assert [a['name'] for a in send.call_args.kwargs['attachments']] == ['Отчёт .pdf']
