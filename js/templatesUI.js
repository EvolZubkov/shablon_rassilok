// templatesUI.js - UI для библиотеки шаблонов

const TemplatesUI = {
    panel: null,
    overlay: null,
    list: null,
    searchInput: null,
    isOpen: false,
    templates: [],
    currentTemplate: null,

    init() {
        this.panel = document.getElementById('templates-panel');
        this.overlay = document.getElementById('templates-overlay');
        this.list = document.getElementById('templates-list');
        this.searchInput = document.getElementById('templates-search-input');

        // Кнопка открытия/закрытия
        document.getElementById('btn-toggle-templates').addEventListener('click', () => {
            this.toggle();
        });

        // Закрытие по клику на overlay
        this.overlay.addEventListener('click', () => {
            this.close();
        });

        // Поиск
        this.searchInput.addEventListener('input', (e) => {
            this.filterTemplates(e.target.value);
        });

        // Кнопка очистки холста
        document.getElementById('btn-clear-canvas').addEventListener('click', () => {
            this.clearCanvas();
        });

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
        this.searchInput.value = '';
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
        this.renderTemplates();
    },

    renderTemplates(filteredTemplates = null) {
        const templatesToRender = filteredTemplates || this.templates;

        if (templatesToRender.length === 0) {
            this.list.innerHTML = `
                <div class="templates-empty">
                    ${filteredTemplates ? 'Ничего не найдено' : 'Нет сохранённых шаблонов'}
                </div>
            `;
            return;
        }

        this.list.innerHTML = '';

        templatesToRender.forEach(template => {
            const item = this.createTemplateItem(template);
            this.list.appendChild(item);
        });
    },

    createTemplateItem(template) {
        const div = document.createElement('div');
        div.className = 'template-item';
        div.dataset.filename = template.filename;

        const nameSpan = document.createElement('span');
        nameSpan.className = 'template-name';
        nameSpan.textContent = template.name;

        // Одиночный клик - загрузить шаблон
        nameSpan.addEventListener('click', () => {
            this.selectTemplate(template);
        });

        // Двойной клик - редактировать название
        nameSpan.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            this.startRenaming(nameSpan, template);
        });

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'template-delete';
        deleteBtn.innerHTML = '×';
        deleteBtn.title = 'Удалить шаблон';

        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.deleteTemplate(template);
        });

        div.appendChild(nameSpan);
        div.appendChild(deleteBtn);

        return div;
    },

    async selectTemplate(template) {
        console.log('📥 Загрузка шаблона:', template.name);

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

        // Загружаем шаблон
        const templateData = await TemplatesAPI.load(template.filename);

        if (templateData && templateData.blocks) {
            AppState.blocks = templateData.blocks;
            this.currentTemplate = template;

            renderCanvas();
            renderSettings();

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

    async deleteTemplate(template) {
        const confirmed = confirm(
            `Удалить шаблон "${template.name}"?\n\nЭто действие нельзя отменить.`
        );

        if (!confirmed) return;

        const success = await TemplatesAPI.delete(template.filename);

        if (success) {
            // Если удалили активный шаблон
            if (this.currentTemplate?.filename === template.filename) {
                this.currentTemplate = null;
            }

            // Перезагружаем список
            await this.loadTemplates();
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
                const newFilename = await TemplatesAPI.rename(template.filename, newName);

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

        const filtered = this.templates.filter(template =>
            template.name.toLowerCase().includes(lowerQuery)
        );

        this.renderTemplates(filtered);
    },

    clearCanvas() {
        const hasBlocks = AppState.blocks.length > 0;

        if (!hasBlocks) {
            // Холст уже пуст
            return;
        }

        // Проверяем: это свежезагруженный шаблон или пользователь что-то менял
        const isTemplateUnmodified = this.currentTemplate !== null;

        if (isTemplateUnmodified) {
            // Просто очищаем
            const confirmed = confirm('Очистить холст?');
            if (!confirmed) return;

            AppState.blocks = [];
            this.currentTemplate = null;

            renderCanvas();
            renderSettings();

            // Убираем подсветку
            document.querySelectorAll('.template-item').forEach(item => {
                item.classList.remove('active');
            });

            console.log('🗑️ Холст очищен');
        } else {
            // Пользователь что-то менял - предлагаем сохранить
            const result = confirm(
                'На холсте есть несохранённые изменения.\n\n' +
                'Сохранить как новый шаблон перед очисткой?\n\n' +
                'OK = Сохранить и очистить\n' +
                'Отмена = Очистить без сохранения'
            );

            if (result) {
                // Сохраняем
                saveCurrentTemplate();
            }

            // В любом случае очищаем
            AppState.blocks = [];
            this.currentTemplate = null;

            renderCanvas();
            renderSettings();

            document.querySelectorAll('.template-item').forEach(item => {
                item.classList.remove('active');
            });

            console.log('🗑️ Холст очищен');
        }
    }
};
// ДОБАВИТЬ ЭТУ ФУНКЦИЮ ПОСЛЕ TemplatesUI:

async function saveCurrentTemplate() {
    const hasBlocks = AppState.blocks.length > 0;

    if (!hasBlocks) {
        alert('Нечего сохранять! Добавьте блоки на холст.');
        return;
    }

    const templateName = prompt('Введите название шаблона:');

    if (!templateName || !templateName.trim()) {
        return; // Отменили
    }

    const success = await TemplatesAPI.save(templateName.trim(), AppState.blocks);

    if (success) {
        alert(`✅ Шаблон "${templateName}" сохранён!`);
        
        // Обновляем текущий шаблон
        TemplatesUI.currentTemplate = {
            name: templateName.trim(),
            filename: `template_${templateName.trim().replace(/ /g, '_')}.json`
        };

        // Если панель открыта - обновляем список
        if (TemplatesUI.isOpen) {
            await TemplatesUI.loadTemplates();
        }
    }
}

// Подключаем кнопку сохранения
document.addEventListener('DOMContentLoaded', () => {
    const btnSave = document.getElementById('btn-save-template');
    if (btnSave) {
        btnSave.addEventListener('click', saveCurrentTemplate);
    }
});