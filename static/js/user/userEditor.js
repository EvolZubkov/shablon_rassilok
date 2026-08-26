// ============================================================
// UNDO (Ctrl+Z) — последние 5 состояний
// ============================================================

/**
 * Сохранить текущее состояние блоков в стек undo
 * Вызывать ПЕРЕД любой мутацией блоков
 */
function pushUndoState() {
    if (!UserAppState.undoStack) UserAppState.undoStack = [];

    UserAppState.undoStack.push(JSON.stringify({
        blocks: UserAppState.blocks,
        selectedBlockId: UserAppState.selectedBlockId
    }));

    if (UserAppState.undoStack.length > 20) {
        UserAppState.undoStack.shift();
    }
}

/**
 * Откатить последнее действие
 */
function undoLastAction() {
    if (!UserAppState.undoStack || UserAppState.undoStack.length === 0) return;

    const prev = JSON.parse(UserAppState.undoStack.pop());
    UserAppState.blocks = prev.blocks || [];
    UserAppState.selectedBlockId = prev.selectedBlockId ?? null;
    UserAppState.isDirty = true;

    renderUserCanvas();
    showUndoToast();
}

function showUndoToast() {
    let toast = document.getElementById('undo-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'undo-toast';
        toast.style.cssText = `
            position: fixed;
            bottom: 80px;
            left: 50%;
            transform: translateX(-50%);
            background: var(--bg-secondary);
            color: var(--text-secondary);
            padding: 8px 16px;
            border-radius: 8px;
            font-size: 13px;
            z-index: 9999;
            pointer-events: none;
            border: 1px solid var(--border-secondary);
            box-shadow: var(--shadow-md);
            opacity: 0;
            transition: opacity 0.2s;
        `;
        document.body.appendChild(toast);
    }
    toast.textContent = '↩ Действие отменено';
    toast.style.opacity = '1';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, 1500);
}

// Слушаем Ctrl/Cmd + Z без зависимости от раскладки
document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.code !== 'KeyZ') return;

    const el = document.activeElement;
    const tag = el?.tagName?.toLowerCase();

    const isTypingField =
        el?.isContentEditable ||
        tag === 'input' ||
        tag === 'textarea';

    // В полях — оставляем нативный undo браузера
    if (isTypingField) return;

    e.preventDefault();
    undoLastAction();
});

// Слушаем Ctrl/Cmd + Shift + L — включить/выключить подсказки внимания
document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || !e.shiftKey || e.code !== 'KeyL') return;

    const el = document.activeElement;
    const tag = el?.tagName?.toLowerCase();

    const isTypingField =
        el?.isContentEditable ||
        tag === 'input' ||
        tag === 'textarea';

    // Не перехватываем в полях ввода
    if (isTypingField) return;

    e.preventDefault();

    UserAppState.showAttentionHints = !UserAppState.showAttentionHints;
    renderUserCanvas();

    const buttonModal = document.getElementById('button-editor-modal');
    if (buttonModal && buttonModal.style.display === 'flex') {
        updateButtonAttentionUI(buttonModal);
    }
});

// Сравненеи с оригиналом (для отображения статуса сохранения)
function findBlockByIdDeep(blocks, id) {
    for (const block of blocks || []) {
        if (block.id === id) return block;

        if (block.columns) {
            for (const col of block.columns) {
                const found = findBlockByIdDeep(col.blocks || [], id);
                if (found) return found;
            }
        }
    }
    return null;
}

function getComparableBlockSnapshot(block) {
    const clone = JSON.parse(JSON.stringify(block));
    const s = clone.settings || {};

    Object.keys(s).forEach(key => {
        if (key.startsWith('rendered')) delete s[key];
    });

    delete s._columnsCount;

    return clone;
}

function isWatchedBlockType(blockType) {
    return blockType === 'banner' || blockType === 'button';
}

function isBlockUnchanged(block) {
    const original = findBlockByIdDeep(UserAppState.originalBlocks || [], block.id);
    if (!original) return false;

    const currentSnap = JSON.stringify(getComparableBlockSnapshot(block));
    const originalSnap = JSON.stringify(getComparableBlockSnapshot(original));

    return currentSnap === originalSnap;
}

function shouldHighlightBlock(block) {
    if (!UserAppState.showAttentionHints) return false;
    if (!block || !isWatchedBlockType(block.type)) return false;

    // Базовое правило: важный блок ещё не меняли
    if (isBlockUnchanged(block)) return true;

    // Доп. правило для кнопки: нет ссылки
    if (block.type === 'button') {
        const url = String(block.settings?.url || '').trim();
        if (!url) return true;
    }

    return false;
}

function updateButtonAttentionUI(modal, block) {
    if (!modal || !block) return;

    const urlInput = modal.querySelector('#button-url-input');
    const urlGroup = urlInput?.closest('.form-group');
    const help = modal.querySelector('#button-url-help');

    if (!urlInput || !urlGroup) return;

    const currentUrl = String(urlInput.value || '').trim();

    const originalBlock = findBlockByIdDeep(UserAppState.originalBlocks || [], block.id);
    const originalUrl = String(originalBlock?.settings?.url || '').trim();

    // Подсветка, если:
    // 1) включены подсказки
    // 2) ссылка пустая ИЛИ не отличается от исходной шаблонной
    const needsAttention =
        UserAppState.showAttentionHints &&
        (!currentUrl || currentUrl === originalUrl);

    urlGroup.classList.toggle('needs-attention', needsAttention);
    urlInput.classList.toggle('needs-attention-input', needsAttention);

    if (help) {
        help.style.display = needsAttention ? 'block' : 'none';
        help.textContent = !currentUrl
            ? 'Укажите ссылку для кнопки'
            : 'Проверьте ссылку: используется исходное значение шаблона';
    }
}
// userEditor.js - Inline редактирование блоков для user-версии

/**
 * Рендер canvas с блоками для редактирования
 */
function renderUserCanvas() {
    const canvas = document.getElementById('user-canvas');
    if (!canvas) return;

    canvas.innerHTML = '';

    if (!Array.isArray(UserAppState.blocks) || UserAppState.blocks.length === 0) {
        canvas.innerHTML = `
            <div class="user-canvas-empty">
                <div class="user-canvas-empty-icon">+</div>
                <h2>Письмо пока пустое</h2>
                <p>Вернитесь к шаблонам или выберите готовую основу на стартовом экране.</p>
            </div>
        `;
        window.updateUserEditorMeta?.();
        return;
    }

    UserAppState.blocks.forEach((block, index) => {
        const blockElement = createUserBlockElement(block, index);
        canvas.appendChild(blockElement);
    });

    // Инициализируем inline-редактирование
    initInlineEditing();
    _adjustListMarkerIndents();
    window.updateUserEditorMeta?.();

    // Рендерим canvas-блоки у которых есть элементы но нет PNG
    _renderPendingCanvasBlocks(UserAppState.blocks);
}

const _canvasRenderTriedIds = new Set();
let _canvasRenderInProgress = null; // shared Promise while rendering is active

function _collectPendingCanvasBlocks(blocks) {
    const pending = [];
    const collect = (list) => {
        (list || []).forEach(b => {
            if (b.type === 'canvas' && !b.settings.renderedCanvas && (b.settings.freeElements || []).length > 0 && !_canvasRenderTriedIds.has(b.id)) pending.push(b);
            if (b.columns) b.columns.forEach(col => collect(col.blocks));
        });
    };
    collect(blocks);
    return pending;
}

function _doCanvasRenderQueue(pending) {
    _canvasRenderInProgress = new Promise(resolve => {
        let i = 0;
        const next = () => {
            if (i >= pending.length) { _canvasRenderInProgress = null; resolve(); return; }
            const b = pending[i++];
            _canvasRenderTriedIds.add(b.id);
            renderCanvasBlockToDataUrl(b, dataUrl => {
                if (dataUrl) b.settings.renderedCanvas = dataUrl;
                next();
            });
        };
        next();
    });
    return _canvasRenderInProgress;
}

function _renderPendingCanvasBlocks(blocks) {
    if (typeof renderCanvasBlockToDataUrl !== 'function') return;
    if (_canvasRenderInProgress) return; // already rendering
    const pending = _collectPendingCanvasBlocks(blocks);
    if (!pending.length) return;
    _doCanvasRenderQueue(pending).then(() => renderUserCanvas());
}

function _ensureCanvasBlocksRendered(blocks) {
    if (_canvasRenderInProgress) return _canvasRenderInProgress;
    if (typeof renderCanvasBlockToDataUrl !== 'function') return Promise.resolve();
    const pending = _collectPendingCanvasBlocks(blocks);
    if (!pending.length) return Promise.resolve();
    return _doCanvasRenderQueue(pending);
}

/**
 * Создание элемента блока для user-версии
 */
function createUserBlockElement(block, index) {
    const wrapper = document.createElement('div');
    wrapper.className = 'editable-block';
    wrapper.dataset.blockId = block.id;
    wrapper.dataset.blockType = block.type;

    if (block.columns) {
        // Строка с колонками — рендерим HTML
        wrapper.innerHTML = renderUserColumnsBlock(block);

        // Добавляем кнопки удаления к каждому дочернему блоку через JS
        wrapper.querySelectorAll('.editable-block--child').forEach(childEl => {
            const childId = parseInt(childEl.dataset.blockId);
            const childBlock = findBlockByIdDeep(UserAppState.blocks, childId);

            if (shouldHighlightBlock(childBlock)) {
                childEl.classList.add('needs-attention');
                childEl.appendChild(makeAttentionBadge(childBlock));
            }

            childEl.appendChild(makeDeleteBtn(childId));
        });

        // На самой строке — кнопка удаления всей строки, в левом верхнем углу
        const rowDeleteBtn = makeDeleteBtn(block.id);
        rowDeleteBtn.classList.add('block-delete-btn--row');
        wrapper.appendChild(rowDeleteBtn);

    } else {
        wrapper.innerHTML = renderUserSingleBlock(block);

        if (shouldHighlightBlock(block)) {
            wrapper.classList.add('needs-attention');
            wrapper.appendChild(makeAttentionBadge(block));
        }

        wrapper.appendChild(makeDeleteBtn(block.id));
    }

    return wrapper;
}

/**
 * Build a human-readable tooltip message explaining what needs to be configured.
 * @param {Object} block
 * @returns {string}
 */
function _attentionMessage(block) {
    if (block.type === 'button') {
        const url = String(block.settings?.url || '').trim();
        if (!url) return 'Укажите ссылку для кнопки';
        // URL present but block is still flagged (matches original template value)
        return 'Проверьте ссылку — используется исходное значение шаблона';
    }
    if (block.type === 'banner') {
        return 'Настройте параметры баннера: обновите логотип, иконки и заголовок';
    }
    return 'Блок требует настройки перед отправкой';
}

/**
 * Create the orange warning badge shown on blocks that need configuration.
 * @param {Object} block - The block being rendered.
 * @returns {HTMLElement}
 */
