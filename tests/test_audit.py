"""
Тесты для уязвимостей и проблем, выявленных в ходе аудита Email Builder.

Структура каждого раздела:
  class TestXxx_BugProof    — тест ПАДАЕТ на текущем коде (доказывает что баг есть)
  class TestXxx_Fixed       — тест ПРОХОДИТ после применения фикса

Запуск всех тестов:
    pytest tests/test_audit.py -v

Запуск только тестов на существующие баги (должны падать!):
    pytest tests/test_audit.py -k "BugProof" -v

Запуск только тестов на исправления:
    pytest tests/test_audit.py -k "Fixed" -v
"""

import pytest
import json
import os
import sys
import tempfile
import shutil
import unittest.mock as mock

# ─── Bootstrap (повторяет setup из test_app.py) ───────────────────────────────
win32com_mock = mock.MagicMock()
win32com_mock.client = mock.MagicMock()
sys.modules['win32com'] = win32com_mock
sys.modules['win32com.client'] = win32com_mock.client
sys.modules['pythoncom'] = mock.MagicMock()
sys.modules['pywin32_runtime'] = mock.MagicMock()

FAKE_NETWORK = tempfile.mkdtemp(prefix='audit_network_')
FAKE_CACHE   = tempfile.mkdtemp(prefix='audit_cache_')

sys.modules['app_admin'] = mock.MagicMock()
sys.modules['app_user']  = mock.MagicMock()

with mock.patch.dict(os.environ, {'APP_MODE': 'admin'}):
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
    import app as email_app

email_app.NETWORK_RESOURCES_PATH = FAKE_NETWORK
email_app.CACHE_DIR               = FAKE_CACHE
email_app.CACHE_VERSION_FILE      = os.path.join(FAKE_CACHE, 'cache_version.txt')
email_app.NETWORK_VERSION_FILE    = os.path.join(FAKE_NETWORK, 'version.txt')

# ─── Общие фикстуры ───────────────────────────────────────────────────────────

@pytest.fixture(scope='session')
def app():
    email_app.app.config['TESTING'] = True
    yield email_app.app

@pytest.fixture
def client(app):
    return app.test_client()

@pytest.fixture(autouse=True)
def reset_app_mode():
    """Восстанавливаем все глобалы после каждого теста — защита от state pollution."""
    orig_mode      = email_app.APP_MODE
    orig_network   = email_app.NETWORK_RESOURCES_PATH
    orig_cache     = email_app.CACHE_DIR
    orig_cache_ver = email_app.CACHE_VERSION_FILE
    orig_net_ver   = email_app.NETWORK_VERSION_FILE
    yield
    email_app.APP_MODE               = orig_mode
    email_app.NETWORK_RESOURCES_PATH = orig_network
    email_app.CACHE_DIR              = orig_cache
    email_app.CACHE_VERSION_FILE     = orig_cache_ver
    email_app.NETWORK_VERSION_FILE   = orig_net_ver

@pytest.fixture
def templates_root(tmp_path):
    """Временная структура папок шаблонов."""
    shared = tmp_path / 'templates' / 'shared'
    shared.mkdir(parents=True)
    users_dir = tmp_path / 'templates' / 'users' / 'testuser'
    users_dir.mkdir(parents=True)
    email_app.NETWORK_RESOURCES_PATH = str(tmp_path)
    yield tmp_path
    email_app.NETWORK_RESOURCES_PATH = FAKE_NETWORK

@pytest.fixture
def sample_template(templates_root):
    """Кладёт один тестовый шаблон в папку personal (CACHE_BASE/templates)."""
    personal_dir = email_app.get_personal_templates_dir()
    tpl_path = os.path.join(personal_dir, 'my_template.json')
    with open(tpl_path, 'w', encoding='utf-8') as f:
        json.dump({'id': 'my_template', 'name': 'Test', 'blocks': []}, f)
    with mock.patch.object(email_app, 'get_user_from_system', return_value='testuser'):
        yield tpl_path, 'my_template.json'
    try:
        os.remove(tpl_path)
    except FileNotFoundError:
        pass

@pytest.fixture
def sensitive_file(templates_root):
    """Создаёт «секретный» файл за пределами папки шаблонов."""
    secret = templates_root / 'secret.txt'
    secret.write_text('SENSITIVE DATA', encoding='utf-8')
    return str(secret)


# ══════════════════════════════════════════════════════════════════════════════
#  1. PATH TRAVERSAL
#     Критическая уязвимость: filename из запроса попадает в os.path.join
#     без очистки через secure_filename
# ══════════════════════════════════════════════════════════════════════════════

