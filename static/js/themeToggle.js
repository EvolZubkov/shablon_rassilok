// themeToggle.js - Переключатель светлой/тёмной темы

const ThemeManager = {
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

    /**
     * Инициализация темы при загрузке
     */
    init() {
        const theme = this.resolveInitialTheme();
        this.applyTheme(theme);
        this.createToggleButton();

        console.log(`[Theme] Initialized: ${theme}`);
    },

    /**
     * Применяет тему к документу
     */
    applyTheme(theme) {
        const next = theme === this.LIGHT_THEME ? this.LIGHT_THEME : this.DARK_THEME;
        this.suspendTransitions(() => {
            document.documentElement.setAttribute('data-theme', next);
            localStorage.setItem(this.STORAGE_KEY, next);
            this.updateToggleIcon(next);
        });
        document.dispatchEvent(new CustomEvent('app-theme-change', {
            detail: { theme: next },
        }));
    },

    /**
     * Переключает тему
     */
    toggle() {
        const currentTheme = document.documentElement.getAttribute('data-theme') || this.DARK_THEME;
        const newTheme = currentTheme === this.DARK_THEME ? this.LIGHT_THEME : this.DARK_THEME;

        this.applyTheme(newTheme);
        console.log(`[Theme] Switched to: ${newTheme}`);
    },

    /**
     * Создаёт кнопку переключения в header
     */
    createToggleButton() {
        const toolbar = document.querySelector('.admin-toolbar-right') || document.querySelector('.canvas-header');
        if (!toolbar) return;

        // Уже есть кнопка
        if (document.getElementById('theme-toggle-btn')) return;

        // Создаём кнопку темы
        const btn = document.createElement('button');
        btn.id = 'theme-toggle-btn';
        btn.className = 'theme-toggle-btn';
        btn.title = 'Переключить тему';
        btn.innerHTML = this.getIcon(this.getCurrentTheme());
        btn.addEventListener('click', () => this.toggle());

        toolbar.appendChild(btn);
    },

    /**
     * Обновляет иконку кнопки
     */
    updateToggleIcon(theme) {
        const btn = document.getElementById('theme-toggle-btn');
        if (btn) {
            btn.innerHTML = this.getIcon(theme);
        }
    },

    /**
     * Возвращает текущую тему
     */
    getCurrentTheme() {
        return document.documentElement.getAttribute('data-theme') || this.DARK_THEME;
    },

    /**
     * Возвращает SVG иконку для темы
     */
    getIcon(theme) {
        if (theme === this.DARK_THEME) {
            // Иконка солнца (для переключения на светлую)
            return `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="5"></circle>
                    <line x1="12" y1="1" x2="12" y2="3"></line>
                    <line x1="12" y1="21" x2="12" y2="23"></line>
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                    <line x1="1" y1="12" x2="3" y2="12"></line>
                    <line x1="21" y1="12" x2="23" y2="12"></line>
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
                </svg>
            `;
        } else {
            // Иконка луны (для переключения на тёмную)
            return `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                </svg>
            `;
        }
    }
};

// Автоматическая инициализация при загрузке DOM
document.addEventListener('DOMContentLoaded', () => {
    ThemeManager.init();
});

// Экспортируем для использования извне
window.ThemeManager = ThemeManager;
