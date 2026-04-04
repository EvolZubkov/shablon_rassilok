// blockDefaults.js - Настройки блоков по умолчанию

function getDefaultSettings(type) {
    const settings = DEFAULT_SETTINGS[type];
    if (!settings) return {};
    // Deep copy prevents shared mutable state (arrays/objects) between block instances
    return JSON.parse(JSON.stringify(settings));
}

function getBlockTypeName(type) {
    return BLOCK_TYPE_NAMES[type] || type;
}