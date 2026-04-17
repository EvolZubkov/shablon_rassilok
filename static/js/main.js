// main.js - Главный файл инициализации приложения

function jslog(level, msg) {
    const text = typeof msg === 'string' ? msg : JSON.stringify(msg);
    console[level]?.(text);
    fetch('/api/jslog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level, msg: text }),
    }).catch(() => {});
}

document.addEventListener('DOMContentLoaded', async () => {
    jslog('log', '[INIT] DOMContentLoaded fired');

    try {
        await ConfigLoader.load();
        jslog('log', '[INIT] Config loaded OK');
    } catch (e) {
        jslog('error', '[INIT] ConfigLoader.load() threw: ' + e);
    }

    try {
        init();
    } catch (e) {
        jslog('error', '[INIT] init() threw: ' + e);
    }
});

function init() {
    jslog('log', '[INIT] init() started');

    setupAdminShell();
    jslog('log', '[INIT] setupAdminShell done');

    setupBlockButtons();
    jslog('log', '[INIT] setupBlockButtons done');

    setupPreviewButton();
    jslog('log', '[INIT] setupPreviewButton done');

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

function setupAdminShell() {
    setupAdminMenu();
    setupSidebarAccordion();
    setupSidebarSearch();
    setupCanvasContextTracking();
    setupInlinePresetLibrary();
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

    jslog('log', '[PREVIEW] btn-preview element found: ' + !!btnPreview);
    if (!btnPreview) {
        jslog('error', '[PREVIEW] #btn-preview NOT FOUND in DOM — handler not attached');
        return;
    }

    if (typeof window.ensureSharedEmailPreviewModal === 'function') {
        window.ensureSharedEmailPreviewModal({ title: 'Превью письма' });
    }

    document.removeEventListener('email-preview-theme-change', handlePreviewThemeChange);
    document.addEventListener('email-preview-theme-change', handlePreviewThemeChange);
    document.removeEventListener('app-theme-change', handleAppThemeChange);
    document.addEventListener('app-theme-change', handleAppThemeChange);

    btnPreview.onclick = async () => {
        renderPreviewModal();
    };
    jslog('log', '[PREVIEW] onclick handler attached to #btn-preview');
}

function syncPreviewThemeToAppTheme() {
    const appTheme = document.documentElement?.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    if (typeof window.EmailPreviewTheme?.get !== 'function' || typeof window.EmailPreviewTheme?.set !== 'function') {
        return false;
    }
    if (window.EmailPreviewTheme.get() !== appTheme) {
        window.EmailPreviewTheme.set(appTheme);
        return true;
    }
    return false;
}

async function renderPreviewModal() {
    jslog('log', '[PREVIEW] onclick fired');
    try {
        const previewTheme = window.EmailPreviewTheme?.get?.() || 'dark';
        jslog('log', '[PREVIEW] theme: ' + previewTheme);
        const html = await generateEmailHTML({ previewTheme });
        openInlinePreview(html);
        jslog('log', '[PREVIEW] done');
    } catch (error) {
        jslog('error', '[PREVIEW] Error: ' + error);
        if (typeof Toast !== 'undefined') {
            Toast.error('Ошибка генерации превью');
        } else {
            alert('Ошибка генерации превью');
        }
    }
}

function handlePreviewThemeChange() {
    if (typeof TemplatesUI !== 'undefined'
        && typeof TemplatesUI.isQuickPreviewOpen === 'function'
        && TemplatesUI.isQuickPreviewOpen()) {
        TemplatesUI.renderQuickPreview();
        return;
    }

    if (typeof window.isSharedEmailPreviewOpen === 'function' && window.isSharedEmailPreviewOpen()) {
        renderPreviewModal();
    }
}

function handleAppThemeChange() {
    const changed = syncPreviewThemeToAppTheme();
    if (typeof TemplatesUI !== 'undefined'
        && typeof TemplatesUI.isQuickPreviewOpen === 'function'
        && TemplatesUI.isQuickPreviewOpen()) {
        if (!changed) {
            TemplatesUI.renderQuickPreview();
        }
        return;
    }

    if (!changed && typeof window.isSharedEmailPreviewOpen === 'function' && window.isSharedEmailPreviewOpen()) {
        renderPreviewModal();
    }
}

/**
 * Открыть превью письма в модальном окне внутри приложения.
 * Не использует window.open() — не блокируется браузером.
 */
function openInlinePreview(html) {
    if (typeof TemplatesUI !== 'undefined'
        && typeof TemplatesUI.clearQuickPreviewState === 'function') {
        if (typeof TemplatesUI.closeTemplatePreview === 'function') {
            TemplatesUI.closeTemplatePreview();
        }
        TemplatesUI.clearQuickPreviewState();
    }

    if (typeof window.openSharedEmailPreviewModal !== 'function') {
        jslog('error', '[PREVIEW] shared preview modal helper missing');
        return;
    }

    window.openSharedEmailPreviewModal({
        html,
        title: 'Превью письма',
    });

    const modal = document.getElementById('email-preview-modal');
    const rect = modal?.getBoundingClientRect?.();
    jslog('log', '[PREVIEW] modal display set to: ' + (modal?.style.display || 'unknown'));
    jslog('log', `[PREVIEW] modal rect: ${rect?.width || 0}x${rect?.height || 0} @ ${rect?.left || 0},${rect?.top || 0}`);
}

function setupAdminMenu() {
    document.querySelectorAll('.menu-action').forEach((item) => {
        item.addEventListener('click', async () => {
            const action = item.dataset.action;
            switch (action) {
                case 'save':
                    document.getElementById('btn-save-template')?.click();
                    break;
                case 'save-as':
                    document.getElementById('btn-save-as-template')?.click();
                    break;
                case 'create-email':
                    document.getElementById('btn-create-outlook')?.click();
                    break;
                case 'create-meeting':
                    document.getElementById('btn-create-meeting')?.click();
                    break;
                case 'settings':
                    document.getElementById('btn-exchange-settings')?.click();
                    break;
                case 'undo':
                    if (AppState.canUndo) {
                        AppState.undo();
                        renderCanvas();
                        renderSettings();
                        showAdminUndoToast();
                    }
                    break;
                case 'clear-canvas':
                    TemplatesUI.clearCanvas();
                    break;
                case 'preview':
                    document.getElementById('btn-preview')?.click();
                    break;
                case 'toggle-theme':
                    document.getElementById('theme-toggle-btn')?.click();
                    break;
                case 'switch-mode':
                    document.getElementById('btn-switch-mode')?.click();
                    break;
                case 'about':
                    alert('Почтелье\nАдминистративный режим конструктора.');
                    break;
                case 'open-log':
                    fetch('/api/open-log', { method: 'POST' })
                        .then(async (r) => {
                            if (!r.ok) {
                                throw new Error('open-log failed');
                            }
                            const data = await r.json().catch(() => ({}));
                            if (!data.success) {
                                throw new Error(data.error || 'open-log failed');
                            }
                        })
                        .catch((err) => {
                            console.warn('[open-log] failed to open protocol.log:', err);
                        });
                    break;
                case 'exit':
                    fetch('/api/shutdown', { method: 'POST' })
                        .then(() => {
                            document.body.innerHTML = `
                                <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
                                            height:100vh;gap:16px;font-family:sans-serif;color:#9ca3af;background:#111827;">
                                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                         stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                                        <polyline points="16 17 21 12 16 7"/>
                                        <line x1="21" y1="12" x2="9" y2="12"/>
                                    </svg>
                                    <span style="font-size:18px;color:#e5e7eb;">Приложение закрыто</span>
                                    <span style="font-size:13px;">Можно закрыть эту вкладку.</span>
                                </div>`;
                        })
                        .catch(() => {
                            document.body.innerHTML = `
                                <div style="display:flex;align-items:center;justify-content:center;
                                            height:100vh;font-family:sans-serif;color:#9ca3af;background:#111827;">
                                    <span>Не удалось завершить приложение.</span>
                                </div>`;
                        });
                    break;
                default:
                    break;
            }
        });
    });
}

function setupSidebarAccordion() {
    const items = Array.from(document.querySelectorAll('.sidebar-accordion .accordion-item'));
    items.forEach((item) => {
        const trigger = item.querySelector('.accordion-trigger');
        if (!trigger) return;
        trigger.addEventListener('click', async () => {
            items.forEach((other) => {
                const isCurrent = other === item;
                other.classList.toggle('active', isCurrent);
                other.querySelector('.accordion-trigger')?.setAttribute('aria-expanded', isCurrent ? 'true' : 'false');
            });

            const panel = item.dataset.panel;
            if (panel === 'templates' && typeof TemplatesUI !== 'undefined') {
                await TemplatesUI.open();
            }
            if (panel === 'resources' && typeof UserResources !== 'undefined') {
                await UserResources.open();
            }

            applySidebarSearchFilter();
        });
    });
}

function setupSidebarSearch() {
    const sidebarSearch = document.getElementById('sidebar-search-input');
    const clearButton = document.getElementById('sidebar-search-clear');
    if (!sidebarSearch) return;

    const syncClearButton = () => {
        if (!clearButton) return;
        clearButton.classList.toggle('is-visible', !!sidebarSearch.value.trim());
    };

    sidebarSearch.addEventListener('input', () => {
        syncClearButton();
        applySidebarSearchFilter();
    });

    if (clearButton) {
        clearButton.addEventListener('click', () => {
            sidebarSearch.value = '';
            syncClearButton();
            applySidebarSearchFilter();
            sidebarSearch.focus();
        });
    }

    syncClearButton();
    applySidebarSearchFilter();
}

function applySidebarSearchFilter() {
    const sidebarSearch = document.getElementById('sidebar-search-input');
    if (!sidebarSearch) return;

    const query = sidebarSearch.value.trim().toLowerCase();
    const activePanel = document.querySelector('.sidebar-accordion .accordion-item.active')?.dataset.panel;

    if (activePanel === 'templates') {
        TemplatesUI.filterTemplates(query);
        return;
    }

    if (activePanel === 'blocks') {
        document.querySelectorAll('.blocks-grid .block-btn, #presets-grid .preset-tile').forEach((el) => {
            const match = !query || el.textContent.toLowerCase().includes(query);
            el.style.display = match ? '' : 'none';
        });
        return;
    }

    if (activePanel === 'resources') {
        document.querySelectorAll('.user-resources-panel--inline .templates-category-group').forEach((group) => {
            const items = group.querySelectorAll('.ur-item');
            let anyVisible = false;
            items.forEach((item) => {
                const label = item.querySelector('.ur-item-label')?.textContent.toLowerCase() || '';
                const match = !query || label.includes(query);
                item.style.display = match ? '' : 'none';
                if (match) anyVisible = true;
            });
            group.style.display = (!query || anyVisible) ? '' : 'none';
        });
    }
}

function setupCanvasContextTracking() {
    // `renderCanvas` and `renderSettings` are declared with `function` in other
    // modules — they live on `window`.  We must patch `window` directly so every
    // caller (regardless of which file it's in) goes through the wrapper.
    const originalRenderCanvas = window.renderCanvas;
    window.renderCanvas = function (...args) {
        const result = originalRenderCanvas.apply(this, args);
        updateCanvasContext();
        return result;
    };

    const originalRenderSettings = window.renderSettings;
    window.renderSettings = function (...args) {
        const result = originalRenderSettings.apply(this, args);
        updateCanvasContext();
        return result;
    };

    updateCanvasContext();
}

function updateCanvasContext() {
    const currentTemplateBadge = document.getElementById('current-template-badge');
    const currentStatusBadge = document.getElementById('current-status-badge');
    const selectedBlockBadge = document.getElementById('selected-block-badge');
    const blockCountBadge = document.getElementById('block-count-badge');

    const currentTemplate = window.TemplatesUI?.currentTemplate || null;
    const hasBlocks = Array.isArray(AppState.blocks) && AppState.blocks.length > 0;
    const selected = AppState.selectedBlockId ? AppState.findBlockById(AppState.selectedBlockId) : null;

    if (currentTemplateBadge) {
        currentTemplateBadge.textContent = `Шаблон: ${currentTemplate?.name || 'Новый'}`;
    }
    if (currentStatusBadge) {
        const isDirty = !!window.TemplatesUI?.hasUnsavedChanges?.();
        currentStatusBadge.textContent = `Статус: ${currentTemplate ? (isDirty ? 'Не сохранено' : 'Сохранено') : (hasBlocks ? 'Не сохранено' : 'Пустой холст')}`;
    }
    if (selectedBlockBadge) {
        selectedBlockBadge.textContent = `Выбран блок: ${selected ? getBlockTypeName(selected.type) : 'нет'}`;
    }
    if (blockCountBadge) {
        const count = AppState.blocks?.length || 0;
        blockCountBadge.textContent = `${count} ${count === 1 ? 'блок' : count < 5 ? 'блока' : 'блоков'}`;
    }
}

async function setupInlinePresetLibrary() {
    const grid = document.getElementById('presets-grid');
    const tabs = Array.from(document.querySelectorAll('#presets-scope-tabs .library-subtab'));
    if (!grid || !tabs.length) return;

    let presetCache = { shared: [], personal: [] };
    let activeScope = 'shared';

    const render = () => {
        const presets = (presetCache[activeScope] || []).filter((template) => template.isPreset);
        if (!presets.length) {
            grid.innerHTML = '<div class="sidebar-placeholder">Нет доступных пресетов</div>';
            return;
        }
        grid.innerHTML = '';
        presets.forEach((template) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'preset-tile';
            button.textContent = template.name;
            button.addEventListener('click', () => TemplatesUI.insertPreset(template));
            grid.appendChild(button);
        });
    };

    tabs.forEach((tab) => {
        tab.addEventListener('click', () => {
            tabs.forEach((el) => el.classList.toggle('active', el === tab));
            activeScope = tab.dataset.scope || 'shared';
            render();
        });
    });

    try {
        const result = await TemplatesAPI.getList();
        presetCache = result.templates || presetCache;
        render();
    } catch (_) {
        grid.innerHTML = '<div class="sidebar-placeholder">Не удалось загрузить пресеты</div>';
    }

    /**
     * Add a newly saved preset to the panel without a server round-trip.
     * Called from savePreset() in templatesUI.js after a successful save.
     * @param {{ id: string, name: string, type: string, isPreset: boolean }} item
     */
    window.addPresetToPanel = (item) => {
        const bucket = item.type === 'personal' ? 'personal' : 'shared';
        const list = presetCache[bucket] || [];
        list.push(item);
        list.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
        presetCache[bucket] = list;
        // Switch the active tab to the bucket where the preset was saved
        // so the user immediately sees it.
        activeScope = bucket;
        tabs.forEach((el) => el.classList.toggle('active', (el.dataset.scope || 'shared') === activeScope));
        render();
    };
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
window.updateCanvasContext = updateCanvasContext;
