"""
tests/test_settings.py

Тесты для routes/settings.py и routes/profiles_admin.py:
  settings.py:
    GET  /api/mode
    POST /api/mode
    GET  /api/license-status
    GET  /api/app-settings
    POST /api/app-settings
    POST /api/app-settings/repo/verify

  profiles_admin.py:
    GET    /api/admin/profiles
    GET    /api/admin/profiles/<name>
    POST   /api/admin/profiles/<name>
    DELETE /api/admin/profiles/<name>

Запуск: pytest tests/test_settings.py -v
"""

import json
import os
import sys
import tempfile
import unittest.mock as mock
from unittest.mock import MagicMock, patch

# ─── Мокаем Windows-зависимости ──────────────────────────────────────────────
for mod in ('win32com', 'win32com.client', 'pythoncom', 'pywin32_runtime'):
    if mod not in sys.modules:
        sys.modules[mod] = MagicMock()
sys.modules['win32com'].client = MagicMock()
sys.modules.setdefault('exchangelib', MagicMock())
sys.modules.setdefault('exchangelib.errors', MagicMock())

FAKE_NETWORK = tempfile.mkdtemp(prefix='eb_cfg_net_')
FAKE_CACHE   = tempfile.mkdtemp(prefix='eb_cfg_cache_')

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


# ─── GET /api/mode ───────────────────────────────────────────────────────────

class TestApiModeGet:

    def test_returns_mode(self, client):
        with patch.object(email_app, 'get_app_mode', return_value='admin'), \
             patch.object(email_app, '_ADMIN_VALIDATED', True, create=True), \
             patch.object(email_app, '_INVALID_TOKEN', False, create=True):
            resp = client.get('/api/mode')
        assert resp.status_code == 200
        data = resp.get_json()
        assert 'mode' in data
        assert 'can_switch' in data

    def test_user_mode(self, client):
        with patch.object(email_app, 'get_app_mode', return_value='user'), \
             patch.object(email_app, '_ADMIN_VALIDATED', False, create=True), \
             patch.object(email_app, '_INVALID_TOKEN', False, create=True):
            resp = client.get('/api/mode')
        assert resp.status_code == 200
        assert resp.get_json()['mode'] == 'user'


# ─── POST /api/mode ──────────────────────────────────────────────────────────

class TestApiModePost:

    def test_switch_to_user(self, client):
        with patch.object(email_app, '_ADMIN_VALIDATED', True, create=True), \
             patch.object(email_app, '_INVALID_TOKEN', False, create=True), \
             patch.object(email_app, 'set_app_mode', return_value='user') as mock_set:
            resp = client.post('/api/mode', json={'mode': 'user'})
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['success'] is True
        mock_set.assert_called_once_with('user')

    def test_invalid_mode_returns_400(self, client):
        with patch.object(email_app, '_ADMIN_VALIDATED', True, create=True), \
             patch.object(email_app, '_INVALID_TOKEN', False, create=True):
            resp = client.post('/api/mode', json={'mode': 'superuser'})
        assert resp.status_code == 400

    def test_no_admin_validated_returns_403(self, client):
        with patch.object(email_app, '_ADMIN_VALIDATED', False, create=True), \
             patch.object(email_app, '_INVALID_TOKEN', False, create=True):
            resp = client.post('/api/mode', json={'mode': 'user'})
        assert resp.status_code == 403

    def test_invalid_token_returns_403(self, client):
        with patch.object(email_app, '_ADMIN_VALIDATED', True, create=True), \
             patch.object(email_app, '_INVALID_TOKEN', True, create=True):
            resp = client.post('/api/mode', json={'mode': 'user'})
        assert resp.status_code == 403


# ─── GET /api/license-status ─────────────────────────────────────────────────

class TestLicenseStatus:

    def test_no_invalid_token(self, client):
        with patch.object(email_app, '_INVALID_TOKEN', False, create=True):
            resp = client.get('/api/license-status')
        assert resp.status_code == 200
        assert resp.get_json()['invalid_token'] is False

    def test_with_invalid_token(self, client):
        with patch.object(email_app, '_INVALID_TOKEN', True, create=True):
            resp = client.get('/api/license-status')
        assert resp.status_code == 200
        assert resp.get_json()['invalid_token'] is True


# ─── GET /api/app-settings ───────────────────────────────────────────────────

class TestAppSettingsGet:

    def test_returns_required_fields(self, client):
        with patch.object(email_app, '_get_repo_setting_meta', return_value={
                'platform': 'windows', 'platform_label': 'Windows',
                'repo_key': 'network_path', 'repo_label': 'Сетевой путь',
                'placeholder': '\\\\server\\share'}), \
             patch.object(email_app, '_get_runtime_repo_path', return_value=''), \
             patch.object(email_app, '_validate_resource_repo', return_value=(False, 'Не найден')), \
             patch.object(email_app, 'get_app_mode', return_value='admin'), \
             patch.object(email_app, '_CONFIG_PATH', '/fake/config.ini', create=True):
            resp = client.get('/api/app-settings')
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['success'] is True
        assert 'platform' in data
        assert 'repo_path' in data
        assert 'repo_valid' in data


# ─── POST /api/app-settings ──────────────────────────────────────────────────

