// dragDrop.js - Обработка Drag and Drop
//
// Один механизм для всех перетаскиваний на холсте (блок верхнего уровня, блок из
// колонки, ряд колонок, группа выделенных блоков):
//   dragover — по геометрии находим место вставки (DropLogic.computeDropTarget)
//              и показываем его раздвиганием блоков (DragPreview);
//   drop     — применяем то же самое место (executeDrop).
// Подсказка и результат считаются одной функцией, поэтому расходиться им нечему.

// ===== КОНСТАНТЫ =====
const MAX_BUTTON_COLUMNS = 4;
// Общий лимит для любого не-кнопочного ряда (текст/картинки/микс) —
// кнопки остаются отдельной сущностью со своим (более широким) лимитом,
// т.к. это узкие "таблетки", предназначенные именно для плотного ряда.
const MAX_MIXED_COLUMNS = 3;
const DEFAULT_COLUMNS = 2;

const DRAG_SCROLL_EDGE_PX = 64;    // у верхнего/нижнего края холста включается автопрокрутка
const DRAG_SCROLL_MAX_SPEED = 18;  // px за кадр у самого края
const DRAG_TARGET_MIN_INTERVAL_MS = 70;  // не перестраиваем предпросмотр чаще — иначе мерцает

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
    if (block.type === 'group_container') return false;
    const allBlocks = block.columns.flatMap(col => col.blocks);
    if (allBlocks.length === 0) return false;
    return allBlocks.every(child => child.type === 'button');
}

/**
 * Проверяет, можно ли в этот ряд подмешивать разные типы блоков —
 * любой контейнер колонок, КРОМЕ чистого ряда кнопок (у кнопок свой,
 * более узкий визуальный формат и свой лимит, см. isButtonsRow). Сюда
 * входят ряды из одного текста/картинок и уже смешанные ряды.
 */
function isMixableRow(block) {
    if (!block || !block.columns) return false;
    if (block.type === 'group_container') return false;
    const allBlocks = block.columns.flatMap(col => col.blocks);
    if (allBlocks.length === 0) return false;
    return !isButtonsRow(block);
}

/**
 * Определяет, что произойдёт, если сейчас отпустить перетаскиваемый блок
 * НАД рядом колонок parentBlock: 'grow' — добавится новая колонка,
 * 'below' — блок уйдёт под ряд, 'stack' — обычное поведение (положится
 * в конкретную колонку). Единый источник истины и для самого дропа, и для
 * подсказки при наведении, и для добавления блока кликом из палитры
 * (canPlaceInColumn) — чтобы правила нигде не расходились.
 *
 * preferGrow — зависит от ТОЧКИ дропа внутри уже занятой колонки: у края
 * колонки пользователь хочет новую колонку, в остальной части — доложить
 * блок в эту же (stack).
 */
function getRowDropOutcome(parentBlock, draggedBlock, fromColumn, preferGrow) {
    if (!parentBlock || !parentBlock.columns || !draggedBlock) return 'stack';
    const buttonsRow = isButtonsRow(parentBlock);
    const mixableRow = isMixableRow(parentBlock);

    // Баннер, разделитель и отступ занимают всю ширину письма — в ряд не встают.
    if ((buttonsRow || mixableRow) && !DropLogic.canJoinColumns(draggedBlock.type)) return 'below';

    if (buttonsRow) {
        if (draggedBlock.type !== 'button') return 'below';
        if (fromColumn || !preferGrow) return 'stack';
        return parentBlock.columns.length < MAX_BUTTON_COLUMNS ? 'grow' : 'below';
    }
    if (mixableRow) {
        if (draggedBlock.type === 'button') return 'below';
        if (fromColumn || !preferGrow) return 'stack';
        return parentBlock.columns.length < MAX_MIXED_COLUMNS ? 'grow' : 'below';
    }
    return 'stack';
}

/**
 * Можно ли новый блок (клик в палитре) положить в колонку ряда, где выделен
 * другой блок. Тот же ответ, что дало бы перетаскивание в эту колонку.
 */
