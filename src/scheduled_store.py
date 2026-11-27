"""
scheduled_store.py — локальные данные панели «Запланированные письма».

Файл ``<base>/scheduled/state.json``. ``base`` — пользовательская папка
Почтелья (не обновляемый кеш), поэтому данные переживают перезапуск и
обновление приложения.
"""
import json
import logging
import os
import tempfile
import threading

_logger = logging.getLogger(__name__)
_lock = threading.Lock()


def _state_path(base: str) -> str:
    return os.path.join(base, 'scheduled', 'state.json')


def _read(base: str) -> dict:
    try:
        with open(_state_path(base), 'r', encoding='utf-8') as f:
            data = json.load(f)
    except FileNotFoundError:
        return {}
    except (OSError, ValueError) as e:
        _logger.warning('scheduled: не прочитано состояние панели: %s', e)
        return {}
    return data if isinstance(data, dict) else {}


def _write(base: str, state: dict) -> None:
    path = _state_path(base)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    handle, tmp_path = tempfile.mkstemp(dir=os.path.dirname(path), suffix='.tmp')
    with os.fdopen(handle, 'w', encoding='utf-8') as f:
        json.dump(state, f, ensure_ascii=False)
    os.replace(tmp_path, path)


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