function makeAttentionBadge(block) {
    const badge = document.createElement('div');
    badge.className = 'block-attention-badge';
    badge.dataset.tooltip = _attentionMessage(block);
    badge.title = 'Нажмите, чтобы настроить';
    badge.style.cursor = 'pointer';
    badge.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="m10.29 3.86-8.18 14.14A2 2 0 0 0 3.84 21h16.32a2 2 0 0 0 1.73-3l-8.18-14.14a2 2 0 0 0-3.42 0z"></path>
            <path d="M12 9v4"></path>
            <path d="M12 17h.01"></path>
        </svg>
    `;

    badge.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = block.id;
        switch (block.type) {
            case 'button':  openButtonEditor(id);  break;
            case 'banner':  openBannerEditor(id);  break;
            case 'image':   openImagePicker(id);   break;
            case 'list':    openListEditor(id);    break;
            case 'divider': openDividerEditor(id); break;
            case 'expert':  openExpertEditor(id);  break;
            case 'canvas':  openCanvasEditor(id);  break;
            case 'table':   openTableEditor(id);   break;
            default: break;
        }
    });

    return badge;
}

/**
 * Создать кнопку удаления блока
 */
function makeDeleteBtn(blockId) {
    const btn = document.createElement('button');
    btn.className = 'block-delete-btn';
    btn.title = 'Удалить блок';
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
        <path d="M10 11v6M14 11v6"></path>
        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>
    </svg>`;
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteBlock(blockId);
    });
    return btn;
}

/**
 * Удалить блок по ID
 */
function deleteBlock(blockId) {
    // 1. Верхний уровень (обычные блоки и строки с колонками)
    const idx = UserAppState.blocks.findIndex(b => b.id === blockId);
    if (idx !== -1) {
        pushUndoState();
        UserAppState.blocks.splice(idx, 1);
        cancelBannerRender(blockId);
        UserAppState.isDirty = true;
        renderUserCanvas();
        return;
    }

    // 2. Дочерние блоки внутри колонок
    for (let bi = 0; bi < UserAppState.blocks.length; bi++) {
        const parentBlock = UserAppState.blocks[bi];
        if (!parentBlock.columns) continue;

        for (let ci = 0; ci < parentBlock.columns.length; ci++) {
            const column = parentBlock.columns[ci];
            const childIdx = (column.blocks || []).findIndex(b => b.id === blockId);
            if (childIdx === -1) continue;

            // Удаляем дочерний блок
            pushUndoState();
            column.blocks.splice(childIdx, 1);
            cancelBannerRender(blockId);

            // Если колонка опустела — удаляем её и пересчитываем ширины
            if (column.blocks.length === 0) {
                parentBlock.columns.splice(ci, 1);

                const remaining = parentBlock.columns.length;
                if (remaining === 0) {
                    // Все колонки пусты — удаляем всю строку
                    UserAppState.blocks.splice(bi, 1);
                } else {
                    const widthMap = { 1: 100, 2: 50, 3: 33 };
                    const newWidth = widthMap[remaining] ?? Math.floor(100 / remaining);
                    parentBlock.columns.forEach(col => { col.width = newWidth; });
                }
            }

            UserAppState.isDirty = true;
            renderUserCanvas();
            return;
        }
    }
}

/**
 * Рендер одиночного блока
 */
function renderUserSingleBlock(block) {
    let html;
    switch (block.type) {
        case 'banner':    html = renderUserBanner(block);    break;
        case 'text':      html = renderUserText(block);      break;
        case 'heading':   html = renderUserHeading(block);   break;
        case 'button':    html = renderUserButton(block);    break;
        case 'list':      html = renderUserList(block);      break;
        case 'expert':    html = renderUserExpert(block);    break;
        case 'important': html = renderUserImportant(block); break;
        case 'divider':   html = renderUserDivider(block);   break;
        case 'image':     html = renderUserImage(block);     break;
        case 'spacer':    html = renderUserSpacer(block);    break;
        case 'canvas':    html = renderUserCanvasBlock(block); break;
        case 'table':     html = renderUserTable(block);       break;
        default:          html = '<p style="padding:20px;color:#999">Неизвестный блок</p>';
    }
    // Применяем capabilities (подложка, рамка, ссылка и др.) — как в admin/blockPreview.js
    if (typeof CapabilityRegistry !== 'undefined') {
        html = CapabilityRegistry.applyWrappers(html, block, 'preview');
    }
    return html;
}

/**
 * Рендер блока с колонками
 */
function renderUserColumnsBlock(block) {
    const s = block.settings || {};
    const gap = s.columnGap ?? 10;

    const columnsHTML = block.columns.map((column, index) => {
        const columnBlocks = column.blocks.map(childBlock => {
            return `<div class="editable-block editable-block--child" data-block-id="${childBlock.id}" data-block-type="${childBlock.type}" style="position:relative;">
                ${renderUserSingleBlock(childBlock)}
            </div>`;
        }).join('');

        return `<td style="width:${column.width}%; vertical-align:top; padding:${gap / 2}px; box-sizing:border-box;">
            ${columnBlocks}
        </td>`;
    }).join('');

    const table = `
        <table style="width:100%; border-collapse:collapse; table-layout:fixed;">
            <tr>${columnsHTML}</tr>
        </table>
    `;

    // Фон подложки колонок — как в admin-канвасе (canvasRenderer.js
    // renderColumnsPreview) и в письме (emailGenerator.js
    // generateColumnsHTML), которые эту настройку уже поддерживали;
    // здесь её не было вообще, поэтому фон никогда не отображался.
    if (s.bgEnabled !== false && s.bgColor) {
        return `<div style="background:${s.bgColor}; border-radius:${s.bgRadius || 0}px; padding:${s.bgPadding || 0}px;">${table}</div>`;
    }
    return table;
}

/**
 * Рендер баннера
 */
function renderUserBanner(block) {
    const s = block.settings || {};
    const src = s.renderedBanner;

    if (!src) {
        return `<div style="padding:40px; text-align:center; background:#f0f0f0; color:#666;">
            Баннер не загружен
        </div>`;
    }

    return `
        <div class="editable-banner" data-block-id="${block.id}" style="cursor:pointer;">
            <img src="${src}" style="width:100%; display:block;" alt="Баннер">
        </div>
    `;
}

/**
 * Рендер текста (редактируемый)
 */
function renderUserText(block) {
    const s = block.settings || {};
    const fontFamily = resolveTextFontFamily ? resolveTextFontFamily(s) : 'Arial, sans-serif';

    return `
        <div class="editable-text" 
             contenteditable="true" 
             data-block-id="${block.id}"
             data-field="content"
             style="
                font-size:${s.fontSize || 14}px;
                line-height:${s.lineHeight || 1.5};
                text-align:${s.align || 'left'};
                color:${(s.bgEnabled !== false && s.bgColor) ? (isLightColorPreview(s.bgColor) ? '#1D2533' : '#ffffff') : (typeof adaptColorForWhiteBackground === 'function' ? adaptColorForWhiteBackground(s.color || '#1D2533') : (s.color || '#1D2533'))};
                font-family:${fontFamily};
                padding:16px 20px;
                outline:none;
             ">
            ${s.content || 'Введите текст...'}
        </div>
    `;
}

/**
 * Точная подгонка отступа для пунктов списка (data-bullet) под РЕАЛЬНУЮ
 * ширину каждого конкретного маркера. Маркер/отступ в user-редакторе —
 * чисто CSS-эффект (::before + attr()/counter(), см. user-styles.css) с
 * ОДНИМ фиксированным padding-left на все маркеры — разные глифы (точка,
 * стрелка, квадрат) и разная длина номера ("1." vs "12.") реально занимают
 * разную ширину, поэтому фиксированное значение неточно для части из них.
 *
 * CSS не умеет измерить ширину сгенерированного контента и тут же
 * использовать её в layout — но САМ БРАУЗЕР это уже посчитал для
 * отрисовки ::before, и это можно спросить через getComputedStyle. Вызывать
 * можно только ПОСЛЕ вставки блоков в DOM (canvas.appendChild), иначе
 * getComputedStyle ещё не имеет раскладки для измерения.
 *
 * Инлайн-style, который тут проставляется, НЕ сохраняется (saveTextChanges
 * копирует только data-bullet, см. ALLOWED_TAGS.p в textSanitizer.js) —
 * пересчитывается заново при каждом renderUserCanvas(), это нормально.
 */
function _adjustListMarkerIndents() {
    document.querySelectorAll('#user-canvas .editable-text p[data-bullet]').forEach(p => {
        const before = getComputedStyle(p, '::before');
        const width = parseFloat(before.width);
        if (!isFinite(width) || width <= 0) return;
        const indent = Math.round(width);
        p.style.paddingLeft = `${indent}px`;
        p.style.textIndent = `-${indent}px`;
    });
}

/**
 * Рендер заголовка (редактируемый)
 */
function renderUserHeading(block) {
    const s = block.settings || {};
    const fontFamily = resolveTextFontFamily ? resolveTextFontFamily(s) : 'Arial, sans-serif';

    return `
        <div class="editable-text" 
             contenteditable="true" 
             data-block-id="${block.id}"
             data-field="text"
             style="
                font-size:${s.size || 24}px;
                font-weight:${s.weight || 'bold'};
                text-align:${s.align || 'left'};
                color:${(s.bgEnabled !== false && s.bgColor) ? (isLightColorPreview(s.bgColor) ? '#1D2533' : '#ffffff') : (typeof adaptColorForWhiteBackground === 'function' ? adaptColorForWhiteBackground(s.color || '#1D2533') : (s.color || '#1D2533'))};
                font-family:${fontFamily};
                padding:16px 20px;
                outline:none;
             ">
            ${s.text || 'Заголовок'}
        </div>
    `;
}

function renderUserButton(block) {
    const s = block.settings || {};

    // Используем отрендеренную кнопку если есть
    if (s.renderedButton) {
        // Используем сохранённые размеры (логические, без 2x)
        const width = s.renderedButtonW ? `width="${s.renderedButtonW}"` : '';
        const height = s.renderedButtonH ? `height="${s.renderedButtonH}"` : '';

        return `
            <div class="editable-button" 
                 data-block-id="${block.id}" 
                 style="text-align:${s.align || 'center'}; cursor:pointer;">
                <img src="${s.renderedButton}" ${width} ${height} style="display:inline-block;" alt="${s.text || 'Кнопка'}">
            </div>
        `;
    }

    // Fallback
    const color = s.color || '#7700ff';
    return `
        <div class="editable-button" 
             data-block-id="${block.id}" 
             style="text-align:${s.align || 'center'}; cursor:pointer;">
            <span style="
                display:inline-block;
                padding:12px 24px;
                background:${color};
                color:#ffffff;
                border-radius:6px;
                font-weight:600;
            ">${s.text || 'Кнопка'}</span>
        </div>
    `;
}

/**
 * Рендер списка
 */