function canPlaceInColumn(rowBlock, newBlock) {
    if (!DropLogic.canJoinColumns(newBlock.type)) return false;
    return getRowDropOutcome(rowBlock, newBlock, true, false) === 'stack';
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
        settings: { bgEnabled: false, bgColor: '#1e293b', bgRadius: 8, bgPadding: 16 },
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

// ===== СОСТОЯНИЕ ТЕКУЩЕГО ПЕРЕТАСКИВАНИЯ =====

const DragSession = {
    active: false,
    drag: null,          // { id, type, fromColumn, isGroup, ids, sourceIndex, parentId, columnId }
    height: 0,           // высота переносимого блока — размер «окна» предпросмотра
    label: '',           // подпись в предпросмотре
    pointer: { x: 0, y: 0 },
    target: null,
    lastChangeAt: 0,
    frame: 0,
    scrollFrame: 0
};

function describeDragged(block) {
    const name = typeof getBlockTypeName === 'function' ? getBlockTypeName(block.type) : block.type;
    return `Сюда встанет: ${name}`;
}

/**
 * Вместо «снимка» всего блока, который закрывает место вставки, к курсору цепляется
 * небольшая плашка с названием блока — со сдвигом вправо-вниз, чтобы не перекрывать цель.
 */
function setCompactDragImage(e, label) {
    if (!e.dataTransfer || typeof e.dataTransfer.setDragImage !== 'function') return;
    const chip = document.createElement('div');
    chip.className = 'drag-chip';
    chip.textContent = label;
    document.body.appendChild(chip);
    e.dataTransfer.setDragImage(chip, -16, -16);
    setTimeout(() => chip.remove(), 0);
}

function beginDragSession(drag, block, element) {
    DragSession.active = true;
    DragSession.drag = drag;
    DragSession.height = element ? element.getBoundingClientRect().height : 0;
    DragSession.label = describeDragged(block);
    DragSession.target = null;
    DragSession.lastChangeAt = 0;
}

function endDragSession() {
    if (DragSession.frame) cancelAnimationFrame(DragSession.frame);
    if (DragSession.scrollFrame) cancelAnimationFrame(DragSession.scrollFrame);
    DragSession.frame = 0;
    DragSession.scrollFrame = 0;
    DragSession.active = false;
    DragSession.drag = null;
    DragSession.target = null;
    DragPreview.clear();
    document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
    AppState.draggedBlockIds = null;
    AppState.endDrag();
}

// ===== ОБРАБОТЧИКИ DRAG START =====

function handleDragStart(e, index, block) {
    // Перетаскивание блока из колонки обрабатывает handleColumnBlockDragStart
    if (e.target.closest('.column-block')) return;

    const multi = AppState.multiSelectedBlockIds || new Set();
    const isGroup = multi.has(block.id) && multi.size > 1;

    AppState.startDrag(index, null);
    e.currentTarget.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';

    let ids = null;
    if (isGroup) {
        const order = AppState.blocks.map(b => b.id);
        ids = Array.from(multi).slice().sort((a, b) => order.indexOf(a) - order.indexOf(b));
        AppState.draggedBlockIds = ids;
        e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'group', ids }));
    } else {
        AppState.draggedBlockIds = null;
        e.dataTransfer.setData('text/plain', String(block.id));
    }

    const typeName = typeof getBlockTypeName === 'function' ? getBlockTypeName(block.type) : block.type;
    setCompactDragImage(e, isGroup ? `Блоков: ${ids.length}` : typeName);

    beginDragSession({
        id: block.id,
        type: block.type,
        fromColumn: false,
        isGroup,
        ids,
        sourceIndex: index,
        parentId: null,
        columnId: null
    }, block, e.currentTarget);
}

function handleColumnBlockDragStart(e, blockId, parentId, columnId) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(blockId));
    AppState.startDrag(null, { parentId, columnId, blockId });
    e.currentTarget.classList.add('dragging');

    const block = AppState.findBlockById(blockId);
    if (!block) return;
    setCompactDragImage(e, typeof getBlockTypeName === 'function' ? getBlockTypeName(block.type) : block.type);
    beginDragSession({
        id: blockId,
        type: block.type,
        fromColumn: true,
        isGroup: false,
        ids: null,
        sourceIndex: null,
        parentId,
        columnId
    }, block, e.currentTarget);
}

function handleDragEnd() {
    endDragSession();
}

// ===== ГЕОМЕТРИЯ ХОЛСТА =====

function rectOf(el) {
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
}

/**
 * Снимок блоков верхнего уровня в координатах окна — для DropLogic.computeDropTarget.
 * Считается заново на каждом dragover: пользователь видит раздвинутые блоки, и место
 * вставки определяется по тому, что он видит, а не по исходной раскладке.
 */
