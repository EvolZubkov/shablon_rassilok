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
            background: #1e293b;
            color: #e5e7eb;
            padding: 8px 16px;
            border-radius: 8px;
            font-size: 13px;
            z-index: 9999;
            pointer-events: none;
            border: 1px solid #374151;
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

    UserAppState.blocks.forEach((block, index) => {
        const blockElement = createUserBlockElement(block, index);
        canvas.appendChild(blockElement);
    });

    // Инициализируем inline-редактирование
    initInlineEditing();
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
        }

        wrapper.appendChild(makeDeleteBtn(block.id));
    }

    return wrapper;
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
    const s = block.settings || {};

    switch (block.type) {
        case 'banner':
            return renderUserBanner(block);
        case 'text':
            return renderUserText(block);
        case 'heading':
            return renderUserHeading(block);
        case 'button':
            return renderUserButton(block);
        case 'list':
            return renderUserList(block);
        case 'expert':
            return renderUserExpert(block);
        case 'important':
            return renderUserImportant(block);
        case 'divider':
            return renderUserDivider(block);
        case 'image':
            return renderUserImage(block);
        case 'spacer':
            return renderUserSpacer(block);
        default:
            return '<p style="padding: 20px; color: #999;">Неизвестный блок</p>';
    }
}

/**
 * Рендер блока с колонками
 */
