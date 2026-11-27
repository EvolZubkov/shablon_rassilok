"""Видимость категорий общих шаблонов для аудитории и сборка config.ini.

Чистые функции без обращения к Flask и файловой системе — их проще тестировать.
Список видимых категорий хранится в ``config.ini`` в ключе ``visible_categories``,
значения разделены ``;`` (в названии категории может быть запятая).
Пустой или отсутствующий список — ограничений нет.
"""
import configparser
import io
from typing import Iterable, Mapping, Optional

VISIBLE_CATEGORIES_KEY = 'visible_categories'
CATEGORIES_SEPARATOR = ';'

# Ключи, которые приложение пишет в config.ini само и которые не нужно
# переносить пользователю: у него путь определится заново.
_RUNTIME_KEYS = frozenset({'network_path_linux_resolved'})


def parse_visible_categories(raw: Optional[str]) -> list:
    """Разбирает значение ``visible_categories`` в список без пустых и повторов."""
    if not raw:
        return []
    result: list = []
    for part in raw.split(CATEGORIES_SEPARATOR):
        name = part.strip()
        if name and name not in result:
            result.append(name)
    return result


def is_category_allowed(category: str, allowed: Iterable[str]) -> bool:
    """Видна ли категория при заданном списке (пустой список — видно всё)."""
    allowed_list = list(allowed)
    if not allowed_list:
        return True
    return (category or '') in allowed_list


def filter_shared_templates(templates: Iterable[Mapping], allowed: Iterable[str]) -> list:
    """Оставляет общие шаблоны разрешённых категорий; пресеты не фильтруются."""
    allowed_list = list(allowed)
    return [
        t for t in templates
        if t.get('isPreset') or is_category_allowed(t.get('category', ''), allowed_list)
    ]


def build_config_text(app_section: Mapping[str, str], profile: str, categories: Iterable[str]) -> str:
    """Собирает текст config.ini для пользователя на основе текущего [app]."""
    cfg = configparser.RawConfigParser()
    cfg.add_section('app')
    for key, value in app_section.items():
        if key not in _RUNTIME_KEYS and key not in ('profile', VISIBLE_CATEGORIES_KEY):
            cfg.set('app', key, value)
    cfg.set('app', 'profile', profile)
    names = [c.strip() for c in categories if c and c.strip()]
    if names:
        cfg.set('app', VISIBLE_CATEGORIES_KEY, f'{CATEGORIES_SEPARATOR} '.join(names))

    buffer = io.StringIO()
    cfg.write(buffer)
    return buffer.getvalue()
