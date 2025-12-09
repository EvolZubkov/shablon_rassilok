// blockOperations.js - Операции добавления, удаления и модификации блоков

function addBlock(type, parentId = null, position = null) {
    const newBlock = {
        id: AppState.getNextBlockId(),
        type: type,
        settings: getDefaultSettings(type),
        columns: null
    };

    if (parentId !== null && position !== null) {
        const parentBlock = AppState.findBlockById(parentId);
        if (parentBlock && parentBlock.columns) {
            const column = parentBlock.columns.find(col => col.id === position);
            if (column) {
                column.blocks.push(newBlock);
            }
        }
    } else {
        AppState.addBlock(newBlock);
    }

    renderCanvas();
    selectBlock(newBlock.id);
}

function deleteBlock(blockId) {
    AppState.removeBlock(blockId);

    if (AppState.selectedBlockId === blockId) {
        AppState.clearSelection();
        renderSettings();
    }

    renderCanvas();
}

function deleteColumnBlock(parentId, columnId, blockId) {
    const parentBlock = AppState.findBlockById(parentId);
    if (!parentBlock || !parentBlock.columns) return;

    const column = parentBlock.columns.find(c => c.id === columnId);
    if (!column) return;

    column.blocks = column.blocks.filter(b => b.id !== blockId);
    renderCanvas();
}

function selectBlock(blockId) {
    AppState.selectBlock(blockId);

    // Убираем класс selected у всех блоков
    document.querySelectorAll('.email-block').forEach(el => {
        el.classList.remove('selected');
    });

    // Добавляем класс selected выбранному блоку
    const selectedElement = document.querySelector(`.email-block[data-block-id="${blockId}"]`);
    if (selectedElement) {
        selectedElement.classList.add('selected');
    }

    renderSettings();
}