function renderUserColumnsBlock(block) {
    const gap = block.settings?.columnGap ?? 10;

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

    return `
        <table style="width:100%; border-collapse:collapse; table-layout:fixed;">
            <tr>${columnsHTML}</tr>
        </table>
    `;
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
                color:${s.color || '#1D2533'};
                font-family:${fontFamily};
                padding:16px 20px;
                outline:none;
                -webkit-text-fill-color: inherit;
                caret-color: #f97316;;
             ">
            ${TextSanitizer.render(s.content || 'Введите текст...')}
        </div>
    `;
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
                color:${s.color || '#1D2533'};
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
            const bulletSrc = s.bulletCustom || (typeof BULLET_TYPES !== 'undefined' && BULLET_TYPES.find(b => b.id === s.bulletType)?.src);
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
          ${s.text || 'Текст важного сообщения'}
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

    const imgTag = `<img src="${src}" 
         style="max-width:100%; width:${s.renderedWidth || 'auto'}px; border-radius:${borderRadius};" 
         alt="${s.alt || ''}">`;

    return `
        <div class="editable-image" 
             data-block-id="${block.id}" 
             style="padding:16px 20px; text-align:${s.align || 'center'}; cursor:pointer;">
            ${s.url ? `<a href="${s.url}" style="display:inline-block; pointer-events:none;">${imgTag}</a>` : imgTag}
            ${s.url ? `<div style="font-size:11px; color:#7700ff; margin-top:4px;">🔗 ${s.url}</div>` : ''}
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

/**
 * Форматирование текста для редактирования (конвертация markdown в HTML)
 */
function formatTextForEditing(content) {
    if (!content) return '';
    // s.content уже simple HTML — просто возвращаем через render для стилей ссылок
    return TextSanitizer.render(content);
}


/**
 * Инициализация inline-редактирования
 */
function initInlineEditing() {
    const canvas = document.getElementById('user-canvas');
    if (!canvas) return;

    canvas.querySelectorAll('.editable-text').forEach(el => {

        el.addEventListener('blur', (e) => {
            saveTextChanges(e.target);
        });

        el.addEventListener('focus', (e) => {
            showTextToolbar(e.target);
            const blockId = parseInt(e.target.dataset.blockId);
            const block = findBlockById(UserAppState.blocks, blockId);
            if (block) {
                // Обновляем innerHTML contenteditable с новым отформатированным текстом
                e.target.innerHTML = TextSanitizer.render(block.settings.content || '');
                // Ставим курсор в конец
                const range = document.createRange();
                const sel = window.getSelection();
                range.selectNodeContents(e.target);
                range.collapse(false);
                sel.removeAllRanges();
                sel.addRange(range);
            }
        });

        el.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            document.execCommand('insertLineBreak');
        });

        el.addEventListener('input', (e) => {
            const target = e.target;
            target.querySelectorAll('span[style], font[color], font[style]').forEach(node => {
                const parent = node.parentNode;
                if (!parent) return;
                while (node.firstChild) {
                    parent.insertBefore(node.firstChild, node);
                }
                parent.removeChild(node);
            });
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

            // Вставляем в позицию курсора
            const selection = window.getSelection();
            if (!selection.rangeCount) return;
            selection.deleteFromDocument();
            const range = selection.getRangeAt(0);
            const fragment = range.createContextualFragment(cleanHTML);
            range.insertNode(fragment);
            selection.collapseToEnd();

            // Сохраняем и обновляем отображение
            saveTextChanges(e.target);

            // Обновляем innerHTML с отформатированным текстом
            const blockId = parseInt(e.target.dataset.blockId);
            const block = findBlockById(UserAppState.blocks, blockId);
            if (block) {
                e.target.innerHTML = TextSanitizer.render(block.settings.content || '');
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

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.editable-text') && !e.target.closest('.text-toolbar')) {
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
    <div class="divider-item ${icon.src === currentSrc ? 'selected' : ''}" data-src="${icon.src}">
      <img src="${icon.src}" alt="${icon.name || ''}">
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

    // Санитизируем HTML из contenteditable → simple HTML
    const newValue = TextSanitizer.sanitize(element.innerHTML, false);

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

            // Показываем/скрываем номер начала и иконки
            const startGroup = document.getElementById('start-number-group');
            const iconGroup = document.getElementById('bullet-icon-group');
            const isNumbered = btn.dataset.value === 'numbered';

            if (startGroup) startGroup.style.display = isNumbered ? 'block' : 'none';
            if (iconGroup) iconGroup.style.display = isNumbered ? 'none' : 'block';
        };
    });

    // Показываем/скрываем в зависимости от текущего типа
    const isNumbered = s.listStyle === 'numbered';
    const startGroup = document.getElementById('start-number-group');
    const iconGroup = document.getElementById('bullet-icon-group');
    if (startGroup) startGroup.style.display = isNumbered ? 'block' : 'none';
    if (iconGroup) iconGroup.style.display = isNumbered ? 'none' : 'block';

    // === Номер начала ===
    const startInput = document.getElementById('list-start-number');
    if (startInput) {
        startInput.value = s.startNumber || 1;
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
        s.startNumber = parseInt(document.getElementById('list-start-number').value) || 1;

        // Собираем элементы
        const editor = document.getElementById('list-items-editor');
        s.items = Array.from(editor.querySelectorAll('input'))
            .map(inp => inp.value.trim())
            .filter(text => text.length > 0);

        // Получаем выбранную иконку
        const selectedIcon = document.querySelector('.bullet-icon-item.selected');
        if (selectedIcon) {
            s.bulletType = selectedIcon.dataset.id;
            s.bulletCustom = null; // Сбрасываем кастомную
        }

        // Перерендериваем буллеты
        if (s.listStyle === 'numbered' && typeof renderListBulletsToDataUrls === 'function') {
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

    grid.innerHTML = bullets.map(bullet => `
        <div class="bullet-icon-item ${bullet.id === selectedId ? 'selected' : ''}" 
             data-id="${bullet.id}" 
             data-src="${bullet.src}">
            <img src="${bullet.src}" alt="${bullet.name || ''}">
        </div>
    `).join('');

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
            <input type="text" value="${escapeHtmlAttr(item)}" placeholder="Текст пункта...">
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
             data-src="${divider.src}">
            <img src="${divider.src}" alt="${divider.name || 'Разделитель'}">
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
    const bgColorInput = document.getElementById('expert-bg-color');

    const hasBg = s.bgColor && s.bgColor !== 'transparent';
    bgToggle.checked = hasBg;
    bgColorRow.style.display = hasBg ? 'flex' : 'none';
    bgColorInput.value = s.bgColor || '#f3f4f6';

    bgToggle.onchange = () => {
        bgColorRow.style.display = bgToggle.checked ? 'flex' : 'none';
        s.bgColor = bgToggle.checked ? bgColorInput.value : 'transparent';
        updateExpertPreview(s);
    };

    bgColorInput.oninput = () => {
        s.bgColor = bgColorInput.value;
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
        s.bgColor = bgToggle.checked ? bgColorInput.value : 'transparent';

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
        <div class="badge-item ${badge.src === selectedSrc ? 'selected' : ''}" data-src="${badge.src}">
            <img src="${badge.src}" alt="${badge.name || ''}">
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

    // Размеры как в renderExpertToDataUrl
    const containerSize = 150;
    const photoSize = containerSize * (130 / 171);

    // Позиция бейджа
    const badgeX = s.badgePositionX ?? 100;
    const badgeY = s.badgePositionY ?? 100;
    const badgeLeft = (containerSize - 40) * (badgeX / 100);
    const badgeTop = (containerSize - 40) * (badgeY / 100);

    // Размер изображения внутри маски (увеличиваем чтобы покрыть ромб)
    const imgSize = photoSize * 1.5 * scale;

    container.innerHTML = `
        <div style="
            position: relative;
            width: ${containerSize}px;
            height: ${containerSize}px;
            background: ${bgColor};
            border-radius: 28%;
        ">
            <!-- Ромб с фото -->
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
                    transform: translate(-50%, -50%) rotate(-45deg) translate(${posX}%, ${posY}%);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                ">
                    <img src="${s.photo || ''}" 
                         style="
                             width: ${imgSize}px;
                             height: auto;
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

window.addEventListener('DOMContentLoaded', () => {
    const btnMeeting = document.getElementById('btn-send-meeting');
    if (btnMeeting) {
        btnMeeting.addEventListener('click', async () => {
            console.log('[UI] meeting click');

            // 1) Получаем HTML письма. Если у тебя есть готовая функция генерации — подставь её сюда.
            // Самый безопасный временный вариант — взять текущий HTML из canvas:
            const canvas = document.getElementById('user-canvas');
            const html = canvas ? canvas.innerHTML : '';

            // 2) Отправляем на backend
            const r = await fetch('/create-meeting', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    html_content: html,
                    subject: document.getElementById('current-template-name')?.textContent || 'Встреча'
                })
            });

            const data = await r.json().catch(() => ({}));
            console.log('[UI] meeting response', r.status, data);

            if (!r.ok) {
                alert('Ошибка создания встречи, см. консоль');
            }
        });
    }
});