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
            // titleFontSize / extraFontSize — профильные дефолты размера шрифта
            // текстов баннера; живут в textElements[], а не в плоских настройках.
            const first = Array.isArray(base.textElements) ? base.textElements[0] : null;
            if (first && Number(base.titleFontSize) > 0) first.fontSize = Number(base.titleFontSize);
            delete base.titleFontSize;
            delete base.extraFontSize;
        }
    }

    return base;
}

function getBlockTypeName(type) {
    return BLOCK_TYPE_NAMES[type] || type;
}