function updateBlockSetting(blockId, key, value) {
    const block = AppState.findBlockById(blockId);
    if (!block) return;

    block.settings[key] = value;

    // Специальная обработка для баннеров
    if (block.type === 'banner' && BANNER_KEYS.includes(key)) {
        renderBannerToDataUrl(block, (dataUrl) => {
            block.settings.renderedBanner = dataUrl || null;
            renderCanvas();
        });
        return;
    }

    // ► Специальная обработка для кнопок
    if (block.type === 'button' &&
        ['text', 'color', 'textColor', 'icon', 'size'].includes(key)) {

        // Определяем ширину колонки для автоматического масштабирования
        let columnWidth = 600;
        const parentBlock = findParentBlockWithColumns(blockId);
        if (parentBlock) {
            for (let col of parentBlock.columns) {
                if (col.blocks.some(b => b.id === blockId)) {
                    columnWidth = Math.round(600 * col.width / 100);
                    break;
                }
            }
        }

        // Автоматически уменьшаем size для узких колонок
        let effectiveSize = block.settings.size || 1;
        if (columnWidth < 200) {
            // Для колонок < 200px (4 колонки) уменьшаем до 70%
            effectiveSize = effectiveSize * 0.7;
            console.log('[BLOCK OPS] Button auto-scaled for narrow column:', {
                columnWidth: columnWidth,
                originalSize: block.settings.size,
                effectiveSize: effectiveSize
            });
        }

        // Временно применяем масштаб для рендеринга
        const originalSize = block.settings.size;
        block.settings.size = effectiveSize;

        renderButtonToDataUrl(block, (dataUrl) => {
            // Восстанавливаем оригинальный size
            block.settings.size = originalSize;
            block.settings.renderedButton = dataUrl || null;
            renderCanvas();
        });
        return;
    }

    // Специальная обработка для экспертов
    if (block.type === 'expert') {
        // Обновляем превью фото в настройках
        updateExpertPhotoPreview(blockId);

        // Определяем ширину колонки динамически
        let columnWidth = 600; // по умолчанию полная ширина

        // Ищем родительский блок с колонками
        const parentBlock = findParentBlockWithColumns(blockId);
        console.log('[BLOCK OPS] Expert column width calculation:', {
            blockId: blockId,
            parentBlock: parentBlock ? parentBlock.id : 'none',
            verticalLayout: block.settings.verticalLayout
        });

        if (parentBlock) {
            // Находим колонку с этим блоком
            for (let col of parentBlock.columns) {
                if (col.blocks.some(b => b.id === blockId)) {
                    // Вычисляем реальную ширину: 600px * процент / 100
                    columnWidth = Math.round(600 * col.width / 100);
                    console.log('[BLOCK OPS] Found in column:', {
                        columnId: col.id,
                        columnWidthPercent: col.width,
                        calculatedWidth: columnWidth
                    });
                    break;
                }
            }
        }

        console.log('[BLOCK OPS] Final columnWidth:', columnWidth);

        // АВТООПРЕДЕЛЕНИЕ: если блок в колонках → вертикальный, иначе → горизонтальный
        const isInColumn = parentBlock !== null;

        if (isInColumn) {
            // Вертикальный layout для колонок
            renderExpertVerticalToDataUrl(block, columnWidth, (result) => {
                block.settings.renderedExpert = result.dataUrl;
                block.settings.renderedExpertWidth = result.width;
                renderCanvas();
            });
        } else {
            // Горизонтальный layout (полная ширина)
            renderExpertToDataUrl(block, (result) => {
                block.settings.renderedExpert = result.dataUrl;
                block.settings.renderedExpertWidth = result.width;
                renderCanvas();
            });
        }
        return;
    }

    // Специальная обработка для списков
    if (block.type === 'list' &&
        ['items', 'bulletType', 'bulletCustom', 'bulletSize', 'listStyle'].includes(key)) {

        renderListBulletsToDataUrls(block, () => {
            renderCanvas();
        });
        return;
    }

    // Специальная обработка для блока "Важно" - рендерим только иконку
    if (block.type === 'important' && key === 'icon') {
        renderImportantIconToDataUrl(block, (dataUrl) => {
            block.settings.renderedIcon = dataUrl;
            renderCanvas();
        });
        return;
    }
    // Специальная обработка для блока "Картинка"
    if (block.type === 'image') {
        console.log('[BLOCK OPS] Image block setting changed:', key, 'triggering render?', ['src', 'width'].includes(key));

        if (['src', 'width'].includes(key)) {
            console.log('[BLOCK OPS] Calling renderImageToDataUrl...');
            renderImageToDataUrl(block, (result) => {
                if (result) {
                    console.log('[BLOCK OPS] Render callback received:', {
                        dataUrlLength: result.dataUrl.length,
                        width: result.width,
                        height: result.height
                    });
                    block.settings.renderedImage = result.dataUrl;
                    block.settings.renderedWidth = result.width;
                    block.settings.renderedHeight = result.height;
                } else {
                    console.log('[BLOCK OPS] Render callback received NULL');
                    block.settings.renderedImage = null;
                    block.settings.renderedWidth = null;
                    block.settings.renderedHeight = null;
                }
                renderCanvas();
            });
            return;
        }
    }

    renderCanvas();
}


function removeBlockFromParent(blockId, blocksList = null) {
    const list = blocksList || AppState.blocks;

    const mainIndex = list.findIndex(b => b.id === blockId);
    if (mainIndex !== -1) {
        list.splice(mainIndex, 1);
        return true;
    }

    for (let block of list) {
        if (block.columns) {
            for (let column of block.columns) {
                if (removeBlockFromParent(blockId, column.blocks)) {
                    return true;
                }
            }
        }
    }

    return false;
}
function updateExpertPhotoPreview(blockId) {
    const block = AppState.findBlockById(blockId);
    if (!block || block.type !== 'expert') return;

    const img = document.getElementById(`expert-photo-img-${blockId}`);
    if (!img) return;

    const s = block.settings;
    img.style.transform = `rotate(-45deg) scale(${s.scale / 100}) translate(${s.positionX}%, ${s.positionY}%)`;
    img.src = s.photo;
}

function findParentBlockWithColumns(childBlockId) {
    for (let block of AppState.blocks) {
        if (block.columns) {
            for (let col of block.columns) {
                if (col.blocks.some(b => b.id === childBlockId)) {
                    return block;
                }
            }
        }
    }
    return null;
}