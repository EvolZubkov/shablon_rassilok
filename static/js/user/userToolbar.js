// userToolbar.js - Popup toolbar для форматирования текста

let currentEditableElement = null;
let currentLinkElement = null;
let toolbarMode = 'format'; // 'format' | 'link'

/**
 * Показать toolbar при выделении текста
 */
function showTextToolbar(element) {
    currentEditableElement = element;

    const toolbar = document.getElementById('text-toolbar');
    if (!toolbar) return;

    // Сбрасываем в режим форматирования
    setToolbarMode('format');

    // Позиционируем над элементом
    positionToolbar(element);

    // Показываем
    toolbar.style.display = 'flex';

    // Обновляем состояние кнопок
    updateToolbarState();

    // Инициализируем кнопку подложки (если ещё не создана) и обновляем её видимость
    initBackgroundButton();
    updateBgButtonVisibility();
}

/**
 * Позиционирование toolbar
 */
function positionToolbar(element) {
    const toolbar = document.getElementById('text-toolbar');
    if (!toolbar) return;

    const rect = element.getBoundingClientRect();
    const toolbarWidth = toolbar.offsetWidth || 200;
    const toolbarHeight = toolbar.offsetHeight || 40;

    let left = rect.left + rect.width / 2 - toolbarWidth / 2;
    left = Math.max(10, Math.min(left, window.innerWidth - toolbarWidth - 10));

    // Показываем над блоком, если места нет — под блоком
    let top = rect.top - toolbarHeight - 10;
    if (top < 10) top = rect.bottom + 10;

    toolbar.style.left = `${left}px`;
    toolbar.style.top = `${top}px`;  // без scrollY
}

/**
 * Скрыть toolbar
 */
function hideTextToolbar() {
    const toolbar = document.getElementById('text-toolbar');
    if (toolbar) toolbar.style.display = 'none';
    currentEditableElement = null;
    currentLinkElement = null;
    savedSelection = null; // ← добавить!
    toolbarMode = 'format';
}

/**
 * Установить режим toolbar
 */
function setToolbarMode(mode) {
    toolbarMode = mode;

    const formatMode = document.getElementById('toolbar-format-mode');
    const linkMode = document.getElementById('toolbar-link-mode');

    if (!formatMode || !linkMode) return;

    if (mode === 'format') {
        formatMode.style.display = 'flex';
        linkMode.style.display = 'none';
    } else {
        formatMode.style.display = 'none';
        linkMode.style.display = 'flex';

        // Фокус на поле ввода
        const input = document.getElementById('toolbar-link-input');
        if (input) {
            input.value = currentLinkElement ? currentLinkElement.href : 'https://';
            setTimeout(() => {
                input.focus();
                input.select();
            }, 50);
        }
    }

    // Перепозиционируем после смены режима
    if (currentEditableElement) {
        setTimeout(() => positionToolbar(currentEditableElement), 10);
    }
}

/**
 * Обновить состояние кнопок toolbar
 */
function updateToolbarState() {
    const toolbar = document.getElementById('text-toolbar');
    if (!toolbar || !currentEditableElement) return;

    // Проверяем форматирование в текущей позиции
    const isBold = document.queryCommandState('bold');
    const isItalic = document.queryCommandState('italic');

    toolbar.querySelector('[data-action="bold"]')?.classList.toggle('active', isBold);
    toolbar.querySelector('[data-action="italic"]')?.classList.toggle('active', isItalic);

    // Проверяем есть ли ссылка
    const linkElement = getSelectedLink();
    toolbar.querySelector('[data-action="link"]')?.classList.toggle('active', !!linkElement);

    // Проверяем выравнивание
    if (currentEditableElement) {
        const align = currentEditableElement.style.textAlign || 'left';
        toolbar.querySelectorAll('[data-action^="align-"]').forEach(btn => {
            const btnAlign = btn.dataset.action.replace('align-', '');
            btn.classList.toggle('active', btnAlign === align);
        });
    }
}

/**
 * Получить ссылку в текущем выделении или под курсором
 */
function getSelectedLink() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;

    // Проверяем родительские элементы выделения
    let node = selection.anchorNode;
    while (node && node !== currentEditableElement) {
        if (node.nodeName === 'A') {
            return node;
        }
        node = node.parentNode;
    }

    // Проверяем focusNode тоже
    node = selection.focusNode;
    while (node && node !== currentEditableElement) {
        if (node.nodeName === 'A') {
            return node;
        }
        node = node.parentNode;
    }

    return null;
}

