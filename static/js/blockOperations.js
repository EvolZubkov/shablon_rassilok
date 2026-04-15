// blockOperations.js - Операции добавления, удаления и модификации блоков

function addBlock(type, parentId = null, position = null) {
    AppState.pushUndo();
    let variantOverride = null;

    if (type === 'expertLite') {
        type = 'expert';
        variantOverride = 'lite';
    }

    const newBlock = {
        id: AppState.getNextBlockId(),
        type: type,
        settings: getDefaultSettings(type),
        columns: null
    };

    if (variantOverride) {
        newBlock.settings.variant = variantOverride;
    }


    if (parentId !== null && position !== null) {
        const parentBlock = AppState.findBlockById(parentId);
        if (parentBlock && parentBlock.columns) {
            const column = parentBlock.columns.find(col => col.id === position);
            if (column) {
                column.blocks.push(newBlock);
            }
        }
    } else {
        const sid = AppState.selectedBlockId;
        // Top-level selected block — insert after it
        const topIdx = sid !== null
            ? AppState.blocks.findIndex(b => b.id === sid)
            : -1;
        if (topIdx !== -1) {
            AppState.blocks.splice(topIdx + 1, 0, newBlock);
        } else {
            // Nested selected block — find its parent row in AppState.blocks
            let inserted = false;
            if (sid !== null) {
                // Full-width block types must not go inside a column — insert after the parent row instead
                const FULL_WIDTH_TYPES = ['banner', 'divider', 'spacer', 'image', 'heading', 'text', 'list', 'important'];
                const insertIntoColumn = !FULL_WIDTH_TYPES.includes(type);

                outer: for (let rowIdx = 0; rowIdx < AppState.blocks.length; rowIdx++) {
                    const row = AppState.blocks[rowIdx];
                    if (!row.columns) continue;
                    for (const col of row.columns) {
                        const idx = col.blocks.findIndex(b => b.id === sid);
                        if (idx !== -1) {
                            if (insertIntoColumn) {
                                col.blocks.splice(idx + 1, 0, newBlock);
                            } else {
                                AppState.blocks.splice(rowIdx + 1, 0, newBlock);
                            }
                            inserted = true;
                            break outer;
                        }
                    }
                }
            }
            if (!inserted) {
                AppState.addBlock(newBlock);
            }
        }
    }

    selectBlock(newBlock.id);

    // Async render for banner: runs after selectBlock so the block is already
    // in the DOM; requestAnimationFrame ensures the browser repaints after
    // the canvas DOM update, fixing the "banner invisible until next block" bug.
    if (type === 'banner') {
        renderBannerToDataUrl(newBlock, (dataUrl) => {
            newBlock.settings.renderedBanner = dataUrl || null;
            requestAnimationFrame(() => renderCanvas());
        });
        return;
    }

    if (type === 'expert') {
        requestAnimationFrame(() => renderExpertBlock(newBlock));
    }
}

function renderExpertBlock(block) {
    if (!block || block.type !== 'expert') return;

    const renderToken = (block.settings._expertRenderToken || 0) + 1;
    block.settings._expertRenderToken = renderToken;

    const applyResult = (result) => {
        if (block.settings._expertRenderToken !== renderToken) return;
        block.settings.renderedExpert = result?.dataUrl || null;
        block.settings.renderedExpertWidth = result?.width || null;
        renderCanvas();
    };

    const parentBlock = findParentBlockWithColumns(block.id);
    if (parentBlock) {
        let columnWidth = 300;
        for (const col of parentBlock.columns) {
            if (col.blocks.some(b => b.id === block.id)) {
                columnWidth = Math.round(600 * col.width / 100);
                break;
            }
        }
        renderExpertVerticalToDataUrl(block, columnWidth, applyResult);
        return;
    }

    renderExpertToDataUrl(block, applyResult);
}

function deleteBlock(blockId) {
    AppState.pushUndo();
    AppState.removeBlock(blockId);

    // если удалили блок, который был в мультивыборе — убираем
    if (AppState.multiSelectedBlockIds) {
        AppState.multiSelectedBlockIds.delete(blockId);
    }
    if (AppState.multiSelectAnchorId === blockId) {
        AppState.multiSelectAnchorId = null;
    }

    if (AppState.selectedBlockId === blockId) {
        AppState.clearSelection();
        renderSettings();
    }

    renderCanvas();
}

function deleteColumnBlock(parentId, columnId, blockId) {
    AppState.pushUndo();
    const parentBlock = AppState.findBlockById(parentId);
    if (!parentBlock || !parentBlock.columns) return;

    const column = parentBlock.columns.find(c => c.id === columnId);
    if (!column) return;

    column.blocks = column.blocks.filter(b => b.id !== blockId);
    renderCanvas();
}