function renderUserList(block) {
    const s = block.settings || {};
    const items = s.items || [];

    if (items.length === 0) {
        return `<div style="padding:20px; color:#666;">Пустой список</div>`;
    }

    const bulletSize = s.bulletSize || 20;
    const bulletGap = s.bulletGap || 10;
    const isNumbered = s.listStyle === 'numbered';

    const itemsHTML = items.map((item, index) => {
        let bulletHTML;

        if (isNumbered && s.renderedBullets && s.renderedBullets[index]) {
            bulletHTML = `<img src="${s.renderedBullets[index]}" style="width:${bulletSize}px; height:${bulletSize}px;">`;
        } else {
            const bulletSrc = s.bulletCustom || (typeof BULLET_TYPES !== 'undefined' && BULLET_TYPES.find(b => b.id === s.bulletType || b.src === s.bulletType)?.src);
            if (bulletSrc) {
                bulletHTML = `<img src="${bulletSrc}" style="width:${bulletSize}px; height:${bulletSize}px;">`;
            } else {
                bulletHTML = `<span style="display:inline-block; width:${bulletSize}px; height:${bulletSize}px; border-radius:50%; background:#a855f7;"></span>`;
            }
        }

        return `
            <tr>
                <td style="width:${bulletSize + bulletGap}px; vertical-align:top; padding:${(s.itemSpacing || 8) / 2}px 0;">
                    ${bulletHTML}
                </td>
                <td class="editable-text"
                    contenteditable="true"
                    data-block-id="${block.id}"
                    data-field="items"
                    data-item-index="${index}"
                    style="
                        font-size:${s.fontSize || 14}px;
                        line-height:${s.lineHeight || 1.5};
                        color:#1D2533;
                        padding:${(s.itemSpacing || 8) / 2}px 0;
                        outline:none;
                    ">
                    ${formatTextForEditing(item)}
                </td>
            </tr>
        `;
    }).join('');


    return `
        <div class="editable-list" data-block-id="${block.id}" style="padding:16px 20px;">
            <table style="width:100%; border-collapse:collapse;">
                ${itemsHTML}
            </table>
        </div>
    `;
}

/**
 * Рендер таблицы (плашка-заголовок + данные). Редактируется целиком через
 * модалку openTableEditor — как banner/expert/canvas, без inline-contenteditable,
 * т.к. содержимое двумерное (строки×колонки), а не плоский список.
 */
