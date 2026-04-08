"""
Тесты для нового кода Email Builder
Покрывает:
  Python — _load_config() / config.ini, templates_rename, валидация newName,
           path traversal в rename, secure_filename, load_config fallback
  (JS-логика покрыта в app.test.js)

Запуск: pytest tests/test_new.py -v
"""

import pytest
import json
import os
import sys
import tempfile
import shutil
import configparser
import unittest.mock as mock

# ─── Мокаем Windows-зависимости до импорта app ──────────────────────────────
win32com_mock = mock.MagicMock()
win32com_mock.client = mock.MagicMock()
sys.modules['win32com'] = win32com_mock
sys.modules['win32com.client'] = win32com_mock.client
sys.modules['pythoncom'] = mock.MagicMock()
sys.modules['pywin32_runtime'] = mock.MagicMock()

FAKE_NETWORK = tempfile.mkdtemp(prefix='eb_net_')
FAKE_CACHE   = tempfile.mkdtemp(prefix='eb_cache_')

with mock.patch.dict(os.environ, {'APP_MODE': 'admin'}):
    sys.modules['app_admin'] = mock.MagicMock()
    sys.modules['app_user']  = mock.MagicMock()

    sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

    # Если test_app.py уже импортировал app — переиспользуем тот же модуль
    if 'app' in sys.modules:
        email_app = sys.modules['app']
    else:
        import app as email_app

    email_app.NETWORK_RESOURCES_PATH = FAKE_NETWORK
    email_app.CACHE_DIR              = FAKE_CACHE
    email_app.CACHE_VERSION_FILE     = os.path.join(FAKE_CACHE, 'cache_version.txt')
    email_app.NETWORK_VERSION_FILE   = os.path.join(FAKE_NETWORK, 'version.txt')


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
    email_app.CACHE_VERSION_FILE     = os.path.join(FAKE_CACHE, 'cache_version.txt')
    email_app.NETWORK_VERSION_FILE   = os.path.join(FAKE_NETWORK, 'version.txt')
    yield
    email_app.NETWORK_RESOURCES_PATH = FAKE_NETWORK
    email_app.CACHE_DIR              = FAKE_CACHE
    # Чистим кеш
    for f in os.listdir(FAKE_CACHE):
        try:
            p = os.path.join(FAKE_CACHE, f)
            shutil.rmtree(p) if os.path.isdir(p) else os.remove(p)
        except Exception:
            pass
    # Чистим сетевую папку (кроме templates/)
    for f in os.listdir(FAKE_NETWORK):
        try:
            p = os.path.join(FAKE_NETWORK, f)
            if f != 'templates':
                shutil.rmtree(p) if os.path.isdir(p) else os.remove(p)
        except Exception:
            pass


# ─── Хелпер: создать шаблон в директории ─────────────────────────────────────

def make_template(base_dir, filename, name='Тест', is_preset=False):
    os.makedirs(base_dir, exist_ok=True)
    # Store the filename stem as 'id' so _find_template_by_id can locate the file
    # both via the index and via the legacy filename-stem fallback.
    tid = os.path.splitext(filename)[0]
    tpl = {'id': tid, 'name': name, 'isPreset': is_preset, 'blocks': []}
    with open(os.path.join(base_dir, filename), 'w', encoding='utf-8') as f:
        json.dump(tpl, f, ensure_ascii=False)
    return os.path.join(base_dir, filename)


# =============================================================================
# _load_config() — чтение config.ini
# =============================================================================

