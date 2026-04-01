"""
Email Builder - Desktop Application
Главный файл приложения с системой кеширования и управлением ресурсами
"""

from flask import abort
import sys
import os
import re
import uuid
import tempfile
import mimetypes
import webbrowser
import threading
import time
import json
import shutil
import hashlib
from datetime import datetime
from flask import Flask, send_from_directory, request, jsonify
from werkzeug.utils import secure_filename
import base64
import threading
import time


# ============================================================================
# КОНФИГУРАЦИЯ ПУТЕЙ
# ============================================================================

def _load_config():
    """
    Читает config.ini рядом с .exe (или рядом с app.py в dev-режиме).
    Все параметры можно переопределить — пересборка .exe не нужна.

    Пример config.ini:
        [app]
        network_path = \\\\server\\share\\email-builder
        port = 8080
        mode = admin
    """
    import configparser

    if getattr(sys, 'frozen', False):
        config_dir = os.path.dirname(sys.executable)
    else:
        config_dir = os.path.dirname(os.path.abspath(__file__))

    config_path = os.path.join(config_dir, 'config.ini')

    cfg = configparser.ConfigParser()
    cfg.read(config_path, encoding='utf-8')

    section = 'app'
    defaults = {
        'port': '8080',
    }

    def get(key):
        if key == 'network_path':
            val = cfg.get(section, key, fallback=None)
            if not val:
                raise RuntimeError(
                    f"Не найден параметр network_path в {config_path}\n"
                    "Добавьте в config.ini:\n"
                    "[app]\n"
                    "network_path = \\\\server\\share\\email-builder"
                )
            return val
        return cfg.get(section, key, fallback=defaults.get(key, ''))

    return (
        get('network_path'),
        int(get('port')),
        os.environ.get('APP_MODE', 'admin').lower(),
        config_path,
    )

try:
    NETWORK_RESOURCES_PATH, PORT, APP_MODE, _CONFIG_PATH = _load_config()
except RuntimeError as _cfg_err:
    try:
        import tkinter as _tk
        from tkinter import messagebox as _mb
        _root = _tk.Tk(); _root.withdraw()
        _mb.showerror('Email Builder — ошибка конфигурации', str(_cfg_err))
        _root.destroy()
    except Exception:
        pass
    sys.exit(1)

# Определяем базовые пути в зависимости от режима запуска
if getattr(sys, 'frozen', False):
    # Режим .exe (PyInstaller)
    BUILTIN_DIR = sys._MEIPASS
    EXE_DIR = os.path.dirname(sys.executable)
    CACHE_BASE = os.path.join(os.environ['LOCALAPPDATA'], 'EmailBuilder')
    CACHE_DIR = os.path.join(CACHE_BASE, 'cache')
else:
    # Режим разработки
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    BUILTIN_DIR = BASE_DIR
    EXE_DIR = BASE_DIR
    CACHE_BASE = BASE_DIR
    CACHE_DIR = os.path.join(BASE_DIR, 'cache')

# Создаём необходимые директории
os.makedirs(CACHE_DIR, exist_ok=True)

# Пути к файлам версий
CACHE_VERSION_FILE = os.path.join(CACHE_BASE, 'cache_version.txt')
NETWORK_VERSION_FILE = os.path.join(NETWORK_RESOURCES_PATH, 'version.txt')

# ============================================================================
# ИНИЦИАЛИЗАЦИЯ FLASK
# ============================================================================

if getattr(sys, 'frozen', False):
    STATIC_DIR = os.path.join(BUILTIN_DIR, 'static')
else:
    STATIC_DIR = os.path.join(BASE_DIR, 'static')

app = Flask(__name__,
            static_folder=STATIC_DIR,
            template_folder=STATIC_DIR)

# Время последнего пинга
_last_heartbeat = time.time()
_heartbeat_timeout = 10  # секунд

@app.route('/api/heartbeat', methods=['POST'])
def api_heartbeat():
    global _last_heartbeat
    _last_heartbeat = time.time()
    return jsonify({'ok': True})

def heartbeat_watchdog():
    """Завершает процесс если браузер не пингует N секунд"""
    time.sleep(15)  # Даём время на запуск
    while True:
        time.sleep(3)
        if time.time() - _last_heartbeat > _heartbeat_timeout:
            print('[WATCHDOG] No heartbeat, shutting down...')
            os._exit(0)

# Запускать в конце инициализации приложения:
threading.Thread(target=heartbeat_watchdog, daemon=True).start()

app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024

# ============================================================================
# ФУНКЦИИ УПРАВЛЕНИЯ КЕШЕМ И ВЕРСИЯМИ
# ============================================================================


def get_cache_version():
    """Получить версию локального кеша"""
    try:
        if os.path.exists(CACHE_VERSION_FILE):
            with open(CACHE_VERSION_FILE, 'r', encoding='utf-8') as f:
                return f.read().strip()
        return None
    except Exception as e:
        print(f"⚠️  Ошибка чтения версии кеша: {e}")
        return None


def get_network_version():
    """Получить версию с сетевого ресурса"""
    try:
        if os.path.exists(NETWORK_VERSION_FILE):
            with open(NETWORK_VERSION_FILE, 'r', encoding='utf-8') as f:
                version = f.read().strip()
                return version if version else None
        else:
            # Файл version.txt не существует на сервере
            return None
    except Exception as e:
        print(f"⚠️  Ошибка чтения version.txt: {e}")
        return None


def set_cache_version(version):
    """Сохранить версию кеша"""
    try:
        with open(CACHE_VERSION_FILE, 'w', encoding='utf-8') as f:
            f.write(version)
        print(f"✓ Версия кеша обновлена: {version}")
    except Exception as e:
        print(f"⚠️  Ошибка записи версии: {e}")


def check_network_access():
    """Проверить доступность сетевого ресурса"""
    return os.path.exists(NETWORK_RESOURCES_PATH)

def show_error_dialog(title, message):
    """Показать messagebox с ошибкой. Работает и в .exe без консоли."""
    try:
        import tkinter as _tk
        from tkinter import messagebox as _mb
        _root = _tk.Tk()
        _root.withdraw()
        _mb.showerror(title, message)
        _root.destroy()
    except Exception:
        pass

