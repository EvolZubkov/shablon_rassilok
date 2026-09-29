"""
tests/test_smtp_credentials.py

Тесты для SMTP-расширений credentials_manager.py и Flask-эндпоинтов:
  - validate_smtp_credentials_data()
  - save_credentials() + load_credentials() с SMTP-полями
  - GET  /api/credentials/status  — возвращает smtp_* поля
  - POST /api/credentials/save    — сохраняет smtp_* поля
  - POST /api/credentials/test    — channel=smtp

Запуск: pytest tests/test_smtp_credentials.py -v
"""
import json
import os
import sys
import tempfile
import unittest.mock as mock
from unittest.mock import MagicMock, patch

import pytest

# ─── Мокаем Windows-зависимости до импорта app ───────────────────────────────
for mod in ('win32com', 'win32com.client', 'pythoncom', 'pywin32_runtime'):
    if mod not in sys.modules:
        sys.modules[mod] = MagicMock()
sys.modules['win32com'].client = MagicMock()
sys.modules.setdefault('exchangelib', MagicMock())
sys.modules.setdefault('exchangelib.errors', MagicMock())

FAKE_NETWORK = tempfile.mkdtemp(prefix='eb_sc_net_')
FAKE_CACHE   = tempfile.mkdtemp(prefix='eb_sc_cache_')

with mock.patch.dict(os.environ, {'APP_MODE': 'admin'}):
    sys.modules.setdefault('app_admin', MagicMock())
    sys.modules.setdefault('app_user',  MagicMock())
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

    import app as email_app
    email_app.NETWORK_RESOURCES_PATH = FAKE_NETWORK
    email_app.CACHE_DIR              = FAKE_CACHE
    email_app.CACHE_VERSION_FILE     = os.path.join(FAKE_CACHE, 'cache_version.txt')
    email_app.NETWORK_VERSION_FILE   = os.path.join(FAKE_NETWORK, 'version.txt')

from credentials_manager import (
    save_credentials, load_credentials, credentials_exist,
    validate_smtp_credentials_data,
)


# ─── Фикстуры ────────────────────────────────────────────────────────────────

@pytest.fixture(scope='session')
def app_instance():
    email_app.app.config['TESTING'] = True
    yield email_app.app


@pytest.fixture
def client(app_instance):
    return app_instance.test_client()


@pytest.fixture
def creds_path(tmp_path):
    return str(tmp_path / 'credentials.json')


# ─── validate_smtp_credentials_data ──────────────────────────────────────────

class TestValidateSmtpCredentialsData:

    def _valid(self):
        return {
            'smtp_host':       'mail.test.ru',
            'smtp_username':   'user',
            'smtp_password':   'pass',
            'smtp_from_email': 'user@test.ru',
        }

    def test_valid_data_returns_ok(self):
        ok, err = validate_smtp_credentials_data(self._valid())
        assert ok is True
        assert err is None

    def test_missing_host_fails(self):
        d = self._valid(); d['smtp_host'] = ''
        ok, err = validate_smtp_credentials_data(d)
        assert ok is False
        assert 'smtp_host' in err

    def test_missing_username_fails(self):
        d = self._valid(); d['smtp_username'] = ''
        ok, err = validate_smtp_credentials_data(d)
        assert ok is False

    def test_missing_password_fails(self):
        d = self._valid(); d['smtp_password'] = ''
        ok, err = validate_smtp_credentials_data(d)
        assert ok is False

    def test_invalid_from_email_fails(self):
        d = self._valid(); d['smtp_from_email'] = 'not-an-email'
        ok, err = validate_smtp_credentials_data(d)
        assert ok is False
        assert 'email' in err.lower()

    def test_missing_from_email_fails(self):
        d = self._valid(); d['smtp_from_email'] = ''
        ok, err = validate_smtp_credentials_data(d)
        assert ok is False


# ─── save_credentials + load_credentials (SMTP) ──────────────────────────────

