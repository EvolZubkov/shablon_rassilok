// templatesUI.js - UI для библиотеки шаблонов

/**
 * Show a custom HTML confirmation dialog.
 * Replaces the native window.confirm() to avoid encoding/rendering
 * issues inside QWebEngineView.
 *
 * @param {string} message - Plain text message to display.
 * @returns {Promise<boolean>} Resolves to true when confirmed, false when cancelled.
 */
function decodeHtml(str) {
    return String(str)
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
}

/** Decode HTML entities in template names received from the server. */
function decodeTemplateNames(templates) {
    if (!templates) return templates;
    const decode = (list) => Array.isArray(list)
        ? list.map(t => ({ ...t, name: decodeHtml(t.name || '') }))
        : [];
    return { shared: decode(templates.shared), personal: decode(templates.personal) };
}

function showConfirmDialog(message) {
    return Promise.resolve(window.confirm(message));
}

function showUnsavedChangesDialog(templateName) {
    return new Promise((resolve) => {
        const dlg = document.createElement('dialog');
        dlg.className = 'app-dialog';

        const dialog = document.createElement('div');
        dialog.style.cssText = 'width:100%;';

        const title = document.createElement('h3');
        title.textContent = 'Несохранённые изменения';
        title.style.cssText = 'margin:0 0 16px 0;font-size:18px;color:#f9fafb;font-weight:600;';
        dialog.appendChild(title);

        const text = document.createElement('p');
        text.textContent = `В шаблоне «${templateName}» есть несохранённые изменения. Сохранить их перед выходом?`;
        text.style.cssText = 'margin:0 0 20px 0;font-size:14px;line-height:1.5;color:#cbd5e1;';
        dialog.appendChild(text);

        const actions = document.createElement('div');
        actions.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;';

        const btnCancel = document.createElement('button');
        btnCancel.type = 'button';
        btnCancel.textContent = 'Отмена';
        btnCancel.style.cssText = 'padding:9px 18px;background:#374151;color:#e5e7eb;border:none;border-radius:6px;cursor:pointer;font-size:13px;';

        const btnDiscard = document.createElement('button');
        btnDiscard.type = 'button';
        btnDiscard.textContent = 'Не сохранять';
        btnDiscard.style.cssText = 'padding:9px 18px;background:#475569;color:#e5e7eb;border:none;border-radius:6px;cursor:pointer;font-size:13px;';

        const btnSave = document.createElement('button');
        btnSave.type = 'button';
        btnSave.textContent = 'Сохранить';
        btnSave.style.cssText = 'padding:9px 18px;background:#f97316;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;';

        actions.appendChild(btnCancel);
        actions.appendChild(btnDiscard);
        actions.appendChild(btnSave);
        dialog.appendChild(actions);

        dlg.appendChild(dialog);
        document.body.appendChild(dlg);

        const closeWith = (result) => {
            dlg.close();
            dlg.remove();
            resolve(result);
        };

        btnCancel.addEventListener('click', () => closeWith('cancel'));
        btnDiscard.addEventListener('click', () => closeWith('discard'));
        btnSave.addEventListener('click', () => closeWith('save'));
        dlg.addEventListener('click', (e) => {
            if (e.target === dlg) closeWith('cancel');
        });
        dlg.addEventListener('cancel', (e) => {
            e.preventDefault();
            closeWith('cancel');
        });

        dlg.showModal();
    });
}

function isPresetTemplate(t) {
    // Используем явное поле isPreset (не эмодзи в имени)
    if (!t) return false;
    if (typeof t.isPreset === 'boolean') return t.isPreset;
    // Обратная совместимость: старые шаблоны без поля isPreset
    return typeof t.name === 'string' && t.name.trim().startsWith('🧩');
}

function getTemplateKindLabel(template) {
    return isPresetTemplate(template) ? 'пресет' : 'шаблон';
}

function migrateExpertLite(blocks) {
    const walk = (arr) => (arr || []).map(b => {
        const out = { ...b };

        if (out.type === 'expertLite') {
            out.type = 'expert';
            out.settings = { ...(out.settings || {}), variant: 'lite' };
        } else {
            out.settings = out.settings || {};
        }

        if (out.columns) {
            out.columns = out.columns.map(col => ({
                ...col,
                blocks: walk(col.blocks || [])
            }));
        }

        return out;
    });

    return walk(blocks);
}

