// dragDrop.js - Обработка Drag and Drop

// ===== КОНСТАНТЫ =====
const MAX_BUTTON_COLUMNS = 4;
const MAX_TEXT_COLUMNS = 3;
const DEFAULT_COLUMNS = 2;

let columnIdCounter = 0;

// ===== УТИЛИТЫ =====

/**
 * Генерирует уникальный ID для колонки
 */
function generateColumnId() {
    return Date.now() * 1000 + (columnIdCounter++ % 1000);
}

/**
 * Проверяет, является ли блок рядом кнопок
 */
function isButtonsRow(block) {
    if (!block || !block.columns) return false;
    const allBlocks = block.columns.flatMap(col => col.blocks);
    if (allBlocks.length === 0) return false;
    return allBlocks.every(child => child.type === 'button');
}

/**
 * Проверяет, является ли блок рядом текстов
 */
function isTextRow(block) {
    if (!block || !block.columns) return false;
    const allBlocks = block.columns.flatMap(col => col.blocks);
    if (allBlocks.length === 0) return false;
    return allBlocks.every(child => child.type === 'text');
}

/**
 * Нормализует ширину колонок (распределяет равномерно)
 */
function normalizeColumnsWidths(block) {
    if (!block || !block.columns || !block.columns.length) return;
    const n = block.columns.length;
    const base = Math.floor(100 / n);
    const rest = 100 - base * n;
    block.columns.forEach((col, i) => {
        col.width = base + (i === n - 1 ? rest : 0);
    });
}

/**
 * Добавляет блок в ряд колонок или ниже если лимит достигнут
 * @returns {boolean} true если добавлено в колонку, false если ниже
 */
function addBlockToRow(parentBlock, parentId, blockCopy, maxColumns) {
    if (parentBlock.columns.length < maxColumns) {
        parentBlock.columns.push({
            id: generateColumnId(),
            width: Math.floor(100 / (parentBlock.columns.length + 1)),
            blocks: [blockCopy]
        });
        normalizeColumnsWidths(parentBlock);
        return true;
    } else {
        const parentIndex = AppState.blocks.findIndex(b => b.id === parentId);
        if (parentIndex !== -1) {
            AppState.blocks.splice(parentIndex + 1, 0, blockCopy);
        }
        return false;
    }
}

/**
 * Создаёт контейнер с колонками из двух блоков
 */
function createColumnsContainer(block1, block2, columnsCount = DEFAULT_COLUMNS) {
    const columns = [];
    const width = Math.floor(100 / columnsCount);
    
    columns.push({
        id: generateColumnId(),
        width: width,
        blocks: [block1]
    });
    
    columns.push({
        id: generateColumnId(),
        width: 100 - width,
        blocks: [block2]
    });
    
    return {
        id: AppState.getNextBlockId(),
        type: 'columns_container',
        settings: {},
        columns: columns
    };
}

/**
 * Безопасно парсит ID блока из строки
 */
function parseBlockId(str) {
    if (!str || typeof str !== 'string') return null;
    const id = parseInt(str, 10);
    return isNaN(id) ? null : id;
}

/**
 * Глубокое копирование блока
 */
function cloneBlock(block) {
    return JSON.parse(JSON.stringify(block));
}

// ===== ОБРАБОТЧИКИ DRAG START =====

function handleDragStart(e, index, block) {
    if (e.target.closest('.column-block')) return;

    const multi = AppState.multiSelectedBlockIds || new Set();
    const isGroup = multi.has(block.id) && multi.size > 1;

    AppState.startDrag(index, null);
    e.currentTarget.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';

    if (isGroup) {
        const order = AppState.blocks.map(b => b.id);
        const ids = Array.from(multi).slice().sort((a, b) => order.indexOf(a) - order.indexOf(b));
        AppState.draggedBlockIds = ids;
        e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'group', ids }));
    } else {
        AppState.draggedBlockIds = null;
        e.dataTransfer.setData('text/plain', String(block.id));
    }
}

function handleColumnBlockDragStart(e, blockId, parentId, columnId) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(blockId));
    AppState.startDrag(null, { parentId, columnId, blockId });
    e.currentTarget.classList.add('dragging');
}

// ===== ОБРАБОТЧИК DRAG OVER =====

