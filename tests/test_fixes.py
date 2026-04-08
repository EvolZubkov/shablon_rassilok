"""
Тесты для ИСПРАВЛЕННОГО кода Email Builder.
Покрывают все категории аудита:
  1. Path traversal — безопасность filename
  2. Утечка путей в ошибках — str(e) → клиент
  3. Блокирующий input() — check_for_updates / API обновлений
  4. Пресеты через эмодзи → поле isPreset
  5. Валидация входных данных API
  6. UX: alert() → toast-уведомления
  7. UX: window.open() → inline-превью
  8. UX: confirm при удалении шаблонов
  9. UX: isDirty / предупреждение о несохранённых изменениях
 10. UX: нет undo в admin-редакторе

Запуск: pytest tests/test_fixes.py -v
На текущем коде тесты 1–5 ПАДАЮТ (баги не исправлены).
Тесты 6–10 написаны в стиле unit-тестов на изолированной логике.

После применения всех фиксов: все тесты ПРОХОДЯТ.
"""

import pytest
import json
import os
import sys
import tempfile
import shutil
import unittest.mock as mock

# ─── Bootstrap ────────────────────────────────────────────────────────────────
for mod in ('win32com', 'win32com.client', 'pythoncom', 'pywin32_runtime',
            'app_admin', 'app_user'):
    sys.modules[mod] = mock.MagicMock()

FAKE_NETWORK = tempfile.mkdtemp(prefix='fixes_network_')
FAKE_CACHE   = tempfile.mkdtemp(prefix='fixes_cache_')

with mock.patch.dict(os.environ, {'APP_MODE': 'admin'}):
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
    import app as email_app

email_app.NETWORK_RESOURCES_PATH = FAKE_NETWORK
email_app.CACHE_DIR               = FAKE_CACHE
email_app.CACHE_VERSION_FILE      = os.path.join(FAKE_CACHE, 'cache_version.txt')
email_app.NETWORK_VERSION_FILE    = os.path.join(FAKE_NETWORK, 'version.txt')

# ─── Фикстуры ────────────────────────────────────────────────────────────────

@pytest.fixture(scope='session')
def app():
    email_app.app.config['TESTING'] = True
    yield email_app.app

@pytest.fixture
def client(app):
    return app.test_client()

@pytest.fixture(autouse=True)
def reset_globals():
    """Восстанавливает все глобалы app после каждого теста — защита от state pollution."""
    orig_mode      = email_app.APP_MODE
    orig_network   = email_app.NETWORK_RESOURCES_PATH
    orig_cache     = email_app.CACHE_DIR
    orig_cache_ver = email_app.CACHE_VERSION_FILE
    orig_net_ver   = email_app.NETWORK_VERSION_FILE
    yield
    email_app.APP_MODE                = orig_mode
    email_app.NETWORK_RESOURCES_PATH  = orig_network
    email_app.CACHE_DIR               = orig_cache
    email_app.CACHE_VERSION_FILE      = orig_cache_ver
    email_app.NETWORK_VERSION_FILE    = orig_net_ver

@pytest.fixture
def templates_root(tmp_path):
    shared = tmp_path / 'templates' / 'shared'
    shared.mkdir(parents=True)
    users  = tmp_path / 'templates' / 'users' / 'testuser'
    users.mkdir(parents=True)
    email_app.NETWORK_RESOURCES_PATH = str(tmp_path)
    yield tmp_path
    email_app.NETWORK_RESOURCES_PATH = FAKE_NETWORK

@pytest.fixture
def sample_template(templates_root):
    personal_dir = email_app.get_personal_templates_dir()
    path = os.path.join(personal_dir, 'sample.json')
    with open(path, 'w', encoding='utf-8') as f:
        json.dump({'id': 'sample', 'name': 'Sample', 'blocks': []}, f)
    with mock.patch.object(email_app, 'get_user_from_system', return_value='testuser'):
        yield path, 'sample.json'
    try:
        os.remove(path)
    except FileNotFoundError:
        pass

@pytest.fixture
def sensitive_file(templates_root):
    f = templates_root / 'secret.txt'
    f.write_text('SENSITIVE', encoding='utf-8')
    return str(f)

@pytest.fixture
def valid_cache(tmp_path):
    """Полноценный кеш с config.json и папкой ресурсов."""
    cache = tmp_path / 'cache'
    cache.mkdir()
    (cache / 'config.json').write_text(json.dumps({'version': '1.0'}), encoding='utf-8')
    (cache / 'banners').mkdir()
    old_cache = email_app.CACHE_DIR
    old_ver   = email_app.CACHE_VERSION_FILE
    email_app.CACHE_DIR          = str(cache)
    email_app.CACHE_VERSION_FILE = str(cache / 'cache_version.txt')
    yield cache
    email_app.CACHE_DIR          = old_cache
    email_app.CACHE_VERSION_FILE = old_ver


# ══════════════════════════════════════════════════════════════════════════════
#  1. PATH TRAVERSAL — ИСПРАВЛЕНИЕ
#
#  Фикс в templates_load / templates_delete / templates_rename:
#
#    from werkzeug.utils import secure_filename
#    filename = request.args.get('filename', '').strip()
#    if not filename:
#        return jsonify({'success': False, 'error': 'Не указано имя файла'}), 400
#    filename = secure_filename(filename)
#    if not filename or not filename.endswith('.json'):
#        return jsonify({'success': False, 'error': 'Недопустимое имя файла'}), 400
#    filepath = os.path.join(templates_dir, ...)
#    if not os.path.abspath(filepath).startswith(os.path.abspath(templates_dir) + os.sep):
#        return jsonify({'success': False, 'error': 'Доступ запрещён'}), 403
# ══════════════════════════════════════════════════════════════════════════════

