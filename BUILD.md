# Сборка приложения — руководство разработчика

## Feature Flags (управление функциональностью)

Секция `FEATURES` в `app.py`:

```python
FEATURES: dict = {
    'bulk_mail':     bulk_mail_enabled(),   # задаётся сборкой, см. ниже
    'exchange_send': True,   # Отправка письма / встречи через Exchange / SMTP
}
```

### Сборка всех версий одной командой: `build_all.bat`

`build_all.bat` собирает всё, что раздаётся пользователям: **8 ZIP** (по 4 для Windows и ALT Linux).
Для b2c — два варианта: с рассылками и без (панель «Рассылка» и кнопка {{}} скрыты).
Править `app.py` для этого не нужно.

| Windows | ALT Linux | Что внутри |
|---------|-----------|-----------|
| `Pochtelye_b2c_win_v<версия>.zip` | `Pochtelye_b2c_linux_v<версия>.zip` | b2c, с рассылками |
| `Pochtelye_b2c_nobulk_win_v<версия>.zip` | `Pochtelye_b2c_nobulk_linux_v<версия>.zip` | b2c, **без рассылок** |
| `Pochtelye_hr_win_v<версия>.zip` | `Pochtelye_hr_linux_v<версия>.zip` | hr, с рассылками |
| `Pochtelye_duz_win_v<версия>.zip` | `Pochtelye_duz_linux_v<версия>.zip` | duz, с рассылками |

В Windows-архиве лежат `Pochtelye.exe` и `config.ini` профиля, в Linux-архиве — установщик `Pochtelye.sh`
и `config.ini` профиля (установка: распаковать и выполнить `bash Pochtelye.sh`). ZIP появляются в корне проекта.

```
build_all.bat [all|win|linux] [nopause]
```

- без аргументов — Windows и Linux; `win` / `linux` — только одна платформа;
- `nopause` — не ждать нажатия клавиши в конце;
- для Linux нужен Docker, он проверяется до начала сборки; если одна из частей падает, скрипт
  останавливается с кодом 1, в конце выводится список из 8 файлов с отметками `[OK]` / `[MISSING]`.

`build_all.bat` вызывает `build_WIN.bat` и `build_linux_alt.bat`; их по-прежнему можно запускать отдельно.

Как это устроено: переменная окружения `POCHTELYE_BULK_MAIL=0` на время сборки. `build.spec`
кладёт в бинарник модуль `_build_flags` (`BULK_MAIL = False`, генерируется в `build/_flags/`,
отслеживаемые файлы не меняются), `src/build_features.py` его читает. Вариант зашит в бинарник, а
не в `config.ini`: Linux-установщик при обновлении сохраняет старый `config.ini`, и переключение
через конфиг не сработало бы. Переход между вариантами на Linux — обычное обновление: сравнивается
SHA256 бинарника (`~/Pochtelye/binary.sha256`).

Вариант «без рассылок» удваивает время сборки. Чтобы пропустить, задайте `BUILD_NOBULK=0` перед запуском
(`set BUILD_NOBULK=0` и `build_all.bat`) или поменяйте значение в начале `build_all.bat`; тогда будет 6 ZIP.
Вручную: `set POCHTELYE_BULK_MAIL=0` и затем
`pyinstaller build.spec --noconfirm --distpath dist\win32_nobulk --workpath build\app_nobulk`.

### Доступные флаги

| Флаг           | True (по умолчанию)              | False                              |
|----------------|----------------------------------|------------------------------------|
| `bulk_mail`    | Панель «Рассылка» видна          | Панель скрыта, кнопка {{}} скрыта |
| `exchange_send`| Кнопки «Письмо», «Встреча» и «Настройки» видны | Скрыты      |

### Как сделать упрощённую сборку (остальные флаги)

Для `exchange_send` значение по-прежнему меняется вручную в `app.py` перед PyInstaller:

```python
FEATURES: dict = {
    'bulk_mail':     bulk_mail_enabled(),
    'exchange_send': False,
}
```

Код не удаляется — элементы просто не отображаются через CSS (класс `feature-no-*` на `<body>`).

### Как работает механизм

```
app.py (FEATURES dict)
  └─► /api/config (поле features в JSON)
        └─► configLoader.js (window.FEATURES + CSS-классы на <body>)
              └─► user-styles.css (.feature-no-* { display: none !important })
```

---

## Kerberos (скрыт по умолчанию)

Kerberos-аутентификация убрана из интерфейса чтобы не путать пользователей,
работающих только с NTLM.

### Разблокировка

Нажмите **Ctrl + Alt + K** в любом месте приложения.

- При первом нажатии Kerberos **разблокируется**: в настройках подключения
  появится поле «Kerberos Realm» и автоматическое определение тикета.
- При повторном нажатии — **снова скрывается**.
- Состояние сохраняется в `localStorage` браузерного движка (QWebEngine),
  то есть переживает перезапуск приложения.

### Где реализовано

`exchangeModals.js` — IIFE `_initKerberosLock` в начале файла.

Флаг `window._kerberosUnlocked` проверяется в `_applyAuthTypeUI()`:
пока он `false`, функция принудительно показывает только NTLM-поля.
