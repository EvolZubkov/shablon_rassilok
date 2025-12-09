// state.js - Управление состоянием приложения

const AppState = {
    blocks: [],
    selectedBlockId: null,
    blockIdCounter: 1,
    
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
        indicator.style.cssText += cssText;
        indicator.style.display = 'block';
    },
    
    hideDropIndicator() {
        if (this.dropZoneIndicator) {
            this.dropZoneIndicator.style.display = 'none';
        }
    }
};

// Экспортируем для использования в других модулях
window.AppState = AppState;