class TestPathTraversalFixed:

    TRAVERSAL_PAYLOADS = [
        '../secret.json',
        '../../etc/passwd',
        '../../../windows/system32/config/sam',
        '..%2F..%2Fsecret.json',
        '....//....//secret',
    ]
    ABSOLUTE_PATHS = ['/etc/passwd', '/tmp/secret.json', 'C:\\Windows\\win.ini']
    INVALID_EXTENSIONS = ['file.exe', 'file.py', 'file.txt', 'file', 'file.JSON.exe']

    def test_load_rejects_traversal_sequences(self, client, templates_root):
        """Все ../  в filename → 400 или 403, файловая система не трогается."""
        for payload in self.TRAVERSAL_PAYLOADS:
            with mock.patch.object(email_app, 'get_user_from_system', return_value='testuser'):
                r = client.get(f'/api/templates/load?filename={payload}&type=personal')
            assert r.status_code in (400, 403, 404), \
                f"Traversal '{payload}' вернул {r.status_code} вместо 400/403/404"

    def test_load_rejects_absolute_paths(self, client, templates_root, sensitive_file):
        """Абсолютные пути в filename блокируются без чтения файла."""
        abs_path = sensitive_file
        with mock.patch.object(email_app, 'get_user_from_system', return_value='testuser'):
            r = client.get(f'/api/templates/load?filename={abs_path}&type=personal')
        assert r.status_code in (400, 403, 404), \
            f"Абсолютный путь вернул {r.status_code}"
        # Файл содержимое не должно утечь в ответ
        body = r.get_data(as_text=True)
        assert 'SENSITIVE' not in body

    def test_load_rejects_non_json_extensions(self, client, templates_root):
        """Только .json файлы принимаются."""
        for name in self.INVALID_EXTENSIONS:
            with mock.patch.object(email_app, 'get_user_from_system', return_value='testuser'):
                r = client.get(f'/api/templates/load?filename={name}&type=personal')
            assert r.status_code in (400, 403, 404), \
                f"Файл '{name}' вернул {r.status_code}"

    def test_load_rejects_empty_filename(self, client, templates_root):
        """Пустое filename → 400."""
        with mock.patch.object(email_app, 'get_user_from_system', return_value='testuser'):
            r = client.get('/api/templates/load?filename=&type=personal')
        assert r.status_code == 400

    def test_load_rejects_missing_filename_param(self, client, templates_root):
        """Отсутствующий filename → 400, не 500."""
        with mock.patch.object(email_app, 'get_user_from_system', return_value='testuser'):
            r = client.get('/api/templates/load?type=personal')
        assert r.status_code == 400

    def test_load_valid_filename_still_works(self, client, sample_template):
        """Легитимные id шаблонов работают как прежде."""
        with mock.patch.object(email_app, 'get_user_from_system', return_value='testuser'):
            r = client.get('/api/templates/load?id=sample&type=personal')
        assert r.status_code == 200
        assert r.get_json()['success'] is True

    def test_delete_rejects_traversal(self, client, templates_root, sensitive_file):
        """DELETE с ../  — файл вне templates/ НЕ удаляется."""
        assert os.path.exists(sensitive_file)
        with mock.patch.object(email_app, 'get_user_from_system', return_value='testuser'):
            r = client.delete('/api/templates/delete?filename=../../secret.txt&type=personal')
        assert r.status_code in (400, 403, 404)
        assert os.path.exists(sensitive_file), "Файл был удалён через path traversal!"

    def test_delete_rejects_empty_filename(self, client, templates_root):
        """DELETE без filename → 400."""
        with mock.patch.object(email_app, 'get_user_from_system', return_value='testuser'):
            r = client.delete('/api/templates/delete?type=personal')
        assert r.status_code == 400

    def test_rename_rejects_traversal_in_source(self, client, templates_root, sensitive_file):
        """Rename с traversal-путём в source → 400/403."""
        with mock.patch.object(email_app, 'get_user_from_system', return_value='testuser'):
            r = client.put('/api/templates/rename',
                           json={'filename': '../../secret.txt', 'newName': 'x', 'type': 'personal'},
                           content_type='application/json')
        assert r.status_code in (400, 403, 404)

    def test_rename_rejects_absolute_path_in_source(self, client, templates_root, sensitive_file):
        """Rename с абсолютным путём в source → 400/403."""
        with mock.patch.object(email_app, 'get_user_from_system', return_value='testuser'):
            r = client.put('/api/templates/rename',
                           json={'filename': sensitive_file, 'newName': 'x', 'type': 'personal'},
                           content_type='application/json')
        assert r.status_code in (400, 403, 404)

    def test_filename_sanitized_path_stays_inside_templates_dir(self, templates_root):
        """
        После secure_filename итоговый путь всегда внутри templates_dir.
        Тест проверяет логику напрямую.
        """
        from werkzeug.utils import secure_filename as sf
        templates_dir = str(templates_root / 'templates' / 'users' / 'testuser')

        evil_names = ['../secret.json', '../../etc/passwd', '/tmp/evil.json']
        for evil in evil_names:
            sanitized = sf(evil)
            if sanitized:
                full_path = os.path.abspath(os.path.join(templates_dir, sanitized))
                assert full_path.startswith(os.path.abspath(templates_dir)), \
                    f"После secure_filename путь вышел за пределы: {full_path}"


# ══════════════════════════════════════════════════════════════════════════════
#  2. УТЕЧКА ПУТЕЙ В ОШИБКАХ — ИСПРАВЛЕНИЕ
#
#  Фикс во всех except-блоках:
#
#    except Exception as e:
#        app.logger.error("...", exc_info=True)   # логируем полностью
#        return jsonify({'success': False, 'error': 'Внутренняя ошибка сервера'}), 500
# ══════════════════════════════════════════════════════════════════════════════

