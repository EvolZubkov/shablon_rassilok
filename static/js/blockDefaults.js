// blockDefaults.js - Настройки блоков по умолчанию

function getDefaultSettings(type) {
    const settings = DEFAULT_SETTINGS[type];
    if (!settings) return {};
    const base = JSON.parse(JSON.stringify(settings));

    if (typeof ProfileLoader !== 'undefined' && ProfileLoader.loaded &&
        typeof CapabilityRegistry !== 'undefined') {
        // Capability defaults
        ProfileLoader.getCapabilities(type).forEach(capId => {
            const cap = CapabilityRegistry.get(capId);
            if (cap && cap.defaultSettings) {
                Object.assign(base, cap.defaultSettings);
            }
        });
        // Profile-level block defaults (override anything above)
        const profileDefaults = ProfileLoader.getBlockDefaults(type);
        if (profileDefaults) {
            Object.assign(base, profileDefaults);
        }
        if (type === 'banner') {
            // Размеры шрифта баннера отрисовщик берёт прямо из профиля
            // (getBannerTextFontSize), в настройках блока они не хранятся.
            delete base.titleFontSize;
            delete base.extraFontSize;
        }
    }

    return base;
}

function getBlockTypeName(type) {
    return BLOCK_TYPE_NAMES[type] || type;
}