// templatesUI.js - UI для библиотеки шаблонов

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

        // Подсчёт общего количества
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

        // Общие шаблоны + Пресеты (оба живут в shared)
        if (templatesToRender.shared && templatesToRender.shared.length > 0) {
            const presets = templatesToRender.shared.filter(isPresetTemplate);
            const sharedOnly = templatesToRender.shared.filter(t => !isPresetTemplate(t));

            if (presets.length > 0) {
                const presetsHeader = document.createElement('div');
                presetsHeader.className = 'templates-section-header';
                presetsHeader.textContent = '🧩 ПРЕСЕТЫ';
                this.list.appendChild(presetsHeader);

                presets.forEach(template => {
                    const item = this.createTemplateItem(template);
                    this.list.appendChild(item);
                });
            }

            if (sharedOnly.length > 0) {
                const sharedHeader = document.createElement('div');
                sharedHeader.className = 'templates-section-header';
                sharedHeader.textContent = '📁 ОБЩИЕ ШАБЛОНЫ';
                this.list.appendChild(sharedHeader);

                sharedOnly.forEach(template => {
                    const item = this.createTemplateItem(template);
                    this.list.appendChild(item);
                });
            }
        }


        // Личные шаблоны
        if (templatesToRender.personal && templatesToRender.personal.length > 0) {
            const personalHeader = document.createElement('div');
            personalHeader.className = 'templates-section-header';
            personalHeader.textContent = '📁 МОИ ШАБЛОНЫ';
            this.list.appendChild(personalHeader);

            templatesToRender.personal.forEach(template => {
                const item = this.createTemplateItem(template);
                this.list.appendChild(item);
            });
        }
    },

    createTemplateItem(template) {
        const div = document.createElement('div');
        div.className = 'template-item';
        div.dataset.filename = template.filename;
        div.dataset.type = template.type; // personal или shared

        const nameSpan = document.createElement('span');
        nameSpan.className = 'template-name';
        nameSpan.textContent = template.name;

        // Одиночный клик - загрузить шаблон
        nameSpan.addEventListener('click', () => {
            if (isPresetTemplate(template)) {
                this.insertPreset(template);
            } else {
                this.selectTemplate(template);
            }
        });

        // Двойной клик - редактировать название (только для личных)
        if (template.type === 'personal') {
            nameSpan.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                this.startRenaming(nameSpan, template);
            });
        }

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'template-delete';
        deleteBtn.innerHTML = '×';
        deleteBtn.title = template.type === 'shared' ? 'Нельзя удалить общий шаблон' : 'Удалить шаблон';

        // Общие шаблоны нельзя удалять
        if (template.type === 'shared') {
            deleteBtn.style.opacity = '0.3';
            deleteBtn.style.cursor = 'not-allowed';
        } else {
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteTemplate(template);
            });
        }

        div.appendChild(nameSpan);
        div.appendChild(deleteBtn);

        return div;
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

        // Логика: если есть блоки и это не только что загруженный шаблон
        const hasBlocks = AppState.blocks.length > 0;
        const isDifferentTemplate = this.currentTemplate?.filename !== template.filename;
        const wasModified = hasBlocks && isDifferentTemplate;

        if (wasModified) {
            const confirmed = confirm(
                `На холсте уже есть блоки.\n\nЗаменить их шаблоном "${template.name}"?`
            );

            if (!confirmed) return;
        }

        // Загружаем шаблон с указанием типа
        const templateData = await TemplatesAPI.load(template.filename, template.type);

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

            const activeItem = this.list.querySelector(`[data-filename="${template.filename}"]`);
            if (activeItem) {
                activeItem.classList.add('active');
            }

            console.log('✅ Шаблон загружен:', template.name);
        }
    },

    async insertPreset(template) {
        console.log('🧩 Вставка пресета:', template.name, `(${template.type})`);

        const templateData = await TemplatesAPI.load(template.filename, template.type);
        if (!templateData || !templateData.blocks) return;

        const blocks = migrateExpertLite(templateData.blocks);

        if (typeof insertBlocksAfterSelection === 'function') {
            insertBlocksAfterSelection(blocks);
        } else {
            console.error('insertBlocksAfterSelection не найден. Проверь blockOperations.js');
        }
    },

    async deleteTemplate(template) {
        if (template.type === 'shared') {
            Toast.error('Нельзя удалить общий шаблон!');
            return;
        }

        // Защита от двойного клика
        if (this._deleting) return;

        const confirmed = confirm(
            `Удалить шаблон "${template.name}"?\n\nЭто действие нельзя отменить.`
        );

        if (!confirmed) return;

        this._deleting = true;
        try {
            const success = await TemplatesAPI.delete(template.filename, template.type);

            if (success) {
                if (this.currentTemplate?.filename === template.filename) {
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
                const newFilename = await TemplatesAPI.rename(template.filename, newName, template.type);

                if (newFilename) {
                    template.name = newName;
                    template.filename = newFilename;

                    // Обновляем в списке
                    const item = nameSpan.closest('.template-item');
                    item.dataset.filename = newFilename;

                    console.log('✅ Шаблон переименован:', newName);
                }
            } else {
                // Откатываем
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

    clearCanvas() {
        const hasBlocks = AppState.blocks.length > 0;

        if (!hasBlocks) {
            return;
        }

        const confirmed = confirm('Очистить холст?');
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

// ✅ ДОБАВИТЬ НОВУЮ ФУНКЦИЮ ПОСЛЕ saveCurrentTemplate:
function showSaveTemplateDialog() {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
    `;

    const dialog = document.createElement('div');
    dialog.style.cssText = `
        background: #1e293b;
        border: 1px solid #374151;
        border-radius: 12px;
        padding: 24px;
        max-width: 500px;
        width: 90%;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    `;

    dialog.innerHTML = `
        <h3 style="margin: 0 0 16px 0; font-size: 20px; color: #dddddd;">Сохранить шаблон</h3>
        
        <input 
            type="text" 
            id="template-name-input" 
            placeholder="Введите название шаблона / пресета"
            style="
                width: 100%;
                padding: 12px;
                border: 1px solid #475569;
                border-radius: 6px;
                font-size: 14px;
                margin-bottom: 16px;
                box-sizing: border-box;
                background: #0f172a;
                color: #e5e7eb;
            "
        />
        
        <div id="category-section" style="margin-bottom: 20px;">
            <label style="display: block; margin-bottom: 8px; color: #9ca3af; font-size: 13px;">
                Категория (для общих шаблонов)
            </label>
            <div style="display: flex; gap: 8px;">
                <select 
                    id="template-category-select"
                    style="
                        flex: 1;
                        padding: 10px;
                        border: 1px solid #475569;
                        border-radius: 6px;
                        font-size: 14px;
                        background: #0f172a;
                        color: #e5e7eb;
                    "
                >
                    <option value="">— Без категории —</option>
                </select>
                <button 
                    id="add-category-btn"
                    style="
                        padding: 10px 16px;
                        background: #475569;
                        color: #e5e7eb;
                        border: none;
                        border-radius: 6px;
                        cursor: pointer;
                        font-size: 14px;
                    "
                    title="Добавить новую категорию"
                >
                    +
                </button>
            </div>
        </div>
        
        <div style="display: flex; gap: 12px; justify-content: flex-end; flex-wrap: wrap;">
            <button 
                id="save-personal-btn"
                style="
                    padding: 10px 20px;
                    background: #ff4f12;
                    color: #ffffff;
                    border: none;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 500;
                "
            >
                Личный
            </button>
            
            <button 
                id="save-shared-btn"
                style="
                    padding: 10px 20px;
                    background: #7700ff;
                    color: #ffffff;
                    border: none;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 500;
                "
            >
                Общий
            </button>

            <button 
                id="save-preset-btn"
                style="
                    padding: 10px 20px;
                    background: #d0fd51;
                    color: #1e293b;
                    border: none;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 500;
                "
            >
                Пресет
            </button>
            
            <button 
                id="save-cancel-btn"
                style="
                    padding: 10px 20px;
                    background: #374151;
                    color: #e5e7eb;
                    border: none;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 500;
                "
            >
                Отмена
            </button>
        </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const input = document.getElementById('template-name-input');
    const categorySelect = document.getElementById('template-category-select');
    const addCategoryBtn = document.getElementById('add-category-btn');
    
    // Загружаем существующие категории
    loadCategories(categorySelect);
    
    setTimeout(() => input.focus(), 100);

    const closeDialog = () => {
        document.body.removeChild(overlay);
    };

    // Добавление новой категории
    addCategoryBtn.addEventListener('click', async () => {
        const newCategory = prompt('Введите название новой категории:');
        if (newCategory && newCategory.trim()) {
            const trimmed = newCategory.trim();
            
            // Добавляем в select
            const option = document.createElement('option');
            option.value = trimmed;
            option.textContent = trimmed;
            option.selected = true;
            categorySelect.appendChild(option);
            
            // Сохраняем на сервер
            await TemplatesAPI.saveCategory(trimmed);
        }
    });

    const saveTemplate = async (type) => {
        const templateName = input.value.trim();
        const category = categorySelect.value;

        if (!templateName) {
            Toast.warning('Введите название шаблона!');
            input.focus();
            return;
        }

        // Генерируем превью
        const preview = await generateTemplatePreview();

        const success = await TemplatesAPI.save(templateName, AppState.blocks, type, category, preview);

        if (success) {
            closeDialog();

            const typeText = type === 'shared' ? 'общий' : 'личный';
            Toast.success(`Шаблон "${templateName}" сохранён!`);

            TemplatesUI.currentTemplate = {
                name: templateName,
                filename: `template_${Date.now()}.json`,
                type: type
            };

            if (TemplatesUI.isOpen) {
                await TemplatesUI.loadTemplates();
            }
        }
    };

    const savePreset = async () => {
        const raw = input.value.trim();
        if (!raw) {
            Toast.warning('Введите название пресета!');
            input.focus();
            return;
        }

        const presetName = raw;  // Имя без эмодзи — статус пресета через поле isPreset

        const blocks = getBlocksForPreset();
        if (!blocks.length) {
            Toast.warning('Нечего сохранять: выдели блоки (Ctrl/Shift) или выбери один блок.');
            return;
        }

        const success = await TemplatesAPI.save(presetName, blocks, 'shared', '', null, true);

        if (success) {
            closeDialog();
            Toast.success(`Пресет "${presetName}" сохранён!`);
            if (TemplatesUI.isOpen) await TemplatesUI.loadTemplates();
        }
    };

    document.getElementById('save-personal-btn').addEventListener('click', () => {
        saveTemplate('personal');
    });

    document.getElementById('save-shared-btn').addEventListener('click', () => {
        saveTemplate('shared');
    });

    document.getElementById('save-cancel-btn').addEventListener('click', closeDialog);

    document.getElementById('save-preset-btn').addEventListener('click', savePreset);

    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            saveTemplate('personal');
        }
    });

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            closeDialog();
        }
    });
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