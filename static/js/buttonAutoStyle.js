// buttonAutoStyle.js

function normalizeButtonText(text) {
    return String(text || '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

function getButtonAutoStyle(settings = {}) {
    const normalizedText = normalizeButtonText(settings.text);

    const isMif = normalizedText === 'миф';
    const isAlpina = normalizedText === 'альпина';

    const color = isMif
        ? '#FFB608'
        : isAlpina
            ? '#A078FF'
            : (settings.color || '#f97316');

    const icon = isMif
        ? 'button-icons/Миф.png'
        : isAlpina
            ? 'button-icons/Альпина.png'
            : (settings.icon || '');

    return {
        normalizedText,
        isMif,
        isAlpina,
        isAuto: isMif || isAlpina,
        color,
        icon
    };
}