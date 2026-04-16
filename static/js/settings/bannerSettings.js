// settings/bannerSettings.js — renderBannerSettings

function renderBannerSettings(container, block) {
    const s = block.settings;

    // === ОСНОВНЫЕ НАСТРОЙКИ ===
    const mainSection = document.createElement('div');
    mainSection.className = 'settings-section';

    mainSection.appendChild(
        createBannerHeightToggle('Высота баннера', s.bannerHeight || 250, block.id, 'bannerHeight')
    );

    mainSection.appendChild(
        createRightImageModeToggle(
            'Формат правой картинки',
            s.rightImageMode || 'mask',
            block.id
        )
    );

    const mainTitle = document.createElement('h3');
    mainTitle.textContent = 'Основные';
    mainTitle.style.cssText = 'color: var(--text-primary); font-size: 14px; margin: 0 0 12px 0; padding-bottom: 8px; border-bottom: 1px solid var(--border-primary);';
    mainSection.appendChild(mainTitle);

    const mode = s.rightImageMode || 'mask';
    const paintOrder = mode === 'mask'
        ? ['leftBlock', 'background']
        : ['background', 'leftBlock'];

    paintOrder.forEach((target) => {
        const label = target === 'background' ? 'Подложка' : 'Левый блок';
        mainSection.appendChild(createBannerPaintControl(block, target, label, mode));
    });

    container.appendChild(mainSection);

    // === ПРАВАЯ КАРТИНКА ===
    const rightImageSection = document.createElement('div');
    rightImageSection.className = 'settings-section';
    rightImageSection.style.marginTop = '20px';

    const rightImageTitle = document.createElement('h3');
    rightImageTitle.textContent = 'Картинка справа';
    rightImageTitle.style.cssText = 'color: var(--text-primary); font-size: 14px; margin: 0 0 12px 0; padding-bottom: 8px; border-bottom: 1px solid var(--border-primary);';
    rightImageSection.appendChild(rightImageTitle);

    // Сетка выбора
    if (window.BANNER_BACKGROUNDS && window.BANNER_BACKGROUNDS.length > 0) {
        const currentRightImage = s.rightImageCustom || s.rightImage || '';
        const grid = createImageGrid(window.BANNER_BACKGROUNDS, currentRightImage, block.id, 'rightImage', 'rightImageCustom');
        rightImageSection.appendChild(grid);
    }

    rightImageSection.appendChild(createFileUploadButton('Загрузить свою картинку', block.id, 'rightImageCustom'));

    if (s.rightImage || s.rightImageCustom) {
        const clearRightImageBtn = document.createElement('button');
        clearRightImageBtn.type = 'button';
        clearRightImageBtn.textContent = 'Убрать картинку';
        clearRightImageBtn.style.cssText = `
            width: 100%;
            height: 36px;
            margin-top: 8px;
            padding: 0 12px;
            background: var(--bg-secondary);
            border: 1px solid var(--border-secondary);
            border-radius: 8px;
            color: var(--text-secondary);
            cursor: pointer;
            font-size: 13px;
            transition: border-color 0.2s, background 0.2s, color 0.2s;
        `;
        clearRightImageBtn.addEventListener('mouseenter', () => {
            clearRightImageBtn.style.borderColor = 'var(--accent-primary)';
            clearRightImageBtn.style.color = 'var(--text-primary)';
        });
        clearRightImageBtn.addEventListener('mouseleave', () => {
            clearRightImageBtn.style.borderColor = 'var(--border-secondary)';
            clearRightImageBtn.style.color = 'var(--text-secondary)';
        });
        clearRightImageBtn.addEventListener('click', () => {
            const currentBlock = AppState.findBlockById(block.id);
            if (!currentBlock) return;
            currentBlock.settings.rightImage = '';
            currentBlock.settings.rightImageCustom = '';
            renderBannerToDataUrl(currentBlock, (dataUrl) => {
                currentBlock.settings.renderedBanner = dataUrl || null;
                renderCanvas();
            });
            renderSettings();
        });
        rightImageSection.appendChild(clearRightImageBtn);
    }

    if (s.rightImageCustom) {
        const preview = document.createElement('img');
        preview.src = s.rightImageCustom;
        preview.style.cssText = 'width: 100%; height: 60px; object-fit: cover; border-radius: 6px; margin-top: 8px; border: 2px solid var(--accent-primary);';
        rightImageSection.appendChild(preview);
    }

    // Настройки позиционирования картинки
    if (s.rightImage || s.rightImageCustom) {
        const positionTitle = document.createElement('div');
        positionTitle.textContent = 'Позиционирование';
        positionTitle.style.cssText = 'color: var(--text-muted); font-size: 12px; margin-top: 16px; margin-bottom: 8px;';
        rightImageSection.appendChild(positionTitle);

        // Смещение X и Y
        const rightImagePositionInput = createPositionInput({
            blockId: block.id,
            xKey: 'rightImageX',
            yKey: 'rightImageY',
            xValue: s.rightImageX || 0,
            yValue: s.rightImageY || 0,
            xMin: -200,
            xMax: 200,
            yMin: -200,
            yMax: 200
        });
        rightImageSection.appendChild(rightImagePositionInput);

        // Поворот и масштаб
        rightImageSection.appendChild(createSettingRange('Поворот', s.rightImageRotate || 0, block.id, 'rightImageRotate', -45, 45, 1, '°'));
        rightImageSection.appendChild(createSettingRange('Масштаб', s.rightImageScale || 100, block.id, 'rightImageScale', 50, 150, 1, '%'));
    }

    container.appendChild(rightImageSection);

    // === ЛОГОТИП ===
    const logoSection = document.createElement('div');
    logoSection.className = 'settings-section';
    logoSection.style.marginTop = '20px';

    const logoTitle = document.createElement('h3');
    logoTitle.textContent = 'Логотип';
    logoTitle.style.cssText = 'color: var(--text-primary); font-size: 14px; margin: 0 0 12px 0; padding-bottom: 8px; border-bottom: 1px solid var(--border-primary);';
    logoSection.appendChild(logoTitle);

    // Сетка выбора логотипов
    if (window.BANNER_LOGOS && window.BANNER_LOGOS.length > 0) {
        const currentLogo = s.logoCustom || s.logo || '';
        const grid = createImageGrid(window.BANNER_LOGOS, currentLogo, block.id, 'logo', 'logoCustom');
        logoSection.appendChild(grid);
    }

    logoSection.appendChild(createFileUploadButton('Загрузить свой логотип', block.id, 'logoCustom'));

    if (s.logoCustom) {
        const preview = document.createElement('img');
        preview.src = s.logoCustom;
        preview.style.cssText = 'width: 80px; height: 40px; object-fit: contain; border-radius: 6px; margin-top: 8px; border: 2px solid var(--accent-primary); background: var(--bg-secondary);';
        logoSection.appendChild(preview);
    }

    // Позиция логотипа
    const logoPositionLabel = document.createElement('div');
    logoPositionLabel.textContent = 'Позиция';
    logoPositionLabel.style.cssText = 'color: var(--text-muted); font-size: 12px; margin-top: 12px; margin-bottom: 8px;';
    logoSection.appendChild(logoPositionLabel);

    const logoPositionInput = createPositionInput({
        blockId: block.id,
        xKey: 'logoX',
        yKey: 'logoY',
        xValue: s.logoX || 24,
        yValue: s.logoY || 24,
        xMin: 0,
        xMax: 600,
        yMin: 0,
        yMax: s.bannerHeight || 250
    });
    logoSection.appendChild(logoPositionInput);
    logoSection.appendChild(createSettingRange('Масштаб', s.logoScale || 100, block.id, 'logoScale', 50, 150, 1, '%'));

    container.appendChild(logoSection);

    // === ТЕКСТОВЫЕ ЭЛЕМЕНТЫ ===
    const textSection = document.createElement('div');
    textSection.className = 'settings-section';
    textSection.style.marginTop = '20px';

    const textTitle = document.createElement('h3');
    textTitle.textContent = 'Текстовые элементы';
    textTitle.style.cssText = 'color: var(--text-primary); font-size: 14px; margin: 0 0 12px 0; padding-bottom: 8px; border-bottom: 1px solid var(--border-primary);';
    textSection.appendChild(textTitle);

    // Контейнер для текстовых элементов (drag&drop)
    const textElementsContainer = document.createElement('div');
    textElementsContainer.id = 'banner-text-elements';
    textElementsContainer.style.cssText = 'display: flex; flex-direction: column; gap: 12px;';

    const textElements = s.textElements || [];
    textElements.forEach((textEl, index) => {
        const elementCard = createTextElementCard(block.id, textEl, index, textElements.length);
        textElementsContainer.appendChild(elementCard);
    });

    textSection.appendChild(textElementsContainer);

    // Кнопка добавления
    const addButton = document.createElement('button');
    addButton.textContent = '+ Добавить текст';
    addButton.style.cssText = `
        width: 100%; padding: 12px; margin-top: 12px;
        background: var(--bg-hover); border: 1px dashed var(--border-dashed);
        border-radius: 8px; color: var(--text-secondary); cursor: pointer;
        font-size: 13px; transition: all 0.2s;
    `;
    addButton.addEventListener('mouseenter', () => {
        addButton.style.background = 'var(--bg-selected)';
        addButton.style.borderColor = 'var(--accent-primary)';
    });
    addButton.addEventListener('mouseleave', () => {
        addButton.style.background = 'var(--bg-hover)';
        addButton.style.borderColor = 'var(--border-dashed)';
    });
    addButton.addEventListener('click', () => {
        addBannerTextElement(block.id);
    });

    textSection.appendChild(addButton);
    container.appendChild(textSection);
}