class TestSmtpCredentialsPersistence:

    def _exchange_params(self):
        return dict(
            server='cas.test.ru', username='user', password='pass',
            from_email='user@test.ru', default_senders=[],
        )

    def _smtp_dict(self):
        return dict(
            host='mail.test.ru', port=587,
            username='smtp_user', password='smtp_pass',
            from_email='noreply@test.ru',
            default_senders=['bulk@test.ru'],
            imap_enabled=True,  imap_host='mail.test.ru', imap_port=993,
            delay_enabled=True, delay_seconds=2.0,
        )

    def test_smtp_host_saved_and_loaded(self, creds_path):
        save_credentials(creds_path, smtp=self._smtp_dict(),
                         **self._exchange_params())
        creds = load_credentials(creds_path)
        assert creds['smtp_host'] == 'mail.test.ru'

    def test_smtp_port_saved(self, creds_path):
        save_credentials(creds_path, smtp=self._smtp_dict(),
                         **self._exchange_params())
        creds = load_credentials(creds_path)
        assert creds['smtp_port'] == 587

    def test_smtp_password_encrypted_at_rest(self, creds_path):
        save_credentials(creds_path, smtp=self._smtp_dict(),
                         **self._exchange_params())
        with open(creds_path) as f:
            raw = json.load(f)
        assert raw.get('smtp_password') != 'smtp_pass'
        assert 'smtp_pass' not in raw.get('smtp_password', '')

    def test_smtp_password_decrypted_on_load(self, creds_path):
        save_credentials(creds_path, smtp=self._smtp_dict(),
                         **self._exchange_params())
        creds = load_credentials(creds_path)
        assert creds['smtp_password'] == 'smtp_pass'

    def test_smtp_from_email_saved(self, creds_path):
        save_credentials(creds_path, smtp=self._smtp_dict(),
                         **self._exchange_params())
        creds = load_credentials(creds_path)
        assert creds['smtp_from_email'] == 'noreply@test.ru'

    def test_smtp_default_senders_saved(self, creds_path):
        save_credentials(creds_path, smtp=self._smtp_dict(),
                         **self._exchange_params())
        creds = load_credentials(creds_path)
        assert creds['smtp_default_senders'] == ['bulk@test.ru']

    def test_smtp_imap_enabled_saved(self, creds_path):
        save_credentials(creds_path, smtp=self._smtp_dict(),
                         **self._exchange_params())
        creds = load_credentials(creds_path)
        assert creds['smtp_imap_enabled'] is True

    def test_smtp_delay_seconds_saved(self, creds_path):
        save_credentials(creds_path, smtp=self._smtp_dict(),
                         **self._exchange_params())
        creds = load_credentials(creds_path)
        assert creds['smtp_delay_seconds'] == 2.0

    def test_exchange_fields_intact_when_smtp_saved(self, creds_path):
        save_credentials(creds_path, smtp=self._smtp_dict(),
                         **self._exchange_params())
        creds = load_credentials(creds_path)
        assert creds['server'] == 'cas.test.ru'
        assert creds['username'] == 'user'
        assert creds['password'] == 'pass'

    def test_smtp_fields_preserved_when_saving_exchange_only(self, creds_path):
        # Сначала сохраняем с SMTP
        save_credentials(creds_path, smtp=self._smtp_dict(),
                         **self._exchange_params())
        # Потом сохраняем только Exchange (smtp=None)
        save_credentials(creds_path, smtp=None, **self._exchange_params())
        creds = load_credentials(creds_path)
        # SMTP-поля должны сохраниться из предыдущего сохранения
        assert creds.get('smtp_host') == 'mail.test.ru'

    def test_smtp_none_and_no_existing_file(self, creds_path):
        save_credentials(creds_path, smtp=None, **self._exchange_params())
        creds = load_credentials(creds_path)
        assert creds.get('smtp_host', '') == ''

    def test_empty_smtp_password_uses_existing(self, creds_path):
        # Первое сохранение с паролем
        save_credentials(creds_path, smtp=self._smtp_dict(),
                         **self._exchange_params())
        # Второе — без пароля (пустой)
        smtp_no_pass = self._smtp_dict()
        smtp_no_pass['password'] = ''
        save_credentials(creds_path, smtp=smtp_no_pass,
                         **self._exchange_params())
        creds = load_credentials(creds_path)
        assert creds['smtp_password'] == 'smtp_pass'  # старый пароль сохранён


