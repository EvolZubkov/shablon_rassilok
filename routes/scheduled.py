"""
Flask blueprint: запланированные (отложенные) письма. Только режим администратора.

Routes:
    - GET  /api/scheduled/state   — открыта ли панель (Ctrl+Alt+E)
    - POST /api/scheduled/state   — запомнить состояние панели
    - GET  /api/scheduled/list    — письма, ожидающие отправки
    - POST /api/scheduled/cancel  — отменить отправку письма
    - POST /api/scheduled/update  — изменить тему, получателей и время
    - GET  /api/scheduled/mailboxes — ящики для выбора
"""
import re

from flask import Blueprint, current_app, jsonify, request

import app as _m
import scheduled_store as store
from exchange_scheduled import (
    ScheduledNotFound, cancel_scheduled, list_scheduled, update_scheduled,
)
from src.exchange_sender import ExchangeAuthError

bp = Blueprint('scheduled', __name__)


class _NoCredentials(Exception):
    """Учётные данные Exchange не настроены."""


def _load_credentials():
    path = _m.get_credentials_path()
    return _m.load_credentials(path) if _m.credentials_exist(path) else None


def _recipients(raw) -> list:
    """Получатели из строки «a@rt.ru; b@rt.ru» или списка."""
    if isinstance(raw, str):
        raw = re.split(r'[;,\n]', raw)
    return _m.parse_recipients(raw or [])


def _open_account(from_email: str):
    creds = _load_credentials()
    if not creds:
        raise _NoCredentials('Учётные данные не настроены')
    return _m.connect_exchange(
        creds['server'], creds['username'], creds['password'],
        from_email or creds['from_email'],
        auth_type=creds.get('auth_type', 'ntlm'),
        krb_realm=creds.get('krb_realm', ''),
    )


def _failure(error: str, status: int):
    return jsonify({'success': False, 'error': error}), status


def _run(action):
    """Выполняет обращение к Exchange и переводит ошибки в HTTP-ответ."""
    try:
        return jsonify({'success': True, **action()})
    except ScheduledNotFound as e:
        return _failure(str(e), 404)
    except (_NoCredentials, ExchangeAuthError) as e:
        return _failure(str(e), 401)
    except ValueError as e:
        return _failure(str(e), 400)
    except (ConnectionError, RuntimeError) as e:
        current_app.logger.warning('scheduled: %s', e)
        return _failure(str(e), 502)
    except Exception as e:
        current_app.logger.error('scheduled error: %s', e, exc_info=True)
        return _failure('Внутренняя ошибка сервера', 500)


@bp.before_request
def _admin_only():
    if _m.get_app_mode() != 'admin':
        return _failure('Недостаточно прав', 403)
    return None


@bp.route('/api/scheduled/state', methods=['GET'])
def scheduled_state():
    return jsonify({'success': True, 'unlocked': store.is_unlocked(_m.CACHE_BASE)})


@bp.route('/api/scheduled/state', methods=['POST'])
def scheduled_set_state():
    unlocked = bool((request.get_json(silent=True) or {}).get('unlocked'))
    try:
        store.set_unlocked(_m.CACHE_BASE, unlocked)
    except OSError as e:
        current_app.logger.error('scheduled: не сохранено состояние панели: %s', e)
        return _failure('Не удалось сохранить состояние панели', 500)
    return jsonify({'success': True, 'unlocked': unlocked})


@bp.route('/api/scheduled/mailboxes', methods=['GET'])
def scheduled_mailboxes():
    creds = _load_credentials() or {}
    mailboxes = store.merge_mailboxes(
        creds.get('from_email') or creds.get('username') or '',
        creds.get('default_senders') or [],
        store.recent_mailboxes(_m.CACHE_BASE),
    )
    return jsonify({'success': True, 'mailboxes': mailboxes})


@bp.route('/api/scheduled/list', methods=['GET'])
def scheduled_list():
    from_email = request.args.get('from_email', '').strip()
    return _run(lambda: {'items': list_scheduled(_open_account(from_email))})


@bp.route('/api/scheduled/cancel', methods=['POST'])
def scheduled_cancel():
    data = request.get_json(silent=True) or {}
    item_id = str(data.get('id') or '').strip()
    from_email = str(data.get('from_email') or '').strip()
    if not item_id:
        return _failure('Не указано письмо', 400)
    return _run(lambda: {'subject': cancel_scheduled(_open_account(from_email), item_id)})


@bp.route('/api/scheduled/update', methods=['POST'])
def scheduled_update():
    data = request.get_json(silent=True) or {}
    item_id = str(data.get('id') or '').strip()
    if not item_id:
        return _failure('Не указано письмо', 400)
    try:
        send_at = _m.parse_datetime(str(data.get('send_at') or '').strip())
        timezone = float(data.get('timezone') if data.get('timezone') is not None else 3.0)
    except (ValueError, TypeError):
        return _failure('Укажите дату и время отправки', 400)
    from_email = str(data.get('from_email') or '').strip()
    changes = {
        'subject': str(data.get('subject') or ''),
        'to': _recipients(data.get('to')),
        'cc': _recipients(data.get('cc')),
        'bcc': _recipients(data.get('bcc')),
        'send_at': send_at,
        'timezone': timezone,
    }

    def apply():
        update_scheduled(_open_account(from_email), item_id, **changes)
        return {}

    return _run(apply)