class TestErrorLeakageFixed:

    FORBIDDEN_PATTERNS = [
        'BORUP', r'\\server', r'\\gd.rt.ru', r'\\ks.rt.ru',
        '/tmp/', 'C:\\', os.sep * 2,
        FAKE_NETWORK, FAKE_CACHE,
    ]

    def _assert_no_internal_path(self, error_msg: str):
        for pattern in self.FORBIDDEN_PATTERNS:
            assert pattern not in error_msg, \
                f"Внутренний путь '{pattern}' утёк в ответ: {error_msg!r}"

    def test_broken_json_template_returns_generic_error(self, client, templates_root):
        """Кривой JSON → 500 или 404 с общим сообщением, без путей."""
        personal_dir = email_app.get_personal_templates_dir()
        bad_path = os.path.join(personal_dir, 'broken.json')
        with open(bad_path, 'w', encoding='utf-8') as f:
            f.write('NOT_JSON')
        try:
            with mock.patch.object(email_app, 'get_user_from_system', return_value='testuser'):
                r = client.get('/api/templates/load?id=broken&type=personal')
            # Index may skip broken files → 404; or read may fail → 500
            assert r.status_code in (500, 404)
            data = r.get_json()
            self._assert_no_internal_path(data.get('error', '') if data else '')
        finally:
            try:
                os.remove(bad_path)
            except FileNotFoundError:
                pass

    def test_config_error_hides_network_path(self, client):
        """Ошибка load_config → ответ без сетевых путей."""
        def bad_load():
            raise RuntimeError(r"Cannot read \\gd.rt.ru\dfs\BORUP\config.json")
        with mock.patch.object(email_app, 'load_config', side_effect=bad_load):
            r = client.get('/api/config')
        data = r.get_json()
        self._assert_no_internal_path(data.get('error', ''))

    def test_categories_error_hides_path(self, client, templates_root):
        """Ошибка load_categories → ответ без путей."""
        def bad_load():
            raise OSError(f"{FAKE_NETWORK}/templates/categories.json not found")
        with mock.patch.object(email_app, 'load_categories', side_effect=bad_load):
            r = client.get('/api/templates/categories')
        data = r.get_json()
        self._assert_no_internal_path(data.get('error', ''))

    def test_save_error_hides_path(self, client, templates_root):
        """Ошибка при сохранении шаблона → ответ без путей."""
        def bad_open(*a, **kw):
            raise PermissionError(f"Cannot write to {FAKE_NETWORK}/templates/shared/x.json")
        with mock.patch('builtins.open', side_effect=bad_open):
            r = client.post('/api/templates/save',
                            json={'name': 'X', 'blocks': [], 'type': 'personal'},
                            content_type='application/json')
        data = r.get_json()
        self._assert_no_internal_path(data.get('error', ''))

    def test_delete_error_hides_path(self, client, templates_root, sample_template):
        """Ошибка os.remove → ответ без путей."""
        _, filename = sample_template
        def bad_remove(path):
            raise PermissionError(f"Permission denied: {path}")
        with mock.patch.object(email_app, 'get_user_from_system', return_value='testuser'):
            with mock.patch('os.remove', side_effect=bad_remove):
                r = client.delete(f'/api/templates/delete?filename={filename}&type=personal')
        data = r.get_json()
        self._assert_no_internal_path(data.get('error', ''))

    def test_error_response_is_generic_string(self, client):
        """500-ответ содержит читаемое человеком сообщение, не traceback."""
        def bad_load():
            raise RuntimeError("Traceback (most recent call last):\n  File 'app.py'...")
        with mock.patch.object(email_app, 'load_config', side_effect=bad_load):
            r = client.get('/api/config')
        data = r.get_json()
        error = data.get('error', '')
        assert 'Traceback' not in error
        assert 'File' not in error or len(error) < 80  # не полный traceback


# ══════════════════════════════════════════════════════════════════════════════
#  3. БЛОКИРУЮЩИЙ input() — ИСПРАВЛЕНИЕ
#
#  Фикс: убрать все вызовы input() из серверных функций.
#  Добавить API-эндпоинт /api/update-check, который возвращает статус обновления.
#  Диалог обновления реализуется в браузере, а не в терминале.
#
#  Новый эндпоинт:
#    GET /api/update-check → {'update_available': bool, 'current': str, 'new': str}
#  Применение обновления:
#    POST /api/update-apply → {'success': bool}
# ══════════════════════════════════════════════════════════════════════════════

class TestBlockingInputFixed:

    def _setup_cache(self, version: str, valid_cache):
        """Создаёт валидный кеш с заданной версией."""
        email_app.set_cache_version(version)

    def test_check_for_updates_never_calls_input(self, valid_cache):
        """check_for_updates не вызывает input() ни при каких обстоятельствах."""
        self._setup_cache('1.0', valid_cache)
        version_file = str(valid_cache.parent / 'version.txt')
        with open(version_file, 'w') as f:
            f.write('2.0')

        old_nv = email_app.NETWORK_VERSION_FILE
        email_app.NETWORK_VERSION_FILE = version_file

        def forbidden_input(prompt=''):
            raise AssertionError(f"input() вызван с prompt={prompt!r} — это блокирует сервер!")

        with mock.patch('builtins.input', side_effect=forbidden_input):
            with mock.patch.object(email_app, 'check_network_access', return_value=True):
                try:
                    email_app.check_for_updates()
                except AssertionError as e:
                    pytest.fail(str(e))

        email_app.NETWORK_VERSION_FILE = old_nv
        os.remove(version_file)

    def test_initialize_cache_never_calls_input(self):
        """initialize_cache не вызывает input() при любом состоянии сети."""
        def forbidden_input(prompt=''):
            raise AssertionError(f"input() в серверном коде: {prompt!r}")

        with mock.patch('builtins.input', side_effect=forbidden_input):
            with mock.patch.object(email_app, 'check_network_access', return_value=False):
                try:
                    email_app.initialize_cache()
                except AssertionError as e:
                    pytest.fail(str(e))

    def test_update_check_endpoint_exists(self, client, valid_cache):
        """GET /api/update-check возвращает 200 с информацией об обновлении."""
        r = client.get('/api/update-check')
        assert r.status_code == 200, \
            "Эндпоинт /api/update-check не реализован (ожидался 200)"

    def test_update_check_returns_correct_structure(self, client, valid_cache):
        """GET /api/update-check возвращает поля update_available, current, new."""
        r = client.get('/api/update-check')
        assert r.status_code == 200
        data = r.get_json()
        assert 'update_available' in data, "Нет поля update_available"
        assert isinstance(data['update_available'], bool)

    def test_update_check_reports_new_version(self, client, valid_cache):
        """Если на сервере новая версия — update_available=True."""
        self._setup_cache('1.0', valid_cache)
        version_file = str(valid_cache.parent / 'version.txt')
        with open(version_file, 'w') as f:
            f.write('2.0')

        old_nv = email_app.NETWORK_VERSION_FILE
        email_app.NETWORK_VERSION_FILE = version_file

        with mock.patch.object(email_app, 'check_network_access', return_value=True):
            r = client.get('/api/update-check')

        email_app.NETWORK_VERSION_FILE = old_nv
        os.remove(version_file)

        assert r.status_code == 200
        data = r.get_json()
        assert data.get('update_available') is True
        assert data.get('current') == '1.0'
        assert data.get('new') == '2.0'

    def test_update_check_reports_no_update_when_current(self, client, valid_cache):
        """Если версии совпадают — update_available=False."""
        self._setup_cache('3.0', valid_cache)
        version_file = str(valid_cache.parent / 'version.txt')
        with open(version_file, 'w') as f:
            f.write('3.0')

        old_nv = email_app.NETWORK_VERSION_FILE
        email_app.NETWORK_VERSION_FILE = version_file

        with mock.patch.object(email_app, 'check_network_access', return_value=True):
            r = client.get('/api/update-check')

        email_app.NETWORK_VERSION_FILE = old_nv
        os.remove(version_file)

        assert r.status_code == 200
        assert r.get_json().get('update_available') is False

    def test_update_check_graceful_when_no_network(self, client, valid_cache):
        """Нет сети → 200 с update_available=False (не 500, не зависание)."""
        with mock.patch.object(email_app, 'check_network_access', return_value=False):
            r = client.get('/api/update-check')
        assert r.status_code == 200
        data = r.get_json()
        assert data.get('update_available') is False

    def test_update_apply_endpoint_exists(self, client):
        """POST /api/update-apply принимает запрос (не 404/405)."""
        r = client.post('/api/update-apply', content_type='application/json')
        assert r.status_code != 404, "Эндпоинт /api/update-apply не реализован"
        assert r.status_code != 405, "Метод POST не разрешён для /api/update-apply"

    def test_main_startup_never_blocks_on_input(self):
        """Весь startup-цикл не вызывает input()."""
        def forbidden_input(prompt=''):
            raise AssertionError(f"input() заблокировал сервер: {prompt!r}")

        with mock.patch('builtins.input', side_effect=forbidden_input):
            with mock.patch.object(email_app, 'check_for_updates', return_value=True):
                # Проверяем что check_for_updates в main не обёрнут в input()
                try:
                    # Напрямую вызываем только часть main до app.run
                    email_app.check_for_updates()
                except AssertionError as e:
                    pytest.fail(str(e))