const BANNER_BASE_PALETTE = [
    '#A078FF',
    '#FF5E2E',
    '#5887FF',
    '#FE842D',
    '#5F657B',
    '#29CCA3',
    '#FFB608',
    '#7700FF',
    '#1D2533'
];

function isTransparentBannerColor(color) {
    return !color || String(color).trim().toLowerCase() === 'transparent';
}

let _bannerColorDialogEl = null;
let _bannerColorDialogKeyHandler = null;
let _bannerColorDialogApply = null;
const BANNER_CUSTOM_COLORS_STORAGE_KEY = 'banner_custom_colors_v1';

function closeBannerColorDialog() {
    if (_bannerColorDialogEl) {
        _bannerColorDialogEl.style.display = 'none';
    }
    if (_bannerColorDialogKeyHandler) {
        document.removeEventListener('keydown', _bannerColorDialogKeyHandler);
        _bannerColorDialogKeyHandler = null;
    }
    _bannerColorDialogApply = null;
}

function ensureBannerColorDialogElements() {
    const modal = document.getElementById('banner-color-modal');
    if (!modal) {
        throw new Error('banner-color-modal not found');
    }

    if (!modal.dataset.bound) {
        const overlay = modal.querySelector('.modal-overlay');
        const closeBtn = document.getElementById('banner-color-modal-close');
        const cancelBtn = document.getElementById('banner-color-modal-cancel');
        const okBtn = document.getElementById('banner-color-modal-ok');

        overlay?.addEventListener('click', closeBannerColorDialog);
        closeBtn?.addEventListener('click', closeBannerColorDialog);
        cancelBtn?.addEventListener('click', closeBannerColorDialog);
        okBtn?.addEventListener('click', () => {
            if (typeof _bannerColorDialogApply === 'function') {
                _bannerColorDialogApply();
            }
            closeBannerColorDialog();
        });

        modal.dataset.bound = 'true';
    }

    return {
        modal,
        titleEl: document.getElementById('banner-color-modal-title'),
        bodyEl: document.getElementById('banner-color-modal-body')
    };
}

