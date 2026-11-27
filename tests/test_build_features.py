"""Вариант сборки «без рассылок» (src/build_features.py).

build.spec при POCHTELYE_BULK_MAIL=0 кладёт в бинарник модуль _build_flags с
BULK_MAIL = False. Без этого модуля (запуск из исходников, обычная сборка) панель
«Рассылка» включена.
"""

import sys
import types
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'src'))

import build_features  # noqa: E402


@pytest.fixture(autouse=True)
def _no_build_flags_module(monkeypatch):
    """Каждый тест начинает без модуля _build_flags."""
    monkeypatch.delitem(sys.modules, '_build_flags', raising=False)


def _install_flags(monkeypatch, **attrs):
    module = types.ModuleType('_build_flags')
    for name, value in attrs.items():
        setattr(module, name, value)
    monkeypatch.setitem(sys.modules, '_build_flags', module)


def test_bulk_mail_enabled_by_default_without_flags_module():
    assert build_features.bulk_mail_enabled() is True


def test_bulk_mail_disabled_when_build_flag_is_false(monkeypatch):
    _install_flags(monkeypatch, BULK_MAIL=False)

    assert build_features.bulk_mail_enabled() is False


def test_bulk_mail_enabled_when_build_flag_is_true(monkeypatch):
    _install_flags(monkeypatch, BULK_MAIL=True)

    assert build_features.bulk_mail_enabled() is True


def test_bulk_mail_enabled_when_flags_module_has_no_bulk_mail(monkeypatch):
    _install_flags(monkeypatch)

    assert build_features.bulk_mail_enabled() is True


@pytest.mark.parametrize('value', ['0', 'false', 'False', 'no', 'off', ''])
def test_env_value_parsing_off(value):
    assert build_features.parse_flag(value) is False


@pytest.mark.parametrize('value', ['1', 'true', 'True', 'yes', 'on', None])
def test_env_value_parsing_on(value):
    assert build_features.parse_flag(value) is True