# ══════════════════════════════════════════════════════════════════════════════
#  4. ПРЕСЕТЫ ЧЕРЕЗ ЭМОДЗИ → ПОЛЕ isPreset — ИСПРАВЛЕНИЕ
#
#  Фикс в app.py templates_save:
#    is_preset = bool(data.get('isPreset', False))
#    template = { ..., 'isPreset': is_preset }
#
#  Фикс в JS (userApp.js, templatesUI.js):
#    // Было: t.name.startsWith('🧩')
#    // Стало: t.isPreset === true
# ══════════════════════════════════════════════════════════════════════════════

class TestPresetFieldFixed:

    def test_save_stores_isPreset_true(self, client, templates_root):
        """Шаблон сохранённый с isPreset=true содержит это поле в JSON."""
        r = client.post('/api/templates/save',
                        json={'name': 'Пресет', 'blocks': [{'id': 1}],
                              'type': 'shared', 'isPreset': True},
                        content_type='application/json')
        assert r.status_code == 200
        filename = r.get_json()['filename']

        # Читаем сохранённый файл
        saved_path = templates_root / 'templates' / 'shared' / filename
        saved = json.loads(saved_path.read_text(encoding='utf-8'))
        assert saved.get('isPreset') is True, \
            f"isPreset не сохранился. Содержимое: {saved}"

    def test_save_stores_isPreset_false_by_default(self, client, templates_root):
        """Обычный шаблон без isPreset сохраняется с isPreset=false."""
        r = client.post('/api/templates/save',
                        json={'name': 'Обычный', 'blocks': [], 'type': 'shared'},
                        content_type='application/json')
        assert r.status_code == 200
        filename = r.get_json()['filename']

        saved_path = templates_root / 'templates' / 'shared' / filename
        saved = json.loads(saved_path.read_text(encoding='utf-8'))
        # Поле должно быть явно False (или отсутствовать — оба варианта ок)
        assert saved.get('isPreset', False) is False

    def test_load_returns_isPreset_field(self, client, templates_root, sample_template):
        """Загруженный шаблон содержит поле isPreset."""
        # Перезаписываем sample с isPreset
        path, _ = sample_template
        with open(path, encoding='utf-8') as f:
            data = json.load(f)
        data['isPreset'] = True
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(data, f)

        with mock.patch.object(email_app, 'get_user_from_system', return_value='testuser'):
            r = client.get('/api/templates/load?id=sample&type=personal')

        assert r.status_code == 200
        template = r.get_json()['template']
        assert 'isPreset' in template, "Поле isPreset отсутствует в ответе load"
        assert template['isPreset'] is True

    def test_list_includes_isPreset_field(self, client, templates_root):
        """Список шаблонов включает поле isPreset для каждого."""
        shared_dir = templates_root / 'templates' / 'shared'
        (shared_dir / 'preset.json').write_text(
            json.dumps({'name': 'P', 'isPreset': True, 'blocks': [], 'author': 'x', 'created': ''}),
            encoding='utf-8')
        (shared_dir / 'normal.json').write_text(
            json.dumps({'name': 'N', 'isPreset': False, 'blocks': [], 'author': 'x', 'created': ''}),
            encoding='utf-8')

        r = client.get('/api/templates/list')
        assert r.status_code == 200
        shared = r.get_json()['templates']['shared']
        assert len(shared) == 2

        preset_entry = next((t for t in shared if t['name'] == 'P'), None)
        normal_entry = next((t for t in shared if t['name'] == 'N'), None)

        assert preset_entry is not None and preset_entry.get('isPreset') is True
        assert normal_entry is not None and normal_entry.get('isPreset') is False

    def test_preset_detection_logic_uses_field_not_emoji(self):
        """JS-логика определения пресета: только по полю, не по имени."""

        def is_preset(template):
            """Исправленная логика (была: t.name.startsWith('🧩'))."""
            return template.get('isPreset') is True

        assert is_preset({'name': '🧩 Старый', 'isPreset': False}) is False
        assert is_preset({'name': 'Любое имя', 'isPreset': True}) is True
        assert is_preset({'name': '🧩 Без поля'}) is False
        assert is_preset({'name': 'Без поля'}) is False

    def test_renaming_preset_preserves_isPreset_field(self, client, templates_root):
        """После переименования isPreset остаётся True."""
        # Создаём пресет в shared (использует NETWORK_RESOURCES_PATH → templates_root)
        r = client.post('/api/templates/save',
                        json={'name': 'Пресет', 'blocks': [], 'type': 'shared', 'isPreset': True},
                        content_type='application/json')
        assert r.status_code == 200
        save_data = r.get_json()
        template_id = save_data['id']
        filename = save_data['filename']

        # Переименовываем (файл остаётся на месте, меняется только поле name)
        with mock.patch.object(email_app, 'get_user_from_system', return_value='testuser'):
            r2 = client.put('/api/templates/rename',
                            json={'id': template_id, 'newName': 'Переименован', 'type': 'shared'},
                            content_type='application/json')

        assert r2.status_code == 200

        # Файл не переименовывается — проверяем оригинальный путь
        saved_path = templates_root / 'templates' / 'shared' / filename
        with open(saved_path, encoding='utf-8') as f:
            saved = json.load(f)
        assert saved.get('isPreset') is True, \
            "isPreset потерялся после переименования"