function renderUserTable(block) {
    const s = block.settings || {};
    const columns = s.columns || [];
    const rows = s.rows || [];
    const widths = (Array.isArray(s.columnWidths) && s.columnWidths.length === columns.length)
        ? s.columnWidths
        : columns.map(() => 100 / (columns.length || 1));
    const fontFamily = (typeof resolveTextFontFamily === 'function') ? resolveTextFontFamily(s) : 'inherit';
    const fontSize = s.fontSize || 15;
    const lineHeight = s.lineHeight || 1.5;
    const headerFontSize = s.headerFontSize || 18;
    const cellPaddingV = s.cellPaddingV ?? 22;
    const cellPaddingH = s.cellPaddingH ?? 40;
    const dividerColor = s.dividerColor || '#FFFFFF';
    const containerBg = s.containerBg || '#EBF1F6';
    const containerRadius = s.containerRadius ?? 28;
    const linkColor = s.linkColor || '#475569';
    const cellTextAlign = ['left', 'center', 'right'].includes(s.cellTextAlign) ? s.cellTextAlign : 'left';
    const scope = `tbl-user-${block.id}`;

    const renderCell = (value) => TextSanitizer.render(
        typeof value === 'string' && value.trim().startsWith('<')
            ? value
            : TextSanitizer.sanitize(value || '', true),
        linkColor
    );

    const safeTitleBarSrc = typeof s.renderedTitleBar === 'string' ? s.renderedTitleBar.replace(/"/g, '&quot;') : '';
    const titleBar = s.renderedTitleBar
        ? `<img src="${safeTitleBarSrc}" style="display:block; width:100%; height:auto;" alt="">`
        : `<div style="padding:20px; color:#9ca3af; font-size:13px; background:#1e293b; border-radius:${s.titleRadius ?? 24}px;">⏳ Рендеринг заголовка...</div>`;

    // Цвет — inline style с !important: единственный способ гарантированно
    // победить внешнее правило [data-theme="light"] .block-content td { color:
    // var(--text-secondary) !important; } (theme-variables.css) — inline
    // !important стоит выше любого правила из подключаемого CSS-файла.
    // Если цвет не задан вручную — авто-контраст под containerBg (как у
    // text/heading/list, см. resolveBlockTextColor в emailGenerator.js).
    const headerTextColor = s.headerTextColor || (isLightColorPreview(containerBg) ? '#00204A' : '#ffffff');
    const bodyTextColor = s.textColor || (isLightColorPreview(containerBg) ? '#334155' : '#ffffff');

    const headerRow = `
        <tr>
            ${columns.map((col, i) => `
                <td style="width:${widths[i]}%; color:${headerTextColor} !important;">${renderCell(col)}</td>
            `).join('')}
        </tr>`;

    const bodyRows = rows.map(row => `
        <tr>
            ${columns.map((col, colIndex) => `
                <td style="width:${widths[colIndex]}%; color:${bodyTextColor} !important;">${renderCell(row[colIndex])}</td>
            `).join('')}
        </tr>`).join('');

    // sc3 (класс трижды) поднимает специфичность выше глобальных правил темы
    // ([data-theme="light"] .block-content td/p/span {color:...!important}).
    // TextSanitizer.render() оборачивает текст ячейки в <p> — правило метит
    // p/span НАПРЯМУЮ, наследование от td не спасает. Поэтому цвет
    // прокидывается через `td * { color:inherit !important }`.
    const sc3 = `.${scope}.${scope}.${scope}`;
    const css = `
        .${scope} { background:${containerBg}; border-radius:${containerRadius}px; border:1px solid #E2E8F0; box-shadow:0 4px 24px rgba(0,0,0,.05); box-sizing:border-box; overflow:hidden; cursor:pointer; }
        .${scope} table { width:100%; border-collapse:collapse; table-layout:fixed; margin-top:15px; margin-bottom:20px; }
        .${scope} td { padding:${cellPaddingV}px ${cellPaddingH}px; vertical-align:middle; text-align:${cellTextAlign}; position:relative; font-family:${fontFamily}; font-size:${fontSize}px; line-height:${lineHeight}; word-break:break-word; overflow-wrap:break-word; hyphens:auto; }
        .${scope} thead td { font-size:${headerFontSize}px; font-weight:bold; }
        ${sc3} td * { color:inherit !important; }
        ${sc3} td a { color:${linkColor} !important; text-decoration:underline; }
        .${scope} thead tr td::after { content:""; position:absolute; bottom:0; height:2px; background-color:${dividerColor}; left:0; right:0; }
        .${scope} thead tr td:first-child::after { left:${cellPaddingH}px; }
        .${scope} thead tr td:last-child::after { right:${cellPaddingH}px; }
        .${scope} tbody tr:not(:last-child) td::after { content:""; position:absolute; bottom:0; height:1px; background-color:${dividerColor}; left:0; right:0; }
        .${scope} tbody tr:not(:last-child) td:first-child::after { left:${cellPaddingH}px; }
        .${scope} tbody tr:not(:last-child) td:last-child::after { right:${cellPaddingH}px; }
        .${scope} td:not(:last-child)::before { content:""; position:absolute; right:0; width:2px; background-color:${dividerColor}; top:0; bottom:0; }
        .${scope} thead td:not(:last-child)::before { top:10px; }
        .${scope} tbody tr:last-child td:not(:last-child)::before { bottom:15px; }
    `;

    return `
        <style>${css}</style>
        <div class="editable-table ${scope}" data-block-id="${block.id}">
            ${titleBar}
            <table>
                <thead>${headerRow}</thead>
                <tbody>${bodyRows}</tbody>
            </table>
        </div>
    `;
}

/**
 * Рендер эксперта
 */
function renderUserExpert(block) {
    const s = block.settings || {};

    if (s.renderedExpert) {
        return `
            <div class="editable-expert" data-block-id="${block.id}" style="padding:16px 20px; text-align:${s.align || 'left'}; cursor:pointer;">
                <img src="${s.renderedExpert}" style="max-width:100%;" alt="Эксперт">
            </div>
        `;
    }

    // Fallback - показываем заглушку
    return `
        <div class="editable-expert" data-block-id="${block.id}" style="padding:20px; cursor:pointer;">
            <div style="display:flex; align-items:center; gap:16px; padding:20px; background:#f5f5f5; border-radius:8px;">
                <div style="width:80px; height:80px; background:#ddd; border-radius:45%; transform:rotate(45deg);"></div>
                <div style="color:#666;">
                    <div style="font-weight:600;">${s.name || 'Имя эксперта'}</div>
                    <div style="font-size:13px;">${s.title || 'Должность'}</div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Рендер блока "Важно"
 */
function renderUserImportant(block) {
    const s = block.settings || {};
    const borderColor = s.borderColor || '#a855f7';
    const importantHTML = typeof s.text === 'string' && s.text.trim().startsWith('<')
        ? TextSanitizer.render(s.text, s.textColor || '#1D2533')
        : TextSanitizer.render(TextSanitizer.sanitize(s.text || '', true), s.textColor || '#1D2533');

    return `
    <div class="editable-important" data-block-id="${block.id}"
         style="padding:16px 20px; display:flex; align-items:flex-start; gap:12px; cursor:pointer;">
      ${s.icon ? `<img src="${s.renderedIcon || s.icon}" style="width:60px; flex-shrink:0;">` : ''}
      <div>
        <span class="editable-text"
              contenteditable="true"
              data-block-id="${block.id}"
              data-field="text"
              style="outline:none; color:${s.textColor || '#1D2533'};">
          ${importantHTML || 'Текст важного сообщения'}
        </span>
      </div>
    </div>
  `;
}

/**
 * Рендер разделителя
 */
function renderUserDivider(block) {
    const s = block.settings || {};
    const src = s.customImage || s.image;

    if (src) {
        return `
            <div class="editable-divider" data-block-id="${block.id}" style="padding:8px 20px; cursor:pointer;">
                <img src="${src}" style="width:100%; display:block;" alt="Разделитель">
            </div>
        `;
    }

    return `
        <div class="editable-divider" data-block-id="${block.id}" style="padding:20px; text-align:center; cursor:pointer;">
            <div style="padding:20px; border:2px dashed #ddd; border-radius:8px; color:#999;">
                Нажмите чтобы выбрать разделитель
            </div>
        </div>
    `;
}

/**
 * Рендер картинки
 */
function renderUserImage(block) {
    const s = block.settings || {};
    const src = s.renderedImage || s.src;

    if (!src) {
        return `
            <div class="editable-image" 
                 data-block-id="${block.id}" 
                 style="padding:40px; text-align:center; background:#f5f5f5; cursor:pointer;">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="1">
                    <rect x="3" y="3" width="18" height="18" rx="2"></rect>
                    <circle cx="8.5" cy="8.5" r="1.5"></circle>
                    <path d="M21 15l-5-5L5 21"></path>
                </svg>
                <p style="color:#666; margin-top:8px;">Нажмите чтобы выбрать картинку</p>
            </div>
        `;
    }

    let borderRadius = '0';
    if (s.borderRadiusMode === 'each') {
        borderRadius = `${s.borderRadiusTL || 0}px ${s.borderRadiusTR || 0}px ${s.borderRadiusBR || 0}px ${s.borderRadiusBL || 0}px`;
    } else {
        borderRadius = `${s.borderRadiusAll || 0}px`;
    }

    return `
        <div class="editable-image" 
             data-block-id="${block.id}" 
             style="padding:16px 20px; text-align:${s.align || 'center'}; cursor:pointer;">
            <img src="${src}" 
                 style="max-width:100%; width:${s.renderedWidth || 'auto'}px; border-radius:${borderRadius};" 
                 alt="${s.alt || ''}">
        </div>
    `;
}

/**
 * Рендер отступа
 */
function renderUserSpacer(block) {
    const s = block.settings || {};
    const height = s.height || 20;

    return `<div style="height:${height}px;"></div>`;
}

function renderUserCanvasBlock(block) {
    const s = block.settings || {};
    const inner = s.renderedCanvas
        ? `<img src="${s.renderedCanvas}" style="display:block;width:100%;height:auto;border:0;" alt="">`
        : (typeof renderCanvasBlockPreview === 'function'
            ? renderCanvasBlockPreview(block)
            : `<div style="height:${s.height||250}px;background:${s.bgEnabled!==false?s.bgColor||'#1D2533':'transparent'};"></div>`);
    return `<div class="editable-canvas" data-block-id="${block.id}" style="cursor:pointer;position:relative;">${inner}</div>`;
}

/**
 * Форматирование текста для редактирования (конвертация markdown в HTML)
 */
function formatTextForEditing(text) {
    if (!text) return '';

    let html = text;

    // Bold **text**
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // Italic *text*
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // Links [text](url)
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:#7700ff;">$1</a>');

    // Line breaks
    html = html.replace(/\n/g, '<br>');

    return html;
}

/**
 * Конвертация HTML обратно в markdown
 */
function htmlToMarkdown(html) {
    if (!html) return '';

    let text = html;

    // Strong -> **
    text = text.replace(/<strong>([^<]+)<\/strong>/gi, '**$1**');
    text = text.replace(/<b>([^<]+)<\/b>/gi, '**$1**');

    // Em -> *
    text = text.replace(/<em>([^<]+)<\/em>/gi, '*$1*');
    text = text.replace(/<i>([^<]+)<\/i>/gi, '*$1*');

    // Links -> [text](url)
    text = text.replace(/<a[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/gi, '[$2]($1)');

    // BR -> \n
    text = text.replace(/<br\s*\/?>/gi, '\n');

    // Remove other tags
    text = text.replace(/<[^>]+>/g, '');

    // Decode HTML entities
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    text = textarea.value;

    return text;
}

/**
 * Инициализация inline-редактирования
 */
function initInlineEditing() {
    const canvas = document.getElementById('user-canvas');
    if (!canvas) return;

    canvas.querySelectorAll('.editable-text').forEach(el => {

        el.addEventListener('blur', (e) => {
            // Сохраняем выделение ДО blur — клик по тулбару его сбросит
            const sel = window.getSelection();
            if (sel && sel.rangeCount > 0) {
                savedSelection = sel.getRangeAt(0).cloneRange();
            }
            saveTextChanges(e.target);
        });

        el.addEventListener('focus', (e) => {
            showTextToolbar(e.target);
        });

        // Сохраняем выделение при изменении мышью или клавиатурой
        el.addEventListener('mouseup', () => {
            const sel = window.getSelection();
            if (sel && sel.rangeCount > 0) {
                savedSelection = sel.getRangeAt(0).cloneRange();
            }
        });

        el.addEventListener('keyup', () => {
            const sel = window.getSelection();
            if (sel && sel.rangeCount > 0) {
                savedSelection = sel.getRangeAt(0).cloneRange();
            }
        });

        // Enter — вставляем перенос строки вместо нового параграфа
        el.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            document.execCommand('insertLineBreak');
        });

        el.addEventListener('paste', (e) => {
            e.preventDefault();
            const clipboardData = e.clipboardData || window.clipboardData;

            let pastedHTML = clipboardData.getData('text/html');
            let cleanHTML;

            if (pastedHTML && pastedHTML.trim()) {
                cleanHTML = TextSanitizer.sanitize(pastedHTML, false);
                if (!cleanHTML.trim()) {
                    const pastedText = clipboardData.getData('text/plain');
                    const normalized = pastedText
                        .replace(/\r\n/g, '\n')
                        .replace(/\r/g, '\n')
                        .replace(/([^\n])\n([^\n])/g, '$1\n\n$2');
                    cleanHTML = TextSanitizer.sanitize(normalized, true);
                }
            } else {
                const pastedText = clipboardData.getData('text/plain');
                const normalized = pastedText
                    .replace(/\r\n/g, '\n')
                    .replace(/\r/g, '\n')
                    .replace(/([^\n])\n([^\n])/g, '$1\n\n$2');
                cleanHTML = TextSanitizer.sanitize(normalized, true);
            }

            // Для заголовка — только чистый текст без тегов
            const blockType = e.target.closest('[data-block-type]')?.dataset.blockType;
            if (blockType === 'heading') {
                cleanHTML = cleanHTML
                    .replace(/<br\s*\/?>/gi, ' ')
                    .replace(/<[^>]+>/g, '')
                    .replace(/&nbsp;/g, ' ')
                    .trim();
            }

            const selection = window.getSelection();
            if (!selection.rangeCount) return;
            selection.deleteFromDocument();
            const range = selection.getRangeAt(0);
            const fragment = range.createContextualFragment(cleanHTML);
            range.insertNode(fragment);
            selection.collapseToEnd();

            saveTextChanges(e.target);

            // Читаем правильное поле через dataset
            const blockId = parseInt(e.target.dataset.blockId);
            const field = e.target.dataset.field;
            const itemIndex = e.target.dataset.itemIndex;
            const block = findBlockById(UserAppState.blocks, blockId);
            if (block) {
                let value;
                if (field === 'items' && itemIndex !== undefined) {
                    value = (block.settings.items || [])[parseInt(itemIndex)] || '';
                } else {
                    value = block.settings[field] || '';
                }
                e.target.innerHTML = blockType === 'heading'
                    ? value
                    : TextSanitizer.render(value);
                // Курсор в конец
                const r = document.createRange();
                const sel = window.getSelection();
                r.selectNodeContents(e.target);
                r.collapse(false);
                sel.removeAllRanges();
                sel.addRange(r);
            }
        });
    });

    canvas.querySelectorAll('.editable-button').forEach(el => {
        el.addEventListener('click', (e) => {
            e.preventDefault();
            const blockId = parseInt(el.dataset.blockId);
            openButtonEditor(blockId);
        });
    });

    canvas.querySelectorAll('.editable-image').forEach(el => {
        el.addEventListener('click', (e) => {
            const blockId = parseInt(el.dataset.blockId);
            openImagePicker(blockId);
        });
    });

    canvas.querySelectorAll('.editable-banner').forEach(el => {
        el.addEventListener('click', (e) => {
            const blockId = parseInt(el.dataset.blockId);
            openBannerEditor(blockId);
        });
    });

    canvas.querySelectorAll('.editable-list').forEach(el => {
        el.addEventListener('click', (e) => {
            if (!e.target.closest('.editable-text')) {
                const blockId = parseInt(el.dataset.blockId);
                openListEditor(blockId);
            }
        });
    });

    canvas.querySelectorAll('.editable-divider').forEach(el => {
        el.addEventListener('click', (e) => {
            const blockId = parseInt(el.dataset.blockId);
            openDividerEditor(blockId);
        });
    });

    canvas.querySelectorAll('.editable-expert').forEach(el => {
        el.addEventListener('click', (e) => {
            const blockId = parseInt(el.dataset.blockId);
            openExpertEditor(blockId);
        });
    });

    canvas.querySelectorAll('.editable-table').forEach(el => {
        el.addEventListener('click', (e) => {
            const blockId = parseInt(el.dataset.blockId);
            openTableEditor(blockId);
        });
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.editable-text') && !e.target.closest('.text-toolbar') && !e.target.closest('#toolbar-field-dropdown')) {
            hideTextToolbar();
        }
    });

    canvas.querySelectorAll('.editable-important').forEach(el => {
        el.addEventListener('click', (e) => {
            if (e.target.closest('.editable-text')) return;
            const blockId = parseInt(el.dataset.blockId);
            openImportantIconEditor(blockId);
        });
    });

    canvas.querySelectorAll('.editable-canvas').forEach(el => {
        el.addEventListener('click', (e) => {
            const blockId = parseInt(el.dataset.blockId);
            openCanvasEditor(blockId);
        });
    });
}

function openImportantIconEditor(blockId) {
    const block = findBlockById(UserAppState.blocks, blockId);
    if (!block) return;

    const modal = document.getElementById('important-icon-modal');
    const grid = document.getElementById('important-icon-grid');
    if (!modal || !grid) return;

    const icons = window.IMPORTANT_ICONS || [];
    const currentSrc = block.settings?.icon || '';

    grid.innerHTML = icons.map(icon => `
    <div class="divider-item ${icon.src === currentSrc ? 'selected' : ''}" data-src="${TextSanitizer.escapeHTML(icon.src)}">
      <img src="${TextSanitizer.escapeHTML(icon.src)}" alt="${TextSanitizer.escapeHTML(icon.name || '')}">
    </div>
  `).join('');

    grid.querySelectorAll('.divider-item').forEach(item => {
        item.addEventListener('click', () => {
            pushUndoState();
            block.settings.icon = item.dataset.src;
            block.settings.renderedIcon = null;
            UserAppState.isDirty = true;
            renderUserCanvas();
            modal.style.display = 'none';
        });
    });

    const closeBtn = modal.querySelector('.modal-close');
    if (closeBtn) closeBtn.onclick = () => (modal.style.display = 'none');

    const overlay = modal.querySelector('.modal-overlay');
    if (overlay) overlay.onclick = () => (modal.style.display = 'none');

    modal.style.display = 'flex';
}

/**
 * Сохранение изменений текста
 */
function saveTextChanges(element) {
    const blockId = parseInt(element.dataset.blockId);
    const field = element.dataset.field;
    const itemIndex = element.dataset.itemIndex;

    const block = findBlockById(UserAppState.blocks, blockId);
    if (!block) return;

    const blockType = element.closest('[data-block-type]')?.dataset.blockType;

    let newValue;
    if (blockType === 'heading') {
        // Заголовок — только чистый текст, никаких тегов
        newValue = element.innerHTML
            .replace(/<br\s*\/?>/gi, ' ')
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .trim();
    } else {
        newValue = TextSanitizer.applyTypography(
            TextSanitizer.sanitize(element.innerHTML, false)
        );
    }

    const oldValue = field === 'items' && itemIndex !== undefined
        ? (block.settings.items || [])[parseInt(itemIndex)]
        : block.settings[field];
    if (newValue !== oldValue) pushUndoState();

    if (field === 'items' && itemIndex !== undefined) {
        if (!block.settings.items) block.settings.items = [];
        block.settings.items[parseInt(itemIndex)] = newValue;
    } else {
        block.settings[field] = newValue;
    }

    // Reflect typographic changes back into the contenteditable so the user
    // sees guillemets, em dashes and non-breaking spaces immediately.
    // Skip when the element is still focused (paste handler manages display itself).
    // Skip in link mode: rewriting innerHTML destroys the DOM nodes that
    // savedSelection points to, so applyLink() can no longer restore the range.
    const inLinkMode = typeof toolbarMode !== 'undefined' && toolbarMode === 'link';
    if (blockType !== 'heading' && document.activeElement !== element && !inLinkMode) {
        element.innerHTML = newValue;
    }

    console.log('[USER EDITOR] Saved changes to block', blockId, field, newValue.substring(0, 50));
}

/**
 * Поиск блока по ID (включая вложенные в колонки)
 */
function findBlockById(blocks, id) {
    for (const block of blocks) {
        if (block.id === id) return block;

        if (block.columns) {
            for (const column of block.columns) {
                for (const childBlock of column.blocks || []) {
                    if (childBlock.id === id) return childBlock;
                }
            }
        }
    }
    return null;
}

/**
 * Открыть редактор кнопки
 */
function openButtonEditor(blockId) {
    const block = findBlockById(UserAppState.blocks, blockId);
    if (!block) return;

    const modal = document.getElementById('button-editor-modal');
    const textInput = document.getElementById('button-text-input');
    const urlInput = document.getElementById('button-url-input');
    const palette = document.getElementById('button-color-palette');

    if (!modal) return;
    modal.dataset.blockId = String(blockId);

    // Заполняем текущие значения
    textInput.value = block.settings.text || '';
    urlInput.value = block.settings.url || '';

    updateButtonAttentionUI(modal, block);

    urlInput.oninput = () => {
        updateButtonAttentionUI(modal, block);
    };

    // Подсвечиваем текущий цвет
    palette.querySelectorAll('.color-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.color === block.settings.color);
    });

    // Обработчики
    palette.querySelectorAll('.color-btn').forEach(btn => {
        btn.onclick = () => {
            palette.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        };
    });

    document.getElementById('btn-apply-button').onclick = async () => {
        pushUndoState();
        block.settings.text = textInput.value;
        block.settings.url = urlInput.value;

        const activeColor = palette.querySelector('.color-btn.active');
        if (activeColor) {
            block.settings.color = activeColor.dataset.color;
        }

        // Перерендериваем кнопку
        if (typeof renderButtonToDataUrl === 'function') {
            renderButtonToDataUrl(block, (result) => {
                if (result) {
                    // result может быть строкой dataUrl или объектом {dataUrl, width, height}
                    const dataUrl = (typeof result === 'string') ? result : result.dataUrl;
                    const w = (typeof result === 'object') ? result.width : null;
                    const h = (typeof result === 'object') ? result.height : null;
                    if (dataUrl) {
                        block.settings.renderedButton = dataUrl;
                        if (w) block.settings.renderedButtonW = w;
                        if (h) block.settings.renderedButtonH = h;
                    }
                }
                renderUserCanvas();
            });
        } else {
            renderUserCanvas();
        }

        modal.style.display = 'none';
    };

    modal.style.display = 'flex';
}

/**
 * Открыть выбор картинки — сразу триггерим file input
 */
function openImagePicker(blockId) {
    const block = findBlockById(UserAppState.blocks, blockId);
    if (!block) return;

    const modal = document.getElementById('image-editor-modal');
    if (!modal) return;

    const s = block.settings;

    // Вкладки
    const tabBtns = modal.querySelectorAll('#image-tab-buttons .toggle-btn');
    const tabUpload = document.getElementById('image-tab-upload');
    const tabPresets = document.getElementById('image-tab-presets');
    const presets = window.PRESET_IMAGES || [];

    // Скрыть вкладку "Готовые" если пресетов нет
    const presetTabBtn = document.getElementById('image-tab-presets-btn');
    if (presetTabBtn) presetTabBtn.style.display = presets.length > 0 ? '' : 'none';

    function switchImageTab(tab) {
        tabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
        tabUpload.style.display = tab === 'upload' ? '' : 'none';
        tabPresets.style.display = tab === 'presets' ? '' : 'none';
    }
    tabBtns.forEach(b => { b.onclick = () => switchImageTab(b.dataset.tab); });
    switchImageTab('upload');

    // Сетка пресетов
    const grid = document.getElementById('image-presets-grid');
    if (grid) {
        grid.innerHTML = '';
        presets.forEach(item => {
            const src = item.src.startsWith('/') || item.src.startsWith('http') ? item.src : '/' + item.src;
            const cell = document.createElement('div');
            cell.style.cssText = `aspect-ratio:1;overflow:hidden;border-radius:8px;cursor:pointer;border:2px solid ${s.src === src ? 'var(--accent)' : 'transparent'};`;
            const img = document.createElement('img');
            img.src = src;
            img.alt = item.label || '';
            img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
            cell.appendChild(img);
            cell.onclick = () => {
                s.src = src;
                const thumbImg = document.getElementById('image-thumb-img');
                const thumb = document.getElementById('image-preview-thumb');
                if (thumbImg) thumbImg.src = src;
                if (thumb) thumb.style.display = 'block';
                grid.querySelectorAll('div').forEach(d => d.style.borderColor = 'transparent');
                cell.style.borderColor = 'var(--accent)';
                switchImageTab('upload');
            };
            grid.appendChild(cell);
        });
    }

    // Превью если картинка уже есть
    const thumb = document.getElementById('image-preview-thumb');
    const thumbImg = document.getElementById('image-thumb-img');
    if (s.renderedImage || s.src) {
        thumbImg.src = s.renderedImage || s.src;
        thumb.style.display = 'block';
    } else {
        thumb.style.display = 'none';
    }

    // URL
    document.getElementById('image-url-input').value = s.url || '';

    // Кнопка выбора файла
    document.getElementById('btn-change-image').onclick = () => {
        let fileInput = document.getElementById('image-file-input');
        if (!fileInput) {
            fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = 'image/*';
            fileInput.id = 'image-file-input';
            fileInput.style.display = 'none';
            document.body.appendChild(fileInput);
        }
        fileInput.onchange = null;
        fileInput.value = '';
        fileInput.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                s.src = ev.target.result;
                thumbImg.src = ev.target.result;
                thumb.style.display = 'block';
            };
            reader.readAsDataURL(file);
        };
        fileInput.click();
    };

    // Применить
    document.getElementById('btn-apply-image').onclick = async () => {
        pushUndoState();
        s.url = document.getElementById('image-url-input').value.trim();

        if (typeof renderImageToDataUrl === 'function' && s.src) {
            renderImageToDataUrl(block, (result) => {
                if (result) {
                    s.renderedImage = result.dataUrl;
                    s.renderedWidth = result.width;
                    s.renderedHeight = result.height;
                }
                UserAppState.isDirty = true;
                renderUserCanvas();
            });
        } else {
            UserAppState.isDirty = true;
            renderUserCanvas();
        }

        modal.style.display = 'none';
    };

    modal.style.display = 'flex';
}

/**
 * Открыть редактор списка
 */
function openListEditor(blockId) {
    const block = findBlockById(UserAppState.blocks, blockId);
    if (!block) return;

    const modal = document.getElementById('list-editor-modal');
    if (!modal) return;

    const s = block.settings;

    // Сохраняем ID блока
    modal.dataset.blockId = blockId;

    // === Тип списка ===
    const toggleBtns = modal.querySelectorAll('.toggle-buttons .toggle-btn');
    toggleBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.value === (s.listStyle || 'bullets'));
        btn.onclick = () => {
            toggleBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Показываем/скрываем номер начала, формат и иконки
            const startGroup = document.getElementById('start-number-group');
            const formatGroup = document.getElementById('number-format-group');
            const iconGroup = document.getElementById('bullet-icon-group');
            const isNumbered = btn.dataset.value === 'numbered';

            if (startGroup) startGroup.style.display = isNumbered ? 'block' : 'none';
            if (formatGroup) formatGroup.style.display = isNumbered ? 'block' : 'none';
            if (iconGroup) iconGroup.style.display = isNumbered ? 'none' : 'block';
            s.listStyle = isNumbered ? 'numbered' : 'bullets';
            s.bulletSize = isNumbered ? 40 : 20;
        };
    });

    // Показываем/скрываем в зависимости от текущего типа
    const isNumbered = s.listStyle === 'numbered';
    const startGroup = document.getElementById('start-number-group');
    const formatGroup = document.getElementById('number-format-group');
    const iconGroup = document.getElementById('bullet-icon-group');
    if (startGroup) startGroup.style.display = isNumbered ? 'block' : 'none';
    if (formatGroup) formatGroup.style.display = isNumbered ? 'block' : 'none';
    if (iconGroup) iconGroup.style.display = isNumbered ? 'none' : 'block';

    // === Формат номера ===
    const formatBtns = document.querySelectorAll('#number-format-group .toggle-btn');
    const currentFormat = s.numberFormat || 'padded';
    formatBtns.forEach(fb => {
        fb.classList.toggle('active', fb.dataset.format === currentFormat);
        fb.onclick = () => {
            formatBtns.forEach(b => b.classList.remove('active'));
            fb.classList.add('active');
            s.numberFormat = fb.dataset.format;
        };
    });

    // === Номер начала ===
    const startInput = document.getElementById('list-start-number');
    if (startInput) {
        startInput.value = s.startNumber != null ? s.startNumber : 1;
    }

    // === Иконки буллетов ===
    renderBulletIconsGrid(s.bulletType || (BULLET_TYPES[0]?.id));

    // === Элементы списка ===
    renderListItemsEditor(s.items || ['Пункт 1']);

    // === Кнопка добавления ===
    document.getElementById('btn-add-list-item').onclick = () => {
        const editor = document.getElementById('list-items-editor');
        const items = Array.from(editor.querySelectorAll('input')).map(inp => inp.value);
        items.push('Новый пункт');
        renderListItemsEditor(items);
    };

    // === Применение ===
    document.getElementById('btn-apply-list').onclick = async () => {
        pushUndoState();
        // Собираем данные
        const activeType = modal.querySelector('.toggle-buttons .toggle-btn.active');
        s.listStyle = activeType ? activeType.dataset.value : 'bullets';
        s.bulletSize = s.listStyle === 'numbered' ? 40 : 20;
        const startRaw = parseInt(document.getElementById('list-start-number').value);
        s.startNumber = isNaN(startRaw) ? 1 : startRaw;
        const activeFormat = document.querySelector('#number-format-group .toggle-btn.active');
        s.numberFormat = activeFormat ? activeFormat.dataset.format : 'padded';

        // Собираем элементы — plain text из <input>, проводим через TextSanitizer
        const editor = document.getElementById('list-items-editor');
        s.items = Array.from(editor.querySelectorAll('input'))
            .map(inp => TextSanitizer.applyTypography(
                TextSanitizer.sanitize(inp.value.trim(), true)
            ))
            .filter(text => text.length > 0);

        // Получаем выбранную иконку
        const selectedIcon = document.querySelector('.bullet-icon-item.selected');
        if (selectedIcon) {
            s.bulletType = selectedIcon.dataset.id;
            s.bulletCustom = null; // Сбрасываем кастомную
        }

        // Перерендериваем буллеты
        if (typeof renderListBulletsToDataUrls === 'function') {
            renderListBulletsToDataUrls(block, () => {
                renderUserCanvas();
            });
        } else {
            renderUserCanvas();
        }

        modal.style.display = 'none';
    };

    modal.style.display = 'flex';
}

/**
 * Рендер сетки иконок буллетов
 */
function renderBulletIconsGrid(selectedId) {
    const grid = document.getElementById('bullet-icons-grid');
    if (!grid) return;

    const bullets = window.BULLET_TYPES || [];

    grid.innerHTML = bullets.map(bullet => {
        const bulletKey = bullet.id || bullet.src || '';
        const isSelected = bulletKey === selectedId || bullet.src === selectedId;
        return `
        <div class="bullet-icon-item ${isSelected ? 'selected' : ''}"
             data-id="${TextSanitizer.escapeHTML(bulletKey)}"
             data-src="${TextSanitizer.escapeHTML(bullet.src)}">
            <img src="${TextSanitizer.escapeHTML(bullet.src)}" alt="${TextSanitizer.escapeHTML(bullet.name || '')}">
        </div>
    `;
    }).join('');

    // Обработчики кликов
    grid.querySelectorAll('.bullet-icon-item').forEach(item => {
        item.addEventListener('click', () => {
            grid.querySelectorAll('.bullet-icon-item').forEach(i => i.classList.remove('selected'));
            item.classList.add('selected');
        });
    });
}

/**
 * Рендер редактора элементов списка
 */
function renderListItemsEditor(items) {
    const editor = document.getElementById('list-items-editor');
    if (!editor) return;

    editor.innerHTML = items.map((item, index) => `
        <div class="list-item-row" data-index="${index}">
            <input type="text" value="${escapeHtmlAttr(TextSanitizer.toPlainText(item))}" placeholder="Текст пункта...">
            <button type="button" class="btn-delete-item" title="Удалить">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        </div>
    `).join('');

    // Обработчики удаления
    editor.querySelectorAll('.btn-delete-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const row = btn.closest('.list-item-row');
            if (editor.querySelectorAll('.list-item-row').length > 1) {
                row.remove();
            } else {
                alert('Должен остаться хотя бы один пункт');
            }
        });
    });
}

/**
 * Открыть редактор таблицы (заголовок + колонки + строки)
 */
function openTableEditor(blockId) {
    const block = findBlockById(UserAppState.blocks, blockId);
    if (!block) return;

    const modal = document.getElementById('table-editor-modal');
    if (!modal) return;

    const s = block.settings;
    modal.dataset.blockId = blockId;

    const titleInput = document.getElementById('table-title-input');
    if (titleInput) titleInput.value = TextSanitizer.toPlainText(s.title || '');

    // Рабочий черновик редактора — мутируется на месте, применяется в block.settings
    // только по кнопке «Применить».
    const draft = {
        columns: [...(s.columns || [])],
        rows: (s.rows || []).map(r => [...r])
    };

    const redraw = () => {
        renderTableColumnsEditor(draft, redraw);
        renderTableRowsEditor(draft, redraw);
    };
    redraw();

    document.getElementById('btn-add-table-column').onclick = () => {
        draft.columns.push(`Колонка ${draft.columns.length + 1}`);
        draft.rows.forEach(r => r.push(''));
        redraw();
    };

    document.getElementById('btn-add-table-row').onclick = () => {
        draft.rows.push(draft.columns.map(() => ''));
        redraw();
    };

    document.getElementById('btn-apply-table').onclick = () => {
        pushUndoState();

        // Заголовок плашки рисуется как обычный текст в <canvas> (не HTML),
        // поэтому хранится и остаётся plain text — без sanitize/applyTypography.
        const newTitle = (titleInput?.value || '').trim();
        const titleChanged = newTitle !== (s.title || '');

        s.title = newTitle;
        s.columns = draft.columns.map(c => TextSanitizer.applyTypography(TextSanitizer.sanitize((c || '').trim(), true)));
        s.rows = draft.rows.map(row => row.map(cell => TextSanitizer.applyTypography(TextSanitizer.sanitize((cell || '').trim(), true))));

        UserAppState.isDirty = true;

        if (titleChanged && typeof renderTableTitleToDataUrl === 'function') {
            renderTableTitleToDataUrl(block, (dataUrl) => {
                s.renderedTitleBar = dataUrl || null;
                renderUserCanvas();
            });
        } else {
            renderUserCanvas();
        }

        modal.style.display = 'none';
    };

    modal.style.display = 'flex';
}

/**
 * Рендер редактора колонок таблицы. Мутирует draft на месте; onRedraw()
 * вызывается после структурных изменений (удаление колонки также подрезает
 * draft.rows), т.к. это требует перерисовать и редактор строк.
 */
function renderTableColumnsEditor(draft, onRedraw) {
    const editor = document.getElementById('table-columns-editor');
    if (!editor) return;

    editor.innerHTML = draft.columns.map((col, index) => `
        <div class="list-item-row" data-index="${index}">
            <input type="text" value="${escapeHtmlAttr(TextSanitizer.toPlainText(col || ''))}" placeholder="Название колонки...">
            <button type="button" class="btn-delete-item" title="Удалить колонку">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        </div>
    `).join('');

    editor.querySelectorAll('.list-item-row input').forEach((input, index) => {
        input.addEventListener('input', () => {
            draft.columns[index] = input.value;
        });
    });

    editor.querySelectorAll('.btn-delete-item').forEach((btn, index) => {
        btn.addEventListener('click', () => {
            if (draft.columns.length <= 1) {
                alert('Должна остаться хотя бы одна колонка');
                return;
            }
            draft.columns.splice(index, 1);
            draft.rows.forEach(r => r.splice(index, 1));
            onRedraw();
        });
    });
}

/**
 * Рендер редактора строк таблицы: для каждой строки — по одному текстовому
 * полю на каждую текущую колонку draft.columns. Мутирует draft на месте.
 */
function renderTableRowsEditor(draft, onRedraw) {
    const editor = document.getElementById('table-rows-editor');
    if (!editor) return;

    editor.innerHTML = draft.rows.map((row, rowIndex) => `
        <div class="list-item-row" data-index="${rowIndex}" style="flex-direction:column; align-items:stretch; gap:6px;">
            ${draft.columns.map((col, colIndex) => `
                <div style="display:flex; gap:4px;">
                    <input type="text"
                           data-row="${rowIndex}" data-col="${colIndex}"
                           value="${escapeHtmlAttr(TextSanitizer.toPlainText(row[colIndex] || ''))}"
                           placeholder="${escapeHtmlAttr(TextSanitizer.toPlainText(col || '') || `Колонка ${colIndex + 1}`)}"
                           style="flex:1;">
                    <button type="button" class="btn-make-link" title="Сделать выделенный текст ссылкой"
                            data-row="${rowIndex}" data-col="${colIndex}">🔗</button>
                </div>
            `).join('')}
            <button type="button" class="btn-delete-item" title="Удалить строку" data-row-index="${rowIndex}">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        </div>
    `).join('');

    editor.querySelectorAll('input[data-row]').forEach(input => {
        input.addEventListener('input', () => {
            const r = Number(input.dataset.row);
            const c = Number(input.dataset.col);
            draft.rows[r][c] = input.value;
        });
    });

    // Кнопка "Сделать ссылкой" — та же логика, что у блока "Список"
    // (openListEditor): выделяем текст в поле → оборачиваем в [текст](url).
    editor.querySelectorAll('.btn-make-link').forEach(btn => {
        btn.addEventListener('click', () => {
            const r = Number(btn.dataset.row);
            const c = Number(btn.dataset.col);
            const input = editor.querySelector(`input[data-row="${r}"][data-col="${c}"]`);
            if (!input) return;

            const start = input.selectionStart;
            const end = input.selectionEnd;
            if (start === end) {
                if (typeof Toast !== 'undefined') Toast.warning('Сначала выделите текст в поле.');
                else alert('Сначала выделите текст в поле.');
                return;
            }

            const selected = input.value.slice(start, end);
            const url = prompt('Введите ссылку (https://… или mailto:…):');
            if (!url) return;

            const newValue = input.value.slice(0, start) + `[${selected}](${url})` + input.value.slice(end);
            input.value = newValue;
            draft.rows[r][c] = newValue;
        });
    });

    editor.querySelectorAll('.btn-delete-item').forEach(btn => {
        btn.addEventListener('click', () => {
            if (draft.rows.length <= 1) {
                alert('Должна остаться хотя бы одна строка');
                return;
            }
            draft.rows.splice(Number(btn.dataset.rowIndex), 1);
            onRedraw();
        });
    });
}

/**
 * Открыть редактор баннера
 */
function openBannerEditor(blockId) {
    // TODO: Реализовать редактор баннера
    alert('Редактор баннера будет добавлен позже');
}

/**
 * Добавить кнопку настроек к блоку
 */
function addSettingsButton(element, onClick) {
    // Проверяем что кнопка ещё не добавлена
    if (element.querySelector('.block-settings-btn')) return;

    const btn = document.createElement('button');
    btn.className = 'block-settings-btn';
    btn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
        </svg>
    `;
    btn.title = 'Настройки';
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        onClick();
    });

    element.style.position = 'relative';
    element.appendChild(btn);
}

