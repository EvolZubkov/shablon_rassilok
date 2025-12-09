// columnOperations.js - Операции с колонками

function splitBlockIntoColumns(blockId) {
    const block = AppState.findBlockById(blockId);
    if (!block || block.columns) return;

    // Для блока "кнопка" делаем 4 колонки по 25%
    if (block.type === 'button') {
        const baseId = Date.now();
        block.columns = [
            { id: baseId,     width: 25, blocks: [] },
            { id: baseId + 1, width: 25, blocks: [] },
            { id: baseId + 2, width: 25, blocks: [] },
            { id: baseId + 3, width: 25, blocks: [] }
        ];
    } else {
        // Для всех остальных блоков — как раньше, 2 колонки по 50%
        block.columns = [
            { id: Date.now(),     width: 50, blocks: [] },
            { id: Date.now() + 1, width: 50, blocks: [] }
        ];
    }

    renderCanvas();
    selectBlock(blockId);
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