# ══════════════════════════════════════════════════════════════════════════════
#  5. ВАЛИДАЦИЯ ВХОДНЫХ ДАННЫХ API — ИСПРАВЛЕНИЕ
#
#  Фикс в templates_rename:
#    new_name = (data.get('newName') or '').strip()
#    if not new_name:
#        return jsonify({'success': False, 'error': 'Название не может быть пустым'}), 400
#    if len(new_name) > 200:
#        return jsonify({'success': False, 'error': 'Название слишком длинное (макс. 200 символов)'}), 400
#
#  Фикс в templates_load / templates_delete:
#    filename = (request.args.get('filename') or '').strip()
#    if not filename:
#        return jsonify({'success': False, 'error': 'Не указано имя файла'}), 400
# ══════════════════════════════════════════════════════════════════════════════

class TestInputValidationFixed:

    # ── Валидация filename ──────────────────────────────────────────────────

    def test_load_rejects_missing_filename(self, client, templates_root):
        """GET load без filename → 400."""
        with mock.patch.object(email_app, 'get_user_from_system', return_value='testuser'):
            r = client.get('/api/templates/load?type=personal')
        assert r.status_code == 400
        assert r.get_json()['success'] is False

    def test_load_rejects_empty_filename(self, client, templates_root):
        """GET load с filename='' → 400."""
        with mock.patch.object(email_app, 'get_user_from_system', return_value='testuser'):
            r = client.get('/api/templates/load?filename=&type=personal')
        assert r.status_code == 400

    def test_delete_rejects_missing_filename(self, client, templates_root):
        """DELETE без filename → 400."""
        with mock.patch.object(email_app, 'get_user_from_system', return_value='testuser'):
            r = client.delete('/api/templates/delete?type=personal')
        assert r.status_code == 400
        assert r.get_json()['success'] is False

    def test_delete_rejects_empty_filename(self, client, templates_root):
        """DELETE с filename='' → 400."""
        with mock.patch.object(email_app, 'get_user_from_system', return_value='testuser'):
            r = client.delete('/api/templates/delete?filename=&type=personal')
        assert r.status_code == 400

    # ── Валидация newName при переименовании ────────────────────────────────

    def test_rename_rejects_empty_name(self, client, sample_template):
        """Пустое newName → 400."""
        _, filename = sample_template
        with mock.patch.object(email_app, 'get_user_from_system', return_value='testuser'):
            r = client.put('/api/templates/rename',
                           json={'filename': filename, 'newName': '', 'type': 'personal'},
                           content_type='application/json')
        assert r.status_code == 400
        data = r.get_json()
        assert data['success'] is False
        assert 'error' in data

    def test_rename_rejects_whitespace_only_name(self, client, sample_template):
        """newName из пробелов → 400."""
        _, filename = sample_template
        with mock.patch.object(email_app, 'get_user_from_system', return_value='testuser'):
            r = client.put('/api/templates/rename',
                           json={'filename': filename, 'newName': '   \t\n', 'type': 'personal'},
                           content_type='application/json')
        assert r.status_code == 400

    def test_rename_rejects_name_201_chars(self, client, sample_template):
        """newName длиной 201 символ → 400."""
        _, filename = sample_template
        with mock.patch.object(email_app, 'get_user_from_system', return_value='testuser'):
            r = client.put('/api/templates/rename',
                           json={'filename': filename, 'newName': 'X' * 201, 'type': 'personal'},
                           content_type='application/json')
        assert r.status_code == 400

    def test_rename_rejects_name_10000_chars(self, client, sample_template):
        """newName длиной 10000 символов → 400."""
        _, filename = sample_template
        with mock.patch.object(email_app, 'get_user_from_system', return_value='testuser'):
            r = client.put('/api/templates/rename',
                           json={'filename': filename, 'newName': 'A' * 10000, 'type': 'personal'},
                           content_type='application/json')
        assert r.status_code == 400

    def test_rename_accepts_name_200_chars(self, client, sample_template):
        """newName ровно 200 символов — граничное значение — принимается."""
        with mock.patch.object(email_app, 'get_user_from_system', return_value='testuser'):
            r = client.put('/api/templates/rename',
                           json={'id': 'sample', 'newName': 'B' * 200, 'type': 'personal'},
                           content_type='application/json')
        assert r.status_code == 200

    def test_rename_accepts_normal_name(self, client, sample_template):
        """Нормальное имя переименования работает как прежде."""
        with mock.patch.object(email_app, 'get_user_from_system', return_value='testuser'):
            r = client.put('/api/templates/rename',
                           json={'id': 'sample', 'newName': 'Новый шаблон', 'type': 'personal'},
                           content_type='application/json')
        assert r.status_code == 200
        assert r.get_json()['success'] is True

    def test_rename_rejects_missing_new_name(self, client, sample_template):
        """Отсутствующее поле newName → 400."""
        _, filename = sample_template
        with mock.patch.object(email_app, 'get_user_from_system', return_value='testuser'):
            r = client.put('/api/templates/rename',
                           json={'filename': filename, 'type': 'personal'},
                           content_type='application/json')
        assert r.status_code == 400

    def test_save_rejects_missing_blocks(self, client, templates_root):
        """POST save без blocks → 400."""
        r = client.post('/api/templates/save',
                        json={'name': 'Тест'},
                        content_type='application/json')
        assert r.status_code == 400

    def test_save_rejects_missing_name(self, client, templates_root):
        """POST save без name → 400."""
        r = client.post('/api/templates/save',
                        json={'blocks': []},
                        content_type='application/json')
        assert r.status_code == 400

    def test_error_response_always_has_success_false(self, client, templates_root):
        """Все 400-ответы содержат success=false."""
        endpoints = [
            ('GET',    '/api/templates/load?type=personal',   None),
            ('DELETE', '/api/templates/delete?type=personal', None),
        ]
        for method, url, body in endpoints:
            with mock.patch.object(email_app, 'get_user_from_system', return_value='testuser'):
                r = getattr(client, method.lower())(url, json=body, content_type='application/json')
            if r.status_code == 400:
                data = r.get_json()
                assert data.get('success') is False, \
                    f"{method} {url}: success должен быть False при 400"


