// main.js - Главный файл инициализации приложения

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Запуск Почтелье...');
    
    // СНАЧАЛА загружаем конфигурацию ресурсов (config.json)
    console.log('[*] Загрузка конфигурации...');
    await ConfigLoader.load();
    
    // ПОТОМ инициализируем приложение
    init();
});

function init() {
    console.log('[*] Инициализация Почтелье...');
    
    setupBlockButtons();
    setupPreviewButton();
    setupDownloadButton();
    setupCanvas();
    setupAdminUndo();
    
    // Инициализация библиотеки шаблонов
    if (typeof TemplatesUI !== 'undefined') {
        TemplatesUI.init();
        console.log('✓ Библиотека шаблонов инициализирована');
    } else {
        console.error('❌ TemplatesUI не найден! Проверьте подключение templatesUI.js');
    }

    // Инициализация панели личных ресурсов
    if (typeof UserResources !== 'undefined') {
        UserResources.init();
    }

    console.log('✓ Почтелье готов к работе');
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
    // Кнопки письма и встречи обрабатываются в outlookIntegration.js → ExchangeModals
    
    // Добавляем обработчик для кнопки скачивания (если есть)
    const btnDownload = document.getElementById('btn-download');
    if (btnDownload) {
        btnDownload.addEventListener('click', downloadEmail);
    }
}

function setupPreviewButton() {
    const btnPreview = document.getElementById('btn-preview');
    if (btnPreview) {
        btnPreview.addEventListener('click', async () => {
            console.log('[*] Открытие превью...');
            const html = await generateEmailHTML();
            openInlinePreview(html);
            console.log('✓ Превью открыто');
        });
    }
}

/**
 * Открыть превью письма в модальном окне внутри приложения.
 * Не использует window.open() — не блокируется браузером.
 */
function openInlinePreview(html) {
    let modal = document.getElementById('inline-preview-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'inline-preview-modal';
        modal.style.cssText = `
            position: fixed; inset: 0; z-index: 10000;
            background: rgba(0,0,0,0.7);
            display: flex; align-items: center; justify-content: center;
        `;
        modal.innerHTML = `
            <div style="
                background: #fff; border-radius: 8px;
                width: 860px; max-width: 95vw;
                height: 90vh; display: flex; flex-direction: column;
                overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.5);
            ">
                <div style="
                    display: flex; align-items: center; justify-content: space-between;
                    padding: 12px 16px; background: #1e293b; color: #e5e7eb;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                    font-size: 14px;
                ">
                    <span>👁 Превью письма</span>
                    <button id="inline-preview-close" style="
                        background: none; border: none; color: #9ca3af;
                        font-size: 20px; cursor: pointer; line-height: 1;
                        padding: 0 4px;
                    " title="Закрыть">✕</button>
                </div>
                <iframe id="inline-preview-frame"
                    style="flex: 1; border: none; width: 100%;"
                    sandbox="allow-same-origin">
                </iframe>
            </div>
        `;
        document.body.appendChild(modal);

        document.getElementById('inline-preview-close').addEventListener('click', () => {
            modal.style.display = 'none';
        });
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.style.display = 'none';
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.style.display !== 'none') {
                modal.style.display = 'none';
            }
        });
    }

    const frame = document.getElementById('inline-preview-frame');
    frame.srcdoc = html;
    modal.style.display = 'flex';
}

// Функция скачивания HTML
async function downloadEmail() {
    console.log('[*] Генерация HTML для скачивания...');
    
    const html = await generateEmailHTML();
    const blob = new Blob([html], { type: 'text/html; charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = 'email.html';
    a.click();
    
    URL.revokeObjectURL(url);
    console.log('✓ HTML файл скачан');
}

/**
 * Undo (Ctrl+Z) для admin-редактора.
 * Аналог undoLastAction() из userEditor.js, но использует AppState.
 */
function setupAdminUndo() {
    document.addEventListener('keydown', (e) => {
        if (!(e.ctrlKey || e.metaKey) || e.code !== 'KeyZ') return;

        const el = document.activeElement;
        const tag = el?.tagName?.toLowerCase();
        if (el?.isContentEditable || tag === 'input' || tag === 'textarea') return;

        e.preventDefault();

        if (!AppState.canUndo) return;

        AppState.undo();
        renderCanvas();
        renderSettings();
        showAdminUndoToast();
    });
}

function showAdminUndoToast() {
    let toast = document.getElementById('admin-undo-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'admin-undo-toast';
        toast.style.cssText = `
            position: fixed;
            bottom: 80px;
            left: 50%;
            transform: translateX(-50%);
            background: #1e293b;
            color: #e5e7eb;
            padding: 8px 16px;
            border-radius: 8px;
            font-size: 13px;
            z-index: 9999;
            pointer-events: none;
            border: 1px solid #374151;
            opacity: 0;
            transition: opacity 0.2s;
        `;
        document.body.appendChild(toast);
    }
    toast.textContent = '↩ Действие отменено';
    toast.style.opacity = '1';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, 1500);
}

// Экспортируем глобальные функции для использования в HTML
window.splitBlockIntoColumns = splitBlockIntoColumns;
window.mergeColumns = mergeColumns;
window.deleteBlock = deleteBlock;
window.deleteColumnBlock = deleteColumnBlock;
window.selectBlock = selectBlock;
window.handleColumnBlockDragStart = handleColumnBlockDragStart;
window.updateColumnWidth = updateColumnWidth;