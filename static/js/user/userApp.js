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
    previewCacheKey: null, // "id:type" of the template currently open in the preview modal
};

/**
 * Rendered preview HTML cache.
 * Maps {@code "id:type:theme"} strings to fully-generated email HTML.
 * A hit eliminates the {@code generateEmailHTML()} call on repeated opens
 * of the same template with the same theme.  Cleared when
 * {@link loadTemplatesAndCategories} fetches a fresh template list.
 *
 * @private
 * @type {Map<string, string>}
 */
const _previewHtmlCache = new Map();

const UserThemeUI = {
    STORAGE_KEY: 'email-builder-theme',
    DARK_THEME: 'dark',
    LIGHT_THEME: 'light',

    resolveInitialTheme() {
        const savedTheme = localStorage.getItem(this.STORAGE_KEY);
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        return savedTheme || (prefersDark ? this.DARK_THEME : this.DARK_THEME);
    },

    suspendTransitions(callback) {
        document.documentElement.classList.add('theme-switching');
        try {
            callback();
        } finally {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    document.documentElement.classList.remove('theme-switching');
                });
            });
        }
    },

    init() {
        const theme = this.resolveInitialTheme();
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
        this.suspendTransitions(() => {
            document.documentElement.setAttribute('data-theme', next);
            localStorage.setItem(this.STORAGE_KEY, next);
            this.syncButtons();
        });
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

    // Загружаем конфиг и список шаблонов параллельно.
    // generateEmailHTML (внутри loadCardPreviews) использует данные конфига,
    // но вызывается только после Phase 1 (N fetches шаблонов) — к тому моменту
    // ConfigLoader гарантированно завершён.
    await Promise.all([ConfigLoader.load(), loadTemplatesAndCategories()]);

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
        // Загружаем шаблоны — категории выводим из данных списка, отдельный запрос не нужен.
        const { templates: templatesData } = await TemplatesAPI.getList();

        // Берём только общие шаблоны (не пресеты)
        UserAppState.templates = (templatesData?.shared || []).filter(t => !t.isPreset);
        _previewHtmlCache.clear();

        // Derive categories from template data: only categories that have at least one
        // visible template, sorted alphabetically — matches server sort order.
        UserAppState.categories = [
            ...new Set(UserAppState.templates.map(t => t.category).filter(Boolean)),
        ].sort();

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

    // Fast path: render cards that already carry a valid preview in the list
    // payload.  Only previews with the correct version flag are used — older
    // thumbnails (generated by the legacy html2canvas-of-canvas method) lack
    // the version field and must be discarded so they can be regenerated on
    // the next admin save.
    const needsLoad = [];
    for (const template of templates) {
        if (template.preview && template.previewVersion === TEMPLATE_PREVIEW_VERSION) {
            const card = document.querySelector(`.template-card[data-id="${template.id}"]`);
            if (!card) continue;
            const previewContainer = card.querySelector('.template-card-preview');
            if (!previewContainer) continue;
            const overlay = previewContainer.querySelector('.template-card-overlay');
            const img = document.createElement('img');
            img.src = template.preview;
            img.style.cssText = `width: 100%; height: ${CARD_HEIGHT}px; object-fit: cover; object-position: top; display: block;`;
            previewContainer.innerHTML = '';
            previewContainer.appendChild(img);
            if (overlay) previewContainer.appendChild(overlay);
        } else {
            needsLoad.push(template);
        }
    }

    if (!needsLoad.length) return;

    // Phase 1: fetch template data for those without a stored preview.
    const dataList = await Promise.all(
        needsLoad.map(t => TemplatesAPI.load(t.id, t.type).catch(() => null))
    );

    // Phase 2: generate and render previews sequentially — AppState.blocks mutation
    // must not overlap between iterations.
    for (let i = 0; i < needsLoad.length; i++) {
        const template = needsLoad[i];
        const templateData = dataList[i];

        const card = document.querySelector(`.template-card[data-id="${template.id}"]`);
        if (!card) continue;

        const previewContainer = card.querySelector('.template-card-preview');
        if (!previewContainer) continue;

        try {
            if (!templateData || !templateData.blocks) continue;

            // preview may have been added to the template after listing — use
            // it only when the version flag confirms it was correctly generated.
            if (templateData.preview && templateData.previewVersion === TEMPLATE_PREVIEW_VERSION) {
                const imgOverlay = previewContainer.querySelector('.template-card-overlay');
                const img = document.createElement('img');
                img.src = templateData.preview;
                img.style.cssText = `width: 100%; height: ${CARD_HEIGHT}px; object-fit: cover; object-position: top; display: block;`;
                previewContainer.innerHTML = '';
                previewContainer.appendChild(img);
                if (imgOverlay) previewContainer.appendChild(imgOverlay);
                continue;
            }

            // No stored preview — fall back to live iframe rendering.
            // Use light theme so thumbnails look clean regardless of the
            // user's current UI theme setting.
            const originalBlocks = AppState.blocks;
            let html;
            try {
                AppState.blocks = JSON.parse(JSON.stringify(templateData.blocks));
                html = await generateEmailHTML({ previewTheme: 'light' });
            } finally {
                AppState.blocks = originalBlocks;
            }

            const cardWidth = card.offsetWidth || 260;
            const scale = cardWidth / EMAIL_WIDTH;

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
            const overlay = previewContainer.querySelector('.template-card-overlay');
            previewContainer.innerHTML = '';
            previewContainer.appendChild(wrapper);
            if (overlay) previewContainer.appendChild(overlay);

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

    const hasFavorites = UserAppState.templates.some(t => FavoritesStore.isFavorite(t.id));

    // If the favorites tab is active but there are no favorites, fall back to 'all'.
    if (!hasFavorites && UserAppState.currentCategory === '__favorites__') {
        UserAppState.currentCategory = 'all';
    }

    const isActive = (cat) => UserAppState.currentCategory === cat;

    tabsContainer.innerHTML = `
        <button class="category-tab${isActive('all') ? ' active' : ''}" data-category="all">Все шаблоны</button>
        ${hasFavorites
            ? `<button class="category-tab category-tab--favorites${isActive('__favorites__') ? ' active' : ''}" data-category="__favorites__">Избранные</button>`
            : ''}
    `;

    // Добавляем категории
    UserAppState.categories.forEach(category => {
        const tab = document.createElement('button');
        tab.className = 'category-tab' + (isActive(category) ? ' active' : '');
        tab.dataset.category = category;
        tab.textContent = category;
        tabsContainer.appendChild(tab);
    });

    // Обработчики кликов
    tabsContainer.querySelectorAll('.category-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            tabsContainer.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
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
    if (UserAppState.currentCategory === '__favorites__') {
        filtered = filtered.filter(t => FavoritesStore.isFavorite(t.id));
    } else if (UserAppState.currentCategory !== 'all') {
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
    grid.innerHTML = filtered.map(template => {
        const id    = TextSanitizer.escapeHTML(template.id);
        const type  = TextSanitizer.escapeHTML(template.type);
        const name  = TextSanitizer.escapeHTML(template.name);
        const cat   = TextSanitizer.escapeHTML(template.category || 'Без категории');
        const isFav = FavoritesStore.isFavorite(template.id);
        const favCls   = isFav ? ' btn-favorite--active' : '';
        const favTitle = isFav ? 'Убрать из избранного' : 'В избранное';
        return `
        <div class="template-card" data-id="${id}" data-type="${type}">
            <div class="template-card-preview" data-id="${id}" data-type="${type}">
                <div class="preview-loading-mini">
                    <div class="spinner-mini"></div>
                </div>
                <div class="template-card-overlay">
                    <button type="button" class="btn-template-preview" data-id="${id}" data-type="${type}">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                            <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                        Просмотреть
                    </button>
                </div>
            </div>
            <button type="button" class="btn-favorite${favCls}"
                    data-id="${id}" data-type="${type}"
                    title="${favTitle}" aria-label="${favTitle}">
                <svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
                             fill="${isFav ? 'currentColor' : 'none'}"/>
                </svg>
            </button>
            <div class="template-card-info">
                <div class="template-card-name">${name}</div>
                <div class="template-card-meta">${cat}</div>
            </div>
        </div>
    `;
    }).join('');

    // Загружаем превью карточек (асинхронно)
    loadCardPreviews(filtered);

    // Обработчики кликов на карточки (открыть редактор)
    grid.querySelectorAll('.template-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (e.target.closest('.btn-template-preview')) return;
            if (e.target.closest('.btn-favorite')) return;
            openTemplate(card.dataset.id, card.dataset.type);
        });
    });

    grid.querySelectorAll('.btn-template-preview').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            previewTemplate(btn.dataset.id, btn.dataset.type);
        });
    });

    grid.querySelectorAll('.btn-favorite').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleFavorite(btn.dataset.id, btn.dataset.type, btn);
        });
    });
}

