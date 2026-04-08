"""
Тесты для Email Builder Flask API
Запуск: pytest tests/test_app.py -v
"""

import pytest
import json
import os
import sys
import tempfile
import shutil

# ─── Мокаем Windows-зависимости до импорта app ───────────────────────────────
import unittest.mock as mock

# Мокаем win32com и pythoncom — они доступны только на Windows
win32com_mock = mock.MagicMock()
win32com_mock.client = mock.MagicMock()
sys.modules['win32com'] = win32com_mock
sys.modules['win32com.client'] = win32com_mock.client
sys.modules['pythoncom'] = mock.MagicMock()
sys.modules['pywin32_runtime'] = mock.MagicMock()

# Подставляем временный сетевой путь
FAKE_NETWORK = tempfile.mkdtemp(prefix='email_builder_network_')
FAKE_CACHE = tempfile.mkdtemp(prefix='email_builder_cache_')

# Патчим пути до импорта
with mock.patch.dict(os.environ, {'APP_MODE': 'admin'}):
    import importlib, types

    # Подменяем модуль app_admin/app_user если они нужны
    sys.modules['app_admin'] = mock.MagicMock()
    sys.modules['app_user'] = mock.MagicMock()

    # Меняем пути в app
    import builtins
    _real_open = builtins.open

    # Импортируем app и сразу патчим тяжёлые пути
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

    import app as email_app

    email_app.NETWORK_RESOURCES_PATH = FAKE_NETWORK
    email_app.CACHE_DIR = FAKE_CACHE
    email_app.CACHE_VERSION_FILE = os.path.join(FAKE_CACHE, 'cache_version.txt')
    email_app.NETWORK_VERSION_FILE = os.path.join(FAKE_NETWORK, 'version.txt')


# ─── Фикстуры ────────────────────────────────────────────────────────────────

@pytest.fixture(scope='session')
def app():
    email_app.app.config['TESTING'] = True
    email_app.app.config['WTF_CSRF_ENABLED'] = False
    yield email_app.app


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture(autouse=True)
def clean_temp():
    """Принудительно задаём и восстанавливаем глобалы вокруг каждого теста."""
    # Принудительно устанавливаем правильные пути ПЕРЕД тестом
    email_app.NETWORK_RESOURCES_PATH = FAKE_NETWORK
    email_app.CACHE_DIR               = FAKE_CACHE
    email_app.CACHE_VERSION_FILE      = os.path.join(FAKE_CACHE, "cache_version.txt")
    email_app.NETWORK_VERSION_FILE    = os.path.join(FAKE_NETWORK, "version.txt")
    yield
    # Восстанавливаем после теста
    email_app.NETWORK_RESOURCES_PATH = FAKE_NETWORK
    email_app.CACHE_DIR               = FAKE_CACHE
    email_app.CACHE_VERSION_FILE      = os.path.join(FAKE_CACHE, "cache_version.txt")
    email_app.NETWORK_VERSION_FILE    = os.path.join(FAKE_NETWORK, "version.txt")
    for f in os.listdir(FAKE_CACHE):
        try:
            path = os.path.join(FAKE_CACHE, f)
            if os.path.isdir(path):
                shutil.rmtree(path)
            else:
                os.remove(path)
        except Exception:
            pass


# ─────────────────────────────────────────────────────────────────────────────
# ТЕСТЫ: Вспомогательные функции
# ─────────────────────────────────────────────────────────────────────────────

class TestCacheFunctions:
    """Тесты функций кеширования версий"""

    def test_get_cache_version_returns_none_when_missing(self):
        assert email_app.get_cache_version() is None

    def test_set_and_get_cache_version(self):
        email_app.set_cache_version('1.2.3')
        assert email_app.get_cache_version() == '1.2.3'

    def test_set_cache_version_updates_value(self):
        email_app.set_cache_version('1.0')
        email_app.set_cache_version('2.0')
        assert email_app.get_cache_version() == '2.0'

    def test_get_network_version_returns_none_when_file_missing(self):
        assert email_app.get_network_version() is None

    def test_get_network_version_reads_file(self):
        version_path = os.path.join(FAKE_NETWORK, 'version.txt')
        with open(version_path, 'w') as f:
            f.write('3.0.0')
        try:
            assert email_app.get_network_version() == '3.0.0'
        finally:
            os.remove(version_path)

    def test_get_network_version_returns_none_for_empty_file(self):
        version_path = os.path.join(FAKE_NETWORK, 'version.txt')
        with open(version_path, 'w') as f:
            f.write('')
        try:
            assert email_app.get_network_version() is None
        finally:
            os.remove(version_path)


class TestCheckNetworkAccess:
    """Тесты проверки доступности сетевого ресурса"""

    def test_returns_true_when_path_exists(self):
        # _validate_resource_repo requires version.txt and static/ to exist
        os.makedirs(os.path.join(FAKE_NETWORK, 'static'), exist_ok=True)
        version_file = os.path.join(FAKE_NETWORK, 'version.txt')
        with open(version_file, 'w') as f:
            f.write('1.0')
        email_app.NETWORK_RESOURCES_PATH = FAKE_NETWORK
        assert email_app.check_network_access() is True

    def test_returns_false_when_path_not_exists(self):
        email_app.NETWORK_RESOURCES_PATH = '/nonexistent/path/xyz'
        result = email_app.check_network_access()
        email_app.NETWORK_RESOURCES_PATH = FAKE_NETWORK  # восстанавливаем
        assert result is False