function handleDragOver(e, index) {
    if (e.target.closest('.column-drop-zone') || e.target.closest('.column-content')) {
        return;
    }

    e.preventDefault();
    if (AppState.draggedBlockIndex === null) return;

    const targetBlock = e.currentTarget;
    const rect = targetBlock.getBoundingClientRect();
    const mouseY = e.clientY - rect.top;
    const mouseX = e.clientX - rect.left;

    const heightThreshold = rect.height * DRAG_ZONES.HEIGHT_THRESHOLD;
    const widthThreshold = rect.width * DRAG_ZONES.WIDTH_THRESHOLD;

    if (mouseY < heightThreshold) {
        AppState.setDropZone('top');
        AppState.showDropIndicator(`
            left: ${rect.left}px;
            top: ${rect.top}px;
            width: ${rect.width}px;
            height: 3px;
        `);
    } else if (mouseX < widthThreshold) {
        AppState.setDropZone('left');
        AppState.showDropIndicator(`
            left: ${rect.left}px;
            top: ${rect.top}px;
            width: 3px;
            height: ${rect.height}px;
        `);
    } else if (mouseX > rect.width - widthThreshold) {
        AppState.setDropZone('right');
        AppState.showDropIndicator(`
            left: ${rect.right - 3}px;
            top: ${rect.top}px;
            width: 3px;
            height: ${rect.height}px;
        `);
    } else {
        AppState.setDropZone(null);
        AppState.hideDropIndicator();
    }
}

// ===== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ DROP =====

/**
 * Обработка группового перетаскивания
 */
function handleGroupDrop(e, index, blocks) {
    let payload = null;
    try {
        const raw = e.dataTransfer.getData('text/plain');
        if (raw && raw.startsWith('{')) payload = JSON.parse(raw);
    } catch { }

    if (!payload || payload.type !== 'group' || !Array.isArray(payload.ids) || payload.ids.length <= 1) {
        return false;
    }

    const idsToMove = payload.ids;
    const targetBlock = blocks[index];
    
    if (!targetBlock) {
        AppState.endDrag();
        return true;
    }

    const zone = AppState.currentDropZone;
    AppState.hideDropIndicator();

    if (zone !== 'top') {
        AppState.endDrag();
        return true;
    }

    const targetId = targetBlock.id;
    const byId = new Map(blocks.map(b => [b.id, b]));
    const moving = idsToMove.map(id => byId.get(id)).filter(Boolean);

    AppState.blocks = blocks.filter(b => !idsToMove.includes(b.id));

    const newTargetIndex = AppState.blocks.findIndex(b => b.id === targetId);
    const insertIndex = newTargetIndex === -1 ? AppState.blocks.length : newTargetIndex;

    AppState.blocks.splice(insertIndex, 0, ...moving);

    AppState.endDrag();
    renderCanvas();
    refreshSelectionStyles();
    return true;
}

/**
 * Обработка перетаскивания кнопки
 */
function handleButtonDrop(draggedBlock, targetBlock, draggedIndex, index, blocks) {
    if (draggedBlock.type !== 'button') return false;

    // Кнопка в существующий контейнер с кнопками
    if (targetBlock.type === 'columns_container' && isButtonsRow(targetBlock)) {
        if (targetBlock.columns.length < MAX_BUTTON_COLUMNS) {
            blocks.splice(draggedIndex, 1);
            targetBlock.columns.push({
                id: generateColumnId(),
                width: 25,
                blocks: [draggedBlock]
            });
            normalizeColumnsWidths(targetBlock);
        } else {
            blocks.splice(draggedIndex, 1);
            const rowIndex = blocks.indexOf(targetBlock);
            blocks.splice(rowIndex + 1, 0, draggedBlock);
        }
        AppState.endDrag();
        renderCanvas();
        return true;
    }

    // Кнопка на кнопку — создаём контейнер
    if (targetBlock.type === 'button' && !targetBlock.columns) {
        if (draggedIndex === index) {
            AppState.endDrag();
            return true;
        }

        blocks.splice(draggedIndex, 1);
        const newIndex = draggedIndex < index ? index - 1 : index;
        const targetData = blocks[newIndex];

        blocks[newIndex] = createColumnsContainer(targetData, draggedBlock);

        AppState.endDrag();
        renderCanvas();
        return true;
    }

    // Кнопку тянут на что-то другое — ставим ниже
    blocks.splice(draggedIndex, 1);
    const tgtIndex = blocks.indexOf(targetBlock);
    blocks.splice(tgtIndex + 1, 0, draggedBlock);

    AppState.endDrag();
    renderCanvas();
    return true;
}

/**
 * Обработка перетаскивания текста
 */
