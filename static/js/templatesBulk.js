// templatesBulk.js — множественное выделение шаблонов в админской панели.
//
// Ctrl/Cmd+клик добавляет или убирает шаблон, Shift+клик выделяет диапазон.
// Выделение нужно только для переноса в категорию и удаления — не для запуска:
// обычный клик и двойной клик работают как раньше, а простой клик при
// выделении его снимает. Логика выбора — в shared/templateSelection.js.
//
// Расширяет TemplatesUI (templatesUI.js) и подключается после него.

(function () {
    const BAR_ID = 'templates-selection-bar';
    const MAX_NAMES_IN_CONFIRM = 5;

    const baseInit = TemplatesUI.init;
    const baseRender = TemplatesUI.renderTemplates;

    const keyOfRow = (el) => `${el.dataset.type}:${el.dataset.id}`;

    Object.assign(TemplatesUI, {
        /** Ключи выбранных шаблонов (см. TemplateSelection.keyOf). */
        _selectedKeys: [],
        /** От какой строки считается диапазон Shift+клика. */
        _selectAnchor: null,

        init() {
            baseInit.call(this);
            this._initSelection();
        },

        renderTemplates(...args) {
            baseRender.apply(this, args);
            this._syncSelectionUI();
        },

        _initSelection() {
            if (!this.list) return;
            // Capture: перехватываем клик с Ctrl/Shift до обработчика строки (превью).
            this.list.addEventListener('click', (e) => this._onListClick(e), true);
            // Shift+клик иначе выделяет текст в названиях.
            this.list.addEventListener('mousedown', (e) => {
                if (e.shiftKey && e.target.closest('.template-item')) e.preventDefault();
            });
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && this._selectedKeys.length > 0) this.clearSelection();
            });
        },

        _onListClick(e) {
            const row = e.target.closest('.template-item');
            if (!row || !this.list.contains(row)) return;
            if (e.target.closest('.template-menu-btn, .template-item-star')) return;

            const ctrl = e.ctrlKey || e.metaKey;
            const shift = e.shiftKey;
            if (!ctrl && !shift) {
                // Обычный клик снимает выделение и работает как раньше (превью).
                if (this._selectedKeys.length > 0) this.clearSelection();
                return;
            }

            e.preventDefault();
            e.stopPropagation();
            if (this._rowPreviewClickTimer) {
                window.clearTimeout(this._rowPreviewClickTimer);
                this._rowPreviewClickTimer = null;
            }
            this.closeRowPreview();

            const orderedKeys = Array.from(this.list.querySelectorAll('.template-item'))
                .filter(el => el.offsetParent !== null)
                .map(keyOfRow);
            const next = TemplateSelection.applyClick(
                { keys: this._selectedKeys, anchor: this._selectAnchor },
                orderedKeys,
                keyOfRow(row),
                { ctrl, shift }
            );
            this._selectedKeys = next.keys;
            this._selectAnchor = next.anchor;
            this._syncSelectionUI();
        },

        clearSelection() {
            this._selectedKeys = [];
            this._selectAnchor = null;
            this._syncSelectionUI();
        },

        _selectedTemplates() {
            const all = [...(this.templates.shared || []), ...(this.templates.personal || [])];
            return this._selectedKeys
                .map(key => all.find(t => TemplateSelection.keyOf(t) === key))
                .filter(Boolean);
        },

        /**
         * Подсвечивает выбранные строки и перерисовывает панель действий.
         * Выбор, которого нет на экране (скрыт поиском, другая вкладка, удалён),
         * отбрасывается: иначе массовое действие зацепило бы невидимые шаблоны.
         */
        _syncSelectionUI() {
            if (!this.list) return;
            const rendered = new Set(
                Array.from(this.list.querySelectorAll('.template-item')).map(keyOfRow)
            );
            const present = new Set(this._selectedTemplates().map(TemplateSelection.keyOf));
            this._selectedKeys = this._selectedKeys.filter(k => present.has(k) && rendered.has(k));
            if (!this._selectedKeys.includes(this._selectAnchor)) this._selectAnchor = null;

            const selected = new Set(this._selectedKeys);
            this.list.querySelectorAll('.template-item').forEach(el => {
                el.classList.toggle('template-item--selected', selected.has(keyOfRow(el)));
            });
            this._renderSelectionBar();
        },

        _renderSelectionBar() {
            this.list.querySelector(`#${BAR_ID}`)?.remove();
            const items = this._selectedTemplates();
            if (items.length === 0) return;

            const caps = TemplateSelection.bulkCapabilities(items, this._isAdmin);
            const bar = document.createElement('div');
            bar.id = BAR_ID;
            bar.className = 'templates-selection-bar';

            const count = document.createElement('span');
            count.className = 'templates-selection-bar__count';
            count.textContent = `Выбрано: ${items.length}`;
            bar.appendChild(count);

            const addButton = (label, { enabled, title, danger = false, icon = false, onClick }) => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'templates-selection-bar__btn'
                    + (danger ? ' templates-selection-bar__btn--danger' : '')
                    + (icon ? ' templates-selection-bar__btn--icon' : '');
                btn.textContent = label;
                // Недоступное действие остаётся нажимаемым: клик объясняет причину,
                // а не «молчит», как отключённая кнопка.
                if (!enabled) {
                    btn.classList.add('templates-selection-bar__btn--blocked');
                    btn.setAttribute('aria-disabled', 'true');
                }
                if (title) btn.title = title;
                btn.addEventListener('click', () => this._runBulkAction(onClick));
                bar.appendChild(btn);
            };

            addButton('Переместить', {
                enabled: caps.canMove,
                title: caps.canMove
                    ? 'Переместить выбранные в категорию'
                    : 'Перенос доступен только для общих шаблонов (админ)',
                onClick: () => this.moveSelected(),
            });
            addButton('Удалить', {
                enabled: caps.canDelete,
                danger: true,
                title: caps.canDelete ? 'Удалить выбранные' : 'Недостаточно прав для удаления',
                onClick: () => this.deleteSelected(),
            });
            addButton('✕', {
                enabled: true,
                icon: true,
                title: 'Снять выделение (Esc)',
                onClick: () => this.clearSelection(),
            });

            this.list.prepend(bar);
        },

        /** Запускает массовое действие; сбой показывается тостом, а не теряется молча. */
        async _runBulkAction(action) {
            try {
                await action();
            } catch (err) {
                console.error('Массовое действие с шаблонами не выполнено:', err);
                Toast.error('Не удалось выполнить действие с выбранными шаблонами.');
            }
        },

        /** Переносит выбранные общие шаблоны в одну выбранную категорию. */
        async moveSelected() {
            const items = this._selectedTemplates();
            if (!TemplateSelection.bulkCapabilities(items, this._isAdmin).canMove) {
                Toast.error(this._isAdmin
                    ? 'Перенос доступен только для общих шаблонов: уберите из выбора личные.'
                    : 'Перенос между категориями доступен только администратору.');
                return;
            }
            this.closeTemplatePreview();
            this.closeRowPreview();

            const categories = await TemplatesAPI.getCategories();
            const current = new Set(items.map(t => t.category || ''));
            const target = await this._pickCategory(categories, current.size === 1 ? [...current][0] : '');
            if (target === null) return;

            const toMove = items.filter(t => (t.category || '') !== target);
            let moved = 0;
            for (const template of toMove) {
                if (await TemplatesAPI.move(template.id, target, template.type)) {
                    template.category = target;
                    moved += 1;
                }
            }

            this.clearSelection();
            this.renderTemplates();
            const where = target || 'Без категории';
            if (moved === toMove.length) {
                Toast.success(`Перенесено шаблонов: ${moved} → ${where}`);
            } else {
                Toast.warning(`Перенесено ${moved} из ${toMove.length} → ${where}`);
            }
        },

        /** Удаляет выбранные шаблоны после одного общего подтверждения. */
        async deleteSelected() {
            if (this._deleting) return;
            const items = this._selectedTemplates();
            if (!TemplateSelection.bulkCapabilities(items, this._isAdmin).canDelete) {
                Toast.error('Недостаточно прав для удаления выбранных шаблонов.');
                return;
            }
            this.closeTemplatePreview();
            this.closeRowPreview();

            const names = items.slice(0, MAX_NAMES_IN_CONFIRM)
                .map(t => `«${decodeHtml(t.name)}»`).join(', ');
            const rest = items.length > MAX_NAMES_IN_CONFIRM
                ? ` и ещё ${items.length - MAX_NAMES_IN_CONFIRM}` : '';
            const confirmed = await showConfirmDialog(
                `Удалить шаблоны (${items.length}): ${names}${rest}?\n\nЭто действие нельзя отменить.`
            );
            if (!confirmed) return;

            this._deleting = true;
            const removed = new Set();
            try {
                for (const template of items) {
                    if (await TemplatesAPI.delete(template.id, template.type)) {
                        removed.add(TemplateSelection.keyOf(template));
                    }
                }
            } finally {
                this._deleting = false;
            }

            ['shared', 'personal'].forEach(type => {
                this.templates[type] = (this.templates[type] || [])
                    .filter(t => !removed.has(TemplateSelection.keyOf(t)));
            });
            if (this.currentTemplate && removed.has(TemplateSelection.keyOf(this.currentTemplate))) {
                this.currentTemplate = null;
                this.savedSnapshot = null;
                window.updateCanvasContext?.();
            }

            this.clearSelection();
            this.renderTemplates();
            if (removed.size === items.length) {
                Toast.success(`Удалено шаблонов: ${removed.size}`);
            } else {
                Toast.warning(`Удалено ${removed.size} из ${items.length}`);
            }
        },
    });
})();