function loadBannerCustomColors() {
    try {
        const raw = localStorage.getItem(BANNER_CUSTOM_COLORS_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .map((color) => {
                if (typeof color !== 'string') return null;
                if (/^transparent$/i.test(color)) return 'transparent';
                try {
                    return ensureHex(color);
                } catch {
                    return null;
                }
            })
            .filter(Boolean)
            .slice(0, 16);
    } catch {
        return [];
    }
}

function saveBannerCustomColors(colors) {
    try {
        localStorage.setItem(BANNER_CUSTOM_COLORS_STORAGE_KEY, JSON.stringify(colors.slice(0, 16)));
    } catch {
        // ignore storage errors
    }
}

function pushBannerCustomColor(color) {
    const normalized = isTransparentBannerColor(color) ? 'transparent' : ensureHex(color);
    const current = loadBannerCustomColors().filter((item) => item !== normalized);
    const next = [normalized, ...current].slice(0, 16);
    saveBannerCustomColors(next);
    return next;
}

function openBannerColorDialog(options) {
    if (typeof jslog === 'function') {
        jslog('log', '[BANNER_COLOR] openBannerColorDialog start');
    }
    const {
        title = 'Выбор цвета',
        currentColor = '#FFFFFF',
        allowTransparent = true,
        onApply = null
    } = options || {};

    closeBannerColorDialog();
    const { modal, titleEl, bodyEl } = ensureBannerColorDialogElements();

    let draftColor = isTransparentBannerColor(currentColor) ? 'transparent' : ensureHex(currentColor);
    let customColors = loadBannerCustomColors();
    titleEl.textContent = title;
    bodyEl.innerHTML = '';

    const body = document.createElement('div');
    body.className = 'banner-color-dialog__body';

    const left = document.createElement('div');
    left.className = 'banner-color-dialog__left';

    const basicTitle = document.createElement('div');
    basicTitle.className = 'banner-color-dialog__label';
    basicTitle.textContent = 'Базовые';
    left.appendChild(basicTitle);

    const palette = document.createElement('div');
    palette.className = 'banner-color-dialog__palette';

    const swatchButtons = [];
    const makeSwatch = (color, extraClass = '', label = color) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `banner-color-dialog__swatch ${extraClass}`.trim();
        btn.title = label;
        btn.setAttribute('aria-label', label);
        if (!isTransparentBannerColor(color)) {
            btn.style.background = color;
        } else {
            btn.innerHTML = '<span class="banner-color-dialog__none-line"></span>';
        }
        btn.addEventListener('click', () => {
            draftColor = color;
            syncDraftUi();
        });
        swatchButtons.push({ btn, color });
        return btn;
    };

    if (allowTransparent) {
        palette.appendChild(makeSwatch('transparent', 'banner-color-dialog__swatch--none', 'Без цвета'));
    }
    BANNER_BASE_PALETTE.forEach((color) => {
        palette.appendChild(makeSwatch(color, '', color));
    });
    left.appendChild(palette);

    const customTitle = document.createElement('div');
    customTitle.className = 'banner-color-dialog__label banner-color-dialog__label--spaced';
    customTitle.textContent = 'Свои цвета';
    left.appendChild(customTitle);

    const customPalette = document.createElement('div');
    customPalette.className = 'banner-color-dialog__palette banner-color-dialog__palette--custom';
    left.appendChild(customPalette);

    const right = document.createElement('div');
    right.className = 'banner-color-dialog__right';

    const preview = document.createElement('div');
    preview.className = 'banner-color-dialog__preview';

    const previewSwatch = document.createElement('div');
    previewSwatch.className = 'banner-color-dialog__preview-swatch';
    preview.appendChild(previewSwatch);

    right.appendChild(preview);

    body.appendChild(left);
    body.appendChild(right);

    // Bottom row: "Добавить" | "Код:" | hex input | palette trigger — full width
    const pickerInput = document.createElement('input');
    pickerInput.type = 'color';
    pickerInput.value = isTransparentBannerColor(draftColor) ? '#FFFFFF' : draftColor;
    pickerInput.className = 'banner-color-dialog__picker-input';
    pickerInput.addEventListener('input', (e) => {
        draftColor = ensureHex(e.target.value);
        syncDraftUi();
    });

    const pickerTrigger = document.createElement('button');
    pickerTrigger.type = 'button';
    pickerTrigger.className = 'banner-color-dialog__picker-trigger';
    pickerTrigger.title = 'Открыть палитру';
    pickerTrigger.setAttribute('aria-label', 'Открыть палитру');
    pickerTrigger.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 22a1 1 0 0 1 0-20a10 9 0 0 1 10 9a5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z"/>
            <circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/>
            <circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/>
            <circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/>
            <circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/>
        </svg>`;
    pickerTrigger.addEventListener('click', () => pickerInput.click());

    const hexInput = document.createElement('input');
    hexInput.type = 'text';
    hexInput.className = 'banner-color-dialog__hex-input';
    hexInput.maxLength = 12;
    hexInput.addEventListener('change', () => {
        const raw = hexInput.value.trim();
        if (!raw) { syncDraftUi(); return; }
        draftColor = /^transparent$/i.test(raw) ? 'transparent' : ensureHex(raw);
        syncDraftUi();
    });

    const addCustomBtn = document.createElement('button');
    addCustomBtn.type = 'button';
    addCustomBtn.className = 'banner-color-dialog__utility';
    addCustomBtn.textContent = 'Добавить';
    addCustomBtn.addEventListener('click', () => {
        customColors = pushBannerCustomColor(draftColor);
        renderCustomColors();
        syncDraftUi();
    });

    const hexLabel = document.createElement('span');
    hexLabel.className = 'banner-color-dialog__hex-label';
    hexLabel.textContent = 'Код:';

    const hexControls = document.createElement('div');
    hexControls.className = 'banner-color-dialog__hex-controls';
    hexControls.appendChild(pickerInput);
    hexControls.appendChild(hexLabel);
    hexControls.appendChild(hexInput);
    hexControls.appendChild(pickerTrigger);

    const bottomRow = document.createElement('div');
    bottomRow.className = 'banner-color-dialog__bottom-row';
    bottomRow.appendChild(addCustomBtn);
    bottomRow.appendChild(hexControls);

    body.appendChild(bottomRow);
    bodyEl.appendChild(body);

    const syncDraftUi = () => {
        previewSwatch.style.background = isTransparentBannerColor(draftColor)
            ? 'linear-gradient(45deg, rgba(255,255,255,0.08) 25%, transparent 25%, transparent 50%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.08) 75%, transparent 75%, transparent), #2a2a2a'
            : draftColor;
        hexInput.value = isTransparentBannerColor(draftColor) ? 'transparent' : String(draftColor).toUpperCase();
        pickerInput.value = isTransparentBannerColor(draftColor) ? '#FFFFFF' : draftColor;
        swatchButtons.forEach(({ btn, color }) => {
            btn.classList.toggle(
                'banner-color-dialog__swatch--active',
                isTransparentBannerColor(color) ? isTransparentBannerColor(draftColor) : color.toUpperCase() === String(draftColor).toUpperCase()
            );
        });
        renderCustomColors();
    };

    const renderCustomColors = () => {
        customPalette.innerHTML = '';
        const colorsToRender = [...customColors];
        while (colorsToRender.length < 15) colorsToRender.push(null);

        colorsToRender.forEach((color) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'banner-color-dialog__swatch banner-color-dialog__swatch--custom';
            if (!color) {
                btn.disabled = true;
                btn.classList.add('banner-color-dialog__swatch--empty');
                btn.style.cursor = 'default';
                btn.style.borderStyle = 'dashed';
                btn.style.background = 'var(--bg-secondary)';
            } else if (isTransparentBannerColor(color)) {
                btn.classList.add('banner-color-dialog__swatch--none');
                if (isTransparentBannerColor(draftColor)) {
                    btn.classList.add('banner-color-dialog__swatch--active');
                }
                btn.innerHTML = '<span class="banner-color-dialog__none-line"></span>';
                btn.title = 'Без цвета';
                btn.setAttribute('aria-label', 'Без цвета');
                btn.addEventListener('click', () => {
                    draftColor = 'transparent';
                    syncDraftUi();
                });
            } else {
                btn.style.background = color;
                if (String(color).toUpperCase() === String(draftColor).toUpperCase()) {
                    btn.classList.add('banner-color-dialog__swatch--active');
                }
                btn.title = color;
                btn.setAttribute('aria-label', color);
                btn.addEventListener('click', () => {
                    draftColor = color;
                    syncDraftUi();
                });
            }
            customPalette.appendChild(btn);
        });
    };

    _bannerColorDialogApply = () => {
        if (typeof onApply === 'function') onApply(draftColor);
    };

    _bannerColorDialogKeyHandler = (e) => {
        if (_bannerColorDialogEl !== modal || modal.style.display !== 'flex') {
            return;
        }
        if (e.key === 'Escape') {
            closeBannerColorDialog();
        }
    };
    document.addEventListener('keydown', _bannerColorDialogKeyHandler);

    modal.style.display = 'flex';
    _bannerColorDialogEl = modal;
    renderCustomColors();
    syncDraftUi();
    if (typeof jslog === 'function') {
        jslog('log', '[BANNER_COLOR] openBannerColorDialog shown');
    }
}

function getBannerPaintImageMeta(target) {
    if (target === 'background') {
        return {
            imageKey: 'bgImage',
            xKey: 'bgImageX',
            yKey: 'bgImageY',
            rotateKey: 'bgImageRotate',
            scaleKey: 'bgImageScale'
        };
    }

    return {
        imageKey: 'leftBlockImage',
        xKey: 'leftBlockImageX',
        yKey: 'leftBlockImageY',
        rotateKey: 'leftBlockImageRotate',
        scaleKey: 'leftBlockImageScale'
    };
}

function getBannerPaintMode(settings, target) {
    if (Boolean(getBannerGradientSettingValue(settings, target, 'gradientEnabled'))) {
        return 'gradient';
    }
    const imageMeta = getBannerPaintImageMeta(target);
    if (settings?.[imageMeta.imageKey]) {
        return 'image';
    }
    return 'solid';
}

function clearBannerPaintImage(blockId, target) {
    const block = AppState.findBlockById(blockId);
    if (!block) return;
    const imageMeta = getBannerPaintImageMeta(target);
    block.settings[imageMeta.imageKey] = '';
}

function createBannerPaintAdjustField(label, value, min, max, onApply, unit = '') {
    const field = document.createElement('div');
    field.className = 'banner-paint-row__adjust-field';

    const title = document.createElement('label');
    title.className = 'banner-paint-row__adjust-label';
    title.textContent = label;

    const control = document.createElement('div');
    control.className = 'banner-paint-row__adjust-control';

    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'banner-paint-row__adjust-input';
    input.value = Number(value ?? 0);
    input.min = min;
    input.max = max;
    input.step = 1;

    if (unit) {
        const suffix = document.createElement('span');
        suffix.className = 'banner-paint-row__adjust-unit';
        suffix.textContent = unit;
        control.appendChild(input);
        control.appendChild(suffix);
    } else {
        control.appendChild(input);
    }

    const applyValue = (nextValue) => {
        const clamped = Math.max(min, Math.min(max, Math.round(Number(nextValue) || 0)));
        input.value = clamped;
        onApply(clamped);
    };

    input.addEventListener('input', () => applyValue(input.value));
    attachDragScrubToNumberControl(control, input, {
        min,
        max,
        onApply: applyValue
    });

    field.appendChild(title);
    field.appendChild(control);
    return field;
}

function createBannerPaintControl(block, target, label, mode) {
    const s = block.settings || {};
    const meta = getBannerGradientMeta(target);
    const solidColor = getBannerGradientBaseColor(s, target);
    const paintMode = getBannerPaintMode(s, target);
    const gradientEnabled = paintMode === 'gradient';
    const imageMeta = getBannerPaintImageMeta(target);
    const imageValue = s[imageMeta.imageKey] || '';
    const isRoundedMode = mode === 'rounded';
    const isMaskMode = mode === 'mask';
    const isDisabled = target === 'leftBlock' && isRoundedMode;

    let statusText = '';
    let statusKind = 'secondary';
    let hintText = '';

    if (target === 'background' && isRoundedMode) {
        statusText = 'Основная';
        statusKind = 'primary';
        hintText = 'Заполняет весь баннер.';
    } else if (target === 'background' && isMaskMode) {
        statusText = 'Фон';
        statusKind = 'secondary';
        hintText = 'Видна справа и за левым блоком.';
    } else if (target === 'leftBlock' && isMaskMode) {
        statusText = 'Основная';
        statusKind = 'primary';
        hintText = 'Заполняет левую форму.';
    } else {
        statusText = 'Не используется';
        statusKind = 'disabled';
        hintText = 'В режиме "Прямоугольник" левый блок не отображается.';
    }

    const row = document.createElement('div');
    row.className = `banner-paint-row banner-paint-row--${statusKind}`;

    const topRow = document.createElement('div');
    topRow.className = 'banner-paint-row__head';

    const title = document.createElement('div');
    title.className = 'banner-paint-row__title';
    title.textContent = label;

    const modeBadge = document.createElement('span');
    modeBadge.className = `banner-paint-row__mode${gradientEnabled ? ' banner-paint-row__mode--gradient' : ''}`;
    modeBadge.textContent = paintMode === 'image' ? 'Image' : gradientEnabled ? 'Gradient' : 'Solid';

    const statusBadge = document.createElement('span');
    statusBadge.className = `banner-paint-row__status banner-paint-row__status--${statusKind}`;
    statusBadge.textContent = statusText;

    const titleWrap = document.createElement('div');
    titleWrap.className = 'banner-paint-row__title-wrap';
    titleWrap.appendChild(title);
    titleWrap.appendChild(statusBadge);

    topRow.appendChild(titleWrap);
    topRow.appendChild(modeBadge);
    row.appendChild(topRow);

    const hint = document.createElement('div');
    hint.className = 'banner-paint-row__hint';
    hint.textContent = hintText;
    row.appendChild(hint);

    const controls = document.createElement('div');
    controls.className = 'banner-paint-row__toolbar';

    const solidBtn = document.createElement('button');
    solidBtn.type = 'button';
    solidBtn.className = `banner-paint-row__tool banner-paint-row__solid${paintMode === 'solid' ? ' banner-paint-row__tool--active' : ''}`;
    solidBtn.title = 'Сплошная заливка';
    solidBtn.setAttribute('aria-label', 'Сплошная заливка');
    solidBtn.style.background = isTransparentBannerColor(solidColor)
        ? 'linear-gradient(45deg, rgba(255,255,255,0.1) 25%, transparent 25%, transparent 50%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.1) 75%, transparent 75%, transparent), #2a2a2a'
        : solidColor;
    solidBtn.disabled = isDisabled;
    // No icon — the button background is the color swatch itself.
    let lastSolidOpenAt = 0;
    const openSolidColorDialog = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (isDisabled) return;
        const now = Date.now();
        if (now - lastSolidOpenAt < 150) return;
        lastSolidOpenAt = now;
        if (typeof jslog === 'function') {
            jslog('log', `[BANNER_COLOR] solid control fired for ${target}`);
        }
        if (typeof closeGradientPopup === 'function') {
            closeGradientPopup();
        }
        requestAnimationFrame(() => {
            try {
                openBannerColorDialog({
                    title: `Цвет: ${label}`,
                    currentColor: solidColor,
                    allowTransparent: true,
                    onApply: (nextColor) => {
                        const blockToUpdate = AppState.findBlockById(block.id);
                        if (!blockToUpdate) return;

                        // Batch all updates before triggering async render.
                        // This prevents multiple render calls that could race each other.

                        // 1. Clear paint image
                        const imageMeta = getBannerPaintImageMeta(target);
                        blockToUpdate.settings[imageMeta.imageKey] = '';

                        // 2. Disable gradient
                        const gradientKey = getBannerGradientKey(target, 'enabled');
                        blockToUpdate.settings[gradientKey] = false;

                        // 3. Set new color (wraps gradient check)
                        blockToUpdate.settings[meta.colorKey] = nextColor;

                        // 4. Now trigger single async render with all changes applied
                        if (blockToUpdate.type === 'banner' && BANNER_KEYS.includes(meta.colorKey)) {
                            renderBannerToDataUrl(blockToUpdate, (dataUrl) => {
                                blockToUpdate.settings.renderedBanner = dataUrl || null;
                                renderCanvas();
                                renderSettings();
                            });
                        } else {
                            renderSettings();
                        }
                    }
                });
            } catch (error) {
                if (typeof jslog === 'function') {
                    jslog('error', `[BANNER_COLOR] dialog failed: ${error?.message || error}`);
                }
                // Custom dialog failed — nothing to fall back to.
            }
        });
    };
    solidBtn.onclick = openSolidColorDialog;
    solidBtn.addEventListener('pointerup', openSolidColorDialog);

    const imageBtn = document.createElement('button');
    imageBtn.type = 'button';
    imageBtn.className = `banner-paint-row__tool banner-paint-row__tool--image${paintMode === 'image' ? ' banner-paint-row__tool--active' : ''}`;
    imageBtn.title = 'Картинка';
    imageBtn.setAttribute('aria-label', 'Картинка');
    imageBtn.disabled = isDisabled;
    imageBtn.innerHTML = '<i data-lucide="image"></i>';

    const imageInput = document.createElement('input');
    imageInput.type = 'file';
    imageInput.accept = 'image/*';
    imageInput.className = 'banner-paint-row__file-input';
    imageInput.disabled = isDisabled;
    imageInput.addEventListener('change', (event) => {
        const file = event.target.files?.[0];
        if (!file || !file.type.startsWith('image/')) {
            event.target.value = '';
            return;
        }
        const reader = new FileReader();
        reader.onload = (loadEvent) => {
            const blockToUpdate = AppState.findBlockById(block.id);
            if (!blockToUpdate) return;

            // Batch all updates before triggering async render
            // to prevent multiple render calls that could race each other.

            // 1. Disable gradient
            const gradientKey = getBannerGradientKey(target, 'enabled');
            blockToUpdate.settings[gradientKey] = false;

            // 2. Set image
            blockToUpdate.settings[imageMeta.imageKey] = loadEvent.target.result;

            // 3. Trigger single async render with all changes applied
            if (blockToUpdate.type === 'banner' && BANNER_KEYS.includes(imageMeta.imageKey)) {
                renderBannerToDataUrl(blockToUpdate, (dataUrl) => {
                    blockToUpdate.settings.renderedBanner = dataUrl || null;
                    renderCanvas();
                    renderSettings();
                });
            } else {
                renderSettings();
            }

            event.target.value = '';
        };
        reader.readAsDataURL(file);
    });
    imageBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (isDisabled) return;
        imageInput.click();
    });

    const gradientBtn = document.createElement('button');
    gradientBtn.type = 'button';
    gradientBtn.className = `banner-paint-row__tool banner-gradient-toggle${gradientEnabled ? ' banner-paint-row__tool--active banner-gradient-toggle--active' : ''}`;
    gradientBtn.title = 'Градиент';
    gradientBtn.setAttribute('aria-label', 'Градиент');
    gradientBtn.dataset.bannerGradientBtn = `${block.id}-${target}`;
    gradientBtn.disabled = isDisabled;
    gradientBtn.innerHTML = `
        <span class="banner-gradient-toggle__icon" aria-hidden="true">
            <span class="banner-gradient-toggle__icon-fill"></span>
        </span>
    `;
    gradientBtn.addEventListener('click', () => {
        if (isDisabled) return;
        clearBannerPaintImage(block.id, target);
        openGradientPopup(block, gradientBtn, target);
    });

    controls.appendChild(solidBtn);
    controls.appendChild(imageBtn);
    controls.appendChild(imageInput);
    controls.appendChild(gradientBtn);
    row.appendChild(controls);

    if (paintMode === 'image' && !isDisabled) {
        const imageSettings = document.createElement('div');
        imageSettings.className = 'banner-paint-row__image-settings';

        const updateImageSetting = (key, value) => {
            updateBlockSetting(block.id, key, value);
        };

        imageSettings.appendChild(
            createBannerPaintAdjustField('Масштаб', s[imageMeta.scaleKey] ?? 100, 10, 300, (value) => updateImageSetting(imageMeta.scaleKey, value), '%')
        );
        imageSettings.appendChild(
            createBannerPaintAdjustField('X', s[imageMeta.xKey] ?? 0, -300, 300, (value) => updateImageSetting(imageMeta.xKey, value))
        );
        imageSettings.appendChild(
            createBannerPaintAdjustField('Y', s[imageMeta.yKey] ?? 0, -300, 300, (value) => updateImageSetting(imageMeta.yKey, value))
        );
        imageSettings.appendChild(
            createBannerPaintAdjustField('Угол', s[imageMeta.rotateKey] ?? 0, -180, 180, (value) => updateImageSetting(imageMeta.rotateKey, value), '°')
        );

        row.appendChild(imageSettings);
    }

    if (paintMode === 'gradient' && !isDisabled) {
        const previewBtn = document.createElement('button');
        previewBtn.type = 'button';
        previewBtn.className = 'banner-gradient-preview banner-gradient-preview--active';
        previewBtn.title = 'Редактировать градиент';
        previewBtn.setAttribute('aria-label', 'Редактировать градиент');
        previewBtn.innerHTML = '<span class="banner-gradient-preview__rail"></span>';
        const previewGradient = buildGradientPreviewCss(block.settings, target);
        previewBtn.style.backgroundImage = previewGradient;
        previewBtn.style.backgroundOrigin = 'content-box';
        previewBtn.style.backgroundClip = 'content-box';
        previewBtn.addEventListener('click', () => {
            openGradientPopup(block, previewBtn, target);
        });
        row.appendChild(previewBtn);
    }

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        requestAnimationFrame(() => window.lucide.createIcons());
    }

    return row;
}

window.openBannerColorDialog = openBannerColorDialog;
