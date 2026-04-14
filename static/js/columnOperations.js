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
        settings: {},
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



function mergeColumns(blockId) {
    const block = AppState.findBlockById(blockId);
    if (!block || !block.columns) return;

    block.columns = null;

    renderCanvas();
    selectBlock(blockId);
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