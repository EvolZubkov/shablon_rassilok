"""
Flask blueprint: utility endpoints.

.. module:: routes.utility
   :synopsis: Heartbeat, JS console log forwarding, and external URL opener.

Routes:
    - POST /api/heartbeat   — reset watchdog timer
    - POST /api/jslog       — forward JS console messages to protocol.log
    - POST /api/open-url    — open an external URL in the system browser
"""

import webbrowser

from flask import Blueprint, current_app, jsonify, request

import app as _m  # module reference — gives live access to all app.py globals

bp = Blueprint('utility', __name__)


@bp.route('/api/heartbeat', methods=['POST'])
def api_heartbeat():
    _m.update_heartbeat()
    return jsonify({'ok': True})


@bp.route('/api/jslog', methods=['POST'])
def api_jslog():
    """Receives console.log messages from the embedded browser and prints them to protocol.log."""
    data = request.get_json(silent=True) or {}
    level = str(data.get('level', 'log'))[:16].upper()
    msg   = str(data.get('msg', ''))[:2000]
    current_app.logger.info('[JS:%s] %s', level, msg)
    return jsonify({'ok': True})


@bp.route('/api/open-url', methods=['POST'])
def api_open_url():
    """Open an external URL in the system browser.

    QWebEngineView blocks ``window.open()`` by default because ``createWindow``
    is not overridden.  JS code calls this endpoint instead so the system
    browser handles the URL.
    """
    data = request.get_json(silent=True) or {}
    url = str(data.get('url', '')).strip()
    if not url.startswith(('http://', 'https://')):
        return jsonify({'ok': False, 'error': 'Invalid URL'}), 400
    try:
        webbrowser.open(url)
    except Exception as exc:
        return jsonify({'ok': False, 'error': str(exc)}), 500
    return jsonify({'ok': True})