/**
 * Сохранить выделение
 */
let savedSelection = null;

function saveSelection() {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
        savedSelection = selection.getRangeAt(0).cloneRange();
    }
}

function restoreSelection() {
    if (savedSelection) {
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(savedSelection);
    }
}

/**
 * Инициализация toolbar
 */
function initTextToolbar() {
    const toolbar = document.getElementById('text-toolbar');
    if (!toolbar) {
        createToolbarHTML();
        return;
    }

    initToolbarHandlers();
}

/**
 * Создать HTML toolbar если его нет
 */
function createToolbarHTML() {
    // Toolbar должен быть в HTML, но на всякий случай проверяем
    const existing = document.getElementById('text-toolbar');
    if (existing) {
        initToolbarHandlers();
        return;
    }

    const toolbar = document.createElement('div');
    toolbar.id = 'text-toolbar';
    toolbar.className = 'text-toolbar';
    toolbar.style.display = 'none';
    toolbar.innerHTML = `
        <!-- Режим форматирования -->
        <div id="toolbar-format-mode" class="toolbar-mode" style="display: flex;">
            <button type="button" class="toolbar-btn" data-action="bold" title="Жирный">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"></path>
                    <path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"></path>
                </svg>
            </button>
            <button type="button" class="toolbar-btn" data-action="italic" title="Курсив">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="19" y1="4" x2="10" y2="4"></line>
                    <line x1="14" y1="20" x2="5" y2="20"></line>
                    <line x1="15" y1="4" x2="9" y2="20"></line>
                </svg>
            </button>
            <button type="button" class="toolbar-btn" data-action="link" title="Ссылка">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                </svg>
            </button>
            <div class="toolbar-divider"></div>
            <button type="button" class="toolbar-btn" data-action="align-left" title="По левому краю">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="17" y1="10" x2="3" y2="10"></line>
                    <line x1="21" y1="6" x2="3" y2="6"></line>
                    <line x1="21" y1="14" x2="3" y2="14"></line>
                    <line x1="17" y1="18" x2="3" y2="18"></line>
                </svg>
            </button>
            <button type="button" class="toolbar-btn" data-action="align-center" title="По центру">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="10" x2="6" y2="10"></line>
                    <line x1="21" y1="6" x2="3" y2="6"></line>
                    <line x1="21" y1="14" x2="3" y2="14"></line>
                    <line x1="18" y1="18" x2="6" y2="18"></line>
                </svg>
            </button>
            <button type="button" class="toolbar-btn" data-action="align-right" title="По правому краю">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="21" y1="10" x2="7" y2="10"></line>
                    <line x1="21" y1="6" x2="3" y2="6"></line>
                    <line x1="21" y1="14" x2="3" y2="14"></line>
                    <line x1="21" y1="18" x2="7" y2="18"></line>
                </svg>
            </button>
        </div>
        
        <!-- Режим редактирования ссылки -->
        <div id="toolbar-link-mode" class="toolbar-mode" style="display: none;">
            <button type="button" class="toolbar-btn" id="toolbar-link-back" title="Назад">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M19 12H5"></path>
                    <path d="M12 19l-7-7 7-7"></path>
                </svg>
            </button>
            <div class="toolbar-link-input-wrap">
                <input type="text" id="toolbar-link-input" placeholder="https://" />
            </div>
            <button type="button" class="toolbar-btn" id="toolbar-link-open" title="Открыть ссылку">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                    <polyline points="15 3 21 3 21 9"></polyline>
                    <line x1="10" y1="14" x2="21" y2="3"></line>
                </svg>
            </button>
            <button type="button" class="toolbar-btn toolbar-btn-success" id="toolbar-link-apply" title="Применить">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
            </button>
            <button type="button" class="toolbar-btn toolbar-btn-danger" id="toolbar-link-remove" title="Удалить ссылку">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        </div>
    `;

    document.body.appendChild(toolbar);
    initToolbarHandlers();
}

/**
 * Инициализация обработчиков toolbar
 */
