"""
Flask blueprint: profile endpoint.

Routes:
    GET /api/profile  — returns active profile JSON

Priority for profile files:
    1. CACHE_DIR/profiles/<name>.json  (copied from network on startup)
    2. profiles/<name>.json            (bundled with the app, fallback)
"""

import os
import sys
import json
import configparser

from flask import Blueprint, jsonify

import app as _m

bp = Blueprint('profile', __name__)


def _get_profile_name():
    cfg = configparser.ConfigParser()
    cfg.read(_m._CONFIG_PATH, encoding='utf-8')
    return cfg.get('app', 'profile', fallback='default').strip()


def _local_profiles_dir():
    """Папка profiles/ рядом с .exe (или с app.py в dev-режиме)."""
    if getattr(sys, 'frozen', False):
        base = os.path.dirname(sys.executable)
    else:
        base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base, 'profiles')


def _find_profile(name):
    """
    Ищет файл профиля в порядке приоритета:
      1. Кеш (CACHE_DIR/profiles/<name>.json)
      2. Локальная папка profiles/ рядом с .exe
    Возвращает путь к файлу или None.
    """
    candidates = [
        os.path.join(_m.CACHE_DIR, 'profiles', f'{name}.json'),
        os.path.join(_local_profiles_dir(), f'{name}.json'),
    ]
    for path in candidates:
        if os.path.exists(path):
            return path
    return None


@bp.route('/api/profile')
def get_profile():
    try:
        name = _get_profile_name()
        path = _find_profile(name)

        # Fallback на default если запрошенный профиль не найден
        if path is None and name != 'default':
            path = _find_profile('default')

        if path is None:
            return jsonify({'success': True, 'name': 'default', 'profile': {'blocks': {}}})

        with open(path, 'r', encoding='utf-8') as f:
            profile = json.load(f)

        return jsonify({'success': True, 'name': name, 'profile': profile})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e), 'name': 'default', 'profile': {'blocks': {}}})