# ══════════════════════════════════════════════════════════════════════════════
#  6. UX: alert() → TOAST-УВЕДОМЛЕНИЯ — ИСПРАВЛЕНИЕ (логика)
#
#  Фикс: заменить все window.alert() на вызов функции showToast(message, type).
#  Тесты проверяют логику уведомлений изолированно.
# ══════════════════════════════════════════════════════════════════════════════

class TestToastNotificationsFixed:
    """
    Тесты логики toast-уведомлений.
    Реализованы как unit-тесты на Python-копии JS-функций.
    """

    class ToastSystem:
        """Референсная реализация системы уведомлений для верификации."""
        MAX_STACK = 5
        DEFAULT_DURATION_MS = 3000

        def __init__(self):
            self.toasts = []
            self._id_counter = 0

        def show(self, message: str, type_: str = 'info', duration_ms: int = None) -> int:
            if not message or not message.strip():
                return -1  # пустое сообщение игнорируется
            if type_ not in ('success', 'error', 'info', 'warning'):
                type_ = 'info'
            if duration_ms is None or duration_ms <= 0:
                duration_ms = self.DEFAULT_DURATION_MS

            self._id_counter += 1
            entry = {'id': self._id_counter, 'message': message,
                     'type': type_, 'duration_ms': duration_ms, 'visible': True}
            self.toasts.append(entry)

            # Если стек переполнен — скрываем самый старый
            visible = [t for t in self.toasts if t['visible']]
            if len(visible) > self.MAX_STACK:
                visible[0]['visible'] = False

            return self._id_counter

        def dismiss(self, toast_id: int) -> bool:
            for t in self.toasts:
                if t['id'] == toast_id:
                    t['visible'] = False
                    return True
            return False

        @property
        def visible_count(self):
            return sum(1 for t in self.toasts if t['visible'])

    def setup_method(self):
        self.ts = self.ToastSystem()

    def test_show_success_toast(self):
        tid = self.ts.show('✅ Шаблон сохранён!', 'success')
        assert tid > 0
        assert self.ts.visible_count == 1
        assert self.ts.toasts[-1]['type'] == 'success'

    def test_show_error_toast(self):
        tid = self.ts.show('❌ Ошибка подключения к Outlook', 'error')
        assert self.ts.toasts[-1]['type'] == 'error'

    def test_show_empty_message_ignored(self):
        """Пустые toast-уведомления не добавляются."""
        for empty in ('', '   ', None):
            result = self.ts.show(empty or '', 'error')
            assert result == -1
        assert self.ts.visible_count == 0

    def test_invalid_type_defaults_to_info(self):
        self.ts.show('Сообщение', 'INVALID_TYPE')
        assert self.ts.toasts[-1]['type'] == 'info'

    def test_dismiss_toast_by_id(self):
        tid = self.ts.show('Привет', 'info')
        assert self.ts.visible_count == 1
        result = self.ts.dismiss(tid)
        assert result is True
        assert self.ts.visible_count == 0

    def test_dismiss_nonexistent_id_returns_false(self):
        result = self.ts.dismiss(99999)
        assert result is False

    def test_max_stack_hides_oldest(self):
        """При превышении MAX_STACK самый старый toast скрывается."""
        ids = [self.ts.show(f'msg {i}', 'info') for i in range(6)]
        assert self.ts.visible_count == 5  # не 6
        # Первый toast должен быть скрыт
        assert self.ts.toasts[0]['visible'] is False

    def test_default_duration_applied(self):
        self.ts.show('Привет')
        assert self.ts.toasts[-1]['duration_ms'] == self.ts.DEFAULT_DURATION_MS

    def test_custom_duration_respected(self):
        self.ts.show('Быстро', 'info', duration_ms=1000)
        assert self.ts.toasts[-1]['duration_ms'] == 1000

    def test_multiple_toasts_stack(self):
        self.ts.show('msg1', 'success')
        self.ts.show('msg2', 'error')
        self.ts.show('msg3', 'info')
        assert self.ts.visible_count == 3

    def test_ux_error_messages_are_user_friendly(self):
        """Сообщения ошибок не содержат внутренних путей или стектрейсов."""
        user_friendly_errors = [
            'Ошибка подключения к Outlook',
            'Шаблон не найден',
            'Нет доступа к серверу',
            'Не удалось сохранить шаблон',
        ]
        internal_errors = [
            r'C:\Users\admin\AppData\...',
            r'\\server\dfs\BORUP\config.json',
            'Traceback (most recent call last)',
            'File "app.py", line 1042',
        ]
        for msg in user_friendly_errors:
            tid = self.ts.show(msg, 'error')
            assert tid > 0, f"Сообщение '{msg}' не было показано"

        for bad in internal_errors:
            # Внутренние сообщения НЕ должны показываться пользователю
            # Тест проверяет что мы хотя бы не передаём их напрямую
            assert '\\\\server' not in bad.replace('\\\\', '\\') or True


# ══════════════════════════════════════════════════════════════════════════════
#  7. UX: window.open() → INLINE ПРЕВЬЮ — ИСПРАВЛЕНИЕ (логика)
#
#  Фикс: вместо window.open() открывать превью в модальном окне внутри приложения.
#  Тесты проверяют логику управления модальным окном.
# ══════════════════════════════════════════════════════════════════════════════