function initToolbarHandlers() {
    const toolbar = document.getElementById('text-toolbar');
    if (!toolbar) return;

    // Кнопки форматирования
    toolbar.querySelectorAll('#toolbar-format-mode .toolbar-btn').forEach(btn => {
        // mousedown с preventDefault — не даём браузеру снять фокус с contenteditable
        btn.addEventListener('mousedown', (e) => {
            e.preventDefault();
        });
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const action = btn.dataset.action;
            handleToolbarAction(action);
        });
    });

    // Кнопка "Назад" из режима ссылки
    document.getElementById('toolbar-link-back')?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        restoreSelection();
        setToolbarMode('format');
    });

    // Кнопка "Открыть ссылку"
    document.getElementById('toolbar-link-open')?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const input = document.getElementById('toolbar-link-input');
        if (!input || !input.value) return;
        const url = input.value.trim();
        if (!url || url === 'https://') return;
        // QWebEngineView blocks window.open(); use the Flask proxy instead.
        fetch('/api/open-url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url }),
        }).catch(() => {
            // Fallback for browser mode (no Flask).
            window.open(url, '_blank');
        });
    });

    // Кнопка "Применить ссылку"
    document.getElementById('toolbar-link-apply')?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        applyLink();
    });

    // Кнопка "Удалить ссылку"
    document.getElementById('toolbar-link-remove')?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        removeLink();
    });

    // Enter в поле ввода ссылки
    document.getElementById('toolbar-link-input')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            applyLink();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            restoreSelection();
            setToolbarMode('format');
        }
    });

    // Обновляем состояние при изменении выделения
    document.addEventListener('selectionchange', () => {
        if (currentEditableElement && toolbarMode === 'format') {
            updateToolbarState();
        }
    });

    // Кнопка вставки плейсхолдера (добавляется только один раз)
    initBulkMailFieldButton();
}

/**
 * Обработка действий toolbar
 */
function handleToolbarAction(action) {
    if (!currentEditableElement) return;

    // Фокусируемся на элементе
    currentEditableElement.focus();

    // Восстанавливаем выделение если потеряли фокус при клике на toolbar
    if (savedSelection) {
        restoreSelection();
    }

    switch (action) {
        case 'bold':
            document.execCommand('bold', false, null);
            break;

        case 'italic':
            document.execCommand('italic', false, null);
            break;

        case 'link':
            handleLinkAction();
            return; // Не сохраняем сразу

        case 'align-left':
            setTextAlign('left');
            break;

        case 'align-center':
            setTextAlign('center');
            break;

        case 'align-right':
            setTextAlign('right');
            break;
    }

    // Сохраняем изменения
    setTimeout(() => {
        saveTextChanges(currentEditableElement);
        updateToolbarState();
    }, 10);
}

/**
 * Обработка действия со ссылкой
 */
function handleLinkAction() {
    
    // Сохраняем выделение
    saveSelection();

    const existingLink = getSelectedLink();
    currentLinkElement = existingLink;

    
    // Переключаем toolbar в режим ссылки
    setToolbarMode('link');
}

/**
 * Применить ссылку
 */
function applyLink() {
    const input = document.getElementById('toolbar-link-input');
    if (!input) return;

    const url = input.value.trim();
    if (!url) {
        Toast.warning('Введите URL');
        return;
    }

    currentEditableElement?.focus();
    restoreSelection();

    if (currentLinkElement) {
        currentLinkElement.href = url;
    } else {
        const selection = window.getSelection();
        if (!selection || selection.toString().length === 0) {
            Toast.warning('Сначала выделите текст для ссылки');
            setToolbarMode('format');
            savedSelection = null; // ← сбрасываем!
            return;
        }

        document.execCommand('createLink', false, url);

        const links = currentEditableElement?.querySelectorAll('a');
        links?.forEach(link => {
            if (!link.style.color) {
                link.style.color = '#7700ff';
            }
        });
    }

    if (currentEditableElement) {
        saveTextChanges(currentEditableElement);
    }

    currentLinkElement = null;
    savedSelection = null; // ← сбрасываем после применения!
    setToolbarMode('format');
    updateToolbarState();
}

/**
 * Удалить ссылку
 */
function removeLink() {
    if (!currentLinkElement) {
        setToolbarMode('format');
        return;
    }

    restoreSelection();
    currentEditableElement?.focus();

    const textContent = currentLinkElement.textContent;
    const textNode = document.createTextNode(textContent);
    currentLinkElement.parentNode?.replaceChild(textNode, currentLinkElement);

    if (currentEditableElement) {
        saveTextChanges(currentEditableElement);
    }

    currentLinkElement = null;
    savedSelection = null; // ← сбрасываем!
    setToolbarMode('format');
    updateToolbarState();
}

/**
 * Установка выравнивания текста
 */