function handleTextDrop(draggedBlock, targetBlock, draggedIndex, index, blocks) {
    if (draggedBlock.type !== 'text') return false;

    // Текст в существующий контейнер с текстами
    if (targetBlock.type === 'columns_container' && isTextRow(targetBlock)) {
        if (targetBlock.columns.length < MAX_TEXT_COLUMNS) {
            blocks.splice(draggedIndex, 1);
            targetBlock.columns.push({
                id: generateColumnId(),
                width: 33,
                blocks: [draggedBlock]
            });
            normalizeColumnsWidths(targetBlock);
        } else {
            blocks.splice(draggedIndex, 1);
            const rowIndex = blocks.indexOf(targetBlock);
            blocks.splice(rowIndex + 1, 0, draggedBlock);
        }
        AppState.endDrag();
        renderCanvas();
        return true;
    }

    // Текст на текст — создаём контейнер с 2 колонками
    if (targetBlock.type === 'text' && !targetBlock.columns) {
        if (draggedIndex === index) {
            AppState.endDrag();
            return true;
        }

        blocks.splice(draggedIndex, 1);
        const newIndex = draggedIndex < index ? index - 1 : index;
        const targetData = blocks[newIndex];

        blocks[newIndex] = createColumnsContainer(targetData, draggedBlock);

        AppState.endDrag();
        renderCanvas();
        return true;
    }

    return false;
}

/**
 * Обработка перетаскивания не-кнопки на ряд кнопок
 */
function handleNonButtonOnButtonsRow(draggedBlock, targetBlock, draggedIndex, blocks) {
    if (targetBlock.type === 'columns_container' && isButtonsRow(targetBlock)) {
        blocks.splice(draggedIndex, 1);
        const rowIndex = blocks.indexOf(targetBlock);
        blocks.splice(rowIndex + 1, 0, draggedBlock);
        AppState.endDrag();
        renderCanvas();
        return true;
    }
    return false;
}

/**
 * Обработка дропа в верхнюю зону (перемещение)
 */
function handleTopZoneDrop(draggedBlock, draggedIndex, index, blocks) {
    blocks.splice(draggedIndex, 1);
    const newIndex = draggedIndex < index ? index - 1 : index;
    blocks.splice(newIndex, 0, draggedBlock);
    AppState.endDrag();
    renderCanvas();
}

/**
 * Обработка дропа в боковые зоны (создание колонок)
 */
function handleSideZoneDrop(zone, draggedBlock, targetBlock, draggedIndex, index, blocks) {
    blocks.splice(draggedIndex, 1);
    const newIndex = draggedIndex < index ? index - 1 : index;
    const targetBlockData = blocks[newIndex];

    const containerBlock = {
        id: AppState.getNextBlockId(),
        type: 'columns_container',
        settings: {},
        columns: [
            {
                id: generateColumnId(),
                width: 50,
                blocks: zone === 'left' ? [draggedBlock] : [targetBlockData]
            },
            {
                id: generateColumnId(),
                width: 50,
                blocks: zone === 'left' ? [targetBlockData] : [draggedBlock]
            }
        ]
    };

    blocks[newIndex] = containerBlock;
    AppState.endDrag();
    renderCanvas();
}

// ===== ГЛАВНЫЙ ОБРАБОТЧИК DROP =====

function handleDrop(e, index) {
    // Игнорируем drop внутрь колонок
    if (e.target.closest('.column-drop-zone') || e.target.closest('.column-content')) {
        return;
    }

    e.preventDefault();
    e.stopPropagation();

    if (AppState.draggedBlockIndex === null) return;

    const blocks = AppState.blocks;
    const draggedIndex = AppState.draggedBlockIndex;

    // Обработка группового перетаскивания
    if (handleGroupDrop(e, index, blocks)) return;

    const draggedBlock = blocks[draggedIndex];
    const targetBlock = blocks[index];

    if (!draggedBlock || !targetBlock) {
        AppState.endDrag();
        return;
    }

    const zone = AppState.currentDropZone;
    AppState.hideDropIndicator();

    // ===== ЦЕНТРАЛЬНАЯ ЗОНА (zone === null) =====
    if (!zone) {
        // Обработка кнопок
        if (handleButtonDrop(draggedBlock, targetBlock, draggedIndex, index, blocks)) return;
        
        // Обработка не-кнопки на ряд кнопок
        if (handleNonButtonOnButtonsRow(draggedBlock, targetBlock, draggedIndex, blocks)) return;
        
        // Обработка текстов
        if (handleTextDrop(draggedBlock, targetBlock, draggedIndex, index, blocks)) return;

        // Любой другой дроп по центру — ничего не делаем
        AppState.endDrag();
        return;
    }

    // ===== ВЕРХНЯЯ ЗОНА (перемещение блока) =====
    if (zone === 'top') {
        handleTopZoneDrop(draggedBlock, draggedIndex, index, blocks);
        return;
    }

    // ===== ЛЕВАЯ / ПРАВАЯ ЗОНА (создание колонок) =====
    if (zone === 'left' || zone === 'right') {
        handleSideZoneDrop(zone, draggedBlock, targetBlock, draggedIndex, index, blocks);
        return;
    }

    AppState.endDrag();
    renderCanvas();
}

