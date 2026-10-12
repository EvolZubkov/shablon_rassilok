// shared/bannerGradient.js — математика градиента баннера (общая для admin и user).
// Вынесено из settings/settingsUtils.js: в user-режиме сервер блокирует js/settings/*
// (routes/static_files.py), а рендер баннера (imageRenderers.js) читает градиент через
// getBannerGradientState().

const BANNER_GRADIENT_TARGETS = {
    background: {
        prefix: 'backgroundGradient',
        colorKey: 'backgroundColor',
        defaultColor: '#7700FF',
        label: 'Banner background'
    },
    leftBlock: {
        prefix: 'leftBlockGradient',
        colorKey: 'leftBlockColor',
        defaultColor: '#1D2533',
        label: 'Left block'
    }
};

function isBannerGradientTarget(target) {
    return target === 'background' || target === 'leftBlock';
}

function getActiveBannerGradientTarget(settings) {
    return (settings?.rightImageMode || 'mask') === 'rounded' ? 'background' : 'leftBlock';
}

function getBannerGradientMeta(target) {
    return BANNER_GRADIENT_TARGETS[target] || BANNER_GRADIENT_TARGETS.leftBlock;
}

function getBannerGradientKey(target, field) {
    const prefix = getBannerGradientMeta(target).prefix;
    const suffixMap = {
        enabled: 'Enabled',
        stops: 'Stops',
        angle: 'Angle',
        centerX: 'CenterX',
        centerY: 'CenterY',
        balance: 'Balance'
    };

    return `${prefix}${suffixMap[field] || ''}`;
}

function getBannerGradientBaseColor(settings, target) {
    const meta = getBannerGradientMeta(target);
    return settings?.[meta.colorKey] || meta.defaultColor;
}

function getBannerGradientState(settings, target) {
    const activeTarget = getActiveBannerGradientTarget(settings);
    const targetEnabledKey = getBannerGradientKey(target, 'enabled');
    const targetStopsKey = getBannerGradientKey(target, 'stops');
    const targetAngleKey = getBannerGradientKey(target, 'angle');
    const targetCenterXKey = getBannerGradientKey(target, 'centerX');
    const targetCenterYKey = getBannerGradientKey(target, 'centerY');
    const targetBalanceKey = getBannerGradientKey(target, 'balance');

    const enabled = settings?.[targetEnabledKey] != null
        ? Boolean(settings[targetEnabledKey])
        : (activeTarget === target ? Boolean(settings?.gradientEnabled) : false);

    let stops = null;
    if (Array.isArray(settings?.[targetStopsKey]) && settings[targetStopsKey].length >= 2) {
        stops = normalizeGradientStops(settings[targetStopsKey]);
    } else if (activeTarget === target && Array.isArray(settings?.gradientStops) && settings.gradientStops.length >= 2) {
        stops = normalizeGradientStops(settings.gradientStops);
    } else {
        stops = normalizeGradientStops([
            {
                id: 1,
                color: getBannerGradientBaseColor(settings, target),
                opacity: 100,
                position: Number(settings?.gradientStart ?? 0)
            },
            {
                id: 2,
                color: settings?.gradientColor || '#A855F7',
                opacity: Number(settings?.gradientOpacity ?? 100),
                position: Number(settings?.gradientEnd ?? 100)
            }
        ]);
    }

    const readNumeric = (specificKey, legacyKey, fallback) => {
        if (Number.isFinite(Number(settings?.[specificKey]))) return Number(settings[specificKey]);
        if (activeTarget === target && Number.isFinite(Number(settings?.[legacyKey]))) return Number(settings[legacyKey]);
        return fallback;
    };

    return {
        enabled,
        stops,
        angle: readNumeric(targetAngleKey, 'gradientAngle', 24),
        centerX: readNumeric(targetCenterXKey, 'gradientCenterX', 42),
        centerY: readNumeric(targetCenterYKey, 'gradientCenterY', 38),
        balance: readNumeric(targetBalanceKey, 'gradientBalance', 120)
    };
}

function getBannerGradientSettingValue(settings, target, key) {
    const state = getBannerGradientState(settings, target);
    switch (key) {
        case 'gradientAngle': return state.angle;
        case 'gradientCenterX': return state.centerX;
        case 'gradientCenterY': return state.centerY;
        case 'gradientBalance': return state.balance;
        case 'gradientEnabled': return state.enabled;
        default: return null;
    }
}

