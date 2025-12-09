// canvasRenderer.js - Отрисовка canvas и блоков

function renderCanvas() {
    const canvas = document.getElementById('canvas');

    if (AppState.blocks.length === 0) {
        canvas.innerHTML = `
            <div class="canvas-empty">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                <p>Добавьте блоки из левой панели</p>
            </div>
        `;
        return;
    }

    canvas.innerHTML = '';
    AppState.blocks.forEach((block, index) => {
        const blockElement = createBlockElement(block, index);
        canvas.appendChild(blockElement);
    });
}

function createBlockElement(block, index) {
    const div = document.createElement('div');
    div.className = 'email-block';
    
    if (block.id === AppState.selectedBlockId) {
        div.classList.add('selected');
    }
    
    div.dataset.blockId = block.id;

    // Если блок НЕ разбит на колонки — обычный dnd
    if (!block.columns) {
        div.draggable = true;
        div.addEventListener('dragstart', (e) => handleDragStart(e, index, block));
        div.addEventListener('dragover', (e) => handleDragOver(e, index));
        div.addEventListener('drop', (e) => handleDrop(e, index));
        div.addEventListener('dragend', handleDragEnd);
    } else {
        div.draggable = true;
    }

    // Клик для выбора блока
    div.addEventListener('click', (e) => {
        if (!e.target.closest('.block-action-btn')) {
            selectBlock(block.id);
        }
    });

    const header = createBlockHeader(block);
    const content = createBlockContent(block);

    div.appendChild(header);
    div.appendChild(content);

    return div;
}

function createBlockHeader(block) {
    const header = document.createElement('div');
    header.className = 'block-header';
    
    const splitBtn = !block.columns ? `
        <button class="block-action-btn split" 
                onclick="splitBlockIntoColumns(${block.id}); event.stopPropagation();" 
                title="Разбить на колонки">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="4" y="4" width="7" height="16"></rect>
                <rect x="13" y="4" width="7" height="16"></rect>
            </svg>
        </button>
    ` : `
        <button class="block-action-btn merge" 
                onclick="mergeColumns(${block.id}); event.stopPropagation();" 
                title="Объединить колонки">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="5" y="4" width="14" height="16"></rect>
            </svg>
        </button>
    `;

    header.innerHTML = `
        <span class="block-title">${getBlockTypeName(block.type)}</span>
        <div class="block-actions">
            ${splitBtn}
            <button class="block-action-btn delete" 
                    onclick="deleteBlock(${block.id}); event.stopPropagation();" 
                    title="Удалить блок">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6l-1 14H6L5 6"></path>
                    <path d="M10 11v6"></path>
                    <path d="M14 11v6"></path>
                    <path d="M9 6V4h6v2"></path>
                </svg>
            </button>
        </div>
    `;

    return header;
}

function createBlockContent(block) {
    const content = document.createElement('div');
    content.className = 'block-content';
    content.innerHTML = block.columns ? renderColumnsPreview(block) : renderBlockPreviewReal(block);
    return content;
}

function renderColumnsPreview(block) {
    if (!block.columns) return '';

    const columnsHTML = block.columns.map(column => {
        const columnBlocks = column.blocks.map(childBlock => `
            <div class="email-block column-block"
                 data-block-id="${childBlock.id}"
                 data-parent-id="${block.id}"
                 data-column-id="${column.id}"
                 draggable="true"
                 onclick="selectBlock(${childBlock.id}); event.stopPropagation();"
                 ondragstart="handleColumnBlockDragStart(event, ${childBlock.id}, ${block.id}, ${column.id})">
                <div class="block-header">
                    <span class="block-title">${getBlockTypeName(childBlock.type)}</span>
                    <div class="block-actions">
                        <button class="block-action-btn delete" 
                                onclick="deleteColumnBlock(${block.id}, ${column.id}, ${childBlock.id}); event.stopPropagation();" 
                                title="Удалить блок">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6l-1 14H6L5 6"></path>
                                <path d="M10 11v6"></path>
                                <path d="M14 11v6"></path>
                                <path d="M9 6V4h6v2"></path>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="block-content">
                    ${renderBlockPreviewReal(childBlock)}
                </div>
            </div>
        `).join('');

        const dropZoneHTML = column.blocks.length === 0 ? `
            <div class="column-drop-zone" data-column-id="${column.id}" data-parent-id="${block.id}">
                <p>Перетащите блок сюда</p>
            </div>
        ` : '';

        return `
            <div class="column" style="width: ${column.width}%;" data-column-id="${column.id}">
                <div class="column-content" data-parent-id="${block.id}" data-column-id="${column.id}">
                    ${columnBlocks}
                    ${dropZoneHTML}
                </div>
            </div>
        `;
    }).join('');

    return `<div class="columns-container">${columnsHTML}</div>`;
}

function setupCanvas() {
    const canvas = document.getElementById('canvas');

    canvas.addEventListener('click', (e) => {
        if (e.target === canvas || e.target.classList.contains('canvas-empty')) {
            AppState.clearSelection();
            renderCanvas();
            renderSettings();
        }
    });

    setupCanvasDragDrop(canvas);
}