/**
 * @fileoverview User page bootstrap: mode switcher, user menu actions, menu
 * state sync, and server heartbeat.  Loaded as the last script in
 * index-user.html so all modules are already available.
 *
 * @module userInit
 */

(function () {
    /**
     * Hide or wire up the mode-switch widget based on /api/mode.
     * Sets data-can-switch on <html> so CSS can react, moves the widget
     * into the toolbar slot, and attaches a click handler that POSTs the
     * mode change and redirects to the admin page.
     *
     * @returns {Promise<void>}
     */
    async function initModeSwitcher() {
        try {
            const r = await fetch('/api/mode');
            const data = await r.json();
            document.documentElement.setAttribute('data-can-switch', data.can_switch ? '1' : '0');
            const widget = document.getElementById('mode-switch-widget');
            const slot = document.getElementById('start-mode-switch-slot');
            if (slot) {
                slot.appendChild(widget);
            }
            if (data.can_switch) {
                widget.hidden = false;
                widget.addEventListener('click', async function () {
                    await fetch('/api/mode', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ mode: 'admin' }),
                    });
                    window.location.href = '/';
                });
            }

            document.querySelectorAll('.user-menu-action--admin').forEach((el) => {
                el.hidden = !data.can_switch;
            });

            document.querySelector('[data-action="switch-mode"]')?.classList.remove('is-checked');
        } catch (_) {}
    }

    /**
     * Wire up the hamburger/user menu actions to their respective buttons
     * and API calls.
     */
    function initUserMenu() {
        document.querySelectorAll('.user-menu-action').forEach((btn) => {
            btn.addEventListener('click', () => {
                if (btn.disabled) return;
                const action = btn.dataset.action;
                if (action === 'create-email') {
                    document.getElementById('btn-send-outlook')?.click();
                } else if (action === 'create-meeting') {
                    document.getElementById('btn-send-meeting')?.click();
                } else if (action === 'save') {
                    document.getElementById('btn-save-personal')?.click();
                } else if (action === 'settings') {
                    document.getElementById('btn-exchange-settings')?.click();
                } else if (action === 'preview') {
                    document.getElementById('btn-preview-user')?.click();
                } else if (action === 'toggle-theme') {
                    const themeBtn =
                        document.getElementById('theme-toggle-btn-user-editor') ||
                        document.getElementById('theme-toggle-btn-user-start');
                    themeBtn?.click();
                } else if (action === 'switch-mode') {
                    document.getElementById('mode-switch-widget')?.click();
                } else if (action === 'about') {
                    alert('Почтелье');
                } else if (action === 'open-log') {
                    fetch('/api/open-log', { method: 'POST' })
                        .then(async (r) => {
                            const data = await r.json().catch(() => ({}));
                            if (!r.ok || !data.success) throw new Error(data.error || 'Не удалось открыть журнал');
                        })
                        .catch((err) => { Toast.error(err.message || 'Не удалось открыть журнал'); });
                } else if (action === 'open-review-json') {
                    document.getElementById('review-json-input')?.click();
                } else if (action === 'exit') {
                    const hasBlocks = UserAppState.blocks && UserAppState.blocks.length > 0;
                    if (hasBlocks) {
                        const save = confirm('Сохранить состояние холста перед выходом?');
                        if (save) saveDraft();
                    }
                    fetch('/api/shutdown', { method: 'POST' }).catch(() => {});
                    window.close();
                }
            });
        });
    }

    /**
     * Enable/disable menu items that require an open document with blocks.
     * Called on DOMContentLoaded and re-exported as window.updateUserMenuState
     * so other modules can trigger a refresh.
     */
    function updateUserMenuState() {
        const screen = document.documentElement.getAttribute('data-user-screen') || 'start';
        const hasBlocks = document.documentElement.getAttribute('data-user-has-blocks') === '1';
        document.querySelectorAll('.user-menu-action--requires-content').forEach((el) => {
            el.disabled = screen !== 'editor' || !hasBlocks;
        });
    }

    document.addEventListener('DOMContentLoaded', initModeSwitcher);
    document.addEventListener('DOMContentLoaded', initUserMenu);
    document.addEventListener('DOMContentLoaded', updateUserMenuState);
    document.addEventListener('DOMContentLoaded', initReviewJsonImport);
    window.updateUserMenuState = updateUserMenuState;
}());

// ─── Импорт JSON согласования ─────────────────────────────────────────────────

