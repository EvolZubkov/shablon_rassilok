# SMTP-канал для массовых рассылок — план реализации

## Цель
Добавить второй канал отправки (SMTP) параллельно с существующим Exchange EWS.
Используется для рассылок 10k+ получателей, где Exchange имеет лимиты.

---

## 1. UI — Настройки (таб "Отправка")

### 1.1 Переключатель канала
Вверху таба — два переключателя:
```
[ 📧 Exchange EWS ]  [ 📨 SMTP ]
```
Переключение показывает/скрывает соответствующие поля.
В футере модала: **"Активный канал: Exchange EWS / SMTP"** — индикатор того, какие поля сейчас редактируются.

### 1.2 Поля Exchange (без изменений)
| Поле | Тип | Обязательное |
|------|-----|-------------|
| Сервер Exchange | текст | да |
| Логин | текст (открытый) | да |
| Пароль | пароль (зашифровано) | нет (не менять) |
| Email отправителя | email | да |
| Дополнительные ящики | текст, через запятую | нет |

### 1.3 Поля SMTP (новые)
| Поле | Тип | Обязательное | По умолчанию |
|------|-----|-------------|-------------|
| Хост | текст (открытый) | да | 10.20.1.50 |
| Порт | select: 587 (TLS) / 25 (Plain) | да | 587 |
| Логин | текст (открытый) | да | — |
| Пароль | пароль (зашифровано) | да | — |
| Email отправителя | email | да | — |
| Дополнительные ящики | текст, через запятую | нет | — |

### 1.4 SMTP — дополнительные параметры

**Сохранять в "Отправленные" (IMAP)** — тогл вкл/выкл
При включении появляются поля:
| Поле | Тип | По умолчанию |
|------|-----|-------------|
| IMAP Хост | текст | 10.20.1.50 |
| IMAP Порт | select: 993 (SSL) / 143 (STARTTLS) | 993 |

**Задержка между письмами** — тогл вкл/выкл
При включении появляется поле:
| Поле | Тип | По умолчанию |
|------|-----|-------------|
| Задержка (секунд) | число 0–60 | 1 |

### 1.5 Кнопки футера
- **Проверить** — тестирует подключение для активного канала
- **Закрыть** — без сохранения
- **Сохранить** — сохраняет настройки обоих каналов

---

## 2. UI — Панель рассылки

### 2.1 Переключатель канала
Появляется **только если SMTP настроен** (есть хост + логин).
Если SMTP не настроен — переключателя нет, рассылка всегда через Exchange.

```
КАНАЛ ОТПРАВКИ
[ 📧 Exchange ]  [ 📨 SMTP ]
```

При переключении:
- Меняется список "От кого" (ящики соответствующего канала)
- Выбранный канал передаётся при старте рассылки

### 2.2 Порядок полей в панели рассылки
1. Данные (файл)
2. Получатели (email-колонка, CC/BCC)
3. **Канал отправки** ← новое (если SMTP настроен)
4. **От кого** (список зависит от выбранного канала)
5. Тема письма
6. Плейсхолдеры
7. Вложения
8. Сводка / кнопка отправки

---

## 3. Хранение данных

### 3.1 credentials.json — расширение схемы
Текущие поля остаются. Добавляются новые:

```json
{
  // Exchange (существующие)
  "server": "cas.rt.ru",
  "username": "pr\\zubkov.evgeniy",
  "password": "<зашифровано>",
  "from_email": "zubkov.evgeniy@rt.ru",
  "default_senders": ["education.bti@rt.ru"],
  "auth_type": "ntlm",
  "krb_realm": "",

  // SMTP (новые)
  "smtp_host": "10.20.1.50",
  "smtp_port": 587,
  "smtp_username": "smtp_user",
  "smtp_password": "<зашифровано>",
  "smtp_from_email": "noreply@corp.ru",
  "smtp_default_senders": ["bulk1@rt.ru"],

  // SMTP — IMAP
  "smtp_imap_enabled": false,
  "smtp_imap_host": "10.20.1.50",
  "smtp_imap_port": 993,

  // SMTP — задержка
  "smtp_delay_enabled": false,
  "smtp_delay_seconds": 1
}
```

