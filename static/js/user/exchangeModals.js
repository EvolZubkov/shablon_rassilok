// exchangeModals.js — модальные окна отправки через Exchange EWS
// Заменяет Outlook COM. Подключается в index-user.html после userApp.js.

const ExchangeModals = (() => {

    // ─── Состояние ───────────────────────────────────────────────────────────

    let _credentialsStatus = null; // кеш: { exists, username, server }
    let _appSettingsStatus = null;

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

    function _setActiveSettingsTab(tab) {
        const exchangeTab = _q('settings-tab-exchange');
        const repoTab = _q('settings-tab-repository');
        const exchangePane = _q('settings-pane-exchange');
        const repoPane = _q('settings-pane-repository');
        const testBtn = _q('exc-test-btn');

        const isExchange = tab !== 'repository';

        exchangeTab?.classList.toggle('active', isExchange);
        repoTab?.classList.toggle('active', !isExchange);
        exchangePane?.classList.toggle('is-active', isExchange);
        repoPane?.classList.toggle('is-active', !isExchange);
        if (testBtn) testBtn.style.display = isExchange ? '' : 'none';
    }

    function _setLoading(btnId, loading, text = '') {
        const btn = _q(btnId);
        if (!btn) return;
        btn.disabled = loading;
        if (text) btn.textContent = loading ? '⏳ ' + text + '...' : text;
    }

    function _parseRecipients(raw) {
        return raw.split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
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
        <div id="exchange-credentials-modal" class="modal exc-modal exchange-settings-modal" style="display:none;">
          <div class="modal-overlay" onclick="ExchangeModals.closeCredentials()"></div>
          <div class="exc-panel exc-panel--md exchange-settings-panel">
            <div class="exc-header">
              <span class="exc-title">⚙️ Настройки</span>
              <button class="exc-close" onclick="ExchangeModals.closeCredentials()">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
              </button>
            </div>
            <div class="exc-body">
              <div class="exchange-settings-tabs library-subtabs">
                <button id="settings-tab-exchange" type="button" class="library-subtab active">Exchange</button>
                <button id="settings-tab-repository" type="button" class="library-subtab">Репозиторий</button>
              </div>

              <div id="settings-pane-exchange" class="exchange-settings-pane is-active">
                <div class="exc-field">
                  <label class="exc-label">Сервер Exchange</label>
                  <input id="exc-server" type="text" class="exc-input"
                         placeholder="mail.company.ru" autocomplete="off">
                </div>

                <div class="exc-field">
                  <label class="exc-label">Логин</label>
                  <input id="exc-username" type="text" class="exc-input"
                         placeholder="domain\\user_name" autocomplete="username">
                </div>

                <div class="exc-field">
                  <label class="exc-label">Пароль</label>
                  <input id="exc-password" type="password" class="exc-input"
                         placeholder="••••••••" autocomplete="current-password">
                </div>

                <div class="exc-field">
                  <label class="exc-label">Email отправителя по умолчанию</label>
                  <input id="exc-from-email" type="text" class="exc-input"
                         placeholder="user_name@company.ru" autocomplete="email">
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

              <div id="settings-pane-repository" class="exchange-settings-pane">
                <div class="exc-field">
                  <label class="exc-label">
                    <span id="app-settings-repo-label">Путь к репозиторию ресурсов</span>
                  </label>
                  <div class="exc-input-with-btn">
                    <input id="app-settings-repo-path" type="text" class="exc-input" placeholder="">
                    <button id="app-settings-browse-btn" type="button" class="exc-btn exc-btn--secondary exc-btn--icon" title="Выбрать папку">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                      </svg>
                    </button>
                  </div>
                </div>

                <div class="app-settings-actions">
                  <button id="app-settings-verify-btn" type="button" class="exc-btn exc-btn--secondary">Проверить путь</button>
                  <button id="app-settings-search-btn" type="button" class="exc-btn exc-btn--secondary">Найти репозиторий</button>
                  <button id="app-settings-create-btn" type="button" class="exc-btn exc-btn--secondary">Создать новый репозиторий</button>
                  <button id="app-settings-refresh-cache-btn" type="button" class="exc-btn exc-btn--secondary">Обновить кеш</button>
                </div>

                <div id="app-settings-result" class="exc-test-result"></div>
              </div>

            </div>
            <div class="exc-footer">
              <div id="settings-actions-shared" class="exchange-settings-footer-actions">
                <button id="exc-test-btn" class="exc-btn exc-btn--secondary"
                        onclick="ExchangeModals.testConnection()">Проверить</button>
                <button id="exc-save-btn" class="exc-btn exc-btn--primary"
                        onclick="ExchangeModals.saveSettings()">Закрыть</button>
              </div>
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

              <div class="exc-field exc-field--comment">
                <label class="exc-comment-toggle">
                  <input type="checkbox" id="email-comment-toggle"
                         onchange="ExchangeModals.toggleEmailComment(this.checked)">
                  <span class="exc-comment-toggle__label">Добавить комментарий к письму</span>
                </label>
                <div id="email-comment-area" style="display:none; margin-top:8px;">
                  <textarea id="email-comment-text" class="exc-input exc-input--textarea"
                            rows="3"
                            placeholder="Текст будет вставлен перед шаблоном письма…"></textarea>
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
              <span class="exc-title">📅 Отправить встречу</span>
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
                      onclick="ExchangeModals.sendMeeting()">Отправить встречу</button>
            </div>
          </div>
        </div>`);
    }

    // ─── Credentials: открыть / закрыть ──────────────────────────────────────

    function _updateSettingsDirtyState() {
        const saveBtn = _q('exc-save-btn');
        if (!saveBtn) return;
        const data = _getExchangeFormData();
        const dirty = _isExchangeFormDirty(data) || _isRepoFormDirty();
        if (dirty) {
            saveBtn.textContent = 'Сохранить';
            saveBtn.classList.add('exc-btn--primary');
            saveBtn.classList.remove('exc-btn--secondary');
        } else {
            saveBtn.textContent = 'Закрыть';
            saveBtn.classList.remove('exc-btn--primary');
            saveBtn.classList.add('exc-btn--secondary');
        }
    }

    async function openCredentials() {
        _open('exchange-credentials-modal');
        _setActiveSettingsTab('exchange');
        const status = await _loadCredentialsStatus(true);
        try {
            await _loadAppSettings(true);
        } catch (error) {
            _showRepoResult(error.message || 'Не удалось загрузить настройки репозитория', 'error');
        }
        if (status.exists) {
            if (status.server)     _q('exc-server').value     = status.server;
            if (status.username)   _q('exc-username').value   = status.username;
            if (status.from_email) _q('exc-from-email').value = status.from_email;
            else                   _q('exc-from-email').value = '';
            const senders = status.default_senders || [];
            _q('exc-senders').value = senders.join(', ');
        } else if (status.default_server) {
            _q('exc-server').value = status.default_server;
        }
        const passwordInput = _q('exc-password');
        if (passwordInput) {
            passwordInput.value = '';
            passwordInput.placeholder = status.has_password
                ? 'Оставьте пустым, чтобы не менять'
                : '••••••••';
        }
        _q('exc-test-result').style.display = 'none';

        // Track changes to toggle Save ↔ Close button label.
        const watchedIds = ['exc-server', 'exc-username', 'exc-password', 'exc-from-email', 'exc-senders'];
        watchedIds.forEach(id => {
            const el = _q(id);
            if (el) el.addEventListener('input', _updateSettingsDirtyState);
        });
        _updateSettingsDirtyState();
    }

    function _getExchangeFormData() {
        const sendersRaw = _q('exc-senders').value.trim();
        return {
            server: _q('exc-server').value.trim(),
            username: _q('exc-username').value.trim(),
            password: _q('exc-password').value,
            fromEmail: _q('exc-from-email').value.trim(),
            defaultSenders: sendersRaw
                ? sendersRaw.split(',').map(s => s.trim()).filter(Boolean)
                : [],
        };
    }

    function _isExchangeFormDirty(data) {
        const status = _credentialsStatus || {};
        const currentSenders = Array.isArray(status.default_senders) ? status.default_senders : [];
        const nextSenders = Array.isArray(data.defaultSenders) ? data.defaultSenders : [];

        if (data.password) return true;
        if ((status.server || '') !== data.server) return true;
        if ((status.username || '') !== data.username) return true;
        if ((status.from_email || '') !== data.fromEmail) return true;
        if (currentSenders.length !== nextSenders.length) return true;
        return currentSenders.some((value, index) => value !== nextSenders[index]);
    }

    function _isRepoFormDirty() {
        const currentPath = _q('app-settings-repo-path')?.value.trim() || '';
        const savedPath = (_appSettingsStatus?.repo_path || '').trim();
        return currentPath !== savedPath;
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

    async function _loadAppSettings(force = false) {
        if (_appSettingsStatus && !force) return _appSettingsStatus;
        const response = await fetch('/api/app-settings');
        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error || 'Не удалось загрузить настройки репозитория');
        }

        _appSettingsStatus = data;
        _q('app-settings-repo-label').textContent = data.repo_label || 'Путь к репозиторию ресурсов';
        _q('app-settings-repo-path').value = data.repo_path || '';
        _q('app-settings-repo-path').placeholder = data.repo_placeholder || '';
        _q('app-settings-create-btn').style.display = data.can_create_repo ? '' : 'none';

        _clearRepoResult();
        if (data.repo_path) {
            if (data.repo_valid) {
                _showRepoResult('✓ Текущий путь к репозиторию корректен', 'success');
            } else if (data.repo_reason) {
                _showRepoResult(`✗ ${data.repo_reason}`, 'error');
            }
        }
        return data;
    }

    function _showRepoResult(text, type) {
        const el = _q('app-settings-result');
        if (!el) return;
        el.className = `exc-test-result exc-test-result--${type}`;
        el.textContent = text;
    }

    function _clearRepoResult() {
        const el = _q('app-settings-result');
        if (!el) return;
        el.className = 'exc-test-result';
        el.textContent = '';
    }

    async function browseRepo() {
        const btn = _q('app-settings-browse-btn');
        if (btn) btn.disabled = true;
        try {
            const response = await fetch('/api/app-settings/repo/browse', { method: 'POST' });
            const data = await response.json();
            if (data.success && data.path) {
                _q('app-settings-repo-path').value = data.path;
                _clearRepoResult();
                _updateSettingsDirtyState();
            }
        } catch {
            // Dialog unavailable (browser-fallback mode) — silently ignore.
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    async function verifyRepoPath() {
        const repoPath = _q('app-settings-repo-path').value.trim();
        if (!repoPath) {
            _showRepoResult('Введите путь к репозиторию', 'error');
            return;
        }

        _setLoading('app-settings-verify-btn', true, 'Проверить путь');
        try {
            const response = await fetch('/api/app-settings/repo/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ repo_path: repoPath }),
            });
            const data = await response.json();
            if (data.valid) {
                _showRepoResult('✓ Репозиторий найден и структура корректна', 'success');
            } else {
                _showRepoResult(`✗ ${data.reason || 'Некорректный путь'}`, 'error');
            }
        } catch {
            _showRepoResult('Не удалось проверить путь', 'error');
        } finally {
            _setLoading('app-settings-verify-btn', false, 'Проверить путь');
        }
    }

    async function searchRepo() {
        _setLoading('app-settings-search-btn', true, 'Найти репозиторий');
        try {
            const response = await fetch('/api/app-settings/repo/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });
            const data = await response.json();
            if (data.success && data.repo_path) {
                _q('app-settings-repo-path').value = data.repo_path;
                _showRepoResult(`✓ Найден репозиторий: ${data.repo_path}`, 'success');
                _updateSettingsDirtyState();
            } else {
                _showRepoResult(data.error || data.reason || 'Репозиторий не найден', 'error');
            }
        } catch {
            _showRepoResult('Не удалось выполнить поиск репозитория', 'error');
        } finally {
            _setLoading('app-settings-search-btn', false, 'Найти репозиторий');
        }
    }

    async function createRepo() {
        const repoPath = _q('app-settings-repo-path').value.trim();
        if (!repoPath) {
            _showRepoResult('Введите путь, где нужно создать репозиторий', 'error');
            return;
        }

        _setLoading('app-settings-create-btn', true, 'Создать новый репозиторий');
        try {
            const response = await fetch('/api/app-settings/repo/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ repo_path: repoPath }),
            });
            const data = await response.json();
            if (data.success) {
                _appSettingsStatus = null;
                _showRepoResult(`✓ Новый репозиторий создан: ${data.repo_path}`, 'success');
                _updateSettingsDirtyState();
            } else {
                _showRepoResult(data.error || 'Не удалось создать репозиторий', 'error');
            }
        } catch {
            _showRepoResult('Не удалось создать репозиторий', 'error');
        } finally {
            _setLoading('app-settings-create-btn', false, 'Создать новый репозиторий');
        }
    }

    async function saveRepoPath(options = {}) {
        const { buttonId = 'exc-save-btn', buttonText = 'Сохранить' } = options;
        const repoPath = _q('app-settings-repo-path').value.trim();
        if (!repoPath) {
            _showRepoResult('Введите путь к репозиторию', 'error');
            return false;
        }

        _setLoading(buttonId, true, buttonText);
        try {
            const response = await fetch('/api/app-settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ repo_path: repoPath }),
            });
            const data = await response.json();
            if (data.success) {
                _appSettingsStatus = null;
                _showRepoResult('✓ Путь к репозиторию сохранён', 'success');
                Toast.success('Путь к репозиторию сохранён');
                await _loadAppSettings(true);
                _updateSettingsDirtyState();
                return true;
            } else {
                _showRepoResult(data.error || 'Ошибка сохранения настроек', 'error');
                return false;
            }
        } catch {
            _showRepoResult('Нет связи с сервером приложения', 'error');
            return false;
        } finally {
            _setLoading(buttonId, false, buttonText);
        }
    }

    async function refreshRepoCache() {
        const repoPath = _q('app-settings-repo-path').value.trim();
        if (!repoPath) {
            _showRepoResult('Введите путь к репозиторию', 'error');
            return false;
        }

        _setLoading('app-settings-refresh-cache-btn', true, 'Обновить кеш');
        try {
            const response = await fetch('/api/app-settings/repo/refresh-cache', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ repo_path: repoPath }),
            });
            const data = await response.json();
            if (data.success) {
                _appSettingsStatus = null;
                _showRepoResult(`✓ Кеш репозитория обновлён${data.version ? ` (версия ${data.version})` : ''}`, 'success');
                Toast.success('Кеш репозитория обновлён');
                return true;
            }

            _showRepoResult(data.error || 'Не удалось обновить кеш репозитория', 'error');
            return false;
        } catch {
            _showRepoResult('Нет связи с сервером приложения', 'error');
            return false;
        } finally {
            _setLoading('app-settings-refresh-cache-btn', false, 'Обновить кеш');
        }
    }

    // ─── Credentials: сохранить ───────────────────────────────────────────────

    async function saveCredentials(options = {}) {
        const { closeOnSuccess = true } = options;
        const {
            server,
            username,
            password,
            fromEmail,
            defaultSenders,
        } = _getExchangeFormData();

        const isDirty = _isExchangeFormDirty({ server, username, password, fromEmail, defaultSenders });

        if (!isDirty) {
            return true;
        }

        if (fromEmail && !_validateEmail(fromEmail)) {
            Toast.warning('Некорректный email отправителя');
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
                await _loadCredentialsStatus(true);
                _q('exc-password').value = '';
                Toast.success('Настройки сохранены');
                if (closeOnSuccess) {
                    closeCredentials();
                }
                return true;
            } else {
                Toast.error(data.error || 'Ошибка сохранения');
                return false;
            }
        } catch {
            Toast.error('Нет связи с сервером');
            return false;
        } finally {
            _setLoading('exc-save-btn', false, 'Сохранить');
        }
    }

    async function saveSettings() {
        const data = _getExchangeFormData();
        const exchangeDirty = _isExchangeFormDirty(data);
        const repoDirty = _isRepoFormDirty();

        if (!exchangeDirty && !repoDirty) {
            closeCredentials();
            return;
        }

        let ok = true;
        if (exchangeDirty) {
            ok = await saveCredentials({ closeOnSuccess: false });
        }
        if (ok && repoDirty) {
            ok = await saveRepoPath({ buttonId: 'exc-save-btn', buttonText: 'Сохранить' });
        }

        if (ok) {
            closeCredentials();
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
        // Reset comment toggle
        const toggle = _q('email-comment-toggle');
        if (toggle) toggle.checked = false;
        toggleEmailComment(false);
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

        const commentOn   = _q('email-comment-toggle')?.checked;
        const commentText = commentOn ? (_q('email-comment-text')?.value || '') : '';

        _setLoading('email-send-btn', true, 'Отправить');
        try {
            const rawHtml = await _generateHtml();
            const html = _injectPreamble(rawHtml, commentText);
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
                if (typeof EmailHistoryStore !== 'undefined') {
                    EmailHistoryStore.addMany([...to, ...cc, ...bcc]);
                }
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

        _setLoading('meeting-send-btn', true, 'Отправить встречу');
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
                if (typeof EmailHistoryStore !== 'undefined') {
                    EmailHistoryStore.addMany([...to, ...bcc]);
                }
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
            _setLoading('meeting-send-btn', false, 'Отправить встречу');
        }
    }

    // ─── Комментарий к письму ────────────────────────────────────────────────

    function toggleEmailComment(checked) {
        const area = _q('email-comment-area');
        if (area) area.style.display = checked ? 'block' : 'none';
        if (!checked) {
            const ta = _q('email-comment-text');
            if (ta) ta.value = '';
        }
    }

    /**
     * Inject a styled preamble block immediately after the {@code <body>} tag
     * of a generated email HTML document.
     *
     * Uses a table-based layout so the block renders correctly in email clients.
     * Text is HTML-escaped and newlines are converted to {@code <br>}.
     *
     * @param {string} html  Full email HTML string from {@link _generateHtml}.
     * @param {string} text  Raw preamble text entered by the user.
     * @returns {string}     Modified HTML with preamble prepended to body content.
     */
    function _injectPreamble(html, text) {
        const trimmed = text.trim();
        if (!trimmed) return html;

        const escape = (typeof TextSanitizer !== 'undefined')
            ? (s) => TextSanitizer.escapeHTML(s)
            : (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        const safeText = escape(trimmed).replace(/\n/g, '<br>');

        const block =
            '<table role="presentation" cellpadding="0" cellspacing="0" border="0"' +
            ' width="100%" style="background-color:#fffbeb;border-left:4px solid #f59e0b;">' +
            '<tr><td style="padding:14px 20px;font-family:Arial,sans-serif;font-size:14px;' +
            'color:#78350f;line-height:1.6;">' +
            '<strong style="display:block;margin-bottom:5px;font-size:11px;font-weight:700;' +
            'text-transform:uppercase;letter-spacing:0.06em;color:#b45309;">' +
            'Комментарий</strong>' +
            safeText +
            '</td></tr></table>';

        // Find the end of the <body …> opening tag and insert the block right after it.
        const bodyMatch = html.match(/<body[^>]*>/);
        if (!bodyMatch) return block + html;
        const insertAt = html.indexOf(bodyMatch[0]) + bodyMatch[0].length;
        return html.slice(0, insertAt) + block + html.slice(insertAt);
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
                <span class="exc-attachment-name">📄 ${TextSanitizer.escapeHTML(file.name)}</span>
                <span class="exc-attachment-size">${_formatSize(file.size)}</span>
                <button type="button" class="exc-attachment-remove"
                        data-key="${TextSanitizer.escapeHTML(key)}"
                        data-index="${i}"
                        data-list="${TextSanitizer.escapeHTML(listId)}">✕</button>
            </div>
        `).join('');
        list.querySelectorAll('.exc-attachment-remove').forEach(btn => {
            btn.addEventListener('click', () => {
                removeAttachment(btn.dataset.key, Number(btn.dataset.index), btn.dataset.list);
            });
        });
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

        // Attach autocomplete to all recipient fields once the modals are in the DOM.
        if (typeof EmailAutocomplete !== 'undefined') {
            EmailAutocomplete.attachAll();
        }

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

        _q('settings-tab-exchange')?.addEventListener('click', () => _setActiveSettingsTab('exchange'));
        _q('settings-tab-repository')?.addEventListener('click', () => _setActiveSettingsTab('repository'));
        _q('app-settings-browse-btn')?.addEventListener('click', browseRepo);
        _q('app-settings-verify-btn')?.addEventListener('click', verifyRepoPath);
        _q('app-settings-search-btn')?.addEventListener('click', searchRepo);
        _q('app-settings-create-btn')?.addEventListener('click', createRepo);
        _q('app-settings-refresh-cache-btn')?.addEventListener('click', refreshRepoCache);
        _q('app-settings-repo-path')?.addEventListener('input', () => {
            _clearRepoResult();
            _updateSettingsDirtyState();
        });

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
        saveSettings,
        testConnection,
        verifyRepoPath,
        searchRepo,
        createRepo,
        saveRepoPath,
        refreshRepoCache,
        sendEmail,
        sendMeeting,
        toggleEmailComment,
        pickAttachments,        
        onAttachmentsChange,    
        removeAttachment,
    };

})();

// Инициализация после загрузки DOM
document.addEventListener('DOMContentLoaded', () => ExchangeModals.init());
