"""
Flask blueprint: user resources and shared resources API.

.. module:: routes.resources
   :synopsis: CRUD endpoints for per-user image resources and admin-managed
              shared network resources.

Routes:
    - GET    /api/user-resources                  — list user resources by category
    - GET    /api/user-resources/file/<cat>/<fn>  — serve a user resource file
    - POST   /api/user-resources/upload           — upload a user resource
    - DELETE /api/user-resources/delete           — delete a user resource
    - POST   /api/user-resources/publish          — publish user resource to shared repo (admin)
    - GET    /api/shared-resources                — list shared resources by category
    - POST   /api/shared-resources/upload         — upload to shared repo (admin)
    - DELETE /api/shared-resources/delete         — delete from shared repo (admin)
"""

import os
import shutil

from flask import Blueprint, abort, current_app, jsonify, request, send_from_directory

import app as _m  # module reference — gives live access to all app.py globals

bp = Blueprint('resources', __name__)


@bp.route('/api/user-resources', methods=['GET'])
def user_resources_list():
    """
    List all user-owned resources grouped by category.

    Response: ``{success, resources: {category: [{filename, url, label}]}}``
    """
    try:
        result = _m._list_resources_in_dir(_m.get_user_resources_dir(), _m._user_resource_url)
        return jsonify({'success': True, 'resources': result})
    except Exception as e:
        current_app.logger.error('user_resources_list error: %s', e, exc_info=True)
        return jsonify({'success': False, 'error': 'Внутренняя ошибка сервера'}), 500


@bp.route('/api/user-resources/file/<category>/<filename>', methods=['GET'])
def user_resources_serve(category, filename):
    """Serve a single user-owned resource file."""
    if category not in current_app.config['USER_RESOURCE_CATEGORIES']:
        abort(404)
    safe = _m._safe_filename(filename)
    if not safe or safe == 'file':
        abort(404)
    cat_dir = os.path.join(_m.get_user_resources_dir(), category)
    return send_from_directory(cat_dir, safe)


@bp.route('/api/user-resources/upload', methods=['POST'])
def user_resources_upload():
    """
    Upload a file to a user resource category.

    Form fields: ``category`` (string), ``file`` (multipart file).

    Response: ``{success, filename, url}``
    """
    try:
        data, err = _m._parse_upload_request()
        if err:
            return err
        cat_dir = os.path.join(_m.get_user_resources_dir(), data['category'])
        os.makedirs(cat_dir, exist_ok=True)
        dest, safe = _m._unique_path(cat_dir, data['safe_name'])
        data['file'].save(dest)
        return jsonify({
            'success': True,
            'filename': safe,
            'url': _m._user_resource_url(data['category'], safe),
        })
    except Exception as e:
        current_app.logger.error('user_resources_upload error: %s', e, exc_info=True)
        return jsonify({'success': False, 'error': 'Внутренняя ошибка сервера'}), 500


@bp.route('/api/user-resources/delete', methods=['DELETE'])
def user_resources_delete():
    """
    Delete a user-owned resource file.

    Query params: ``category``, ``filename``.

    Response: ``{success}``
    """
    try:
        category = request.args.get('category', '').strip()
        filename  = request.args.get('filename', '').strip()

        if category not in current_app.config['USER_RESOURCE_CATEGORIES']:
            return jsonify({'success': False, 'error': 'Неверная категория'}), 400

        safe = _m._safe_filename(filename)
        if not safe or safe == 'file':
            return jsonify({'success': False, 'error': 'Неверное имя файла'}), 400

        path = os.path.join(_m.get_user_resources_dir(), category, safe)
        if os.path.isfile(path):
            os.remove(path)

        return jsonify({'success': True})
    except Exception as e:
        current_app.logger.error('user_resources_delete error: %s', e, exc_info=True)
        return jsonify({'success': False, 'error': 'Внутренняя ошибка сервера'}), 500