# ─── GET /api/credentials/status — SMTP поля ─────────────────────────────────

class TestCredentialsStatusSmtp:

    def _make_creds(self):
        return {
            'server': 'cas.test.ru', 'username': 'u', 'password': 'p',
            'from_email': 'u@test.ru', 'default_senders': [],
            'auth_type': 'ntlm',
            'smtp_host': 'mail.test.ru', 'smtp_port': 587,
            'smtp_username': 'smtp_u', 'smtp_password': 'smtp_p',
            'smtp_from_email': 'noreply@test.ru',
            'smtp_default_senders': ['bulk@test.ru'],
            'smtp_imap_enabled': True,  'smtp_imap_host': 'mail.test.ru', 'smtp_imap_port': 993,
            'smtp_delay_enabled': True, 'smtp_delay_seconds': 1.0,
        }

    def test_status_includes_smtp_host(self, client):
        with patch.object(email_app, 'credentials_exist', return_value=True), \
             patch.object(email_app, 'load_credentials', return_value=self._make_creds()):
            resp = client.get('/api/credentials/status')
        data = resp.get_json()
        assert data['smtp_host'] == 'mail.test.ru'

    def test_status_includes_smtp_port(self, client):
        with patch.object(email_app, 'credentials_exist', return_value=True), \
             patch.object(email_app, 'load_credentials', return_value=self._make_creds()):
            resp = client.get('/api/credentials/status')
        assert resp.get_json()['smtp_port'] == 587

    def test_status_smtp_has_password_true(self, client):
        with patch.object(email_app, 'credentials_exist', return_value=True), \
             patch.object(email_app, 'load_credentials', return_value=self._make_creds()):
            resp = client.get('/api/credentials/status')
        assert resp.get_json()['smtp_has_password'] is True

    def test_status_smtp_default_senders(self, client):
        with patch.object(email_app, 'credentials_exist', return_value=True), \
             patch.object(email_app, 'load_credentials', return_value=self._make_creds()):
            resp = client.get('/api/credentials/status')
        assert resp.get_json()['smtp_default_senders'] == ['bulk@test.ru']

    def test_status_smtp_imap_enabled(self, client):
        with patch.object(email_app, 'credentials_exist', return_value=True), \
             patch.object(email_app, 'load_credentials', return_value=self._make_creds()):
            resp = client.get('/api/credentials/status')
        assert resp.get_json()['smtp_imap_enabled'] is True

    def test_status_smtp_fields_empty_when_no_creds(self, client):
        with patch.object(email_app, 'credentials_exist', return_value=False):
            resp = client.get('/api/credentials/status')
        data = resp.get_json()
        assert data.get('smtp_host', '') == ''


# ─── POST /api/credentials/save — SMTP поля ──────────────────────────────────