function getBlocksForPreset() {
    const topLevel = AppState.blocks || [];
    const idToIndex = new Map(topLevel.map((b, i) => [b.id, i]));

    const getTopLevelOwner = (id) => {
        const direct = topLevel.find(b => b.id === id);
        if (direct) return direct;

        for (const b of topLevel) {
            if (!b.columns) continue;
            for (const col of b.columns) {
                if ((col.blocks || []).some(x => x.id === id)) return b;
            }
        }
        return null;
    };

    let blocks = [];

    if (AppState.multiSelectedBlockIds && AppState.multiSelectedBlockIds.size > 0) {
        const unique = new Map();
        for (const id of AppState.multiSelectedBlockIds.values()) {
            const owner = getTopLevelOwner(id);
            if (owner) unique.set(owner.id, owner);
        }
        blocks = Array.from(unique.values())
            .sort((a, b) => (idToIndex.get(a.id) ?? 0) - (idToIndex.get(b.id) ?? 0));
    } else if (AppState.selectedBlockId != null) {
        const owner = getTopLevelOwner(AppState.selectedBlockId);
        if (owner) blocks = [owner];
    }

    // глубокая копия
    return JSON.parse(JSON.stringify(blocks));
}
const TemplatesUI = {
    panel: null,
    overlay: null,
    list: null,
    searchInput: null,
    isOpen: false,
    templates: { shared: [], personal: [] },
    currentTemplate: null,
    savedSnapshot: null,
    _isAdmin: false,
    _modePromise: null,
    /** ETag from the last successful /api/templates/list response. */
    _etag: null,
    /** setInterval handle for the background shared-template refresh. */
    _refreshTimer: null,
    /** Active scope filter: 'shared' | 'personal' */
    _activeScope: 'shared',
    /** Currently previewed template metadata for quick admin preview. */
    _previewTemplate: null,
    /** Snapshot of blocks rendered inside the shared preview modal. */
    _previewBlocks: null,
    /** Small row-preview popup state for single-click preview. */
    _rowPreviewPopup: null,
    _rowPreviewAnchorEl: null,
    _rowPreviewTemplateKey: null,
    _rowPreviewClickTimer: null,
    _rowPreviewRequestId: 0,

    init() {
        this.panel = document.getElementById('templates-panel');
        this.overlay = document.getElementById('templates-overlay');
        this.list = document.getElementById('templates-list');
        this.searchInput = null; // search is handled by the top sidebar search bar

        // Кнопка открытия/закрытия
        const btnToggle = document.getElementById('btn-toggle-templates');
        if (btnToggle) {
            btnToggle.addEventListener('click', () => {
                this.toggle();
            });
        }

        // Закрытие по клику на overlay
        if (this.overlay) {
            this.overlay.addEventListener('click', () => {
                this.close();
            });
        }

        // Scope tabs (Общие / Личные)
        const scopeTabsContainer = document.getElementById('templates-scope-tabs');
        if (scopeTabsContainer) {
            scopeTabsContainer.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-scope]');
                if (!btn) return;
                scopeTabsContainer.querySelectorAll('.library-subtab').forEach(t => t.classList.remove('active'));
                btn.classList.add('active');
                this._activeScope = btn.dataset.scope;
                this.renderTemplates();
            });
        }

        this._modePromise = this._loadMode();

        // Silently refresh shared templates every 5 minutes so changes made
        // by administrators on the network share become visible without restart.
        this._refreshTimer = setInterval(async () => {
            const result = await TemplatesAPI.getList(this._etag);
            if (!result.unchanged) {
                this.templates = decodeTemplateNames(result.templates);
                this._etag = result.etag;
                if (this.isOpen) this.renderTemplates();
            }
        }, 5 * 60 * 1000);

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeTemplatePreview();
                this.closeRowPreview();
            }
        });
        document.addEventListener('click', (e) => {
            if (!this._rowPreviewPopup) return;
            if (this._rowPreviewPopup.contains(e.target)) return;
            if (this._rowPreviewAnchorEl?.contains(e.target)) return;
            this.closeRowPreview();
        }, true);
        window.addEventListener('resize', () => this._positionRowPreview());
        this.panel?.addEventListener('scroll', () => this.closeRowPreview(), true);

        console.log('✅ TemplatesUI initialized');
    },

    async _loadMode() {
        try {
            const response = await fetch('/api/mode');
            const data = await response.json();
            this._isAdmin = data?.mode === 'admin';
        } catch (_) {
            this._isAdmin = false;
        }
    },

    async open() {
        if (this.isOpen) return;

        if (this._modePromise) {
            await this._modePromise;
        }

        this.isOpen = true;
        this.panel.classList.add('active');
        this.overlay.classList.add('active');

        // Always do a conditional GET on open — the server returns 304 when
        // nothing has changed (ETag match), so the cost is just one HTTP
        // round-trip with an empty body.
        await this.loadTemplates();
    },

    close() {
        if (!this.isOpen) return;

        this.isOpen = false;
        this.panel.classList.remove('active');
        this.overlay.classList.remove('active');
        this.closeTemplatePreview();
        this.closeRowPreview();
    },

    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    },

    /**
     * Show or hide the loading bar at the top of the templates list.
     * On a cold load (no cached data) replaces list content with a full
     * spinner so the user sees something while the panel is empty.
     * On warm loads inserts a non-blocking progress bar above existing content.
     * @param {boolean} on
     * @param {boolean} [cold=false] - true on first ever load (no data yet)
     */
    _setListLoading(on, cold = false) {
        // Remove any existing bar first.
        this.list.querySelector('.templates-loading-bar')?.remove();

        if (!on) return;

        if (cold) {
            this.list.innerHTML = `
                <div class="templates-list-loading">
                    <div class="templates-list-spinner"></div>
                    <span>Загрузка шаблонов\u2026</span>
                </div>`;
            return;
        }

        // Warm load: insert the progress bar without clearing existing content.
        const bar = document.createElement('div');
        bar.className = 'templates-loading-bar';
        this.list.insertAdjacentElement('afterbegin', bar);
    },

    async loadTemplates() {
        // Show a full spinner on cold load (no cached data yet), otherwise
        // show a non-blocking progress bar above existing content.
        const hasData = this._etag !== null
            || this.templates.shared.length > 0
            || this.templates.personal.length > 0;
        this._setListLoading(true, !hasData);

        let result;
        try {
            result = await TemplatesAPI.getList(this._etag);
        } catch (err) {
            this._setListLoading(false);
            this.list.innerHTML = `<div class="templates-empty">Ошибка загрузки шаблонов</div>`;
            return;
        }
        this._setListLoading(false);

        if (result.unchanged) {
            // Server confirmed our data is still current — just re-render.
            this.renderTemplates();
            return;
        }
        this.templates = decodeTemplateNames(result.templates);
        this._etag = result.etag;
        console.log('📚 Загружено шаблонов:', this.templates);
        this.renderTemplates();
    },

    _snapshotBlocks(blocks = AppState.blocks) {
        try {
            return JSON.stringify(blocks || []);
        } catch (_) {
            return null;
        }
    },

    syncSavedSnapshot(blocks = AppState.blocks) {
        this.savedSnapshot = this._snapshotBlocks(blocks);
    },

    hasUnsavedChanges() {
        if (!this.currentTemplate) return false;
        return this.savedSnapshot !== this._snapshotBlocks(AppState.blocks);
    },

    /**
     * Force a full reload from the server by discarding the stored ETag.
     * Use when external changes to the template list are expected
     * (e.g. after an admin updates shared templates on the network share).
     */
    async refresh() {
        this._etag = null;
        await this.loadTemplates();
    },

    renderTemplates(filteredTemplates = null) {
        this.closeRowPreview();
        const source = filteredTemplates || this.templates;
        const scope = this._activeScope;
        const templatesToRender = {
            shared: scope !== 'personal' ? (source.shared || []).filter(t => !isPresetTemplate(t)) : [],
            personal: scope !== 'shared' ? (source.personal || []).filter(t => !isPresetTemplate(t)) : [],
        };

        const totalCount = (templatesToRender.shared.length || 0) + (templatesToRender.personal.length || 0);

        if (totalCount === 0) {
            this.list.innerHTML = `
                <div class="templates-empty">
                    ${filteredTemplates ? 'Ничего не найдено' : 'Нет сохранённых шаблонов'}
                </div>
            `;
            return;
        }

        this.list.innerHTML = '';

        if (templatesToRender.shared.length > 0) {
            // Group by category
            const byCategory = new Map();
            templatesToRender.shared.forEach(t => {
                const cat = t.category || '';
                if (!byCategory.has(cat)) byCategory.set(cat, []);
                byCategory.get(cat).push(t);
            });

            // Named categories first (alphabetically), then uncategorised
            const sortedCats = [...byCategory.keys()].sort((a, b) => {
                if (!a) return 1;
                if (!b) return -1;
                return a.localeCompare(b, 'ru');
            });

            const hasCategorized = sortedCats.some(c => c !== '');

            sortedCats.forEach(cat => {
                const items = byCategory.get(cat).map(t => this.createTemplateItem(t));
                if (cat || hasCategorized) {
                    this._appendFoldableCategory(cat || 'Без категории', items);
                } else {
                    items.forEach(el => this.list.appendChild(el));
                }
            });
        }

        if (templatesToRender.personal.length > 0) {
            templatesToRender.personal.forEach(t => this.list.appendChild(this.createTemplateItem(t)));
        }
    },

    /**
     * Appends a collapsible category group to the template list.
     * @param {string} title - Category label.
     * @param {HTMLElement[]} itemEls - Pre-built template item elements.
     */
    _appendFoldableCategory(title, itemEls) {
        const wrapper = document.createElement('div');
        wrapper.className = 'templates-category-group';

        const header = document.createElement('button');
        header.type = 'button';
        header.className = 'templates-category-header';
        header.setAttribute('aria-expanded', 'true');
        header.innerHTML = `<span class="tcg-title">${title}</span>` +
            `<svg class="tcg-chevron" width="14" height="14" viewBox="0 0 24 24" ` +
            `fill="none" stroke="currentColor" stroke-width="2">` +
            `<polyline points="6 9 12 15 18 9"></polyline></svg>`;

        const body = document.createElement('div');
        body.className = 'templates-category-body';
        itemEls.forEach(el => body.appendChild(el));

        header.addEventListener('click', () => {
            const open = header.getAttribute('aria-expanded') === 'true';
            header.setAttribute('aria-expanded', String(!open));
            body.classList.toggle('templates-category-body--collapsed', open);
        });

        wrapper.appendChild(header);
        wrapper.appendChild(body);
        this.list.appendChild(wrapper);
    },

    createTemplateItem(template) {
        const div = document.createElement('div');
        div.className = 'template-item';
        div.dataset.id = template.id;
        div.dataset.type = template.type;

        div.addEventListener('click', (e) => {
            if (e.target.closest('.template-menu-btn')) return;
            if (e.target.closest('.template-preview-popup')) return;
            if (this._rowPreviewClickTimer) {
                window.clearTimeout(this._rowPreviewClickTimer);
            }
            this._rowPreviewClickTimer = window.setTimeout(() => {
                this._rowPreviewClickTimer = null;
                this.toggleRowPreview(div, template);
            }, 180);
        });

        // Двойной клик — применить шаблон / вставить пресет
        div.addEventListener('dblclick', (e) => {
            if (e.target.closest('.template-menu-btn')) return;
            if (this._rowPreviewClickTimer) {
                window.clearTimeout(this._rowPreviewClickTimer);
                this._rowPreviewClickTimer = null;
            }
            this.closeRowPreview();
            if (isPresetTemplate(template)) {
                this.insertPreset(template);
            } else {
                this.selectTemplate(template);
            }
        });

        const nameSpan = document.createElement('span');
        nameSpan.className = 'template-name';
        nameSpan.textContent = template.name;
        div.appendChild(nameSpan);

        // Кнопка меню ⋮
        const menuBtn = document.createElement('button');
        menuBtn.type = 'button';
        menuBtn.className = 'template-menu-btn';
        menuBtn.title = 'Действия';
        menuBtn.textContent = '⋮';
        menuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this._openTemplateMenu(menuBtn, template, nameSpan);
        });
        div.appendChild(menuBtn);

        return div;
    },

    _openTemplateMenu(anchor, template, nameSpan) {
        this.closeRowPreview();
        this._closeOpenMenu();

        const dropdown = document.createElement('div');
        dropdown.className = 'template-menu-dropdown';

        const addItem = (label, danger, action) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'template-menu-item' + (danger ? ' template-menu-item--danger' : '');
            btn.textContent = label;
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._closeOpenMenu();
                action();
            });
            dropdown.appendChild(btn);
        };

        if (isPresetTemplate(template)) {
            addItem('Вставить', false, () => this.insertPreset(template));
            if (this._isAdmin && template.type === 'shared') {
                addItem('Удалить', true, () => this.deleteTemplate(template));
            }
        } else {
            addItem('Просмотр', false, () => this.previewTemplate(template));
            addItem('Применить', false, () => this.selectTemplate(template));
            addItem('Переименовать', false, () => this.startRenaming(nameSpan, template));
            addItem('Обновить из холста', false, () => this.updateTemplateFromCanvas(template));
            if (template.type === 'personal' || (this._isAdmin && template.type === 'shared')) {
                addItem('Удалить', true, () => this.deleteTemplate(template));
            }
        }

        // Append to body and use fixed positioning so the dropdown is not
        // clipped by any ancestor with overflow:hidden / overflow-y:auto.
        document.body.appendChild(dropdown);
        const rect = anchor.getBoundingClientRect();
        dropdown.style.position = 'fixed';
        dropdown.style.top  = (rect.bottom + 2) + 'px';
        dropdown.style.right = (window.innerWidth - rect.right) + 'px';
        dropdown.style.left = 'auto';

        this._openMenuDropdown = dropdown;

        const closeHandler = (e) => {
            if (!anchor.contains(e.target) && !dropdown.contains(e.target)) {
                this._closeOpenMenu();
                document.removeEventListener('click', closeHandler, true);
            }
        };
        setTimeout(() => document.addEventListener('click', closeHandler, true), 0);
    },

    _ensureRowPreviewPopup() {
        if (this._rowPreviewPopup) return this._rowPreviewPopup;

        const popup = document.createElement('div');
        popup.className = 'template-preview-popup';
        popup.innerHTML = `
            <div class="template-preview-popup__card">
                <div class="template-card-preview template-preview-popup__preview">
                    <div class="preview-loading-mini">
                        <div class="spinner-mini"></div>
                    </div>
                    <div class="template-card-overlay">
                        <button type="button" class="btn-template-preview template-preview-popup__action">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                <circle cx="12" cy="12" r="3"></circle>
                            </svg>
                            Просмотреть
                        </button>
                    </div>
                </div>
                <div class="template-card-info template-preview-popup__info">
                    <div class="template-card-name template-preview-popup__title"></div>
                    <div class="template-card-meta template-preview-popup__meta"></div>
                </div>
            </div>
        `;

        popup.querySelector('.template-preview-popup__action')?.addEventListener('click', async () => {
            if (!this._rowPreviewAnchorEl) return;
            const { id, type } = this._rowPreviewAnchorEl.dataset;
            const templateItem = this._findTemplateByKey(id, type);
            this.closeRowPreview();
            if (!templateItem) return;
            await this.previewTemplate(templateItem);
        });

        document.body.appendChild(popup);
        this._rowPreviewPopup = popup;
        return popup;
    },

    _positionRowPreview() {
        const popup = this._rowPreviewPopup;
        const anchor = this._rowPreviewAnchorEl;
        if (!popup || !anchor || popup.style.display === 'none') return;

        const rect = anchor.getBoundingClientRect();
        const popupWidth = 320;
        const gap = 8;
        let left = rect.right + gap;
        let top = rect.top;

        if (left + popupWidth > window.innerWidth - 16) {
            left = Math.max(16, rect.left - popupWidth - gap);
        }

        const maxTop = Math.max(16, window.innerHeight - popup.offsetHeight - 16);
        top = Math.min(Math.max(16, top), maxTop);

        popup.style.left = `${Math.round(left)}px`;
        popup.style.top = `${Math.round(top)}px`;
    },

    _findTemplateByKey(id, type) {
        return this.templates.shared.concat(this.templates.personal)
            .find((item) => item.id === id && item.type === type);
    },

    _buildRowPreviewActionMarkup() {
        return `
            <button type="button" class="btn-template-preview template-preview-popup__action">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                </svg>
                Просмотреть
            </button>
        `;
    },

    _bindRowPreviewAction(root, template) {
        root?.querySelector('.template-preview-popup__action')?.addEventListener('click', async (e) => {
            e.stopPropagation();
            const templateItem = this._findTemplateByKey(template.id, template.type);
            this.closeRowPreview();
            if (!templateItem) return;
            await this.previewTemplate(templateItem);
        });
    },

    _renderRowPreviewLoading(previewEl, template) {
        if (!previewEl) return;
        previewEl.innerHTML = `
            <div class="preview-loading-mini">
                <div class="spinner-mini"></div>
            </div>
            <div class="template-card-overlay">
                ${this._buildRowPreviewActionMarkup()}
            </div>
        `;
        this._bindRowPreviewAction(previewEl, template);
    },

    _renderRowPreviewFallback(previewEl, template, message = 'Нет превью', withIcon = false) {
        if (!previewEl) return;
        previewEl.innerHTML = `
            <div class="no-preview">
                ${withIcon ? `
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                        <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
                        <polyline points="13 2 13 9 20 9"></polyline>
                    </svg>
                ` : ''}
                <span>${message}</span>
            </div>
            <div class="template-card-overlay">
                ${this._buildRowPreviewActionMarkup()}
            </div>
        `;
        this._bindRowPreviewAction(previewEl, template);
    },

    _renderRowPreviewHtml(previewEl, template, html) {
        if (!previewEl) return;
        const EMAIL_WIDTH = 640;
        const CARD_HEIGHT = 200;
        const cardWidth = previewEl.offsetWidth || 280;
        const scale = cardWidth / EMAIL_WIDTH;

        const wrapper = document.createElement('div');
        wrapper.style.cssText = [
            'width: 100%;',
            `height: ${CARD_HEIGHT}px`,
            'overflow: hidden;',
            'position: relative;',
            'background: #fff;'
        ].join('');

        previewEl.innerHTML = '';
        previewEl.appendChild(wrapper);

        const frame = document.createElement('iframe');
        frame.className = 'email-preview-frame';
        frame.style.cssText = [
            'position: absolute;',
            'top: 0;',
            'left: 0;',
            `width: ${EMAIL_WIDTH}px;`,
            `height: ${Math.ceil(CARD_HEIGHT / scale)}px;`,
            'border: none;',
            `transform: scale(${scale.toFixed(4)});`,
            'transform-origin: top left;',
            'pointer-events: none;',
            'background: #fff;',
            'border-radius: 0;'
        ].join('');
        frame.srcdoc = html;
        wrapper.appendChild(frame);

        const overlay = document.createElement('div');
        overlay.className = 'template-card-overlay';
        overlay.innerHTML = this._buildRowPreviewActionMarkup();
        previewEl.appendChild(overlay);
        this._bindRowPreviewAction(previewEl, template);
    },

    async _generatePreviewHtml(blocks) {
        const originalBlocks = AppState.blocks;

        try {
            AppState.blocks = JSON.parse(JSON.stringify(blocks || []));
            const previewTheme = window.EmailPreviewTheme?.get?.() || 'dark';
            return await generateEmailHTML({ previewTheme });
        } finally {
            AppState.blocks = originalBlocks;
        }
    },

    async toggleRowPreview(anchor, template) {
        const templateKey = `${template.type}:${template.id}`;
        if (this._rowPreviewPopup
            && this._rowPreviewTemplateKey === templateKey
            && this._rowPreviewPopup.style.display === 'block') {
            this.closeRowPreview();
            return;
        }

        await this.openRowPreview(anchor, template);
    },

    async openRowPreview(anchor, template) {
        const popup = this._ensureRowPreviewPopup();
        const titleEl = popup.querySelector('.template-preview-popup__title');
        const metaEl = popup.querySelector('.template-preview-popup__meta');
        const previewEl = popup.querySelector('.template-preview-popup__preview');
        const name = decodeHtml(template.name || 'Шаблон');
        const requestId = ++this._rowPreviewRequestId;

        this._rowPreviewAnchorEl = anchor;
        this._rowPreviewTemplateKey = `${template.type}:${template.id}`;

        if (titleEl) {
            titleEl.textContent = name;
        }
        if (metaEl) {
            metaEl.textContent = template.category || 'Без категории';
        }
        this._renderRowPreviewLoading(previewEl, template);

        popup.style.display = 'block';
        this._positionRowPreview();

        try {
            const templateData = await TemplatesAPI.load(template.id, template.type);
            if (requestId !== this._rowPreviewRequestId) return;

            if (!templateData || !Array.isArray(templateData.blocks)) {
                this._renderRowPreviewFallback(previewEl, template, 'Нет превью', true);
                this._positionRowPreview();
                return;
            }

            const html = await this._generatePreviewHtml(templateData.blocks);
            if (requestId !== this._rowPreviewRequestId) return;

            if (previewEl && typeof window.sharedRenderEmailPreviewFrame === 'function') {
                this._renderRowPreviewHtml(previewEl, template, html);
            }
            this._positionRowPreview();
        } catch (error) {
            if (requestId !== this._rowPreviewRequestId) return;
            console.error('[TEMPLATE ROW PREVIEW] Error:', error);
            this._renderRowPreviewFallback(previewEl, template);
            this._positionRowPreview();
        }
    },

    closeRowPreview() {
        if (!this._rowPreviewPopup) return;
        this._rowPreviewRequestId += 1;
        this._rowPreviewAnchorEl = null;
        this._rowPreviewTemplateKey = null;
        this._rowPreviewPopup.style.display = 'none';
    },

    async previewTemplate(template) {
        this.closeRowPreview();
        const modal = this._ensureTemplatePreviewModal();
        const content = modal?.querySelector('#template-preview-content');
        const title = modal?.querySelector('#template-preview-title');
        const openBtn = modal?.querySelector('#btn-open-template');

        if (!modal || !content) {
            Toast.error('Режим превью недоступен');
            return;
        }

        const name = decodeHtml(template.name || 'Шаблон');
        const progress = Toast.loading(`Превью «${name}»\u2026`);
        modal.style.display = 'flex';
        content.innerHTML = '<div class="preview-loading"><div class="spinner"></div><p>Загрузка...</p></div>';
        if (title) {
            title.textContent = name;
        }
        if (openBtn) {
            openBtn.dataset.id = template.id;
            openBtn.dataset.type = template.type;
            openBtn.textContent = isPresetTemplate(template) ? 'Вставить' : 'Открыть шаблон';
        }

        try {
            const templateData = await TemplatesAPI.load(template.id, template.type);
            if (!templateData || !Array.isArray(templateData.blocks)) {
                content.innerHTML = '<div class="preview-error">Ошибка загрузки шаблона</div>';
                progress.resolve('error', `Не удалось загрузить шаблон «${name}»`);
                return;
            }

            this._previewTemplate = { id: template.id, type: template.type, name };
            this._previewBlocks = JSON.parse(JSON.stringify(templateData.blocks));
            await this.renderQuickPreview();
            progress.dismiss();
        } catch (error) {
            console.error('[ADMIN PREVIEW] Error previewing template:', error);
            content.innerHTML = '<div class="preview-error">Ошибка загрузки</div>';
            progress.resolve('error', `Ошибка превью «${name}»`);
        }
    },

    async renderQuickPreview() {
        if (!this._previewTemplate || !Array.isArray(this._previewBlocks)) {
            return false;
        }

        const modal = this._ensureTemplatePreviewModal();
        const content = modal?.querySelector('#template-preview-content');
        const originalBlocks = AppState.blocks;

        try {
            if (!content) return false;
            AppState.blocks = JSON.parse(JSON.stringify(this._previewBlocks));
            const previewTheme = window.EmailPreviewTheme?.get?.() || 'dark';
            const html = await generateEmailHTML({ previewTheme });
            if (modal) {
                modal.style.display = 'flex';
            }
            if (typeof window.sharedRenderEmailPreviewFrame === 'function') {
                window.sharedRenderEmailPreviewFrame(content, html);
            } else {
                content.innerHTML = '<div class="preview-error">Режим превью недоступен</div>';
                return false;
            }
            return true;
        } catch (error) {
            console.error('[ADMIN PREVIEW] renderQuickPreview error:', error);
            if (content) {
                content.innerHTML = '<div class="preview-error">Ошибка генерации превью</div>';
            }
            Toast.error('Ошибка генерации превью шаблона');
            return false;
        } finally {
            AppState.blocks = originalBlocks;
        }
    },

    isQuickPreviewOpen() {
        const modal = document.getElementById('template-preview-modal');
        return Boolean(this._previewTemplate
            && Array.isArray(this._previewBlocks)
            && modal?.style.display === 'flex');
    },

    clearQuickPreviewState() {
        this._previewTemplate = null;
        this._previewBlocks = null;
    },

    _ensureTemplatePreviewModal() {
        let modal = document.getElementById('template-preview-modal');
        if (modal) return modal;

        const wrapper = document.createElement('div');
        wrapper.innerHTML = `
            <div id="template-preview-modal" class="modal" style="display:none;">
              <div class="modal-overlay"></div>
              <div class="modal-content modal-preview-template">
                <div class="modal-header">
                  <h2 id="template-preview-title">Просмотр шаблона</h2>
                  <button type="button" class="modal-close" aria-label="Закрыть">&times;</button>
                </div>
                <div class="modal-body">
                  <div class="template-preview-scroll">
                    <div id="template-preview-content" class="template-preview-wrapper"></div>
                  </div>
                </div>
                <div class="modal-footer modal-footer--template-preview">
                  <button type="button" class="btn-secondary" data-action="close-preview">Закрыть</button>
                  <button type="button" class="template-preview-open-btn" id="btn-open-template">Открыть шаблон</button>
                </div>
              </div>
            </div>
        `;
        modal = wrapper.firstElementChild;
        document.body.appendChild(modal);

        const close = () => this.closeTemplatePreview();
        modal.querySelector('.modal-overlay')?.addEventListener('click', close);
        modal.querySelector('.modal-close')?.addEventListener('click', close);
        modal.querySelector('[data-action=\"close-preview\"]')?.addEventListener('click', close);
        modal.querySelector('#btn-open-template')?.addEventListener('click', async () => {
            await this.openTemplateFromPreview();
        });

        return modal;
    },

    closeTemplatePreview() {
        const modal = document.getElementById('template-preview-modal');
        if (modal) {
            modal.style.display = 'none';
        }
        this.clearQuickPreviewState();
    },

    async openTemplateFromPreview() {
        const openBtn = document.getElementById('btn-open-template');
        if (!openBtn) return;

        const template = this._findTemplateByKey(openBtn.dataset.id, openBtn.dataset.type);
        this.closeTemplatePreview();
        if (!template) return;

        if (isPresetTemplate(template)) {
            await this.insertPreset(template);
        } else {
            await this.selectTemplate(template);
        }
    },

    _closeOpenMenu() {
        if (this._openMenuDropdown) {
            this._openMenuDropdown.remove();
            this._openMenuDropdown = null;
        }
    },


    // ✅ НОВАЯ ФУНКЦИЯ: Находим максимальный ID блока (включая вложенные в колонках)
    findMaxBlockId(blocks) {
        let maxId = 0;

        const checkBlock = (block) => {
            if (block.id > maxId) {
                maxId = block.id;
            }
            // Проверяем блоки внутри колонок
            if (block.columns) {
                block.columns.forEach(col => {
                    if (col.blocks) {
                        col.blocks.forEach(checkBlock);
                    }
                });
            }
        };

        blocks.forEach(checkBlock);
        return maxId;
    },

    async selectTemplate(template) {
        this.closeTemplatePreview();
        this.closeRowPreview();
        const name = decodeHtml(template.name);

        if (this.currentTemplate && this.hasUnsavedChanges()) {
            const decision = await showUnsavedChangesDialog(decodeHtml(this.currentTemplate.name));
            if (decision === 'cancel') return;
            if (decision === 'save') {
                const saved = await this.updateTemplateFromCanvas(this.currentTemplate, { confirm: false });
                if (!saved) return;
            }
        }

        if (!this.currentTemplate && AppState.blocks.length > 0) {
            const confirmed = await showConfirmDialog(
                `На холсте уже есть блоки.\n\nЗаменить их шаблоном «${name}»?`
            );
            if (!confirmed) return;
        }

        const itemEl = this.list?.querySelector(`[data-id="${template.id}"]`);
        if (itemEl) itemEl.classList.add('tpl-loading');
        const progress = Toast.loading(`Загрузка «${name}»\u2026`);

        const templateData = await TemplatesAPI.load(template.id, template.type);

        if (itemEl) itemEl.classList.remove('tpl-loading');

        if (templateData && templateData.blocks) {
            AppState.blocks = migrateExpertLite(templateData.blocks);
            this.currentTemplate = { ...template, name };
            this.syncSavedSnapshot(AppState.blocks);

            const maxId = this.findMaxBlockId(AppState.blocks);
            if (maxId > 0) {
                AppState.blockIdCounter = maxId + 1;
            }

            renderCanvas();
            if (AppState.blocks.length > 0) {
                selectBlock(AppState.blocks[0].id);
            } else {
                renderSettings();
            }

            if (typeof initializeBlockInteractions === 'function') {
                initializeBlockInteractions();
            }
            window.updateCanvasContext?.();

            document.querySelectorAll('.template-item').forEach(item => item.classList.remove('active'));
            this.list?.querySelector(`[data-id="${template.id}"]`)?.classList.add('active');

            progress.resolve('success', `Шаблон «${name}» загружен`);
        } else {
            progress.resolve('error', `Не удалось загрузить шаблон «${name}»`);
        }
    },

    async insertPreset(template) {
        this.closeTemplatePreview();
        this.closeRowPreview();
        console.log('🧩 Вставка пресета:', template.name, `(${template.type})`);

        const itemEl = this.list?.querySelector(`[data-id="${template.id}"]`);
        if (itemEl) itemEl.classList.add('tpl-loading');
        const progress = Toast.loading(`Загрузка пресета «${template.name}»\u2026`);

        const templateData = await TemplatesAPI.load(template.id, template.type);

        if (itemEl) itemEl.classList.remove('tpl-loading');

        if (!templateData || !templateData.blocks) {
            progress.resolve('error', `Не удалось загрузить пресет «${template.name}»`);
            return;
        }

        const blocks = migrateExpertLite(templateData.blocks);

        if (typeof insertBlocksAfterSelection === 'function') {
            insertBlocksAfterSelection(blocks);
            this.close();
            progress.resolve('success', `Пресет «${template.name}» вставлен`);
            // Scroll the first inserted block into view
            if (blocks.length > 0) {
                requestAnimationFrame(() => {
                    const el = document.querySelector(`[data-block-id="${AppState.selectedBlockId}"]`);
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                });
            }
        } else {
            progress.dismiss();
            console.error('insertBlocksAfterSelection не найден. Проверь blockOperations.js');
        }
    },

    async updateTemplateFromCanvas(template, options = {}) {
        const { confirm = true } = options;
        if (!AppState.blocks.length) {
            Toast.warning('Холст пуст — нечего сохранять.');
            return false;
        }
        if (confirm) {
            const confirmed = await showConfirmDialog(
                `Обновить шаблон «${decodeHtml(template.name)}» текущим содержимым холста?\n\nСодержимое шаблона будет заменено.`
            );
            if (!confirmed) return false;
        }

        // Snapshot blocks immediately — user may switch templates while preview renders
        const blocksSnapshot = JSON.parse(JSON.stringify(AppState.blocks));

        const progress = Toast.loading(`Сохранение «${template.name}»\u2026`);

        const success = await TemplatesAPI.update(template.id, template.type, blocksSnapshot, null);
        if (success) {
            progress.resolve('success', `Шаблон «${template.name}» обновлён`);
            this.currentTemplate = template;
            this.syncSavedSnapshot(blocksSnapshot);
            window.updateCanvasContext?.();

            // Generate preview in background — does not block the user
            generateTemplatePreview()
                .then(preview => preview && TemplatesAPI.updatePreview(template.id, template.type, preview))
                .catch(() => {});
            return true;
        } else {
            progress.resolve('error', `Ошибка обновления шаблона «${template.name}»`);
            return false;
        }
    },

    async deleteTemplate(template) {
        this.closeTemplatePreview();
        this.closeRowPreview();
        if (template.type === 'shared' && !this._isAdmin) {
            Toast.error('Недостаточно прав для удаления общего шаблона.');
            return;
        }

        // Защита от двойного клика
        if (this._deleting) return;

        const kind = getTemplateKindLabel(template);

        const confirmed = await showConfirmDialog(
            `Удалить ${kind} «${decodeHtml(template.name)}»?\n\nЭто действие нельзя отменить.`
        );

        if (!confirmed) return;

        this._deleting = true;
        try {
            const success = await TemplatesAPI.delete(template.id, template.type);

            if (success) {
                if (this.currentTemplate?.id === template.id) {
                    this.currentTemplate = null;
                    this.savedSnapshot = null;
                    window.updateCanvasContext?.();
                }
                // Optimistic local update — no round-trip needed
                const list = this.templates[template.type];
                if (list) {
                    this.templates[template.type] = list.filter(t => t.id !== template.id);
                }
                this.renderTemplates();
            }
        } finally {
            this._deleting = false;
        }
    },

    startRenaming(nameSpan, template) {
        this.closeTemplatePreview();
        this.closeRowPreview();
        const oldName = template.name;

        nameSpan.contentEditable = true;
        nameSpan.classList.add('editing');
        nameSpan.focus();

        // Выделяем текст
        const range = document.createRange();
        range.selectNodeContents(nameSpan);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);

        const finishRenaming = async () => {
            nameSpan.contentEditable = false;
            nameSpan.classList.remove('editing');

            const newName = nameSpan.textContent.trim();

            if (newName && newName !== oldName) {
                const ok = await TemplatesAPI.rename(template.id, newName, template.type);
                if (ok) {
                    template.name = newName;
                } else {
                    nameSpan.textContent = oldName;
                }
            } else {
                nameSpan.textContent = oldName;
            }
        };

        nameSpan.addEventListener('blur', finishRenaming, { once: true });
        nameSpan.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                nameSpan.blur();
            } else if (e.key === 'Escape') {
                nameSpan.textContent = oldName;
                nameSpan.blur();
            }
        });
    },

    filterTemplates(query) {
        const lowerQuery = query.toLowerCase().trim();

        if (!lowerQuery) {
            this.renderTemplates();
            return;
        }

        const scope = this._activeScope;
        const filtered = {
            shared: scope !== 'personal' ? this.templates.shared.filter(t => t.name.toLowerCase().includes(lowerQuery)) : [],
            personal: scope !== 'shared' ? this.templates.personal.filter(t => t.name.toLowerCase().includes(lowerQuery)) : [],
        };

        this.renderTemplates(filtered);
    },

    async clearCanvas() {
        this.closeTemplatePreview();
        this.closeRowPreview();
        const hasBlocks = AppState.blocks.length > 0;

        if (!hasBlocks) {
            Toast.warning('Холст уже пуст');
            return;
        }

        if (this.currentTemplate && this.hasUnsavedChanges()) {
            const decision = await showUnsavedChangesDialog(decodeHtml(this.currentTemplate.name));
            if (decision === 'cancel') return;
            if (decision === 'save') {
                const saved = await this.updateTemplateFromCanvas(this.currentTemplate, { confirm: false });
                if (!saved) return;
            }
        }

        const confirmed = await showConfirmDialog('Очистить холст?');
        if (!confirmed) return;

        AppState.blocks = [];
        this.currentTemplate = null;
        this.savedSnapshot = null;

        renderCanvas();
        renderSettings();
        window.updateCanvasContext?.();

        document.querySelectorAll('.template-item').forEach(item => {
            item.classList.remove('active');
        });
    }
};

