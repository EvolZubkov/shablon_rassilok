// templatesUI.js - UI для библиотеки шаблонов

/**
 * Show a custom HTML confirmation dialog.
 * Replaces the native window.confirm() to avoid encoding/rendering
 * issues inside QWebEngineView.
 *
 * @param {string} message - Plain text message to display.
 * @returns {Promise<boolean>} Resolves to true when confirmed, false when cancelled.
 */
function showConfirmDialog(message) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.style.cssText = [
            'position:fixed;inset:0;',
            'background:rgba(0,0,0,0.55);',
            'display:flex;align-items:center;justify-content:center;',
            'z-index:99999;',
        ].join('');

        const box = document.createElement('div');
        box.style.cssText = [
            'background:#1e293b;border:1px solid #374151;border-radius:12px;',
            'padding:24px 28px;max-width:440px;width:90%;',
            'box-shadow:0 8px 32px rgba(0,0,0,0.4);',
        ].join('');

        const text = document.createElement('p');
        text.style.cssText = 'margin:0 0 20px 0;font-size:14px;color:#e5e7eb;line-height:1.5;white-space:pre-wrap;';
        text.textContent = message;

        const buttons = document.createElement('div');
        buttons.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;';

        const btnCancel = document.createElement('button');
        btnCancel.type = 'button';
        btnCancel.textContent = 'Отмена';
        btnCancel.style.cssText = 'padding:8px 20px;background:#374151;color:#e5e7eb;border:none;border-radius:6px;cursor:pointer;font-size:14px;';

        const btnOk = document.createElement('button');
        btnOk.type = 'button';
        btnOk.textContent = 'Подтвердить';
        btnOk.style.cssText = 'padding:8px 20px;background:#f97316;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:600;';

        function finish(result) {
            overlay.remove();
            resolve(result);
        }

        btnOk.addEventListener('click', () => finish(true));
        btnCancel.addEventListener('click', () => finish(false));
        overlay.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') finish(true);
            if (e.key === 'Escape') finish(false);
        });

        buttons.appendChild(btnCancel);
        buttons.appendChild(btnOk);
        box.appendChild(text);
        box.appendChild(buttons);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        btnOk.focus();
    });
}

