"""
Flask blueprint: запланированные (отложенные) письма. Только режим администратора.

Routes:
    - GET  /api/scheduled/state   — открыта ли панель (Ctrl+Alt+E)
    - POST /api/scheduled/state   — запомнить состояние панели
    - GET  /api/scheduled/list    — письма, ожидающие отправки
    - POST /api/scheduled/cancel  — отменить отправку письма
    - POST /api/scheduled/update  — изменить тему, получателей и время
    - GET  /api/scheduled/mailboxes — ящики для выбора
    - GET  /api/scheduled/source  — сохранённые блоки письма
    - POST /api/scheduled/body    — заменить текст письма
"""
import datetime
import hashlib
import re
import threading
import time

from flask import Blueprint, current_app, jsonify, request

import app as _m
import scheduled_store as store
from exchange_scheduled import (
    ScheduledNotFound, cancel_scheduled, list_scheduled, replace_body,
    update_scheduled,
)
from routes.bulk_mail import _substitute
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


#: Пакетная правка рассылки — это сотни запросов подряд, а connect_exchange при
#: Kerberos каждый раз оборачивает BaseProtocol.create_session.
ACCOUNT_TTL_SEC = 300
_accounts: dict = {}
_accounts_lock = threading.Lock()


def _forget_account() -> None:
    with _accounts_lock:
        _accounts.clear()


def _open_account(from_email: str):
    creds = _load_credentials()
    if not creds:
        raise _NoCredentials('Учётные данные не настроены')
    mailbox = from_email or creds['from_email']
    digest = hashlib.sha256(str(creds.get('password') or '').encode()).hexdigest()
    key = (creds['server'], creds['username'], mailbox,
           creds.get('auth_type', 'ntlm'), creds.get('krb_realm', ''), digest)
    now = time.monotonic()
    with _accounts_lock:
        cached = _accounts.get(key)
        if cached and cached[0] > now:
            return cached[1]
    account = _m.connect_exchange(
        creds['server'], creds['username'], creds['password'], mailbox,
        auth_type=creds.get('auth_type', 'ntlm'),
        krb_realm=creds.get('krb_realm', ''),
    )
    with _accounts_lock:
        _accounts[key] = (now + ACCOUNT_TTL_SEC, account)
    return account


def _failure(error: str, status: int):
    return jsonify({'success': False, 'error': error}), status


def _run(action):
    """Выполняет обращение к Exchange и переводит ошибки в HTTP-ответ."""
    try:
        return jsonify({'success': True, **action()})
    except ScheduledNotFound as e:
        return _failure(str(e), 404)
    except (_NoCredentials, ExchangeAuthError) as e:
        _forget_account()
        return _failure(str(e), 401)
    except ValueError as e:
        return _failure(str(e), 400)
    except (ConnectionError, RuntimeError) as e:
        _forget_account()
        current_app.logger.warning('scheduled: %s', e)
        return _failure(str(e), 502)
    except Exception as e:
        current_app.logger.error('scheduled error: %s', e, exc_info=True)
        return _failure('Внутренняя ошибка сервера', 500)


def _letter_list(from_email: str) -> dict:
    """Письма ящика и рассылки, к которым они относятся."""
    store.prune_letters(_m.CACHE_BASE, datetime.datetime.now(datetime.timezone.utc))
    items, campaigns = [], {}
    for row in list_scheduled(_open_account(from_email)):
        letter = store.load_letter(_m.CACHE_BASE, row.get('schedule_id')) or {}
        campaign_id = letter.get('campaign_id')
        if campaign_id and campaign_id not in campaigns:
            campaign = store.load_campaign(_m.CACHE_BASE, campaign_id)
            if campaign:
                campaigns[campaign_id] = {
                    'subject_template': campaign.get('subject_template', ''),
                    'total': store.campaign_size(_m.CACHE_BASE, campaign_id),
                }
        editable = bool(letter.get('blocks')) or campaign_id in campaigns
        items.append({**row, 'editable': editable,
                      'campaign_id': campaign_id if campaign_id in campaigns else None})
    return {'items': items, 'campaigns': campaigns}


def _campaign_of(schedule_id: str):
    """(письмо, рассылка) из локальных копий; для одиночного письма рассылка None."""
    letter = store.load_letter(_m.CACHE_BASE, schedule_id)
    campaign_id = (letter or {}).get('campaign_id')
    campaign = store.load_campaign(_m.CACHE_BASE, campaign_id) if campaign_id else None
    return letter, campaign


def _update_local_letter(schedule_id: str, drop: tuple = (), **changes) -> None:
    """Обновляет локальную копию; письмо на сервере уже изменено, сбой не критичен."""
    letter = store.load_letter(_m.CACHE_BASE, schedule_id)
    if letter is None:
        return
    updated = {k: v for k, v in {**letter, **changes}.items() if k not in drop}
    try:
        store.save_letter(_m.CACHE_BASE, schedule_id, updated)
    except OSError as e:
        current_app.logger.warning('scheduled: копия письма не обновлена: %s', e)


