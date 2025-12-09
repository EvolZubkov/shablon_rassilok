// dragDrop.js - Обработка Drag and Drop
function isButtonsRow(block) {
    if (!block || !block.columns) return false;
    return block.columns.every(col =>
        col.blocks.every(child => child.type === 'button')
    );
}

function normalizeColumnsWidths(block) {
    if (!block || !block.columns || !block.columns.length) return;
    const n = block.columns.length;
    const base = Math.floor(100 / n);
    let rest = 100 - base * n;
    block.columns.forEach((col, i) => {
        col.width = base + (i === n - 1 ? rest : 0);
    });
}


function handleDragStart(e, index, block) {
    // Если тянем блок ВНУТРИ колонки — этот handler игнорируем
    if (e.target.closest('.column-block')) {
        return;
    }

    AppState.startDrag(index, null);
    e.target.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(block.id));
}

function handleColumnBlockDragStart(e, blockId, parentId, columnId) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(blockId));

    AppState.startDrag(null, { parentId, columnId, blockId });
    e.target.classList.add('dragging');
}

function handleDragOver(e, index) {
    // Если курсор сейчас над колонками/зоной дропа колонок —
    // НЕ двигаем верхний список блоков
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

    // Определяем зону
    if (mouseY < heightThreshold) {
        // Верхняя зона - меняем местами
        AppState.setDropZone('top');
        AppState.showDropIndicator(`
            left: ${rect.left}px;
            top: ${rect.top}px;
            width: ${rect.width}px;
            height: 3px;
        `);
    } else if (mouseX < widthThreshold) {
        // Левая зона - создаём колонки
        AppState.setDropZone('left');
        AppState.showDropIndicator(`
            left: ${rect.left}px;
            top: ${rect.top}px;
            width: 3px;
            height: ${rect.height}px;
        `);
    } else if (mouseX > rect.width - widthThreshold) {
        // Правая зона - создаём колонки
        AppState.setDropZone('right');
        AppState.showDropIndicator(`
            left: ${rect.right - 3}px;
            top: ${rect.top}px;
            width: 3px;
            height: ${rect.height}px;
        `);
    } else {
        // Центральная зона - ничего не делаем
        AppState.setDropZone(null);
        AppState.hideDropIndicator();
    }
}

function handleDrop(e, index) {
    // Если бросаем ВНУТРЬ колонок — не трогаем событие
    if (e.target.closest('.column-drop-zone') || e.target.closest('.column-content')) {
        return;
    }

    e.preventDefault();
    e.stopPropagation();

    if (AppState.draggedBlockIndex === null) return;

    const blocks = AppState.blocks;
    const draggedIndex = AppState.draggedBlockIndex;
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
        // 1) Кнопка на кнопку — наш особый кейс
        if (draggedBlock.type === 'button') {

            // 1.1. Если целевой блок — уже контейнер с кнопками (ряд)
            if (targetBlock.type === 'columns_container' && isButtonsRow(targetBlock)) {
                // если колонок меньше 4 — добавляем ещё одну кнопку в ряд
                if (targetBlock.columns.length < 4) {
                    // вырезаем кнопку из основного списка
                    blocks.splice(draggedIndex, 1);

                    // индекс контейнера мог сместиться, найдём его
                    const rowIndex = blocks.indexOf(targetBlock);

                    targetBlock.columns.push({
                        id: Date.now(),
                        width: 25,
                        blocks: [draggedBlock]
                    });
                    normalizeColumnsWidths(targetBlock);

                    AppState.endDrag();
                    renderCanvas();
                    return;
                } else {
                    // уже 4 колонки — новую кнопку ставим НИЖЕ ряда
                    blocks.splice(draggedIndex, 1);
                    const rowIndex = blocks.indexOf(targetBlock);
                    blocks.splice(rowIndex + 1, 0, draggedBlock);

                    AppState.endDrag();
                    renderCanvas();
                    return;
                }
            }

            // 1.2. Если целевой блок — обычная кнопка (без колонок)
            if (targetBlock.type === 'button' && !targetBlock.columns) {
                if (draggedIndex === index) {
                    AppState.endDrag();
                    return;
                }

                // вырезаем перетаскиваемую кнопку из списка
                blocks.splice(draggedIndex, 1);

                // после вырезания целевой индекс может сдвинуться
                const newIndex = draggedIndex < index ? index - 1 : index;
                const targetData = blocks[newIndex];

                const containerBlock = {
                    id: AppState.getNextBlockId(),
                    type: 'columns_container',
                    settings: {},
                    columns: [
                        {
                            id: Date.now(),
                            width: 50,
                            blocks: [targetData]
                        },
                        {
                            id: Date.now() + 1,
                            width: 50,
                            blocks: [draggedBlock]
                        }
                    ]
                };

                blocks[newIndex] = containerBlock;

                AppState.endDrag();
                renderCanvas();
                return;
            }

            // 1.3. Кнопку тянут на что-то ещё — по умолчанию ставим НИЖЕ цели
            blocks.splice(draggedIndex, 1);
            const tgtIndex = blocks.indexOf(targetBlock);
            blocks.splice(tgtIndex + 1, 0, draggedBlock);

            AppState.endDrag();
            renderCanvas();
            return;
        }

        // 2) Тянем НЕ кнопку на ряд кнопок — блок остаётся НИЖЕ
        if (targetBlock.type === 'columns_container' && isButtonsRow(targetBlock)) {
            blocks.splice(draggedIndex, 1);
            const rowIndex = blocks.indexOf(targetBlock);
            blocks.splice(rowIndex + 1, 0, draggedBlock);

            AppState.endDrag();
            renderCanvas();
            return;
        }

        // 3) Любой другой дроп по центру — ничего не делаем
        AppState.endDrag();
        return;
    }

    // ===== ВЕРХНЯЯ ЗОНА (перемещение блока) =====
    if (zone === 'top') {
        blocks.splice(draggedIndex, 1);
        const newIndex = draggedIndex < index ? index - 1 : index;
        blocks.splice(newIndex, 0, draggedBlock);

        AppState.endDrag();
        renderCanvas();
        return;
    }

    // ===== ЛЕВАЯ / ПРАВАЯ ЗОНА — создаём контейнер с колонками =====
    if (zone === 'left' || zone === 'right') {
        blocks.splice(draggedIndex, 1);
        const newIndex = draggedIndex < index ? index - 1 : index;
        const targetBlockData = blocks[newIndex];

        const containerBlock = {
            id: AppState.getNextBlockId(),
            type: 'columns_container',
            settings: {},
            columns: [
                {
                    id: Date.now(),
                    width: 50,
                    blocks: zone === 'left' ? [draggedBlock] : [targetBlockData]
                },
                {
                    id: Date.now() + 1,
                    width: 50,
                    blocks: zone === 'left' ? [targetBlockData] : [draggedBlock]
                }
            ]
        };

        blocks[newIndex] = containerBlock;

        AppState.endDrag();
        renderCanvas();
        return;
    }

    AppState.endDrag();
    renderCanvas();
}


