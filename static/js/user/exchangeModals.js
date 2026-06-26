// exchangeModals.js — модальные окна отправки через Exchange EWS
// Заменяет Outlook COM. Подключается в index-user.html после userApp.js.

// ── Kerberos lock ──────────────────────────────────────────────────────────
// Kerberos hidden by default to avoid confusing users.
// Press Ctrl+Alt+K to reveal it (state persists in localStorage).
(function _initKerberosLock() {
    window._kerberosUnlocked = localStorage.getItem('krb_unlocked') === '1';

    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.altKey && (e.key === 'k' || e.key === 'K')) {
            window._kerberosUnlocked = !window._kerberosUnlocked;
            localStorage.setItem('krb_unlocked', window._kerberosUnlocked ? '1' : '0');
            const msg = window._kerberosUnlocked
                ? 'Kerberos разблокирован — откройте настройки подключения'
                : 'Kerberos скрыт';
            if (typeof Toast !== 'undefined') Toast.info(msg);
            else alert(msg);
        }
    });
}());
// ──────────────────────────────────────────────────────────────────────────

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

    // ─── Кастомный пикер даты/времени → см. js/dateTimePicker.js ─────────────

    let _emailDtp = null;   // экземпляр пикера для модалки письма

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
                <button id="settings-tab-exchange" type="button" class="library-subtab active">Отправка</button>
                <button id="settings-tab-repository" type="button" class="library-subtab">Репозиторий</button>
              </div>

              <div id="settings-pane-exchange" class="exchange-settings-pane is-active">
                <input type="hidden" id="exc-auth-type" value="ntlm">

                <!-- Переключатель канала -->
                <div class="exc-field">
                  <label class="exc-label">Канал отправки</label>
                  <div class="exc-channel-switch">
                    <button type="button" class="exc-channel-btn active" id="exc-ch-btn-exchange"
                            onclick="ExchangeModals._switchSettingsChannel('exchange')">📧 Exchange EWS</button>
                    <button type="button" class="exc-channel-btn" id="exc-ch-btn-smtp"
                            onclick="ExchangeModals._switchSettingsChannel('smtp')">📨 SMTP</button>
                  </div>
                </div>

                <!-- ── Exchange ── -->
                <div id="exc-channel-block-exchange">
                  <div class="exc-field">
                    <label class="exc-label">Сервер Exchange</label>
                    <input id="exc-server" type="text" class="exc-input"
                           placeholder="mail.company.ru" autocomplete="off">
                  </div>

                  <div id="exc-kerberos-badge" class="exc-kerberos-badge" style="display:none;">
                    <span>🔒 Kerberos-тикет обнаружен — логин и пароль не требуются</span>
                    <button type="button" class="exc-link-btn"
                            onclick="ExchangeModals._showNtlmFields()">Использовать NTLM</button>
                  </div>

                  <div id="exc-krb-realm-field" class="exc-field" style="display:none;">
                    <label class="exc-label">
                      Kerberos Realm
                      <span class="exc-hint"> (например: RT.RU)</span>
                    </label>
                    <div style="display:flex;gap:6px;align-items:center">
                      <input id="exc-krb-realm" type="text" class="exc-input"
                             placeholder="RT.RU" autocomplete="off"
                             style="flex:1;min-width:0;text-transform:uppercase">
                      <button type="button" class="exc-btn exc-btn--secondary"
                              style="white-space:nowrap;flex-shrink:0"
                              onclick="ExchangeModals._detectRealm()">
                        Определить
                      </button>
                    </div>
                  </div>

                  <div id="exc-ntlm-fields">
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
                </div>

                <!-- ── SMTP ── -->
                <div id="exc-channel-block-smtp" style="display:none">
                  <div style="display:flex;gap:10px">
                    <div class="exc-field" style="flex:2">
                      <label class="exc-label">Хост</label>
                      <input id="smtp-host" type="text" class="exc-input"
                             placeholder="10.20.1.50" autocomplete="off">
                    </div>
                    <div class="exc-field" style="flex:1">
                      <label class="exc-label">Порт</label>
                      <select id="smtp-port" class="exc-input">
                        <option value="587">587 (TLS)</option>
                        <option value="25">25 (Plain)</option>
                      </select>
                    </div>
                  </div>
                  <div class="exc-field">
                    <label class="exc-label">Логин</label>
                    <input id="smtp-username" type="text" class="exc-input"
                           placeholder="smtp_user" autocomplete="off">
                  </div>
                  <div class="exc-field">
                    <label class="exc-label">Пароль</label>
                    <input id="smtp-password" type="password" class="exc-input"
                           placeholder="••••••••" autocomplete="new-password">
                  </div>
                  <div class="exc-field">
                    <label class="exc-label">Email отправителя</label>
                    <input id="smtp-from-email" type="text" class="exc-input"
                           placeholder="noreply@corp.ru" autocomplete="email">
                  </div>
                  <div class="exc-field">
                    <label class="exc-label">
                      Дополнительные ящики
                      <span class="exc-hint"> (через запятую, необязательно)</span>
                    </label>
                    <input id="smtp-senders" type="text" class="exc-input"
                           placeholder="bulk1@rt.ru, bulk2@rt.ru">
                  </div>

                  <div class="exc-smtp-section-title">Дополнительно</div>

                  <!-- IMAP -->
                  <div class="exc-toggle-row">
                    <div>
                      <div class="exc-label">Сохранять в "Отправленные" (IMAP)</div>
                      <div class="exc-hint">Копирует письма в папку Sent на сервере</div>
                    </div>
                    <label class="exc-toggle">
                      <input type="checkbox" id="smtp-imap-enabled"
                             onchange="ExchangeModals._toggleSmtpImap()">
                      <span class="exc-toggle-track"></span>
                    </label>
                  </div>
                  <div id="smtp-imap-block" style="display:none">
                    <div class="exc-smtp-collapse">
                      <div style="display:flex;gap:10px">
                        <div class="exc-field" style="flex:2">
                          <label class="exc-label">IMAP Хост</label>
                          <input id="smtp-imap-host" type="text" class="exc-input" placeholder="10.20.1.50">
                        </div>
                        <div class="exc-field" style="flex:1">
                          <label class="exc-label">Порт</label>
                          <select id="smtp-imap-port" class="exc-input">
                            <option value="993">993 (SSL)</option>
                            <option value="143">143 (TLS)</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- Задержка -->
                  <div class="exc-toggle-row">
                    <div>
                      <div class="exc-label">Задержка между письмами</div>
                      <div class="exc-hint">Снижает нагрузку при больших рассылках</div>
                    </div>
                    <label class="exc-toggle">
                      <input type="checkbox" id="smtp-delay-enabled"
                             onchange="ExchangeModals._toggleSmtpDelay()">
                      <span class="exc-toggle-track"></span>
                    </label>
                  </div>
                  <div id="smtp-delay-block" style="display:none">
                    <div class="exc-smtp-collapse">
                      <div class="exc-field">
                        <label class="exc-label">Секунд между письмами</label>
                        <input id="smtp-delay-seconds" type="number" class="exc-input"
                               value="1" min="0" max="60" style="width:100px">
                      </div>
                    </div>
                  </div>
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
                <div class="exc-drop-wrap" style="position:relative;display:flex;align-items:center;gap:6px">
                  <textarea id="email-to" class="exc-input exc-input--textarea exc-drop-target"
                            data-drop-target="email-to" style="flex:1;min-width:0;width:auto"
                            placeholder="a@rt.ru, b@rt.ru — или перетащите .xlsx / .ods"></textarea>
                  <div class="exc-drag-hint" style="display:none;position:absolute;top:0;right:40px;bottom:0;left:0;border-radius:8px;background:rgba(167,139,250,.07);border:1.5px dashed #a78bfa;pointer-events:none;align-items:center;justify-content:center;gap:6px;color:#c4b5fd;font-size:12px"><svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> Отпустите файл</div>
                  <button type="button" class="exc-pick-btn" title="Выбрать файл" onclick="ExchangeModals._pickXlsx('email-to')" style="flex-shrink:0;width:34px;height:34px;align-self:center;background:var(--exchange-field-bg,#0f1e38);border:1.5px solid var(--exchange-modal-border,#2a3f5f);border-radius:8px;color:#8ba3c7;cursor:pointer;display:flex;align-items:center;justify-content:center"><svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></button>
                  <input type="file" id="xlsx-pick-email-to" accept=".xlsx,.ods,.xls,.csv" style="display:none">
                </div>
              </div>

              <div class="exc-field">
                <label class="exc-label">Копия</label>
                <div class="exc-drop-wrap" style="position:relative;display:flex;align-items:center;gap:6px">
                  <input id="email-cc" type="text" class="exc-input exc-drop-target" data-drop-target="email-cc"
                         style="flex:1;min-width:0;width:auto"
                         placeholder="cc@rt.ru — или перетащите .xlsx / .ods">
                  <div class="exc-drag-hint" style="display:none;position:absolute;top:0;right:40px;bottom:0;left:0;border-radius:8px;background:rgba(167,139,250,.07);border:1.5px dashed #a78bfa;pointer-events:none;align-items:center;justify-content:center;gap:6px;color:#c4b5fd;font-size:12px"><svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> Отпустите файл</div>
                  <button type="button" class="exc-pick-btn" title="Выбрать файл" onclick="ExchangeModals._pickXlsx('email-cc')" style="flex-shrink:0;width:34px;height:34px;align-self:center;background:var(--exchange-field-bg,#0f1e38);border:1.5px solid var(--exchange-modal-border,#2a3f5f);border-radius:8px;color:#8ba3c7;cursor:pointer;display:flex;align-items:center;justify-content:center"><svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></button>
                  <input type="file" id="xlsx-pick-email-cc" accept=".xlsx,.ods,.xls,.csv" style="display:none">
                </div>
              </div>

              <div class="exc-field">
                <label class="exc-label">
                  Скрытая копия
                  <span class="exc-hint"> (адреса скрыты от получателей)</span>
                </label>
                <div class="exc-drop-wrap" style="position:relative;display:flex;align-items:center;gap:6px">
                  <input id="email-bcc" type="text" class="exc-input exc-drop-target" data-drop-target="email-bcc"
                         style="flex:1;min-width:0;width:auto"
                         placeholder="bcc@rt.ru — или перетащите .xlsx / .ods">
                  <div class="exc-drag-hint" style="display:none;position:absolute;top:0;right:40px;bottom:0;left:0;border-radius:8px;background:rgba(167,139,250,.07);border:1.5px dashed #a78bfa;pointer-events:none;align-items:center;justify-content:center;gap:6px;color:#c4b5fd;font-size:12px"><svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> Отпустите файл</div>
                  <button type="button" class="exc-pick-btn" title="Выбрать файл" onclick="ExchangeModals._pickXlsx('email-bcc')" style="flex-shrink:0;width:34px;height:34px;align-self:center;background:var(--exchange-field-bg,#0f1e38);border:1.5px solid var(--exchange-modal-border,#2a3f5f);border-radius:8px;color:#8ba3c7;cursor:pointer;display:flex;align-items:center;justify-content:center"><svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></button>
                  <input type="file" id="xlsx-pick-email-bcc" accept=".xlsx,.ods,.xls,.csv" style="display:none">
                </div>
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

              <!-- Дополнительные настройки -->
              <div class="exc-extra-accordion" id="email-extra-accordion">
                <button type="button" class="exc-extra-trigger" id="email-extra-trigger"
                        onclick="ExchangeModals._toggleEmailExtra()">
                  <span>⚙ Дополнительные настройки</span>
                  <svg class="exc-extra-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                <div class="exc-extra-body" id="email-extra-body" style="display:none">

                  <div class="exc-field">
                    <label class="exc-label">Важность письма</label>
                    <div class="bm-importance-seg" id="email-importance">
                      <button type="button" class="bm-imp-btn" data-val="low">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"/></svg> Низкая
                      </button>
                      <button type="button" class="bm-imp-btn bm-imp-active" data-val="normal">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="2"/></svg> Обычная
                      </button>
                      <button type="button" class="bm-imp-btn" data-val="high">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg> Высокая
                      </button>
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

                  <hr style="border:none;border-top:1px solid var(--border-color,#2e3a52);margin:4px 0">

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

              <div class="exc-field exc-field--comment">
                <label class="exc-comment-toggle">
                  <input type="checkbox" id="email-review-toggle">
                  <span class="exc-comment-toggle__label">На согласование</span>
                </label>
                <div id="email-review-hint" style="display:none;margin-top:6px;padding:6px 10px;
                     border-radius:6px;background:rgba(139,92,246,.1);border:1px solid rgba(139,92,246,.25);
                     font-size:11px;color:var(--text-muted,#9ca3af);line-height:1.5">
                  К письму будет приложен файл <strong>template_review.json</strong>.
                  Получатель сможет открыть его в приложении для редактирования.
                </div>
              </div>

              <div class="exc-field exc-field--comment">
                <label class="exc-comment-toggle">
                  <input type="checkbox" id="email-schedule-toggle">
                  <span class="exc-comment-toggle__label">Отложенная отправка</span>
                </label>
                <div id="email-dtp-wrapper" style="display:none;margin-top:8px">
                  <!-- кастомный пикер вставляется сюда при инициализации -->
                </div>
                <input type="hidden" id="email-send-at">
              </div>

                </div><!-- /exc-extra-body -->
              </div><!-- /exc-extra-accordion -->

            </div>
            <div class="exc-footer">
              <button class="exc-btn exc-btn--secondary" onclick="ExchangeModals.closeEmail()">Отмена</button>
              <button id="email-send-btn" class="exc-btn exc-btn--primary"
                      onclick="ExchangeModals.sendEmail()">Отправить</button>
            </div>
          </div>
        </div>`);

        // Важность — клики
        _q('email-importance')?.querySelectorAll('.bm-imp-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                _q('email-importance').querySelectorAll('.bm-imp-btn')
                    .forEach(b => b.classList.remove('bm-imp-active'));
                btn.classList.add('bm-imp-active');
            });
        });

        // Слушатель «На согласование»
        _q('email-review-toggle')?.addEventListener('change', function () {
            const hint = _q('email-review-hint');
            if (hint) hint.style.display = this.checked ? 'block' : 'none';
        });

        // Слушатель «Отложенная отправка» — программно, без inline-хандлера
        _q('email-schedule-toggle')?.addEventListener('change', function () {
            _onScheduleToggle(this.checked);
        });
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
                <div class="exc-drop-wrap" style="position:relative;display:flex;align-items:center;gap:6px">
                  <textarea id="meeting-to" class="exc-input exc-input--textarea exc-drop-target"
                            data-drop-target="meeting-to" style="flex:1;min-width:0;width:auto"
                            placeholder="a@rt.ru, b@rt.ru — или перетащите .xlsx / .ods"></textarea>
                  <div class="exc-drag-hint" style="display:none;position:absolute;top:0;right:40px;bottom:0;left:0;border-radius:8px;background:rgba(167,139,250,.07);border:1.5px dashed #a78bfa;pointer-events:none;align-items:center;justify-content:center;gap:6px;color:#c4b5fd;font-size:12px"><svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> Отпустите файл</div>
                  <button type="button" class="exc-pick-btn" title="Выбрать файл" onclick="ExchangeModals._pickXlsx('meeting-to')" style="flex-shrink:0;width:34px;height:34px;align-self:center;background:var(--exchange-field-bg,#0f1e38);border:1.5px solid var(--exchange-modal-border,#2a3f5f);border-radius:8px;color:#8ba3c7;cursor:pointer;display:flex;align-items:center;justify-content:center"><svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></button>
                  <input type="file" id="xlsx-pick-meeting-to" accept=".xlsx,.ods,.xls,.csv" style="display:none">
                </div>
              </div>

              <div class="exc-field">
                <label class="exc-label">
                  Скрытая копия
                  <span class="exc-hint"> (адреса скрыты)</span>
                </label>
                <div class="exc-drop-wrap" style="position:relative;display:flex;align-items:center;gap:6px">
                  <input id="meeting-bcc" type="text" class="exc-input exc-drop-target" data-drop-target="meeting-bcc"
                         style="flex:1;min-width:0;width:auto"
                         placeholder="bcc@rt.ru — или перетащите .xlsx / .ods">
                  <div class="exc-drag-hint" style="display:none;position:absolute;top:0;right:40px;bottom:0;left:0;border-radius:8px;background:rgba(167,139,250,.07);border:1.5px dashed #a78bfa;pointer-events:none;align-items:center;justify-content:center;gap:6px;color:#c4b5fd;font-size:12px"><svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> Отпустите файл</div>
                  <button type="button" class="exc-pick-btn" title="Выбрать файл" onclick="ExchangeModals._pickXlsx('meeting-bcc')" style="flex-shrink:0;width:34px;height:34px;align-self:center;background:var(--exchange-field-bg,#0f1e38);border:1.5px solid var(--exchange-modal-border,#2a3f5f);border-radius:8px;color:#8ba3c7;cursor:pointer;display:flex;align-items:center;justify-content:center"><svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></button>
                  <input type="file" id="xlsx-pick-meeting-bcc" accept=".xlsx,.ods,.xls,.csv" style="display:none">
                </div>
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

    function _applyAuthTypeUI(isKerberos) {
        // Force NTLM when Kerberos has not been unlocked via Ctrl+Alt+K
        if (!window._kerberosUnlocked) isKerberos = false;

        const ntlmFields = _q('exc-ntlm-fields');
        const badge      = _q('exc-kerberos-badge');
        const authInput  = _q('exc-auth-type');
        const realmField = _q('exc-krb-realm-field');
        if (ntlmFields)  ntlmFields.style.display  = isKerberos ? 'none' : '';
        if (badge)       badge.style.display        = isKerberos ? ''     : 'none';
        if (authInput)   authInput.value            = isKerberos ? 'kerberos' : 'ntlm';
        if (realmField)  realmField.style.display   = isKerberos ? ''     : 'none';
    }

    function _toggleEmailExtra() {
        const body    = _q('email-extra-body');
        const trigger = _q('email-extra-trigger');
        if (!body) return;
        const open = body.style.display !== 'none';
        body.style.display = open ? 'none' : '';
        trigger?.classList.toggle('exc-extra-open', !open);
    }

    function _switchSettingsChannel(ch) {
        const isSmtp = ch === 'smtp';
        const btnEx  = _q('exc-ch-btn-exchange');
        const btnSm  = _q('exc-ch-btn-smtp');
        const blkEx  = _q('exc-channel-block-exchange');
        const blkSm  = _q('exc-channel-block-smtp');
        if (btnEx)  btnEx.classList.toggle('active', !isSmtp);
        if (btnSm)  btnSm.classList.toggle('active', isSmtp);
        if (blkEx)  blkEx.style.display = isSmtp ? 'none' : '';
        if (blkSm)  blkSm.style.display = isSmtp ? '' : 'none';
    }

    function _toggleSmtpImap() {
        const on = _q('smtp-imap-enabled') && _q('smtp-imap-enabled').checked;
        const block = _q('smtp-imap-block');
        if (block) block.style.display = on ? '' : 'none';
    }

    function _toggleSmtpDelay() {
        const on = _q('smtp-delay-enabled') && _q('smtp-delay-enabled').checked;
        const block = _q('smtp-delay-block');
        if (block) block.style.display = on ? '' : 'none';
    }

    function _showNtlmFields() {
        _applyAuthTypeUI(false);
        _updateSettingsDirtyState();
    }

    async function _detectRealm() {
        const server = (_q('exc-server').value || '').trim();
        if (!server) {
            if (typeof Toast !== 'undefined') Toast.warning('Сначала укажите сервер Exchange');
            return;
        }
        const btn = document.querySelector('#exc-krb-realm-field button');
        const orig = btn ? btn.textContent : '';
        if (btn) btn.textContent = '…';
        try {
            const resp = await fetch(`/api/credentials/detect-realm?server=${encodeURIComponent(server)}`);
            const data = await resp.json();
            if (data.realm) {
                _q('exc-krb-realm').value = data.realm;
                const src = data.source === 'klist' ? 'из klist' : 'по имени хоста';
                if (typeof Toast !== 'undefined') Toast.success(`Realm определён ${src}: ${data.realm}`);
            } else {
                if (typeof Toast !== 'undefined') Toast.warning('Не удалось определить realm');
            }
        } catch (e) {
            if (typeof Toast !== 'undefined') Toast.error('Ошибка: ' + e.message);
        } finally {
            if (btn) btn.textContent = orig;
        }
    }

    async function openCredentials() {
        _open('exchange-credentials-modal');
        _setActiveSettingsTab('exchange');

        const [status, authDetect] = await Promise.all([
            _loadCredentialsStatus(true),
            fetch('/api/credentials/detect-auth')
                .then(r => r.json())
                .catch(() => ({ kerberos: false })),
            _loadAppSettings(true).catch(error => {
                _showRepoResult(error.message || 'Не удалось загрузить настройки репозитория', 'error');
            }),
        ]);

        if (status.exists) {
            if (status.server)     _q('exc-server').value     = status.server;
            if (status.username)   _q('exc-username').value   = status.username;
            if (status.from_email) _q('exc-from-email').value = status.from_email;
            else                   _q('exc-from-email').value = '';
            const senders = status.default_senders || [];
            _q('exc-senders').value = senders.join(', ');

            // SMTP fields
            if (_q('smtp-host')) _q('smtp-host').value = status.smtp_host || '';
            if (_q('smtp-port')) _q('smtp-port').value = String(status.smtp_port || 587);
            if (_q('smtp-username')) _q('smtp-username').value = status.smtp_username || '';
            if (_q('smtp-from-email')) _q('smtp-from-email').value = status.smtp_from_email || '';
            if (_q('smtp-senders')) _q('smtp-senders').value = (status.smtp_default_senders || []).join(', ');
            if (_q('smtp-imap-enabled')) {
                _q('smtp-imap-enabled').checked = !!status.smtp_imap_enabled;
                ExchangeModals._toggleSmtpImap();
            }
            if (_q('smtp-imap-host')) _q('smtp-imap-host').value = status.smtp_imap_host || '';
            if (_q('smtp-imap-port')) _q('smtp-imap-port').value = String(status.smtp_imap_port || 993);
            if (_q('smtp-delay-enabled')) {
                _q('smtp-delay-enabled').checked = !!status.smtp_delay_enabled;
                ExchangeModals._toggleSmtpDelay();
            }
            if (_q('smtp-delay-seconds')) _q('smtp-delay-seconds').value = status.smtp_delay_seconds || 1;
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

        // Kerberos is hidden unless the user has unlocked it (Ctrl+Alt+K).
        // When locked, always show NTLM fields regardless of saved preference or auto-detection.
        const savedIsKerberos = (status.auth_type || 'ntlm') === 'kerberos';
        const kerberosAvailable = authDetect && authDetect.kerberos === true;
        const wantKerberos = window._kerberosUnlocked
            && (savedIsKerberos || (!status.auth_type && kerberosAvailable));
        _applyAuthTypeUI(wantKerberos);

        // Restore saved Kerberos realm
        const realmInput = _q('exc-krb-realm');
        if (realmInput) realmInput.value = status.krb_realm || '';

        _q('exc-test-result').style.display = 'none';

        // Track changes to toggle Save ↔ Close button label.
        const watchedIds = ['exc-server', 'exc-username', 'exc-password', 'exc-from-email', 'exc-senders', 'exc-krb-realm',
                            'smtp-host', 'smtp-port', 'smtp-username', 'smtp-password', 'smtp-from-email', 'smtp-senders',
                            'smtp-imap-host', 'smtp-imap-port', 'smtp-delay-seconds'];
        watchedIds.forEach(id => {
            const el = _q(id);
            if (el) el.addEventListener('input', _updateSettingsDirtyState);
        });
        // Чекбоксы/select тоже должны триггерить dirty
        ['smtp-imap-enabled', 'smtp-delay-enabled', 'smtp-port', 'smtp-imap-port'].forEach(id => {
            const el = _q(id);
            if (el) el.addEventListener('change', _updateSettingsDirtyState);
        });
        _updateSettingsDirtyState();
    }

    function _getExchangeFormData() {
        const sendersRaw = _q('exc-senders').value.trim();
        const authTypeEl = _q('exc-auth-type');
        const smtpSendersRaw = (_q('smtp-senders') ? _q('smtp-senders').value.trim() : '');
        return {
            server: _q('exc-server').value.trim(),
            username: _q('exc-username').value.trim(),
            password: _q('exc-password').value,
            fromEmail: _q('exc-from-email').value.trim(),
            authType: authTypeEl ? authTypeEl.value : 'ntlm',
            krbRealm: (_q('exc-krb-realm') ? _q('exc-krb-realm').value.trim().toUpperCase() : ''),
            defaultSenders: sendersRaw
                ? sendersRaw.split(',').map(s => s.trim()).filter(Boolean)
                : [],
            // SMTP
            smtpHost:         _q('smtp-host')         ? _q('smtp-host').value.trim() : '',
            smtpPort:         _q('smtp-port')         ? parseInt(_q('smtp-port').value) : 587,
            smtpUsername:     _q('smtp-username')     ? _q('smtp-username').value.trim() : '',
            smtpPassword:     _q('smtp-password')     ? _q('smtp-password').value : '',
            smtpFromEmail:    _q('smtp-from-email')   ? _q('smtp-from-email').value.trim() : '',
            smtpDefaultSenders: smtpSendersRaw
                ? smtpSendersRaw.split(',').map(s => s.trim()).filter(Boolean)
                : [],
            smtpImapEnabled:  _q('smtp-imap-enabled') ? _q('smtp-imap-enabled').checked : false,
            smtpImapHost:     _q('smtp-imap-host')    ? _q('smtp-imap-host').value.trim() : '',
            smtpImapPort:     _q('smtp-imap-port')    ? parseInt(_q('smtp-imap-port').value) : 993,
            smtpDelayEnabled: _q('smtp-delay-enabled') ? _q('smtp-delay-enabled').checked : false,
            smtpDelaySeconds: _q('smtp-delay-seconds') ? parseFloat(_q('smtp-delay-seconds').value) : 1,
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
        if ((status.auth_type || 'ntlm') !== (data.authType || 'ntlm')) return true;
        if (currentSenders.length !== nextSenders.length) return true;
        if (currentSenders.some((v, i) => v !== nextSenders[i])) return true;

        // SMTP fields
        if ((status.smtp_host     || '') !== (data.smtpHost     || '')) return true;
        if ((status.smtp_port     || 587) !== (data.smtpPort    || 587)) return true;
        if ((status.smtp_username || '') !== (data.smtpUsername || '')) return true;
        if ((status.smtp_from_email || '') !== (data.smtpFromEmail || '')) return true;
        if (data.smtpPassword) return true;
        if (!!status.smtp_imap_enabled  !== !!data.smtpImapEnabled)  return true;
        if (!!status.smtp_delay_enabled !== !!data.smtpDelayEnabled) return true;
        if ((status.smtp_imap_host  || '') !== (data.smtpImapHost  || '')) return true;
        if ((status.smtp_imap_port  || 993) !== (data.smtpImapPort || 993)) return true;
        if ((status.smtp_delay_seconds || 1) !== (data.smtpDelaySeconds || 1)) return true;
        const curSmtpSenders = Array.isArray(status.smtp_default_senders) ? status.smtp_default_senders : [];
        const nxtSmtpSenders = Array.isArray(data.smtpDefaultSenders)     ? data.smtpDefaultSenders     : [];
        if (curSmtpSenders.length !== nxtSmtpSenders.length) return true;
        if (curSmtpSenders.some((v, i) => v !== nxtSmtpSenders[i])) return true;

        return false;
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
        const authTypeEl = _q('exc-auth-type');
        const authType = authTypeEl ? authTypeEl.value : 'ntlm';

        if (!server || !fromEmail) {
            _showTestResult('Заполните поля: сервер, адрес отправителя', 'error');
            return;
        }
        if (authType !== 'kerberos' && !username) {
            _showTestResult('Заполните поле: логин', 'error');
            return;
        }

        _setLoading('exc-test-btn', true, 'Проверяю...');
        _showTestResult('Подключение к серверу...', 'info');
        try {
            const r = await fetch('/api/credentials/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ server, username, password,
                                       from_email: fromEmail, auth_type: authType }),
            });
            const data = await r.json();
            if (data.success) {
                _showTestResult('Подключение успешно', 'success');
            } else {
                _showTestResult(data.error || 'Ошибка подключения', 'error');
            }
        } catch {
            _showTestResult('Нет связи с сервером приложения', 'error');
        } finally {
            _setLoading('exc-test-btn', false, 'Проверить');
        }
    }

    function _showTestResult(text, type) {
        const el = _q('exc-test-result');
        el.style.display = '';
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
        const data = _getExchangeFormData();
        const {
            server, username, password, fromEmail, authType, krbRealm, defaultSenders,
            smtpHost, smtpPort, smtpUsername, smtpPassword, smtpFromEmail,
            smtpDefaultSenders, smtpImapEnabled, smtpImapHost, smtpImapPort,
            smtpDelayEnabled, smtpDelaySeconds,
        } = data;

        const isDirty = _isExchangeFormDirty(data);

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
                    default_senders: defaultSenders,
                    auth_type: authType,
                    krb_realm: krbRealm,
                    // SMTP
                    smtp_host:             smtpHost,
                    smtp_port:             smtpPort,
                    smtp_username:         smtpUsername,
                    smtp_password:         smtpPassword,
                    smtp_from_email:       smtpFromEmail,
                    smtp_default_senders:  smtpDefaultSenders,
                    smtp_imap_enabled:     smtpImapEnabled,
                    smtp_imap_host:        smtpImapHost,
                    smtp_imap_port:        smtpImapPort,
                    smtp_delay_enabled:    smtpDelayEnabled,
                    smtp_delay_seconds:    smtpDelaySeconds,
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

        // Инициализируем кастомный пикер при первом открытии
        if (!_emailDtp) {
            _emailDtp = initDateTimePicker('email-dtp-wrapper', 'email-send-at');
        }
    }

    function _onScheduleToggle(checked) {
        const wrapper = _q('email-dtp-wrapper');
        if (wrapper) wrapper.style.display = checked ? 'block' : 'none';
        if (!checked && _emailDtp) _emailDtp.clear();
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
        // Reset review toggle
        const reviewTgl  = _q('email-review-toggle');
        const reviewHint = _q('email-review-hint');
        if (reviewTgl)  reviewTgl.checked = false;
        if (reviewHint) reviewHint.style.display = 'none';
        // Reset schedule toggle and picker
        const schedTgl = _q('email-schedule-toggle');
        if (schedTgl) schedTgl.checked = false;
        _onScheduleToggle(false);
        // При следующем открытии пикер пересоздастся — убираем старый дропдаун с body
        if (_emailDtp) { _emailDtp.destroy(); _emailDtp = null; }
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

    // ─── Вспомогательные функции для «На согласование» ───────────────────────

    /** Конвертирует строку в base64 с поддержкой UTF-8 / кириллицы */
    function _utf8ToBase64(str) {
        const bytes = new TextEncoder().encode(str);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        return btoa(binary);
    }

    /**
     * Рекурсивно обходит блоки и заменяет localhost-URL изображений на data:base64.
     * Нужно чтобы согласующий видел картинки на своей машине.
     */
    async function _resolveBlockImages(blocks) {
        const localhostRe = /^https?:\/\/(localhost|127\.0\.0\.1):\d+\//;

        async function toDataUrl(url) {
            try {
                const resp = await fetch(url);
                if (!resp.ok) return url;
                const blob = await resp.blob();
                return await new Promise((res, rej) => {
                    const reader = new FileReader();
                    reader.onload  = () => res(reader.result);
                    reader.onerror = () => res(url);
                    reader.readAsDataURL(blob);
                });
            } catch { return url; }
        }

        async function walk(node) {
            if (!node || typeof node !== 'object') return;
            for (const key of Object.keys(node)) {
                const val = node[key];
                if (typeof val === 'string' && localhostRe.test(val)) {
                    node[key] = await toDataUrl(val);
                } else if (val && typeof val === 'object') {
                    await walk(val);
                }
            }
        }

        for (const block of blocks) await walk(block);
    }

    /** Собирает JSON-вложение для согласования. Возвращает объект { name, content, mime_type } */
    async function _buildReviewAttachment(subject) {
        // Берём блоки из текущего состояния редактора
        let blocks;
        if (typeof UserAppState !== 'undefined' && UserAppState.blocks?.length) {
            blocks = JSON.parse(JSON.stringify(UserAppState.blocks));
        } else if (typeof AppState !== 'undefined' && AppState.blocks?.length) {
            blocks = JSON.parse(JSON.stringify(AppState.blocks));
        }
        if (!blocks?.length) return null;

        await _resolveBlockImages(blocks);

        const payload = {
            version:     '1.0',
            source:      'review',
            subject:     subject,
            exported_at: new Date().toISOString(),
            blocks,
        };

        const jsonStr = JSON.stringify(payload);
        const b64     = _utf8ToBase64(jsonStr);

        // Предупреждение если вложение тяжёлое (>4 МБ)
        const sizeMb = (b64.length * 0.75 / 1024 / 1024).toFixed(1);
        if (parseFloat(sizeMb) > 4) {
            Toast.warning(`Файл согласования весит ~${sizeMb} МБ — убедитесь что Exchange не режет вложения`);
        }

        const safeName = (subject || 'letter').replace(/[^\wа-яёА-ЯЁ]/gi, '_').slice(0, 40);
        return {
            name:      `review_${safeName}.json`,
            content:   b64,
            mime_type: 'application/json',
        };
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

        const commentOn   = _q('email-comment-toggle')?.checked;
        const commentText = commentOn ? (_q('email-comment-text')?.value || '') : '';

        const isReview   = _q('email-review-toggle')?.checked || false;

        const scheduleOn = _q('email-schedule-toggle')?.checked || false;
        const sendAtVal  = scheduleOn ? (_emailDtp?.getValue() || '') : '';
        if (scheduleOn) {
            if (!sendAtVal) {
                Toast.warning('Выберите дату и время отложенной отправки');
                return;
            }
            if (new Date(sendAtVal) <= new Date()) {
                Toast.warning('Дата отложенной отправки должна быть в будущем');
                return;
            }
        }

        const finalSubject = isReview ? `[На согласование] ${subject}` : subject;
        const loadingText  = isReview ? 'Отправка на согласование…'
                           : scheduleOn ? 'Планирование…' : 'Отправить';

        _setLoading('email-send-btn', true, loadingText);
        try {
            const rawHtml = await _generateHtml();
            const html = _injectPreamble(rawHtml, commentText);
            const attachments = await _filesToBase64(_attachments.email);

            // Если «На согласование» — добавляем JSON-вложение с блоками
            if (isReview) {
                const reviewAtt = await _buildReviewAttachment(subject);
                if (reviewAtt) attachments.push(reviewAtt);
            }

            const r = await fetch('/api/send/email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subject: finalSubject, to, cc, bcc,
                                       from_email: fromEmail, html_body: html,
                                       attachments,
                                       send_at:     sendAtVal || null,
                                       timezone:    -(new Date().getTimezoneOffset() / 60),
                                       importance:  _q('email-importance')?.querySelector('.bm-imp-active')?.dataset.val || 'normal',
                                       read_receipt: _q('email-read-receipt')?.checked || false })
            });
            const data = await r.json();
            if (data.success) {
                const successMsg = isReview ? 'Письмо отправлено на согласование'
                                 : (data.message || 'Письмо отправлено');
                Toast.success(successMsg);
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
            const idleText = isReview ? 'Отправить' : scheduleOn ? 'Запланировать' : 'Отправить';
            _setLoading('email-send-btn', false, idleText);
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
                    html_body: html, attachments,
                    timezone: -(new Date().getTimezoneOffset() / 60)
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
            // Дожидаемся рендера canvas-блоков перед генерацией HTML
            if (typeof _ensureCanvasBlocksRendered === 'function') {
                await _ensureCanvasBlocksRendered(UserAppState.blocks);
            }
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
        _initDropTargets();

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

    // ─── Импорт получателей: drag-and-drop на textarea ───────────────────────

    function _initDropTargets() {
        document.querySelectorAll('.exc-drop-wrap').forEach(wrap => {
            const el = wrap.querySelector('.exc-drop-target');
            if (!el) return;
            let dragCounter = 0;

            const hint = wrap.querySelector('.exc-drag-hint');
            const btn  = wrap.querySelector('.exc-pick-btn');

            function _setOver(on) {
                el.classList.toggle('exc-drop-target--over', on);
                if (hint) hint.style.display = on ? 'flex' : 'none';
                if (btn)  btn.style.borderColor = on ? '#a78bfa' : '';
            }

            wrap.addEventListener('dragenter', e => {
                if (![...e.dataTransfer.items].some(i => i.kind === 'file')) return;
                e.preventDefault();
                dragCounter++;
                _setOver(true);
            });
            wrap.addEventListener('dragover', e => {
                if (![...e.dataTransfer.items].some(i => i.kind === 'file')) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
            });
            wrap.addEventListener('dragleave', () => {
                dragCounter--;
                if (dragCounter <= 0) { dragCounter = 0; _setOver(false); }
            });
            wrap.addEventListener('drop', e => {
                e.preventDefault();
                dragCounter = 0;
                _setOver(false);
                const file = e.dataTransfer.files[0];
                if (file) _xlsxProcessFile(file, el.id);
            });
        });
    }

    function _pickXlsx(targetId) {
        const inp = document.getElementById('xlsx-pick-' + targetId);
        if (!inp) return;
        inp.onchange = function () {
            if (inp.files[0]) _xlsxProcessFile(inp.files[0], targetId);
            inp.value = '';
        };
        inp.click();
    }

    async function _xlsxProcessFile(file, targetId) {
        const fd = new FormData();
        fd.append('file', file);
        let data;
        try {
            const resp = await fetch('/api/bulk/parse', { method: 'POST', body: fd });
            data = await resp.json();
            if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
        } catch (e) {
            if (typeof Toast !== 'undefined') Toast.error('Не удалось прочитать файл: ' + e.message);
            return;
        }
        _xlsxProcessParsed(data, targetId);
    }

    // Called from Python (Qt drop) with already-parsed data
    function _xlsxProcessParsed(data, targetId) {
        console.log('[xlsx] _xlsxProcessParsed targetId=', targetId, 'data=', data);
        const headers = data.headers || [];
        const rows    = data.rows   || [];
        if (!headers.length) {
            console.warn('[xlsx] no headers in parsed data');
            if (typeof Toast !== 'undefined') Toast.warning('В файле не найдены столбцы');
            return;
        }
        console.log('[xlsx] headers=', headers, 'rows=', rows.length);
        const emailIdx = headers.findIndex(h => /email|почт|адрес|mail/i.test(h));
        if (headers.length === 1 || emailIdx >= 0) {
            console.log('[xlsx] auto-insert col=', emailIdx >= 0 ? emailIdx : 0);
            _xlsxInsert(rows, headers, emailIdx >= 0 ? emailIdx : 0, targetId, false);
        } else {
            console.log('[xlsx] showing picker');
            _xlsxShowPicker(headers, rows, targetId);
        }
    }

    function _xlsxInsert(rows, headers, colIdx, targetId, append) {
        const header = headers[colIdx];
        const values = rows
            .map(r => (r[header] !== undefined ? r[header] : Object.values(r)[colIdx]) ?? '')
            .map(v => String(v).trim())
            .filter(Boolean);
        if (!values.length) { if (typeof Toast !== 'undefined') Toast.warning('Нет значений в столбце «' + header + '»'); return; }
        const field = document.getElementById(targetId);
        const existing = field.value.trim();
        field.value = append && existing ? existing + ', ' + values.join(', ') : values.join(', ');
        if (typeof Toast !== 'undefined') Toast.success(`Добавлено получателей: ${values.length}`);
    }

    function _xlsxShowPicker(headers, rows, targetId) {
        let popup = document.getElementById('xlsx-picker-popup');
        if (!popup) {
            popup = document.createElement('div');
            popup.id = 'xlsx-picker-popup';
            popup.style.cssText = 'position:fixed;top:0;right:0;bottom:0;left:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5)';
            document.body.appendChild(popup);
            // defer click-to-close so the drop's mouseup doesn't immediately close the popup
            popup.addEventListener('click', e => {
                if (e.target === popup && popup._ready) popup.style.display = 'none';
            });
        }

        // Build DOM without inline handlers (Electron CSP blocks them)
        popup.innerHTML = '';

        const box = document.createElement('div');
        box.style.cssText = 'background:var(--bg-secondary,#1e293b);border:1px solid var(--border-color,#334155);border-radius:12px;padding:20px;width:360px;max-width:95vw;box-shadow:0 16px 48px rgba(0,0,0,.6)';

        const title = document.createElement('div');
        title.style.cssText = 'font-weight:600;font-size:14px;color:var(--text-primary,#f9fafb);margin-bottom:12px';
        title.textContent = 'Выберите столбец с адресами';
        box.appendChild(title);

        const list = document.createElement('div');
        list.style.cssText = 'display:flex;flex-direction:column;gap:6px;max-height:260px;overflow-y:auto;margin-bottom:14px';

        headers.forEach((h, i) => {
            const preview = rows.slice(0, 2).map(r => r[h] ?? '').filter(Boolean).join(', ');
            const lbl = document.createElement('label');
            lbl.style.cssText = 'display:flex;align-items:flex-start;gap:8px;padding:8px 10px;border-radius:7px;cursor:pointer;border:1px solid var(--border-color,#334155);transition:background .1s;background:var(--bg-primary,#0f172a)';
            lbl.addEventListener('mouseenter', () => { lbl.style.background = 'var(--bg-hover,#334155)'; });
            lbl.addEventListener('mouseleave', () => { lbl.style.background = 'var(--bg-primary,#0f172a)'; });

            const radio = document.createElement('input');
            radio.type = 'radio'; radio.name = 'xlsx-col'; radio.value = i;
            radio.checked = i === 0;
            radio.style.cssText = 'margin-top:2px;accent-color:var(--accent-primary,#f97316);cursor:pointer';

            const textWrap = document.createElement('span');
            const nameEl = document.createElement('div');
            nameEl.style.cssText = 'font-size:13px;color:var(--text-primary,#f9fafb)';
            nameEl.textContent = h;
            textWrap.appendChild(nameEl);
            if (preview) {
                const prevEl = document.createElement('div');
                prevEl.style.cssText = 'font-size:11px;color:var(--text-muted,#6b7280);margin-top:2px';
                prevEl.textContent = preview;
                textWrap.appendChild(prevEl);
            }
            lbl.appendChild(radio); lbl.appendChild(textWrap);
            list.appendChild(lbl);
        });
        box.appendChild(list);

        const appendRow = document.createElement('div');
        appendRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:14px';
        const appendChk = document.createElement('input');
        appendChk.type = 'checkbox'; appendChk.id = 'xlsx-picker-append';
        appendChk.style.cssText = 'cursor:pointer;accent-color:var(--accent-primary,#f97316)';
        const appendLbl = document.createElement('label');
        appendLbl.htmlFor = 'xlsx-picker-append';
        appendLbl.style.cssText = 'font-size:12px;color:var(--text-muted,#9ca3af);cursor:pointer';
        appendLbl.textContent = 'Добавить к существующим';
        appendRow.appendChild(appendChk); appendRow.appendChild(appendLbl);
        box.appendChild(appendRow);

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;gap:8px;justify-content:flex-end';
        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button'; cancelBtn.className = 'exc-btn exc-btn--secondary';
        cancelBtn.textContent = 'Отмена';
        cancelBtn.addEventListener('click', () => { popup.style.display = 'none'; });
        const applyBtn = document.createElement('button');
        applyBtn.type = 'button'; applyBtn.className = 'exc-btn exc-btn--primary';
        applyBtn.textContent = 'Применить';
        applyBtn.addEventListener('click', () => _xlsxPickerApply());
        btnRow.appendChild(cancelBtn); btnRow.appendChild(applyBtn);
        box.appendChild(btnRow);

        popup.appendChild(box);
        popup._headers  = headers;
        popup._rows     = rows;
        popup._targetId = targetId;
        popup._ready    = false;
        popup.style.display = 'flex';
        // allow click-to-close only after 300ms so drop's mouseup doesn't close immediately
        setTimeout(() => { popup._ready = true; }, 300);
    }

    function _xlsxPickerApply() {
        const popup  = document.getElementById('xlsx-picker-popup');
        const colIdx = parseInt(popup.querySelector('input[name="xlsx-col"]:checked')?.value ?? '0', 10);
        const append = popup.querySelector('#xlsx-picker-append')?.checked ?? false;
        _xlsxInsert(popup._rows, popup._headers, colIdx, popup._targetId, append);
        popup.style.display = 'none';
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
        _showNtlmFields,
        _toggleEmailExtra,
        _switchSettingsChannel,
        _toggleSmtpImap,
        _toggleSmtpDelay,
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
        _xlsxPickerApply,
        _xlsxProcessParsed,
        _pickXlsx,
        _detectRealm,
    };

})();

// Инициализация после загрузки DOM
document.addEventListener('DOMContentLoaded', () => ExchangeModals.init());