### 3.2 Шифрование
`smtp_password` шифруется той же функцией что и `password` (Exchange).

---

## 4. Бэкенд — новые и изменённые файлы

### 4.1 Новый файл: `src/smtp_sender.py`
Функции:
- `connect_smtp(host, port, username, password)` → SMTP-сессия
- `smtp_send_email(smtp, from_email, subject, html_body, to, cc, bcc, attachments)` → отправка одного письма
- `connect_imap(host, port, username, password)` → IMAP-сессия (опционально)
- `imap_save_sent(imap, from_email, subject, html_body, to)` → сохранение в Sent

Используется стандартная библиотека Python: `smtplib`, `imaplib`, `email.mime`.

### 4.2 Изменения: `app.py`
- Расширить `validate_credentials_data()` — добавить валидацию SMTP-полей
- Расширить `save_credentials()` — сохранять SMTP-поля
- Расширить `load_credentials()` — загружать SMTP-поля
- Добавить `connect_smtp()` — обёртка над `smtp_sender.connect_smtp()`

### 4.3 Изменения: `routes/exchange.py`
- `GET /api/credentials/status` — добавить SMTP-поля в ответ
- `POST /api/credentials/save` — принимать и сохранять SMTP-поля
- `POST /api/credentials/test` — при `channel=smtp` тестировать SMTP-подключение

### 4.4 Изменения: `routes/bulk_mail.py`
- `_connect(channel, from_email)` — выбирать Exchange или SMTP по параметру `channel`
- `api_bulk_send_start()` — читать `channel` из запроса
- `api_bulk_send_test()` — читать `channel` из запроса
- `_run_bulk_send()` — при SMTP-канале использовать `smtp_sender`, применять задержку если включена

### 4.5 Изменения: `static/js/user/exchangeModals.js`
- Добавить SMTP-поля в форму настроек
- `_loadSettings()` — загружать и заполнять SMTP-поля
- `_getExchangeFormData()` — собирать SMTP-поля
- `_saveSettings()` — отправлять SMTP-поля в `/api/credentials/save`
- `_testConnection()` — передавать `channel` при тесте

### 4.6 Изменения: `static/js/user/bulk-mail-panel.js`
- `_populateFromSelect(status)` — заполнять список ящиков по выбранному каналу
- Добавить рендер переключателя канала (только если `smtp_host` заполнен)
- Передавать `channel` и `from_email` в запросах `send/start` и `send-test`

---

## 5. API — изменения

### `POST /api/credentials/save`
Добавить поля:
```json
{
  "smtp_host": "10.20.1.50",
  "smtp_port": 587,
  "smtp_username": "user",
  "smtp_password": "pass",
  "smtp_from_email": "noreply@corp.ru",
  "smtp_default_senders": ["bulk1@rt.ru"],
  "smtp_imap_enabled": false,
  "smtp_imap_host": "10.20.1.50",
  "smtp_imap_port": 993,
  "smtp_delay_enabled": true,
  "smtp_delay_seconds": 1
}
```

### `POST /api/credentials/test`
Добавить поле `channel: "exchange" | "smtp"`.

### `POST /api/bulk/send/start`
Добавить поле `channel: "exchange" | "smtp"`.

### `POST /api/bulk/send-test`
Добавить поле `channel: "exchange" | "smtp"`.

---

## 6. Логика отправки через SMTP

```
1. Подключиться к SMTP (host:port, STARTTLS если port=587)
2. Авторизоваться (LOGIN username/password)
3. Для каждого получателя:
   a. Сформировать MIME-письмо (HTML + вложения)
   b. smtp.sendmail(from, to, msg)
   c. Если imap_enabled → сохранить в Sent через IMAP
   d. Если delay_enabled → time.sleep(delay_seconds)
4. Закрыть SMTP-соединение
```

---

## 7. Что НЕ меняется
- Exchange EWS логика — без изменений
- Обычная отправка письма ("Отправить письмо") — только Exchange, SMTP не добавляем
- Отправка встречи — только Exchange
- Шифрование паролей — та же схема
- Формат файла credentials.json — обратная совместимость (новые поля опциональны)