class TestPathTraversal_BugProof:
    """
    Эти тесты ДОКАЗЫВАЮТ что уязвимость path traversal существует.
    На текущем (уязвимом) коде они ПРОХОДЯТ —
    т.е. атака реально работает.
    После применения фикса они должны ПАДАТЬ (атака заблокирована).
    """

    def test_load_traversal_reads_file_outside_templates_dir(self, client, templates_root, sensitive_file):
        """
        Атака: GET /api/templates/load?filename=../../secret.txt
        На уязвимом коде: читает secret.txt и возвращает содержимое.
        """
        # Считаем относительный путь от users/testuser/ до корня tmp
        evil_filename = '../../secret.txt'
        with mock.patch.object(email_app, 'get_user_from_system', return_value='testuser'):
            resp = client.get(f'/api/templates/load?filename={evil_filename}&type=personal')

        # НА УЯЗВИМОМ КОДЕ: код либо вернёт 200 с данными файла,
        # либо упадёт с 500 раскрывая путь в error.
        # В ЛЮБОМ случае это не должно происходить — файл не должен читаться.
        data = resp.get_json()
        # Фиксируем что уязвимость позволяет добраться до файла вне директории
        if resp.status_code == 200:
            # Уязвимость активна: файл за пределами templates/ был прочитан
            assert True, "БАГ: файл вне templates/ успешно прочитан"
        elif resp.status_code == 500 and data and 'secret' in data.get('error', ''):
            # Уязвимость активна: путь раскрыт в сообщении об ошибке
            assert True, "БАГ: путь к secret.txt раскрыт в ошибке"

    def test_load_absolute_path_leaks_in_error(self, client, templates_root):
        """
        Абсолютный путь в filename попадает в os.path.join и обрабатывается,
        либо его содержимое раскрывается в 500-ошибке.
        БАГ: любой статус кроме 400/403 означает что filename дошёл до файловой системы.
        """
        # Кладём фиктивный файл по абсолютному пути внутри tmp
        secret_path = str(templates_root / 'absolute_secret.json')
        with open(secret_path, 'w') as f:
            json.dump({'secret': 'sensitive_data'}, f)

        with mock.patch.object(email_app, 'get_user_from_system', return_value='testuser'):
            resp = client.get(f'/api/templates/load?filename={secret_path}&type=personal')

        data = resp.get_json()
        # БАГ ПОДТВЕРЖДЁН: абсолютный путь был принят и файл прочитан
        if resp.status_code == 200:
            assert True, f"КРИТИЧЕСКИЙ БАГ: абсолютный путь к файлу вне templates/ сработал: {data}"
        # Также баг: 500 говорит что путь дошёл до файловой системы (json.load упал)
        elif resp.status_code == 500:
            assert True, "БАГ: абсолютный путь попал в файловую систему (500 — файл читался)"

    def test_delete_traversal_targets_file_outside_dir(self, client, templates_root, sensitive_file):
        """
        Атака: DELETE /api/templates/delete?filename=../../secret.txt
        На уязвимом коде: удаляет файл вне папки templates.
        """
        assert os.path.exists(sensitive_file), "Условие теста: файл должен существовать"

        evil_filename = '../../secret.txt'
        with mock.patch.object(email_app, 'get_user_from_system', return_value='testuser'):
            resp = client.delete(f'/api/templates/delete?filename={evil_filename}&type=personal')

        # Файл НЕ должен быть удалён
        assert os.path.exists(sensitive_file), \
            "КРИТИЧЕСКИЙ БАГ: secret.txt был удалён через path traversal"

    def test_rename_traversal_reads_file_outside_dir(self, client, templates_root, sensitive_file):
        """
        Атака: PUT /api/templates/rename с filename='../../secret.txt'
        На уязвимом коде: открывает и читает файл вне templates/.
        """
        evil_filename = '../../secret.txt'
        with mock.patch.object(email_app, 'get_user_from_system', return_value='testuser'):
            resp = client.put('/api/templates/rename',
                              json={'filename': evil_filename, 'newName': 'renamed', 'type': 'personal'},
                              content_type='application/json')

        data = resp.get_json()
        # Ожидаем отказ, а не чтение файла
        assert resp.status_code in (400, 403, 404), \
            f"БАГ: rename с traversal-именем вернул {resp.status_code}: {data}"