def _update_local_campaign(campaign_id: str, **changes) -> None:
    campaign = store.load_campaign(_m.CACHE_BASE, campaign_id)
    if campaign is None or all(campaign.get(k) == v for k, v in changes.items()):
        return
    try:
        store.save_campaign(_m.CACHE_BASE, campaign_id, {**campaign, **changes})
    except OSError as e:
        current_app.logger.warning('scheduled: данные рассылки не обновлены: %s', e)


@bp.before_request
def _admin_only():
    if _m.get_app_mode() != 'admin':
        return _failure('Недостаточно прав', 403)
    return None


@bp.route('/api/scheduled/state', methods=['GET'])
def scheduled_state():
    # Панель запрашивает состояние при каждом запуске админки: старые копии писем
    # удаляются, даже если саму панель не открывают.
    store.prune_letters(_m.CACHE_BASE, datetime.datetime.now(datetime.timezone.utc))
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
    return _run(lambda: _letter_list(from_email))


@bp.route('/api/scheduled/cancel', methods=['POST'])
def scheduled_cancel():
    data = request.get_json(silent=True) or {}
    item_id = str(data.get('id') or '').strip()
    from_email = str(data.get('from_email') or '').strip()
    if not item_id:
        return _failure('Не указано письмо', 400)
    schedule_id = str(data.get('schedule_id') or '')

    def cancel():
        subject = cancel_scheduled(_open_account(from_email), item_id)
        store.delete_letter(_m.CACHE_BASE, schedule_id)
        return {'subject': subject}

    return _run(cancel)


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
    schedule_id = str(data.get('schedule_id') or '')
    subject = str(data.get('subject') or '')
    subject_template = str(data.get('subject_template') or '')
    letter, campaign = _campaign_of(schedule_id)
    if subject_template:
        if campaign is None:
            return _failure('Данные рассылки на компьютере не сохранены', 400)
        subject = _substitute(subject_template, campaign['mapping'], letter['row'])
    changes = {
        'subject': subject,
        'to': _recipients(data.get('to')),
        'cc': _recipients(data.get('cc')),
        'bcc': _recipients(data.get('bcc')),
        'send_at': send_at,
        'timezone': timezone,
    }


    def apply():
        update_scheduled(_open_account(from_email), item_id, **changes)
        send_at_utc = (send_at - datetime.timedelta(hours=timezone)).replace(
            tzinfo=datetime.timezone.utc)
        _update_local_letter(schedule_id, send_at=send_at_utc.isoformat())
        if subject_template:
            _update_local_campaign(letter['campaign_id'], subject_template=subject_template)
        return {}

    return _run(apply)


@bp.route('/api/scheduled/source', methods=['GET'])
def scheduled_source():
    campaign_id = request.args.get('campaign_id', '')
    if campaign_id:
        campaign = store.load_campaign(_m.CACHE_BASE, campaign_id)
        source = campaign and {'blocks': campaign['blocks'], 'campaign_id': campaign_id}
    else:
        letter, campaign = _campaign_of(request.args.get('schedule_id', ''))
        source = letter
        if campaign:
            source = {'blocks': letter.get('blocks') or campaign['blocks'],
                      'campaign_id': letter['campaign_id']}
    if not source or not source.get('blocks'):
        return _failure('Блоки этого письма на компьютере не сохранены', 404)
    return jsonify({'success': True, 'letter': source})


@bp.route('/api/scheduled/body', methods=['POST'])
def scheduled_body():
    data = request.get_json(silent=True) or {}
    schedule_id = str(data.get('schedule_id') or '')
    html_body = str(data.get('html_body') or '')
    blocks = data.get('blocks')
    if not schedule_id or not html_body or not isinstance(blocks, list) or not blocks:
        return _failure('Письмо пустое или не указано', 400)
    letter, campaign = _campaign_of(schedule_id)
    if campaign:  # в тексте рассылки подставляются данные получателя этого письма
        html_body = _substitute(html_body, campaign['mapping'], letter['row'])
    from_email = str(data.get('from_email') or (letter or {}).get('from_email') or '').strip()
    whole_campaign = bool(data.get('whole_campaign')) and campaign is not None

    def apply():
        replace_body(_open_account(from_email), schedule_id,
                     _m.prepare_html_for_email(html_body),
                     attachments=data.get('attachments') or [])
        if whole_campaign:
            _update_local_campaign(letter['campaign_id'], blocks=blocks)
            _update_local_letter(schedule_id, drop=('blocks',))
        elif campaign:
            _update_local_letter(schedule_id, blocks=blocks)
        else:
            _update_local_letter(schedule_id, blocks=blocks,
                                 comment=str(data.get('comment') or ''))
        return {}

    return _run(apply)
