# Почтелье

Десктопное приложение: конструктор HTML-писем/встреч с отправкой через Exchange EWS (exchangelib) и SMTP. Flask на localhost:7788 + PyQt5 QWebEngineView. Windows и ALT Linux.

## Структура
- `app.py` (~4200 строк) — ядро Flask, `FEATURES` (`bulk_mail`, `exchange_send`), `main()`. `src/app_user.py` / `src/app_admin.py` — тонкие входы, выставляют `APP_MODE`.
- `routes/` — blueprints (exchange, bulk_mail, templates, profile(s), settings, resources, utility, static_files).
- `src/` — `exchange_sender.py`, `smtp_sender.py`, `credentials_manager.py`.
- `static/js/` — vanilla JS без сборщика; `static/index.html` (админ), `index-user.html` (пользователь).
- `profiles/` + `config_template_{b2c,duz,hr}.ini` — профили сборок.
- `templates/`, `cache/`, `user-resources/` — рантайм-данные, в gitignore.
- Режимы: пользователь по умолчанию; администратор — если рядом с exe лежит `.lic`.

## Команды
- `pip install -r requirements.txt`
- `python app.py` — запуск (пользователь); `python src/app_admin.py` — админ
- `pytest` — Python-тесты; `npm test` / `npm run test:all` — JS (vitest)
- Сборка: `pyinstaller build.spec --noconfirm` (Win), `build_linux_alt.bat` (ALT через Docker); см. `BUILD.md`
- Версия: единственный источник — `pyproject.toml`, затем `python scripts/sync_version.py`

## Правила
- UI: жёсткая сетка 4px — все размеры и отступы кратны 4, между соседними элементами 4px, кнопки не переносятся «как получится» (`docs/AGENTS.md`). Правило важнее локальных стилей.
- Exchange + Kerberos: сервер `cas-pr.pr.rt.ru` (не `cas.rt.ru`), realm `PR.RT.RU`, SPN `HTTP/cas-pr.pr.rt.ru`; пример — `scripts/send_ews.py`. В UI Kerberos скрыт, включается Ctrl+Alt+K.
- Фича-флаги только скрывают UI классами `feature-no-*`, код не удаляют.
- В user-режиме `static/js/settings/*` отдаётся с 404 (`routes/static_files.py`): общий для admin и user код кладите в `static/js/shared/`.
- Каждое изменение пользовательского поведения отражать в `README.md` и `docs/PATCHNOTES.md`.
- Секреты не коммитить: `.key`, `.lic`, `.admin_hash`, `credentials.json`.