/**
 * Открыть редактор разделителя
 */
function openDividerEditor(blockId) {
    const block = findBlockById(UserAppState.blocks, blockId);
    if (!block) return;

    const modal = document.getElementById('divider-editor-modal');
    if (!modal) return;

    const s = block.settings;
    const currentSrc = s.customImage || s.image;

    // Рендерим сетку разделителей
    const grid = document.getElementById('divider-grid');
    const dividers = window.DIVIDER_IMAGES || [];

    grid.innerHTML = dividers.map(divider => `
        <div class="divider-item ${divider.src === currentSrc ? 'selected' : ''}"
             data-src="${TextSanitizer.escapeHTML(divider.src)}">
            <img src="${TextSanitizer.escapeHTML(divider.src)}" alt="${TextSanitizer.escapeHTML(divider.name || 'Разделитель')}">
        </div>
    `).join('');

    // Обработчики кликов
    grid.querySelectorAll('.divider-item').forEach(item => {
        item.addEventListener('click', () => {
            // Выбираем разделитель
            const src = item.dataset.src;
            pushUndoState();
            s.image = src;
            s.customImage = null;

            // Перерендериваем
            renderUserCanvas();

            // Закрываем модалку
            modal.style.display = 'none';
        });
    });

    modal.style.display = 'flex';
}

