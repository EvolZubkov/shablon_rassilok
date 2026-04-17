"""
credentials_manager.py — хранение учётных данных Exchange.

Пароль шифруется через Fernet с ключом из username+hostname.
Файл credentials.json хранится рядом с .exe (или app.py).
"""

from __future__ import annotations

import os
import sys
import re
import json
import hashlib
import base64
import socket
from typing import Optional, Tuple, Dict

_EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')
from cryptography.fernet import Fernet, InvalidToken


# ─── Путь к файлу ────────────────────────────────────────────────────────────


def get_credentials_path() -> str:
    """Путь к credentials.json рядом с .exe или app.py."""
    if getattr(sys, "frozen", False):
        base = os.path.dirname(sys.executable)
    else:
        base = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base, "credentials.json")


# ─── Ключ шифрования ─────────────────────────────────────────────────────────


_PBKDF2_ITERATIONS = 100_000


def make_key(username: str, hostname: str = None) -> bytes:
    """Derive a deterministic Fernet key from *username* and *hostname*.

    Uses PBKDF2-HMAC-SHA256 (100 000 iterations) so that offline brute-force
    against a stolen credentials.json is computationally expensive.  The key
    is never stored on disk — it is re-derived on every load.

    :param username: Exchange account username; used as PBKDF2 password.
    :param hostname: Machine hostname used as the PBKDF2 salt.  Defaults to
        the local machine hostname so the credentials file is tied to the
        machine it was created on.
    :returns: URL-safe base64-encoded 32-byte key suitable for :class:`Fernet`.
    """
    if hostname is None:
        hostname = socket.gethostname()
    key_bytes = hashlib.pbkdf2_hmac(
        'sha256',
        username.encode('utf-8'),
        hostname.encode('utf-8'),
        _PBKDF2_ITERATIONS,
    )
    return base64.urlsafe_b64encode(key_bytes)


# ─── Шифрование ──────────────────────────────────────────────────────────────


def encrypt_password(password: str, key: bytes) -> str:
    """Шифрует пароль, возвращает base64-строку."""
    return Fernet(key).encrypt(password.encode("utf-8")).decode("utf-8")


def decrypt_password(encrypted: str, key: bytes) -> str:
    """Расшифровывает пароль. Raises InvalidToken при неверном ключе."""
    return Fernet(key).decrypt(encrypted.encode("utf-8")).decode("utf-8")


# ─── Валидация ───────────────────────────────────────────────────────────────


def validate_credentials_data(data: dict) -> Tuple[bool, Optional[str]]:
    """
    Проверяет обязательные поля.
    Returns: (ok: bool, error_message: str | None)
    """
    required = ["server", "username", "password", "from_email"]
    for field in required:
        if not str(data.get(field) or "").strip():
            return False, f"Поле {field} обязательно"
    if not _EMAIL_RE.match(str(data.get("from_email", ""))):
        return False, "Некорректный email отправителя"
    return True, None


# ─── Сохранение / загрузка ───────────────────────────────────────────────────


def save_credentials(
    path: str,
    server: str,
    username: str,
    password: str,
    from_email: str,
    default_senders: list = None,
    hostname: str = None,
) -> None:
    """Шифрует пароль и сохраняет credentials.json."""
    key = make_key(username, hostname)
    payload = {
        "server": server.strip(),
        "username": username.strip(),
        "password": encrypt_password(password, key),
        "from_email": from_email.strip(),
        "default_senders": default_senders or [],
    }
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)


def load_credentials(path: str, hostname: Optional[str] = None) -> Optional[Dict]:
    """
    Загружает и расшифровывает credentials.json.
    Возвращает dict с plaintext паролем или None если файла нет.
    """
    if not os.path.exists(path):
        return None
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        key = make_key(data["username"], hostname)
        data["password"] = decrypt_password(data["password"], key)
        return data
    except (InvalidToken, KeyError, json.JSONDecodeError, OSError):
        return None


def credentials_exist(path: str) -> bool:
    """Проверяет наличие файла учётных данных."""
    return os.path.isfile(path)