/**
 * Toggle the favorite state of a template card.
 *
 * Persists the new state to the server, updates the in-memory template list,
 * refreshes the star button visuals in-place, and re-renders the category
 * tabs so the Favorites tab appears/disappears as needed.  If the Favorites
 * tab is currently active the card grid is also refreshed.
 *
 * @param {string}      id    - Template stable identifier.
 * @param {string}      type  - Template type ('shared' or 'personal').
 * @param {HTMLElement} btnEl - The star button element to update in-place.
 * @returns {Promise<void>}
 */
function toggleFavorite(id, type, btnEl) {
    const next = FavoritesStore.toggle(id);
    btnEl.classList.toggle('btn-favorite--active', next);
    btnEl.title = next ? 'Убрать из избранного' : 'В избранное';
    btnEl.setAttribute('aria-label', btnEl.title);
    const poly = btnEl.querySelector('polygon');
    if (poly) poly.setAttribute('fill', next ? 'currentColor' : 'none');

    // Update tabs (Favorites tab may appear or disappear).
    renderCategoryTabs();

    // If currently viewing favorites, re-render cards to reflect the change.
    if (UserAppState.currentCategory === '__favorites__') {
        renderTemplateCards();
    }
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
    UserAppState.previewBlocks   = null;
    UserAppState.previewCacheKey = null;

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
    if (typeof window.openSharedEmailPreviewModal !== 'function') return;

    // Временно устанавливаем блоки в AppState для генерации HTML
    const originalBlocks = AppState.blocks;
    AppState.blocks = UserAppState.blocks;

    try {
        const previewTheme = window.EmailPreviewTheme?.get?.() || 'light';
        const html = await generateEmailHTML({ previewTheme });
        UserAppState.previewBlocks = JSON.parse(JSON.stringify(UserAppState.blocks || []));
        window.openSharedEmailPreviewModal({
            html,
            title: 'Превью письма',
        });
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

    const themeSlot = document.getElementById('template-preview-theme-slot');
    if (themeSlot && typeof window.EmailPreviewTheme?.mount === 'function') {
        themeSlot.innerHTML = '';
        window.EmailPreviewTheme.mount(themeSlot);
    }

    const cacheKey     = `${id}:${type}`;
    const previewTheme = window.EmailPreviewTheme?.get?.() || 'light';
    const htmlKey      = `${cacheKey}:${previewTheme}`;
    UserAppState.previewCacheKey = cacheKey;

    // Show spinner only when HTML must be generated (TemplatesAPI.load is now instant from cache).
    if (!_previewHtmlCache.has(htmlKey)) {
        content.innerHTML = '<div class="preview-loading"><div class="spinner"></div><p>Загрузка...</p></div>';
    }

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

        if (_previewHtmlCache.has(htmlKey)) {
            renderEmailPreviewFrame(content, _previewHtmlCache.get(htmlKey));
        } else {
            await renderTemplatePreview(content, templateData.blocks, htmlKey);
        }

    } catch (error) {
        console.error('[USER APP] Error previewing template:', error);
        content.innerHTML = '<div class="preview-error">Ошибка загрузки</div>';
    }
}

