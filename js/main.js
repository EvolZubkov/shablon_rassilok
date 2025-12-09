// main.js - Главный файл инициализации приложения

document.addEventListener('DOMContentLoaded', init);

function init() {
    console.log('🚀 Инициализация Email Builder...');
    
    setupBlockButtons();
    setupPreviewButton();
    setupDownloadButton();
    setupCanvas();
    
    // ДОБАВИТЬ ЭТИ СТРОКИ:
    // Инициализация библиотеки шаблонов
    if (typeof TemplatesUI !== 'undefined') {
        TemplatesUI.init();
        console.log('✓ Библиотека шаблонов инициализирована');
    } else {
        console.error('❌ TemplatesUI не найден! Проверьте подключение templatesUI.js');
    }
    console.log('✓ Email Builder готов к работе');
}

function setupBlockButtons() {
    const blockButtons = document.querySelectorAll('.block-btn');
    
    blockButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const blockType = btn.dataset.blockType;
            addBlock(blockType);
        });
    });
}

function setupDownloadButton() {
    const btnCreate = document.getElementById('btn-create-outlook');
    if (btnCreate) {
        btnCreate.addEventListener('click', createOutlookDraft);
    }
}

// Экспортируем глобальные функции для использования в HTML
window.splitBlockIntoColumns = splitBlockIntoColumns;
window.mergeColumns = mergeColumns;
window.deleteBlock = deleteBlock;
window.deleteColumnBlock = deleteColumnBlock;
window.selectBlock = selectBlock;
window.handleColumnBlockDragStart = handleColumnBlockDragStart;
window.updateColumnWidth = updateColumnWidth;