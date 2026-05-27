"""
Flask blueprint: admin profiles management.

Routes (all require admin mode):
    GET    /api/admin/profiles             — list all profiles
    GET    /api/admin/profiles/<name>      — get one profile
    POST   /api/admin/profiles/<name>      — create / update profile
    DELETE /api/admin/profiles/<name>      — delete profile
"""

import os
import re
import json
import shutil

from flask import Blueprint, jsonify, request

import app as _m

bp = Blueprint('profiles_admin', __name__)

_NAME_RE = re.compile(r'^[a-z0-9_-]{1,64}$')


# ── helpers ──────────────────────────────────────────────────────────────────

def _network_profiles_dir():
    return os.path.join(_m.NETWORK_RESOURCES_PATH, 'profiles')


def _cache_profiles_dir():
    return os.path.join(_m.CACHE_DIR, 'profiles')


def _require_admin():
    if _m.get_app_mode() != 'admin':
        return jsonify({'success': False, 'error': 'Недостаточно прав'}), 403
    return None


def _write_profile(name, data):
    """Сохраняет профиль в сеть и сразу в кеш."""
    for directory in [_network_profiles_dir(), _cache_profiles_dir()]:
        os.makedirs(directory, exist_ok=True)
        path = os.path.join(directory, f'{name}.json')
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)


def _read_profile(name):
    """Читает профиль: сначала из кеша, затем из сети."""
    for directory in [_cache_profiles_dir(), _network_profiles_dir()]:
        path = os.path.join(directory, f'{name}.json')
        if os.path.exists(path):
            with open(path, 'r', encoding='utf-8') as f:
                return json.load(f)
    return None


def _list_profiles():
    """Возвращает список имён профилей (без .json)."""
    names = set()
    for directory in [_network_profiles_dir(), _cache_profiles_dir()]:
        if os.path.exists(directory):
            for fname in os.listdir(directory):
                if fname.endswith('.json'):
                    names.add(fname[:-5])
    return sorted(names)


def _delete_profile(name):
    for directory in [_network_profiles_dir(), _cache_profiles_dir()]:
        path = os.path.join(directory, f'{name}.json')
        if os.path.exists(path):
            os.remove(path)


# ── routes ───────────────────────────────────────────────────────────────────

@bp.route('/api/admin/profiles', methods=['GET'])
def list_profiles():
    err = _require_admin()
    if err:
        return err
    try:
        names = _list_profiles()
        profiles = []
        for name in names:
            data = _read_profile(name)
            profiles.append({
                'name': name,
                'label': data.get('name', name) if data else name,
            })
        return jsonify({'success': True, 'profiles': profiles})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@bp.route('/api/admin/profiles/<name>', methods=['GET'])
def get_profile(name):
    err = _require_admin()
    if err:
        return err
    try:
        data = _read_profile(name)
        if data is None:
            return jsonify({'success': False, 'error': 'Профиль не найден'}), 404
        return jsonify({'success': True, 'name': name, 'profile': data})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@bp.route('/api/admin/profiles/<name>', methods=['POST'])
def save_profile(name):
    err = _require_admin()
    if err:
        return err
    if not _NAME_RE.match(name):
        return jsonify({'success': False, 'error': 'Недопустимое имя профиля'}), 400
    try:
        data = request.get_json(force=True)
        if not isinstance(data, dict):
            return jsonify({'success': False, 'error': 'Ожидается JSON-объект'}), 400
        _write_profile(name, data)
        _m._bump_network_version()
        return jsonify({'success': True, 'name': name})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@bp.route('/api/admin/profiles/<name>', methods=['DELETE'])
def delete_profile(name):
    err = _require_admin()
    if err:
        return err
    if name == 'default':
        return jsonify({'success': False, 'error': 'Нельзя удалить профиль default'}), 400
    try:
        _delete_profile(name)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})