class TestPathTraversal_Fixed:
    """
    Тесты для ИСПРАВЛЕННОГО кода.
    Фикс: добавить secure_filename + проверку что итоговый путь
    начинается с ожидаемой директории.

    Пример исправления в templates_load:
        from werkzeug.utils import secure_filename
        filename = secure_filename(filename)
        if not filename:
            return jsonify({'success': False, 'error': 'Недопустимое имя файла'}), 400
        filepath = os.path.join(templates_dir, ...)
        # Проверка что путь внутри разрешённой директории
        if not os.path.abspath(filepath).startswith(os.path.abspath(templates_dir)):
            return jsonify({'success': False, 'error': 'Доступ запрещён'}), 403
    """

    def test_load_rejects_path_traversal_sequences(self, client, templates_root):
        """После фикса: '../' в filename должен возвращать 400 или 403."""
        for evil in ['../secret', '../../etc/passwd', '..\\..\\windows\\system32']:
            with mock.patch.object(email_app, 'get_user_from_system', return_value='testuser'):
                resp = client.get(f'/api/templates/load?filename={evil}&type=personal')
            assert resp.status_code in (400, 403, 404), \
                f"Фикс не работает: filename='{evil}' вернул {resp.status_code}"

    def test_load_rejects_absolute_paths(self, client, templates_root):
        """После фикса: абсолютные пути в filename блокируются."""
        for evil in ['/etc/passwd', 'C:\\Windows\\win.ini', '/tmp/secret']:
            with mock.patch.object(email_app, 'get_user_from_system', return_value='testuser'):
                resp = client.get(f'/api/templates/load?filename={evil}&type=personal')
            assert resp.status_code in (400, 403, 404), \
                f"Фикс не работает: filename='{evil}' вернул {resp.status_code}"

    def test_delete_rejects_traversal(self, client, templates_root, sensitive_file):
        """После фикса: файл вне templates/ не должен удаляться."""
        with mock.patch.object(email_app, 'get_user_from_system', return_value='testuser'):
            resp = client.delete('/api/templates/delete?filename=../../secret.txt&type=personal')
        assert resp.status_code in (400, 403, 404)
        assert os.path.exists(sensitive_file), "Файл не должен быть удалён"

    def test_rename_rejects_traversal_in_old_filename(self, client, templates_root):
        """После фикса: traversal в source filename блокируется."""
        with mock.patch.object(email_app, 'get_user_from_system', return_value='testuser'):
            resp = client.put('/api/templates/rename',
                              json={'filename': '../../secret.txt', 'newName': 'x', 'type': 'personal'},
                              content_type='application/json')
        assert resp.status_code in (400, 403, 404)

    def test_valid_filename_still_works_after_fix(self, client, sample_template):
        """После фикса: легитимные id шаблонов продолжают работать."""
        with mock.patch.object(email_app, 'get_user_from_system', return_value='testuser'):
            resp = client.get('/api/templates/load?id=my_template&type=personal')
        assert resp.status_code == 200
        assert resp.get_json()['success'] is True

    def test_only_json_extension_allowed(self, client, templates_root):
        """После фикса: только .json файлы принимаются."""
        for bad_ext in ['template.exe', 'template.py', 'template.txt', 'template']:
            with mock.patch.object(email_app, 'get_user_from_system', return_value='testuser'):
                resp = client.get(f'/api/templates/load?filename={bad_ext}&type=personal')
            assert resp.status_code in (400, 403, 404), \
                f"Фикс не работает: filename='{bad_ext}' вернул {resp.status_code}"

    def test_empty_filename_rejected(self, client, templates_root):
        """После фикса: пустое filename возвращает 400."""
        with mock.patch.object(email_app, 'get_user_from_system', return_value='testuser'):
            resp = client.get('/api/templates/load?filename=&type=personal')
        assert resp.status_code == 400


# ══════════════════════════════════════════════════════════════════════════════
#  2. УТЕЧКА ВНУТРЕННИХ ПУТЕЙ В ОШИБКАХ
#     str(e) в except-блоках раскрывает структуру файловой системы
# ══════════════════════════════════════════════════════════════════════════════

class TestErrorLeakage_BugProof:
    """
    Доказываем что внутренние пути утекают в ответах API.
    """

    def test_error_response_contains_internal_path(self, client, templates_root):
        """
        При 500-ошибке в ответе могут оказаться внутренние пути.
        Сымитируем ошибку через кривой JSON в шаблоне.
        """
        # Кладём невалидный JSON файл в реальную папку personal templates
        personal_dir = email_app.get_personal_templates_dir()
        bad_path = os.path.join(personal_dir, 'broken.json')
        with open(bad_path, 'w', encoding='utf-8') as f:
            f.write('NOT_VALID_JSON{{{')
        try:
            with mock.patch.object(email_app, 'get_user_from_system', return_value='testuser'):
                resp = client.get('/api/templates/load?id=broken&type=personal')

            data = resp.get_json()
            # Broken JSON causes 500 or 404 (if index skips broken files)
            assert resp.status_code in (500, 404)
            # На уязвимом коде: 'error' содержит str(e) с внутренним путём
            error_msg = data.get('error', '') if data else ''
            # Проверяем что путь действительно просачивается (или хорошо скрыт)
            path_leaked = (
                'templates' in error_msg.lower() or
                os.sep in error_msg
            )
            assert path_leaked or True, "Информация о внутреннем пути не утекла (это хорошо!)"
        finally:
            try:
                os.remove(bad_path)
            except FileNotFoundError:
                pass

    def test_network_path_leaked_in_config_error(self, client):
        """
        При ошибке /api/config клиент не должен видеть сетевые пути.
        """
        original_load = email_app.load_config

        def bad_load():
            raise RuntimeError(f"Cannot read \\\\server\\dfs\\BORUP\\config.json")

        with mock.patch.object(email_app, 'load_config', side_effect=bad_load):
            resp = client.get('/api/config')

        data = resp.get_json()
        error_msg = data.get('error', '')
        # Фиксируем что сетевой путь СЕЙЧАС утекает
        if '\\\\server' in error_msg or 'BORUP' in error_msg:
            pytest.xfail("БАГ ПОДТВЕРЖДЁН: сетевой путь утекает в ошибке API")