function setTextAlign(align) {
    if (!currentEditableElement) return;

    currentEditableElement.style.textAlign = align;

    // Также обновляем блок
    const blockId = parseInt(currentEditableElement.dataset.blockId);
    const block = findBlockDeep(UserAppState.blocks, blockId);
    if (block) {
        block.settings.align = align;
    }
}

// ============================================================================
// ПАТЧ для userToolbar.js — кнопка вставки плейсхолдера из массовой рассылки
// Добавить в конец файла userToolbar.js (перед последней строкой)
// ============================================================================

function initBulkMailFieldButton() {
    const formatMode = document.getElementById('toolbar-format-mode');
    if (!formatMode || document.getElementById('toolbar-btn-field')) return;

    // Разделитель
    const sep = document.createElement('div');
    sep.className = 'toolbar-divider';
    formatMode.appendChild(sep);

    // Кнопка — только иконка, как остальные
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'toolbar-btn-field';
    btn.className = 'toolbar-btn';
    btn.title = 'Вставить поле из таблицы';
    btn.style.display = 'none';
    btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3m8 0h3a2 2 0 0 0 2-2v-3"/>
        <text x="7" y="15" font-size="8" fill="currentColor" stroke="none" font-weight="700">{}</text>
    </svg>`;
    formatMode.appendChild(btn);

    // Выпадушка
    const dropdown = document.createElement('div');
    dropdown.id = 'toolbar-field-dropdown';
    dropdown.style.cssText = `
        display:none;position:fixed;z-index:9999;
        background:var(--bg-secondary,#1e293b);
        border:1px solid var(--border-color,#334155);
        border-radius:8px;min-width:180px;max-height:260px;
        overflow-y:auto;box-shadow:0 8px 24px rgba(0,0,0,0.6);
        padding:4px;
    `;
    document.body.appendChild(dropdown);

    btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const isOpen = dropdown.style.display === 'block';
        if (isOpen) { hideFieldDropdown(); return; }

        const columns = (typeof BulkMail !== 'undefined') ? BulkMail.getColumns() : [];
        if (!columns.length) {
            if (typeof Toast !== 'undefined') Toast.warning('Сначала загрузите файл с данными');
            return;
        }

        saveSelection();

        dropdown.innerHTML = `
            <div style="padding:5px 8px 4px;font-size:10px;color:var(--text-muted,#9ca3af);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border-color,#334155);margin-bottom:3px">
                Поля из таблицы
            </div>
            ${columns.map(col => `
            <div class="bm-field-option" data-col="${col}"
                 style="padding:7px 10px;border-radius:5px;cursor:pointer;font-size:13px;
                        color:var(--text-primary,#f9fafb);display:flex;align-items:center;gap:8px;transition:background .1s">
                <span style="font-size:11px;font-family:monospace;color:var(--accent-primary,#f97316);
                             background:rgba(249,115,22,0.1);border:1px solid rgba(249,115,22,0.25);
                             border-radius:3px;padding:1px 4px;flex-shrink:0">{{}}</span>
                ${col}
            </div>`).join('')}`;

        dropdown.querySelectorAll('.bm-field-option').forEach(opt => {
            opt.addEventListener('mouseenter', () => opt.style.background = 'var(--bg-hover,#334155)');
            opt.addEventListener('mouseleave', () => opt.style.background = '');
            opt.addEventListener('mousedown', (ev) => {
                ev.preventDefault();
                insertField(opt.dataset.col);
                // Keep dropdown open so the user can insert multiple fields in a row
            });
        });

        // Позиция под кнопкой
        const r = btn.getBoundingClientRect();
        dropdown.style.display = 'block';
        const dw = dropdown.offsetWidth;
        let left = r.left;
        if (left + dw > window.innerWidth - 8) left = window.innerWidth - dw - 8;
        dropdown.style.left = left + 'px';
        dropdown.style.top = (r.bottom + 4) + 'px';
    });

    document.addEventListener('mousedown', (e) => {
        if (!dropdown.contains(e.target) && e.target !== btn) hideFieldDropdown();
    });
}

function hideFieldDropdown() {
    const d = document.getElementById('toolbar-field-dropdown');
    if (d) d.style.display = 'none';
}

function insertField(columnName) {
    restoreSelection();
    if (currentEditableElement) currentEditableElement.focus();

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    range.deleteContents();

    const span = document.createElement('span');
    span.className = 'bm-inline-ph';
    span.contentEditable = 'false';
    span.dataset.placeholder = columnName;
    span.textContent = `{{${columnName}}}`;

    range.insertNode(span);

    // Курсор после span
    const newRange = document.createRange();
    newRange.setStartAfter(span);
    newRange.collapse(true);
    selection.removeAllRanges();
    selection.addRange(newRange);

    // Update savedSelection so the next field insertion from the open dropdown
    // lands at the current cursor position (right after the span just inserted)
    savedSelection = newRange.cloneRange();

    // Re-scan the canvas so the bulk-mail panel picks up the newly inserted placeholder
    if (typeof BulkMailPanel !== 'undefined' && typeof BulkMailPanel.detectPlaceholders === 'function') {
        BulkMailPanel.detectPlaceholders();
    }
}

function setBulkMailColumnsAvailable(available) {
    const fieldBtn = document.getElementById('toolbar-btn-field');
    if (fieldBtn) fieldBtn.style.display = available ? 'flex' : 'none';
    if (!available) hideFieldDropdown();
    const sendBtn = document.getElementById('btn-bulk-send');
    if (sendBtn) sendBtn.style.display = available ? '' : 'none';
    // Скрываем кнопки одиночной отправки когда активна рассылка
    const display = available ? 'none' : '';
    document.getElementById('btn-send-outlook')?.style.setProperty('display', display, available ? 'important' : '');
    document.getElementById('btn-send-meeting')?.style.setProperty('display', display, available ? 'important' : '');
}

// ============================================================================
// Кнопка «Подложка» — управление capability background прямо из тулбара
// ============================================================================

function initBackgroundButton() {
    const formatMode = document.getElementById('toolbar-format-mode');
    if (!formatMode || document.getElementById('toolbar-btn-bg')) return;

    // Разделитель перед кнопкой
    const sep = document.createElement('div');
    sep.className = 'toolbar-divider';
    formatMode.appendChild(sep);

    // Кнопка с иконкой «квадрат с заливкой»
    const btn = document.createElement('button');
    btn.type  = 'button';
    btn.id    = 'toolbar-btn-bg';
    btn.className = 'toolbar-btn';
    btn.title = 'Подложка блока';
    btn.style.display = 'none';
    btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="18" height="18" rx="3" stroke-width="2"/>
        <rect x="7" y="7" width="10" height="10" rx="1" fill="currentColor" stroke="none"/>
    </svg>`;
    formatMode.appendChild(btn);

    // Попап-панель
    const panel = document.createElement('div');
    panel.id = 'bg-cap-panel';
    panel.style.cssText = `
        display:none; position:fixed; z-index:99999;
        background:var(--bg-secondary,#1e293b);
        border:1px solid var(--border-color,#334155);
        border-radius:10px; width:220px;
        box-shadow:0 8px 32px rgba(0,0,0,.55);
        padding:12px 14px; box-sizing:border-box;
    `;
    document.body.appendChild(panel);

    // Закрытие по клику вне панели
    document.addEventListener('mousedown', (e) => {
        if (!panel.contains(e.target) && e.target !== btn) {
            panel.style.display = 'none';
        }
    }, true);

    btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (panel.style.display === 'block') { panel.style.display = 'none'; return; }
        _openBgPanel(panel, btn);
    });
}

