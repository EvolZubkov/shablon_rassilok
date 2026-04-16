"""
Flask blueprint: templates API.

.. module:: routes.templates
   :synopsis: CRUD endpoints for shared and personal email templates,
              plus category management.

Routes:
    - GET    /api/templates/list           — list all templates (shared + personal)
    - GET    /api/templates/load           — load a template by id
    - POST   /api/templates/save           — save a new template
    - PUT    /api/templates/update         — update blocks of an existing template
    - PATCH  /api/templates/preview        — update only the preview thumbnail
    - DELETE /api/templates/delete         — delete a template by id
    - PUT    /api/templates/rename         — rename a template in-place
    - GET    /api/templates/categories     — get category list
    - POST   /api/templates/categories     — add a new category
    - DELETE /api/templates/categories     — remove a category
"""

import hashlib
import json
import os
import time
from datetime import datetime, timezone

from flask import Blueprint, current_app, jsonify, request

import app as _m  # module reference — gives live access to all app.py globals

bp = Blueprint('templates', __name__)


@bp.route('/api/templates/list', methods=['GET'])
def templates_list():
    """
    Return lightweight metadata for all templates (shared + personal).

    ``blocks`` is intentionally excluded — it is large and only needed when
    a specific template is opened for editing.  ``preview`` (base64 PNG) IS
    included so the user start screen can render card thumbnails from this
    single response without issuing N per-template load requests.
    The in-memory index cache avoids re-reading files on every panel open.
    """
    try:
        shared_dir = os.path.join(_m.get_templates_dir(), 'shared')
        user_dir = _m.get_personal_templates_dir()

        shared_meta, _, shared_fp = _m._get_template_index('shared', shared_dir)
        personal_meta, _, personal_fp = _m._get_template_index('personal', user_dir)

        etag = f'"{shared_fp}-{personal_fp}"'

        # Conditional GET — return 304 when the client already has a fresh copy
        if request.headers.get('If-None-Match') == etag:
            return '', 304

        current_user = _m.get_user_from_system()
        personal_out = [dict(m, author=current_user) for m in personal_meta]

        resp = jsonify({'success': True, 'templates': {
            'shared': sorted(shared_meta, key=lambda x: x['name']),
            'personal': sorted(personal_out, key=lambda x: x['name']),
        }})
        resp.headers['ETag'] = etag
        resp.headers['Cache-Control'] = 'no-cache'
        return resp

    except Exception as e:
        current_app.logger.error("templates_list error: %s", e, exc_info=True)
        return jsonify({'success': False, 'error': 'Внутренняя ошибка сервера'}), 500


@bp.route('/api/templates/load', methods=['GET'])
def templates_load():
    """Load a template by id."""
    try:
        template_id = (request.args.get('id') or '').strip()
        template_type = (request.args.get('type') or 'personal').strip().lower()

        if not _m._validate_template_id(template_id):
            return jsonify({'success': False, 'error': 'Не указан id шаблона'}), 400

        if _m.get_app_mode() == 'user' and template_type == 'shared':
            pass  # reading shared is allowed in user mode

        base_dir = _m._template_base_dir(template_type)
        filepath, template = _m._find_template_by_id(base_dir, template_id, template_type)

        if filepath is None:
            return jsonify({'success': False, 'error': 'Шаблон не найден'}), 404

        return jsonify({'success': True, 'template': template})

    except Exception as e:
        current_app.logger.error("templates_load error: %s", e, exc_info=True)
        return jsonify({'success': False, 'error': 'Внутренняя ошибка сервера'}), 500