function handleDragEnd(e) {
    e.target.classList.remove('dragging');
    AppState.endDrag();
}

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
    const canvasRect = canvas.getBoundingClientRect();
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
    const blockCopy = JSON.parse(JSON.stringify(draggedBlock));
    AppState.blocks.splice(insertIndex, 0, blockCopy);

    // Проверяем пустые колонки
    cleanupEmptyColumns(parentBlock, parentId, columnId);

    AppState.draggedFromColumnId = null;
    renderCanvas();
    selectBlock(blockCopy.id);
}

function handleDropIntoColumn(e) {
    e.preventDefault();
    e.stopPropagation();

    const blockIdStr = e.dataTransfer.getData('text/plain');
    if (!blockIdStr) return;

    const blockId = parseInt(blockIdStr, 10);
    const draggedBlock = AppState.findBlockById(blockId);
    if (!draggedBlock) return;

    let parentId, columnId;
    const dropZone = e.target.closest('.column-drop-zone');
    const columnContent = e.target.closest('.column-content');
    const columnBlock = e.target.closest('.column-block');

    if (dropZone) {
        parentId = parseInt(dropZone.dataset.parentId, 10);
        columnId = parseInt(dropZone.dataset.columnId, 10);
    } else if (columnContent || columnBlock) {
        const column = (columnContent || columnBlock).closest('.column');
        if (!column) return;

        columnId = parseInt(column.dataset.columnId, 10);
        const content = column.querySelector('.column-content');
        parentId = parseInt(content.dataset.parentId, 10);
    }

    if (!parentId || !columnId) return;

    // Запоминаем: тащили из колонки или с верхнего уровня
    const fromColumn = !!AppState.draggedFromColumnId;

    // Сначала удаляем блок из старого места
    removeBlockFromParent(blockId);

    const parentBlock = AppState.findBlockById(parentId);
    if (!parentBlock || !parentBlock.columns) return;

    const column = parentBlock.columns.find(c => c.id === columnId);
    if (!column) return;

    const blockCopy = JSON.parse(JSON.stringify(draggedBlock));
    const buttonsRow = isButtonsRow(parentBlock);

    // ===== ОСОБЫЕ СЛУЧАИ ДЛЯ РЯДА КНОПОК =====

    // 1) Тянем КНОПКУ с верхнего уровня в ряд кнопок
    if (buttonsRow && draggedBlock.type === 'button' && !fromColumn) {
        if (parentBlock.columns.length < 4) {
            // создаём НОВУЮ колонку с этой кнопкой
            parentBlock.columns.push({
                id: Date.now(),
                width: 25,
                blocks: [blockCopy]
            });
            normalizeColumnsWidths(parentBlock);
        } else {
            // уже 4 колонки — вставляем блок НИЖЕ ряда
            const parentIndex = AppState.blocks.findIndex(b => b.id === parentId);
            if (parentIndex !== -1) {
                AppState.blocks.splice(parentIndex + 1, 0, blockCopy);
            }
        }

        AppState.draggedFromColumnId = null;
        renderCanvas();
        selectBlock(blockCopy.id);
        return;
    }

    // 2) Тянем НЕ кнопку в ряд кнопок -> блок НИЖЕ ряда
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

    // ===== ОСТАЛЬНЫЕ СЛУЧАИ =====
    // обычное поведение: просто кладём в выбранную колонку
    column.blocks.push(blockCopy);

    AppState.draggedFromColumnId = null;
    renderCanvas();
    selectBlock(blockCopy.id);
}


function cleanupEmptyColumns(parentBlock, parentId, columnId) {
    if (!parentBlock || !parentBlock.columns) return;

    const column = parentBlock.columns.find(c => c.id === columnId);
    if (!column || column.blocks.length > 0) return;

    const otherColumn = parentBlock.columns.find(c => c.id !== columnId);
    
    if (otherColumn && otherColumn.blocks.length > 0) {
        const parentIndex = AppState.blocks.findIndex(b => b.id === parentId);
        if (parentIndex !== -1) {
            const remainingBlocks = otherColumn.blocks.map(b =>
                JSON.parse(JSON.stringify(b))
            );
            AppState.blocks.splice(parentIndex, 1, ...remainingBlocks);
        }
    } else {
        // Обе колонки пустые - удаляем контейнер
        AppState.removeBlock(parentId);
    }
}