function buildCanvasLayout(canvas) {
    const layout = [];
    Array.from(canvas.children).forEach(el => {
        if (!el.classList.contains('email-block')) return;
        const id = parseInt(el.dataset.blockId, 10);
        const index = AppState.blocks.findIndex(b => b.id === id);
        if (index === -1) return;
        const block = AppState.blocks[index];

        const entry = { id, index, type: block.type, ...rectOf(el) };
        if (block.columns) {
            const body = el.querySelector('.columns-container');
            if (body) entry.body = rectOf(body);
            entry.columns = Array.from(el.querySelectorAll('.column'))
                .filter(col => !col.classList.contains('drop-ghost-column'))
                .map(col => ({
                    id: parseBlockId(col.dataset.columnId),
                    ...rectOf(col),
                    children: Array.from(col.querySelectorAll(':scope > .column-content > .column-block'))
                        .map(child => ({ id: parseBlockId(child.dataset.blockId), ...rectOf(child) }))
                }));
        }
        layout.push(entry);
    });
    return layout;
}

function resolveDropTarget(canvas, point) {
    const drag = DragSession.drag;
    const layout = buildCanvasLayout(canvas);
    const dragged = AppState.findBlockById(drag.id);
    const outcomeFn = (rowId, preferGrow) =>
        getRowDropOutcome(AppState.findBlockById(rowId), dragged, drag.fromColumn, preferGrow);

    const target = DropLogic.computeDropTarget(layout, point, drag, outcomeFn);
    if (target.kind === 'slot' && !drag.isGroup && DropLogic.isNoopSlot(target.index, drag.sourceIndex)) {
        return { kind: 'none' };
    }
    return target;
}

// ===== НАВЕДЕНИЕ =====

function updateDropPreview(canvas) {
    DragSession.frame = 0;
    if (!DragSession.active) return;

    const target = resolveDropTarget(canvas, DragSession.pointer);
    const now = performance.now();
    const changed = JSON.stringify(target) !== JSON.stringify(DragSession.target);
    if (!changed) return;
    // Предпросмотр меняет раскладку: без паузы курсор попадал бы в только что сдвинутый блок.
    if (DragSession.target && now - DragSession.lastChangeAt < DRAG_TARGET_MIN_INTERVAL_MS) {
        scheduleDropPreview(canvas);
        return;
    }

    DragSession.target = target;
    DragSession.lastChangeAt = now;
    DragPreview.show(
        canvas,
        target,
        { height: DragSession.height, label: DragSession.label },
        index => (AppState.blocks[index] ? AppState.blocks[index].id : null)
    );
}

function scheduleDropPreview(canvas) {
    if (DragSession.frame) return;
    DragSession.frame = requestAnimationFrame(() => updateDropPreview(canvas));
}

/** Автопрокрутка холста, пока курсор у его верхнего или нижнего края. */
function autoScrollCanvas(canvas) {
    DragSession.scrollFrame = 0;
    if (!DragSession.active) return;

    const rect = canvas.getBoundingClientRect();
    const y = DragSession.pointer.y;
    let speed = 0;
    if (y < rect.top + DRAG_SCROLL_EDGE_PX) {
        speed = -DRAG_SCROLL_MAX_SPEED * Math.min(1, (rect.top + DRAG_SCROLL_EDGE_PX - y) / DRAG_SCROLL_EDGE_PX);
    } else if (y > rect.bottom - DRAG_SCROLL_EDGE_PX) {
        speed = DRAG_SCROLL_MAX_SPEED * Math.min(1, (y - (rect.bottom - DRAG_SCROLL_EDGE_PX)) / DRAG_SCROLL_EDGE_PX);
    }
    if (!speed) return;

    canvas.scrollTop += speed;
    scheduleDropPreview(canvas);
    DragSession.scrollFrame = requestAnimationFrame(() => autoScrollCanvas(canvas));
}

// ===== ПРИМЕНЕНИЕ ДРОПА =====

/** Вынимает перетаскиваемый блок из старого места и возвращает его. */
function detachDragged(drag) {
    if (drag.fromColumn) {
        const parent = AppState.findBlockById(drag.parentId);
        const column = parent && parent.columns && parent.columns.find(c => c.id === drag.columnId);
        const block = column && column.blocks.find(b => b.id === drag.id);
        if (!block) return null;
        column.blocks = column.blocks.filter(b => b.id !== drag.id);
        return block;
    }
    const index = AppState.blocks.findIndex(b => b.id === drag.id);
    if (index === -1) return null;
    return AppState.blocks.splice(index, 1)[0];
}

function insertBeforeAnchor(list, anchorId, block) {
    const at = anchorId === null ? -1 : list.findIndex(b => b.id === anchorId);
    list.splice(at === -1 ? list.length : at, 0, block);
}