@bp.route('/api/templates/save', methods=['POST'])
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

        if _m.get_app_mode() == 'user' and template_type == 'shared':
            return jsonify({'success': False, 'error': 'Недостаточно прав'}), 403

        if not name or blocks is None:
            return jsonify({'success': False, 'error': 'Нет данных'}), 400

        current_user = _m.get_user_from_system()
        templates_dir = _m.get_templates_dir()

        if template_type == 'shared':
            save_dir = os.path.join(templates_dir, 'shared')
        else:
            save_dir = _m.get_personal_templates_dir()

        os.makedirs(save_dir, exist_ok=True)

        # Generate unique filename with timestamp + hash
        timestamp = int(time.time() * 1000)
        name_hash = hashlib.md5(name.encode('utf-8')).hexdigest()[:8]
        filename = f'template_{timestamp}_{name_hash}.json'
        filepath = os.path.join(save_dir, filename)

        template = {
            'id': f'tpl_{int(time.time())}',
            'name': name,
            'category': category,
            'preview': preview,
            'previewVersion': data.get('previewVersion'),
            'created': datetime.now(timezone.utc).isoformat(),
            'author': current_user,
            'type': template_type,
            'isPreset': is_preset,
            'blocks': blocks
        }

        _m._write_template_atomic(filepath, template)

        _m._invalidate_template_cache(template_type)
        if template_type == 'shared':
            _m._bump_network_version()
        current_app.logger.info(
            'Шаблон сохранён: %s (%s, isPreset=%s, категория: %s, путь: %s)',
            filename, template_type, is_preset, category or 'без категории', filepath)

        return jsonify({'success': True, 'filename': filename, 'id': template['id']})

    except Exception as e:
        current_app.logger.error("templates_save error: %s", e, exc_info=True)
        return jsonify({'success': False, 'error': 'Внутренняя ошибка сервера'}), 500


@bp.route('/api/templates/update', methods=['PUT'])
def templates_update():
    """Update blocks (and optionally preview) of an existing template, located by id."""
    try:
        data = request.json or {}
        template_id = (data.get('id') or '').strip()
        template_type = str(data.get('type', 'personal')).strip().lower()
        blocks = data.get('blocks')
        preview = data.get('preview', None)

        if not _m._validate_template_id(template_id) or blocks is None:
            return jsonify({'success': False, 'error': 'Нет данных'}), 400

        if _m.get_app_mode() == 'user' and template_type == 'shared':
            return jsonify({'success': False, 'error': 'Недостаточно прав'}), 403

        base_dir = _m._template_base_dir(template_type)
        filepath, template = _m._find_template_by_id(base_dir, template_id, template_type)
        if filepath is None:
            return jsonify({'success': False, 'error': 'Шаблон не найден'}), 404

        template['blocks'] = blocks
        template['updated'] = datetime.now(timezone.utc).isoformat()
        if preview is not None:
            template['preview'] = preview
            template['previewVersion'] = data.get('previewVersion')

        _m._write_template_atomic(filepath, template)

        _m._invalidate_template_cache(template_type)
        if template_type == 'shared':
            _m._bump_network_version()
        current_app.logger.info('Шаблон обновлён: %s', os.path.basename(filepath))
        return jsonify({'success': True})

    except Exception as e:
        current_app.logger.error("templates_update error: %s", e, exc_info=True)
        return jsonify({'success': False, 'error': 'Внутренняя ошибка сервера'}), 500


@bp.route('/api/templates/preview', methods=['PATCH'])
def templates_update_preview():
    """Update only the preview thumbnail of an existing template (blocks unchanged)."""
    try:
        data = request.json or {}
        template_id = (data.get('id') or '').strip()
        template_type = str(data.get('type', 'personal')).strip().lower()
        preview = data.get('preview')

        if not _m._validate_template_id(template_id):
            return jsonify({'success': False, 'error': 'Нет данных'}), 400

        if _m.get_app_mode() == 'user' and template_type == 'shared':
            return jsonify({'success': False, 'error': 'Недостаточно прав'}), 403

        base_dir = _m._template_base_dir(template_type)
        filepath, template = _m._find_template_by_id(base_dir, template_id, template_type)
        if filepath is None:
            return jsonify({'success': False, 'error': 'Шаблон не найден'}), 404

        template['preview'] = preview
        template['previewVersion'] = data.get('previewVersion')
        template['updated'] = datetime.now(timezone.utc).isoformat()

        _m._write_template_atomic(filepath, template)

        _m._invalidate_template_cache(template_type)
        if template_type == 'shared':
            _m._bump_network_version()
        return jsonify({'success': True})

    except Exception as e:
        current_app.logger.error("templates_update_preview error: %s", e, exc_info=True)
        return jsonify({'success': False, 'error': 'Внутренняя ошибка сервера'}), 500