function updateBannerGradientSetting(blockId, target, key, value) {
    if (!isBannerGradientTarget(target)) {
        updateBlockSetting(blockId, key, value);
        return;
    }

    const keyMap = {
        gradientEnabled: getBannerGradientKey(target, 'enabled'),
        gradientStops: getBannerGradientKey(target, 'stops'),
        gradientAngle: getBannerGradientKey(target, 'angle'),
        gradientCenterX: getBannerGradientKey(target, 'centerX'),
        gradientCenterY: getBannerGradientKey(target, 'centerY'),
        gradientBalance: getBannerGradientKey(target, 'balance')
    };

    updateBlockSetting(blockId, keyMap[key] || key, value);
}

function getGradientStopsModel(settings, target = null) {
    if (isBannerGradientTarget(target)) {
        return getBannerGradientState(settings, target).stops;
    }

    if (Array.isArray(settings.gradientStops) && settings.gradientStops.length >= 2) {
        return normalizeGradientStops(settings.gradientStops);
    }

    const mode = settings.rightImageMode || 'mask';
    const baseColor = (mode === 'mask')
        ? (settings.leftBlockColor || '#1D2533')
        : (settings.backgroundColor || '#7700FF');

    return normalizeGradientStops([
        {
            id: 1,
            color: baseColor,
            opacity: 100,
            position: Number(settings.gradientStart ?? 0)
        },
        {
            id: 2,
            color: settings.gradientColor || '#A855F7',
            opacity: Number(settings.gradientOpacity ?? 100),
            position: Number(settings.gradientEnd ?? 100)
        }
    ]);
}

function normalizeGradientStops(stops) {
    return [...stops]
        .map((stop, index) => ({
            id: stop.id ?? Date.now() + index,
            color: ensureHex(stop.color || '#7700FF'),
            opacity: clampNumber(stop.opacity, 0, 100, 100),
            position: clampNumber(stop.position, 0, 100, index === 0 ? 0 : 100)
        }))
        .sort((a, b) => a.position - b.position);
}

function updateGradientStop(blockId, stopId, key, value, target = null) {
    const block = AppState.findBlockById(blockId);
    if (!block) return;

    const stops = getGradientStopsModel(block.settings, target).map(stop =>
        stop.id === stopId ? { ...stop, [key]: value } : stop
    );

    if (isBannerGradientTarget(target)) {
        updateBannerGradientSetting(blockId, target, 'gradientStops', normalizeGradientStops(stops));
        return;
    }

    updateBlockSetting(blockId, 'gradientStops', normalizeGradientStops(stops));
}

function updateGradientGlobalOpacity(blockId, value, target = null) {
    const block = AppState.findBlockById(blockId);
    if (!block) return;

    const opacity = clampNumber(value, 0, 100, 100);
    const stops = getGradientStopsModel(block.settings, target).map(stop => ({
        ...stop,
        opacity
    }));

    if (isBannerGradientTarget(target)) {
        updateBannerGradientSetting(blockId, target, 'gradientStops', stops);
        return;
    }

    updateBlockSetting(blockId, 'gradientStops', stops);
}

function buildGradientPreviewCss(settings, target = null) {
    const angle = isBannerGradientTarget(target)
        ? Number(getBannerGradientSettingValue(settings, target, 'gradientAngle') ?? 0)
        : Number(settings.gradientAngle ?? 0);
    const stops = getGradientStopsModel(settings, target)
        .map(stop => `${hexToRgba(stop.color, stop.opacity)} ${stop.position}%`);

    return `linear-gradient(${angle}deg, ${stops.join(', ')})`;
}

function hexToRgba(hex, opacity) {
    const safeHex = ensureHex(hex).replace('#', '');
    const r = parseInt(safeHex.slice(0, 2), 16);
    const g = parseInt(safeHex.slice(2, 4), 16);
    const b = parseInt(safeHex.slice(4, 6), 16);
    const a = clampNumber(opacity, 0, 100, 100) / 100;
    return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function ensureHex(value) {
    const raw = String(value || '').trim().replace('#', '');
    if (/^[0-9a-fA-F]{6}$/.test(raw)) return `#${raw.toUpperCase()}`;
    return '#7700FF';
}

function clampNumber(value, min, max, fallback) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.min(max, Math.max(min, num));
}

function getGradientSummaryOpacity(settings, target = null) {
    const stops = getGradientStopsModel(settings, target);
    return stops[0]?.opacity ?? 100;
}