function refreshSelectionStyles() {
    const selectedId = AppState.selectedBlockId;
    const multi = AppState.multiSelectedBlockIds || new Set();

    document.querySelectorAll('.email-block').forEach(el => {
        const id = parseInt(el.dataset.blockId, 10);
        el.classList.toggle('selected', id === selectedId);
        el.classList.toggle('multi-selected', multi.has(id));
    });
}

function selectBlock(blockId) {
    // Обычный выбор одного блока сбрасывает мультивыбор
    if (typeof AppState.clearMultiSelection === 'function') {
        AppState.clearMultiSelection();
    }

    AppState.selectBlock(blockId);

    // якорь для Shift
    AppState.multiSelectAnchorId = blockId;

    // Перерисовываем холст
    renderCanvas();

    // Обновляем CSS-классы выделения (selected + multi-selected)
    refreshSelectionStyles();

    renderSettings();
}

function handleBlockSelectionClick(blockId, event) {
    const isMeta = event.ctrlKey || event.metaKey;

    // ✅ Ctrl/Cmd: toggle (вкл/выкл) без сброса набора
    if (isMeta) {
        // если набора ещё нет, но есть выбранный блок — добавим его в набор,
        // чтобы ctrl-клик “расширял” выделение как в проводнике
        if (AppState.multiSelectedBlockIds && AppState.multiSelectedBlockIds.size === 0 && AppState.selectedBlockId != null) {
            AppState.multiSelectedBlockIds.add(AppState.selectedBlockId);
            AppState.multiSelectAnchorId = AppState.selectedBlockId;
        }

        AppState.toggleMultiSelect(blockId);

        renderCanvas();
        refreshSelectionStyles();
        renderSettings();
        return;
    }

    // ✅ Shift: диапазон от текущего выбранного блока (или якоря)
    if (event.shiftKey) {
        // если якоря нет — берём текущий selected как якорь (чтобы “сразу диапазон” работал)
        if (!AppState.multiSelectAnchorId) {
            AppState.multiSelectAnchorId = AppState.selectedBlockId || blockId;
        }

        AppState.rangeSelectTopLevel(blockId);

        renderCanvas();
        refreshSelectionStyles();
        renderSettings();
        return;
    }

    // ✅ обычный клик — single select и сброс мультивыбора
    selectBlock(blockId);
}