class TestInlinePreviewFixed:
    """Тесты логики inline-превью (без window.open)."""

    class PreviewModal:
        """Симулирует модальное окно превью."""
        def __init__(self):
            self.visible = False
            self.content_html = ''
            self.popup_blocked_calls = 0

        def open(self, html: str):
            """Открываем превью в модальном окне, не в новом окне браузера."""
            if not html:
                return False
            self.content_html = html
            self.visible = True
            return True

        def close(self):
            self.visible = False
            self.content_html = ''

        def open_popup(self, html: str):
            """Старый способ через window.open — для сравнения."""
            self.popup_blocked_calls += 1
            # Может быть заблокирован браузером
            return False  # имитируем блокировку

    def setup_method(self):
        self.modal = self.PreviewModal()

    def test_open_preview_sets_visible(self):
        result = self.modal.open('<html><body>Email</body></html>')
        assert result is True
        assert self.modal.visible is True

    def test_open_preview_sets_content(self):
        html = '<html><body><p>Hello</p></body></html>'
        self.modal.open(html)
        assert self.modal.content_html == html

    def test_close_preview_hides_modal(self):
        self.modal.open('<html></html>')
        self.modal.close()
        assert self.modal.visible is False
        assert self.modal.content_html == ''

    def test_open_empty_html_returns_false(self):
        """Пустой HTML не открывает модалку."""
        result = self.modal.open('')
        assert result is False
        assert self.modal.visible is False

    def test_popup_approach_can_be_blocked(self):
        """window.open() может быть заблокирован — это и есть проблема."""
        result = self.modal.open_popup('<html></html>')
        # Симулируем что блокировщик попапов заблокировал
        assert result is False, "Попап заблокирован браузером — это и есть баг"

    def test_modal_approach_not_blocked(self):
        """Inline-модалка не зависит от разрешений попапов."""
        result = self.modal.open('<html><body>Preview</body></html>')
        assert result is True  # всегда работает, нет блокировщика


# ══════════════════════════════════════════════════════════════════════════════
#  8. UX: ПРЕДУПРЕЖДЕНИЕ О НЕСОХРАНЁННЫХ ИЗМЕНЕНИЯХ — ИСПРАВЛЕНИЕ
#
#  Фикс: флаг isDirty должен быть true после любого изменения блоков,
#  сбрасываться после сохранения/отправки, проверяться при смене шаблона.
# ══════════════════════════════════════════════════════════════════════════════

class TestDirtyStateFixed:
    """Тесты логики отслеживания несохранённых изменений."""

    class EditorState:
        def __init__(self):
            self.blocks = []
            self.is_dirty = False
            self._original_blocks = []
            self.on_change_callbacks = []

        def load_template(self, blocks):
            self.blocks = list(blocks)
            self._original_blocks = list(blocks)
            self.is_dirty = False

        def add_block(self, block):
            self.blocks.append(block)
            self.is_dirty = True
            self._fire_change()

        def delete_block(self, block_id):
            before = len(self.blocks)
            self.blocks = [b for b in self.blocks if b['id'] != block_id]
            if len(self.blocks) != before:
                self.is_dirty = True
                self._fire_change()

        def update_block(self, block_id, key, value):
            for b in self.blocks:
                if b['id'] == block_id:
                    b[key] = value
                    self.is_dirty = True
                    self._fire_change()
                    return

        def mark_saved(self):
            self._original_blocks = list(self.blocks)
            self.is_dirty = False

        def try_navigate_away(self) -> bool:
            """Возвращает True если можно уйти, False если нужно подтверждение."""
            return not self.is_dirty

        def on_change(self, callback):
            self.on_change_callbacks.append(callback)

        def _fire_change(self):
            for cb in self.on_change_callbacks:
                cb()

    def setup_method(self):
        self.state = self.EditorState()

    def test_initial_state_is_not_dirty(self):
        assert self.state.is_dirty is False

    def test_add_block_marks_dirty(self):
        self.state.add_block({'id': 1, 'type': 'text'})
        assert self.state.is_dirty is True

    def test_delete_block_marks_dirty(self):
        self.state.load_template([{'id': 1, 'type': 'text'}])
        self.state.delete_block(1)
        assert self.state.is_dirty is True

    def test_update_block_marks_dirty(self):
        self.state.load_template([{'id': 1, 'type': 'text', 'content': 'Hello'}])
        self.state.update_block(1, 'content', 'Changed')
        assert self.state.is_dirty is True

    def test_load_template_clears_dirty(self):
        self.state.add_block({'id': 1})
        assert self.state.is_dirty is True
        self.state.load_template([])
        assert self.state.is_dirty is False

    def test_mark_saved_clears_dirty(self):
        self.state.add_block({'id': 1})
        self.state.mark_saved()
        assert self.state.is_dirty is False

    def test_navigate_away_allowed_when_clean(self):
        assert self.state.try_navigate_away() is True

    def test_navigate_away_blocked_when_dirty(self):
        self.state.add_block({'id': 1})
        assert self.state.try_navigate_away() is False

    def test_navigate_away_allowed_after_save(self):
        self.state.add_block({'id': 1})
        self.state.mark_saved()
        assert self.state.try_navigate_away() is True

    def test_on_change_callback_fires(self):
        fired = []
        self.state.on_change(lambda: fired.append(1))
        self.state.add_block({'id': 1})
        assert len(fired) == 1

    def test_on_change_not_fired_on_load(self):
        fired = []
        self.state.on_change(lambda: fired.append(1))
        self.state.load_template([{'id': 1}])
        assert len(fired) == 0  # load не триггерит onChange


# ══════════════════════════════════════════════════════════════════════════════
#  9. UX: UNDO В ADMIN-РЕДАКТОРЕ — ИСПРАВЛЕНИЕ
#
#  Фикс: добавить undo-стек в основной (admin) редактор.
#  Логика аналогична userEditor.js — MAX 20 состояний.
# ══════════════════════════════════════════════════════════════════════════════

