/**
 * @fileoverview Universal color picker facade.
 *
 * Wraps openBannerColorDialog (bannerSettings.js) and exposes a single
 * entry point used throughout the app instead of native <input type="color">.
 *
 * @module colorPicker
 */

const SHARED_COLOR_BASE_PALETTE = [
    '#A078FF',
    '#FF5E2E',
    '#5887FF',
    '#FE842D',
    '#5F657B',
    '#29CCA3',
    '#FFB608',
    '#7700FF',
    '#1D2533',
];

const SHARED_COLOR_STORAGE_KEY = 'banner_custom_colors_v1';

let _sharedColorDialogModal = null;
let _sharedColorDialogKeyHandler = null;
let _sharedColorDialogApply = null;

function isTransparentSharedColor(color) {
    return !color || String(color).trim().toLowerCase() === 'transparent';
}

function normalizeSharedHex(color) {
    const raw = String(color || '').trim();
    if (!raw) return '#FFFFFF';
    if (/^transparent$/i.test(raw)) return 'transparent';
    if (typeof window.ensureHex === 'function') {
        return window.ensureHex(raw);
    }
    const prefixed = raw.startsWith('#') ? raw : `#${raw}`;
    if (!/^#[0-9a-fA-F]{6}$/.test(prefixed)) {
        throw new Error(`Invalid hex color: ${raw}`);
    }
    return prefixed.toUpperCase();
}