/**
 * Открыть редактор эксперта
 */
function openExpertEditor(blockId) {
    const block = findBlockById(UserAppState.blocks, blockId);
    if (!block) return;

    const modal = document.getElementById('expert-editor-modal');
    if (!modal) return;

    const s = block.settings;
    const isLite = (s.variant || 'full') === 'lite';

    // Скрываем/показываем текстовые поля в зависимости от режима
    const nameGroup = document.getElementById('expert-name').closest('.form-group');
    const titleGroup = document.getElementById('expert-title').closest('.form-group');
    const bioGroup = document.getElementById('expert-bio').closest('.form-group');

    if (nameGroup) nameGroup.style.display = isLite ? 'none' : 'block';
    if (titleGroup) titleGroup.style.display = isLite ? 'none' : 'block';
    if (bioGroup) bioGroup.style.display = isLite ? 'none' : 'block';

    modal.dataset.blockId = blockId;

    // === Фото ===
    const currentPhoto = document.getElementById('expert-current-photo');
    if (currentPhoto && s.photo) {
        currentPhoto.querySelector('img').src = s.photo;
    }

    // Загрузка нового фото
    const photoInput = document.getElementById('expert-photo-input');
    const btnChangePhoto = document.getElementById('btn-change-expert-photo');

    btnChangePhoto.onclick = () => photoInput.click();
    photoInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            s.photo = event.target.result;
            currentPhoto.querySelector('img').src = s.photo;
            updateExpertPreview(s);
        };
        reader.readAsDataURL(file);
    };

    // === Позиционирование ===
    const scaleInput = document.getElementById('expert-scale');
    const posXInput = document.getElementById('expert-pos-x');
    const posYInput = document.getElementById('expert-pos-y');

    scaleInput.value = s.scale || 115;
    posXInput.value = s.positionX || 0;
    posYInput.value = s.positionY || 0;

    document.getElementById('expert-scale-value').textContent = `${scaleInput.value}%`;
    document.getElementById('expert-pos-x-value').textContent = posXInput.value;
    document.getElementById('expert-pos-y-value').textContent = posYInput.value;

    scaleInput.oninput = () => {
        document.getElementById('expert-scale-value').textContent = `${scaleInput.value}%`;
        s.scale = parseInt(scaleInput.value);
        updateExpertPreview(s);
    };

    posXInput.oninput = () => {
        document.getElementById('expert-pos-x-value').textContent = posXInput.value;
        s.positionX = parseInt(posXInput.value);
        updateExpertPreview(s);
    };

    posYInput.oninput = () => {
        document.getElementById('expert-pos-y-value').textContent = posYInput.value;
        s.positionY = parseInt(posYInput.value);
        updateExpertPreview(s);
    };

    // === Бейджи ===
    renderExpertBadges(s.badgeIcon);

    // === Подложка ===
    const bgToggle = document.getElementById('expert-bg-toggle');
    const bgColorRow = document.getElementById('expert-bg-color-row');
    const bgColorTrigger = document.getElementById('expert-bg-color');

    const hasBg = s.bgColor && s.bgColor !== 'transparent';
    bgToggle.checked = hasBg;
    bgColorRow.style.display = hasBg ? 'flex' : 'none';
    const initialBgColor = s.bgColor && s.bgColor !== 'transparent' ? s.bgColor : '#F3F4F6';

    bindColorTrigger({
        trigger: bgColorTrigger,
        title: 'Цвет подложки',
        currentColor: initialBgColor,
        allowTransparent: false,
        onApply: (chosenColor) => {
            s.bgColor = chosenColor;
            updateExpertPreview(s);
        }
    });

    bgToggle.onchange = () => {
        bgColorRow.style.display = bgToggle.checked ? 'flex' : 'none';
        s.bgColor = bgToggle.checked
            ? (bgColorTrigger.dataset.colorValue || initialBgColor)
            : 'transparent';
        updateExpertPreview(s);
    };

    // === Текстовые поля ===
    document.getElementById('expert-name').value = s.name || '';
    document.getElementById('expert-title').value = s.title || '';
    document.getElementById('expert-bio').value = s.bio || '';

    // === Первоначальное превью ===
    updateExpertPreview(s);

    // === Применение ===
    document.getElementById('btn-apply-expert').onclick = async () => {
        pushUndoState();
        // Собираем данные только если не lite
        const isLite = (s.variant || 'full') === 'lite';

        if (!isLite) {
            s.name = document.getElementById('expert-name').value;
            s.title = document.getElementById('expert-title').value;
            s.bio = document.getElementById('expert-bio').value;
        }

        s.scale = parseInt(scaleInput.value) || 100;
        s.positionX = parseInt(posXInput.value) || 0;
        s.positionY = parseInt(posYInput.value) || 0;
        s.bgColor = bgToggle.checked
            ? (bgColorTrigger.dataset.colorValue || initialBgColor)
            : 'transparent';

        // Получаем выбранный бейдж
        const selectedBadge = document.querySelector('.badge-item.selected');
        s.badgeIcon = selectedBadge && selectedBadge.dataset.src ? selectedBadge.dataset.src : null;

        // Сохраняем оригинальные размеры если они были
        const originalWidth = s.renderedExpertWidth;

        // Перерендериваем эксперта
        if (typeof renderExpertToDataUrl === 'function') {
            renderExpertToDataUrl(block, (result) => {
                if (result) {
                    s.renderedExpert = result.dataUrl;
                    // Сохраняем оригинальную ширину если была
                    s.renderedExpertWidth = originalWidth || result.width;
                }
                renderUserCanvas();
            });
        } else {
            renderUserCanvas();
        }

        modal.style.display = 'none';
    };

    modal.style.display = 'flex';
}

