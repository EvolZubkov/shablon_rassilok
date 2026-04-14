// configLoader.js - Загрузка конфигурации ресурсов с сервера.
// Единственный источник данных для графических ресурсов — config.json.
// Переменные объявлены в definitions.js, заполняются здесь.

const ConfigLoader = {
    config: null,
    loaded: false,

    /**
     * Загрузить конфигурацию с сервера
     */
    async load() {
        try {
            console.log('[*] Загрузка конфигурации ресурсов...');

            const response = await fetch('/api/config');
            const data = await response.json();

            if (data.success) {
                this.config = data.config;
                this.loaded = true;

                // Заполняем let-переменные из definitions.js
                // и синхронно window.X — некоторые файлы читают через window.*
                BANNERS            = window.BANNERS            = this.config.banners            || [];
                IMPORTANT_ICONS    = window.IMPORTANT_ICONS    = this.config.icons?.important   || [];
                EXPERT_BADGE_ICONS = window.EXPERT_BADGE_ICONS = this.config.expertBadges       || [];
                BULLET_TYPES       = window.BULLET_TYPES       = this.config.bullets            || [];
                BUTTON_ICONS       = window.BUTTON_ICONS       = this.config.buttonIcons        || [];
                DIVIDER_IMAGES     = window.DIVIDER_IMAGES     = this.config.dividers           || [];
                window.BANNER_BACKGROUNDS = this.config.bannerBackgrounds || [];
                window.BANNER_LOGOS       = this.config.bannerLogos       || [];
                window.BANNER_ICONS       = this.config.bannerIcons       || [];

                console.log('[OK] Конфигурация загружена:');
                console.log(`   - Баннеров: ${BANNERS.length}`);
                console.log(`   - Иконок: ${IMPORTANT_ICONS.length}`);
                console.log(`   - Значков: ${EXPERT_BADGE_ICONS.length}`);
                console.log(`   - Буллетов: ${BULLET_TYPES.length}`);
                console.log(`   - Иконок кнопок: ${BUTTON_ICONS.length}`);
                console.log(`   - Разделителей: ${DIVIDER_IMAGES.length}`);
                console.log(`   - Фонов баннера: ${window.BANNER_BACKGROUNDS.length}`);
                console.log(`   - Логотипов баннера: ${window.BANNER_LOGOS.length}`);
                console.log(`   - Иконок баннера: ${window.BANNER_ICONS.length}`);

                return true;
            } else {
                console.error('[ERROR] Ошибка загрузки конфигурации:', data.error);
                this.loadDefaults();
                return false;
            }

        } catch (error) {
            console.error('[ERROR] Ошибка запроса конфигурации:', error);
            this.loadDefaults();
            return false;
        }
    },

    /**
     * Загрузить дефолтные значения (если сервер недоступен)
     */
    loadDefaults() {
        console.warn('[WARNING] Используются пустые массивы ресурсов');

        BANNERS = window.BANNERS = [];
        IMPORTANT_ICONS = window.IMPORTANT_ICONS = [];
        EXPERT_BADGE_ICONS = window.EXPERT_BADGE_ICONS = [];
        BULLET_TYPES = window.BULLET_TYPES = [];
        BUTTON_ICONS = window.BUTTON_ICONS = [];
        DIVIDER_IMAGES = window.DIVIDER_IMAGES = [];
        window.BANNER_BACKGROUNDS = []; window.BANNER_LOGOS = []; window.BANNER_ICONS = [];

        this.loaded = true;
    },

    /**
     * Получить значение из конфига
     */
    get(path) {
        if (!this.loaded) {
            console.warn('[WARNING] Конфиг ещё не загружен');
            return null;
        }

        const keys = path.split('.');
        let value = this.config;

        for (const key of keys) {
            if (value && typeof value === 'object' && key in value) {
                value = value[key];
            } else {
                return null;
            }
        }

        return value;
    }
};

// Экспортируем глобально
window.ConfigLoader = ConfigLoader;