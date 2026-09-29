# Важность письма + Уведомление о прочтении — план реализации

## Цель
Добавить два параметра к отправке письма:
1. **Важность** — три уровня: Низкая / Обычная / Высокая
2. **Уведомление о прочтении** — запрос подтверждения прочтения

Оба параметра доступны в:
- Обычной отправке ("Отправить письмо")
- Рассылке (панель bulk-mail)

---

## 1. UI

### 1.1 Обычное письмо — модал "Отправить письмо"
Существующие опции (комментарий, согласование, отложенная отправка) **переносятся** внутрь раскрываемого блока "⚙ Дополнительные настройки". Новые опции добавляются туда же.

**Содержимое блока "Дополнительные настройки":**
- Важность письма → сегментированный контрол: `[ Низкая ][ Обычная ][ Высокая ]`
- Уведомление о прочтении → тогл
- Добавить комментарий к письму → чекбокс (существующий)
- На согласование → чекбокс (существующий)
- Отложенная отправка → чекбокс (существующий)

### 1.2 Рассылка — панель bulk-mail
Существующие опции (черновики, стоп при ошибке, пауза, отложенная) **остаются** в "Дополнительных настройках". Новые опции добавляются в начало этого блока.

**Содержимое блока (обновлённый порядок):**
- Важность письма → сегментированный контрол
- Уведомление о прочтении → тогл
- *(разделитель)*
- Режим черновиков → чекбокс (существующий)
- Остановить при ошибке → чекбокс (существующий)
- Пауза между письмами → select (существующий)
- Отложенная отправка → чекбокс (существующий)

---

## 2. Передача параметров

### 2.1 Значения importance
| UI | API-значение | Exchange | SMTP headers |
|----|-------------|----------|-------------|
| Низкая | `"low"` | `'Low'` | `Importance: low`, `X-Priority: 5`, `X-MSMail-Priority: Low` |
| Обычная | `"normal"` | `'Normal'` | *(заголовки не добавляются)* |
| Высокая | `"high"` | `'High'` | `Importance: high`, `X-Priority: 1`, `X-MSMail-Priority: High` |

### 2.2 Read receipt
| | Exchange | SMTP |
|-|---------|------|
| Флаг | `msg.is_read_receipt_requested = True` | Заголовок `Disposition-Notification-To: <from_email>` |

---

## 3. Изменения бэкенда

### 3.1 `src/exchange_sender.py`
Функция `exchange_send_email()` — добавить два параметра:
```python
def exchange_send_email(
    account, subject, html_body, to, cc=None, bcc=None,
    attachments=None, send_at=None, timezone=3.0,
    importance='normal',      # новый: 'low' | 'normal' | 'high'
    read_receipt=False,        # новый: bool
) -> None:
```
Внутри:
```python
_IMPORTANCE_MAP = {'low': 'Low', 'normal': 'Normal', 'high': 'High'}
msg.importance = _IMPORTANCE_MAP.get(importance, 'Normal')
if read_receipt:
    msg.is_read_receipt_requested = True
```

### 3.2 `src/smtp_sender.py`
Функция `smtp_send_email()` — добавить два параметра:
```python
def smtp_send_email(
    smtp, from_email, subject, html_body, to, cc=None, bcc=None,
    attachments=None,
    importance='normal',      # новый
    read_receipt=False,        # новый
) -> bytes:
```
Внутри `_build_message()`:
```python
if importance == 'high':
    msg['Importance'] = 'high'
    msg['X-Priority'] = '1'
    msg['X-MSMail-Priority'] = 'High'
elif importance == 'low':
    msg['Importance'] = 'low'
    msg['X-Priority'] = '5'
    msg['X-MSMail-Priority'] = 'Low'

if read_receipt:
    msg['Disposition-Notification-To'] = from_email
```

### 3.3 `routes/exchange.py` — `api_send_email()`
Читать из запроса и передавать в `exchange_send_email`:
```python
importance   = str(data.get('importance')   or 'normal').lower()
read_receipt = bool(data.get('read_receipt'))
```

### 3.4 `routes/bulk_mail.py` — `_run_bulk_send()`
Читать из `data` и передавать при каждой отправке:
```python
importance   = str(data.get('importance')   or 'normal').lower()
read_receipt = bool(data.get('read_receipt'))
```

---

## 4. Изменения фронтенда

### 4.1 `static/js/user/exchangeModals.js`

**HTML-шаблон** модала письма — добавить внутрь аккордеона "Дополнительные настройки":
```html
<!-- Новые поля вверху блока -->
<div class="exc-field">
  <label class="exc-label">Важность письма</label>
  <div class="importance-seg" id="email-importance">
    <button data-val="low">Низкая</button>
    <button data-val="normal" class="active">Обычная</button>
    <button data-val="high">Высокая</button>
  </div>
</div>
<div class="exc-toggle-row">
  <div>
    <div class="exc-label">Уведомление о прочтении</div>
    <div class="exc-hint">Получатель может отклонить запрос</div>
  </div>
  <label class="exc-toggle">
    <input type="checkbox" id="email-read-receipt">
    <span class="exc-toggle-track"></span>
  </label>
</div>
```

**JS** — функция отправки `_sendEmail()`:
- Собирать `importance` из активной кнопки `#email-importance`
- Собирать `read_receipt` из `#email-read-receipt`
- Передавать в `POST /api/send/email`

### 4.2 `static/js/user/bulk-mail-panel.js`

**HTML** в обоих `index.html` и `index-user.html` — добавить в существующий аккордеон "Дополнительные настройки" перед остальными опциями:
```html
<!-- Важность + Уведомление — вверху блока -->
<div class="bm-field">
  <div class="bm-label">Важность письма</div>
  <div class="importance-seg" id="bm-importance">...</div>
</div>
<div class="bm-toggle-row">
  <div class="bm-label">Уведомление о прочтении</div>
  <label class="bm-toggle">
    <input type="checkbox" id="bm-read-receipt">
    <span class="bm-toggle-track"></span>
  </label>
</div>
```

**JS** — в запросах `/api/bulk/send/start` и `/api/bulk/send-test` добавить:
```js
importance:   document.querySelector('#bm-importance .active')?.dataset.val || 'normal',
read_receipt: document.getElementById('bm-read-receipt')?.checked || false,
```

---

## 5. API — изменения

### `POST /api/send/email`
Добавить поля:
```json
{
  "importance":   "normal",
  "read_receipt": false
}
```

### `POST /api/bulk/send/start`
Добавить поля:
```json
{
  "importance":   "high",
  "read_receipt": true
}
```

### `POST /api/bulk/send-test`
Добавить те же поля.

---

## 6. Файлы CSS

### `static/modular-styles.css`
Добавить стили для сегментированного контрола важности (`.importance-seg`, `.imp-btn`).

### `static/bulk-mail-panel.css`
Добавить аналогичные стили для bulk-mail панели.

---

## 7. Что НЕ меняется
- Встреча ("Отправить встречу") — важность и прочтение не добавляем
- Exchange meeting API — без изменений
- Логика сохранения черновиков — без изменений
- SMTP-канал — параметры передаются в уже готовую `smtp_send_email()`