/**
 * Рендер бейджей эксперта
 */
function renderExpertBadges(selectedSrc) {
    const grid = document.getElementById('expert-badge-grid');
    if (!grid) return;

    const badges = window.EXPERT_BADGE_ICONS || [];

    let html = `
        <div class="badge-item no-badge ${!selectedSrc ? 'selected' : ''}" data-src="">
            ✕
        </div>
    `;

    html += badges.map(badge => `
        <div class="badge-item ${badge.src === selectedSrc ? 'selected' : ''}" data-src="${TextSanitizer.escapeHTML(badge.src)}">
            <img src="${TextSanitizer.escapeHTML(badge.src)}" alt="${TextSanitizer.escapeHTML(badge.name || '')}">
        </div>
    `).join('');

    grid.innerHTML = html;

    // Обработчики
    grid.querySelectorAll('.badge-item').forEach(item => {
        item.addEventListener('click', () => {
            grid.querySelectorAll('.badge-item').forEach(i => i.classList.remove('selected'));
            item.classList.add('selected');
        });
    });
}

/**
 * Обновить превью эксперта в модалке
 * Максимально приближено к renderExpertToDataUrl
 */
function updateExpertPreview(s) {
    const container = document.getElementById('expert-preview-container');
    if (!container) return;

    const scale = (s.scale || 115) / 100;
    const posX = s.positionX || 0;
    const posY = s.positionY || 0;
    const bgColor = s.bgColor && s.bgColor !== 'transparent' ? s.bgColor : 'transparent';

    // Dimensions match renderExpertToDataUrl ratio: containerSize=171, photoSize=130
    const containerSize = 150;
    const photoSize = containerSize * (130 / 171);

    // Badge position
    const badgeX = s.badgePositionX ?? 100;
    const badgeY = s.badgePositionY ?? 100;
    const badgeLeft = (containerSize - 40) * (badgeX / 100);
    const badgeTop = (containerSize - 40) * (badgeY / 100);

    // Image size: photoSize * scale — matches canvas (photo drawn at photoSize then scaled by scale).
    // No extra 1.5 multiplier; that caused preview zoom ~1.5x larger than actual render.
    const imgSize = photoSize * scale;

    // Position offset in px: matches canvas offsetX = positionX/100 * photoSize * 2.
    // Expressed as % of imgSize so the existing CSS translate(%) stays valid:
    // desired_px / imgSize * 100 = (posX/100 * photoSize * 2) / (photoSize * scale) * 100
    //                            = posX * 2 / scale
    const shiftX = posX * 2 / scale;
    const shiftY = posY * 2 / scale;

    container.innerHTML = `
        <div style="
            position: relative;
            width: ${containerSize}px;
            height: ${containerSize}px;
            background: ${bgColor};
            border-radius: 28%;
        ">
            <!-- Diamond with photo -->
            <div style="
                position: absolute;
                top: 50%;
                left: 50%;
                width: ${photoSize}px;
                height: ${photoSize}px;
                transform: translate(-50%, -50%) rotate(45deg);
                border-radius: 45%;
                overflow: hidden;
            ">
                <div style="
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    width: ${imgSize}px;
                    height: ${imgSize}px;
                    transform: translate(-50%, -50%) rotate(-45deg) translate(${shiftX}%, ${shiftY}%);
                ">
                    <img src="${s.photo || ''}"
                         style="
                             width: 100%;
                             height: 100%;
                             object-fit: cover;
                             max-width: none;
                         "
                         alt="Фото">
                </div>
            </div>
            
            <!-- Бейдж -->
            ${s.badgeIcon ? `
                <div style="
                    position: absolute;
                    left: ${badgeLeft}px;
                    top: ${badgeTop}px;
                    width: 40px;
                    height: 40px;
                ">
                    <img src="${s.badgeIcon}" style="width:100%; height:100%;" alt="Бейдж">
                </div>
            ` : ''}
        </div>
    `;
}

// ── Редактор свободного блока (user-версия) ───────────────────────────────

