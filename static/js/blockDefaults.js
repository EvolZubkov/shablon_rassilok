// blockDefaults.js - Настройки блоков по умолчанию

function getDefaultSettings(type) {
    const settings = DEFAULT_SETTINGS[type];
    
    if (!settings) {
        return {};
    }
    
    // Создаем копию настроек и вычисляем функции
    const result = {};
    for (let key in settings) {
        const value = settings[key];
        result[key] = typeof value === 'function' ? value() : value;
    }
    
    return result;
}

function getBlockTypeName(type) {
    return BLOCK_TYPE_NAMES[type] || type;
}