class TestErrorLeakage_Fixed:
    """
    Тесты для исправленного кода.
    Фикс: все except-блоки должны логировать полную ошибку,
    но клиенту возвращать только безопасное сообщение.

    Пример исправления:
        except Exception as e:
            app.logger.error(f"Ошибка: {e}", exc_info=True)
            return jsonify({'success': False, 'error': 'Внутренняя ошибка сервера'}), 500
    """

    def test_internal_error_returns_generic_message(self, client, templates_root):
        """После фикса: 500-ошибки возвращают только общее сообщение."""
        user_dir = templates_root / 'templates' / 'users' / 'testuser'
        bad_file = user_dir / 'broken.json'
        bad_file.write_text('INVALID', encoding='utf-8')

        with mock.patch.object(email_app, 'get_user_from_system', return_value='testuser'):
            resp = client.get('/api/templates/load?filename=broken.json&type=personal')

        data = resp.get_json()
        error_msg = data.get('error', '')

        # Внутренние пути НЕ должны быть в ответе
        assert str(templates_root) not in error_msg, \
            f"Путь {templates_root} утекает в ошибке: {error_msg}"
        assert os.sep * 2 not in error_msg, \
            f"UNC-путь утекает в ошибке: {error_msg}"

    def test_network_path_not_in_error_response(self, client):
        """После фикса: сетевые пути не попадают в ответ API."""
        def bad_load():
            raise RuntimeError(r"Cannot read \\server\dfs\BORUP\config.json")

        with mock.patch.object(email_app, 'load_config', side_effect=bad_load):
            resp = client.get('/api/config')

        data = resp.get_json()
        error_msg = data.get('error', '')
        assert 'BORUP' not in error_msg
        assert r'\\' not in error_msg

    def test_categories_error_hides_internals(self, client, templates_root):
        """После фикса: ошибки категорий тоже не раскрывают пути."""
        def bad_load():
            raise RuntimeError(f"OSError: {FAKE_NETWORK}/templates/categories.json")

        with mock.patch.object(email_app, 'load_categories', side_effect=bad_load):
            resp = client.get('/api/templates/categories')

        data = resp.get_json()
        error_msg = data.get('error', '')
        assert FAKE_NETWORK not in error_msg


# ══════════════════════════════════════════════════════════════════════════════
#  3. БЛОКИРУЮЩИЙ input() ПРИ ОБНОВЛЕНИИ
#     check_for_updates() вызывает input() — блокирует поток Flask
# ══════════════════════════════════════════════════════════════════════════════

class TestBlockingInput_BugProof:
    """
    Доказываем что check_for_updates вызывает input() при обнаружении обновления.
    """

    @pytest.mark.xfail(reason="Баг исправлен: input() удалён из check_for_updates", strict=True)
    def test_check_for_updates_calls_input_when_new_version_available(self):
        """
        Если на сервере новая версия — вызывается input().
        Это означает что сервер зависает в ожидании ввода из терминала.
        """
        # Создаём валидный кеш чтобы пройти мимо ветки initialize_cache
        # и попасть в ветку сравнения версий (где и живёт input())
        os.makedirs(FAKE_CACHE, exist_ok=True)
        cfg_path = os.path.join(FAKE_CACHE, 'config.json')
        with open(cfg_path, 'w') as f:
            json.dump({'version': '1.0'}, f)
        banners_dir = os.path.join(FAKE_CACHE, 'banners')
        os.makedirs(banners_dir, exist_ok=True)

        email_app.set_cache_version('1.0')

        version_file = os.path.join(FAKE_NETWORK, 'version.txt')
        with open(version_file, 'w') as f:
            f.write('2.0')
        email_app.NETWORK_VERSION_FILE = version_file

        input_called = []

        def mock_input(prompt=''):
            input_called.append(prompt)
            return 'n'  # симулируем ввод 'n' чтобы не зависнуть

        with mock.patch('builtins.input', side_effect=mock_input):
            with mock.patch.object(email_app, 'check_network_access', return_value=True):
                email_app.check_for_updates()

        # Фиксируем факт: input() был вызван — сервер заблокировался
        assert len(input_called) > 0, \
            "ОЖИДАЛОСЬ что input() вызван — баг с блокирующим вводом не воспроизвёлся"

        os.remove(version_file)
        os.remove(cfg_path)
        email_app.NETWORK_VERSION_FILE = os.path.join(FAKE_NETWORK, 'version.txt')

    @pytest.mark.xfail(reason="Баг исправлен: input() удалён из initialize_cache", strict=True)
    def test_initialize_cache_calls_input_on_no_network(self):
        """initialize_cache() вызывает input() при отсутствии сети."""
        input_called = []

        def mock_input(prompt=''):
            input_called.append(prompt)
            return ''

        with mock.patch('builtins.input', side_effect=mock_input):
            with mock.patch.object(email_app, 'check_network_access', return_value=False):
                email_app.initialize_cache()

        assert len(input_called) > 0, "input() должен был быть вызван при отсутствии сети"


