"""
Flask blueprint: application mode, license, log and settings endpoints.

.. module:: routes.settings
   :synopsis: Endpoints for APP_MODE switching, license status, protocol.log
              opening, application settings persistence, resource repository
              management, and graceful shutdown.

Routes:
    - GET  /api/mode                          — current APP_MODE and switch availability
    - POST /api/mode                          — switch APP_MODE (admin ↔ user)
    - GET  /api/license-status                — invalid-token flag
    - POST /api/open-log                      — open protocol.log in external app
    - GET  /api/app-settings                  — get platform-specific settings
    - POST /api/app-settings                  — save platform-specific settings
    - POST /api/app-settings/repo/verify      — validate a resource repo path
    - POST /api/app-settings/repo/search      — auto-find the resource repo
    - POST /api/app-settings/repo/create      — create a new resource repo (admin)
    - POST /api/app-settings/repo/refresh-cache — force cache refresh from repo
    - POST /api/app-settings/repo/browse      — open native folder-picker dialog
    - POST /api/shutdown                       — shut the application down cleanly
"""

import os
import sys
import subprocess
import threading
import time

from flask import Blueprint, current_app, jsonify, request

import app as _m  # module reference — gives live access to all app.py globals

bp = Blueprint('settings', __name__)


@bp.route('/api/mode', methods=['GET'])
def api_mode_get():
    """Returns current APP_MODE and whether mode switching is available."""
    mode = _m.get_app_mode()
    return jsonify({
        'mode': mode,
        'can_switch': _m._ADMIN_VALIDATED and not _m._INVALID_TOKEN,
    })


@bp.route('/api/mode', methods=['POST'])
def api_mode_set():
    """
    Switches APP_MODE between ``'admin'`` and ``'user'``.

    Only available when the admin token was validated at startup.
    Switching to ``'user'`` is always allowed; switching back to ``'admin'``
    requires no extra credentials (token was already validated at startup).
    """
    if not _m._ADMIN_VALIDATED or _m._INVALID_TOKEN:
        return jsonify({'success': False, 'error': 'Переключение режима недоступно'}), 403

    data     = request.get_json(silent=True) or {}
    new_mode = data.get('mode', '')
    if new_mode not in ('admin', 'user'):
        return jsonify({'success': False, 'error': 'Допустимые значения: admin, user'}), 400

    mode = _m.set_app_mode(new_mode)
    current_app.logger.info('[mode] switched to %s', mode)
    return jsonify({'success': True, 'mode': mode})


@bp.route('/api/license-status', methods=['GET'])
def api_license_status():
    """
    Returns whether an invalid token was detected at startup.
    Called once by the frontend on load to decide whether to show a warning.
    """
    return jsonify({'invalid_token': _m._INVALID_TOKEN})


