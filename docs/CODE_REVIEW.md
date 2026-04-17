# Code Review: Pochtelye (shablon_rassilok)

**Дата:** 2026-04-16
**Ревьюер:** Claude Sonnet 4.6
**Ветка:** `codex/pr-all-changes`
**Ревью охватывает:** Python backend (app.py, routes/\*, credentials\_manager.py, exchange\_sender.py), JS frontend (static/js/\*), конфигурацию

---

## Итоговый вердикт

| Категория | Оценка | Комментарий |
|---|---|---|
| Безопасность | **C** | Несколько реальных уязвимостей |
| Чистота кода | **B** | Хорошая документация, но god-object |
| SOLID | **C+** | SRP грубо нарушен в app.py, DIP нарушен везде |
| Оптимальность | **B+** | Кеш, атомарные записи, фоновые потоки сделаны хорошо |
| Тесты | **B** | 192 теста, но ряд критичных путей не покрыт |

---

## 1. Безопасность

### КРИТ-1 — Flask слушает на 0.0.0.0 `[ИСПРАВЛЕНО]`

**Файл:** [app.py:2969](app.py#L2969)

```python
app.run(host='0.0.0.0', port=PORT, debug=False)
```

Flask доступен с любого хоста локальной сети без аутентификации. Для десктопного приложения допустима только петля 127.0.0.1.

**Риск:** любой пользователь корпоративной сети может вызвать API администратора, удалять/заменять шаблоны и ресурсы, читать логи.

**Исправление:** заменено на `host='127.0.0.1'`.

---

### КРИТ-2 — Protocol.log отдаётся без авторизации `[ИСПРАВЛЕНО]`

**Файл:** [routes/static\_files.py:56-61](routes/static_files.py#L56)

```python
@bp.route('/protocol.log', methods=['GET', 'HEAD'])
def protocol_log_file():
    return send_file(_m._ACTIVE_LOG_FILE, mimetype='text/plain')
```

Лог содержит пути к файлам, имена пользователей, сообщения об ошибках. Эндпоинт открыт для всей сети (см. КРИТ-1).

**Исправление:** маршрут `GET /protocol.log` удалён. JS-fallback `window.location.href = '/protocol.log'` заменён на `console.warn`. Лог по-прежнему открывается через кнопку «Открыть лог» (`/api/open-log`).

---

### ВЫС-1 — Слабое производное ключа шифрования паролей `[ИСПРАВЛЕНО]`

**Файл:** [credentials\_manager.py:35-43](credentials_manager.py#L35)

```python
def make_key(username: str, hostname: str = None) -> bytes:
    raw = (username + hostname).encode('utf-8')
    return base64.urlsafe_b64encode(hashlib.sha256(raw).digest())
```

Два дефекта:

1. **Конкатенация без разделителя** — ключ для `user="ab", host="c"` идентичен `user="a", host="bc"`.
2. **SHA-256 без итераций** — не является KDF. Позволяет brute-force перебор даже простых паролей, если `credentials.json` попадёт к атакующему.

**Исправление:** заменено на `hashlib.pbkdf2_hmac('sha256', username, hostname_as_salt, 100_000)`. Username — PBKDF2-пароль, hostname — соль. Ключ остаётся детерминированным, brute-force стоит ~100 000 итераций SHA-256 за попытку.

---

### ВЫС-2 — `/api/jslog` без ограничений `[ИСПРАВЛЕНО]`

**Файл:** [routes/utility.py:29-35](routes/utility.py#L29)

Эндпоинт принимал произвольный текст без валидации длины и писал его в ротируемый лог. При внешней доступности сервера (КРИТ-1) любой мог заполнить диск или засорить лог.

**Исправление:** добавлены ограничения `msg = str(...)[:2000]` и `level = str(...)[:16]`.

---

### СРД-1 — Потенциальная инъекция в PowerShell-скрипт `[ИСПРАВЛЕНО]`

**Файл:** [app.py:3075-3083](app.py#L3075)

```python
safe_initial = initial.replace("'", "''")
set_path = f"$d.SelectedPath = '{safe_initial}'; " if initial else ''
script = ( ... + set_path + ... )
subprocess.run(['powershell', ..., script], ...)
```

Экранировался только `'`. Символы `$`, `` ` ``, `\` оставались необработанными.

**Исправление:** путь передаётся через переменную окружения `_POCHTELYE_BROWSE_DIR` и читается в скрипте как `$env:_POCHTELYE_BROWSE_DIR`. Никакой интерполяции пользовательских данных в строку скрипта нет.

---

### СРД-2 — Минимальная валидация email-адресов `[ИСПРАВЛЕНО]`

**Файл:** [credentials\_manager.py:87](credentials_manager.py#L87)

```python
if "@" not in str(data.get("from_email", "")):
```

Проверялось только наличие `@`. Адреса вида `a@`, `@b` не отсекались.

**Исправление:** добавлено регулярное выражение `_EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')`, проверяющее формат `local@domain.tld`.

---

### НЗК-1 — Несинхронизированные операции с config.json на сетевой шаре `[ИСПРАВЛЕНО]`

**Файлы:** [app.py:2283-2356](app.py#L2283)

`_append_to_config_json` / `_remove_from_config_json` открывали файл, читали, изменяли и записывали без файловой блокировки. При одновременных действиях двух администраторов возможна потеря записей.

**Исправление:** добавлен контекстный менеджер `_exclusive_json_edit(path)` с двухуровневой блокировкой: `threading.Lock` (in-process) + `fcntl.flock` / `msvcrt.locking` (cross-process). Запись — атомарная через `tempfile.mkstemp` + `os.replace`.

---

## 2. Принципы SOLID

### SRP — грубое нарушение в app.py

**Файл:** [app.py](app.py) — 3141 строка

Один модуль отвечает за:

- чтение конфигурации (`_load_config`)
- систему логирования и `_TeeStream`
- проверку лицензии (`_resolve_app_mode`)
- управление PID-файлом
- инициализацию и синхронизацию кеша
- управление сетевым репозиторием
- API шаблонов (7 эндпоинтов вынесено, но реализация осталась)
- API ресурсов (аналогично)
- подготовку HTML для отправки
- Qt splash screen
- главный цикл приложения

Часть кода уже перенесена в `routes/`, что правильно. Следующий шаг — выделить отдельные сервисные классы/модули: `CacheManager`, `TemplateRepository`, `ResourceCatalog`, `LicenseService`.

---

### DIP — routes зависят от конкретного модуля app `[ИСПРАВЛЕНО]`

**Файлы:** [routes/exchange.py:17](routes/exchange.py#L17), [routes/resources.py:23](routes/resources.py#L23), etc.

Все blueprints обращались к глобальным переменным `_m.APP_MODE`, `_m.CACHE_DIR`, `_m.shutil`, `_m.json` и т.д. — прямой доступ к потрохам модуля.

**Исправление:**

- Добавлены accessor-функции в `app.py`: `get_app_mode()`, `set_app_mode()`, `update_heartbeat()`.
- Статические константы (`CACHE_DIR`, `USER_RESOURCE_CATEGORIES`) перенесены в `app.config` и читаются через `current_app.config[...]`.
- `_m.app.logger` заменён на `current_app.logger` во всех blueprints.
- `_m.shutil`, `_m.time`, `_m.hashlib`, `_m.datetime`, `_m.json` заменены прямыми импортами stdlib.
- `_m._last_heartbeat = _m.time.time()` заменено на `_m.update_heartbeat()`.
- `_m.APP_MODE` заменён на `_m.get_app_mode()` / `_m.set_app_mode()`; прямое использование `_m._APP_MODE_LOCK` из routes удалено.

---

### OCP — дублирование `_cat_key_map` `[ИСПРАВЛЕНО]`

**Файл:** [app.py:2283](app.py#L2283), [app.py:2319](app.py#L2319)

Идентичный словарь `_cat_key_map` был скопирован в `_append_to_config_json` и `_remove_from_config_json`. Добавление новой категории требовало правки в двух местах.

**Исправление:** вынесен на уровень модуля как константа `_CAT_KEY_MAP`; обе функции ссылаются на неё.

---

## 3. Чистота кода

### КЧ-1 — Отсутствие атомарной записи в save\_categories `[ИСПРАВЛЕНО]`

**Файл:** [app.py:2732-2742](app.py#L2732)

```python
def save_categories(categories: list) -> None:
    with open(categories_file, 'w', encoding='utf-8') as f:
        json.dump({'categories': categories}, f, ...)
```

В отличие от `_write_template_atomic`, здесь прямая запись без temp+rename. При сбое в процессе записи файл окажется испорченным.

**Исправление:** переведено на `tempfile.mkstemp` + `os.replace`, как и `_write_template_atomic`.

---

### КЧ-2 — Импорты внутри функций для уже импортированных модулей `[ИСПРАВЛЕНО]`

**Файл:** [exchange\_sender.py:140-144](exchange_sender.py#L140)

```python
def _convert_data_images_to_cid(html_body: str):
    import re
    import base64
    import uuid
```

Модули `re`, `base64`, `uuid` уже импортированы на уровне файла. Повторный импорт внутри функции — лишний шум.

**Исправление:** дублирующие импорты удалены; `import mimetypes as _mt` внутри вложенной функции заменён на модульный `mimetypes`.

---

### КЧ-3 — Двойной `pass` в конце main `[ИСПРАВЛЕНО]`

**Файл:** [app.py](app.py)

```python
    except KeyboardInterrupt:
        print("\n\n Приложение остановлено")
        sys.exit(0)
        pass
    pass
```

Два лишних `pass` после `sys.exit(0)` — мёртвый код. Отсутствует в текущем рабочем дереве: был удалён при рефакторинге с вынесением routes в отдельные модули.

---

### КЧ-4 — Несогласованное использование logger vs print `[ИСПРАВЛЕНО]`

В `routes/*.py` ошибки логировались через `_m.app.logger.error(...)`, но в `app.py` большинство сообщений писались через `print()` с emoji. `_TeeStream` перенаправляет stdout в лог, но уровни (WARNING/ERROR) терялись.

**Исправление:** добавлен `_logger = logging.getLogger('pochtelye')` после инициализации root logger. Все диагностические `print()` в фоновых потоках, утилитах и обработчиках ошибок заменены на `_logger.warning/error/info()` (41 замена в app.py) и `_m.app.logger.*()` в routes (11 замен). Баннеры запуска и прогресс-бары оставлены как `print()` — они намеренно ориентированы на терминал.

---

### КЧ-5 — Отсутствие таймаута в `_unique_path` `[ИСПРАВЛЕНО]`

**Файл:** [app.py:2124](app.py#L2124)

```python
def _unique_path(directory: str, filename: str) -> tuple[str, str]:
    counter = 2
    while True:
        ...
        counter += 1
```

Нет верхней границы счётчика. При экстремально большом числе файлов с одинаковым именем функция зависала навсегда.

**Исправление:** `while True` заменён на `while counter <= 9999`; при исчерпании вариантов поднимается `OSError` с диагностическим сообщением.

---

### КЧ-6 — `datetime.now()` без часового пояса `[ИСПРАВЛЕНО]`

**Файл:** [routes/templates.py:135](routes/templates.py#L135), [routes/templates.py:180](routes/templates.py#L180)

```python
'created': _m.datetime.now().isoformat(),
```

`datetime.now()` возвращает наивный datetime. При работе пользователей в разных часовых поясах метки времени несравнимы.

**Исправление:** все три вызова заменены на `_m.datetime.now(timezone.utc).isoformat()`; добавлен `from datetime import timezone` в imports.

---

### КЧ-7 — Глобальное состояние, мутируемое из маршрутов `[ИСПРАВЛЕНО]`

**Файл:** [routes/settings.py:63](routes/settings.py#L63)

```python
_m.APP_MODE = new_mode
```

Переключение режима меняло глобальную переменную модуля без блокировки. При параллельных запросах (Flask multi-thread) значение `APP_MODE` могло читаться гонкой.

**Исправление:** добавлен `_APP_MODE_LOCK = threading.Lock()` в app.py. Запись и чтение `APP_MODE` в обоих обработчиках `api_mode_get` / `api_mode_set` обёрнуты в `with _m._APP_MODE_LOCK`.

---

### КЧ-8 — app\_admin.py / app\_user.py — минимальная ценность

**Файлы:** [app\_admin.py](app_admin.py), [app\_user.py](app_user.py)

Оба файла состоят из 7 строк и отличаются только значением переменной окружения. Выгоднее было бы управлять режимом через аргумент командной строки (`--mode admin`) вместо отдельных точек входа.

---

## 4. Оптимальность

### Хорошо реализовано

- **Атомарные записи шаблонов** ([app.py:2406](app.py#L2406)) — `tempfile.mkstemp` + `os.replace` исключает повреждение файла при сбое.
- **Двухуровневый кеш шаблонов** — индекс (30-60 с TTL) + контент (по mtime), избегает избыточных сетевых чтений.
- **Фоновый синхронизатор кеша** (`_cache_updater_thread`) — обновляет только изменённые файлы через `_copy_if_changed`, не блокирует UI.
- **`_TeeStream`** — потокобезопасный перехватчик stdout/stderr с буферизацией строк.
- **Ротируемый лог** — `RotatingFileHandler` 5 МБ × 3, не заполняет диск.
- **ETag / 304 для списка шаблонов** ([routes/templates.py:47-51](routes/templates.py#L47)) — снижает нагрузку при частом открытии панели.

### Недостатки оптимальности

- **`_build_repo_snapshot`** — заменён перебор всех файлов (O(N) stat-вызовов) на директорный снапшот: отслеживается `mtime` каждой директории (детектирует add/delete) + `mtime+size` всех JSON/txt файлов (детектирует правки config.json, шаблонов). Бинарные ресурсы покрыты через mtime директории. Для репозитория с 1000 изображений в 10 папках: ~25 stat-вызовов вместо 1000. Интервал сканирования уменьшен с 60 до 30 с. `[ИСПРАВЛЕНО]`
- **`load_config()`** — добавлен mtime-кеш: повторные вызовы в рамках одной версии файла возвращают O(1) копию словаря без файлового I/O. Кеш сбрасывается автоматически при изменении `cache/config.json` (например, после `initialize_cache()`). `[ИСПРАВЛЕНО]`

---

## 5. Frontend

### XSS через innerHTML с template literals `[ИСПРАВЛЕНО]`

**Файл:** `static/js/*.js` — 118 случаев использования `innerHTML`, из них 14 с реально небезопасными интерполяциями.

**Исправление:**

1. В [textSanitizer.js](static/js/textSanitizer.js) добавлен публичный метод `TextSanitizer.escapeHTML(value)` — канонический источник экранирования. `escapeHtml()` в [shared/utils.js](static/js/shared/utils.js) переведён на делегирование к нему.

2. Экранирование применено во всех местах с пользовательскими/серверными данными:

   | Файл | Данные |
   | --- | --- |
   | `admin-bulk-mail.js` | `r.warn[]`, `r.fio`, `r.dept`, `r.pos`, `r.date` (из CSV) |
   | `user/bulk-mail.js` | то же |
   | `user/exchangeModals.js` | `file.name` (имя файла из File API); inline `onclick` заменён на `data-*` + addEventListener |
   | `templatesUI.js` | `title` (название категории) |
   | `user/userApp.js` | `template.name`, `template.category`, `template.id`, `template.type` |
   | `user/userEditor.js` | `icon.src/name`, `bullet.id/src/name`, `divider.src/name`, `badge.src/name` |
   | `user/userBannerEditor.js` | `logo.src/label`, `img.src/label` |

3. Чистые статические строки (SVG-иконки, сообщения об ошибках без интерполяций) оставлены без изменений — они не являются XSS-векторами.

### TextSanitizer — качественная реализация

**Файл:** [static/js/textSanitizer.js](static/js/textSanitizer.js)

Allowlist тегов и атрибутов, DOM-based парсинг через `DOMParser`, проверка `href` на `https?://` и `mailto:`. Хорошая защита от XSS в пользовательском контенте. Единственное замечание — `href` принимает любой URL без валидации хоста, но это допустимо для редактора шаблонов.

---

## 6. Тесты

Имеется 192 теста в `tests/`. Тестируются: API шаблонов, ресурсов, Exchange, `_safe_filename`, `prepare_html_for_email`. Это хорошее покрытие для бизнес-логики.

**Не покрыто:**

- Сценарий одновременного доступа к `_append_to_config_json` (race condition, НЗК-1 — исправлено).
- Переключение `APP_MODE` под нагрузкой (КЧ-7).
- Поведение `_unique_path` при `counter > 1000`.
- Сценарии ошибок `_write_template_atomic` при заполненном диске.

---

## 7. Сводная таблица замечаний

| # | Приоритет | Категория | Описание | Файл | Статус |
| --- | --- | --- | --- | --- | --- |
| 1 | КРИТИЧНО | Безопасность | Flask на 0.0.0.0 | app.py:2969 | Исправлено |
| 2 | КРИТИЧНО | Безопасность | /protocol.log без авторизации | routes/static\_files.py:56 | Исправлено |
| 3 | ВЫСОКИЙ | Безопасность | Слабый KDF для ключа Fernet | credentials\_manager.py:35 | Исправлено |
| 4 | ВЫСОКИЙ | Безопасность | /api/jslog без ограничения длины | routes/utility.py:29 | Исправлено |
| 5 | ВЫСОКИЙ | SOLID / OCP | Дублирование \_cat\_key\_map | app.py:2283, 2319 | Исправлено |
| 6 | ВЫСОКИЙ | Чистота | Неатомарная запись save\_categories | app.py:2732 | Исправлено |
| 7 | СРЕДНИЙ | Безопасность | Потенциальная инъекция PowerShell | app.py:3075 | Исправлено |
| 8 | СРЕДНИЙ | Безопасность | Race condition на config.json | app.py:2283 | Исправлено |
| 9 | СРЕДНИЙ | SOLID / SRP | God object app.py (3141 строк) | app.py | Открыто |
| 10 | СРЕДНИЙ | SOLID / DIP | routes зависят от глобалов app | routes/\*.py:17 | Исправлено |
| 11 | СРЕДНИЙ | Чистота | APP\_MODE мутируется без блокировки | routes/settings.py:63 | Исправлено |
| 12 | СРЕДНИЙ | Чистота | datetime.now() без timezone | routes/templates.py:135 | Исправлено |
| 13 | НИЗКИЙ | Безопасность | Минимальная валидация email | credentials\_manager.py:87 | Исправлено |
| 14 | НИЗКИЙ | Чистота | Импорты внутри функций (re, base64) | exchange\_sender.py:140 | Исправлено |
| 15 | НИЗКИЙ | Чистота | Двойной pass, мёртвый код | app.py:2900 | Исправлено |
| 16 | НИЗКИЙ | Чистота | print() вместо logger | app.py (множество мест) | Исправлено |
| 17 | НИЗКИЙ | Оптимальность | Polling репозитория вместо inotify | app.py:1486 | Исправлено |
| 18 | НИЗКИЙ | Оптимальность | load\_config() без кеша | app.py:1717 | Исправлено |
| 19 | НИЗКИЙ | Чистота | Нет таймаута в \_unique\_path | app.py:2124 | Исправлено |
| 20 | ИНФОРМАЦИЯ | Frontend | innerHTML с template literals (124 мест) | static/js/\*.js | Исправлено |