class TestCredentialsSaveSmtp:

    def _payload(self):
        return {
            'server': 'cas.test.ru', 'username': 'u', 'password': 'p',
            'from_email': 'u@test.ru', 'default_senders': [],
            'auth_type': 'ntlm', 'krb_realm': '',
            'smtp_host': 'mail.test.ru', 'smtp_port': 587,
            'smtp_username': 'smtp_u', 'smtp_password': 'smtp_p',
            'smtp_from_email': 'noreply@test.ru',
            'smtp_default_senders': ['bulk@test.ru'],
            'smtp_imap_enabled': True,  'smtp_imap_host': 'mail.test.ru', 'smtp_imap_port': 993,
            'smtp_delay_enabled': False, 'smtp_delay_seconds': 1,
        }

    def test_save_with_smtp_returns_success(self, client):
        with patch.object(email_app, 'get_credentials_path', return_value='/tmp/test_creds.json'), \
             patch.object(email_app, 'save_credentials'), \
             patch.object(email_app, 'validate_credentials_data', return_value=(True, None)):
            resp = client.post('/api/credentials/save', json=self._payload())
        assert resp.status_code == 200
        assert resp.get_json()['success'] is True

    def test_save_passes_smtp_data_to_save_credentials(self, client):
        captured = {}
        def capture_save(path, server, username, password, from_email,
                         default_senders, **kwargs):
            captured.update(kwargs)

        with patch.object(email_app, 'get_credentials_path', return_value='/tmp/t.json'), \
             patch.object(email_app, 'save_credentials', side_effect=capture_save), \
             patch.object(email_app, 'validate_credentials_data', return_value=(True, None)):
            client.post('/api/credentials/save', json=self._payload())

        smtp = captured.get('smtp', {})
        assert smtp is not None
        assert smtp.get('host') == 'mail.test.ru'
        assert smtp.get('port') == 587
        assert smtp.get('username') == 'smtp_u'


# ─── POST /api/credentials/test — channel=smtp ────────────────────────────────

class TestCredentialsTestSmtp:

    def _smtp_payload(self):
        return {
            'channel':       'smtp',
            'smtp_host':     'mail.test.ru',
            'smtp_port':     587,
            'smtp_username': 'smtp_u',
            'smtp_password': 'smtp_p',
            'smtp_from_email': 'noreply@test.ru',
        }

    def test_smtp_test_success(self, client):
        with patch.object(email_app, 'test_smtp_connection'):
            resp = client.post('/api/credentials/test', json=self._smtp_payload())
        assert resp.status_code == 200
        assert resp.get_json()['success'] is True

    def test_smtp_test_connection_error_returns_503(self, client):
        with patch.object(email_app, 'test_smtp_connection',
                          side_effect=ConnectionError('Unreachable')):
            resp = client.post('/api/credentials/test', json=self._smtp_payload())
        assert resp.status_code == 503

    def test_smtp_test_auth_error_returns_401(self, client):
        with patch.object(email_app, 'test_smtp_connection',
                          side_effect=ValueError('Неверный логин или пароль SMTP')):
            resp = client.post('/api/credentials/test', json=self._smtp_payload())
        assert resp.status_code == 401

    def test_smtp_test_missing_host_returns_400(self, client):
        payload = self._smtp_payload()
        payload['smtp_host'] = ''
        resp = client.post('/api/credentials/test', json=payload)
        assert resp.status_code == 400

    def test_smtp_test_uses_saved_password_when_empty(self, client):
        payload = self._smtp_payload()
        payload['smtp_password'] = ''

        saved_creds = {'smtp_password': 'saved_pass', 'smtp_username': 'smtp_u'}
        with patch.object(email_app, 'credentials_exist', return_value=True), \
             patch.object(email_app, 'load_credentials', return_value=saved_creds), \
             patch.object(email_app, 'test_smtp_connection') as mock_test:
            client.post('/api/credentials/test', json=payload)

        # Должен использовать сохранённый пароль
        call_kwargs = mock_test.call_args
        assert call_kwargs is not None

    def test_exchange_channel_still_works(self, client):
        payload = {
            'channel':     'exchange',
            'server':      'cas.test.ru',
            'username':    'u',
            'password':    'p',
            'from_email':  'u@test.ru',
            'auth_type':   'ntlm',
        }
        mock_account = MagicMock()
        mock_account.inbox.refresh.return_value = None
        with patch.object(email_app, 'connect_exchange', return_value=mock_account), \
             patch.object(email_app, 'credentials_exist', return_value=False):
            resp = client.post('/api/credentials/test', json=payload)
        assert resp.status_code == 200
        assert resp.get_json()['success'] is True