@bp.route('/api/open-log', methods=['POST'])
def api_open_log():
    """Opens protocol.log in the system-default external application.

    On Linux tries ``xdg-open`` first, then falls back to a list of common
    text editors.  Returns 500 only when every candidate fails so the client
    can fall back to serving the file in the browser.
    """
    if not _m._ACTIVE_LOG_FILE or not os.path.exists(_m._ACTIVE_LOG_FILE):
        return jsonify({'success': False, 'error': 'protocol.log не найден'}), 404

    try:
        if sys.platform.startswith('win'):
            os.startfile(_m._ACTIVE_LOG_FILE)
            return jsonify({'success': True, 'path': _m._ACTIVE_LOG_FILE})

        if sys.platform == 'darwin':
            subprocess.Popen(['open', _m._ACTIVE_LOG_FILE])
            return jsonify({'success': True, 'path': _m._ACTIVE_LOG_FILE})

        # Linux: xdg-open → gio open → common text editors.
        # When running as a PyInstaller bundle, LD_LIBRARY_PATH and similar
        # variables point to bundled libraries and corrupt any child process
        # that loads system shared objects (including xdg-open helpers).
        # Build a clean environment without those overrides.
        _pyinstaller_vars = {'LD_LIBRARY_PATH', 'LD_PRELOAD', 'PYTHONPATH', 'PYTHONHOME'}
        clean_env = {k: v for k, v in os.environ.items() if k not in _pyinstaller_vars}

        candidates = [
            # Desktop-specific editors (tried before the generic xdg-open so a
            # successful Popen actually means a visible window).
            ['gedit',      _m._ACTIVE_LOG_FILE],  # GNOME
            ['kate',       _m._ACTIVE_LOG_FILE],  # KDE (full)
            ['kwrite',     _m._ACTIVE_LOG_FILE],  # KDE (lightweight)
            ['pluma',      _m._ACTIVE_LOG_FILE],  # MATE
            ['medit',      _m._ACTIVE_LOG_FILE],  # Alt Linux default (older)
            ['xed',        _m._ACTIVE_LOG_FILE],  # MATE / Linux Mint
            ['mousepad',   _m._ACTIVE_LOG_FILE],  # Xfce
            ['featherpad', _m._ACTIVE_LOG_FILE],  # LXQt
            ['leafpad',    _m._ACTIVE_LOG_FILE],  # LXDE
            ['geany',      _m._ACTIVE_LOG_FILE],  # cross-DE
            # Generic openers last: they succeed as a process but may silently
            # fail if the desktop session has no MIME handler for .log files.
            ['xdg-open',   _m._ACTIVE_LOG_FILE],
            ['gio', 'open', _m._ACTIVE_LOG_FILE],
        ]
        last_exc = None
        for cmd in candidates:
            try:
                subprocess.Popen(cmd, env=clean_env)
                return jsonify({'success': True, 'path': _m._ACTIVE_LOG_FILE})
            except FileNotFoundError:
                continue
            except Exception as exc:
                last_exc = exc
                break

        err = str(last_exc) if last_exc else 'Не найдено подходящего приложения для открытия файла'
        current_app.logger.warning('Не удалось открыть protocol.log внешним приложением: %s', err)
        return jsonify({'success': False, 'error': err}), 500

    except Exception as exc:
        current_app.logger.warning('Не удалось открыть protocol.log внешним приложением: %s', exc)
        return jsonify({'success': False, 'error': str(exc)}), 500


@bp.route('/api/app-settings', methods=['GET'])
def api_app_settings_get():
    """Return application settings relevant to the current platform."""
    meta = _m._get_repo_setting_meta()
    current_path = _m._get_runtime_repo_path()
    ok, reason = _m._validate_resource_repo(current_path)
    return jsonify({
        'success': True,
        'platform': meta['platform'],
        'platform_label': meta['platform_label'],
        'config_path': _m._CONFIG_PATH,
        'repo_key': meta['repo_key'],
        'repo_label': meta['repo_label'],
        'repo_path': current_path,
        'repo_placeholder': meta['placeholder'],
        'repo_valid': ok,
        'repo_reason': reason,
        'can_create_repo': _m.get_app_mode() == 'admin',
    })


@bp.route('/api/app-settings', methods=['POST'])
def api_app_settings_save():
    """Persist platform-specific application settings."""
    data = request.get_json(silent=True) or {}
    repo_path = str(data.get('repo_path') or '').strip()
    if not repo_path:
        return jsonify({'success': False, 'error': 'Путь к репозиторию не указан'}), 400

    ok, reason = _m._validate_resource_repo(repo_path)
    if not ok:
        return jsonify({
            'success': False,
            'error': reason or 'Указанный путь не является корректным репозиторием',
            'repo_valid': False,
            'repo_reason': reason,
        }), 400

    _m._apply_repo_path(repo_path, persist=True)
    return jsonify({
        'success': True,
        'repo_path': repo_path,
        'repo_valid': ok,
        'repo_reason': reason,
    })


@bp.route('/api/app-settings/repo/verify', methods=['POST'])
def api_app_settings_repo_verify():
    """Validate that a path points to a resource repository."""
    data = request.get_json(silent=True) or {}
    repo_path = str(data.get('repo_path') or '').strip()
    ok, reason = _m._validate_resource_repo(repo_path)
    return jsonify({'success': ok, 'valid': ok, 'reason': reason})


