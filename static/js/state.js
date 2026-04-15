// state.js - Управление состоянием приложения

const AppState = {
    blocks: [],
    selectedBlockId: null,
    // Мультивыбор (для пресетов)
    multiSelectedBlockIds: new Set(),
    // Якорь для Shift-выбора диапазона (работает по верхнему уровню AppState.blocks)
    multiSelectAnchorId: null,
    blockIdCounter: 1,

    // ── Undo (Ctrl+Z) ──────────────────────────────────────────────
    undoStack: [],
    UNDO_MAX: 20,

    // Drag and Drop состояние
    draggedBlockIndex: null,
    draggedFromColumnId: null,
    dragOverTarget: null,
    dropPosition: null,
    currentDropZone: null,
    dropZoneIndicator: null,

    // Методы для работы с блоками
    addBlock(block) {
        this.blocks.push(block);
    },

    removeBlock(blockId) {
        this.blocks = this.blocks.filter(b => b.id !== blockId);
    },

    findBlockById(id, blocksList = null) {
        const list = blocksList || this.blocks;

        for (let block of list) {
            if (block.id === id) return block;

            if (block.columns) {
                for (let col of block.columns) {
                    const found = this.findBlockById(id, col.blocks);
                    if (found) return found;
                }
            }
        }
        return null;
    },

    getNextBlockId() {
        return this.blockIdCounter++;
    },

    selectBlock(blockId) {
        this.selectedBlockId = blockId;
    },

    clearSelection() {
        this.selectedBlockId = null;
    },

    clearMultiSelection() {
        this.multiSelectedBlockIds.clear();
        this.multiSelectAnchorId = null;
    },

    /**
     * Toggle block in multiselection (Ctrl/Cmd-click)
     */
    toggleMultiSelect(blockId) {
        if (this.multiSelectedBlockIds.has(blockId)) {
            this.multiSelectedBlockIds.delete(blockId);
        } else {
            this.multiSelectedBlockIds.add(blockId);
        }

        // selected всегда = последний клик
        this.selectedBlockId = blockId;

        // якорь: если ещё нет — ставим, если удалили якорь — переносим на selected
        if (!this.multiSelectAnchorId) {
            this.multiSelectAnchorId = blockId;
        } else if (this.multiSelectAnchorId === blockId && !this.multiSelectedBlockIds.has(blockId)) {
            this.multiSelectAnchorId = this.selectedBlockId;
        }
    },
    /**
     * Shift-click диапазон по верхнему уровню
     */
    rangeSelectTopLevel(blockId) {
        const ids = this.blocks.map(b => b.id);
        const anchor = this.multiSelectAnchorId || this.selectedBlockId || blockId;
        const a = ids.indexOf(anchor);
        const b = ids.indexOf(blockId);
        if (a === -1 || b === -1) {
            // если якорь или цель не на верхнем уровне — просто single-select
            this.clearMultiSelection();
            this.selectedBlockId = blockId;
            this.multiSelectAnchorId = blockId;
            return;
        }
        const [from, to] = a <= b ? [a, b] : [b, a];
        this.multiSelectedBlockIds.clear();
        for (let i = from; i <= to; i++) this.multiSelectedBlockIds.add(ids[i]);
        this.selectedBlockId = blockId;
    },

    // ── Undo методы ────────────────────────────────────────────────
    pushUndo() {
        this.undoStack.push(JSON.stringify({
            blocks: this.blocks,
            selectedBlockId: this.selectedBlockId
        }));
        if (this.undoStack.length > this.UNDO_MAX) {
            this.undoStack.shift();
        }
    },

    undo() {
        if (!this.undoStack.length) return false;
        const prev = JSON.parse(this.undoStack.pop());
        this.blocks = prev.blocks || [];
        this.selectedBlockId = prev.selectedBlockId ?? null;
        return true;
    },

    get canUndo() {
        return this.undoStack.length > 0;
    },

    // Методы для Drag and Drop
    startDrag(index, fromColumnId = null) {
        this.draggedBlockIndex = index;
        this.draggedFromColumnId = fromColumnId;
    },

    endDrag() {
        this.draggedBlockIndex = null;
        this.draggedFromColumnId = null;
        this.currentDropZone = null;
        this.hideDropIndicator();
    },

    setDropZone(zone) {
        this.currentDropZone = zone;
    },

    createDropIndicator() {
        if (!this.dropZoneIndicator) {
            this.dropZoneIndicator = document.createElement('div');
            this.dropZoneIndicator.style.cssText = `
                position: absolute;
                background: #f97316;
                pointer-events: none;
                z-index: 1000;
                display: none;
            `;
            document.body.appendChild(this.dropZoneIndicator);
        }
        return this.dropZoneIndicator;
    },

    showDropIndicator(cssText) {
        const indicator = this.createDropIndicator();
        indicator.style.cssText = `
        position: absolute;
        background: #f97316;
        pointer-events: none;
        z-index: 1000;
        display: block;
        ${cssText}
    `;
    },

    hideDropIndicator() {
        if (this.dropZoneIndicator) {
            this.dropZoneIndicator.style.display = 'none';
        }
    }
};

// AppState доступна глобально как const — window.AppState не нужен