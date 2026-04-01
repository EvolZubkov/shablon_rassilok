// configLoader.js - Загрузка конфигурации ресурсов с сервера
// Работает ВМЕСТЕ с definitions.js (логика остаётся там)

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

                // Преобразуем в глобальные переменные (для совместимости с definitions.js)
                window.BANNERS = this.config.banners || [];
                window.IMPORTANT_ICONS = this.config.icons?.important || [];
                window.EXPERT_BADGE_ICONS = this.config.expertBadges || [];
                window.BULLET_TYPES = this.config.bullets || [];
                window.BUTTON_ICONS = this.config.buttonIcons || [];
                window.DIVIDER_IMAGES = this.config.dividers || [];
                window.BANNER_BACKGROUNDS = this.config.bannerBackgrounds || [];
                window.BANNER_LOGOS = this.config.bannerLogos || [];
                window.BANNER_ICONS = this.config.bannerIcons || [];

                console.log('[OK] Конфигурация загружена:');
                console.log(`   - Баннеров: ${window.BANNERS.length}`);
                console.log(`   - Иконок: ${window.IMPORTANT_ICONS.length}`);
                console.log(`   - Значков: ${window.EXPERT_BADGE_ICONS.length}`);
                console.log(`   - Буллетов: ${window.BULLET_TYPES.length}`);
                console.log(`   - Иконок кнопок: ${window.BUTTON_ICONS.length}`);
                console.log(`   - Разделителей: ${window.DIVIDER_IMAGES.length}`);
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

        window.BANNERS = [];
        window.IMPORTANT_ICONS = [];
        window.EXPERT_BADGE_ICONS = [];
        window.BULLET_TYPES = [];
        window.BUTTON_ICONS = [];
        window.DIVIDER_IMAGES = [];
        window.BANNER_BACKGROUNDS = [];
        window.BANNER_LOGOS = [];
        window.BANNER_ICONS = [];

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