@bp.route('/api/app-settings/repo/search', methods=['POST'])
def api_app_settings_repo_search():
    """Try to find the resource repository automatically."""
    found = _m._search_for_resource_any()
    if not found:
        return jsonify({'success': False, 'error': 'Репозиторий не найден'}), 404

    ok, reason = _m._validate_resource_repo(found)
    return jsonify({
        'success': ok,
        'repo_path': found,
        'valid': ok,
        'reason': reason,
    })


@bp.route('/api/app-settings/repo/create', methods=['POST'])
def api_app_settings_repo_create():
    """Create a new resource repository at the given path."""
    if _m.get_app_mode() != 'admin':
        return jsonify({'success': False, 'error': 'Создание репозитория доступно только в admin режиме'}), 403

    data = request.get_json(silent=True) or {}
    repo_path = str(data.get('repo_path') or '').strip()
    if not repo_path:
        return jsonify({'success': False, 'error': 'Путь к репозиторию не указан'}), 400

    if not _m._init_new_resource_catalog(repo_path):
        return jsonify({'success': False, 'error': 'Не удалось создать репозиторий'}), 500

    _m._apply_repo_path(repo_path, persist=True)
    return jsonify({'success': True, 'repo_path': repo_path})


@bp.route('/api/app-settings/repo/refresh-cache', methods=['POST'])
def api_app_settings_repo_refresh_cache():
    """Force a refresh of the local cache from the resource repository."""
    data = request.get_json(silent=True) or {}
    repo_path = str(data.get('repo_path') or '').strip()
    if not repo_path:
        repo_path = _m._get_runtime_repo_path()

    if not repo_path:
        return jsonify({'success': False, 'error': 'Путь к репозиторию не указан'}), 400

    ok, reason = _m._validate_resource_repo(repo_path)
    if not ok:
        return jsonify({
            'success': False,
            'error': reason or 'Указанный путь не является корректным репозиторием',
            'repo_valid': False,
            'repo_reason': reason,
        }), 400

    _m._apply_repo_path(repo_path, persist=True)

    try:
        result = _m.initialize_cache()
        if result:
            return jsonify({
                'success': True,
                'repo_path': repo_path,
                'version': _m.get_cache_version(),
            })
        return jsonify({'success': False, 'error': 'Обновление кеша не удалось'}), 500
    except Exception as exc:
        current_app.logger.error("repo_refresh_cache error: %s", exc, exc_info=True)
        return jsonify({'success': False, 'error': 'Внутренняя ошибка сервера'}), 500


@bp.route('/api/app-settings/repo/browse', methods=['POST'])
def api_app_settings_repo_browse():
    """Open a native folder-picker dialog and return the chosen path.

    Delegates to :func:`_browse_folder_native` which uses OS-level tools
    (PowerShell on Windows, kdialog/zenity/yad on Linux) and falls back to
    tkinter.  No Qt event-loop interaction required.

    :returns: ``{'success': True, 'path': '...'}`` on selection or
              ``{'success': False, 'path': null}`` when the user cancels.
    """
    initial = _m._get_runtime_repo_path() or ''
    path = _m._browse_folder_native(initial)
    if path:
        return jsonify({'success': True, 'path': path})
    return jsonify({'success': False, 'path': None})


@bp.route('/api/shutdown', methods=['POST'])
def api_shutdown():
    """Shut the application down cleanly.

    When running inside a QApplication event loop, QApplication.quit() is
    posted to the main thread via QMetaObject.invokeMethod so that Qt can
    destroy its objects (including QWebEngineView timers) on the correct
    thread.  This avoids the
    "QObject::~QObject: Timers cannot be stopped from another thread" warning
    that occurs when os._exit() is called from a background thread while Qt
    objects are still alive.

    If Qt is not available (browser-fallback mode) os._exit() is used as
    before.
    """
    def _stop():
        time.sleep(0.2)
        try:
            from PyQt5.QtWidgets import QApplication
            from PyQt5.QtCore import QMetaObject, Qt
            qt_app = QApplication.instance()
            if qt_app is not None:
                # Post quit() to the main (GUI) thread — safe from any thread.
                QMetaObject.invokeMethod(qt_app, 'quit', Qt.QueuedConnection)
                return
        except Exception:
            pass
        os._exit(0)

    threading.Thread(target=_stop, daemon=True).start()
    return jsonify({'success': True})
