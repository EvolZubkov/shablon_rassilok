// exchangeModals.js — модальные окна отправки через Exchange EWS
// Заменяет Outlook COM. Подключается в index-user.html после userApp.js.

const ExchangeModals = (() => {

    // ─── Состояние ───────────────────────────────────────────────────────────

    let _credentialsStatus = null; // кеш: { exists, username, server }

    // ─── Утилиты ─────────────────────────────────────────────────────────────

    function _inject(html) {
        const div = document.createElement('div');
        div.innerHTML = html;
        document.body.appendChild(div.firstElementChild);
    }

    function _q(id) { return document.getElementById(id); }

    function _close(id) {
        const el = _q(id);
        if (el) el.style.display = 'none';
    }

    function _open(id) {
        const el = _q(id);
        if (el) el.style.display = 'flex';
    }

    function _setLoading(btnId, loading, text = '') {
        const btn = _q(btnId);
        if (!btn) return;
        btn.disabled = loading;
        if (text) btn.textContent = loading ? '⏳ ' + text + '...' : text;
    }

    function _parseRecipients(raw) {
        return raw.split(',').map(s => s.trim()).filter(Boolean);
    }

    function _validateEmail(s) {
        return s.includes('@') && s.includes('.');
    }

    // ─── Загрузка статуса credentials ────────────────────────────────────────

    async function _loadCredentialsStatus(force = false) {
        if (_credentialsStatus && !force) return _credentialsStatus;
        try {
            const r = await fetch('/api/credentials/status');
            _credentialsStatus = await r.json();
        } catch {
            _credentialsStatus = { exists: false, username: null, server: null };
        }
        return _credentialsStatus;
    }

    // ─── HTML: Credentials Modal ─────────────────────────────────────────────

    function _renderCredentialsModal() {
        _inject(`
        <div id="exchange-credentials-modal" class="modal exc-modal" style="display:none;">
          <div class="modal-overlay" onclick="ExchangeModals.closeCredentials()"></div>
          <div class="exc-panel exc-panel--sm">
            <div class="exc-header">
              <span class="exc-title">⚙️ Настройки подключения</span>
              <button class="exc-close" onclick="ExchangeModals.closeCredentials()">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
              </button>
            </div>
            <div class="exc-body">

              <div class="exc-field">
                <label class="exc-label">Сервер Exchange</label>
                <input id="exc-server" type="text" class="exc-input"
                       placeholder="mail.company.ru" autocomplete="off">
              </div>

              <div class="exc-field">
                <label class="exc-label">Логин</label>
                <input id="exc-username" type="text" class="exc-input"
                       placeholder="user@company.ru" autocomplete="username">
              </div>

              <div class="exc-field">
                <label class="exc-label">Пароль</label>
                <input id="exc-password" type="password" class="exc-input"
                       placeholder="••••••••" autocomplete="current-password">
              </div>

              <div class="exc-field">
                <label class="exc-label">Email отправителя по умолчанию</label>
                <input id="exc-from-email" type="text" class="exc-input"
                       placeholder="user@company.ru" autocomplete="email">
              </div>

              <div class="exc-field">
                <label class="exc-label">
                  Дополнительные ящики
                  <span class="exc-hint"> (через запятую, необязательно)</span>
                </label>
                <input id="exc-senders" type="text" class="exc-input"
                       placeholder="sender1@rt.ru, sender2@rt.ru">
              </div>

              <div id="exc-test-result" class="exc-test-result"></div>

            </div>
            <div class="exc-footer">
              <button id="exc-test-btn" class="exc-btn exc-btn--secondary"
                      onclick="ExchangeModals.testConnection()">Проверить</button>
              <button id="exc-save-btn" class="exc-btn exc-btn--primary"
                      onclick="ExchangeModals.saveCredentials()">Сохранить</button>
            </div>
          </div>
        </div>`);
    }

    // ─── HTML: Send Email Modal ───────────────────────────────────────────────

    function _renderEmailModal() {
        _inject(`
        <div id="exchange-email-modal" class="modal exc-modal" style="display:none;">
          <div class="modal-overlay" onclick="ExchangeModals.closeEmail()"></div>
          <div class="exc-panel exc-panel--md">
            <div class="exc-header">
              <span class="exc-title">📧 Отправить письмо</span>
              <button class="exc-close" onclick="ExchangeModals.closeEmail()">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
              </button>
            </div>
            <div class="exc-body">

              <div class="exc-field">
                <label class="exc-label">Тема <span class="exc-required">*</span></label>
                <input id="email-subject" type="text" class="exc-input"
                       placeholder="Тема письма">
              </div>

              <div class="exc-field">
                <label class="exc-label">От кого</label>
                <div class="exc-from-row">
                  <select id="email-from" class="exc-input exc-input--select">
                    <option value="">— по умолчанию —</option>
                  </select>
                  <input id="email-from-custom" type="text" class="exc-input"
                         placeholder="или введите вручную">
                </div>
              </div>

              <div class="exc-field">
                <label class="exc-label">Кому <span class="exc-hint">(или Копия / Скрытая копия)</span></label>
                <textarea id="email-to" class="exc-input exc-input--textarea"
                          placeholder="a@rt.ru, b@rt.ru"></textarea>
              </div>

              <div class="exc-field">
                <label class="exc-label">Копия</label>
                <input id="email-cc" type="text" class="exc-input" placeholder="cc@rt.ru">
              </div>

              <div class="exc-field">
                <label class="exc-label">
                  Скрытая копия
                  <span class="exc-hint"> (адреса скрыты от получателей)</span>
                </label>
                <input id="email-bcc" type="text" class="exc-input" placeholder="bcc@rt.ru">
              </div>

              <div class="exc-field">
                <label class="exc-label">Вложения</label>
                <div class="exc-attachments">
                  <button type="button" class="exc-btn exc-btn--secondary exc-btn--sm"
                          onclick="ExchangeModals.pickAttachments('email-attachments-input')">
                    Добавить файлы
                  </button>
                  <input id="email-attachments-input" type="file" multiple
                         style="display:none;"
                         onchange="ExchangeModals.onAttachmentsChange(this, 'email-attachments-list')">
                  <div id="email-attachments-list" class="exc-attachments-list"></div>
                </div>
              </div>

            </div>
            <div class="exc-footer">
              <button class="exc-btn exc-btn--secondary" onclick="ExchangeModals.closeEmail()">Отмена</button>
              <button id="email-send-btn" class="exc-btn exc-btn--primary"
                      onclick="ExchangeModals.sendEmail()">Отправить</button>
            </div>
          </div>
        </div>`);
    }

    // ─── HTML: Send Meeting Modal ─────────────────────────────────────────────

    function _renderMeetingModal() {
        _inject(`
        <div id="exchange-meeting-modal" class="modal exc-modal" style="display:none;">
          <div class="modal-overlay" onclick="ExchangeModals.closeMeeting()"></div>
          <div class="exc-panel exc-panel--md">
            <div class="exc-header">
              <span class="exc-title">📅 Создать встречу</span>
              <button class="exc-close" onclick="ExchangeModals.closeMeeting()">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
              </button>
            </div>
            <div class="exc-body">

              <div class="exc-field">
                <label class="exc-label">Тема <span class="exc-required">*</span></label>
                <input id="meeting-subject" type="text" class="exc-input"
                       placeholder="Тема встречи">
              </div>

              <div class="exc-field">
                <label class="exc-label">От кого</label>
                <div class="exc-from-row">
                  <select id="meeting-from" class="exc-input exc-input--select">
                    <option value="">— по умолчанию —</option>
                  </select>
                  <input id="meeting-from-custom" type="text" class="exc-input"
                         placeholder="или введите вручную">
                </div>
              </div>

              <div class="exc-field">
                <label class="exc-label">Участники <span class="exc-hint">(или Скрытая копия)</span></label>
                <textarea id="meeting-to" class="exc-input exc-input--textarea"
                          placeholder="a@rt.ru, b@rt.ru"></textarea>
              </div>

              <div class="exc-field">
                <label class="exc-label">
                  Скрытая копия
                  <span class="exc-hint"> (адреса скрыты)</span>
                </label>
                <input id="meeting-bcc" type="text" class="exc-input" placeholder="bcc@rt.ru">
              </div>

              <div class="exc-field">
                <label class="exc-label">Вложения</label>
                <div class="exc-attachments">
                  <button type="button" class="exc-btn exc-btn--secondary exc-btn--sm"
                          onclick="ExchangeModals.pickAttachments('meeting-attachments-input')">
                    Добавить файлы
                  </button>
                  <input id="meeting-attachments-input" type="file" multiple
                         style="display:none;"
                         onchange="ExchangeModals.onAttachmentsChange(this, 'meeting-attachments-list')">
                  <div id="meeting-attachments-list" class="exc-attachments-list"></div>
                </div>
              </div>

              <div class="exc-field">
                <label class="exc-label">
                  Место
                  <span class="exc-hint"> (необязательно)</span>
                </label>
                <input id="meeting-location" type="text" class="exc-input"
                       placeholder="Переговорная А / Teams / онлайн">
              </div>

              <div class="exc-datetime-grid">
                <div class="exc-field">
                  <label class="exc-label">Начало <span class="exc-required">*</span></label>
                  <input id="meeting-start-date" type="date" class="exc-input">
                  <input id="meeting-start-time" type="time" class="exc-input exc-input--time" value="10:00">
                </div>
                <div class="exc-field">
                  <label class="exc-label">Конец <span class="exc-required">*</span></label>
                  <input id="meeting-end-date" type="date" class="exc-input">
                  <input id="meeting-end-time" type="time" class="exc-input exc-input--time" value="11:00">
                </div>
              </div>

            </div>
            <div class="exc-footer">
              <button class="exc-btn exc-btn--secondary" onclick="ExchangeModals.closeMeeting()">Отмена</button>
              <button id="meeting-send-btn" class="exc-btn exc-btn--primary"
                      onclick="ExchangeModals.sendMeeting()">Создать встречу</button>
            </div>
          </div>
        </div>`);
    }

    // ─── Credentials: открыть / закрыть ──────────────────────────────────────

    async function openCredentials() {
        _open('exchange-credentials-modal');
        const status = await _loadCredentialsStatus(true);
        if (status.exists) {
            if (status.server)     _q('exc-server').value     = status.server;
            if (status.username)   _q('exc-username').value   = status.username;
            if (status.from_email) _q('exc-from-email').value = status.from_email;
            else                   _q('exc-from-email').value = '';
            // Дополнительные ящики
            const senders = status.default_senders || [];
            _q('exc-senders').value = senders.join(', ');
        }
        _q('exc-test-result').style.display = 'none';
    }

    function closeCredentials() { _close('exchange-credentials-modal'); }

    // ─── Credentials: проверить подключение ──────────────────────────────────

    async function testConnection() {
        const server   = _q('exc-server').value.trim();
        const username = _q('exc-username').value.trim();
        const password = _q('exc-password').value;
        const fromEmail = _q('exc-from-email').value.trim();

        if (!server || !username || !password || !fromEmail) {
            _showTestResult('Заполните все поля', 'error');
            return;
        }

        _setLoading('exc-test-btn', true, 'Проверить');
        try {
            // Временно сохраняем → проверяем статус → откатываем если надо
            const r = await fetch('/api/credentials/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ server, username, password,
                                       from_email: fromEmail })
            });
            const data = await r.json();
            if (data.success) {
                _showTestResult('✅ Настройки сохранены. Подключение будет проверено при первой отправке.', 'success');
            } else {
                _showTestResult('❌ ' + (data.error || 'Ошибка'), 'error');
            }
        } catch {
            _showTestResult('❌ Нет связи с сервером приложения', 'error');
        } finally {
            _setLoading('exc-test-btn', false, 'Проверить');
        }
    }

    function _showTestResult(text, type) {
        const el = _q('exc-test-result');
        el.className = 'exc-test-result exc-test-result--' + type;
        el.textContent = text;
    }

    // ─── Credentials: сохранить ───────────────────────────────────────────────

    async function saveCredentials() {
        const server    = _q('exc-server').value.trim();
        const username  = _q('exc-username').value.trim();
        const password  = _q('exc-password').value;
        const fromEmail = _q('exc-from-email').value.trim();
        const sendersRaw = _q('exc-senders').value.trim();
        const defaultSenders = sendersRaw
            ? sendersRaw.split(',').map(s => s.trim()).filter(Boolean)
            : [];

        if (!server || !username || !password || !fromEmail) {
            Toast.warning('Заполните все обязательные поля');
            return;
        }
        if (!_validateEmail(fromEmail)) {
            Toast.warning('Некорректный email отправителя');
            return;
        }

        _setLoading('exc-save-btn', true, 'Сохранить');
        try {
            const r = await fetch('/api/credentials/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    server, username, password,
                    from_email: fromEmail,
                    default_senders: defaultSenders
                })
            });
            const data = await r.json();
            if (data.success) {
                _credentialsStatus = null; // сбросить кеш
                Toast.success('Настройки сохранены');
                closeCredentials();
            } else {
                Toast.error(data.error || 'Ошибка сохранения');
            }
        } catch {
            Toast.error('Нет связи с сервером');
        } finally {
            _setLoading('exc-save-btn', false, 'Сохранить');
        }
    }

    // ─── Send Email: открыть ──────────────────────────────────────────────────

    async function openEmail() {
        const status = await _loadCredentialsStatus();
        if (!status.exists) {
            Toast.info('Сначала настройте подключение к Exchange');
            await openCredentials();
            return;
        }

        // Заполняем выпадающий список отправителей
        await _populateSenderSelect('email-from', status);

        // Заполняем тему из текущего шаблона
        const tpl = (typeof UserAppState !== 'undefined')
            ? UserAppState.currentTemplate : null;
        if (tpl?.name) _q('email-subject').value = tpl.name;

        _open('exchange-email-modal');
    }

    function closeEmail() {
        _close('exchange-email-modal');
        _attachments.email = [];
        const list = _q('email-attachments-list');
        if (list) list.innerHTML = '';
    }

    // ─── Send Meeting: открыть ────────────────────────────────────────────────

    async function openMeeting() {
        const status = await _loadCredentialsStatus();
        if (!status.exists) {
            Toast.info('Сначала настройте подключение к Exchange');
            await openCredentials();
            return;
        }

        await _populateSenderSelect('meeting-from', status);

        const tpl = (typeof UserAppState !== 'undefined')
            ? UserAppState.currentTemplate : null;
        if (tpl?.name) _q('meeting-subject').value = tpl.name;

        // Дефолтные даты — сегодня, завтра + 1 час
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const pad = n => String(n).padStart(2, '0');
        const dateStr = d =>
            `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;

        _q('meeting-start-date').value = dateStr(tomorrow);
        _q('meeting-end-date').value   = dateStr(tomorrow);
        _q('meeting-start-time').value = '10:00';
        _q('meeting-end-time').value   = '11:00';

        _open('exchange-meeting-modal');
    }

     function closeMeeting() {
        _close('exchange-meeting-modal');
        _attachments.meeting = [];
        const list = _q('meeting-attachments-list');
        if (list) list.innerHTML = '';
    }

    // ─── Заполнить select отправителей ───────────────────────────────────────

    async function _populateSenderSelect(selectId, status) {
        const sel = _q(selectId);
        if (!sel) return;

        sel.innerHTML = '';

        // Default option: use the saved from_email (or username as fallback).
        // The value must never be empty so the server always receives a valid address.
        const defaultAddress = status.from_email || status.username || '';
        const defaultOpt = document.createElement('option');
        defaultOpt.value = defaultAddress;
        defaultOpt.textContent = defaultAddress
            ? `— по умолчанию — (${defaultAddress})`
            : '— по умолчанию —';
        sel.appendChild(defaultOpt);

        // Additional sender mailboxes
        (status.default_senders || []).forEach(email => {
            if (email === defaultAddress) return; // already shown
            const opt = document.createElement('option');
            opt.value = email;
            opt.textContent = email;
            sel.appendChild(opt);
        });
    }

    // ─── Отправка письма ─────────────────────────────────────────────────────

    async function sendEmail() {
        const subject = _q('email-subject').value.trim();
        const toRaw   = _q('email-to').value.trim();
        const ccRaw   = _q('email-cc').value.trim();
        const bccRaw  = _q('email-bcc').value.trim();
        const fromSel    = _q('email-from').value.trim();
        const fromCustom = _q('email-from-custom').value.trim();
        const fromEmail  = fromCustom || fromSel;

        if (!subject) { Toast.warning('Укажите тему письма'); return; }
        if (!toRaw && !ccRaw && !bccRaw) {
            Toast.warning('Укажите хотя бы одного получателя (Кому, Копия или Скрытая копия)');
            return;
        }

        const to  = toRaw  ? _parseRecipients(toRaw)  : [];
        const cc  = ccRaw  ? _parseRecipients(ccRaw)  : [];
        const bcc = bccRaw ? _parseRecipients(bccRaw) : [];

        const badAddr = [...to, ...cc, ...bcc].find(e => !_validateEmail(e));
        if (badAddr) { Toast.warning(`Некорректный адрес: ${badAddr}`); return; }

        _setLoading('email-send-btn', true, 'Отправить');
        try {
            const html = await _generateHtml();
            const attachments = await _filesToBase64(_attachments.email);
            const r = await fetch('/api/send/email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subject, to, cc, bcc,
                                       from_email: fromEmail, html_body: html,
                                       attachments })
            });
            const data = await r.json();
            if (data.success) {
                Toast.success('Письмо отправлено');
                closeEmail();
            } else if (r.status === 401) {
                Toast.error('Ошибка авторизации. Проверьте настройки подключения.');
                closeEmail();
                openCredentials();
            } else {
                Toast.error(data.error || 'Ошибка отправки');
            }
        } catch {
            Toast.error('Нет связи с сервером');
        } finally {
            _setLoading('email-send-btn', false, 'Отправить');
        }
    }

    // ─── Отправка встречи ────────────────────────────────────────────────────

    async function sendMeeting() {
        const subject   = _q('meeting-subject').value.trim();
        const toRaw     = _q('meeting-to').value.trim();
        const bccRaw    = _q('meeting-bcc').value.trim();
        const fromSel    = _q('meeting-from').value.trim();
        const fromCustom = _q('meeting-from-custom').value.trim();
        const fromEmail  = fromCustom || fromSel;
        const location  = _q('meeting-location').value.trim();
        const startDate = _q('meeting-start-date').value;
        const startTime = _q('meeting-start-time').value;
        const endDate   = _q('meeting-end-date').value;
        const endTime   = _q('meeting-end-time').value;

        if (!subject) { Toast.warning('Укажите тему встречи'); return; }
        if (!toRaw && !bccRaw) {
            Toast.warning('Укажите хотя бы одного участника (Участники или Скрытая копия)');
            return;
        }
        if (!startDate || !startTime) { Toast.warning('Укажите дату и время начала'); return; }
        if (!endDate   || !endTime)   { Toast.warning('Укажите дату и время окончания'); return; }

        const startDt = `${startDate}T${startTime}:00`;
        const endDt   = `${endDate}T${endTime}:00`;

        if (new Date(endDt) <= new Date(startDt)) {
            Toast.warning('Время окончания должно быть позже начала');
            return;
        }

        const to  = toRaw  ? _parseRecipients(toRaw)  : [];
        const bcc = bccRaw ? _parseRecipients(bccRaw) : [];

        const badAddr = [...to, ...bcc].find(e => !_validateEmail(e));
        if (badAddr) { Toast.warning(`Некорректный адрес: ${badAddr}`); return; }

        _setLoading('meeting-send-btn', true, 'Создать встречу');
        try {
            const html = await _generateHtml();
            const attachments = await _filesToBase64(_attachments.meeting);
            const r = await fetch('/api/send/meeting', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    subject, to, bcc, from_email: fromEmail,
                    location, start_dt: startDt, end_dt: endDt,
                    html_body: html, attachments
                })
            });
            const data = await r.json();
            if (data.success) {
                Toast.success('Встреча создана и отправлена участникам');
                closeMeeting();
            } else if (r.status === 401) {
                Toast.error('Ошибка авторизации. Проверьте настройки подключения.');
                closeMeeting();
                openCredentials();
            } else {
                Toast.error(data.error || 'Ошибка создания встречи');
            }
        } catch {
            Toast.error('Нет связи с сервером');
        } finally {
            _setLoading('meeting-send-btn', false, 'Создать встречу');
        }
    }

    // ─── Генерация HTML письма ───────────────────────────────────────────────

    async function _generateHtml() {
        if (typeof generateEmailHTML === 'undefined') return '';
        // В user-версии блоки хранятся в UserAppState, в admin — в AppState напрямую
        if (typeof UserAppState !== 'undefined' && UserAppState.blocks) {
            const originalBlocks = AppState.blocks;
            AppState.blocks = UserAppState.blocks;
            try {
                return await generateEmailHTML();
            } finally {
                AppState.blocks = originalBlocks;
            }
        }
        // Admin версия — AppState уже содержит актуальные блоки
        return await generateEmailHTML();
    }

    // ─── Вложения ─────────────────────────────────────────────────────────────

    // Хранилище файлов
    const _attachments = { email: [], meeting: [] };

    function pickAttachments(inputId) {
        const input = _q(inputId);
        if (input) input.click();
    }

    function onAttachmentsChange(input, listId) {
        const key = listId.includes('email') ? 'email' : 'meeting';
        const newFiles = Array.from(input.files);
        _attachments[key] = [..._attachments[key], ...newFiles];
        _renderAttachmentsList(listId, key);
        input.value = ''; // сбрасываем чтобы можно было добавить тот же файл
    }

    function _renderAttachmentsList(listId, key) {
        const list = _q(listId);
        if (!list) return;
        list.innerHTML = _attachments[key].map((file, i) => `
            <div class="exc-attachment-item">
                <span class="exc-attachment-name">📄 ${file.name}</span>
                <span class="exc-attachment-size">${_formatSize(file.size)}</span>
                <button type="button" class="exc-attachment-remove"
                        onclick="ExchangeModals.removeAttachment('${key}', ${i}, '${listId}')">✕</button>
            </div>
        `).join('');
    }

    function removeAttachment(key, index, listId) {
        _attachments[key].splice(index, 1);
        _renderAttachmentsList(listId, key);
    }

    function _formatSize(bytes) {
        if (bytes < 1024) return bytes + ' Б';
        if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' КБ';
        return (bytes / (1024 * 1024)).toFixed(1) + ' МБ';
    }

    async function _filesToBase64(files) {
        return Promise.all(files.map(file => new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve({
                name: file.name,
                content: e.target.result.split(',')[1], // только base64 без заголовка
                mime_type: file.type || 'application/octet-stream'
            });
            reader.onerror = reject;
            reader.readAsDataURL(file);
        })));
    }

    // ─── Инициализация ───────────────────────────────────────────────────────

    function init() {
        _renderCredentialsModal();
        _renderEmailModal();
        _renderMeetingModal();

        // Перехватываем кнопки — поддержка обоих вариантов ID:
        // user-версия: btn-send-outlook / btn-send-meeting
        // admin-версия: btn-create-outlook / btn-create-meeting
        const btnEmail   = document.getElementById('btn-send-outlook')
                        || document.getElementById('btn-create-outlook');
        const btnMeeting = document.getElementById('btn-send-meeting')
                        || document.getElementById('btn-create-meeting');

        if (btnEmail) {
            btnEmail.removeEventListener('click', window.sendToOutlook);
            btnEmail.removeEventListener('click', window.createOutlookDraft);
            btnEmail.addEventListener('click', openEmail);
        }
        if (btnMeeting) {
            btnMeeting.removeEventListener('click', window.sendMeetingToOutlook);
            btnMeeting.removeEventListener('click', window.createOutlookMeeting);
            btnMeeting.addEventListener('click', openMeeting);
        }

        // Кнопка шестерёнки в заголовке (если есть)
        const btnSettings = document.getElementById('btn-exchange-settings');
        if (btnSettings) {
            btnSettings.addEventListener('click', openCredentials);
        }

        // Предзагружаем статус
        _loadCredentialsStatus();
    }

    // ─── Публичный API ────────────────────────────────────────────────────────

    return {
        init,
        openCredentials, closeCredentials,
        openEmail,       closeEmail,
        openMeeting,     closeMeeting,
        saveCredentials,
        testConnection,
        sendEmail,
        sendMeeting,
        pickAttachments,        
        onAttachmentsChange,    
        removeAttachment,
    };

})();

// Инициализация после загрузки DOM
document.addEventListener('DOMContentLoaded', () => ExchangeModals.init());