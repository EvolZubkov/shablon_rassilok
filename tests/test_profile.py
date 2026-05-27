"""
tests/test_profile.py

Тесты для GET /api/profile

Запуск:
    pytest tests/test_profile.py -v
"""

import os
import sys
import json
import pytest
import tempfile
import unittest.mock as mock

# ─── Мокаем Windows-зависимости до импорта app ───────────────────────────────
win32com_mock = mock.MagicMock()
win32com_mock.client = mock.MagicMock()
sys.modules['win32com'] = win32com_mock
sys.modules['win32com.client'] = win32com_mock.client
sys.modules['pythoncom'] = mock.MagicMock()
sys.modules['pywin32_runtime'] = mock.MagicMock()

sys.modules['app_admin'] = mock.MagicMock()
sys.modules['app_user'] = mock.MagicMock()

FAKE_NETWORK = tempfile.mkdtemp(prefix='eb_network_')
FAKE_CACHE   = tempfile.mkdtemp(prefix='eb_cache_')

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import app as email_app

email_app.NETWORK_RESOURCES_PATH = FAKE_NETWORK
email_app.CACHE_DIR               = FAKE_CACHE
email_app.CACHE_VERSION_FILE      = os.path.join(FAKE_CACHE, 'cache_version.txt')
email_app.NETWORK_VERSION_FILE    = os.path.join(FAKE_NETWORK, 'version.txt')

# ─── Фикстуры ────────────────────────────────────────────────────────────────

@pytest.fixture(scope='session')
def flask_app():
    email_app.app.config['TESTING'] = True
    yield email_app.app


@pytest.fixture
def client(flask_app):
    return flask_app.test_client()


@pytest.fixture
def cache_profiles_dir(tmp_path):
    """Подменяет CACHE_DIR так чтобы profiles/ лежали в кеше."""
    cache = tmp_path / 'cache'
    profiles = cache / 'profiles'
    profiles.mkdir(parents=True)
    with mock.patch.object(email_app, 'CACHE_DIR', str(cache)):
        with mock.patch('routes.profile._m.CACHE_DIR', str(cache)):
            yield profiles


@pytest.fixture
def local_profiles_dir(tmp_path):
    """Подменяет локальную папку profiles/ рядом с .exe."""
    d = tmp_path / 'local_profiles'
    d.mkdir()
    with mock.patch('routes.profile._local_profiles_dir', return_value=str(d)):
        yield d


# ─── Вспомогательные функции ─────────────────────────────────────────────────

def _write_profile(directory, name, data):
    path = directory / f'{name}.json'
    path.write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
    return path


def _write_config(tmp_path, profile_name):
    cfg = tmp_path / 'config.ini'
    cfg.write_text(f'[app]\nprofile = {profile_name}\n', encoding='utf-8')
    return str(cfg)


# ─── Тесты ───────────────────────────────────────────────────────────────────

