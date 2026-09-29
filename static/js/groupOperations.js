// groupOperations.js - Группировка/разгруппировка блоков верхнего уровня

/**
 * Резолвит id (возможно, дочернего блока внутри колонки) к его владельцу
 * верхнего уровня. Тот же паттерн, что getTopLevelOwner в templatesUI.js
 * (getBlocksForPreset), но без глубокого клонирования — тут блоки просто
 * перемещаются, а не копируются для пресета.
 */
function getTopLevelOwnerForGroup(id) {
    const topLevel = AppState.blocks;
    const direct = topLevel.find(b => b.id === id);
    if (direct) return direct;

    for (const b of topLevel) {
        if (!b.columns) continue;
        for (const col of b.columns) {
            if ((col.blocks || []).some(x => x.id === id)) return b;
        }
    }
    return null;
}

/**
 * Объединяет текущий мультивыбор блоков верхнего уровня в один
 * group_container: дети идут вертикальным стеком с общим фоном
 * (переиспользует renderColumnsPreview/generateColumnsHTML — им достаточно
 * одной колонки width:100, чтобы рендерить стек вместо ряда).
 */
function groupSelectedBlocks() {
    const ids = AppState.multiSelectedBlockIds;
    if (!ids || ids.size < 2) {
        Toast.warning('Выделите минимум 2 блока (Ctrl/Shift-клик), чтобы сгруппировать');
        return;
    }

    const topLevel = AppState.blocks;
    const owners = new Map();
    for (const id of ids) {
        const owner = getTopLevelOwnerForGroup(id);
        if (owner) owners.set(owner.id, owner);
    }

    const selected = Array.from(owners.values())
        .sort((a, b) => topLevel.indexOf(a) - topLevel.indexOf(b));

    if (selected.length < 2) {
        Toast.warning('Выделите минимум 2 блока верхнего уровня, чтобы сгруппировать');
        return;
    }

    if (selected.some(b => b.columns)) {
        Toast.warning('Ряды с колонками пока нельзя группировать');
        return;
    }

    AppState.pushUndo();

    const firstIndex = topLevel.indexOf(selected[0]);
    AppState.blocks = topLevel.filter(b => !selected.includes(b));

    const group = {
        id: AppState.getNextBlockId(),
        type: 'group_container',
        settings: { bgEnabled: false, bgColor: '#1e293b', bgRadius: 8, bgPadding: 16, blockGap: 12 },
        columns: [{ id: generateColumnId(), width: 100, blocks: selected }]
    };
    AppState.blocks.splice(firstIndex, 0, group);

    AppState.clearMultiSelection();
    selectBlock(group.id);
    refreshGroupToolbar();
}

/**
 * Разгруппировывает group_container обратно в плоские блоки верхнего
 * уровня, на его прежней позиции, в исходном относительном порядке.
 * Симметрично groupSelectedBlocks и тому же splice-паттерну, что уже
 * используется в cleanupEmptyColumns (dragDrop.js) для схлопывания ряда.
 */
function ungroupBlock(blockId) {
    const idx = AppState.blocks.findIndex(b => b.id === blockId);
    if (idx === -1) return;

    const block = AppState.blocks[idx];
    if (!block || block.type !== 'group_container') return;

    AppState.pushUndo();

    const children = (block.columns[0] && block.columns[0].blocks) || [];
    AppState.blocks.splice(idx, 1, ...children);

    AppState.clearMultiSelection();
    if (children.length) {
        selectBlock(children[0].id);
    } else {
        AppState.clearSelection();
        renderCanvas();
        renderSettings();
    }
    refreshGroupToolbar();
}

/**
 * Показывает/скрывает плашку "N выбрано · Группировать" в
 * .admin-toolbar-center, синхронно с AppState.multiSelectedBlockIds.
 */
function refreshGroupToolbar() {
    const host = document.querySelector('.admin-toolbar-center');
    if (!host) return;

    const count = AppState.multiSelectedBlockIds ? AppState.multiSelectedBlockIds.size : 0;

    if (count < 2) {
        host.innerHTML = '';
        return;
    }

    if (!host.dataset.groupToolbarCount || host.dataset.groupToolbarCount !== String(count)) {
        host.dataset.groupToolbarCount = String(count);
        host.innerHTML = `
            <div class="group-toolbar-pill" style="display:flex;align-items:center;gap:10px;padding:6px 10px 6px 14px;background:var(--bg-secondary);border:1px solid var(--border-secondary);border-radius:20px;font-size:12px;color:var(--text-secondary);">
                <span>${count} выбрано</span>
                <button type="button" onclick="groupSelectedBlocks(); event.stopPropagation();"
                        style="padding:5px 12px;border-radius:14px;border:none;background:var(--accent-primary);color:#fff;font-size:12px;font-weight:600;cursor:pointer;">
                    Группировать
                </button>
            </div>
        `;
    }
}