function handleDragEnd(e) {
    e.currentTarget.classList.remove('dragging');
    AppState.draggedBlockIds = null;
    AppState.endDrag();
}

// ===== НАСТРОЙКА CANVAS DRAG & DROP =====

function setupCanvasDragDrop(canvas) {
    canvas.addEventListener('dragover', (e) => {
        const dropZone = e.target.closest('.column-drop-zone');
        const columnContent = e.target.closest('.column-content');

        if (dropZone || columnContent) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        } else if (AppState.draggedFromColumnId &&
            !e.target.closest('.column-block') &&
            !e.target.closest('.email-block')) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        }
    });

    canvas.addEventListener('drop', (e) => {
        handleCanvasDrop(e, canvas);
    });
}

function handleCanvasDrop(e, canvas) {
    const dropZone = e.target.closest('.column-drop-zone');
    const columnContent = e.target.closest('.column-content');
    const columnBlock = e.target.closest('.column-block');

    // Если бросили НЕ в колонки И НЕ на другой блок
    if (!dropZone && !columnContent && !columnBlock && !e.target.closest('.email-block')) {
        handleDropOutsideColumns(e, canvas);
        return;
    }

    // Обработка дропа в колонки
    if (dropZone || columnContent || columnBlock) {
        handleDropIntoColumn(e);
    }
}

// ===== ОБРАБОТКА DROP ВНЕ КОЛОНОК =====

function handleDropOutsideColumns(e, canvas) {
    if (!AppState.draggedFromColumnId) return;

    e.preventDefault();
    e.stopPropagation();

    const { parentId, columnId, blockId } = AppState.draggedFromColumnId;
    const draggedBlock = AppState.findBlockById(blockId);

    if (!draggedBlock) return;

    // Удаляем из колонки
    const parentBlock = AppState.findBlockById(parentId);
    if (parentBlock && parentBlock.columns) {
        const column = parentBlock.columns.find(c => c.id === columnId);
        if (column) {
            column.blocks = column.blocks.filter(b => b.id !== blockId);
        }
    }

    // Определяем куда вставить
    const mouseY = e.clientY;
    let insertIndex = AppState.blocks.length;

    const blockElements = canvas.querySelectorAll('.email-block:not(.column-block)');
    for (let i = 0; i < blockElements.length; i++) {
        const rect = blockElements[i].getBoundingClientRect();
        if (mouseY < rect.top + rect.height / 2) {
            insertIndex = i;
            break;
        }
    }

    // Создаём копию блока и вставляем
    const blockCopy = cloneBlock(draggedBlock);
    AppState.blocks.splice(insertIndex, 0, blockCopy);

    // Проверяем пустые колонки
    cleanupEmptyColumns(parentBlock, parentId, columnId);

    AppState.draggedFromColumnId = null;
    renderCanvas();
    selectBlock(blockCopy.id);
}

// ===== ОБРАБОТКА DROP В КОЛОНКИ =====