function updateBlockSetting(blockId, key, value) {
    const block = AppState.findBlockById(blockId);
    if (!block) return;

    if (block.type === 'banner' && key === 'bannerHeight') {
        value = Number(value);
        if (![200, 250].includes(value)) value = 250;

        const prevHeight = Number(block.settings.bannerHeight || 250);
        if (prevHeight !== value) {
            const k = value / prevHeight;

            // логотип по Y (по желанию)
            if (typeof block.settings.logoY === 'number') {
                block.settings.logoY = Math.round(block.settings.logoY * k);
            }

            // текстовые элементы по Y — это главное
            if (Array.isArray(block.settings.textElements)) {
                block.settings.textElements = block.settings.textElements.map(el => ({
                    ...el,
                    y: typeof el.y === 'number' ? Math.round(el.y * k) : el.y
                }));
            }

            // смещение правой картинки по Y (по желанию)
            if (typeof block.settings.rightImageY === 'number') {
                block.settings.rightImageY = Math.round(block.settings.rightImageY * k);
            }
        }
    }

    if (block.type === 'banner' && [
        'gradientEnabled',
        'gradientUiExpanded',
        'backgroundGradientEnabled',
        'leftBlockGradientEnabled'
    ].includes(key)) {
        value = value === true || value === 'true';
    }

    if (block.type === 'banner' && [
        'gradientOpacity',
        'gradientAngle',
        'gradientCenterX',
        'gradientCenterY',
        'gradientBalance',
        'gradientStart',
        'gradientEnd',
        'bgImageX',
        'bgImageY',
        'bgImageRotate',
        'bgImageScale',
        'backgroundGradientAngle',
        'backgroundGradientCenterX',
        'backgroundGradientCenterY',
        'backgroundGradientBalance',
        'leftBlockImageX',
        'leftBlockImageY',
        'leftBlockImageRotate',
        'leftBlockImageScale',
        'leftBlockGradientAngle',
        'leftBlockGradientCenterX',
        'leftBlockGradientCenterY',
        'leftBlockGradientBalance'
    ].includes(key)) {
        value = Number(value);
    }

    if (block.type === 'banner' && key === 'gradientStops') {
        value = normalizeBannerGradientStops(value);
    }

    block.settings[key] = value;

    // Специальная обработка для баннеров
    if (block.type === 'banner' && BANNER_KEYS.includes(key)) {
        // Для textElements не нужно перерендеривать здесь (делается в updateBannerTextElement)
        if (key !== 'textElements') {
            renderBannerToDataUrl(block, (dataUrl) => {
                block.settings.renderedBanner = dataUrl || null;
                renderCanvas();
            });
        }
        return;
    }

    // ► Специальная обработка для кнопок
    if (block.type === 'button' &&
        ['text', 'color', 'textColor', 'icon'].includes(key)) {

        const parentBlock = findParentBlockWithColumns(blockId);

        // Было: только "в колонках / не в колонках"
        block.settings._isInColumn = parentBlock !== null;

        // ✅ Новое: сколько колонок в строке (1 если не в колонках)
        block.settings._columnsCount = parentBlock ? parentBlock.columns.length : 1;

        renderButtonToDataUrl(block, (result) => {
            block.settings.renderedButton = result?.dataUrl || null;
            block.settings.renderedButtonW = result?.width || null;
            block.settings.renderedButtonH = result?.height || null;
            renderCanvas();
        });
        return;
    }

    // Специальная обработка для экспертов
    if (block.type === 'expert') {
        // Обновляем превью фото и значка в настройках
        updateExpertSettingsPreview(blockId);

        renderExpertBlock(block);
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

        if (['src', 'width', 'aspectRatio', 'borderRadiusMode', 'borderRadiusAll', 'borderRadiusTL', 'borderRadiusTR', 'borderRadiusBR', 'borderRadiusBL'].includes(key)) {
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

function normalizeBannerGradientStops(stops) {
    if (!Array.isArray(stops)) return [];

    return stops
        .map((stop, index) => ({
            id: stop?.id ?? Date.now() + index,
            color: normalizeBannerHex(stop?.color),
            opacity: clampBannerNumber(stop?.opacity, 0, 100, 100),
            position: clampBannerNumber(stop?.position, 0, 100, index === 0 ? 0 : 100)
        }))
        .sort((a, b) => a.position - b.position);
}

function normalizeBannerHex(value) {
    const raw = String(value || '').trim().replace('#', '');
    if (/^[0-9a-fA-F]{6}$/.test(raw)) {
        return `#${raw.toUpperCase()}`;
    }
    return '#7700FF';
}

function clampBannerNumber(value, min, max, fallback) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.min(max, Math.max(min, num));
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

function updateExpertSettingsPreview(blockId) {
    const block = AppState.findBlockById(blockId);
    if (!block || block.type !== 'expert') return;

    const s = block.settings;
    const img = document.getElementById(`expert-photo-img-${blockId}`);
    if (img) {
        img.style.transform = `rotate(-45deg) scale(${s.scale / 100}) translate(${s.positionX}%, ${s.positionY}%)`;
        img.src = s.photo;
    }

    const previewGroup = document.getElementById(`expert-photo-preview-${blockId}`);
    const previewBox = previewGroup?.querySelector('.photo-preview-box');
    if (!previewBox) return;

    previewBox.querySelectorAll('.expert-badge-preview').forEach((node) => node.remove());
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

function _generateColumnId() {
    return Date.now() + Math.floor(Math.random() * 100000);
}

function _cloneBlocksWithNewIds(blocks) {
    const cloneOne = (b) => {
        const out = JSON.parse(JSON.stringify(b));
        out.id = AppState.getNextBlockId();

        if (out.columns) {
            out.columns = (out.columns || []).map(col => ({
                ...col,
                id: _generateColumnId(),
                blocks: (col.blocks || []).map(cloneOne)
            }));
        }
        return out;
    };
    return (blocks || []).map(cloneOne);
}

function _findBlockContainer(blockId, list = AppState.blocks) {
    const idx = (list || []).findIndex(b => b.id === blockId);
    if (idx !== -1) return { list, index: idx };

    for (const b of (list || [])) {
        if (!b.columns) continue;
        for (const col of b.columns) {
            const res = _findBlockContainer(blockId, col.blocks || []);
            if (res) return res;
        }
    }
    return null;
}

// Вставка набора блоков после выбранного блока, иначе в конец
function insertBlocksAfterSelection(blocksToInsert) {
    AppState.pushUndo();
    const cloned = _cloneBlocksWithNewIds(blocksToInsert);

    const targetId = AppState.selectedBlockId;
    const container = targetId ? _findBlockContainer(targetId) : null;

    if (container) {
        container.list.splice(container.index + 1, 0, ...cloned);
    } else {
        AppState.blocks.push(...cloned);
    }

    renderCanvas();

    // выбираем первый вставленный
    if (cloned.length > 0) {
        // НЕ через selectBlock, чтобы не сбрасывать потенциальный мультивыбор вручную
        AppState.selectBlock(cloned[0].id);
        AppState.multiSelectAnchorId = cloned[0].id;
        refreshSelectionStyles();
        renderSettings();
    }
}

// делаем доступным для templatesUI
window.insertBlocksAfterSelection = insertBlocksAfterSelection;
window.handleBlockSelectionClick = handleBlockSelectionClick;