class TestGetProfile:

    def test_reads_from_cache_first(self, client, cache_profiles_dir, local_profiles_dir, tmp_path):
        """Кеш имеет приоритет над локальной папкой."""
        _write_profile(cache_profiles_dir, 'default', {'name': 'Из кеша', 'blocks': {}})
        _write_profile(local_profiles_dir, 'default', {'name': 'Локальный', 'blocks': {}})
        cfg_path = _write_config(tmp_path, 'default')

        with mock.patch('routes.profile._m._CONFIG_PATH', cfg_path):
            resp = client.get('/api/profile')

        body = resp.get_json()
        assert body['success'] is True
        assert body['profile']['name'] == 'Из кеша'

    def test_falls_back_to_local_when_cache_missing(self, client, cache_profiles_dir, local_profiles_dir, tmp_path):
        """Если профиля нет в кеше — берёт локальный."""
        _write_profile(local_profiles_dir, 'default', {'name': 'Локальный', 'blocks': {}})
        cfg_path = _write_config(tmp_path, 'default')

        with mock.patch('routes.profile._m._CONFIG_PATH', cfg_path):
            resp = client.get('/api/profile')

        body = resp.get_json()
        assert body['success'] is True
        assert body['profile']['name'] == 'Локальный'

    def test_returns_named_profile(self, client, cache_profiles_dir, tmp_path):
        """Возвращает нужный профиль по имени из config.ini."""
        _write_profile(cache_profiles_dir, 'audience_b', {'name': 'Аудитория B', 'blocks': {'banner': {'enabled': False}}})
        cfg_path = _write_config(tmp_path, 'audience_b')

        with mock.patch('routes.profile._m._CONFIG_PATH', cfg_path):
            resp = client.get('/api/profile')

        body = resp.get_json()
        assert body['success'] is True
        assert body['name'] == 'audience_b'
        assert body['profile']['name'] == 'Аудитория B'

    def test_falls_back_to_default_when_named_missing(self, client, cache_profiles_dir, tmp_path):
        """Если запрошенный профиль не найден — возвращает default."""
        _write_profile(cache_profiles_dir, 'default', {'name': 'По умолчанию', 'blocks': {}})
        cfg_path = _write_config(tmp_path, 'nonexistent_profile')

        with mock.patch('routes.profile._m._CONFIG_PATH', cfg_path):
            resp = client.get('/api/profile')

        body = resp.get_json()
        assert body['success'] is True
        assert body['profile']['name'] == 'По умолчанию'

    def test_returns_empty_when_no_files_anywhere(self, client, cache_profiles_dir, local_profiles_dir, tmp_path):
        """Если нет ни одного файла — возвращает пустой профиль без ошибки."""
        cfg_path = _write_config(tmp_path, 'default')

        with mock.patch('routes.profile._m._CONFIG_PATH', cfg_path):
            resp = client.get('/api/profile')

        body = resp.get_json()
        assert body['success'] is True
        assert body['profile'] == {'blocks': {}}

    def test_profile_fallback_when_config_missing(self, client, cache_profiles_dir):
        """Если config.ini не существует — использует имя 'default' (fallback)."""
        _write_profile(cache_profiles_dir, 'default', {'name': 'По умолчанию', 'blocks': {}})

        with mock.patch('routes.profile._m._CONFIG_PATH', '/nonexistent/config.ini'):
            resp = client.get('/api/profile')

        body = resp.get_json()
        assert body['success'] is True
        assert body['name'] == 'default'

    def test_capabilities_present_in_profile(self, client, cache_profiles_dir, tmp_path):
        """Capabilities корректно передаются в ответе."""
        data = {
            'name': 'С капабилити',
            'blocks': {
                'text':   {'enabled': True, 'capabilities': ['background']},
                'banner': {'enabled': True, 'capabilities': ['background']},
            }
        }
        _write_profile(cache_profiles_dir, 'default', data)
        cfg_path = _write_config(tmp_path, 'default')

        with mock.patch('routes.profile._m._CONFIG_PATH', cfg_path):
            resp = client.get('/api/profile')

        body = resp.get_json()
        assert body['profile']['blocks']['text']['capabilities'] == ['background']
        assert body['profile']['blocks']['banner']['capabilities'] == ['background']

    def test_disabled_blocks_in_profile(self, client, cache_profiles_dir, tmp_path):
        """Блоки с enabled=false корректно передаются."""
        data = {
            'name': 'Ограниченный',
            'blocks': {
                'banner': {'enabled': False},
                'expert': {'enabled': False},
                'text':   {'enabled': True, 'capabilities': []},
            }
        }
        _write_profile(cache_profiles_dir, 'restricted', data)
        cfg_path = _write_config(tmp_path, 'restricted')

        with mock.patch('routes.profile._m._CONFIG_PATH', cfg_path):
            resp = client.get('/api/profile')

        body = resp.get_json()
        assert body['profile']['blocks']['banner']['enabled'] is False
        assert body['profile']['blocks']['expert']['enabled'] is False
        assert body['profile']['blocks']['text']['enabled'] is True

    def test_response_structure(self, client, cache_profiles_dir, tmp_path):
        """Ответ всегда содержит поля success, name, profile."""
        _write_profile(cache_profiles_dir, 'default', {'blocks': {}})
        cfg_path = _write_config(tmp_path, 'default')

        with mock.patch('routes.profile._m._CONFIG_PATH', cfg_path):
            resp = client.get('/api/profile')

        body = resp.get_json()
        assert 'success' in body
        assert 'name' in body
        assert 'profile' in body