function isPresetTemplate(t) {
    // Используем явное поле isPreset (не эмодзи в имени)
    if (!t) return false;
    if (typeof t.isPreset === 'boolean') return t.isPreset;
    // Обратная совместимость: старые шаблоны без поля isPreset
    return typeof t.name === 'string' && t.name.trim().startsWith('🧩');
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
    templates: { shared: [], personal: [] }, // ИЗМЕНЕНО: теперь объект
    currentTemplate: null,

    init() {
        this.panel = document.getElementById('templates-panel');
        this.overlay = document.getElementById('templates-overlay');
        this.list = document.getElementById('templates-list');
        this.searchInput = document.getElementById('templates-search-input');

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

        // Поиск
        if (this.searchInput) {
            this.searchInput.addEventListener('input', (e) => {
                this.filterTemplates(e.target.value);
            });
        }

        // Кнопка очистки холста
        const btnClear = document.getElementById('btn-clear-canvas');
        if (btnClear) {
            btnClear.addEventListener('click', () => {
                this.clearCanvas();
            });
        }

        console.log('✅ TemplatesUI initialized');
    },

    async open() {
        if (this.isOpen) return;

        this.isOpen = true;
        this.panel.classList.add('active');
        this.overlay.classList.add('active');

        // Загружаем список шаблонов
        await this.loadTemplates();
    },

    close() {
        if (!this.isOpen) return;

        this.isOpen = false;
        this.panel.classList.remove('active');
        this.overlay.classList.remove('active');
        if (this.searchInput) {
            this.searchInput.value = '';
        }
    },

    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    },

    async loadTemplates() {
        this.templates = await TemplatesAPI.getList();
        console.log('📚 Загружено шаблонов:', this.templates);
        this.renderTemplates();
    },

    renderTemplates(filteredTemplates = null) {
        const templatesToRender = filteredTemplates || this.templates;

        const totalCount = (templatesToRender.shared?.length || 0) + (templatesToRender.personal?.length || 0);

        if (totalCount === 0) {
            this.list.innerHTML = `
                <div class="templates-empty">
                    ${filteredTemplates ? 'Ничего не найдено' : 'Нет сохранённых шаблонов'}
                </div>
            `;
            return;
        }

        this.list.innerHTML = '';

        if (templatesToRender.shared?.length > 0) {
            const presets   = templatesToRender.shared.filter(isPresetTemplate);
            const sharedOnly = templatesToRender.shared.filter(t => !isPresetTemplate(t));

            if (presets.length > 0) {
                this._appendSectionHeader('🧩 ПРЕСЕТЫ');
                presets.forEach(t => this.list.appendChild(this.createTemplateItem(t)));
            }

            if (sharedOnly.length > 0) {
                this._appendSectionHeader('📁 ОБЩИЕ ШАБЛОНЫ');

                // Группируем по категории
                const byCategory = new Map();
                sharedOnly.forEach(t => {
                    const cat = t.category || '';
                    if (!byCategory.has(cat)) byCategory.set(cat, []);
                    byCategory.get(cat).push(t);
                });

                // Сначала именованные категории (по алфавиту), затем «без категории»
                const sortedCats = [...byCategory.keys()].sort((a, b) => {
                    if (!a) return 1;
                    if (!b) return -1;
                    return a.localeCompare(b, 'ru');
                });

                const hasCategorized = sortedCats.some(c => c !== '');

                sortedCats.forEach(cat => {
                    if (cat || hasCategorized) {
                        this._appendCategoryHeader(cat || 'Без категории');
                    }
                    byCategory.get(cat).forEach(t => this.list.appendChild(this.createTemplateItem(t)));
                });
            }
        }

        if (templatesToRender.personal?.length > 0) {
            this._appendSectionHeader('📁 МОИ ШАБЛОНЫ');
            templatesToRender.personal.forEach(t => this.list.appendChild(this.createTemplateItem(t)));
        }
    },

    _appendSectionHeader(text) {
        const el = document.createElement('div');
        el.className = 'templates-section-header';
        el.textContent = text;
        this.list.appendChild(el);
    },

    _appendCategoryHeader(text) {
        const el = document.createElement('div');
        el.className = 'templates-category-header';
        el.textContent = text;
        this.list.appendChild(el);
    },

    createTemplateItem(template) {
        const div = document.createElement('div');
        div.className = 'template-item';
        div.dataset.id = template.id;
        div.dataset.type = template.type;

        // Двойной клик — применить шаблон / вставить пресет
        div.addEventListener('dblclick', (e) => {
            if (e.target.closest('.template-menu-btn')) return;
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
        } else {
            addItem('Применить', false, () => this.selectTemplate(template));
            addItem('Переименовать', false, () => this.startRenaming(nameSpan, template));
            addItem('Обновить из холста', false, () => this.updateTemplateFromCanvas(template));
            if (template.type === 'personal') {
                addItem('Удалить', true, () => this.deleteTemplate(template));
            }
        }

        anchor.appendChild(dropdown);
        this._openMenuDropdown = dropdown;

        const closeHandler = (e) => {
            if (!anchor.contains(e.target)) {
                this._closeOpenMenu();
                document.removeEventListener('click', closeHandler, true);
            }
        };
        setTimeout(() => document.addEventListener('click', closeHandler, true), 0);
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
        console.log('📥 Загрузка шаблона:', template.name, `(${template.type})`);

        if (AppState.blocks.length > 0) {
            const confirmed = await showConfirmDialog(
                `На холсте уже есть блоки.\n\nЗаменить их шаблоном "${template.name}"?`
            );
            if (!confirmed) return;
        }

        const templateData = await TemplatesAPI.load(template.id, template.type);

        if (templateData && templateData.blocks) {
            AppState.blocks = migrateExpertLite(templateData.blocks);
            this.currentTemplate = template;

            // ✅ КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Синхронизируем счётчик ID с максимальным ID из шаблона
            const maxId = this.findMaxBlockId(AppState.blocks);
            if (maxId > 0) {
                AppState.blockIdCounter = maxId + 1;
                console.log('[TEMPLATES] Синхронизирован blockIdCounter:', AppState.blockIdCounter);
            }

            renderCanvas();
            // ✅ ИСПРАВЛЕНИЕ БАГ 3: Автоматически выделяем первый блок
            if (AppState.blocks.length > 0) {
                selectBlock(AppState.blocks[0].id);
            } else {
                renderSettings();
            }

            if (typeof initializeBlockInteractions === 'function') {
                initializeBlockInteractions();
            }
            // Подсвечиваем активный шаблон
            document.querySelectorAll('.template-item').forEach(item => {
                item.classList.remove('active');
            });

            const activeItem = this.list.querySelector(`[data-id="${template.id}"]`);
            if (activeItem) {
                activeItem.classList.add('active');
            }

            console.log('✅ Шаблон загружен:', template.name);
        }
    },

    async insertPreset(template) {
        console.log('🧩 Вставка пресета:', template.name, `(${template.type})`);

        const templateData = await TemplatesAPI.load(template.id, template.type);
        if (!templateData || !templateData.blocks) return;

        const blocks = migrateExpertLite(templateData.blocks);

        if (typeof insertBlocksAfterSelection === 'function') {
            insertBlocksAfterSelection(blocks);
        } else {
            console.error('insertBlocksAfterSelection не найден. Проверь blockOperations.js');
        }
    },

    async updateTemplateFromCanvas(template) {
        if (!AppState.blocks.length) {
            Toast.warning('Холст пуст — нечего сохранять.');
            return;
        }
        const confirmed = await showConfirmDialog(
            `Обновить шаблон "${template.name}" текущим содержимым холста?\n\nСодержимое шаблона будет заменено.`
        );
        if (!confirmed) return;

        const preview = await generateTemplatePreview();
        const success = await TemplatesAPI.update(template.id, template.type, AppState.blocks, preview);
        if (success) {
            Toast.success(`Шаблон "${template.name}" обновлён!`);
            this.currentTemplate = template;
        }
    },

    async deleteTemplate(template) {
        if (template.type === 'shared') {
            Toast.error('Нельзя удалить общий шаблон!');
            return;
        }

        // Защита от двойного клика
        if (this._deleting) return;

        const confirmed = await showConfirmDialog(
            `Удалить шаблон "${template.name}"?\n\nЭто действие нельзя отменить.`
        );

        if (!confirmed) return;

        this._deleting = true;
        try {
            const success = await TemplatesAPI.delete(template.id, template.type);

            if (success) {
                if (this.currentTemplate?.id === template.id) {
                    this.currentTemplate = null;
                }
                await this.loadTemplates();
            }
        } finally {
            this._deleting = false;
        }
    },

    startRenaming(nameSpan, template) {
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

        const filtered = {
            shared: this.templates.shared.filter(t => t.name.toLowerCase().includes(lowerQuery)),
            personal: this.templates.personal.filter(t => t.name.toLowerCase().includes(lowerQuery))
        };

        this.renderTemplates(filtered);
    },

    async clearCanvas() {
        const hasBlocks = AppState.blocks.length > 0;

        if (!hasBlocks) {
            return;
        }

        const confirmed = await showConfirmDialog('Очистить холст?');
        if (!confirmed) return;

        AppState.blocks = [];
        this.currentTemplate = null;

        renderCanvas();
        renderSettings();

        document.querySelectorAll('.template-item').forEach(item => {
            item.classList.remove('active');
        });

        console.log('🗑️ Холст очищен');
    }
};

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
    const overlay = document.createElement('div');
    overlay.style.cssText = [
        'position:fixed;inset:0;',
        'background:rgba(0,0,0,0.55);',
        'display:flex;align-items:center;justify-content:center;',
        'z-index:10000;',
    ].join('');

    const dialog = document.createElement('div');
    dialog.style.cssText = [
        'background:#1e293b;border:1px solid #374151;border-radius:12px;',
        'padding:28px 32px;max-width:480px;width:90%;',
        'box-shadow:0 8px 32px rgba(0,0,0,0.4);',
    ].join('');

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
        const on = switchInput.checked;
        // Toggle disabled when preset (preset is always shared)
        switchRow.style.opacity = isPreset ? '0.4' : '1';
        switchRow.style.pointerEvents = isPreset ? 'none' : '';
        currentType = (isPreset || on) ? 'shared' : 'personal';
        // Category only for shared templates (not presets)
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

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    setTimeout(() => nameInput.focus(), 60);

    // --- Логика ---
    const closeDialog = () => overlay.remove();

    btnCancel.addEventListener('click', closeDialog);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeDialog(); });
    overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDialog(); });

    const saveTemplate = async () => {
        const templateName = nameInput.value.trim();
        if (!templateName) {
            Toast.warning('Введите название шаблона!');
            nameInput.focus();
            return;
        }
        const category = currentType === 'shared' ? categorySelect.value : '';
        const preview = await generateTemplatePreview();
        const savedId = await TemplatesAPI.save(templateName, AppState.blocks, currentType, category, preview);
        if (savedId) {
            closeDialog();
            Toast.success(`Шаблон "${templateName}" сохранён!`);
            TemplatesUI.currentTemplate = { id: savedId, name: templateName, type: currentType };
            if (TemplatesUI.isOpen) await TemplatesUI.loadTemplates();
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
        const savedId = await TemplatesAPI.save(presetName, blocks, 'shared', '', null, true);
        if (savedId) {
            closeDialog();
            Toast.success(`Пресет "${presetName}" сохранён!`);
            if (TemplatesUI.isOpen) await TemplatesUI.loadTemplates();
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
        btnSave.addEventListener('click', saveCurrentTemplate);
    }
});