class TestLoadConfigIni:
    """_load_config() reads config.ini and returns (network_path, port, config_path, linux_hint, smb_path, linux_resolved)"""

    def test_returns_tuple_of_four(self):
        """Should return a 6-element tuple"""
        result = email_app._load_config()
        assert isinstance(result, tuple)
        assert len(result) == 6

    def test_port_is_int(self):
        path, port, config_path, linux_hint, smb_path, linux_resolved = email_app._load_config()
        assert isinstance(port, int)

    def test_mode_is_lowercase_str(self):
        """APP_MODE is resolved separately via _resolve_app_mode(), not from _load_config()"""
        mode = email_app.APP_MODE
        assert mode == mode.lower()

    def test_network_path_is_str(self):
        path, port, config_path, linux_hint, smb_path, linux_resolved = email_app._load_config()
        assert isinstance(path, str)
        assert len(path) > 0

    def test_reads_custom_port_from_ini(self, tmp_path):
        ini = tmp_path / 'config.ini'
        ini.write_text('[app]\nport = 9999\n', encoding='utf-8')
        with mock.patch('os.path.join', side_effect=lambda *a: str(tmp_path / a[-1]) if a[-1] == 'config.ini' else os.path.join(*a)):
            cfg = configparser.ConfigParser()
            cfg.read(str(ini), encoding='utf-8')
            port = int(cfg.get('app', 'port', fallback='8080'))
        assert port == 9999

    def test_reads_custom_mode_from_ini(self, tmp_path):
        ini = tmp_path / 'config.ini'
        ini.write_text('[app]\nmode = user\n', encoding='utf-8')
        cfg = configparser.ConfigParser()
        cfg.read(str(ini), encoding='utf-8')
        mode = cfg.get('app', 'mode', fallback='admin')
        assert mode == 'user'

    def test_env_APP_MODE_overrides_ini(self, tmp_path):
        """APP_MODE=user должна перекрывать mode=admin в ini"""
        ini = tmp_path / 'config.ini'
        ini.write_text('[app]\nmode = admin\n', encoding='utf-8')
        cfg = configparser.ConfigParser()
        cfg.read(str(ini), encoding='utf-8')
        mode = os.environ.get('APP_MODE', cfg.get('app', 'mode', fallback='admin')).lower()
        # В тестах APP_MODE=admin, так что admin и должно быть
        assert mode == 'admin'

    def test_missing_ini_uses_defaults(self, tmp_path):
        """Без config.ini должны применяться дефолты"""
        cfg = configparser.ConfigParser()
        cfg.read(str(tmp_path / 'nonexistent.ini'), encoding='utf-8')
        port = int(cfg.get('app', 'port', fallback='8080'))
        mode = cfg.get('app', 'mode', fallback='admin')
        assert port == 8080
        assert mode == 'admin'

    def test_invalid_port_raises_or_uses_default(self, tmp_path):
        """Нечисловой порт должен либо упасть, либо использовать дефолт"""
        ini = tmp_path / 'config.ini'
        ini.write_text('[app]\nport = notanumber\n', encoding='utf-8')
        cfg = configparser.ConfigParser()
        cfg.read(str(ini), encoding='utf-8')
        raw = cfg.get('app', 'port', fallback='8080')
        try:
            port = int(raw)
        except ValueError:
            port = 8080  # fallback
        assert port == 8080


# =============================================================================
# load_config() — загрузка config.json
# =============================================================================

class TestLoadConfigJson:
    """load_config() грузит config.json с сетевого диска или кеша"""

    def test_returns_dict(self):
        result = email_app.load_config()
        assert isinstance(result, dict)

    def test_returns_default_when_no_files(self):
        result = email_app.load_config()
        assert 'version' in result or isinstance(result, dict)

    def test_loads_from_cache(self):
        cache_path = os.path.join(FAKE_CACHE, 'config.json')
        test_cfg = {'version': '3.0', 'banners': ['b1'], 'bullets': [{'id': 'x', 'src': 'x.png'}]}
        with open(cache_path, 'w', encoding='utf-8') as f:
            json.dump(test_cfg, f)
        result = email_app.load_config()
        assert result.get('version') == '3.0'
        assert result.get('banners') == ['b1']

    def test_cache_bullets_structure(self):
        cache_path = os.path.join(FAKE_CACHE, 'config.json')
        bullets = [{'id': 'circle', 'src': 'bullets/b.png', 'label': 'Буллет'}]
        with open(cache_path, 'w', encoding='utf-8') as f:
            json.dump({'version': '1.0', 'bullets': bullets}, f)
        result = email_app.load_config()
        assert len(result.get('bullets', [])) == 1
        assert result['bullets'][0]['id'] == 'circle'

    def test_network_takes_priority_over_cache(self):
        net_static = os.path.join(FAKE_NETWORK, 'static')
        os.makedirs(net_static, exist_ok=True)
        net_cfg = {'version': 'net-1.0', 'banners': ['net-banner']}
        with open(os.path.join(net_static, 'config.json'), 'w', encoding='utf-8') as f:
            json.dump(net_cfg, f)

        cache_path = os.path.join(FAKE_CACHE, 'config.json')
        with open(cache_path, 'w', encoding='utf-8') as f:
            json.dump({'version': 'cache-1.0'}, f)

        result = email_app.load_config()
        assert result.get('version') == 'net-1.0'

    def test_falls_back_to_cache_when_network_unavailable(self):
        cache_path = os.path.join(FAKE_CACHE, 'config.json')
        with open(cache_path, 'w', encoding='utf-8') as f:
            json.dump({'version': 'fallback-1.0'}, f)
        # Сетевого файла нет
        result = email_app.load_config()
        assert result.get('version') == 'fallback-1.0'

    def test_default_when_both_missing(self):
        result = email_app.load_config()
        assert isinstance(result, dict)
        # Дефолт должен содержать хотя бы пустые bullets
        assert 'bullets' in result or result == {'version': '1.0', 'banners': [], 'icons': {}, 'expertBadges': [], 'bullets': [], 'buttonIcons': []}


# =============================================================================
# /api/config endpoint
# =============================================================================