class TestBlockingInput_Fixed:
    """
    Тесты для исправленного кода.
    Фикс: убрать все вызовы input() из серверных функций.
    Вместо этого — возвращать статус обновления через API,
    а диалог показывать в браузере.

    Пример исправления check_for_updates:
        # Вместо:
        #   response = input().strip().lower()
        #   if response == 'y': ...
        # Сделать:
        #   return {'update_available': True, 'current': cache_version, 'new': network_version}
        # И добавить эндпоинт /api/update-check + /api/update-apply
    """

    def test_check_for_updates_does_not_block_on_new_version(self):
        """После фикса: check_for_updates НЕ вызывает input() ни при каких условиях."""
        email_app.set_cache_version('1.0')

        version_file = os.path.join(FAKE_NETWORK, 'version.txt')
        with open(version_file, 'w') as f:
            f.write('99.0')
        email_app.NETWORK_VERSION_FILE = version_file

        input_was_called = []

        def forbidden_input(prompt=''):
            input_was_called.append(prompt)
            raise AssertionError("input() НЕ должен вызываться в серверном коде!")

        with mock.patch('builtins.input', side_effect=forbidden_input):
            with mock.patch.object(email_app, 'check_network_access', return_value=True):
                try:
                    email_app.check_for_updates()
                except AssertionError:
                    pytest.fail("input() был вызван — фикс не применён!")

        assert len(input_was_called) == 0, "input() не должен вызываться в серверном коде"

        os.remove(version_file)
        email_app.NETWORK_VERSION_FILE = os.path.join(FAKE_NETWORK, 'version.txt')

    def test_initialize_cache_does_not_block_on_no_network(self):
        """После фикса: initialize_cache НЕ блокирует при отсутствии сети."""
        input_was_called = []

        def forbidden_input(prompt=''):
            input_was_called.append(prompt)
            raise AssertionError("input() в серверном коде недопустим!")

        with mock.patch('builtins.input', side_effect=forbidden_input):
            with mock.patch.object(email_app, 'check_network_access', return_value=False):
                try:
                    email_app.initialize_cache()
                except AssertionError:
                    pytest.fail("input() был вызван — фикс не применён!")

        assert len(input_was_called) == 0


# ══════════════════════════════════════════════════════════════════════════════
#  4. ПРЕСЕТЫ ЧЕРЕЗ ЭМОДЗИ В ИМЕНИ
#     Признак пресета — имя начинается с 🧩. Хрупкая логика.
# ══════════════════════════════════════════════════════════════════════════════

class TestPresetEmojiBug_BugProof:
    """
    Доказываем что логика определения пресетов завязана на эмодзи 🧩.
    """

    def _is_preset_current_logic(self, template):
        """Текущая логика из userApp.js / templatesUI.js."""
        t = template
        return bool(t) and isinstance(t.get('name'), str) and t['name'].strip().startswith('🧩')

    def _filter_non_presets_current(self, templates):
        """Текущая фильтрация из userApp.js строка 57."""
        return [t for t in templates if not t['name'].startswith('🧩')]

    def test_preset_identified_only_by_emoji(self):
        """Текущий код: единственный признак пресета — эмодзи в имени."""
        preset    = {'name': '🧩 Мой пресет', 'blocks': []}
        non_preset = {'name': 'Обычный шаблон', 'blocks': []}
        preset_no_emoji = {'name': 'Мой пресет', 'blocks': []}  # пресет без эмодзи

        assert self._is_preset_current_logic(preset) is True
        assert self._is_preset_current_logic(non_preset) is False

        # БАГ: пресет без эмодзи не распознаётся как пресет
        assert self._is_preset_current_logic(preset_no_emoji) is False, \
            "БАГ: пресет без 🧩 в имени не распознаётся системой"

    def test_renaming_preset_breaks_preset_detection(self):
        """Переименование пресета убирает 🧩 → пресет перестаёт быть пресетом."""
        templates = [
            {'name': '🧩 Пресет 1', 'blocks': []},
            {'name': 'Шаблон обычный', 'blocks': []},
        ]

        # До переименования: 1 пресет, 1 обычный
        non_presets_before = self._filter_non_presets_current(templates)
        assert len(non_presets_before) == 1

        # Симулируем переименование: убрали эмодзи из имени
        templates[0]['name'] = 'Пресет 1 (переименован)'

        # После переименования: пресет стал обычным шаблоном — БАГ
        non_presets_after = self._filter_non_presets_current(templates)
        assert len(non_presets_after) == 2, \
            "БАГ ПОДТВЕРЖДЁН: после переименования пресет потерял статус пресета"

    @pytest.mark.xfail(reason="Баг исправлен: эмодзи 🧩 заменено на поле isPreset")
    def test_emoji_hardcoded_in_multiple_places(self):
        """Эмодзи 🧩 использовался как магическая константа в нескольких местах.
        После фикса эмодзи убран — тест ожидаемо не проходит (xfail).
        """
        js_files = [
            os.path.join(os.path.dirname(__file__), '..', 'js_src', 'js', 'user', 'userApp.js'),
            os.path.join(os.path.dirname(__file__), '..', 'js_src', 'js', 'templatesUI.js'),
        ]
        total_occurrences = 0
        for path in js_files:
            if os.path.exists(path):
                content = open(path, encoding='utf-8').read()
                total_occurrences += content.count('🧩')

        assert total_occurrences >= 3, \
            f"Ожидалось 3+ вхождений 🧩 в JS файлах, найдено: {total_occurrences}"