def show_splash():
    """
    Показывает окно загрузки пока приложение стартует.
    Возвращает функцию close() которую нужно вызвать когда готово.
    """
    try:
        import tkinter as tk

        root = tk.Tk()
        root.title('Email Builder')
        root.resizable(False, False)
        root.configure(bg='#1e293b')

        # Убираем рамку окна
        root.overrideredirect(True)

        # Размер и центрирование
        w, h = 360, 160
        sw = root.winfo_screenwidth()
        sh = root.winfo_screenheight()
        x = (sw - w) // 2
        y = (sh - h) // 2
        root.geometry(f'{w}x{h}+{x}+{y}')

        # Иконка если есть
        try:
            if getattr(sys, 'frozen', False):
                ico = os.path.join(sys._MEIPASS, 'icon.ico')
            else:
                ico = os.path.join(os.path.dirname(__file__), 'icon.ico')
            if os.path.exists(ico):
                root.iconbitmap(ico)
        except Exception:
            pass

        # Заголовок
        tk.Label(
            root, text='📧 Email Builder',
            bg='#1e293b', fg='#f97316',
            font=('Segoe UI', 14, 'bold')
        ).pack(pady=(24, 4))

        # Текст
        tk.Label(
            root,
            text='Приложение запускается...\nПосле загрузки откроется вкладка в браузере.',
            bg='#1e293b', fg='#9ca3af',
            font=('Segoe UI', 9),
            justify='center'
        ).pack(pady=(0, 12))

        # Анимированный спиннер (текстовый)
        spinner_var = tk.StringVar(value='◐')
        spinner_label = tk.Label(
            root, textvariable=spinner_var,
            bg='#1e293b', fg='#f97316',
            font=('Segoe UI', 18)
        )
        spinner_label.pack()

        frames = ['◐', '◓', '◑', '◒']
        _idx = [0]
        _running = [True]

        def animate():
            if _running[0]:
                _idx[0] = (_idx[0] + 1) % len(frames)
                spinner_var.set(frames[_idx[0]])
                root.after(150, animate)

        root.after(150, animate)

        def close():
            _running[0] = False
            try:
                root.destroy()
            except Exception:
                pass

        # Запускаем цикл в отдельном потоке
        threading.Thread(target=root.mainloop, daemon=True).start()

        return close

    except Exception:
        # Если tkinter недоступен — возвращаем заглушку
        return lambda: None

