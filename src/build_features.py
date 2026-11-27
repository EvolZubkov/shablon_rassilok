"""Функции, включаемые на этапе сборки (вариант «без рассылок»).

build.spec читает переменную окружения POCHTELYE_BULK_MAIL (0 — без рассылок) и
кладёт в бинарник маленький модуль ``_build_flags`` с ``BULK_MAIL = False``.
Приложение читает его через ``bulk_mail_enabled()``. Если модуля нет (запуск из
исходников или обычная сборка), панель «Рассылка» включена.

Вариант зашит в бинарник, а не в config.ini: установщик Linux при обновлении
сохраняет старый config.ini, и переход между вариантами через конфиг не сработал бы.
"""

_OFF_VALUES = frozenset({'', '0', 'false', 'no', 'off'})


def parse_flag(value) -> bool:
    """Значение переменной окружения → флаг. Не задано (None) — включено."""
    if value is None:
        return True
    return str(value).strip().lower() not in _OFF_VALUES


def bulk_mail_enabled() -> bool:
    """Включена ли панель «Рассылка» в этой сборке."""
    try:
        from _build_flags import BULK_MAIL
    except ImportError:
        return True
    return bool(BULK_MAIL)