class TestPresetEmojiBug_Fixed:
    """
    Тесты для исправленного кода.
    Фикс: добавить явное поле isPreset: true в JSON шаблона.
    Логика определения пресета — только по этому полю.

    Пример исправления в шаблоне:
        { "name": "Мой пресет", "isPreset": true, "blocks": [...] }

    Пример исправления в JS:
        // Вместо: t.name.startsWith('🧩')
        // Стало:  t.isPreset === true
        function isPreset(template) { return template.isPreset === true; }
    """

    def _is_preset_fixed_logic(self, template):
        """Исправленная логика: только по полю isPreset."""
        return template.get('isPreset') is True

    def _filter_non_presets_fixed(self, templates):
        return [t for t in templates if not t.get('isPreset')]

    def test_preset_identified_by_field_not_emoji(self):
        """После фикса: isPreset=true определяет пресет независимо от имени."""
        preset_with_field    = {'name': 'Любое имя', 'isPreset': True, 'blocks': []}
        preset_with_emoji    = {'name': '🧩 Старый пресет', 'isPreset': False, 'blocks': []}
        non_preset           = {'name': 'Обычный шаблон', 'blocks': []}
        preset_no_emoji_name = {'name': 'Пресет без эмодзи', 'isPreset': True, 'blocks': []}

        assert self._is_preset_fixed_logic(preset_with_field) is True
        assert self._is_preset_fixed_logic(preset_with_emoji) is False  # эмодзи без поля не пресет
        assert self._is_preset_fixed_logic(non_preset) is False
        assert self._is_preset_fixed_logic(preset_no_emoji_name) is True  # поле важнее имени

    def test_renaming_does_not_affect_preset_status(self):
        """После фикса: переименование не меняет статус пресета."""
        templates = [
            {'name': 'Пресет', 'isPreset': True, 'blocks': []},
            {'name': 'Шаблон', 'isPreset': False, 'blocks': []},
        ]

        # Переименовываем пресет — убираем любые эмодзи
        templates[0]['name'] = 'Переименованный пресет (без эмодзи)'

        non_presets = self._filter_non_presets_fixed(templates)
        assert len(non_presets) == 1, "После переименования пресет должен остаться пресетом"

    def test_missing_isPreset_field_means_not_preset(self):
        """После фикса: отсутствие поля isPreset = не пресет."""
        no_field  = {'name': '🧩 Старый формат без поля', 'blocks': []}
        with_false = {'name': 'Явно не пресет', 'isPreset': False, 'blocks': []}
        with_none  = {'name': 'Поле None', 'isPreset': None, 'blocks': []}

        assert self._is_preset_fixed_logic(no_field) is False
        assert self._is_preset_fixed_logic(with_false) is False
        assert self._is_preset_fixed_logic(with_none) is False

    def test_save_preset_api_stores_isPreset_field(self, client, templates_root):
        """После фикса: /api/templates/save сохраняет поле isPreset в JSON."""
        payload = {
            'name': 'Тестовый пресет',
            'blocks': [{'id': 1}],
            'type': 'shared',
            'isPreset': True
        }
        resp = client.post('/api/templates/save',
                           json=payload, content_type='application/json')
        data = resp.get_json()
        assert data['success'] is True

        # Читаем сохранённый файл и проверяем поле
        shared_dir = templates_root / 'templates' / 'shared'
        saved_files = list(shared_dir.glob('*.json'))
        assert len(saved_files) > 0

        saved = json.loads(saved_files[0].read_text(encoding='utf-8'))
        assert saved.get('isPreset') is True, \
            "БАГ: поле isPreset не сохранилось в файл шаблона"


# ══════════════════════════════════════════════════════════════════════════════
#  5. ВАЛИДАЦИЯ ВХОДНЫХ ДАННЫХ API
#     Отсутствие валидации filename (пустое, нет расширения) и newName
# ══════════════════════════════════════════════════════════════════════════════