function loadSharedCustomColors() {
    try {
        const raw = localStorage.getItem(SHARED_COLOR_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .map((color) => {
                if (typeof color !== 'string') return null;
                if (/^transparent$/i.test(color)) return 'transparent';
                try {
                    return normalizeSharedHex(color);
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

function saveSharedCustomColors(colors) {
    try {
        localStorage.setItem(SHARED_COLOR_STORAGE_KEY, JSON.stringify(colors.slice(0, 16)));
    } catch {
        // ignore storage errors
    }
}

function pushSharedCustomColor(color) {
    const normalized = isTransparentSharedColor(color) ? 'transparent' : normalizeSharedHex(color);
    const current = loadSharedCustomColors().filter((item) => item !== normalized);
    const next = [normalized, ...current].slice(0, 16);
    saveSharedCustomColors(next);
    return next;
}

function closeSharedColorDialog() {
    if (_sharedColorDialogModal) {
        _sharedColorDialogModal.style.display = 'none';
    }
    if (_sharedColorDialogKeyHandler) {
        document.removeEventListener('keydown', _sharedColorDialogKeyHandler);
        _sharedColorDialogKeyHandler = null;
    }
    _sharedColorDialogApply = null;
}

function ensureSharedColorDialogElements() {
    const modal = document.getElementById('banner-color-modal');
    if (!modal) {
        throw new Error('banner-color-modal not found');
    }

    if (!modal.dataset.sharedBound) {
        const overlay = modal.querySelector('.modal-overlay');
        const closeBtn = document.getElementById('banner-color-modal-close');
        const cancelBtn = document.getElementById('banner-color-modal-cancel');
        const okBtn = document.getElementById('banner-color-modal-ok');

        overlay?.addEventListener('click', closeSharedColorDialog);
        closeBtn?.addEventListener('click', closeSharedColorDialog);
        cancelBtn?.addEventListener('click', closeSharedColorDialog);
        okBtn?.addEventListener('click', () => {
            if (typeof _sharedColorDialogApply === 'function') {
                _sharedColorDialogApply();
            }
            closeSharedColorDialog();
        });

        modal.dataset.sharedBound = 'true';
    }

    return {
        modal,
        titleEl: document.getElementById('banner-color-modal-title'),
        bodyEl: document.getElementById('banner-color-modal-body'),
    };
}

function openColorPickerFallback(options) {
    const {
        title = 'Выбор цвета',
        currentColor = '#FFFFFF',
        allowTransparent = false,
        onApply = null,
    } = options || {};

    closeSharedColorDialog();
    const { modal, titleEl, bodyEl } = ensureSharedColorDialogElements();

    let draftColor = isTransparentSharedColor(currentColor) ? 'transparent' : normalizeSharedHex(currentColor);
    let customColors = loadSharedCustomColors();
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
        if (!isTransparentSharedColor(color)) {
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
    SHARED_COLOR_BASE_PALETTE.forEach((color) => {
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

    const pickerInput = document.createElement('input');
    pickerInput.type = 'color';
    pickerInput.value = isTransparentSharedColor(draftColor) ? '#FFFFFF' : draftColor;
    pickerInput.className = 'banner-color-dialog__picker-input';
    pickerInput.addEventListener('input', (event) => {
        draftColor = normalizeSharedHex(event.target.value);
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
        </svg>
    `;
    pickerTrigger.addEventListener('click', () => pickerInput.click());

    const hexInput = document.createElement('input');
    hexInput.type = 'text';
    hexInput.className = 'banner-color-dialog__hex-input';
    hexInput.maxLength = 12;
    hexInput.addEventListener('change', () => {
        const raw = hexInput.value.trim();
        if (!raw) {
            syncDraftUi();
            return;
        }
        draftColor = /^transparent$/i.test(raw) ? 'transparent' : normalizeSharedHex(raw);
        syncDraftUi();
    });

    const addCustomBtn = document.createElement('button');
    addCustomBtn.type = 'button';
    addCustomBtn.className = 'banner-color-dialog__utility';
    addCustomBtn.textContent = 'Добавить';
    addCustomBtn.addEventListener('click', () => {
        customColors = pushSharedCustomColor(draftColor);
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
            } else if (isTransparentSharedColor(color)) {
                btn.classList.add('banner-color-dialog__swatch--none');
                btn.innerHTML = '<span class="banner-color-dialog__none-line"></span>';
                btn.title = 'Без цвета';
                btn.setAttribute('aria-label', 'Без цвета');
                btn.addEventListener('click', () => {
                    draftColor = 'transparent';
                    syncDraftUi();
                });
            } else {
                btn.style.background = color;
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

    const syncDraftUi = () => {
        previewSwatch.style.background = isTransparentSharedColor(draftColor)
            ? 'linear-gradient(45deg, rgba(255,255,255,0.08) 25%, transparent 25%, transparent 50%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.08) 75%, transparent 75%, transparent), #2a2a2a'
            : draftColor;
        hexInput.value = isTransparentSharedColor(draftColor) ? 'transparent' : String(draftColor).toUpperCase();
        pickerInput.value = isTransparentSharedColor(draftColor) ? '#FFFFFF' : draftColor;
        swatchButtons.forEach(({ btn, color }) => {
            btn.classList.toggle(
                'banner-color-dialog__swatch--active',
                isTransparentSharedColor(color)
                    ? isTransparentSharedColor(draftColor)
                    : String(color).toUpperCase() === String(draftColor).toUpperCase()
            );
        });
        Array.from(customPalette.children).forEach((btn) => {
            const aria = btn.getAttribute('aria-label');
            const color = aria === 'Без цвета' ? 'transparent' : aria;
            btn.classList.toggle(
                'banner-color-dialog__swatch--active',
                color
                    ? (isTransparentSharedColor(color)
                        ? isTransparentSharedColor(draftColor)
                        : String(color).toUpperCase() === String(draftColor).toUpperCase())
                    : false
            );
        });
    };

    _sharedColorDialogApply = () => {
        if (typeof onApply === 'function') {
            onApply(draftColor);
        }
    };

    _sharedColorDialogKeyHandler = (event) => {
        if (_sharedColorDialogModal !== modal || modal.style.display !== 'flex') {
            return;
        }
        if (event.key === 'Escape') {
            closeSharedColorDialog();
        }
    };
    document.addEventListener('keydown', _sharedColorDialogKeyHandler);

    modal.style.display = 'flex';
    _sharedColorDialogModal = modal;
    renderCustomColors();
    syncDraftUi();
}

function pickColor(options) {
    const {
        title          = 'Выбор цвета',
        currentColor   = '#FFFFFF',
        allowTransparent = false,
        onApply        = null,
    } = options || {};

    window.openBannerColorDialog({ title, currentColor, allowTransparent, onApply });
}

function formatColorValue(color) {
    if (!color) return '';
    if (String(color).trim().toLowerCase() === 'transparent') {
        return 'Без цвета';
    }
    return String(color).toUpperCase();
}

function applyColorTriggerValue(trigger, value) {
    if (!trigger) return;
    const normalized = value || '#FFFFFF';
    trigger.dataset.colorValue = normalized;
    trigger.style.background = String(normalized).trim().toLowerCase() === 'transparent'
        ? 'linear-gradient(45deg, rgba(255,255,255,0.12) 25%, transparent 25%, transparent 50%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0.12) 75%, transparent 75%, transparent), #334155'
        : normalized;
}

function bindColorTrigger(options) {
    const {
        trigger,
        valueNode = null,
        title = 'Выбор цвета',
        currentColor = '#FFFFFF',
        allowTransparent = false,
        onApply = null,
    } = options || {};

    if (!trigger) return;

    const syncValue = (nextColor) => {
        applyColorTriggerValue(trigger, nextColor);
        if (valueNode) {
            valueNode.textContent = formatColorValue(nextColor);
        }
    };

    syncValue(currentColor);

    trigger.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        pickColor({
            title,
            currentColor: trigger.dataset.colorValue || currentColor,
            allowTransparent,
            onApply: (chosenColor) => {
                syncValue(chosenColor);
                if (typeof onApply === 'function') {
                    onApply(chosenColor);
                }
            },
        });
    };
}

window.pickColor = pickColor;
window.formatColorValue = formatColorValue;
window.applyColorTriggerValue = applyColorTriggerValue;
window.bindColorTrigger = bindColorTrigger;
window.openBannerColorDialog = window.openBannerColorDialog || openColorPickerFallback;