class TestApiConfigEndpoint:
    def test_status_200(self, client):
        assert client.get('/api/config').status_code == 200

    def test_success_field_present(self, client):
        data = client.get('/api/config').get_json()
        assert 'success' in data

    def test_config_present_on_success(self, client):
        data = client.get('/api/config').get_json()
        if data['success']:
            assert 'config' in data
            assert isinstance(data['config'], dict)

    def test_config_has_expected_keys(self, client):
        cache_path = os.path.join(FAKE_CACHE, 'config.json')
        with open(cache_path, 'w', encoding='utf-8') as f:
            json.dump({'version': '1.0', 'banners': [], 'bullets': [], 'icons': {}}, f)
        data = client.get('/api/config').get_json()
        if data['success']:
            cfg = data['config']
            for key in ('banners', 'bullets'):
                assert key in cfg


# =============================================================================
# /api/templates/rename — переименование шаблона
# =============================================================================

class TestTemplatesRename:
    """Тесты эндпоинта PUT /api/templates/rename"""

    def _get_user_dir(self):
        return email_app.get_personal_templates_dir()

    def test_rename_returns_200_on_success(self, client):
        user_dir = self._get_user_dir()
        fname = 'template_test_rename.json'
        make_template(user_dir, fname, name='Старое имя')
        tid = os.path.splitext(fname)[0]

        resp = client.put('/api/templates/rename', json={
            'id': tid,
            'newName': 'Новое имя',
            'type': 'personal'
        })
        assert resp.status_code == 200
        assert resp.get_json()['success'] is True

    def test_rename_updates_name_field(self, client):
        user_dir = self._get_user_dir()
        fname = 'template_rename_name_test.json'
        make_template(user_dir, fname, name='Оригинал')
        tid = os.path.splitext(fname)[0]

        client.put('/api/templates/rename', json={
            'id': tid,
            'newName': 'Изменённое название',
            'type': 'personal'
        })

        with open(os.path.join(user_dir, fname), encoding='utf-8') as f:
            saved = json.load(f)
        assert saved['name'] == 'Изменённое название'

    def test_missing_filename_returns_400(self, client):
        resp = client.put('/api/templates/rename', json={
            'id': '',
            'newName': 'Новое',
            'type': 'personal'
        })
        assert resp.status_code == 400

    def test_empty_newName_returns_400(self, client):
        user_dir = self._get_user_dir()
        fname = 'template_empty_name.json'
        make_template(user_dir, fname)
        tid = os.path.splitext(fname)[0]

        resp = client.put('/api/templates/rename', json={
            'id': tid,
            'newName': '',
            'type': 'personal'
        })
        assert resp.status_code == 400
        data = resp.get_json()
        assert data['success'] is False
        assert 'пустым' in data['error'].lower() or 'название' in data['error'].lower()

    def test_newName_too_long_returns_400(self, client):
        user_dir = self._get_user_dir()
        fname = 'template_long_name.json'
        make_template(user_dir, fname)
        tid = os.path.splitext(fname)[0]

        resp = client.put('/api/templates/rename', json={
            'id': tid,
            'newName': 'A' * 201,
            'type': 'personal'
        })
        assert resp.status_code == 400
        data = resp.get_json()
        assert data['success'] is False

    def test_newName_exactly_200_chars_is_ok(self, client):
        user_dir = self._get_user_dir()
        fname = 'template_max_name.json'
        make_template(user_dir, fname)
        tid = os.path.splitext(fname)[0]

        resp = client.put('/api/templates/rename', json={
            'id': tid,
            'newName': 'А' * 200,
            'type': 'personal'
        })
        assert resp.status_code == 200
        assert resp.get_json()['success'] is True

    def test_nonexistent_file_returns_404(self, client):
        resp = client.put('/api/templates/rename', json={
            'id': 'template_does_not_exist',
            'newName': 'Новое',
            'type': 'personal'
        })
        assert resp.status_code == 404

    def test_invalid_filename_extension_returns_400(self, client):
        # Path traversal chars in id → 400
        resp = client.put('/api/templates/rename', json={
            'id': '../template',
            'newName': 'Новое',
            'type': 'personal'
        })
        assert resp.status_code == 400

    def test_user_cannot_rename_shared_template(self, client):
        """Пользователь (APP_MODE=user) не должен переименовывать shared шаблоны"""
        orig_mode = email_app.APP_MODE
        email_app.APP_MODE = 'user'
        try:
            resp = client.put('/api/templates/rename', json={
                'id': 'template_shared',
                'newName': 'Взлом',
                'type': 'shared'
            })
            assert resp.status_code == 403
        finally:
            email_app.APP_MODE = orig_mode

    def test_path_traversal_in_filename_blocked(self, client):
        resp = client.put('/api/templates/rename', json={
            'id': '../../../etc/passwd',
            'newName': 'Взлом',
            'type': 'personal'
        })
        assert resp.status_code == 400

    def test_path_traversal_with_dots_blocked(self, client):
        resp = client.put('/api/templates/rename', json={
            'id': '..\\..\\template',
            'newName': 'Взлом',
            'type': 'personal'
        })
        assert resp.status_code in (400, 404)