@bp.route('/api/templates/delete', methods=['DELETE'])
def templates_delete():
    """Delete a template located by id."""
    try:
        template_id = (request.args.get('id') or '').strip()
        template_type = (request.args.get('type') or 'personal').strip().lower()

        if not _m._validate_template_id(template_id):
            return jsonify({'success': False, 'error': 'Не указан id шаблона'}), 400

        if _m.get_app_mode() == 'user' and template_type == 'shared':
            return jsonify({'success': False, 'error': 'Недостаточно прав'}), 403

        base_dir = _m._template_base_dir(template_type)
        filepath, _ = _m._find_template_by_id(base_dir, template_id, template_type)
        if filepath is None:
            return jsonify({'success': False, 'error': 'Шаблон не найден'}), 404

        os.remove(filepath)
        _m._invalidate_template_cache(template_type)
        if template_type == 'shared':
            _m._bump_network_version()
        current_app.logger.info('Шаблон удалён: %s', os.path.basename(filepath))
        return jsonify({'success': True})

    except Exception as e:
        current_app.logger.error("templates_delete error: %s", e, exc_info=True)
        return jsonify({'success': False, 'error': 'Внутренняя ошибка сервера'}), 500


@bp.route('/api/templates/rename', methods=['PUT'])
def templates_rename():
    """Rename a template in-place (updates the name field, file stays at the same path)."""
    try:
        data = request.json or {}
        template_id = (data.get('id') or '').strip()
        new_name = (data.get('newName') or '').strip()
        template_type = str(data.get('type', 'personal')).strip().lower()

        if not _m._validate_template_id(template_id):
            return jsonify({'success': False, 'error': 'Не указан id шаблона'}), 400
        if not new_name:
            return jsonify({'success': False, 'error': 'Название не может быть пустым'}), 400
        if len(new_name) > 200:
            return jsonify({'success': False, 'error': 'Название слишком длинное (макс. 200 символов)'}), 400

        if _m.get_app_mode() == 'user' and template_type == 'shared':
            return jsonify({'success': False, 'error': 'Недостаточно прав'}), 403

        base_dir = _m._template_base_dir(template_type)
        filepath, template = _m._find_template_by_id(base_dir, template_id, template_type)
        if filepath is None:
            return jsonify({'success': False, 'error': 'Шаблон не найден'}), 404

        template['name'] = new_name

        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(template, f, ensure_ascii=False, indent=2)

        _m._invalidate_template_cache(template_type)
        if template_type == 'shared':
            _m._bump_network_version()
        current_app.logger.info('Шаблон переименован: %s -> %s', os.path.basename(filepath), new_name)
        return jsonify({'success': True})

    except Exception as e:
        current_app.logger.error("templates_rename error: %s", e, exc_info=True)
        return jsonify({'success': False, 'error': 'Внутренняя ошибка сервера'}), 500


@bp.route('/api/templates/categories', methods=['GET'])
def templates_get_categories():
    """Получить список категорий"""
    try:
        categories = _m.load_categories()
        return jsonify({'success': True, 'categories': categories})
    except Exception as e:
        current_app.logger.error("templates_get_categories error: %s", e, exc_info=True)
        return jsonify({'success': False, 'error': 'Внутренняя ошибка сервера'}), 500


@bp.route('/api/templates/categories', methods=['POST'])
def templates_add_category():
    """Добавить новую категорию"""
    try:
        data = request.json
        name = data.get('name', '').strip()

        if not name:
            return jsonify({'success': False, 'error': 'Название категории не указано'}), 400

        categories = _m.load_categories()

        if name not in categories:
            categories.append(name)
            categories.sort()
            _m.save_categories(categories)
            _m._bump_network_version()
            current_app.logger.info('Категория добавлена: %s', name)

        return jsonify({'success': True, 'categories': categories})

    except Exception as e:
        current_app.logger.error("templates_add_category error: %s", e, exc_info=True)
        return jsonify({'success': False, 'error': 'Внутренняя ошибка сервера'}), 500


@bp.route('/api/templates/categories', methods=['DELETE'])
def templates_delete_category():
    """Удалить категорию"""
    try:
        name = request.args.get('name', '').strip()

        if not name:
            return jsonify({'success': False, 'error': 'Название категории не указано'}), 400

        categories = _m.load_categories()

        if name in categories:
            categories.remove(name)
            _m.save_categories(categories)
            _m._bump_network_version()
            current_app.logger.info('Категория удалена: %s', name)

        return jsonify({'success': True, 'categories': categories})

    except Exception as e:
        current_app.logger.error(
            "templates_delete_category error: %s", e, exc_info=True)
        return jsonify({'success': False, 'error': 'Внутренняя ошибка сервера'}), 500