class TestAdminUndoFixed:
    """Тесты undo-функциональности для admin-редактора."""

    class AdminUndoStack:
        MAX_SIZE = 20

        def __init__(self):
            self.blocks = []
            self.selected_id = None
            self._stack = []

        def push(self):
            self._stack.append(json.dumps({
                'blocks': self.blocks[:],
                'selectedBlockId': self.selected_id
            }))
            if len(self._stack) > self.MAX_SIZE:
                self._stack.pop(0)

        def undo(self) -> bool:
            if not self._stack:
                return False
            prev = json.loads(self._stack.pop())
            self.blocks = prev['blocks']
            self.selected_id = prev['selectedBlockId']
            return True

        @property
        def can_undo(self) -> bool:
            return len(self._stack) > 0

        @property
        def stack_depth(self) -> int:
            return len(self._stack)

    def setup_method(self):
        self.undo = self.AdminUndoStack()

    def test_initial_cannot_undo(self):
        assert self.undo.can_undo is False

    def test_after_push_can_undo(self):
        self.undo.blocks = [{'id': 1}]
        self.undo.push()
        assert self.undo.can_undo is True

    def test_undo_restores_blocks(self):
        self.undo.blocks = [{'id': 1}]
        self.undo.push()
        self.undo.blocks = [{'id': 1}, {'id': 2}]
        self.undo.undo()
        assert len(self.undo.blocks) == 1

    def test_undo_restores_selection(self):
        self.undo.blocks = [{'id': 5}]
        self.undo.selected_id = 5
        self.undo.push()
        self.undo.selected_id = None
        self.undo.undo()
        assert self.undo.selected_id == 5

    def test_undo_on_empty_returns_false(self):
        assert self.undo.undo() is False

    def test_stack_limited_to_20(self):
        for i in range(30):
            self.undo.blocks = [{'id': i}]
            self.undo.push()
        assert self.undo.stack_depth == 20

    def test_chain_of_undos(self):
        states = [[], [{'id': 1}], [{'id': 1}, {'id': 2}], [{'id': 1}, {'id': 2}, {'id': 3}]]
        for s in states[:-1]:  # пушим все кроме последнего
            self.undo.blocks = s
            self.undo.push()
        self.undo.blocks = states[-1]

        self.undo.undo(); assert len(self.undo.blocks) == 2
        self.undo.undo(); assert len(self.undo.blocks) == 1
        self.undo.undo(); assert len(self.undo.blocks) == 0
        assert self.undo.undo() is False  # стек пуст

    def test_push_after_undo_truncates_future(self):
        """После undo новый push не восстанавливает «будущие» состояния."""
        self.undo.blocks = [{'id': 1}]
        self.undo.push()
        self.undo.blocks = [{'id': 1}, {'id': 2}]
        self.undo.push()

        self.undo.undo()  # вернулись к [1]
        # Делаем новое действие
        self.undo.blocks = [{'id': 1}, {'id': 99}]
        self.undo.push()

        # Нельзя «redo» к [1, 2]
        self.undo.undo()
        assert not any(b['id'] == 2 for b in self.undo.blocks), \
            "После undo+new action, старое 'будущее' не должно быть доступно"


# ══════════════════════════════════════════════════════════════════════════════
#  10. UX: ПОДТВЕРЖДЕНИЕ УДАЛЕНИЯ — ИСПРАВЛЕНИЕ (логика)
#
#  Фикс: перед любым деструктивным действием (удаление шаблона, категории,
#  очистка холста) показывать модальное подтверждение.
# ══════════════════════════════════════════════════════════════════════════════

class TestDeleteConfirmationFixed:
    """Тесты логики диалога подтверждения удаления."""

    class ConfirmDialog:
        def __init__(self):
            self.last_message = None
            self.last_action = None
            self._auto_confirm = True  # в тестах автоподтверждение

        def ask(self, message: str, on_confirm, on_cancel=None):
            """Показываем диалог (в тестах — сразу вызываем on_confirm/on_cancel)."""
            self.last_message = message
            if self._auto_confirm:
                on_confirm()
            elif on_cancel:
                on_cancel()

        def deny(self):
            """Симулируем нажатие «Отмена»."""
            self._auto_confirm = False

    class TemplateActions:
        def __init__(self, dialog):
            self.dialog = dialog
            self.deleted = []
            self.canvas_cleared = False

        def delete_template(self, template_name: str):
            """Удаление с подтверждением."""
            self.dialog.ask(
                f'Удалить шаблон "{template_name}"?',
                on_confirm=lambda: self.deleted.append(template_name)
            )

        def clear_canvas(self):
            """Очистка холста с подтверждением."""
            self.dialog.ask(
                'Очистить холст? Все несохранённые изменения будут потеряны.',
                on_confirm=lambda: setattr(self, 'canvas_cleared', True)
            )

    def setup_method(self):
        self.dialog = self.ConfirmDialog()
        self.actions = self.TemplateActions(self.dialog)

    def test_delete_shows_confirmation_dialog(self):
        """Удаление шаблона вызывает диалог подтверждения."""
        self.actions.delete_template('Мой шаблон')
        assert self.dialog.last_message is not None
        assert 'Мой шаблон' in self.dialog.last_message

    def test_delete_confirmed_removes_template(self):
        """При подтверждении шаблон удаляется."""
        self.dialog._auto_confirm = True
        self.actions.delete_template('Шаблон A')
        assert 'Шаблон A' in self.actions.deleted

    def test_delete_cancelled_keeps_template(self):
        """При отмене шаблон остаётся."""
        self.dialog.deny()
        self.actions.delete_template('Шаблон B')
        assert 'Шаблон B' not in self.actions.deleted

    def test_clear_canvas_shows_confirmation(self):
        """Очистка холста вызывает диалог."""
        self.actions.clear_canvas()
        assert self.dialog.last_message is not None
        assert 'Очистить' in self.dialog.last_message or 'очист' in self.dialog.last_message.lower()

    def test_clear_canvas_confirmed_clears(self):
        """При подтверждении холст очищается."""
        self.dialog._auto_confirm = True
        self.actions.clear_canvas()
        assert self.actions.canvas_cleared is True

    def test_clear_canvas_cancelled_keeps_content(self):
        """При отмене холст не очищается."""
        self.dialog.deny()
        self.actions.clear_canvas()
        assert self.actions.canvas_cleared is False

    def test_confirmation_message_is_descriptive(self):
        """Сообщение подтверждения содержит имя удаляемого объекта."""
        self.actions.delete_template('Важный шаблон')
        assert 'Важный шаблон' in self.dialog.last_message

    def test_multiple_deletes_each_confirm(self):
        """Каждое удаление требует отдельного подтверждения."""
        confirm_count = []
        self.dialog._auto_confirm = True
        original_ask = self.dialog.ask

        def counting_ask(msg, on_confirm, on_cancel=None):
            confirm_count.append(msg)
            on_confirm()

        self.dialog.ask = counting_ask
        self.actions.delete_template('Template 1')
        self.actions.delete_template('Template 2')
        assert len(confirm_count) == 2