class TestProcessLocalImages:
    """Тесты обработки локальных изображений в HTML"""

    def test_returns_html_unchanged_when_no_images(self):
        html = '<p>Привет мир</p>'
        result = email_app.process_local_images_in_html(html, '/tmp')
        assert result == html

    def test_skips_http_images(self):
        html = '<img src="https://example.com/image.png">'
        result = email_app.process_local_images_in_html(html, '/tmp')
        assert 'https://example.com/image.png' in result

    def test_skips_data_uri_images(self):
        html = '<img src="data:image/png;base64,abc123">'
        result = email_app.process_local_images_in_html(html, '/tmp')
        assert 'data:image/png;base64,abc123' in result

    def test_converts_local_image_to_base64(self):
        with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as f:
            # Минимальный валидный PNG (1x1 пиксель)
            f.write(b'\x89PNG\r\n\x1a\n' + b'\x00' * 50)
            tmp_path = f.name
        try:
            html = f'<img src="{tmp_path}">'
            result = email_app.process_local_images_in_html(html, '/tmp')
            assert 'data:image' in result
            assert 'base64,' in result
        finally:
            os.remove(tmp_path)

    def test_returns_original_tag_when_file_not_found(self):
        html = '<img src="/nonexistent/image.png">'
        result = email_app.process_local_images_in_html(html, '/tmp')
        assert '/nonexistent/image.png' in result


class TestParseImgSizePx:
    """Тесты парсинга размеров img из HTML"""

    def test_parses_width_and_height_attributes(self):
        tag = '<img width="100" height="50" src="img.png">'
        w, h = email_app._parse_img_size_px(tag)
        assert w == 100
        assert h == 50

    def test_parses_style_width_height(self):
        tag = '<img style="width:200px; height:100px" src="img.png">'
        w, h = email_app._parse_img_size_px(tag)
        assert w == 200
        assert h == 100

    def test_returns_none_when_no_size(self):
        tag = '<img src="img.png">'
        w, h = email_app._parse_img_size_px(tag)
        assert w is None
        assert h is None

    def test_parses_only_width(self):
        tag = '<img width="320" src="img.png">'
        w, h = email_app._parse_img_size_px(tag)
        assert w == 320
        assert h is None


class TestLoadConfig:
    """Тесты загрузки конфигурации"""

    def test_returns_default_config_when_no_files(self):
        config = email_app.load_config()
        assert 'version' in config or isinstance(config, dict)

    def test_loads_config_from_cache(self):
        cache_config_path = os.path.join(FAKE_CACHE, 'config.json')
        test_config = {'version': '2.0', 'banners': ['banner1'], 'icons': {}}
        with open(cache_config_path, 'w', encoding='utf-8') as f:
            json.dump(test_config, f)

        config = email_app.load_config()
        assert config.get('version') == '2.0'
        assert config.get('banners') == ['banner1']


# ─────────────────────────────────────────────────────────────────────────────
# ТЕСТЫ: Flask Routes
# ─────────────────────────────────────────────────────────────────────────────

class TestApiConfig:
    """Тесты эндпоинта /api/config"""

    def test_returns_200(self, client):
        resp = client.get('/api/config')
        assert resp.status_code == 200

    def test_returns_json(self, client):
        resp = client.get('/api/config')
        data = resp.get_json()
        assert data is not None

    def test_response_has_success_field(self, client):
        resp = client.get('/api/config')
        data = resp.get_json()
        assert 'success' in data

    def test_response_has_config_on_success(self, client):
        resp = client.get('/api/config')
        data = resp.get_json()
        if data['success']:
            assert 'config' in data


class TestTemplatesAPI:
    """Тесты API шаблонов"""

    def setup_method(self):
        """Создаём структуру папок шаблонов"""
        templates_dir = os.path.join(FAKE_NETWORK, 'templates')
        shared_dir = os.path.join(templates_dir, 'shared')
        os.makedirs(shared_dir, exist_ok=True)
        email_app.NETWORK_RESOURCES_PATH = FAKE_NETWORK

    def test_templates_list_returns_200(self, client):
        resp = client.get('/api/templates/list')
        assert resp.status_code == 200

    def test_templates_list_has_shared_and_personal(self, client):
        resp = client.get('/api/templates/list')
        data = resp.get_json()
        if data.get('success'):
            assert 'shared' in data['templates']
            assert 'personal' in data['templates']

    def test_save_template_requires_name_and_blocks(self, client):
        resp = client.post('/api/templates/save',
                           json={},
                           content_type='application/json')
        data = resp.get_json()
        assert data['success'] is False

    def test_save_personal_template(self, client):
        payload = {
            'name': 'Тест-шаблон',
            'blocks': [{'id': 1, 'type': 'text'}],
            'type': 'personal'
        }
        resp = client.post('/api/templates/save',
                           json=payload,
                           content_type='application/json')
        data = resp.get_json()
        assert data['success'] is True
        assert 'filename' in data

    def test_load_nonexistent_template_returns_404(self, client):
        resp = client.get('/api/templates/load?id=nonexistent&type=personal')
        assert resp.status_code == 404

    def test_delete_nonexistent_template_returns_404(self, client):
        resp = client.delete('/api/templates/delete?id=ghost&type=personal')
        assert resp.status_code == 404