/**
 * Generate and render an email preview into the given container.
 *
 * Temporarily swaps {@code AppState.blocks} so that {@link generateEmailHTML}
 * produces HTML for {@code blocks} rather than the editor's current content.
 * When {@code htmlCacheKey} is supplied the generated HTML is stored in
 * {@link _previewHtmlCache} so that subsequent opens of the same template
 * with the same theme are instant.
 *
 * @param {HTMLElement} container   - Element to render the preview iframe into.
 * @param {object[]}    blocks      - Template blocks to render.
 * @param {string|null} [htmlCacheKey=null] - Cache key {@code "id:type:theme"} or {@code null} to skip caching.
 * @returns {Promise<void>}
 */
async function renderTemplatePreview(container, blocks, htmlCacheKey = null) {
    // Используем generateEmailHTML для полного корректного рендера
    const originalBlocks = (typeof AppState !== 'undefined') ? AppState.blocks : null;

    try {
        if (typeof AppState !== 'undefined') {
            AppState.blocks = JSON.parse(JSON.stringify(blocks));
        }

        const previewTheme = window.EmailPreviewTheme?.get?.() || 'light';
        const html = await generateEmailHTML({ previewTheme });
        if (htmlCacheKey) _previewHtmlCache.set(htmlCacheKey, html);
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
    if (typeof window.sharedRenderEmailPreviewFrame === 'function') {
        window.sharedRenderEmailPreviewFrame(container, html);
    }
}

/**
 * Закрыть превью шаблона
 */
function closeTemplatePreview() {
    const modal = document.getElementById('template-preview-modal');
    if (modal) {
        modal.style.display = 'none';
    }
    UserAppState.previewBlocks   = null;
    UserAppState.previewCacheKey = null;
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
    if (typeof window.ensureSharedEmailPreviewModal === 'function') {
        window.ensureSharedEmailPreviewModal({ title: 'Превью письма' });
    }
}

function initUserPreviewThemeRerender() {
    document.addEventListener('email-preview-theme-change', async () => {
        const templatePreviewModal = document.getElementById('template-preview-modal');

        if (typeof window.isSharedEmailPreviewOpen === 'function' && window.isSharedEmailPreviewOpen()) {
            await showUserPreview();
            return;
        }

        if (templatePreviewModal?.style.display === 'flex' && UserAppState.previewBlocks) {
            const content = document.getElementById('template-preview-content');
            if (content) {
                // Theme changed — regenerate and update cache for the new theme.
                const newTheme = window.EmailPreviewTheme?.get?.() || 'light';
                const htmlKey  = UserAppState.previewCacheKey
                    ? `${UserAppState.previewCacheKey}:${newTheme}` : null;
                await renderTemplatePreview(content, UserAppState.previewBlocks, htmlKey);
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
