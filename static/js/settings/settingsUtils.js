// settings/settingsUtils.js — математика градиента, createImageGrid, createCompactNumberInput

function getGradientStopsModel(settings) {
    if (Array.isArray(settings.gradientStops) && settings.gradientStops.length >= 2) {
        return normalizeGradientStops(settings.gradientStops);
    }

    // Дефолтный цвет первого стопа зависит от режима:
    // mask → leftBlockColor, rounded → backgroundColor
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

function updateGradientStop(blockId, stopId, key, value) {
    const block = AppState.findBlockById(blockId);
    if (!block) return;

    const stops = getGradientStopsModel(block.settings).map(stop =>
        stop.id === stopId ? { ...stop, [key]: value } : stop
    );

    updateBlockSetting(blockId, 'gradientStops', normalizeGradientStops(stops));
    // НЕ вызываем renderSettings() — это уничтожит DOM попапа
    // renderCanvas() вызывается внутри updateBlockSetting → renderBannerToDataUrl
}

function updateGradientGlobalOpacity(blockId, value) {
    const block = AppState.findBlockById(blockId);
    if (!block) return;

    const opacity = clampNumber(value, 0, 100, 100);
    const stops = getGradientStopsModel(block.settings).map(stop => ({
        ...stop,
        opacity
    }));

    updateBlockSetting(blockId, 'gradientStops', stops);
    // НЕ вызываем renderSettings() — это уничтожит DOM попапа
}

function buildGradientPreviewCss(settings) {
    const angle = Number(settings.gradientAngle ?? 0);
    const stops = getGradientStopsModel(settings)
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

function getGradientSummaryOpacity(settings) {
    const stops = getGradientStopsModel(settings);
    return stops[0]?.opacity ?? 100;
}
// Создание сетки картинок для выбора
function createImageGrid(images, currentValue, blockId, settingKey, customKey) {
    const grid = document.createElement('div');
    grid.style.cssText = 'display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 12px;';

    images.forEach(img => {
        const option = document.createElement('div');
        const isSelected = currentValue === img.src;
        option.dataset.selected = isSelected ? 'true' : 'false';
        option.style.cssText = `
            border: 2px solid ${isSelected ? '#f97316' : '#374151'};
            border-radius: 8px; overflow: hidden; cursor: pointer;
            transition: all 0.2s; aspect-ratio: 16/9;
            background: #1e293b; position: relative;
        `;

        const imgEl = document.createElement('img');
        imgEl.src = img.src;
        imgEl.alt = img.label;
        imgEl.style.cssText = 'width: 100%; height: 100%; object-fit: cover;';
        option.appendChild(imgEl);

        if (img.userOwned) {
            const badge = document.createElement('span');
            badge.className = 'user-owned-badge';
            badge.textContent = 'Мои';
            option.appendChild(badge);
        }

        option.addEventListener('click', () => {
            // Clear customKey directly in block.settings to avoid a redundant
            // renderBannerToDataUrl call that races with the main update below.
            if (customKey) {
                const block = AppState.findBlockById(blockId);
                if (block) block.settings[customKey] = '';
            }
            updateBlockSetting(blockId, settingKey, img.src);
            renderSettings();
        });

        option.addEventListener('mouseenter', () => {
            if (option.dataset.selected !== 'true') option.style.borderColor = '#64748b';
        });
        option.addEventListener('mouseleave', () => {
            if (option.dataset.selected !== 'true') option.style.borderColor = '#374151';
        });

        grid.appendChild(option);
    });

    return grid;
}

// Компактный числовой инпут
function createCompactNumberInput(label, value, blockId, settingKey) {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';

    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    labelEl.style.cssText = 'font-size: 11px; color: #9ca3af;';

    const input = document.createElement('input');
    input.type = 'number';
    input.value = value;
    input.style.cssText = 'width: 100%; padding: 8px; border-radius: 6px; border: 1px solid #475569; background: #1e293b; color: #e5e7eb; font-size: 13px;';
    input.addEventListener('input', (e) => {
        updateBlockSetting(blockId, settingKey, parseInt(e.target.value) || 0);
    });

    wrapper.appendChild(labelEl);
    wrapper.appendChild(input);
    return wrapper;
}

// Карточка текстового элемента