@bp.route('/api/user-resources/publish', methods=['POST'])
def user_resources_publish():
    """
    Publish a user-owned resource to the shared network repository (admin only).

    Copies the file to ``NETWORK_RESOURCES_PATH/static/{category}/`` and
    appends a matching entry to ``config.json`` if not already present.

    JSON body: ``{category, filename}``

    Response: ``{success}``
    """
    try:
        if _m.get_app_mode() != 'admin':
            return jsonify({'success': False, 'error': 'Недостаточно прав'}), 403

        data     = request.get_json(force=True) or {}
        category = data.get('category', '').strip()
        filename  = data.get('filename', '').strip()

        if category not in current_app.config['USER_RESOURCE_CATEGORIES']:
            return jsonify({'success': False, 'error': 'Неверная категория'}), 400

        safe = _m._safe_filename(filename)
        if not safe or safe == 'file':
            return jsonify({'success': False, 'error': 'Неверное имя файла'}), 400

        src_path = os.path.join(_m.get_user_resources_dir(), category, safe)
        if not os.path.isfile(src_path):
            return jsonify({'success': False, 'error': 'Файл не найден'}), 404

        dest_dir = os.path.join(_m.NETWORK_RESOURCES_PATH, 'static', category)
        os.makedirs(dest_dir, exist_ok=True)
        dest_path = os.path.join(dest_dir, safe)
        shutil.copy2(src_path, dest_path)

        pub_url = f'/cache/{category}/{safe}'
        _m._append_to_config_json(category, safe, pub_url)
        _m._bump_network_version()

        return jsonify({'success': True})
    except Exception as e:
        current_app.logger.error('user_resources_publish error: %s', e, exc_info=True)
        return jsonify({'success': False, 'error': 'Внутренняя ошибка сервера'}), 500


@bp.route('/api/shared-resources', methods=['GET'])
def shared_resources_list():
    """
    List all files in the shared network resource repository, grouped by category.

    Response: ``{success, resources: {category: [{filename, url, label}]}}``
    """
    try:
        base = os.path.join(_m.NETWORK_RESOURCES_PATH, 'static')
        result = _m._list_resources_in_dir(base, lambda cat, fn: f'/cache/{cat}/{fn}')
        return jsonify({'success': True, 'resources': result})
    except Exception as e:
        current_app.logger.error('shared_resources_list error: %s', e, exc_info=True)
        return jsonify({'success': False, 'error': 'Внутренняя ошибка сервера'}), 500


@bp.route('/api/shared-resources/upload', methods=['POST'])
def shared_resources_upload():
    """
    Upload a file directly to the shared network resource repository (admin only).

    Also appends an entry to ``config.json`` if not already present.

    Form fields: ``category`` (string), ``file`` (multipart file).

    Response: ``{success, filename, url}``
    """
    try:
        if _m.get_app_mode() != 'admin':
            return jsonify({'success': False, 'error': 'Недостаточно прав'}), 403
        data, err = _m._parse_upload_request()
        if err:
            return err
        dest_dir = os.path.join(_m.NETWORK_RESOURCES_PATH, 'static', data['category'])
        os.makedirs(dest_dir, exist_ok=True)
        dest_path, safe = _m._unique_path(dest_dir, data['safe_name'])
        data['file'].save(dest_path)
        pub_url = f'/cache/{data["category"]}/{safe}'
        _m._append_to_config_json(data['category'], safe, pub_url)
        _m._bump_network_version()
        return jsonify({'success': True, 'filename': safe, 'url': pub_url})
    except Exception as e:
        current_app.logger.error('shared_resources_upload error: %s', e, exc_info=True)
        return jsonify({'success': False, 'error': 'Внутренняя ошибка сервера'}), 500


@bp.route('/api/shared-resources/delete', methods=['DELETE'])
def shared_resources_delete():
    """
    Delete a file from the shared network resource repository (admin only).

    Also removes the matching entry from ``config.json``.

    Query params: ``category``, ``filename``.

    Response: ``{success}``
    """
    try:
        if _m.get_app_mode() != 'admin':
            return jsonify({'success': False, 'error': 'Недостаточно прав'}), 403

        category = request.args.get('category', '').strip()
        filename  = request.args.get('filename', '').strip()

        if category not in current_app.config['USER_RESOURCE_CATEGORIES']:
            return jsonify({'success': False, 'error': 'Неверная категория'}), 400

        safe = _m._safe_filename(filename)
        if not safe or safe == 'file':
            return jsonify({'success': False, 'error': 'Неверное имя файла'}), 400

        path = os.path.join(_m.NETWORK_RESOURCES_PATH, 'static', category, safe)
        if os.path.isfile(path):
            os.remove(path)

        # Remove from config.json and bump repo version
        pub_url = f'/cache/{category}/{safe}'
        _m._remove_from_config_json(category, pub_url)
        _m._bump_network_version()

        return jsonify({'success': True})
    except Exception as e:
        current_app.logger.error('shared_resources_delete error: %s', e, exc_info=True)
        return jsonify({'success': False, 'error': 'Внутренняя ошибка сервера'}), 500