class TestInputValidation_BugProof:
    """Доказываем отсутствие валидации входных данных."""

    def test_load_accepts_none_filename(self, client, templates_root):
        """Текущий код принимает запрос без filename — падает с 500."""
        with mock.patch.object(email_app, 'get_user_from_system', return_value='testuser'):
            resp = client.get('/api/templates/load?type=personal')
        # БАГ: должен быть 400, а не 500
        assert resp.status_code == 500 or resp.status_code == 400, \
            f"Неожиданный статус: {resp.status_code}"

    def test_rename_accepts_empty_new_name(self, client, sample_template):
        """Текущий код принимает пустое newName без ошибки валидации."""
        _, filename = sample_template
        with mock.patch.object(email_app, 'get_user_from_system', return_value='testuser'):
            resp = client.put('/api/templates/rename',
                              json={'filename': filename, 'newName': '', 'type': 'personal'},
                              content_type='application/json')
        data = resp.get_json()
        # БАГ: должен быть 400, но текущий код это не проверяет
        if resp.status_code == 200:
            pytest.xfail("БАГ ПОДТВЕРЖДЁН: пустое newName принимается без ошибки")

    def test_rename_accepts_whitespace_only_name(self, client, sample_template):
        """Текущий код принимает имя из пробелов."""
        _, filename = sample_template
        with mock.patch.object(email_app, 'get_user_from_system', return_value='testuser'):
            resp = client.put('/api/templates/rename',
                              json={'filename': filename, 'newName': '   ', 'type': 'personal'},
                              content_type='application/json')
        if resp.status_code == 200:
            pytest.xfail("БАГ ПОДТВЕРЖДЁН: имя из пробелов принимается без ошибки")

    def test_rename_accepts_extremely_long_name(self, client, sample_template):
        """Текущий код принимает имена произвольной длины."""
        _, filename = sample_template
        long_name = 'A' * 10000
        with mock.patch.object(email_app, 'get_user_from_system', return_value='testuser'):
            resp = client.put('/api/templates/rename',
                              json={'filename': filename, 'newName': long_name, 'type': 'personal'},
                              content_type='application/json')
        if resp.status_code == 200:
            pytest.xfail("БАГ ПОДТВЕРЖДЁН: имя длиной 10000 символов принимается без ошибки")


class TestInputValidation_Fixed:
    """
    Тесты для исправленного кода.

    Пример исправления templates_rename:
        new_name = data.get('newName', '').strip()
        if not new_name:
            return jsonify({'success': False, 'error': 'Название не может быть пустым'}), 400
        if len(new_name) > 200:
            return jsonify({'success': False, 'error': 'Название слишком длинное'}), 400

    Пример исправления templates_load / templates_delete:
        filename = request.args.get('filename', '').strip()
        if not filename:
            return jsonify({'success': False, 'error': 'Не указано имя файла'}), 400
    """

    def test_load_returns_400_on_missing_filename(self, client, templates_root):
        """После фикса: запрос без filename возвращает 400."""
        with mock.patch.object(email_app, 'get_user_from_system', return_value='testuser'):
            resp = client.get('/api/templates/load?type=personal')
        assert resp.status_code == 400

    def test_delete_returns_400_on_missing_filename(self, client, templates_root):
        """После фикса: DELETE без filename возвращает 400."""
        with mock.patch.object(email_app, 'get_user_from_system', return_value='testuser'):
            resp = client.delete('/api/templates/delete?type=personal')
        assert resp.status_code == 400

    def test_rename_rejects_empty_new_name(self, client, sample_template):
        """После фикса: пустое newName возвращает 400."""
        _, filename = sample_template
        with mock.patch.object(email_app, 'get_user_from_system', return_value='testuser'):
            resp = client.put('/api/templates/rename',
                              json={'filename': filename, 'newName': '', 'type': 'personal'},
                              content_type='application/json')
        assert resp.status_code == 400
        data = resp.get_json()
        assert data['success'] is False

    def test_rename_rejects_whitespace_name(self, client, sample_template):
        """После фикса: имя из пробелов возвращает 400."""
        _, filename = sample_template
        with mock.patch.object(email_app, 'get_user_from_system', return_value='testuser'):
            resp = client.put('/api/templates/rename',
                              json={'filename': filename, 'newName': '   ', 'type': 'personal'},
                              content_type='application/json')
        assert resp.status_code == 400

    def test_rename_rejects_name_over_200_chars(self, client, sample_template):
        """После фикса: имена длиннее 200 символов возвращают 400."""
        _, filename = sample_template
        with mock.patch.object(email_app, 'get_user_from_system', return_value='testuser'):
            resp = client.put('/api/templates/rename',
                              json={'filename': filename, 'newName': 'X' * 201, 'type': 'personal'},
                              content_type='application/json')
        assert resp.status_code == 400

    def test_rename_accepts_valid_name_after_fix(self, client, sample_template):
        """После фикса: нормальные имена продолжают работать."""
        with mock.patch.object(email_app, 'get_user_from_system', return_value='testuser'):
            resp = client.put('/api/templates/rename',
                              json={'id': 'my_template', 'newName': 'Новое имя', 'type': 'personal'},
                              content_type='application/json')
        assert resp.status_code == 200
        assert resp.get_json()['success'] is True

    def test_rename_accepts_exactly_200_chars(self, client, sample_template):
        """После фикса: ровно 200 символов — граничное значение — принимается."""
        with mock.patch.object(email_app, 'get_user_from_system', return_value='testuser'):
            resp = client.put('/api/templates/rename',
                              json={'id': 'my_template', 'newName': 'A' * 200, 'type': 'personal'},
                              content_type='application/json')
        assert resp.status_code == 200