function initReviewJsonImport() {

    // ── Загрузка и применение JSON ──────────────────────────────────────────
    async function _loadReviewJson(file) {
        if (!file || !file.name.endsWith('.json')) {
            if (typeof Toast !== 'undefined') Toast.error('Ожидается файл .json');
            return;
        }

        let payload;
        try {
            const text = await file.text();
            payload = JSON.parse(text);
        } catch {
            if (typeof Toast !== 'undefined') Toast.error('Не удалось прочитать JSON файл');
            return;
        }

        // Поддерживаем оба формата: обёрнутый { source, blocks } и сырой массив
        const blocks = Array.isArray(payload) ? payload : payload.blocks;
        if (!Array.isArray(blocks) || !blocks.length) {
            if (typeof Toast !== 'undefined') Toast.error('Файл не содержит блоков шаблона');
            return;
        }

        // Предупреждаем если уже есть несохранённые изменения
        const hasWork = typeof UserAppState !== 'undefined' &&
                        UserAppState.blocks?.length &&
                        UserAppState.isDirty;
        if (hasWork) {
            const ok = confirm('Открыть шаблон из файла согласования?\nТекущие несохранённые изменения будут потеряны.');
            if (!ok) return;
        }

        // Перенумеровываем IDs чтобы избежать конфликтов
        let nextId = 1;
        function reassignIds(blockList) {
            for (const b of blockList) {
                b.id = nextId++;
                if (Array.isArray(b.columns)) {
                    for (const col of b.columns) {
                        if (Array.isArray(col.blocks)) reassignIds(col.blocks);
                    }
                }
            }
        }
        reassignIds(blocks);

        // Загружаем в редактор через реальные функции userApp.js
        const templateName = payload.subject || 'Согласование';

        if (typeof UserAppState !== 'undefined') {
            UserAppState.currentTemplate   = { name: templateName };
            UserAppState.originalBlocks    = JSON.parse(JSON.stringify(blocks));
            UserAppState.blocks            = JSON.parse(JSON.stringify(blocks));
            UserAppState.isDirty           = false;

            // Обновляем заголовок в шапке редактора
            const titleEl = document.getElementById('current-template-name');
            if (titleEl) titleEl.textContent = templateName;

            if (typeof updateUserEditorMeta === 'function') updateUserEditorMeta();
        } else if (typeof AppState !== 'undefined') {
            AppState.blocks = blocks;
        }

        // Переключаемся на редактор и рендерим
        if (typeof switchScreen === 'function') switchScreen('editor');
        if (typeof renderUserCanvas === 'function') renderUserCanvas();
        else if (typeof renderCanvas === 'function') {
            renderCanvas();
            if (typeof renderSettings === 'function') renderSettings();
        }

        const label = payload.subject ? `«${payload.subject}»` : 'шаблон';
        if (typeof Toast !== 'undefined') Toast.success(`Открыт ${label} для редактирования`);
    }

    // ── Кнопка выбора файла ─────────────────────────────────────────────────
    const fileInput = document.getElementById('review-json-input');
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files?.[0];
            if (file) _loadReviewJson(file);
            fileInput.value = '';
        });
    }

    // ── Дроп-зона на стартовом экране ───────────────────────────────────────
    const startScreen = document.getElementById('start-screen');
    if (!startScreen) return;

    // Визуальный оверлей при drag-over JSON файла
    const dropOverlay = document.createElement('div');
    dropOverlay.id = 'review-drop-overlay';
    dropOverlay.style.cssText = `
        display:none; position:absolute; inset:0; z-index:9998;
        background:rgba(139,92,246,.12); border:2px dashed rgba(139,92,246,.6);
        border-radius:12px; pointer-events:none;
        align-items:center; justify-content:center;
        font-size:16px; font-weight:600; color:rgba(139,92,246,.9);
        letter-spacing:.3px;
    `;
    dropOverlay.textContent = 'Отпустите для открытия шаблона согласования';
    startScreen.style.position = 'relative';
    startScreen.appendChild(dropOverlay);

    function isJsonFile(e) {
        return Array.from(e.dataTransfer?.items || [])
            .some(item => item.kind === 'file' &&
                (item.type === 'application/json' || item.getAsFile()?.name?.endsWith('.json')));
    }

    let _dragCounter = 0;
    document.addEventListener('dragenter', (e) => {
        if (!isJsonFile(e)) return;
        e.preventDefault();
        _dragCounter++;
        dropOverlay.style.display = 'flex';
    });
    document.addEventListener('dragleave', () => {
        _dragCounter--;
        if (_dragCounter <= 0) { _dragCounter = 0; dropOverlay.style.display = 'none'; }
    });
    document.addEventListener('dragover', (e) => {
        if (!isJsonFile(e)) return;
        e.preventDefault();
    });
    document.addEventListener('drop', (e) => {
        _dragCounter = 0;
        dropOverlay.style.display = 'none';
        const file = e.dataTransfer?.files?.[0];
        if (file?.name?.endsWith('.json')) {
            e.preventDefault();
            _loadReviewJson(file);
        }
    });
}

// Heartbeat — ping the server every 5 seconds to keep the session alive.
// Fire immediately on load so we don't fall into the watchdog timeout window
// while the page is still rendering.
(function heartbeat() {
    fetch('/api/heartbeat', { method: 'POST' }).catch(() => {});
    setInterval(() => {
        fetch('/api/heartbeat', { method: 'POST' }).catch(() => {});
    }, 5000);
}());

// Ctrl+Alt+H — скопировать HTML письма в буфер обмена,
// Ctrl+Alt+S — скачать файлом «<Название рассылки>.html».
// Реализация общая с admin-режимом (shared/utils.js).
if (typeof setupEmailHtmlShortcuts === 'function') {
    setupEmailHtmlShortcuts(() => generateEmailHTML({ previewTheme: 'light' }));
}