// Expose TemplatesUI on window so main.js can read currentTemplate via window.TemplatesUI.
// Top-level `const` declarations are not properties of `window`, so we assign explicitly.
window.TemplatesUI = TemplatesUI;

// Функция сохранения шаблона
async function saveCurrentTemplate() {
    const hasBlocks = AppState.blocks.length > 0;

    if (!hasBlocks) {
        Toast.warning('Нечего сохранять! Добавьте блоки на холст.');
        return;
    }

    // ✅ НОВЫЙ ДИАЛОГ С 3 КНОПКАМИ
    showSaveTemplateDialog();
}

function showSaveTemplateDialog() {
    const dlg = document.createElement('dialog');
    dlg.className = 'app-dialog';

    const dialog = document.createElement('div');
    dialog.style.cssText = 'width:100%;';

    // --- Заголовок ---
    const title = document.createElement('h3');
    title.textContent = 'Сохранить шаблон';
    title.style.cssText = 'margin:0 0 20px 0;font-size:18px;color:#f9fafb;font-weight:600;';
    dialog.appendChild(title);

    // --- Поле названия ---
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.placeholder = 'Название шаблона или пресета';
    nameInput.style.cssText = [
        'width:100%;padding:10px 12px;box-sizing:border-box;',
        'border:1px solid #475569;border-radius:6px;',
        'font-size:14px;background:#0f172a;color:#e5e7eb;',
        'margin-bottom:20px;',
    ].join('');
    dialog.appendChild(nameInput);

    // --- Options row: toggle «Общий» + «Сохранить как» ---
    let currentType = 'personal';

    const optionsRow = document.createElement('div');
    optionsRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:16px;';

    // Toggle side
    const switchRow = document.createElement('label');
    switchRow.style.cssText = 'display:flex;align-items:center;gap:10px;cursor:pointer;flex-shrink:0;';

    const switchTrack = document.createElement('span');
    switchTrack.style.cssText = 'position:relative;display:inline-block;width:40px;height:22px;flex-shrink:0;';

    const switchInput = document.createElement('input');
    switchInput.type = 'checkbox';
    switchInput.style.cssText = 'opacity:0;width:0;height:0;position:absolute;';

    const switchThumb = document.createElement('span');
    switchThumb.style.cssText = 'position:absolute;inset:0;border-radius:22px;background:#334155;transition:background 0.2s;';
    const knob = document.createElement('span');
    knob.style.cssText = [
        'position:absolute;width:16px;height:16px;',
        'left:3px;top:3px;border-radius:50%;',
        'background:#94a3b8;transition:transform 0.2s,background 0.2s;',
    ].join('');
    switchThumb.appendChild(knob);
    switchTrack.appendChild(switchInput);
    switchTrack.appendChild(switchThumb);

    const switchLabel = document.createElement('span');
    switchLabel.textContent = 'Общий';
    switchLabel.style.cssText = 'font-size:14px;color:#9ca3af;transition:color 0.2s;';

    switchRow.appendChild(switchTrack);
    switchRow.appendChild(switchLabel);

    // Save-type select side
    const saveTypeWrapper = document.createElement('div');
    saveTypeWrapper.style.cssText = 'display:flex;align-items:center;gap:8px;flex-shrink:0;';

    const saveTypeLabel = document.createElement('span');
    saveTypeLabel.textContent = 'Сохранить как:';
    saveTypeLabel.style.cssText = 'font-size:13px;color:#9ca3af;white-space:nowrap;';

    const saveTypeSelect = document.createElement('select');
    saveTypeSelect.style.cssText = [
        'padding:6px 10px;border:1px solid #475569;border-radius:6px;',
        'font-size:13px;background:#0f172a;color:#e5e7eb;cursor:pointer;',
    ].join('');
    const optTemplate = document.createElement('option');
    optTemplate.value = 'template';
    optTemplate.textContent = 'Шаблон';
    const optPreset = document.createElement('option');
    optPreset.value = 'preset';
    optPreset.textContent = 'Пресет';
    saveTypeSelect.appendChild(optTemplate);
    saveTypeSelect.appendChild(optPreset);

    saveTypeWrapper.appendChild(saveTypeLabel);
    saveTypeWrapper.appendChild(saveTypeSelect);

    optionsRow.appendChild(switchRow);
    optionsRow.appendChild(saveTypeWrapper);
    dialog.appendChild(optionsRow);

    const _updateOptionsUI = () => {
        const isPreset = saveTypeSelect.value === 'preset';
        // When switching to preset mode, reset the toggle to OFF (personal)
        if (isPreset && switchInput.checked) {
            switchInput.checked = false;
        }
        const on = switchInput.checked;
        switchRow.style.opacity = '1';
        switchRow.style.pointerEvents = '';
        currentType = on ? 'shared' : 'personal';
        // Category only for shared non-preset items
        categorySection.style.display = (!isPreset && on) ? 'block' : 'none';
        nameInput.placeholder = isPreset ? 'Название пресета' : 'Название шаблона';
        // Toggle visuals
        switchThumb.style.background = on ? 'rgba(249,115,22,0.25)' : '#334155';
        switchThumb.style.border = on ? '1px solid #f97316' : 'none';
        knob.style.transform = on ? 'translateX(18px)' : 'none';
        knob.style.background = on ? '#f97316' : '#94a3b8';
        switchLabel.style.color = on ? '#f97316' : '#9ca3af';
    };

    switchInput.addEventListener('change', _updateOptionsUI);
    saveTypeSelect.addEventListener('change', _updateOptionsUI);

    // --- Блок категории (только для общих) ---
    const categorySection = document.createElement('div');
    categorySection.style.cssText = 'margin-bottom:16px;display:none;';

    const catLabel = document.createElement('label');
    catLabel.textContent = 'Категория';
    catLabel.style.cssText = 'display:block;font-size:12px;color:#9ca3af;margin-bottom:6px;';
    categorySection.appendChild(catLabel);

    const catRow = document.createElement('div');
    catRow.style.cssText = 'display:flex;gap:8px;';

    const categorySelect = document.createElement('select');
    categorySelect.style.cssText = [
        'flex:1;padding:9px 10px;',
        'border:1px solid #475569;border-radius:6px;',
        'font-size:13px;background:#0f172a;color:#e5e7eb;',
    ].join('');
    const optNone = document.createElement('option');
    optNone.value = '';
    optNone.textContent = '— Без категории —';
    categorySelect.appendChild(optNone);

    const addCatBtn = document.createElement('button');
    addCatBtn.type = 'button';
    addCatBtn.textContent = '+';
    addCatBtn.title = 'Новая категория';
    addCatBtn.style.cssText = 'padding:9px 14px;background:#334155;color:#e5e7eb;border:none;border-radius:6px;cursor:pointer;font-size:16px;';

    catRow.appendChild(categorySelect);
    catRow.appendChild(addCatBtn);
    categorySection.appendChild(catRow);

    // Поле для ввода новой категории (скрыто до нажатия +)
    const newCatRow = document.createElement('div');
    newCatRow.style.cssText = 'display:none;margin-top:8px;display:none;gap:6px;';

    const newCatInput = document.createElement('input');
    newCatInput.type = 'text';
    newCatInput.placeholder = 'Название категории';
    newCatInput.style.cssText = 'flex:1;padding:8px 10px;border:1px solid #475569;border-radius:6px;font-size:13px;background:#0f172a;color:#e5e7eb;';

    const confirmCatBtn = document.createElement('button');
    confirmCatBtn.type = 'button';
    confirmCatBtn.textContent = 'OK';
    confirmCatBtn.style.cssText = 'padding:8px 14px;background:#334155;color:#e5e7eb;border:none;border-radius:6px;cursor:pointer;font-size:13px;';

    newCatRow.appendChild(newCatInput);
    newCatRow.appendChild(confirmCatBtn);
    categorySection.appendChild(newCatRow);

    addCatBtn.addEventListener('click', () => {
        newCatRow.style.display = 'flex';
        newCatInput.focus();
    });

    const commitNewCategory = async () => {
        const trimmed = newCatInput.value.trim();
        if (!trimmed) return;
        const option = document.createElement('option');
        option.value = trimmed;
        option.textContent = trimmed;
        option.selected = true;
        categorySelect.appendChild(option);
        await TemplatesAPI.saveCategory(trimmed);
        newCatInput.value = '';
        newCatRow.style.display = 'none';
    };

    confirmCatBtn.addEventListener('click', commitNewCategory);
    newCatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); commitNewCategory(); }
        if (e.key === 'Escape') { newCatRow.style.display = 'none'; }
    });

    dialog.appendChild(categorySection);
    loadCategories(categorySelect);

    // --- Кнопки действий ---
    const actionsRow = document.createElement('div');
    actionsRow.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;margin-top:4px;';

    const btnCancel = document.createElement('button');
    btnCancel.type = 'button';
    btnCancel.textContent = 'Отмена';
    btnCancel.style.cssText = 'padding:9px 18px;background:#374151;color:#e5e7eb;border:none;border-radius:6px;cursor:pointer;font-size:13px;';

    const btnSave = document.createElement('button');
    btnSave.type = 'button';
    btnSave.textContent = 'Сохранить';
    btnSave.style.cssText = 'padding:9px 18px;background:#f97316;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;';

    actionsRow.appendChild(btnCancel);
    actionsRow.appendChild(btnSave);
    dialog.appendChild(actionsRow);

    dlg.appendChild(dialog);
    document.body.appendChild(dlg);
    _updateOptionsUI(); // sync initial UI state — all consts are declared above
    dlg.showModal();
    setTimeout(() => nameInput.focus(), 60);

    // --- Логика ---
    const closeDialog = () => { dlg.close(); dlg.remove(); };

    btnCancel.addEventListener('click', closeDialog);
    dlg.addEventListener('click', (e) => { if (e.target === dlg) closeDialog(); });
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); closeDialog(); });

    const saveTemplate = async () => {
        const templateName = nameInput.value.trim();
        if (!templateName) {
            Toast.warning('Введите название шаблона!');
            nameInput.focus();
            return;
        }
        const category = currentType === 'shared' ? categorySelect.value : '';

        // Snapshot blocks NOW — canvas state may change if user navigates while saving
        const blocksSnapshot = JSON.parse(JSON.stringify(AppState.blocks));

        // Close dialog immediately so the user is not blocked
        closeDialog();
        const progress = Toast.loading(`Сохранение «${templateName}»\u2026`);

        const savedId = await TemplatesAPI.save(templateName, blocksSnapshot, currentType, category, null);
        if (savedId) {
            progress.resolve('success', `Шаблон «${templateName}» сохранён`);
            const newItem = { id: savedId, name: templateName, type: currentType, category, isPreset: false };
            TemplatesUI.currentTemplate = newItem;
            TemplatesUI.syncSavedSnapshot(blocksSnapshot);
            window.updateCanvasContext?.();
            // Optimistic local update — insert and re-sort without a server round-trip
            const list = TemplatesUI.templates[currentType] || [];
            list.push(newItem);
            list.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
            TemplatesUI.templates[currentType] = list;
            if (TemplatesUI.isOpen) TemplatesUI.renderTemplates();

            // Generate preview in background — does not block the user
            generateTemplatePreview()
                .then(preview => preview && TemplatesAPI.updatePreview(savedId, currentType, preview))
                .catch(() => {});
        } else {
            progress.resolve('error', `Ошибка сохранения шаблона «${templateName}»`);
        }
    };

    const savePreset = async () => {
        const presetName = nameInput.value.trim();
        if (!presetName) {
            Toast.warning('Введите название пресета!');
            nameInput.focus();
            return;
        }
        const blocks = getBlocksForPreset();
        if (!blocks.length) {
            Toast.warning('Нечего сохранять: выдели блоки (Ctrl/Shift) или выбери один блок.');
            return;
        }

        closeDialog();
        const progress = Toast.loading(`Сохранение пресета «${presetName}»\u2026`);

        const savedId = await TemplatesAPI.save(presetName, blocks, currentType, '', null, true);
        if (savedId) {
            progress.resolve('success', `Пресет «${presetName}» сохранён`);
            // Optimistic local update in templates list
            const newItem = { id: savedId, name: presetName, type: currentType, category: '', isPreset: true };
            const list = TemplatesUI.templates[currentType] || [];
            list.push(newItem);
            list.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
            TemplatesUI.templates[currentType] = list;
            if (TemplatesUI.isOpen) TemplatesUI.renderTemplates();
            // Update the inline presets panel (sidebar grid)
            window.addPresetToPanel?.(newItem);
        } else {
            progress.resolve('error', `Ошибка сохранения пресета «${presetName}»`);
        }
    };

    const doSave = () => saveTypeSelect.value === 'preset' ? savePreset() : saveTemplate();
    btnSave.addEventListener('click', doSave);
    nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSave(); });
}