class TestCategoriesAPI:
    """Тесты API категорий"""

    def setup_method(self):
        templates_dir = os.path.join(FAKE_NETWORK, 'templates')
        os.makedirs(templates_dir, exist_ok=True)
        email_app.NETWORK_RESOURCES_PATH = FAKE_NETWORK

    def test_get_categories_returns_200(self, client):
        resp = client.get('/api/templates/categories')
        assert resp.status_code == 200

    def test_get_categories_returns_list(self, client):
        resp = client.get('/api/templates/categories')
        data = resp.get_json()
        if data.get('success'):
            assert isinstance(data['categories'], list)

    def test_add_category(self, client):
        resp = client.post('/api/templates/categories',
                           json={'name': 'Маркетинг'},
                           content_type='application/json')
        data = resp.get_json()
        assert data['success'] is True
        assert 'Маркетинг' in data['categories']

    def test_add_empty_category_fails(self, client):
        resp = client.post('/api/templates/categories',
                           json={'name': ''},
                           content_type='application/json')
        assert resp.status_code == 400

    def test_add_duplicate_category_is_idempotent(self, client):
        client.post('/api/templates/categories',
                    json={'name': 'HR'},
                    content_type='application/json')
        resp = client.post('/api/templates/categories',
                           json={'name': 'HR'},
                           content_type='application/json')
        data = resp.get_json()
        assert data['categories'].count('HR') == 1

    def test_delete_category(self, client):
        client.post('/api/templates/categories',
                    json={'name': 'Временная'},
                    content_type='application/json')
        resp = client.delete('/api/templates/categories?name=Временная')
        data = resp.get_json()
        assert data['success'] is True
        assert 'Временная' not in data['categories']

    def test_delete_empty_category_name_fails(self, client):
        resp = client.delete('/api/templates/categories?name=')
        assert resp.status_code == 400


class TestAdminUserModeRoutes:
    """Тесты разграничения маршрутов admin/user"""

    def test_user_route_exists(self, client):
        # Маршрут /user должен вернуть что-то (или 404 если нет файла в static)
        resp = client.get('/user')
        assert resp.status_code in (200, 404, 500)

    def test_admin_save_shared_template_blocked_in_user_mode(self, client):
        original_mode = email_app.APP_MODE
        email_app.APP_MODE = 'user'
        try:
            payload = {
                'name': 'Общий шаблон',
                'blocks': [{'id': 1}],
                'type': 'shared'
            }
            resp = client.post('/api/templates/save',
                               json=payload,
                               content_type='application/json')
            data = resp.get_json()
            assert data['success'] is False
        finally:
            email_app.APP_MODE = original_mode

    def test_admin_delete_shared_template_blocked_in_user_mode(self, client):
        original_mode = email_app.APP_MODE
        email_app.APP_MODE = 'user'
        try:
            resp = client.delete('/api/templates/delete?filename=x.json&type=shared')
            data = resp.get_json()
            assert data['success'] is False
        finally:
            email_app.APP_MODE = original_mode


class TestTemplateFullCycle:
    """Интеграционный тест: сохранить → загрузить → переименовать → удалить"""

    def test_full_template_lifecycle(self, client):
        setup_templates_dir = os.path.join(FAKE_NETWORK, 'templates')
        os.makedirs(setup_templates_dir, exist_ok=True)
        email_app.NETWORK_RESOURCES_PATH = FAKE_NETWORK

        # 1. Сохраняем
        payload = {
            'name': 'Lifecycle Test',
            'blocks': [{'id': 99, 'type': 'divider'}],
            'type': 'personal'
        }
        resp = client.post('/api/templates/save', json=payload, content_type='application/json')
        assert resp.status_code == 200
        save_data = resp.get_json()
        template_id = save_data['id']

        # 2. Загружаем
        resp = client.get(f'/api/templates/load?id={template_id}&type=personal')
        assert resp.status_code == 200
        template = resp.get_json()['template']
        assert template['name'] == 'Lifecycle Test'

        # 3. Переименовываем
        resp = client.put('/api/templates/rename',
                          json={'id': template_id, 'newName': 'Renamed', 'type': 'personal'},
                          content_type='application/json')
        data = resp.get_json()
        assert data['success'] is True

        # 4. Удаляем (id не меняется при переименовании — файл тот же)
        resp = client.delete(f'/api/templates/delete?id={template_id}&type=personal')
        assert resp.get_json()['success'] is True
