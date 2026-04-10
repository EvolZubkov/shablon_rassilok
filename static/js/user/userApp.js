// userApp.js - Главный модуль для user-версии Почтелье

/**
 * User App State
 */
const UserAppState = {
    currentScreen: 'start', // 'start' | 'editor'
    templates: [],
    categories: [],
    currentCategory: 'all',
    currentTemplate: null,
    blocks: [],
    originalBlocks: [],
    selectedBlockId: null,
    allowSavePersonal: false, // Флаг разрешения сохранения (можно быстро отключить)
    showAttentionHints: true,
    isDirty: false, // Есть ли несохранённые изменения
    previewBlocks: null,
};

const UserThemeUI = {
    STORAGE_KEY: 'email-builder-theme',
    DARK_THEME: 'dark',
    LIGHT_THEME: 'light',

    init() {
        const savedTheme = localStorage.getItem(this.STORAGE_KEY);
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const theme = savedTheme || (prefersDark ? this.DARK_THEME : this.DARK_THEME);
        this.applyTheme(theme);
        this.bindButton('theme-toggle-btn-user-start');
        this.bindButton('theme-toggle-btn-user-editor');
    },

    bindButton(id) {
        const btn = document.getElementById(id);
        if (!btn || btn.dataset.boundThemeToggle === '1') return;

        btn.dataset.boundThemeToggle = '1';
        btn.addEventListener('click', () => this.toggle());
        this.syncButton(btn);
    },

    applyTheme(theme) {
        const next = theme === this.LIGHT_THEME ? this.LIGHT_THEME : this.DARK_THEME;
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem(this.STORAGE_KEY, next);
        this.syncButtons();
    },

    toggle() {
        const next = this.getCurrentTheme() === this.DARK_THEME ? this.LIGHT_THEME : this.DARK_THEME;
        this.applyTheme(next);
    },

    getCurrentTheme() {
        return document.documentElement.getAttribute('data-theme') || this.DARK_THEME;
    },

    syncButtons() {
        document.querySelectorAll('#theme-toggle-btn-user-start, #theme-toggle-btn-user-editor').forEach((btn) => {
            this.syncButton(btn);
        });
    },

    syncButton(btn) {
        if (!btn) return;
        btn.innerHTML = this.getCurrentTheme() === this.DARK_THEME
            ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`
            : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;
    },
};

/**
 * Инициализация приложения
 */
async function initUserApp() {
    console.log('[USER APP] Initializing...');

    UserThemeUI.init();

    // Загружаем конфиг
    await ConfigLoader.load();

    // Загружаем шаблоны и категории
    await loadTemplatesAndCategories();

    // Инициализируем обработчики
    initStartScreenHandlers();
    initEditorHandlers();
    mountUserEmailPreviewThemeToggle();
    initUserPreviewThemeRerender();

    // Показываем/скрываем кнопку сохранения
    const saveBtn = document.getElementById('btn-save-personal');
    if (saveBtn) {
        saveBtn.style.display = UserAppState.allowSavePersonal ? 'flex' : 'none';
    }

    console.log('[USER APP] Ready!');
}

/**
 * Загрузка шаблонов и категорий
 */
async function loadTemplatesAndCategories() {
    showLoading(true);

    try {
        // Загружаем шаблоны
        const { templates: templatesData } = await TemplatesAPI.getList();

        // Берём только общие шаблоны (не пресеты)
        UserAppState.templates = (templatesData?.shared || []).filter(t => !t.isPreset);

        // Загружаем категории
        UserAppState.categories = await TemplatesAPI.getCategories();

        // Рендерим вкладки категорий
        renderCategoryTabs();

        // Рендерим карточки шаблонов
        renderTemplateCards();

    } catch (error) {
        console.error('[USER APP] Error loading templates:', error);
        showEmptyState('Ошибка загрузки шаблонов');
    }

    showLoading(false);
}

/**
 * Асинхронная загрузка превью для карточек шаблонов через iframe
 * Карточка: 200px высота, email 600px шириной -> scale = cardWidth/600
 */
async function loadCardPreviews(templates) {
    // EMAIL всегда 600px шириной
    const EMAIL_WIDTH = 600;
    // Показываем верхние 500px письма (баннер + первые блоки)
    const EMAIL_PREVIEW_HEIGHT = 500;
    // Высота карточки фиксирована в CSS = 200px
    const CARD_HEIGHT = 200;

    for (const template of templates) {
        const card = document.querySelector(`.template-card[data-id="${template.id}"]`);
        if (!card) continue;

        const previewContainer = card.querySelector('.template-card-preview');
        if (!previewContainer) continue;

        try {
            const templateData = await TemplatesAPI.load(template.id, template.type);
            if (!templateData || !templateData.blocks) continue;

            // Генерируем email HTML (временно подменяем AppState.blocks)
            const originalBlocks = (typeof AppState !== 'undefined') ? AppState.blocks : null;
            let html;
            try {
                if (typeof AppState !== 'undefined') {
                    AppState.blocks = JSON.parse(JSON.stringify(templateData.blocks));
                }
                html = await generateEmailHTML();
            } finally {
                if (typeof AppState !== 'undefined' && originalBlocks !== null) {
                    AppState.blocks = originalBlocks;
                }
            }

            // Вычисляем масштаб по реальной ширине карточки
            // Берём после рендера — offsetWidth уже корректный
            const cardWidth = card.offsetWidth || 260;
            const scale = cardWidth / EMAIL_WIDTH;

            // Оборачиваем в контейнер с overflow:hidden
            const wrapper = document.createElement('div');
            wrapper.style.cssText = `
                width: 100%;
                height: ${CARD_HEIGHT}px;
                overflow: hidden;
                position: relative;
                background: #fff;
            `;

            const iframe = document.createElement('iframe');
            iframe.style.cssText = `
                position: absolute;
                top: 0;
                left: 0;
                width: ${EMAIL_WIDTH}px;
                height: ${Math.ceil(CARD_HEIGHT / scale)}px;
                border: none;
                transform: scale(${scale.toFixed(4)});
                transform-origin: top left;
                pointer-events: none;
                background: #fff;
            `;

            wrapper.appendChild(iframe);
            // Сохраняем overlay с кнопкой, заменяем только спиннер
            const overlay = previewContainer.querySelector('.template-card-overlay');
            previewContainer.innerHTML = '';
            previewContainer.appendChild(wrapper);
            if (overlay) previewContainer.appendChild(overlay);

            // Пишем HTML в iframe
            const doc = iframe.contentDocument || iframe.contentWindow.document;
            doc.open();
            doc.write(html);
            doc.close();

        } catch (err) {
            console.warn('[PREVIEW] Error for', template.id, err);
            const overlayErr = previewContainer.querySelector('.template-card-overlay');
            previewContainer.innerHTML = `
                <div class="no-preview">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                        <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
                        <polyline points="13 2 13 9 20 9"></polyline>
                    </svg>
                    <span>Нет превью</span>
                </div>`;
            if (overlayErr) previewContainer.appendChild(overlayErr);
        }
    }
}

/**
 * Рендер вкладок категорий
 */
function renderCategoryTabs() {
    const tabsContainer = document.querySelector('.category-tabs');
    if (!tabsContainer) return;

    // Очищаем все кроме "Все шаблоны"
    tabsContainer.innerHTML = `
        <button class="category-tab active" data-category="all">Все шаблоны</button>
    `;

    // Добавляем категории
    UserAppState.categories.forEach(category => {
        const tab = document.createElement('button');
        tab.className = 'category-tab';
        tab.dataset.category = category;
        tab.textContent = category;
        tabsContainer.appendChild(tab);
    });

    // Обработчики кликов
    tabsContainer.querySelectorAll('.category-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            // Убираем active со всех
            tabsContainer.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
            // Добавляем active на текущую
            tab.classList.add('active');

            // Фильтруем
            UserAppState.currentCategory = tab.dataset.category;
            renderTemplateCards();
        });
    });
}

/**
 * Рендер карточек шаблонов
 */
function renderTemplateCards() {
    const grid = document.getElementById('templates-grid');
    const emptyState = document.getElementById('empty-state');

    if (!grid) return;

    // Фильтруем по категории
    let filtered = UserAppState.templates;
    if (UserAppState.currentCategory !== 'all') {
        filtered = filtered.filter(t => t.category === UserAppState.currentCategory);
    }

    // Фильтруем по поиску
    const searchInput = document.getElementById('template-search');
    if (searchInput && searchInput.value.trim()) {
        const query = searchInput.value.toLowerCase().trim();
        filtered = filtered.filter(t => t.name.toLowerCase().includes(query));
    }

    // Показываем пустое состояние если нет шаблонов
    if (filtered.length === 0) {
        grid.innerHTML = '';
        if (emptyState) emptyState.style.display = 'flex';
        return;
    }

    if (emptyState) emptyState.style.display = 'none';

    // Рендерим карточки
    grid.innerHTML = filtered.map(template => `
        <div class="template-card" data-id="${template.id}" data-type="${template.type}">
            <div class="template-card-preview" data-id="${template.id}" data-type="${template.type}">
                <div class="preview-loading-mini">
                    <div class="spinner-mini"></div>
                </div>
                <div class="template-card-overlay">
                    <button type="button" class="btn-template-preview" data-id="${template.id}" data-type="${template.type}">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                            <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                        Просмотреть
                    </button>
                </div>
            </div>
            <div class="template-card-info">
                <div class="template-card-name">${template.name}</div>
                <div class="template-card-meta">${template.category || 'Без категории'}</div>
            </div>
        </div>
    `).join('');

    // Загружаем превью карточек (асинхронно)
    loadCardPreviews(filtered);

    // Обработчики кликов на карточки (открыть редактор)
    grid.querySelectorAll('.template-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (e.target.closest('.btn-template-preview')) return;
            openTemplate(card.dataset.id, card.dataset.type);
        });
    });

    grid.querySelectorAll('.btn-template-preview').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            previewTemplate(btn.dataset.id, btn.dataset.type);
        });
    });
}

/**
 * Нормализует текст блоков — одинарный \n между абзацами → \n\n
 */
function normalizeBlocksText(blocks) {
    return blocks.map(block => {
        if (block.columns) {
            return {
                ...block,
                columns: block.columns.map(col => ({
                    ...col,
                    blocks: normalizeBlocksText(col.blocks || [])
                }))
            };
        }

        const s = block.settings;
        if (!s) return block;

        const normalized = { ...block, settings: { ...s } };



        return normalized;
    });
}

/**
 * Открыть шаблон для редактирования
 */
async function openTemplate(id, type) {
    console.log('[USER APP] Opening template:', id);

    showLoading(true);

    try {
        const templateData = await TemplatesAPI.load(id, type);

        if (templateData && templateData.blocks) {
            UserAppState.currentTemplate = templateData;
            UserAppState.originalBlocks = JSON.parse(JSON.stringify(templateData.blocks));
            UserAppState.blocks = JSON.parse(JSON.stringify(templateData.blocks));
            UserAppState.originalBlocks = JSON.parse(JSON.stringify(UserAppState.blocks));
            UserAppState.isDirty = false;

            // Обновляем название в шапке
            const titleEl = document.getElementById('current-template-name');
            if (titleEl) {
                titleEl.textContent = templateData.name || 'Новое письмо';
            }

            updateUserEditorMeta();

            // Переключаемся на экран редактора
            switchScreen('editor');

            // Рендерим блоки
            renderUserCanvas();
        }
    } catch (error) {
        console.error('[USER APP] Error opening template:', error);
        alert('Ошибка загрузки шаблона');
    }

    showLoading(false);
}

/**
 * Переключение экранов
 */
function switchScreen(screen) {
    UserAppState.currentScreen = screen;
    document.documentElement.setAttribute('data-user-screen', screen);

    const startScreen = document.getElementById('start-screen');
    const editorScreen = document.getElementById('editor-screen');

    if (screen === 'start') {
        startScreen.style.display = 'flex';
        editorScreen.style.display = 'none';
    } else {
        startScreen.style.display = 'none';
        editorScreen.style.display = 'flex';
    }

    window.updateUserMenuState?.();
}

/**
 * Вернуться к стартовому экрану
 */
function goBack() {
    if (UserAppState.isDirty) {
        const confirmed = confirm('Вы уверены? Несохранённые изменения будут потеряны.');
        if (!confirmed) return;
    }

    UserAppState.currentTemplate = null;
    UserAppState.blocks = [];
    UserAppState.selectedBlockId = null;
    UserAppState.isDirty = false;
    UserAppState.previewBlocks = null;

    switchScreen('start');
    updateUserEditorMeta();
}

/**
 * Показать/скрыть загрузку
 */
function showLoading(show) {
    const loadingState = document.getElementById('loading-state');
    const grid = document.getElementById('templates-grid');

    if (loadingState) {
        loadingState.style.display = show ? 'flex' : 'none';
    }
    if (grid) {
        grid.style.display = show ? 'none' : 'grid';
    }
}

/**
 * Показать пустое состояние с сообщением
 */
function showEmptyState(message) {
    const emptyState = document.getElementById('empty-state');
    if (emptyState) {
        emptyState.querySelector('p').textContent = message || 'Шаблоны не найдены';
        emptyState.style.display = 'flex';
    }
}

/**
 * Инициализация обработчиков стартового экрана
 */
function initStartScreenHandlers() {
    // Поиск
    const searchInput = document.getElementById('template-search');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            renderTemplateCards();
        });
    }
}

/**
 * Инициализация обработчиков редактора
 */
function initEditorHandlers() {
    // Кнопка "Назад"
    const btnBack = document.getElementById('btn-back');
    if (btnBack) {
        btnBack.addEventListener('click', goBack);
    }

    // Кнопка "Превью"
    const btnPreview = document.getElementById('btn-preview-user');
    if (btnPreview) {
        btnPreview.addEventListener('click', showUserPreview);
    }

    // Кнопки "Письмо" и "Встреча" перехватываются в exchangeModals.js (ExchangeModals.init)

    // Кнопка "Сохранить"
    const btnSave = document.getElementById('btn-save-personal');
    if (btnSave) {
        btnSave.addEventListener('click', saveAsPersonal);
    }

    // Кнопка массовой рассылки
    const btnBulkMail = document.getElementById('btn-bulk-mail');
    if (btnBulkMail) {
        btnBulkMail.addEventListener('click', () => {
            document.getElementById('modal-bulk-mail').style.display = 'flex';
        });
    }

    // Закрытие модальных окон
    document.querySelectorAll('.modal-close, .modal-overlay').forEach(el => {
        el.addEventListener('click', (e) => {
            const modal = e.target.closest('.modal');
            if (modal) {
                modal.style.display = 'none';
            }
        });
    });
}

/**
 * Показать превью
 */
async function showUserPreview() {
    const modal = document.getElementById('preview-modal-user');
    const container = document.getElementById('preview-container-user');

    if (!modal || !container) return;

    // Временно устанавливаем блоки в AppState для генерации HTML
    const originalBlocks = AppState.blocks;
    AppState.blocks = UserAppState.blocks;

    try {
        const previewTheme = window.EmailPreviewTheme?.get?.() || 'light';
        const html = await generateEmailHTML({ previewTheme });
        UserAppState.previewBlocks = JSON.parse(JSON.stringify(UserAppState.blocks || []));
        renderEmailPreviewFrame(container, html);
        modal.style.display = 'flex';
    } catch (error) {
        console.error('[USER APP] Error generating preview:', error);
        alert('Ошибка генерации превью');
    }

    // Восстанавливаем
    AppState.blocks = originalBlocks;
}

/**
 * Сохранить как личный шаблон
 */
async function saveAsPersonal() {
    if (!UserAppState.allowSavePersonal) return;

    const name = prompt('Название шаблона:', UserAppState.currentTemplate?.name || 'Мой шаблон');
    if (!name) return;

    try {
        const savedId = await TemplatesAPI.save(name, UserAppState.blocks, 'personal', '', null);

        if (savedId) {
            UserAppState.isDirty = false;
            updateUserEditorMeta();
            alert('✅ Шаблон сохранён!');
        }
    } catch (error) {
        console.error('[USER APP] Error saving template:', error);
        alert('Ошибка сохранения');
    }
}

/**
 * Просмотр шаблона без входа в редактор
 */
async function previewTemplate(id, type) {
    console.log('[USER APP] Previewing template:', id);

    const modal = document.getElementById('template-preview-modal');
    const content = document.getElementById('template-preview-content');
    const title = document.getElementById('template-preview-title');
    const openBtn = document.getElementById('btn-open-template');

    if (!modal || !content) return;

    modal.style.display = 'flex';
    content.innerHTML = '<div class="preview-loading"><div class="spinner"></div><p>Загрузка...</p></div>';

    try {
        const templateData = await TemplatesAPI.load(id, type);

        if (!templateData || !templateData.blocks) {
            content.innerHTML = '<div class="preview-error">Ошибка загрузки шаблона</div>';
            return;
        }

        UserAppState.previewBlocks = JSON.parse(JSON.stringify(templateData.blocks));

        if (title) {
            title.textContent = templateData.name || 'Шаблон';
        }

        if (openBtn) {
            openBtn.dataset.id = id;
            openBtn.dataset.type = type;
        }

        await renderTemplatePreview(content, templateData.blocks);

    } catch (error) {
        console.error('[USER APP] Error previewing template:', error);
        content.innerHTML = '<div class="preview-error">Ошибка загрузки</div>';
    }
}

/**
 * Рендерим HTML превью шаблона
 */
async function renderTemplatePreview(container, blocks) {
    // Используем generateEmailHTML для полного корректного рендера
    const originalBlocks = (typeof AppState !== 'undefined') ? AppState.blocks : null;

    try {
        if (typeof AppState !== 'undefined') {
            AppState.blocks = JSON.parse(JSON.stringify(blocks));
        }

        const previewTheme = window.EmailPreviewTheme?.get?.() || 'light';
        const html = await generateEmailHTML({ previewTheme });
        renderEmailPreviewFrame(container, html);

    } catch (error) {
        console.error('[USER APP] renderTemplatePreview error:', error);
        container.innerHTML = '<div class="preview-error">Ошибка генерации превью</div>';
    } finally {
        // Восстанавливаем оригинальные блоки
        if (typeof AppState !== 'undefined' && originalBlocks !== null) {
            AppState.blocks = originalBlocks;
        }
    }
}

function renderEmailPreviewFrame(container, html) {
    if (!container) return;

    container.innerHTML = '';

    const frame = document.createElement('iframe');
    frame.className = 'email-preview-frame';
    frame.setAttribute('sandbox', 'allow-same-origin');
    frame.style.cssText = [
        'display:block;',
        'width:100%;',
        'min-height:640px;',
        'border:none;',
        'background:#ffffff;',
        'border-radius:8px;',
    ].join('');
    frame.srcdoc = html;

    container.appendChild(frame);
}

/**
 * Закрыть превью шаблона
 */
function closeTemplatePreview() {
    const modal = document.getElementById('template-preview-modal');
    if (modal) {
        modal.style.display = 'none';
    }
    UserAppState.previewBlocks = null;
}

/**
 * Открыть шаблон из превью
 */
function openTemplateFromPreview() {
    const openBtn = document.getElementById('btn-open-template');
    if (!openBtn) return;

    closeTemplatePreview();
    openTemplate(openBtn.dataset.id, openBtn.dataset.type);
}
function closeBulkMail() {
    document.getElementById('modal-bulk-mail').style.display = 'none';
}

function mountUserEmailPreviewThemeToggle() {
    const slot = document.getElementById('preview-user-theme-slot');
    if (!slot || typeof window.EmailPreviewTheme?.mount !== 'function') return;
    slot.innerHTML = '';
    window.EmailPreviewTheme.mount(slot);
}

function initUserPreviewThemeRerender() {
    document.addEventListener('email-preview-theme-change', async () => {
        const previewModal = document.getElementById('preview-modal-user');
        const templatePreviewModal = document.getElementById('template-preview-modal');

        if (previewModal?.style.display === 'flex') {
            await showUserPreview();
            return;
        }

        if (templatePreviewModal?.style.display === 'flex' && UserAppState.previewBlocks) {
            const content = document.getElementById('template-preview-content');
            if (content) {
                await renderTemplatePreview(content, UserAppState.previewBlocks);
            }
        }
    });
}

function updateUserEditorMeta() {
    const name = UserAppState.currentTemplate?.name || 'Новое письмо';
    const currentName = document.getElementById('current-template-name');
    const contextName = document.getElementById('current-template-name-context');
    const statusPill = document.getElementById('editor-status-pill');
    const hasBlocks = Array.isArray(UserAppState.blocks) && UserAppState.blocks.length > 0;
    const previewBtn = document.getElementById('btn-preview-user');
    const sendEmailBtn = document.getElementById('btn-send-outlook');
    const sendMeetingBtn = document.getElementById('btn-send-meeting');
    const saveBtn = document.getElementById('btn-save-personal');

    document.documentElement.setAttribute('data-user-has-blocks', hasBlocks ? '1' : '0');

    if (currentName) currentName.textContent = name;
    if (contextName) contextName.textContent = name;
    if (previewBtn) previewBtn.disabled = !hasBlocks;
    if (sendEmailBtn) sendEmailBtn.disabled = !hasBlocks;
    if (sendMeetingBtn) sendMeetingBtn.disabled = !hasBlocks;
    if (saveBtn && saveBtn.style.display !== 'none') saveBtn.disabled = !hasBlocks;

    if (statusPill) {
        let status = 'Черновик';
        if (!UserAppState.blocks.length) {
            status = 'Пустой холст';
        } else if (UserAppState.isDirty) {
            status = 'Изменения не сохранены';
        } else {
            status = 'Готов к отправке';
        }
        statusPill.textContent = `Статус: ${status}`;
    }

    window.updateUserMenuState?.();
}

window.updateUserEditorMeta = updateUserEditorMeta;
// Запуск приложения при загрузке страницы
document.addEventListener('DOMContentLoaded', initUserApp);