function openCanvasEditor(blockId) {
    const block = findBlockById(UserAppState.blocks, blockId);
    if (!block) return;
    const s = block.settings || {};
    const elements = Array.isArray(s.freeElements) ? s.freeElements : [];

    const modal = document.getElementById('canvas-editor-modal');
    const body  = document.getElementById('canvas-editor-body');
    if (!modal || !body) return;
    modal.dataset.blockId = String(blockId);

    // Рабочая копия — применяется только по кнопке «Применить»
    const draft = {
        bgEnabled: s.bgEnabled !== false,
        bgColor:   s.bgColor || '#1D2533',
        elements:  JSON.parse(JSON.stringify(elements))
    };

    function rebuild() {
        body.innerHTML = '';

        // ── Фон ─────────────────────────────────────────────────────────
        const bgSection = document.createElement('div');
        bgSection.className = 'form-group';
        bgSection.style.cssText = 'display:flex;flex-direction:column;gap:8px;';

        const bgRow = document.createElement('div');
        bgRow.style.cssText = 'display:flex;align-items:center;gap:10px;';
        const bgLbl = document.createElement('span');
        bgLbl.textContent = 'Фон';
        bgLbl.style.cssText = 'font-size:13px;font-weight:500;flex:1;';

        const bgToggle = document.createElement('button');
        bgToggle.type = 'button';
        bgToggle.textContent = draft.bgEnabled ? 'Вкл' : 'Выкл';
        bgToggle.style.cssText = `padding:4px 12px;border-radius:6px;font-size:12px;cursor:pointer;border:1px solid ${draft.bgEnabled?'var(--accent-primary)':'var(--border-secondary)'};background:${draft.bgEnabled?'rgba(168,85,247,0.15)':'transparent'};color:var(--text-secondary);`;
        bgToggle.addEventListener('click', () => { draft.bgEnabled = !draft.bgEnabled; rebuild(); });

        bgRow.appendChild(bgLbl);
        bgRow.appendChild(bgToggle);

        if (draft.bgEnabled) {
            const colorBtn = document.createElement('button');
            colorBtn.type = 'button';
            colorBtn.style.cssText = `width:32px;height:32px;border-radius:6px;border:2px solid var(--border-secondary);background:${draft.bgColor};cursor:pointer;flex-shrink:0;`;
            colorBtn.addEventListener('click', () => pickColor({
                title: 'Цвет фона',
                currentColor: draft.bgColor,
                allowTransparent: false,
                onApply: c => { draft.bgColor = c; colorBtn.style.background = c; }
            }));
            bgRow.appendChild(colorBtn);
        }
        bgSection.appendChild(bgRow);
        body.appendChild(bgSection);

        if (!elements.length) return;

        // ── Разделитель ──────────────────────────────────────────────────
        const sep = document.createElement('div');
        sep.style.cssText = 'height:1px;background:var(--border-primary);margin:2px 0;';
        body.appendChild(sep);

        // ── Элементы ─────────────────────────────────────────────────────
        const TYPE_NAMES = { text: 'Текст', shape: 'Фигура', line: 'Линия', image: 'Картинка' };

        draft.elements.forEach((el, idx) => {
            if (el.visible === false) return;

            const section = document.createElement('div');
            section.style.cssText = 'display:flex;flex-direction:column;gap:8px;padding:10px;background:var(--bg-secondary);border:1px solid var(--border-secondary);border-radius:8px;';

            const title = document.createElement('div');
            title.style.cssText = 'font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;';
            title.textContent = TYPE_NAMES[el.type] || el.type;
            section.appendChild(title);

            const mkRow = (labelText, inputEl) => {
                const row = document.createElement('div');
                row.style.cssText = 'display:flex;align-items:center;gap:8px;';
                const lbl = document.createElement('span');
                lbl.textContent = labelText;
                lbl.style.cssText = 'font-size:12px;color:var(--text-muted);min-width:60px;flex-shrink:0;';
                row.appendChild(lbl);
                row.appendChild(inputEl);
                return row;
            };

            const mkNum = (val, min, max, onChange) => {
                const inp = document.createElement('input');
                inp.type = 'number'; inp.value = Math.round(val ?? 0);
                inp.min = min; inp.max = max;
                inp.style.cssText = 'flex:1;padding:5px 7px;border-radius:4px;border:1px solid var(--border-secondary);background:var(--bg-input);color:var(--text-secondary);font-size:12px;';
                inp.addEventListener('change', () => onChange(parseFloat(inp.value)||0));
                return inp;
            };

            const mkColorBtn = (val, onChange) => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.style.cssText = `width:36px;height:28px;border-radius:4px;border:1px solid var(--border-secondary);background:${val||'#ffffff'};cursor:pointer;flex-shrink:0;`;
                btn.addEventListener('click', () => pickColor({
                    title: 'Цвет',
                    currentColor: val || '#ffffff',
                    allowTransparent: false,
                    onApply: c => { btn.style.background = c; onChange(c); }
                }));
                return btn;
            };

            // ── TEXT ────────────────────────────────────────────────────
            if (el.type === 'text' || el.type === 'heading') {
                const preview = (el.text || '').slice(0, 30) + ((el.text||'').length > 30 ? '…' : '');
                title.textContent = (TYPE_NAMES.text) + (preview ? `: "${preview}"` : '');

                const ta = document.createElement('textarea');
                ta.value = el.text || ''; ta.rows = 2;
                ta.style.cssText = 'width:100%;padding:6px;border-radius:4px;border:1px solid var(--border-secondary);background:var(--bg-input);color:var(--text-secondary);font-size:12px;resize:vertical;box-sizing:border-box;';
                ta.addEventListener('input', () => { el.text = ta.value; });
                section.appendChild(ta);

                const colorRow = mkRow('Цвет', mkColorBtn(el.color || '#ffffff', c => { el.color = c; }));
                section.appendChild(colorRow);
            }

            // ── SHAPE ───────────────────────────────────────────────────
            if (el.type === 'shape') {
                section.appendChild(mkRow('Цвет', mkColorBtn(el.bgColor || '#a855f7', c => { el.bgColor = c; })));

                const xyRow = document.createElement('div');
                xyRow.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:6px;';
                xyRow.appendChild(mkRow('X', mkNum(el.x, -600, 1200, v => { el.x = v; })));
                xyRow.appendChild(mkRow('Y', mkNum(el.y, -600, 1200, v => { el.y = v; })));
                section.appendChild(xyRow);

                const whRow = document.createElement('div');
                whRow.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:6px;';
                whRow.appendChild(mkRow('W', mkNum(el.w, 1, 600, v => { el.w = v; })));
                whRow.appendChild(mkRow('H', mkNum(el.h, 1, 600, v => { el.h = v; })));
                section.appendChild(whRow);

                const rotRow = document.createElement('div');
                rotRow.style.cssText = 'display:flex;align-items:center;gap:8px;';
                const rotLbl = document.createElement('span');
                rotLbl.textContent = 'Поворот';
                rotLbl.style.cssText = 'font-size:12px;color:var(--text-muted);min-width:60px;flex-shrink:0;';
                const rotRange = document.createElement('input');
                rotRange.type = 'range'; rotRange.min = -180; rotRange.max = 180; rotRange.value = el.rotation || 0;
                rotRange.style.cssText = 'flex:1;accent-color:var(--accent-primary);';
                const rotVal = document.createElement('span');
                rotVal.textContent = (el.rotation||0) + '°';
                rotVal.style.cssText = 'font-size:11px;color:var(--text-muted);min-width:30px;text-align:right;';
                rotRange.addEventListener('input', () => { el.rotation = Number(rotRange.value); rotVal.textContent = el.rotation + '°'; });
                rotRow.appendChild(rotLbl); rotRow.appendChild(rotRange); rotRow.appendChild(rotVal);
                section.appendChild(rotRow);

                if ((el.clipPath || 'none') === 'none') {
                    const brRow = document.createElement('div');
                    brRow.style.cssText = 'display:flex;align-items:center;gap:8px;';
                    const brLbl = document.createElement('span');
                    brLbl.textContent = 'Скругл.';
                    brLbl.style.cssText = 'font-size:12px;color:var(--text-muted);min-width:60px;flex-shrink:0;';
                    const brRange = document.createElement('input');
                    brRange.type = 'range'; brRange.min = 0; brRange.max = 100; brRange.value = el.borderRadius || 0;
                    brRange.style.cssText = 'flex:1;accent-color:var(--accent-primary);';
                    const brVal = document.createElement('span');
                    brVal.textContent = (el.borderRadius||0) + 'px';
                    brVal.style.cssText = 'font-size:11px;color:var(--text-muted);min-width:30px;text-align:right;';
                    brRange.addEventListener('input', () => { el.borderRadius = Number(brRange.value); brVal.textContent = el.borderRadius + 'px'; });
                    brRow.appendChild(brLbl); brRow.appendChild(brRange); brRow.appendChild(brVal);
                    section.appendChild(brRow);
                }
            }

            // ── LINE ────────────────────────────────────────────────────
            if (el.type === 'line') {
                section.appendChild(mkRow('Цвет', mkColorBtn(el.color || '#e5e7eb', c => { el.color = c; })));

                const posRow = document.createElement('div');
                posRow.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:6px;';
                posRow.appendChild(mkRow('X', mkNum(el.x, 0, 600, v => { el.x = v; })));
                posRow.appendChild(mkRow('Y', mkNum(el.y, 0, 600, v => { el.y = v; })));
                section.appendChild(posRow);

                section.appendChild(mkRow('Ширина', mkNum(el.w, 1, 600, v => { el.w = v; })));
                section.appendChild(mkRow('Толщина', mkNum(el.h || 2, 1, 20, v => { el.h = v; })));

                const rotRow2 = document.createElement('div');
                rotRow2.style.cssText = 'display:flex;align-items:center;gap:8px;';
                const rLbl = document.createElement('span');
                rLbl.textContent = 'Поворот';
                rLbl.style.cssText = 'font-size:12px;color:var(--text-muted);min-width:60px;flex-shrink:0;';
                const rRange = document.createElement('input');
                rRange.type = 'range'; rRange.min = -180; rRange.max = 180; rRange.value = el.rotation || 0;
                rRange.style.cssText = 'flex:1;accent-color:var(--accent-primary);';
                const rVal = document.createElement('span');
                rVal.textContent = (el.rotation||0) + '°';
                rVal.style.cssText = 'font-size:11px;color:var(--text-muted);min-width:30px;text-align:right;';
                rRange.addEventListener('input', () => { el.rotation = Number(rRange.value); rVal.textContent = el.rotation + '°'; });
                rotRow2.appendChild(rLbl); rotRow2.appendChild(rRange); rotRow2.appendChild(rVal);
                section.appendChild(rotRow2);
            }

            // ── IMAGE ───────────────────────────────────────────────────
            if (el.type === 'image') {
                const fileInput = document.createElement('input');
                fileInput.type = 'file'; fileInput.accept = 'image/*'; fileInput.style.display = 'none';
                fileInput.addEventListener('change', ev => {
                    const file = ev.target.files?.[0]; if (!file) return;
                    const reader = new FileReader();
                    reader.onload = le => {
                        el.src = le.target.result;
                        if (thumb) { thumb.src = el.src; thumb.style.display = 'block'; }
                    };
                    reader.readAsDataURL(file); ev.target.value = '';
                });

                const fileBtn = document.createElement('button');
                fileBtn.type = 'button'; fileBtn.textContent = '📁 Заменить картинку';
                fileBtn.style.cssText = 'width:100%;padding:7px 10px;background:var(--bg-hover);border:1px solid var(--border-secondary);border-radius:6px;color:var(--text-secondary);cursor:pointer;font-size:12px;';
                fileBtn.addEventListener('click', () => fileInput.click());
                section.appendChild(fileBtn);
                section.appendChild(fileInput);

                let thumb = null;
                if (el.src) {
                    thumb = document.createElement('img');
                    thumb.src = el.src;
                    thumb.style.cssText = 'width:100%;max-height:80px;object-fit:contain;border-radius:6px;border:1px solid var(--border-secondary);background:#1a1a2e;display:block;';
                    section.appendChild(thumb);
                }
            }

            body.appendChild(section);
        });
    }

    rebuild();

    // ── Apply ─────────────────────────────────────────────────────────
    document.getElementById('btn-apply-canvas').onclick = () => {
        pushUndoState();
        const b = findBlockById(UserAppState.blocks, blockId);
        if (!b) { modal.style.display = 'none'; return; }
        b.settings.bgEnabled = draft.bgEnabled;
        b.settings.bgColor   = draft.bgColor;
        draft.elements.forEach(de => {
            const orig = (b.settings.freeElements || []).find(e => e.id === de.id);
            if (orig) Object.assign(orig, de);
        });
        b.settings.renderedCanvas = null; // сбрасываем PNG — перерисуем
        _canvasRenderTriedIds.delete(b.id); // разрешаем повторный рендер
        renderUserCanvas();
        modal.style.display = 'none';
    };

    modal.style.display = 'flex';
    modal.querySelectorAll('.modal-close, .modal-overlay').forEach(el => {
        el.onclick = () => (modal.style.display = 'none');
    });
}