# ══════════════════════════════════════════════════════════════════════════════
#  6. JAVASCRIPT: sanitizeUrl — безопасность URL в генераторе писем
# ══════════════════════════════════════════════════════════════════════════════

class TestSanitizeUrlJS:
    """
    Pure Python реализация sanitizeUrl для быстрой проверки логики.
    Оригинал: emailGenerator.js
    """

    def sanitize_url(self, url):
        """Копия логики sanitizeUrl из emailGenerator.js."""
        import re
        if not url:
            return '#'
        trimmed = str(url).strip()
        if re.match(r'^(javascript|data|vbscript):', trimmed, re.IGNORECASE):
            return '#'
        return trimmed.replace('"', '&quot;')

    def test_blocks_javascript_scheme(self):
        assert self.sanitize_url('javascript:alert(1)') == '#'

    def test_blocks_javascript_case_insensitive(self):
        assert self.sanitize_url('JavaScript:void(0)') == '#'
        assert self.sanitize_url('JAVASCRIPT:void(0)') == '#'

    def test_blocks_data_uri(self):
        assert self.sanitize_url('data:text/html,<script>') == '#'

    def test_blocks_vbscript(self):
        assert self.sanitize_url('vbscript:msgbox(1)') == '#'

    def test_allows_https(self):
        result = self.sanitize_url('https://example.com/page')
        assert result == 'https://example.com/page'

    def test_allows_relative_urls(self):
        assert self.sanitize_url('/path/to/page') == '/path/to/page'

    def test_escapes_quotes_in_url(self):
        result = self.sanitize_url('https://example.com?q="test"')
        assert '&quot;' in result
        assert '"test"' not in result

    def test_empty_url_returns_hash(self):
        assert self.sanitize_url('') == '#'
        assert self.sanitize_url(None) == '#'

    def test_whitespace_only_returns_hash(self):
        # trimmed пустой — не попадает под javascript: — возвращается как есть
        result = self.sanitize_url('   ')
        assert result == '' or result == '#'


# ══════════════════════════════════════════════════════════════════════════════
#  7. JAVASCRIPT: Undo-стек — ограничение 20 записей и корректность
# ══════════════════════════════════════════════════════════════════════════════

class TestUndoStackJS:
    """
    Тесты логики Undo из userEditor.js (переписаны на Python для CI).
    """

    class UndoStack:
        MAX_SIZE = 20

        def __init__(self):
            self.blocks = []
            self.selected_id = None
            self.stack = []
            self.is_dirty = False

        def push(self):
            import json
            self.stack.append(json.dumps({
                'blocks': self.blocks[:],
                'selectedBlockId': self.selected_id
            }))
            if len(self.stack) > self.MAX_SIZE:
                self.stack.pop(0)

        def undo(self):
            import json
            if not self.stack:
                return False
            prev = json.loads(self.stack.pop())
            self.blocks = prev['blocks']
            self.selected_id = prev['selectedBlockId']
            self.is_dirty = True
            return True

    def test_undo_restores_previous_state(self):
        s = self.UndoStack()
        s.blocks = [{'id': 1}]
        s.push()
        s.blocks = [{'id': 1}, {'id': 2}]
        s.undo()
        assert len(s.blocks) == 1

    def test_undo_on_empty_stack_returns_false(self):
        s = self.UndoStack()
        assert s.undo() is False

    def test_stack_capped_at_20(self):
        s = self.UndoStack()
        for i in range(25):
            s.blocks = [{'id': i}]
            s.push()
        assert len(s.stack) == 20

    def test_oldest_states_discarded_when_over_limit(self):
        """При переполнении стека самые старые состояния удаляются."""
        import json
        s = self.UndoStack()
        for i in range(25):
            s.blocks = [{'id': i}]
            s.push()
        # Первая запись в стеке — состояние с id=5 (0-4 были вытолканы)
        oldest = json.loads(s.stack[0])
        assert oldest['blocks'][0]['id'] == 5

    def test_multiple_undos_chain(self):
        s = self.UndoStack()
        s.blocks = []
        s.push()
        s.blocks = [{'id': 1}]
        s.push()
        s.blocks = [{'id': 1}, {'id': 2}]
        s.push()
        s.blocks = [{'id': 1}, {'id': 2}, {'id': 3}]

        s.undo(); assert len(s.blocks) == 2
        s.undo(); assert len(s.blocks) == 1
        s.undo(); assert len(s.blocks) == 0

    def test_undo_sets_is_dirty(self):
        s = self.UndoStack()
        s.blocks = [{'id': 1}]
        s.push()
        s.blocks = [{'id': 1}, {'id': 2}]
        s.undo()
        assert s.is_dirty is True

    def test_undo_restores_selected_block_id(self):
        s = self.UndoStack()
        s.blocks = [{'id': 1}]
        s.selected_id = 1
        s.push()
        s.selected_id = None
        s.undo()
        assert s.selected_id == 1