/**
 * Загрузить категории в select
 */
async function loadCategories(selectElement) {
    try {
        const categories = await TemplatesAPI.getCategories();
        categories.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat;
            option.textContent = cat;
            selectElement.appendChild(option);
        });
    } catch (e) {
        console.error('Ошибка загрузки категорий:', e);
    }
}

/**
 * Генерация превью шаблона (скриншот canvas)
 */
async function generateTemplatePreview() {
    try {
        const canvas = document.getElementById('canvas');
        if (!canvas) return null;
        
        // Используем html2canvas для создания скриншота
        if (typeof html2canvas === 'undefined') {
            console.warn('html2canvas не загружен, превью не создано');
            return null;
        }
        
        const screenshotCanvas = await html2canvas(canvas, {
            backgroundColor: '#1e293b',
            scale: 0.5, // Уменьшаем для экономии места
            width: 600,
            height: 800,
            windowWidth: 600,
            windowHeight: 800
        });
        
        // Масштабируем до 300x400
        const finalCanvas = document.createElement('canvas');
        finalCanvas.width = 300;
        finalCanvas.height = 400;
        const ctx = finalCanvas.getContext('2d');
        
        // Заливаем фон
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0, 0, 300, 400);
        
        // Рисуем скриншот с сохранением пропорций
        const srcAspect = screenshotCanvas.width / screenshotCanvas.height;
        const dstAspect = 300 / 400;
        
        let drawWidth, drawHeight, drawX, drawY;
        
        if (srcAspect > dstAspect) {
            // Исходник шире — обрезаем по бокам
            drawWidth = 300;
            drawHeight = 300 / srcAspect;
            drawX = 0;
            drawY = 0; // Прижимаем к верху
        } else {
            // Исходник выше — обрезаем снизу
            drawHeight = 400;
            drawWidth = 400 * srcAspect;
            drawX = (300 - drawWidth) / 2;
            drawY = 0;
        }
        
        ctx.drawImage(screenshotCanvas, drawX, drawY, drawWidth, drawHeight);
        
        return finalCanvas.toDataURL('image/png', 0.8);
        
    } catch (e) {
        console.error('Ошибка генерации превью:', e);
        return null;
    }
}

// Подключаем кнопку сохранения
document.addEventListener('DOMContentLoaded', () => {
    const btnSave = document.getElementById('btn-save-template');
    if (btnSave) {
        btnSave.addEventListener('click', async () => {
            const current = TemplatesUI.currentTemplate;
            if (current && !isPresetTemplate(current)) {
                await TemplatesUI.updateTemplateFromCanvas(current, { confirm: false });
                return;
            }
            await saveCurrentTemplate();
        });
    }

    const btnSaveAs = document.getElementById('btn-save-as-template');
    if (btnSaveAs) {
        btnSaveAs.addEventListener('click', saveCurrentTemplate);
    }
});
