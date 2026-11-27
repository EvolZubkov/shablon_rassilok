"""
scheduled_store.py — локальные данные панели «Запланированные письма».

Состояние панели — ``<base>/scheduled/state.json``, блоки отложенных писем —
``<base>/scheduled/letters/<метка>.json`` (содержат персональные данные:
удаляются после отмены или через неделю после отправки). ``base`` — пользовательская папка
Почтелья (не обновляемый кеш), поэтому данные переживают перезапуск и
обновление приложения.
"""
import datetime
import json
import logging
import os
import re
import tempfile
import threading

_logger = logging.getLogger(__name__)
_lock = threading.Lock()

#: Сколько хранить блоки письма после времени его отправки.
KEEP_AFTER_SEND = datetime.timedelta(days=7)
_SCHEDULE_ID = re.compile(r'[0-9a-f]{32}')


def _state_path(base: str) -> str:
    return os.path.join(base, 'scheduled', 'state.json')


def _read_json(path: str) -> dict:
    try:
        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except FileNotFoundError:
        return {}
    except (OSError, ValueError) as e:
        _logger.warning('scheduled: не прочитан файл %s: %s', os.path.basename(path), e)
        return {}
    return data if isinstance(data, dict) else {}


def _write_json(path: str, data: dict) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    handle, tmp_path = tempfile.mkstemp(dir=os.path.dirname(path), suffix='.tmp')
    with os.fdopen(handle, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False)
    os.replace(tmp_path, path)


def _read(base: str) -> dict:
    return _read_json(_state_path(base))


def _write(base: str, state: dict) -> None:
    _write_json(_state_path(base), state)


def is_unlocked(base: str) -> bool:
    return bool(_read(base).get('unlocked'))


def set_unlocked(base: str, unlocked: bool) -> None:
    with _lock:
        _write(base, {**_read(base), 'unlocked': bool(unlocked)})


def recent_mailboxes(base: str) -> list:
    """Ящики, из которых уже планировали письма на этом компьютере."""
    saved = _read(base).get('mailboxes')
    return [a for a in saved if isinstance(a, str)] if isinstance(saved, list) else []


def remember_mailbox(base: str, address: str) -> None:
    address = (address or '').strip()
    if not address:
        return
    with _lock:
        known = recent_mailboxes(base)
        if address.lower() in (a.lower() for a in known):
            return
        _write(base, {**_read(base), 'mailboxes': [*known, address]})


def merge_mailboxes(default: str, *groups: list) -> list:
    """Ящик по умолчанию, затем остальные — без повторов (регистр не важен)."""
    result, seen = [], set()
    for address in [default, *(a for group in groups for a in (group or []))]:
        address = (address or '').strip()
        if address and address.lower() not in seen:
            seen.add(address.lower())
            result.append(address)
    return result


def _letters_dir(base: str) -> str:
    return os.path.join(base, 'scheduled', 'letters')


def _letter_path(base: str, schedule_id: str):
    """Путь к копии письма или None, если метка не похожа на нашу."""
    if not _SCHEDULE_ID.fullmatch(schedule_id or ''):
        return None
    return os.path.join(_letters_dir(base), f'{schedule_id}.json')


def save_letter(base: str, schedule_id: str, letter: dict) -> None:
    path = _letter_path(base, schedule_id)
    if path is None:
        raise ValueError('Некорректная метка письма')
    _write_json(path, letter)


def has_letter(base: str, schedule_id: str) -> bool:
    path = _letter_path(base, schedule_id)
    return path is not None and os.path.isfile(path)


def load_letter(base: str, schedule_id: str):
    """Сохранённые блоки письма или None."""
    path = _letter_path(base, schedule_id)
    return (_read_json(path) or None) if path else None


def delete_letter(base: str, schedule_id: str) -> None:
    path = _letter_path(base, schedule_id)
    if path is None:
        return
    try:
        os.remove(path)
    except FileNotFoundError:
        pass
    except OSError as e:
        _logger.warning('scheduled: копия письма не удалена: %s', e)


def prune_letters(base: str, now: datetime.datetime) -> None:
    """Удаляет копии писем, отправленных больше недели назад."""
    try:
        names = os.listdir(_letters_dir(base))
    except OSError:
        return
    for name in names:
        schedule_id = name[:-len('.json')]
        letter = load_letter(base, schedule_id)
        try:
            send_at = datetime.datetime.fromisoformat(letter['send_at'])
            expired = now - send_at > KEEP_AFTER_SEND
        except (TypeError, KeyError, ValueError):
            continue
        if expired:
            delete_letter(base, schedule_id)
