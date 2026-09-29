// profileLoader.js — загрузка профиля аудитории с сервера

const ProfileLoader = {
    profile: null,
    loaded:  false,

    async load() {
        try {
            const resp = await fetch('/api/profile');
            const data = await resp.json();
            if (data.success) {
                this.profile = data.profile;
                this.loaded  = true;
            }
        } catch (e) {
            console.warn('ProfileLoader: failed to load profile', e);
        }
    },

    // Список capability-id для данного типа блока
    getCapabilities(type) {
        return this.profile?.blocks?.[type]?.capabilities || [];
    },

    // true — блок разрешён в текущем профиле
    isBlockEnabled(type) {
        const cfg = this.profile?.blocks?.[type];
        if (!cfg) return true;
        return cfg.enabled !== false;
    },

    // Переопределения дефолтных настроек блока из профиля
    getBlockDefaults(type) {
        return this.profile?.blocks?.[type]?.defaults || null;
    },

    // Список ключей настроек, которые нужно скрыть в UI для данного блока
    getHiddenSettings(type) {
        return this.profile?.blocks?.[type]?.hidden || [];
    },

    // Горизонтальный отступ контента (px) — для всех блоков кроме banner
    getContentPadding() {
        return this.profile?.contentPadding ?? 27;
    },

    getProfile() { return this.profile; },
};