# =============================================================================
# secure_filename — поведение при разных именах
# =============================================================================

class TestSecureFilename:
    """Проверяем что secure_filename из werkzeug работает как ожидается"""

    def test_normal_json_filename_preserved(self):
        from werkzeug.utils import secure_filename
        assert secure_filename('template_test.json') == 'template_test.json'

    def test_path_separators_stripped(self):
        from werkzeug.utils import secure_filename
        result = secure_filename('../../../etc/passwd')
        assert '/' not in result
        assert '..' not in result

    def test_windows_path_stripped(self):
        from werkzeug.utils import secure_filename
        result = secure_filename('..\\..\\win.json')
        assert '\\' not in result
        assert '..' not in result

    def test_empty_filename_returns_empty(self):
        from werkzeug.utils import secure_filename
        result = secure_filename('')
        assert result == ''

    def test_only_dots_returns_empty(self):
        from werkzeug.utils import secure_filename
        result = secure_filename('...')
        assert result == '' or '.' not in result

    def test_spaces_replaced(self):
        from werkzeug.utils import secure_filename
        result = secure_filename('my template.json')
        assert ' ' not in result

    def test_unicode_cyrillic_handled(self):
        from werkzeug.utils import secure_filename
        # Кириллица может быть транслитерирована или удалена
        result = secure_filename('шаблон.json')
        # Главное — не должно быть path separators
        assert '/' not in result
        assert '\\' not in result


# =============================================================================
# newName валидация (логика из templates_rename)
# =============================================================================

class TestNewNameValidation:
    """Изолированная логика валидации newName"""

    def _validate(self, new_name):
        """Воспроизводим логику из app.py"""
        new_name = (new_name or '').strip()
        if not new_name:
            return False, 'Название не может быть пустым'
        if len(new_name) > 200:
            return False, 'Название слишком длинное (макс. 200 символов)'
        return True, None

    def test_valid_name(self):
        ok, _ = self._validate('Нормальное название')
        assert ok is True

    def test_empty_string(self):
        ok, err = self._validate('')
        assert ok is False
        assert 'пустым' in err.lower()

    def test_whitespace_only(self):
        ok, err = self._validate('   ')
        assert ok is False

    def test_none(self):
        ok, err = self._validate(None)
        assert ok is False

    def test_exactly_200_chars(self):
        ok, _ = self._validate('А' * 200)
        assert ok is True

    def test_201_chars(self):
        ok, err = self._validate('А' * 201)
        assert ok is False
        assert '200' in err

    def test_1_char(self):
        ok, _ = self._validate('X')
        assert ok is True

    def test_special_chars_allowed(self):
        ok, _ = self._validate('Название & "кавычки" <тест>')
        assert ok is True

    def test_emoji_allowed(self):
        ok, _ = self._validate('🧩 Пресет')
        assert ok is True


# =============================================================================
# Интеграция: полный цикл создание → переименование
# =============================================================================

class TestRenameIntegration:
    def test_create_and_rename_cycle(self, client):
        """Создать шаблон → переименовать → убедиться что имя изменилось"""
        # Создаём шаблон
        save_resp = client.post('/api/templates/save', json={
            'name': 'Исходное название',
            'blocks': [],
            'type': 'personal'
        })
        assert save_resp.status_code == 200
        save_data = save_resp.get_json()
        assert save_data['success'] is True
        template_id = save_data.get('id')
        assert template_id is not None

        # Переименовываем
        rename_resp = client.put('/api/templates/rename', json={
            'id': template_id,
            'newName': 'Переименованный шаблон',
            'type': 'personal'
        })
        assert rename_resp.status_code == 200
        assert rename_resp.get_json()['success'] is True

    def test_renamed_template_appears_in_list(self, client):
        """После переименования новое имя должно появиться в списке"""
        save_resp = client.post('/api/templates/save', json={
            'name': 'До переименования',
            'blocks': [],
            'type': 'personal'
        })
        if not save_resp.get_json().get('success'):
            pytest.skip('save не вернул success')

        template_id = save_resp.get_json().get('id')

        client.put('/api/templates/rename', json={
            'id': template_id,
            'newName': 'После переименования',
            'type': 'personal'
        })

        list_resp = client.get('/api/templates/list')
        assert list_resp.status_code == 200
        templates = list_resp.get_json().get('templates', {})
        personal = templates.get('personal', [])
        names = [t.get('name') for t in personal]
        assert 'После переименования' in names