function dropGroup(target) {
    const ids = DragSession.drag.ids;
    const blocks = AppState.blocks;
    let anchorIndex = target.index;
    while (anchorIndex < blocks.length && ids.includes(blocks[anchorIndex].id)) anchorIndex++;
    const anchorId = blocks[anchorIndex] ? blocks[anchorIndex].id : null;

    const moving = blocks.filter(b => ids.includes(b.id));
    AppState.blocks = blocks.filter(b => !ids.includes(b.id));
    const at = anchorId === null ? AppState.blocks.length : AppState.blocks.findIndex(b => b.id === anchorId);
    AppState.blocks.splice(at === -1 ? AppState.blocks.length : at, 0, ...moving);

    renderCanvas();
    refreshSelectionStyles();
}

function executeDrop(target) {
    const drag = DragSession.drag;
    if (!drag || !target || target.kind === 'none') return;

    AppState.pushUndo();

    if (drag.isGroup) {
        dropGroup(target.kind === 'slot' ? target : { kind: 'slot', index: target.index });
        return;
    }

    // Якоря берём по id ДО изменений: индексы после вынимания блока сдвигаются.
    const blocksBefore = AppState.blocks;
    const targetBlock = target.kind === 'slot' ? null : blocksBefore[target.index];
    const slotAnchorId = target.kind === 'slot' && blocksBefore[target.index] ? blocksBefore[target.index].id : null;
    let columnAnchorId = null;
    if (target.kind === 'column' && target.mode === 'stack' && targetBlock) {
        const column = targetBlock.columns.find(c => c.id === target.columnId);
        columnAnchorId = column && column.blocks[target.insertAt] ? column.blocks[target.insertAt].id : null;
    }

    const moving = detachDragged(drag);
    if (!moving) {
        AppState.undo();
        return;
    }

    if (target.kind === 'slot') {
        insertBeforeAnchor(AppState.blocks, slotAnchorId, moving);
    } else if (target.kind === 'side' || target.kind === 'center') {
        const at = AppState.blocks.findIndex(b => b.id === targetBlock.id);
        const mergedRow = target.side === 'left'
            ? createColumnsContainer(moving, targetBlock)
            : createColumnsContainer(targetBlock, moving);
        AppState.blocks[at] = mergedRow;
    } else if (target.kind === 'column' && target.mode === 'grow') {
        const maxColumns = isButtonsRow(targetBlock) ? MAX_BUTTON_COLUMNS : MAX_MIXED_COLUMNS;
        addBlockToRow(targetBlock, targetBlock.id, moving, maxColumns);
    } else if (target.kind === 'column') {
        const column = targetBlock.columns.find(c => c.id === target.columnId);
        insertBeforeAnchor(column.blocks, columnAnchorId, moving);
    }

    // Вынули из колонки — чистим опустевшую колонку (и разворачиваем ряд из одной колонки).
    if (drag.fromColumn) {
        const sourceParent = AppState.findBlockById(drag.parentId);
        cleanupEmptyColumns(sourceParent, drag.parentId, drag.columnId);
    }

    selectBlock(moving.id);
}

// ===== НАСТРОЙКА CANVAS DRAG & DROP =====

let canvasDragDropReady = false;

function setupCanvasDragDrop(canvas) {
    if (canvasDragDropReady) return;
    canvasDragDropReady = true;

    canvas.addEventListener('dragover', (e) => {
        // Внешние перетаскивания (файлы) не трогаем
        if (!DragSession.active) return;

        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        DragSession.pointer = { x: e.clientX, y: e.clientY };
        scheduleDropPreview(canvas);
        if (!DragSession.scrollFrame) {
            DragSession.scrollFrame = requestAnimationFrame(() => autoScrollCanvas(canvas));
        }
    });

    canvas.addEventListener('dragleave', (e) => {
        if (!DragSession.active) return;
        if (e.relatedTarget && canvas.contains(e.relatedTarget)) return;
        DragSession.target = null;
        DragPreview.clear();
    });

    canvas.addEventListener('drop', (e) => {
        if (!DragSession.active) return;
        e.preventDefault();
        e.stopPropagation();

        const target = resolveDropTarget(canvas, { x: e.clientX, y: e.clientY });
        DragPreview.clear(true);
        executeDrop(target);
        endDragSession();
    });

    // dragend не приходит, если исходный элемент успели перерисовать, — слушаем на документе
    document.addEventListener('dragend', () => {
        if (DragSession.active) endDragSession();
    }, true);
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