function handleDropIntoColumn(e) {
    e.preventDefault();
    e.stopPropagation();

    const blockIdStr = e.dataTransfer.getData('text/plain');
    const blockId = parseBlockId(blockIdStr);
    if (blockId === null) return;

    const draggedBlock = AppState.findBlockById(blockId);
    if (!draggedBlock) return;

    // Определяем целевую колонку
    let parentId, columnId;
    const dropZone = e.target.closest('.column-drop-zone');
    const columnContent = e.target.closest('.column-content');
    const columnBlock = e.target.closest('.column-block');

    if (dropZone) {
        parentId = parseBlockId(dropZone.dataset.parentId);
        columnId = parseBlockId(dropZone.dataset.columnId);
    } else if (columnContent || columnBlock) {
        const column = (columnContent || columnBlock).closest('.column');
        if (!column) return;

        columnId = parseBlockId(column.dataset.columnId);
        const content = column.querySelector('.column-content');
        parentId = parseBlockId(content.dataset.parentId);
    }

    if (parentId === null || columnId === null) return;

    // Запоминаем: тащили из колонки или с верхнего уровня
    const fromColumn = !!AppState.draggedFromColumnId;

    // Сначала удаляем блок из старого места
    removeBlockFromParent(blockId);

    const parentBlock = AppState.findBlockById(parentId);
    if (!parentBlock || !parentBlock.columns) return;

    const column = parentBlock.columns.find(c => c.id === columnId);
    if (!column) return;

    const blockCopy = cloneBlock(draggedBlock);
    const buttonsRow = isButtonsRow(parentBlock);
    const textRow = isTextRow(parentBlock);

    // ===== ОСОБЫЕ СЛУЧАИ ДЛЯ РЯДА КНОПОК =====

    // Кнопка с верхнего уровня в ряд кнопок
    if (buttonsRow && draggedBlock.type === 'button' && !fromColumn) {
        addBlockToRow(parentBlock, parentId, blockCopy, MAX_BUTTON_COLUMNS);
        AppState.draggedFromColumnId = null;
        renderCanvas();
        selectBlock(blockCopy.id);
        return;
    }

    // Не-кнопка в ряд кнопок -> блок ниже ряда
    if (buttonsRow && draggedBlock.type !== 'button') {
        const parentIndex = AppState.blocks.findIndex(b => b.id === parentId);
        if (parentIndex !== -1) {
            AppState.blocks.splice(parentIndex + 1, 0, blockCopy);
        }
        AppState.draggedFromColumnId = null;
        renderCanvas();
        selectBlock(blockCopy.id);
        return;
    }

    // ===== ОСОБЫЕ СЛУЧАИ ДЛЯ РЯДА ТЕКСТОВ =====

    // Текст с верхнего уровня в ряд текстов
    if (textRow && draggedBlock.type === 'text' && !fromColumn) {
        addBlockToRow(parentBlock, parentId, blockCopy, MAX_TEXT_COLUMNS);
        AppState.draggedFromColumnId = null;
        renderCanvas();
        selectBlock(blockCopy.id);
        return;
    }

    // Не-текст в ряд текстов -> блок ниже ряда
    if (textRow && draggedBlock.type !== 'text') {
        const parentIndex = AppState.blocks.findIndex(b => b.id === parentId);
        if (parentIndex !== -1) {
            AppState.blocks.splice(parentIndex + 1, 0, blockCopy);
        }
        AppState.draggedFromColumnId = null;
        renderCanvas();
        selectBlock(blockCopy.id);
        return;
    }

    // ===== ОСТАЛЬНЫЕ СЛУЧАИ =====
    // Обычное поведение: просто кладём в выбранную колонку
    column.blocks.push(blockCopy);

    AppState.draggedFromColumnId = null;
    renderCanvas();
    selectBlock(blockCopy.id);
}

// ===== ОЧИСТКА ПУСТЫХ КОЛОНОК =====

function cleanupEmptyColumns(parentBlock, parentId, columnId) {
    if (!parentBlock || !parentBlock.columns) return;

    const column = parentBlock.columns.find(c => c.id === columnId);
    if (!column || column.blocks.length > 0) return;

    // Находим колонки с блоками
    const nonEmptyColumns = parentBlock.columns.filter(c => c.blocks.length > 0);

    if (nonEmptyColumns.length > 0) {
        // Есть непустые колонки — удаляем только пустую
        if (nonEmptyColumns.length === 1 && parentBlock.columns.length === 2) {
            // Осталась одна непустая колонка — разворачиваем контейнер
            const parentIndex = AppState.blocks.findIndex(b => b.id === parentId);
            if (parentIndex !== -1) {
                const remainingBlocks = nonEmptyColumns[0].blocks.map(b => cloneBlock(b));
                AppState.blocks.splice(parentIndex, 1, ...remainingBlocks);
            }
        } else {
            // Просто удаляем пустую колонку
            parentBlock.columns = parentBlock.columns.filter(c => c.id !== columnId);
            normalizeColumnsWidths(parentBlock);
        }
    } else {
        // Все колонки пустые — удаляем контейнер
        AppState.removeBlock(parentId);
    }
}