class TestAppSettingsSave:

    def test_empty_path_returns_400(self, client):
        resp = client.post('/api/app-settings', json={'repo_path': ''})
        assert resp.status_code == 400

    def test_invalid_repo_returns_400(self, client):
        with patch.object(email_app, '_validate_resource_repo',
                          return_value=(False, 'Путь не найден')):
            resp = client.post('/api/app-settings', json={'repo_path': '/bad/path'})
        assert resp.status_code == 400

    def test_valid_repo_saves(self, client):
        with patch.object(email_app, '_validate_resource_repo', return_value=(True, '')), \
             patch.object(email_app, '_apply_repo_path') as mock_apply:
            resp = client.post('/api/app-settings', json={'repo_path': '/good/path'})
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['success'] is True
        mock_apply.assert_called_once_with('/good/path', persist=True)


# ─── POST /api/app-settings/repo/verify ─────────────────────────────────────

class TestRepoVerify:

    def test_valid_path(self, client):
        with patch.object(email_app, '_validate_resource_repo', return_value=(True, 'OK')):
            resp = client.post('/api/app-settings/repo/verify',
                               json={'repo_path': '/valid/path'})
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['valid'] is True

    def test_invalid_path(self, client):
        with patch.object(email_app, '_validate_resource_repo',
                          return_value=(False, 'Директория не найдена')):
            resp = client.post('/api/app-settings/repo/verify',
                               json={'repo_path': '/bad/path'})
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['valid'] is False
        assert 'reason' in data


# ─── profiles_admin.py ───────────────────────────────────────────────────────

class TestProfilesAdmin:

    @pytest.fixture(autouse=True)
    def set_admin(self):
        with patch.object(email_app, 'get_app_mode', return_value='admin'):
            yield

    def test_list_profiles_empty(self, client, tmp_path):
        email_app.NETWORK_RESOURCES_PATH = str(tmp_path / 'net')
        email_app.CACHE_DIR              = str(tmp_path / 'cache')
        os.makedirs(str(tmp_path / 'net'), exist_ok=True)
        os.makedirs(str(tmp_path / 'cache'), exist_ok=True)
        resp = client.get('/api/admin/profiles')
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['success'] is True
        assert data['profiles'] == []

    def test_create_and_get_profile(self, client, tmp_path):
        email_app.NETWORK_RESOURCES_PATH = str(tmp_path / 'net')
        email_app.CACHE_DIR              = str(tmp_path / 'cache')
        with patch.object(email_app, '_bump_network_version'):
            resp = client.post('/api/admin/profiles/myprofile',
                               json={'name': 'Мой профиль', 'color': '#ff0000'})
        assert resp.status_code == 200
        assert resp.get_json()['success'] is True

        resp = client.get('/api/admin/profiles/myprofile')
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['success'] is True
        assert data['profile']['name'] == 'Мой профиль'
        assert data['profile']['color'] == '#ff0000'

    def test_invalid_profile_name_returns_400(self, client, tmp_path):
        email_app.NETWORK_RESOURCES_PATH = str(tmp_path / 'net')
        email_app.CACHE_DIR              = str(tmp_path / 'cache')
        resp = client.post('/api/admin/profiles/My Invalid Profile!',
                           json={'name': 'Тест'})
        assert resp.status_code == 400

    def test_get_nonexistent_profile_returns_404(self, client, tmp_path):
        email_app.NETWORK_RESOURCES_PATH = str(tmp_path / 'net')
        email_app.CACHE_DIR              = str(tmp_path / 'cache')
        resp = client.get('/api/admin/profiles/nonexistent')
        assert resp.status_code == 404

    def test_delete_profile(self, client, tmp_path):
        email_app.NETWORK_RESOURCES_PATH = str(tmp_path / 'net')
        email_app.CACHE_DIR              = str(tmp_path / 'cache')
        with patch.object(email_app, '_bump_network_version'):
            client.post('/api/admin/profiles/todelete', json={'name': 'Удалить меня'})
            resp = client.delete('/api/admin/profiles/todelete')
        assert resp.status_code == 200
        assert resp.get_json()['success'] is True

        resp = client.get('/api/admin/profiles/todelete')
        assert resp.status_code == 404

    def test_cannot_delete_default_profile(self, client, tmp_path):
        email_app.NETWORK_RESOURCES_PATH = str(tmp_path / 'net')
        email_app.CACHE_DIR              = str(tmp_path / 'cache')
        resp = client.delete('/api/admin/profiles/default')
        assert resp.status_code == 400

    def test_list_profiles_shows_created(self, client, tmp_path):
        email_app.NETWORK_RESOURCES_PATH = str(tmp_path / 'net')
        email_app.CACHE_DIR              = str(tmp_path / 'cache')
        with patch.object(email_app, '_bump_network_version'):
            client.post('/api/admin/profiles/alpha', json={'name': 'Alpha'})
            client.post('/api/admin/profiles/beta',  json={'name': 'Beta'})
        resp = client.get('/api/admin/profiles')
        assert resp.status_code == 200
        names = [p['name'] for p in resp.get_json()['profiles']]
        assert 'alpha' in names
        assert 'beta' in names

    def test_non_admin_returns_403(self, client, tmp_path):
        email_app.NETWORK_RESOURCES_PATH = str(tmp_path / 'net')
        email_app.CACHE_DIR              = str(tmp_path / 'cache')
        with patch.object(email_app, 'get_app_mode', return_value='user'):
            resp = client.get('/api/admin/profiles')
        assert resp.status_code == 403

    def test_non_dict_body_returns_400(self, client, tmp_path):
        email_app.NETWORK_RESOURCES_PATH = str(tmp_path / 'net')
        email_app.CACHE_DIR              = str(tmp_path / 'cache')
        resp = client.post('/api/admin/profiles/testprofile',
                           data='["not", "a", "dict"]',
                           content_type='application/json')
        assert resp.status_code == 400