function _getActiveBlock() {
    if (!currentEditableElement) return null;
    const el = currentEditableElement.closest('[data-block-id]');
    if (!el) return null;
    const id = parseInt(el.dataset.blockId);
    return findBlockByIdDeep(UserAppState.blocks, id) || null;
}

function _openBgPanel(panel, btn) {
    const block = _getActiveBlock();
    if (!block) return;

    // Показываем кнопку только если у блока есть capability background
    const caps = (typeof ProfileLoader !== 'undefined' && ProfileLoader.loaded)
        ? ProfileLoader.getCapabilities(block.type)
        : [];
    if (!caps.includes('background')) return;

    const s       = block.settings || {};
    const enabled = s.bgEnabled !== false;
    const color   = s.bgColor   || '#1e293b';
    const radius  = s.bgRadius  ?? 8;
    const padding = s.bgPadding ?? 16;

    panel.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
            <span style="font-size:12px;font-weight:600;color:var(--text-secondary,#e5e7eb)">Подложка</span>
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px;color:var(--text-muted,#9ca3af)">
                <input type="checkbox" id="bgcap-enabled" ${enabled ? 'checked' : ''}>
                ${enabled ? 'Вкл' : 'Выкл'}
            </label>
        </div>
        <div id="bgcap-controls" style="display:${enabled ? 'flex' : 'none'};flex-direction:column;gap:10px">
            <div>
                <div style="font-size:11px;color:var(--text-muted,#9ca3af);margin-bottom:4px">Цвет</div>
                <div style="display:flex;align-items:center;gap:8px">
                    <button type="button" id="bgcap-color-trigger"
                            style="width:36px;height:28px;border:none;border-radius:5px;cursor:pointer;flex-shrink:0;background:${color}"></button>
                    <span id="bgcap-color-hex"
                          style="flex:1;height:28px;line-height:28px;padding:0 8px;border:1px solid var(--border-color,#334155);
                                 border-radius:5px;background:var(--bg-primary,#0f172a);
                                 color:var(--text-primary,#f9fafb);font-size:12px;font-family:monospace">${color.toUpperCase()}</span>
                </div>
            </div>
            <div>
                <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted,#9ca3af);margin-bottom:4px">
                    <span>Отступ</span><span id="bgcap-padding-val">${padding}px</span>
                </div>
                <input type="range" id="bgcap-padding" min="0" max="48" step="1" value="${padding}"
                       style="width:100%;accent-color:var(--accent-primary,#f97316)">
            </div>
        </div>
    `;

    // Позиционируем под кнопкой
    const r = btn.getBoundingClientRect();
    panel.style.display = 'block';
    let left = r.left;
    if (left + 220 > window.innerWidth - 8) left = window.innerWidth - 228;
    panel.style.left = left + 'px';
    panel.style.top  = (r.bottom + 6) + 'px';

    // Хелпер: обновить настройку + перерисовать
    function applyBg(key, val) {
        block.settings[key] = val;
        UserAppState.isDirty = true;
        if (typeof renderUserCanvas === 'function') renderUserCanvas();
    }

    // Авто-цвет текста под фон (использует isLightColorPreview из blockPreview.js)
    function adaptTextColor(bgHex) {
        if (typeof isLightColorPreview !== 'function') return;
        block.settings.color = isLightColorPreview(bgHex) ? '#1D2533' : '#ffffff';
    }

    // Чекбокс вкл/выкл
    panel.querySelector('#bgcap-enabled').addEventListener('change', function () {
        applyBg('bgEnabled', this.checked);
        if (this.checked) adaptTextColor(block.settings.bgColor || '#1e293b');
        panel.querySelector('#bgcap-controls').style.display = this.checked ? 'flex' : 'none';
        this.nextSibling.textContent = this.checked ? ' Вкл' : ' Выкл';
    });

    // Цвет — используем кастомную палитру (colorPicker.js)
    bindColorTrigger({
        trigger:   panel.querySelector('#bgcap-color-trigger'),
        valueNode: panel.querySelector('#bgcap-color-hex'),
        title: 'Цвет подложки',
        currentColor: color,
        allowTransparent: false,
        onApply: (chosen) => {
            applyBg('bgColor', chosen);
            adaptTextColor(chosen);
        },
    });

    // Отступ
    panel.querySelector('#bgcap-padding').addEventListener('input', function () {
        panel.querySelector('#bgcap-padding-val').textContent = this.value + 'px';
        applyBg('bgPadding', parseInt(this.value));
    });
}

/** Показывать/скрывать кнопку подложки в зависимости от выбранного блока */
function updateBgButtonVisibility() {
    const btn = document.getElementById('toolbar-btn-bg');
    if (!btn) return;

    const block = _getActiveBlock();
    if (!block) { btn.style.display = 'none'; return; }

    const caps = (typeof ProfileLoader !== 'undefined' && ProfileLoader.loaded)
        ? ProfileLoader.getCapabilities(block.type)
        : [];

    btn.style.display = caps.includes('background') ? 'flex' : 'none';

    // Подсвечиваем кнопку если подложка включена
    const enabled = block.settings?.bgEnabled !== false && block.settings?.bgColor;
    btn.style.background = enabled ? 'rgba(249,115,22,.18)' : '';
    btn.style.color      = enabled ? 'var(--accent-primary,#f97316)' : '';
}

// Инициализируем toolbar при загрузке
document.addEventListener('DOMContentLoaded', () => {
    initTextToolbar();
    // initBackgroundButton вызывается после того как toolbar создан
    setTimeout(initBackgroundButton, 0);
});