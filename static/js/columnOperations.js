// columnOperations.js - Операции с колонками

function splitBlockIntoColumns(blockId) {
    const block = AppState.findBlockById(blockId);
    if (!block || block.columns) return;

    // Создаём columns_container вместо добавления columns к блоку
    const blockIndex = AppState.blocks.findIndex(b => b.id === blockId);
    if (blockIndex === -1) return;

    const columnsCount = block.type === 'button' ? 4 : 
                         block.type === 'text' ? 2 : 2;

    const containerBlock = {
        id: AppState.getNextBlockId(),
        type: 'columns_container',
        settings: { bgEnabled: false, bgColor: '#1e293b', bgRadius: 8, bgPadding: 16 },
        columns: []
    };

    // Первая колонка с исходным блоком
    containerBlock.columns.push({
        id: generateColumnId(),
        width: Math.floor(100 / columnsCount),
        blocks: [block]
    });

    // Остальные пустые колонки
    for (let i = 1; i < columnsCount; i++) {
        containerBlock.columns.push({
            id: generateColumnId(),
            width: Math.floor(100 / columnsCount),
            blocks: []
        });
    }

    normalizeColumnsWidths(containerBlock);
    AppState.blocks[blockIndex] = containerBlock;

    renderCanvas();
    selectBlock(containerBlock.id);
}



/**
 * Разбирает ряд колонок в отдельные блоки на его месте: колонки слева направо,
 * внутри колонки сверху вниз. Фон и настройки самого контейнера не переносятся.
 * Блок старого формата (обычный блок с полем columns) возвращается к обычному виду.
 */
function mergeColumns(blockId) {
    const block = AppState.findBlockById(blockId);
    if (!block || !block.columns) return;

    AppState.pushUndo();

    if (block.type !== 'columns_container') {
        block.columns = null;
        renderCanvas();
        selectBlock(blockId);
        return;
    }

    const index = AppState.blocks.findIndex(b => b.id === blockId);
    if (index === -1) return;

    const children = DropLogic.flattenColumnsContainer(block);
    AppState.blocks.splice(index, 1, ...children);

    if (children.length) {
        selectBlock(children[0].id);
    } else {
        AppState.clearSelection();
        renderCanvas();
        renderSettings();
    }
}

function updateColumnWidth(blockId, columnId, newWidth) {
    const block = AppState.findBlockById(blockId);
    if (!block || !block.columns) return;

    const columnIndex = block.columns.findIndex(c => c.id === columnId);
    if (columnIndex === -1) return;

    // Обновляем ширину текущей колонки
    block.columns[columnIndex].width = newWidth;

    // Автоматически пересчитываем ширину другой колонки (для 2-х колонок)
    if (block.columns.length === 2) {
        const otherIndex = columnIndex === 0 ? 1 : 0;
        block.columns[otherIndex].width = 100 - newWidth;
    }

    renderCanvas();
    renderSettings();
}