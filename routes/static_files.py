"""
Flask blueprint: static file serving, config and update routes.

.. module:: routes.static_files
   :synopsis: Static asset delivery (HTML, images, cache), config API and
              update check/apply endpoints.

Routes:
    - GET        /meeting-assets/<filename>    — serve temporary meeting images
    - GET        /                             — root index
    - GET        /user                         — user-mode index
    - GET,HEAD   /data/<filename>              — static data assets
    - GET,HEAD   /<path>                       — hybrid static/cache delivery
    - GET        /api/config                   — merged config JSON
    - GET        /api/update-check             — check for resource updates
    - POST       /api/update-apply             — apply resource updates
"""

import os

from flask import Blueprint, abort, current_app, jsonify, redirect, request, send_from_directory

import app as _m  # module reference — gives live access to all app.py globals

bp = Blueprint('static_files', __name__)


@bp.route('/meeting-assets/<path:filename>')
def serve_meeting_asset(filename):
    """Serve temporary meeting images (for Outlook CalendarItem)."""
    assets_dir = os.path.join(current_app.config['CACHE_DIR'], 'meeting-assets')
    return send_from_directory(assets_dir, filename)


@bp.route('/')
def index():
    if _m.get_app_mode() == 'user':
        return redirect('/user')
    return send_from_directory(current_app.static_folder, 'index.html')


@bp.route('/user')
def user_index():
    """User-version of the application."""
    return send_from_directory(current_app.static_folder, 'index-user.html')


@bp.route('/data/<path:filename>', methods=['GET', 'HEAD'])
def static_data_files(filename):
    """Serve static JSON/data assets explicitly."""
    data_dir = os.path.join(current_app.static_folder, 'data')
    return send_from_directory(data_dir, filename)



@bp.route('/<path:path>', methods=['GET', 'HEAD'])
def static_files(path):
    """Hybrid delivery: images from cache, everything else from static folder."""

    # Block admin-only pages/files in user mode
    if _m.get_app_mode() == 'user':
        blocked_paths = {
            'index.html',
        }
        # Block all JS/CSS files that belong only to the admin panel
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

    # Shared resources via explicit URL /cache/{category}/{file}
    if path.startswith('cache/'):
        actual = path[len('cache/'):]
        cache_file = os.path.join(current_app.config['CACHE_DIR'], actual)
        if os.path.exists(cache_file):
            return send_from_directory(current_app.config['CACHE_DIR'], actual)
        network_file = os.path.join(_m.NETWORK_RESOURCES_PATH, 'static', actual)
        if os.path.exists(network_file):
            return send_from_directory(os.path.join(_m.NETWORK_RESOURCES_PATH, 'static'), actual)
        return 'File not found', 404

    # Images — check cache first, then network folder
    if path.startswith(('icons/', 'expert-badges/', 'bullets/', 'button-icons/', 'images/', 'banner-logos/', 'banner-backgrounds/', 'banner-icons/', 'dividers/', 'fonts/')):
        cache_file = os.path.join(current_app.config['CACHE_DIR'], path)
        if os.path.exists(cache_file):
            return send_from_directory(current_app.config['CACHE_DIR'], path)

        network_file = os.path.join(_m.NETWORK_RESOURCES_PATH, 'static', path)
        if os.path.exists(network_file):
            current_app.logger.warning('File not in cache, loading from server: %s', path)
            return send_from_directory(os.path.join(_m.NETWORK_RESOURCES_PATH, 'static'), path)

        current_app.logger.warning('File not found: %s', path)
        return "File not found", 404

    # HTML/CSS/JS from built-in static
    return send_from_directory(current_app.static_folder, path)


@bp.route('/api/config', methods=['GET'])
def get_config():
    """API endpoint for retrieving configuration (config.json) with user resources."""
    try:
        config = _m.load_config()
        config = _m._merge_shared_resources_into_config(config)
        config = _m._merge_user_resources_into_config(config)
        config = _m._dedup_config_resources(config)
        return jsonify({'success': True, 'config': config})
    except Exception as e:
        current_app.logger.error("get_config error: %s", e, exc_info=True)
        return jsonify({'success': False, 'error': 'Внутренняя ошибка сервера'}), 500


@bp.route('/api/update-check', methods=['GET'])
def update_check():
    """
    Check for available updates without blocking.

    Returns: ``{'update_available': bool, 'current': str, 'new': str}``
    The update dialog is shown in the browser, not in the terminal.
    """
    try:
        current = _m.get_cache_version() or 'unknown'

        if not _m.check_network_access():
            return jsonify({
                'update_available': False,
                'current': current,
                'new': current,
                'reason': 'no_network'
            })

        network_version = _m.get_network_version()
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
        current_app.logger.error("update_check error: %s", e, exc_info=True)
        return jsonify({'update_available': False, 'error': 'Внутренняя ошибка сервера'}), 500


@bp.route('/api/update-apply', methods=['POST'])
def update_apply():
    """Apply a resource update (called from browser after confirmation)."""
    try:
        if not _m.check_network_access():
            return jsonify({'success': False, 'error': 'Нет доступа к сетевой папке'}), 503

        result = _m.initialize_cache()
        if result:
            return jsonify({'success': True, 'version': _m.get_cache_version()})
        else:
            return jsonify({'success': False, 'error': 'Обновление не удалось'}), 500

    except Exception as e:
        current_app.logger.error("update_apply error: %s", e, exc_info=True)
        return jsonify({'success': False, 'error': 'Внутренняя ошибка сервера'}), 500