def copy_directory_with_progress(src, dst, desc="Копирование"):
    """Копирование папки с отображением прогресса"""
    if not os.path.exists(src):
        print(f"⚠️  Папка не найдена: {src}")
        return False

    try:
        total_files = sum([len(files) for _, _, files in os.walk(src)])
        copied_files = 0

        print(f"📥 {desc}: {total_files} файлов...")

        for root, dirs, files in os.walk(src):
            rel_path = os.path.relpath(root, src)
            dst_dir = os.path.join(dst, rel_path)
            os.makedirs(dst_dir, exist_ok=True)

            for file in files:
                src_file = os.path.join(root, file)
                dst_file = os.path.join(dst_dir, file)
                shutil.copy2(src_file, dst_file)
                copied_files += 1

                if copied_files % 10 == 0 or copied_files == total_files:
                    progress = int((copied_files / total_files) * 100)
                    bar = '█' * (progress // 5) + '░' * (20 - progress // 5)
                    print(f"   [{bar}] {progress}%", end='\r')

        print(f"\n✓ {desc} завершено!")
        return True

    except Exception as e:
        print(f"❌ Ошибка копирования: {e}")
        return False


def initialize_cache():
    """Инициализация кеша при первом запуске"""
    print("\n" + "=" * 60)
    print("🚀 Email Builder - Первый запуск")
    print("=" * 60)

    if not check_network_access():
        print("❌ ОШИБКА: Нет доступа к сетевой папке!")
        print(f"   Проверьте доступность: {NETWORK_RESOURCES_PATH}")
        show_error_dialog(
            'Email Builder — ошибка запуска',
            f'Нет доступа к сетевой папке:\n{NETWORK_RESOURCES_PATH}\n\n'
            'Локальный кеш не найден. Приложение не может запуститься.\n\n'
            'Проверьте подключение к сети и повторите попытку.'
        )
        return False

    # 1. Копируем config.json
    print("\n📥 Загрузка config.json...")
    network_config = os.path.join(
        NETWORK_RESOURCES_PATH, 'static', 'config.json')
    cache_config = os.path.join(CACHE_DIR, 'config.json')
    if os.path.exists(network_config):
        shutil.copy2(network_config, cache_config)
        print("✓ Config.json скопирован")

    # 2. Копируем только папки с картинками
    folders_to_cache = ['icons', 'expert-badges', 'bullets', 'button-icons',
                        'images', 'dividers', 'banner-backgrounds', 'banner-logos', 'banner-icons','fonts']
    for folder in folders_to_cache:
        network_folder = os.path.join(NETWORK_RESOURCES_PATH, 'static', folder)
        cache_folder = os.path.join(CACHE_DIR, folder)

        if os.path.exists(network_folder):
            print(f"\n📥 Загрузка {folder}/...")
            copy_directory_with_progress(network_folder, cache_folder, folder)

    # Сохраняем версию
    network_version = get_network_version()
    if network_version:
        set_cache_version(network_version)
        print(f"\n📝 Версия ресурсов: {network_version}")
    else:
        print("\n⚠️  Файл version.txt не найден на сервере")
        print("   Создаётся локальная версия...")
        import time as _time
        local_version = f"local-{_time.strftime('%Y%m%d')}"
        set_cache_version(local_version)
        print(f"📝 Версия ресурсов: {local_version}")

    print("=" * 60)
    print("✅ Инициализация завершена!")
    print("=" * 60 + "\n")
    return True


def check_for_updates():
    """Проверка обновлений при запуске. Не блокирует сервер — input() не используется."""
    print("🔍 Диагностика состояния кеша:")
    print(f"   CACHE_DIR: {CACHE_DIR}")
    print(f"   Существует: {os.path.exists(CACHE_DIR)}")

    cache_version = get_cache_version()
    print(f"   Версия кеша: {cache_version if cache_version else 'НЕ НАЙДЕНА'}")

    cache_exists = os.path.exists(CACHE_DIR) and os.path.exists(
        os.path.join(CACHE_DIR, 'config.json'))

    folders_to_check = ['icons', 'expert-badges', 'fonts']
    has_resources = any(os.path.exists(os.path.join(CACHE_DIR, folder))
                        for folder in folders_to_check)

    if not cache_version or not cache_exists or not has_resources:
        if not cache_version:
            print("📦 Кеш не найден (отсутствует файл версии)")
        elif not cache_exists:
            print("📦 Кеш не найден (отсутствует config.json)")
        elif not has_resources:
            print("📦 Кеш не найден (отсутствуют ресурсы)")
        print("   Требуется первичная инициализация")
        return initialize_cache()

    if not check_network_access():
        print("⚠️  Нет доступа к сетевому ресурсу")
        print("   Используется локальный кеш")
        show_error_dialog(
            'Email Builder — нет доступа к сети',
            f'Нет доступа к сетевой папке:\n{NETWORK_RESOURCES_PATH}\n\n'
            'Приложение запущено в автономном режиме.\n'
            'Шаблоны и ресурсы загружены из локального кеша.'
        )
        return True

    network_version = get_network_version()

    if not network_version:
        print("⚠️  Файл version.txt не найден на сервере")
        print("   Используется локальный кеш")
        return True

    if cache_version != network_version:
        print(f"📥 Доступно обновление ресурсов: {cache_version} → {network_version}")
        print("   Используйте /api/update-check для управления обновлением через браузер")
    else:
        print(f"✓ Ресурсы актуальны (версия {cache_version})")

    return True


def load_config():
    """Загрузить config.json с сервера или из кеша"""
    network_config_path = os.path.join(
        NETWORK_RESOURCES_PATH, 'static', 'config.json')
    cache_config_path = os.path.join(CACHE_DIR, 'config.json')

    config = None

    if os.path.exists(network_config_path):
        try:
            with open(network_config_path, 'r', encoding='utf-8') as f:
                config = json.load(f)
            print("✓ Config.json загружен с сервера")

            os.makedirs(os.path.dirname(cache_config_path), exist_ok=True)
            with open(cache_config_path, 'w', encoding='utf-8') as f:
                json.dump(config, f, ensure_ascii=False, indent=2)

        except Exception as e:
            print(f"⚠️  Ошибка чтения config.json с сервера: {e}")

    if not config and os.path.exists(cache_config_path):
        try:
            with open(cache_config_path, 'r', encoding='utf-8') as f:
                config = json.load(f)
            print("⚠️  Используется кеш config.json")
        except Exception as e:
            print(f"❌ Ошибка чтения кеша config.json: {e}")

    if not config:
        print("❌ Не удалось загрузить config.json!")
        return {"version": "1.0", "icons": {}, "expertBadges": [], "bullets": [], "buttonIcons": []}

    return config

# ============================================================================
# ФУНКЦИИ ОБРАБОТКИ ИЗОБРАЖЕНИЙ И ШРИФТОВ
# ============================================================================


def process_local_images_in_html(html_content, base_path=None):
    """Находит все <img src="путь_к_файлу"> в HTML и заменяет локальные файлы на base64"""
    if base_path is None:
        base_path = os.getcwd()

    img_pattern = re.compile(
        r'<img\s+([^>]*\s+)?src=["\'](?!(?:https?://|data:))([^"\']+)["\']([^>]*)>',
        re.IGNORECASE
    )

    def replace_image(match):
        try:
            before_attrs = match.group(1) or ''
            file_path = match.group(2)
            after_attrs = match.group(3) or ''

            if not os.path.isabs(file_path):
                file_path = os.path.normpath(
                    os.path.join(base_path, file_path))

            if not os.path.exists(file_path):
                print(f"⚠️  Изображение не найдено: {file_path}")
                return match.group(0)

            with open(file_path, 'rb') as img_file:
                img_data = img_file.read()
                img_base64 = base64.b64encode(img_data).decode('utf-8')

            mime_type, _ = mimetypes.guess_type(file_path)
            if mime_type is None:
                ext = os.path.splitext(file_path)[1].lower()
                mime_types = {
                    '.png': 'image/png',
                    '.jpg': 'image/jpeg',
                    '.jpeg': 'image/jpeg',
                    '.gif': 'image/gif',
                    '.bmp': 'image/bmp',
                    '.svg': 'image/svg+xml',
                }
                mime_type = mime_types.get(ext, 'image/png')

            data_uri = f"data:{mime_type};base64,{img_base64}"
            print(
                f"✓ Изображение конвертировано: {os.path.basename(file_path)}")

            return f'<img {before_attrs}src="{data_uri}"{after_attrs}>'

        except Exception as e:
            print(f"⚠️  Ошибка обработки изображения: {e}")
            return match.group(0)

    try:
        result = img_pattern.sub(replace_image, html_content)
        return result
    except Exception as e:
        print(f"⚠️  Ошибка обработки HTML: {e}")
        return html_content








def _parse_img_size_px(img_tag: str):
    """
    Вытаскивает width/height из тега <img ...>:
      - width="16" height="16"
      - style="width:16px; height:16px"
    Возвращает (w_px, h_px) или (None, None).
    """
    w = h = None
    m = re.search(r'\bwidth\s*=\s*["\']?\s*(\d+)\s*["\']?', img_tag, re.IGNORECASE)
    if m:
        w = int(m.group(1))
    m = re.search(r'\bheight\s*=\s*["\']?\s*(\d+)\s*["\']?', img_tag, re.IGNORECASE)
    if m:
        h = int(m.group(1))
    if w is None:
        m = re.search(r'width\s*:\s*(\d+)\s*px', img_tag, re.IGNORECASE)
        if m:
            w = int(m.group(1))
    if h is None:
        m = re.search(r'height\s*:\s*(\d+)\s*px', img_tag, re.IGNORECASE)
        if m:
            h = int(m.group(1))
    return w, h




def _get_local_ip() -> str:
    """Возвращает локальный IP машины (не 127.0.0.1)."""
    import socket
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return '127.0.0.1'


def prepare_html_for_email(html_content: str) -> str:
    """
    Подготавливает HTML для отправки через Exchange.
    Заменяет все src на inline base64:
    - http://localhost:PORT/path  → ищет в CACHE_DIR / NETWORK / BASE_DIR
    - bullets/Буллет.png          → ищет в CACHE_DIR / NETWORK / BASE_DIR
    - data:...                    → оставляет как есть
    """
    if not html_content:
        return html_content

    def resolve(rel_path: str):
        """Возвращает полный путь к файлу или None."""
        rel = rel_path.lstrip('/')
        for base in [CACHE_DIR,
                     os.path.join(NETWORK_RESOURCES_PATH, 'static'),
                     BUILTIN_DIR,
                     os.path.join(BUILTIN_DIR, 'static')]:
            p = os.path.join(base, rel)
            if os.path.exists(p):
                return p
        return None

    def to_base64(file_path: str, original: str) -> str:
        try:
            with open(file_path, 'rb') as f:
                data = f.read()
            mime_type, _ = mimetypes.guess_type(file_path)
            mime_type = mime_type or 'image/png'
            b64 = base64.b64encode(data).decode('utf-8')
            return f'src="data:{mime_type};base64,{b64}"'
        except Exception as e:
            print(f"⚠️  prepare_html: ошибка чтения {file_path}: {e}")
            return original

    # 1. localhost URL → base64
    def replace_localhost(match):
        full = match.group(0)
        url_path = match.group(1)
        fp = resolve(url_path)
        if not fp:
            print(f"⚠️  prepare_html: не найден: {url_path}")
            return full
        return to_base64(fp, full)

    html_content = re.sub(
        r'src="https?://(?:localhost|127\.0\.0\.1):\d+(/[^"]*)"',
        replace_localhost,
        html_content,
        flags=re.IGNORECASE
    )

    # 2. Относительные пути (bullets/..., dividers/..., banners/...) → base64
    RELATIVE_PREFIXES = (
        'bullets/', 'dividers/', 'icons/',
        'banner-backgrounds/', 'banner-logos/', 'banner-icons/',
        'button-icons/', 'expert-badges/', 'images/',
    )

    def replace_relative(match):
        full = match.group(0)
        src_val = match.group(1)
        if src_val.startswith('data:') or src_val.startswith('http'):
            return full
        if not any(src_val.startswith(p) for p in RELATIVE_PREFIXES):
            return full
        fp = resolve(src_val)
        if not fp:
            print(f"⚠️  prepare_html: не найден: {src_val}")
            return full
        return to_base64(fp, full)

    html_content = re.sub(
        r'src="([^"]+)"',
        replace_relative,
        html_content,
        flags=re.IGNORECASE
    )

    return html_content



def prepare_html_for_meeting(html_content: str) -> str:
    """
    Подготавливает HTML для встречи в Exchange Calendar.
    CalendarItem не поддерживает inline CID/base64.
    Все картинки (data: URI и относительные пути) конвертируем:
    - data:image → сохраняем как временный файл в CACHE_DIR/meeting-assets/
    - relative/path → http://IP:PORT/relative/path
    Outlook сам загружает картинки с нашего Flask-сервера.
    """
    if not html_content:
        return html_content

    local_ip = _get_local_ip()
    base_url = f'http://{local_ip}:{PORT}'

    assets_dir = os.path.join(CACHE_DIR, 'meeting-assets')
    os.makedirs(assets_dir, exist_ok=True)

    RELATIVE_PREFIXES = (
        'bullets/', 'dividers/', 'icons/',
        'banner-backgrounds/', 'banner-logos/', 'banner-icons/',
        'button-icons/', 'expert-badges/', 'images/',
    )

    def replace_src(match):
        src_val = match.group(1)

        # data:image/... → сохраняем как временный файл
        dm = re.match(r'data:([^;]+);base64,(.+)', src_val, re.DOTALL)
        if dm:
            mime_type = dm.group(1)
            b64_data  = dm.group(2).strip()
            try:
                raw = base64.b64decode(b64_data)
                ext = mimetypes.guess_extension(mime_type) or '.png'
                ext = ext.replace('.jpe', '.jpg')
                fname = f'{uuid.uuid4().hex}{ext}'
                fpath = os.path.join(assets_dir, fname)
                with open(fpath, 'wb') as f:
                    f.write(raw)
                return f'src="{base_url}/meeting-assets/{fname}"'
            except Exception as e:
                print(f'meeting asset error: {e}')
                return match.group(0)

        # localhost → реальный IP
        if 'localhost' in src_val or '127.0.0.1' in src_val:
            new_src = src_val.replace(f'http://localhost:{PORT}', base_url)
            new_src = new_src.replace(f'http://127.0.0.1:{PORT}', base_url)
            return f'src="{new_src}"'

        # Относительный путь → абсолютный URL
        if any(src_val.startswith(p) for p in RELATIVE_PREFIXES):
            return f'src="{base_url}/{src_val}"'

        return match.group(0)

    html_content = re.sub(
        r'src="([^"]+)"',
        replace_src,
        html_content,
        flags=re.IGNORECASE | re.DOTALL
    )
    return html_content




@app.route('/meeting-assets/<path:filename>')
def serve_meeting_asset(filename):
    """Отдаёт временные картинки встреч (для Outlook CalendarItem)."""
    assets_dir = os.path.join(CACHE_DIR, 'meeting-assets')
    return send_from_directory(assets_dir, filename)

@app.route('/')
def index():
    if APP_MODE == 'user':
        from flask import redirect
        return redirect('/user')
    return send_from_directory(app.static_folder, 'index.html')


@app.route('/user')
def user_index():
    """User-версия приложения"""
    return send_from_directory(app.static_folder, 'index-user.html')


@app.route('/<path:path>')
def static_files(path):
    """Гибридная раздача: картинки из кеша, остальное из static"""

    # Блокируем админские страницы/файлы в user-режиме
    if APP_MODE == 'user':
        blocked_paths = {
            'index.html',
        }
        # Блокируем все JS/CSS файлы которые относятся только к админке
        admin_js_prefixes = (
            'js/main.js',
            'js/settingsPanels.js',
            'js/settingsUI.js',
            'js/blockOperations.js',
            'js/columnOperations.js',
            'js/dragDrop.js',
            'js/canvasRenderer.js',
            'js/templatesUI.js',
            'js/themeToggle.js',
            'js/settings/',
        )
        if path in blocked_paths:
            abort(404)
        if any(path.startswith(p) for p in admin_js_prefixes):
            abort(404)

    # Картинки сначала ищем в кеше
    if path.startswith(('icons/', 'expert-badges/', 'bullets/', 'button-icons/', 'images/', 'banner-logos/', 'banner-backgrounds/', 'banner-icons/', 'dividers/', 'fonts/')):
        # Пробуем кеш
        cache_file = os.path.join(CACHE_DIR, path)
        if os.path.exists(cache_file):
            return send_from_directory(CACHE_DIR, path)

        # Fallback: пробуем сервер
        network_file = os.path.join(NETWORK_RESOURCES_PATH, 'static', path)
        if os.path.exists(network_file):
            print(f"⚠️  Файл не в кеше, загружаем с сервера: {path}")
            return send_from_directory(os.path.join(NETWORK_RESOURCES_PATH, 'static'), path)

        # Если нигде нет
        print(f"❌ Файл не найден: {path}")
        return "File not found", 404

    # HTML/CSS/JS из встроенной static
    return send_from_directory(app.static_folder, path)


@app.route('/api/config', methods=['GET'])
def get_config():
    """API endpoint для получения конфигурации (config.json)"""
    try:
        config = load_config()
        return jsonify({'success': True, 'config': config})
    except Exception as e:
        app.logger.error("get_config error: %s", e, exc_info=True)
        return jsonify({'success': False, 'error': 'Внутренняя ошибка сервера'}), 500


@app.route('/api/update-check', methods=['GET'])
def update_check():
    """
    Проверка наличия обновлений без блокировки.
    Возвращает: {'update_available': bool, 'current': str, 'new': str}
    Диалог обновления показывается в браузере, не в терминале.
    """
    try:
        current = get_cache_version() or 'unknown'

        if not check_network_access():
            return jsonify({
                'update_available': False,
                'current': current,
                'new': current,
                'reason': 'no_network'
            })

        network_version = get_network_version()
        if not network_version:
            return jsonify({
                'update_available': False,
                'current': current,
                'new': current,
                'reason': 'no_version_file'
            })

        update_available = (current != network_version)
        return jsonify({
            'update_available': update_available,
            'current': current,
            'new': network_version
        })

    except Exception as e:
        app.logger.error("update_check error: %s", e, exc_info=True)
        return jsonify({'update_available': False, 'error': 'Внутренняя ошибка сервера'}), 500


@app.route('/api/update-apply', methods=['POST'])
def update_apply():
    """
    Применить обновление ресурсов (вызывается из браузера после подтверждения).
    """
    try:
        if not check_network_access():
            return jsonify({'success': False, 'error': 'Нет доступа к сетевой папке'}), 503

        result = initialize_cache()
        if result:
            return jsonify({'success': True, 'version': get_cache_version()})
        else:
            return jsonify({'success': False, 'error': 'Обновление не удалось'}), 500

    except Exception as e:
        app.logger.error("update_apply error: %s", e, exc_info=True)
        return jsonify({'success': False, 'error': 'Внутренняя ошибка сервера'}), 500


# ============================================================================
# TEMPLATES API
# ============================================================================


def get_templates_dir():
    """Получить путь к папке templates"""
    return os.path.join(NETWORK_RESOURCES_PATH, 'templates')


def get_user_from_system():
    """Получить имя текущего пользователя Windows"""
    return os.environ.get('USERNAME', 'unknown').lower()


@app.route('/api/templates/list', methods=['GET'])
def templates_list():
    """Получить список всех шаблонов (общих и личных)"""
    try:
        templates_dir = get_templates_dir()
        current_user = get_user_from_system()

        shared_dir = os.path.join(templates_dir, 'shared')
        user_dir = os.path.join(templates_dir, 'users', current_user)

        result = {
            'shared': [],
            'personal': []
        }

        if os.path.exists(shared_dir):
            for filename in os.listdir(shared_dir):
                if filename.endswith('.json'):
                    filepath = os.path.join(shared_dir, filename)
                    try:
                        with open(filepath, 'r', encoding='utf-8') as f:
                            template = json.load(f)
                            result['shared'].append({
                                'name': template.get('name', filename),
                                'filename': filename,
                                'created': template.get('created', ''),
                                'author': template.get('author', 'unknown'),
                                'type': 'shared',
                                'category': template.get('category', ''),
                                'preview': template.get('preview', None),
                                'isPreset': bool(template.get('isPreset', False))
                            })
                    except Exception as e:
                        print(f"⚠️  Ошибка чтения шаблона {filename}: {e}")

        if os.path.exists(user_dir):
            for filename in os.listdir(user_dir):
                if filename.endswith('.json'):
                    filepath = os.path.join(user_dir, filename)
                    try:
                        with open(filepath, 'r', encoding='utf-8') as f:
                            template = json.load(f)
                            result['personal'].append({
                                'name': template.get('name', filename),
                                'filename': filename,
                                'created': template.get('created', ''),
                                'author': current_user,
                                'type': 'personal'
                            })
                    except Exception as e:
                        print(f"⚠️  Ошибка чтения шаблона {filename}: {e}")

        result['shared'].sort(key=lambda x: x['name'])
        result['personal'].sort(key=lambda x: x['name'])

        return jsonify({'success': True, 'templates': result})

    except Exception as e:
        app.logger.error("templates_list error: %s", e, exc_info=True)
        return jsonify({'success': False, 'error': 'Внутренняя ошибка сервера'}), 500


@app.route('/api/templates/load', methods=['GET'])
def templates_load():
    """Загрузить шаблон"""
    try:
        raw_filename = (request.args.get('filename') or '').strip()
        template_type = request.args.get('type', 'personal')
        current_user = get_user_from_system()

        # Валидация: filename обязателен
        if not raw_filename:
            return jsonify({'success': False, 'error': 'Не указано имя файла'}), 400

        # Безопасное имя файла (убирает ../, абсолютные пути, спецсимволы)
        filename = secure_filename(raw_filename)
        if not filename or not filename.endswith('.json'):
            return jsonify({'success': False, 'error': 'Недопустимое имя файла'}), 400

        templates_dir = get_templates_dir()

        if template_type == 'shared':
            base_dir = os.path.join(templates_dir, 'shared')
        else:
            base_dir = os.path.join(templates_dir, 'users', current_user)

        filepath = os.path.join(base_dir, filename)

        # Защита от path traversal: итоговый путь должен быть внутри base_dir
        if not os.path.abspath(filepath).startswith(os.path.abspath(base_dir) + os.sep):
            return jsonify({'success': False, 'error': 'Доступ запрещён'}), 403

        if not os.path.exists(filepath):
            return jsonify({'success': False, 'error': 'Шаблон не найден'}), 404

        with open(filepath, 'r', encoding='utf-8') as f:
            template = json.load(f)

        return jsonify({'success': True, 'template': template})

    except Exception as e:
        app.logger.error("templates_load error: %s", e, exc_info=True)
        return jsonify({'success': False, 'error': 'Внутренняя ошибка сервера'}), 500


@app.route('/api/templates/save', methods=['POST'])
def templates_save():
    """Сохранить новый шаблон"""
    try:
        data = request.json or {}
        name = (data.get('name') or '').strip()
        blocks = data.get('blocks')
        template_type = data.get('type', 'personal')
        template_type = str(template_type).strip().lower()
        category = data.get('category', '')
        preview = data.get('preview', None)
        is_preset = bool(data.get('isPreset', False))

        if APP_MODE == 'user' and template_type == 'shared':
            return jsonify({'success': False, 'error': 'Недостаточно прав'}), 403

        if not name or blocks is None:
            return jsonify({'success': False, 'error': 'Нет данных'}), 400

        current_user = get_user_from_system()
        templates_dir = get_templates_dir()

        if template_type == 'shared':
            save_dir = os.path.join(templates_dir, 'shared')
        else:
            save_dir = os.path.join(templates_dir, 'users', current_user)

        os.makedirs(save_dir, exist_ok=True)

        # Генерируем уникальное имя файла с timestamp + hash
        timestamp = int(time.time() * 1000)
        name_hash = hashlib.md5(name.encode('utf-8')).hexdigest()[:8]
        filename = f'template_{timestamp}_{name_hash}.json'
        filepath = os.path.join(save_dir, filename)

        template = {
            'id': f'tpl_{int(time.time())}',
            'name': name,
            'category': category,
            'preview': preview,
            'created': datetime.now().isoformat(),
            'author': current_user,
            'type': template_type,
            'isPreset': is_preset,
            'blocks': blocks
        }

        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(template, f, ensure_ascii=False, indent=2)

        print(
            f"✓ Шаблон сохранён: {filename} ({template_type}, категория: {category or 'без категории'})")

        return jsonify({'success': True, 'filename': filename})

    except Exception as e:
        app.logger.error("templates_save error: %s", e, exc_info=True)
        return jsonify({'success': False, 'error': 'Внутренняя ошибка сервера'}), 500


@app.route('/api/templates/delete', methods=['DELETE'])
def templates_delete():
    """Удалить шаблон"""
    try:
        raw_filename = (request.args.get('filename') or '').strip()
        template_type = request.args.get('type', 'personal')
        template_type = str(template_type).strip().lower()
        current_user = get_user_from_system()

        # Валидация: filename обязателен
        if not raw_filename:
            return jsonify({'success': False, 'error': 'Не указано имя файла'}), 400

        filename = secure_filename(raw_filename)
        if not filename or not filename.endswith('.json'):
            return jsonify({'success': False, 'error': 'Недопустимое имя файла'}), 400

        if APP_MODE == 'user' and template_type == 'shared':
            return jsonify({'success': False, 'error': 'Недостаточно прав'}), 403

        templates_dir = get_templates_dir()

        if template_type == 'shared':
            base_dir = os.path.join(templates_dir, 'shared')
        else:
            base_dir = os.path.join(templates_dir, 'users', current_user)

        filepath = os.path.join(base_dir, filename)

        # Защита от path traversal
        if not os.path.abspath(filepath).startswith(os.path.abspath(base_dir) + os.sep):
            return jsonify({'success': False, 'error': 'Доступ запрещён'}), 403

        if not os.path.exists(filepath):
            return jsonify({'success': False, 'error': 'Шаблон не найден'}), 404

        os.remove(filepath)
        print(f"✓ Шаблон удалён: {filename}")

        return jsonify({'success': True})

    except Exception as e:
        app.logger.error("templates_delete error: %s", e, exc_info=True)
        return jsonify({'success': False, 'error': 'Внутренняя ошибка сервера'}), 500


@app.route('/api/templates/rename', methods=['PUT'])
def templates_rename():
    """Переименовать шаблон"""
    try:
        data = request.json or {}
        raw_filename = (data.get('filename') or '').strip()
        new_name = (data.get('newName') or '').strip()
        template_type = data.get('type', 'personal')
        template_type = str(template_type).strip().lower()
        current_user = get_user_from_system()

        # Валидация filename
        if not raw_filename:
            return jsonify({'success': False, 'error': 'Не указано имя файла'}), 400
        filename = secure_filename(raw_filename)
        if not filename or not filename.endswith('.json'):
            return jsonify({'success': False, 'error': 'Недопустимое имя файла'}), 400

        # Валидация нового имени
        if not new_name:
            return jsonify({'success': False, 'error': 'Название не может быть пустым'}), 400
        if len(new_name) > 200:
            return jsonify({'success': False, 'error': 'Название слишком длинное (макс. 200 символов)'}), 400

        if APP_MODE == 'user' and template_type == 'shared':
            return jsonify({'success': False, 'error': 'Недостаточно прав'}), 403

        templates_dir = get_templates_dir()

        if template_type == 'shared':
            base_dir = os.path.join(templates_dir, 'shared')
        else:
            base_dir = os.path.join(templates_dir, 'users', current_user)

        old_filepath = os.path.join(base_dir, filename)

        # Защита от path traversal
        if not os.path.abspath(old_filepath).startswith(os.path.abspath(base_dir) + os.sep):
            return jsonify({'success': False, 'error': 'Доступ запрещён'}), 403

        if not os.path.exists(old_filepath):
            return jsonify({'success': False, 'error': 'Шаблон не найден'}), 404

        with open(old_filepath, 'r', encoding='utf-8') as f:
            template = json.load(f)

        template['name'] = new_name

        safe_name = secure_filename(new_name.replace(' ', '_'))
        new_filename = f'template_{safe_name}.json'
        new_filepath = os.path.join(base_dir, new_filename)

        # Защита нового пути
        if not os.path.abspath(new_filepath).startswith(os.path.abspath(base_dir) + os.sep):
            return jsonify({'success': False, 'error': 'Доступ запрещён'}), 403

        with open(new_filepath, 'w', encoding='utf-8') as f:
            json.dump(template, f, ensure_ascii=False, indent=2)

        if old_filepath != new_filepath:
            os.remove(old_filepath)

        print(f"✓ Шаблон переименован: {filename} → {new_filename}")

        return jsonify({'success': True, 'newFilename': new_filename})

    except Exception as e:
        app.logger.error("templates_rename error: %s", e, exc_info=True)
        return jsonify({'success': False, 'error': 'Внутренняя ошибка сервера'}), 500


def get_categories_file():
    """Путь к файлу категорий"""
    return os.path.join(get_templates_dir(), 'categories.json')


def load_categories():
    """Загрузить категории из файла"""
    categories_file = get_categories_file()
    if os.path.exists(categories_file):
        try:
            with open(categories_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                return data.get('categories', [])
        except:
            pass
    return []


def save_categories(categories):
    """Сохранить категории в файл"""
    categories_file = get_categories_file()
    os.makedirs(os.path.dirname(categories_file), exist_ok=True)
    with open(categories_file, 'w', encoding='utf-8') as f:
        json.dump({'categories': categories}, f, ensure_ascii=False, indent=2)


@app.route('/api/templates/categories', methods=['GET'])
def templates_get_categories():
    """Получить список категорий"""
    try:
        categories = load_categories()
        return jsonify({'success': True, 'categories': categories})
    except Exception as e:
        app.logger.error("templates_get_categories error: %s", e, exc_info=True)
        return jsonify({'success': False, 'error': 'Внутренняя ошибка сервера'}), 500


@app.route('/api/templates/categories', methods=['POST'])
def templates_add_category():
    """Добавить новую категорию"""
    try:
        data = request.json
        name = data.get('name', '').strip()

        if not name:
            return jsonify({'success': False, 'error': 'Название категории не указано'}), 400

        categories = load_categories()

        if name not in categories:
            categories.append(name)
            categories.sort()
            save_categories(categories)
            print(f"✓ Категория добавлена: {name}")

        return jsonify({'success': True, 'categories': categories})

    except Exception as e:
        app.logger.error("templates_add_category error: %s", e, exc_info=True)
        return jsonify({'success': False, 'error': 'Внутренняя ошибка сервера'}), 500


@app.route('/api/templates/categories', methods=['DELETE'])
def templates_delete_category():
    """Удалить категорию"""
    try:
        name = request.args.get('name', '').strip()

        if not name:
            return jsonify({'success': False, 'error': 'Название категории не указано'}), 400

        categories = load_categories()

        if name in categories:
            categories.remove(name)
            save_categories(categories)
            print(f"✓ Категория удалена: {name}")

        return jsonify({'success': True, 'categories': categories})

    except Exception as e:
        app.logger.error("templates_delete_category error: %s", e, exc_info=True)
        return jsonify({'success': False, 'error': 'Внутренняя ошибка сервера'}), 500

# ============================================================================
# АВТОМАТИЧЕСКОЕ ОТКРЫТИЕ БРАУЗЕРА
# ============================================================================


def open_browser():
    """Открыть браузер через 1.5 секунды"""
    time.sleep(1.5)
    if APP_MODE == 'user':
        webbrowser.open(f'http://localhost:{PORT}/user')
    else:
        webbrowser.open(f'http://localhost:{PORT}')

# ============================================================================
# ГЛАВНАЯ ФУНКЦИЯ ЗАПУСКА
# ============================================================================


def main():
    import io
    if sys.stdout is None:
        sys.stdout = open(os.devnull, 'w', encoding='utf-8')
    if sys.stderr is None:
        sys.stderr = open(os.devnull, 'w', encoding='utf-8')

    # Показываем окно загрузки
    close_splash = show_splash()

    print("\n" + "=" * 60)
    print("🚀 Email Builder")
    print("=" * 60)
    print(f"📁 Сетевой ресурс: {NETWORK_RESOURCES_PATH}")
    print(f"💾 Локальный кеш: {CACHE_DIR}")
    print("=" * 60 + "\n")

    if not check_for_updates():
        close_splash()
        print("❌ Не удалось инициализировать приложение")
        sys.exit(1)

    print("\n" + "=" * 60)
    print("✓ Используется локальный кеш")
    print(f"🌐 Запуск сервера на http://localhost:{PORT}")
    print("=" * 60 + "\n")

    # Открываем браузер и закрываем сплэш
    def open_and_close():
        time.sleep(1.5)
        close_splash()
        if APP_MODE == 'user':
            webbrowser.open(f'http://localhost:{PORT}/user')
        else:
            webbrowser.open(f'http://localhost:{PORT}')

    threading.Thread(target=open_and_close, daemon=True).start()

    try:
        app.run(host='0.0.0.0', port=PORT, debug=False)
    except KeyboardInterrupt:
        print("\n\n👋 Приложение остановлено")
        sys.exit(0)
# =============================================================================
# Exchange / EWS — отправка писем и встреч
# =============================================================================

try:
    from credentials_manager import (
        get_credentials_path, save_credentials, load_credentials,
        credentials_exist, validate_credentials_data,
    )
    from exchange_sender import (
        connect_exchange, exchange_send_email, exchange_send_meeting,
        parse_datetime, parse_recipients,
    )
    EXCHANGE_AVAILABLE = True
except ImportError:
    EXCHANGE_AVAILABLE = False


@app.route('/api/credentials/status', methods=['GET'])
def api_credentials_status():
    """Проверяет наличие сохранённых учётных данных Exchange."""
    try:
        path = get_credentials_path()
        exists = credentials_exist(path)
        if exists:
            creds = load_credentials(path)
            return jsonify({
                'exists':          True,
                'username':        creds.get('username')        if creds else None,
                'server':          creds.get('server')          if creds else None,
                'from_email':      creds.get('from_email')      if creds else None,
                'default_senders': creds.get('default_senders') if creds else [],
            })
        return jsonify({'exists': False, 'username': None, 'server': None, 'from_email': None, 'default_senders': []})
    except Exception as e:
        app.logger.error('credentials_status error: %s', e, exc_info=True)
        return jsonify({'success': False, 'error': 'Внутренняя ошибка сервера'}), 500


@app.route('/api/credentials/save', methods=['POST'])
def api_credentials_save():
    """Сохраняет учётные данные Exchange (пароль шифруется)."""
    try:
        data = request.json or {}
        server      = str(data.get('server')     or '').strip()
        username    = str(data.get('username')   or '').strip()
        password    = str(data.get('password')   or '').strip()
        from_email  = str(data.get('from_email') or '').strip()
        default_senders = data.get('default_senders') or []

        ok, err = validate_credentials_data({
            'server': server, 'username': username,
            'password': password, 'from_email': from_email,
        })
        if not ok:
            return jsonify({'success': False, 'error': err}), 400

        path = get_credentials_path()
        save_credentials(path, server, username, password,
                         from_email, default_senders)
        return jsonify({'success': True})
    except Exception as e:
        app.logger.error('credentials_save error: %s', e, exc_info=True)
        return jsonify({'success': False, 'error': 'Внутренняя ошибка сервера'}), 500


@app.route('/api/send/email', methods=['POST'])
def api_send_email():
    """Отправляет HTML-письмо через Exchange."""
    try:
        path = get_credentials_path()
        if not credentials_exist(path):
            return jsonify({'success': False, 'error': 'Учётные данные не настроены'}), 401

        data      = request.json or {}
        subject   = str(data.get('subject')    or '').strip()
        to        = parse_recipients(data.get('to',  []))
        cc        = parse_recipients(data.get('cc',  []))
        bcc       = parse_recipients(data.get('bcc', []))
        from_email = str(data.get('from_email') or '').strip()

        if not subject:
            return jsonify({'success': False, 'error': 'Тема обязательна'}), 400
        if not to and not cc and not bcc:
            return jsonify({'success': False, 'error': 'Укажите хотя бы одного получателя'}), 400

        creds = load_credentials(path)
        account = connect_exchange(
            creds['server'], creds['username'], creds['password'],
            from_email or creds['from_email']
        )
        html_body = prepare_html_for_email(data.get('html_body', ''))
        exchange_send_email(account, subject, html_body, to, cc, bcc)
        return jsonify({'success': True})

    except ValueError as e:
        return jsonify({'success': False, 'error': str(e)}), 401
    except ConnectionError as e:
        return jsonify({'success': False, 'error': str(e)}), 503
    except Exception as e:
        app.logger.error('send_email error: %s', e, exc_info=True)
        return jsonify({'success': False, 'error': 'Внутренняя ошибка сервера'}), 500


@app.route('/api/send/meeting', methods=['POST'])
def api_send_meeting():
    """Создаёт встречу в Exchange Calendar."""
    try:
        path = get_credentials_path()
        if not credentials_exist(path):
            return jsonify({'success': False, 'error': 'Учётные данные не настроены'}), 401

        data       = request.json or {}
        subject    = str(data.get('subject')    or '').strip()
        to         = parse_recipients(data.get('to',  []))
        cc         = parse_recipients(data.get('cc',  []))
        bcc        = parse_recipients(data.get('bcc', []))
        from_email = str(data.get('from_email') or '').strip()
        location   = str(data.get('location')   or '').strip()
        start_raw  = str(data.get('start_dt')   or '').strip()
        end_raw    = str(data.get('end_dt')      or '').strip()

        if not subject:
            return jsonify({'success': False, 'error': 'Тема обязательна'}), 400
        if not to and not bcc:
            return jsonify({'success': False, 'error': 'Укажите хотя бы одного участника'}), 400
        if not start_raw or not end_raw:
            return jsonify({'success': False, 'error': 'Дата и время обязательны'}), 400

        try:
            start_dt = parse_datetime(start_raw)
            end_dt   = parse_datetime(end_raw)
        except ValueError as e:
            return jsonify({'success': False, 'error': str(e)}), 400

        if end_dt <= start_dt:
            return jsonify({
                'success': False,
                'error': 'Время окончания должно быть позже начала'
            }), 400

        creds = load_credentials(path)
        account = connect_exchange(
            creds['server'], creds['username'], creds['password'],
            from_email or creds['from_email']
        )
        html_body = prepare_html_for_email(data.get('html_body', ''))
        exchange_send_meeting(
            account, subject, html_body, to, cc, bcc,
            location, start_dt, end_dt
        )
        return jsonify({'success': True})

    except ValueError as e:
        return jsonify({'success': False, 'error': str(e)}), 401
    except ConnectionError as e:
        return jsonify({'success': False, 'error': str(e)}), 503
    except Exception as e:
        import traceback
        app.logger.error('send_meeting error: %s', e, exc_info=True)
        return jsonify({'success': False, 'error': f'{type(e).__name__}: {e}'}), 500

@app.route('/api/shutdown', methods=['POST'])
def api_shutdown():
    """Завершает приложение когда браузер закрывается."""
    def _stop():
        time.sleep(0.3)
        os._exit(0)
    threading.Thread(target=_stop, daemon=True).start()
    return jsonify({'success': True})

if __name__ == '__main__':
    main()