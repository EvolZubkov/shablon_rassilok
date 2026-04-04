# Email Builder

Десктопное приложение для создания и отправки HTML-писем и встреч через Microsoft Exchange (EWS).

Запускается как локальный Flask-сервер со встроенным Chromium-окном (PyQt5 + QWebEngineView). Работает на Windows и ALT Linux.

## Архитектура

```text
EmailBuilder.exe / EmailBuilder (Linux)
    |
    +-- Flask (localhost:7788)          веб-интерфейс + API
    +-- QWebEngineView                  окно приложения (Chromium)
    +-- exchangelib                     отправка через Exchange EWS
    +-- Локальный кеш                   ресурсы: иконки, шрифты, шаблоны
          %LOCALAPPDATA%\EmailBuilder\cache\  (Windows)
          ~/.local/share/EmailBuilder/cache/ (Linux)
```

### Расположение файлов после установки

**Windows** — всё рядом с `.exe`:

```text
<папка с exe>\
    EmailBuilder.exe
    config.ini
    .lic              (только на машинах администраторов)
```

**Linux** — установщик распаковывает в домашнюю папку пользователя:

```text
~/EmailBuilder/
    EmailBuilder      бинарник
    config.ini        конфигурация
    .lic              токен (только для администраторов)
    icon.png          иконка
```

## Режимы работы

| Режим         | Условие запуска                    | Возможности                                       |
| ------------- | ---------------------------------- | ------------------------------------------------- |
| Пользователь  | По умолчанию                       | Просмотр и отправка писем                         |
| Администратор | Файл `.lic` рядом с `.exe`         | + управление шаблонами, переключение режима       |

Переключение между режимами доступно только при запуске в режиме администратора.

## Структура файлов

```text
EmailBuilder.exe          исполняемый файл
config.ini                конфигурация (редактируется вручную)
.lic                      токен администратора (только на машинах администраторов)
```

### config.ini

```ini
[app]
; Путь к сетевой папке с ресурсами
network_path_win         = \\server\share\email-builder        ; Windows
network_path_smb         = //server/share/email-builder        ; Linux (SMB URL)
network_path_linux_hint  = email-builder                       ; имя папки для поиска

; Порт локального сервера
port = 7788
```

## Сетевая папка (ресурсы)

Приложение читает ресурсы из сетевой папки и кеширует их локально. Структура папки на сервере:

```text
email-builder/
    version.txt               версия ресурсов (строка, например 20240101.1)
    static/
        config.json           конфигурация контента
        icons/
        expert-badges/
        bullets/
        button-icons/
        images/
        dividers/
        banner-backgrounds/
        banner-logos/
        banner-icons/
        fonts/
```

При первом запуске кеш заполняется автоматически. При последующих запусках сравниваются версии: если `version.txt` на сервере изменился -- предлагается обновление.

Если сетевая папка недоступна -- приложение работает из локального кеша.

## Сборка

### Windows

```bat
pyinstaller build.spec --noconfirm
```

Результат: `dist\EmailBuilder.exe`

### ALT Linux (через Docker с Windows-хоста)

```bat
build_linux_alt.bat
```

Результат: `dist\linux\EmailBuilder`

### Подготовка перед сборкой

Перед сборкой с поддержкой режима администратора необходимо сгенерировать хеш токена:

```shell
python sync_version.py --gen-token "ваш_секретный_токен"
```

Команда создаёт `.key` (секрет) и `.admin_hash` (хеш), который зашивается в исполняемый файл при сборке.

## Управление версией

Единственный источник версии -- `pyproject.toml`:

```toml
[project]
version = "1.2.3"
```

После изменения версии выполнить:

```shell
python sync_version.py
```

Команда синхронизирует `_version.py` и `package.json`.

## Разработка

```shell
pip install -r requirements.txt
python app.py               # запуск в режиме пользователя
python app_admin.py         # запуск в режиме администратора
```

Тесты:

```shell
pytest
npm test
```

## Администрирование токена

### Файлы

| Файл | Где хранится | Назначение |
| --- | --- | --- |
| `.key` | Корень проекта, не в git | Исходный секрет. Хранить в надёжном месте |
| `.admin_hash` | Корень проекта, не в git | SHA-256 хеш. Зашивается в `.exe` при сборке |
| `.lic` | Рядом с `.exe` на машине администратора | Секрет для проверки при запуске |

### Первоначальная настройка

```shell
python sync_version.py --gen-token "случайная_строка"
```

Создаёт `.key` (секрет) и `.admin_hash` (хеш). Собрать `.exe` -- хеш зашит внутрь.

### Выдача доступа администратору

```shell
python sync_version.py --make-lic
```

Читает `.key`, создаёт `.lic`. Скопировать `.lic` рядом с `.exe` на машину администратора.

### Gitignore

```text
.key
.admin_hash
.lic
```
