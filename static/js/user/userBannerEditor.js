// userBannerEditor.js - Редактор баннера для user-версии

let currentBannerBlock = null;
let bannerEditorState = {};
let showAdvancedBannerControls = false;

/**
 * Открыть редактор баннера
 */
function openBannerEditor(blockId) {
    const block = findBlockDeep(UserAppState.blocks, blockId);
    if (!block || block.type !== 'banner') return;

    currentBannerBlock = block;
    bannerEditorState = JSON.parse(JSON.stringify(block.settings || {}));

    // Нормализуем флаг скрытия для каждого текстового элемента
    if (Array.isArray(bannerEditorState.textElements)) {
        bannerEditorState.textElements = bannerEditorState.textElements.map(textEl => ({
            ...textEl,
            hidden: !!textEl.hidden
        }));
    }

    const modal = document.getElementById('banner-editor-modal');
    if (!modal) return;

    modal.style.display = 'flex';

    initBannerTabs();
    loadBannerTexts();
    loadBannerLogos();
    loadBannerImages();
    loadBannerColors();
    updateBannerPreview();
}

/**
 * Закрыть редактор баннера
 */
function closeBannerEditor() {
    const modal = document.getElementById('banner-editor-modal');
    if (modal) modal.style.display = 'none';
    currentBannerBlock = null;
    bannerEditorState = {};
}

/**
 * Инициализация вкладок
 */
function initBannerTabs() {
    const tabs = document.querySelectorAll('.banner-tab');
    const panes = document.querySelectorAll('.banner-tab-pane');

    tabs.forEach(tab => {
        tab.onclick = () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            panes.forEach(p => p.style.display = 'none');
            const pane = document.getElementById(`banner-tab-${tab.dataset.tab}`);
            if (pane) pane.style.display = 'flex';
        };
    });
}

/**
 * Компонент drag-scrub input (как в админке)
 * label — текст метки (тащится мышью для изменения значения)
 * value — начальное значение
 * min/max — ограничения
 * onChange(value) — колбэк при изменении
 */
function createScrubInput({ label, value, min = -200, max = 200, onChange }) {
    const container = document.createElement('div');
    container.style.cssText = `
        display: grid;
        grid-template-columns: 28px 1fr;
        gap: 8px;
        align-items: center;
        margin-top: 8px;
        margin-bottom: 4px;
    `;

    // Метка — за неё тащат
    const tag = document.createElement('div');
    tag.textContent = label;
    tag.style.cssText = `
        font-size: 12px;
        color: var(--text-muted);
        user-select: none;
        cursor: ew-resize;
        text-align: center;
        font-weight: 500;
    `;

    // Поле ввода
    const field = document.createElement('div');
    field.style.cssText = `
        display: flex;
        align-items: center;
        background: var(--bg-input);
        border: 1px solid var(--border-secondary);
        border-radius: 8px;
        padding: 8px 12px;
        gap: 4px;
    `;

    const input = document.createElement('input');
    input.type = 'number';
    input.value = Math.round(value);
    input.min = min;
    input.max = max;
    input.style.cssText = `
        width: 100%;
        border: 0;
        outline: none;
        background: transparent;
        color: var(--text-secondary);
        font-weight: 500;
        font-size: 13px;
        -moz-appearance: textfield;
    `;

    const suffix = document.createElement('span');
    suffix.textContent = 'px';
    suffix.style.cssText = `font-size: 11px; color: var(--text-muted); user-select: none;`;

    field.appendChild(input);
    field.appendChild(suffix);

    const applyValue = (newVal) => {
        const clamped = Math.max(min, Math.min(max, Math.round(newVal)));
        input.value = clamped;
        if (onChange) onChange(clamped);
    };

    input.addEventListener('input', () => applyValue(Number(input.value) || 0));

    input.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        e.preventDefault();
        const step = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
        const dir = e.key === 'ArrowUp' ? 1 : -1;
        applyValue((Number(input.value) || 0) + dir * step);
    });

    // Drag-scrub
    let dragging = false, startX = 0, startVal = 0;

    tag.addEventListener('pointerdown', (e) => {
        dragging = true;
        tag.setPointerCapture(e.pointerId);
        startX = e.clientX;
        startVal = Number(input.value) || 0;
        tag.style.color = 'var(--accent-secondary)';
    });

    tag.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        const speed = e.shiftKey ? 2 : e.altKey ? 0.1 : 0.5;
        applyValue(startVal + (e.clientX - startX) * speed);
    });

    tag.addEventListener('pointerup', () => { dragging = false; tag.style.color = 'var(--text-muted)'; });
    tag.addEventListener('pointercancel', () => { dragging = false; tag.style.color = 'var(--text-muted)'; });

    container.appendChild(tag);
    container.appendChild(field);
    return container;
}

/**
 * Загрузка текстовых элементов
 */
function loadBannerTexts() {
    const container = document.getElementById('banner-text-elements-list');
    if (!container) return;

    const textElements = bannerEditorState.textElements || [];
    container.innerHTML = '';

    if (textElements.length === 0) {
        container.innerHTML = '<div class="empty-state-small"><p>Нет текстовых элементов</p></div>';
        return;
    }

    textElements.forEach((textEl, index) => {
        const item = document.createElement('div');
        item.className = 'banner-text-item';

        item.innerHTML = `
            <div class="banner-text-item-header">
                <span class="banner-text-item-label">Текст ${index + 1}</span>
            </div>
            <textarea
                data-index="${index}"
                placeholder="Введите текст..."
                rows="2">${escapeHtml(textEl.text || '')}</textarea>
        `;

        // Текст
        const textarea = item.querySelector('textarea');
        textarea.addEventListener('input', (e) => {
            bannerEditorState.textElements[index].text = e.target.value;
            updateBannerPreview();
        });
        textarea.addEventListener('input', autoResizeTextarea);
        autoResizeTextarea.call(textarea);

        // Строка: Y scrub + toggle "Скрыть" — всё в одну линию
        const controlRow = document.createElement('div');
        controlRow.style.cssText = `
            display: flex;
            align-items: center;
            gap: 12px;
            margin-top: 8px;
        `;

        // Drag-scrub Y (показывается только после Ctrl+K)
        if (showAdvancedBannerControls) {
            const yInput = createScrubInput({
                label: 'Y',
                value: textEl.offsetY ?? 0,
                min: -200,
                max: 200,
                onChange: (val) => {
                    bannerEditorState.textElements[index].offsetY = val;
                    updateBannerPreview();
                }
            });

            yInput.style.margin = '0';
            yInput.style.flex = '1';
            controlRow.appendChild(yInput);
        }

        // Toggle "Скрыть"
        const toggleLabel = document.createElement('label');
        toggleLabel.style.cssText = `
            display: flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
            white-space: nowrap;
            flex-shrink: 0;
        `;
        const isHidden = !!(textEl.hidden);
        toggleLabel.innerHTML = `
            <span style="font-size:12px; color:var(--text-muted);">Скрыть</span>
            <div class="banner-toggle-switch ${isHidden ? 'active' : ''}" style="
                width: 36px;
                height: 20px;
                border-radius: 10px;
                background: ${isHidden ? 'var(--accent-primary)' : 'var(--border-tertiary)'};
                position: relative;
                transition: background 0.2s;
                flex-shrink: 0;
            ">
                <div style="
                    position: absolute;
                    top: 3px;
                    left: ${isHidden ? '18px' : '3px'};
                    width: 14px;
                    height: 14px;
                    border-radius: 50%;
                    background: #fff;
                    transition: left 0.2s;
                "></div>
            </div>
        `;

        const toggleSwitch = toggleLabel.querySelector('.banner-toggle-switch');
        toggleLabel.addEventListener('click', () => {
            const newHidden = !bannerEditorState.textElements[index].hidden;
            bannerEditorState.textElements[index].hidden = newHidden;

            toggleSwitch.style.background = newHidden ? 'var(--accent-primary)' : 'var(--border-tertiary)';
            toggleSwitch.querySelector('div').style.left = newHidden ? '18px' : '3px';
            toggleSwitch.classList.toggle('active', newHidden);

            updateBannerPreview();
        });

        controlRow.appendChild(toggleLabel);
        item.appendChild(controlRow);

        container.appendChild(item);
    });
}

function initBannerEditorHotkeys() {
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.code === 'KeyK') {
            e.preventDefault();

            showAdvancedBannerControls = !showAdvancedBannerControls;

            // Если редактор открыт — перерисовать список
            if (currentBannerBlock) {
                loadBannerTexts();
            }
        }
    });
}

/**
 * Автоматическая высота textarea
 */
function autoResizeTextarea() {
    this.style.height = 'auto';
    this.style.height = Math.max(60, this.scrollHeight) + 'px';
}

/**
 * Загрузка логотипов
 */
function loadBannerLogos() {
    const grid = document.getElementById('banner-logo-grid');
    if (!grid) return;

    grid.innerHTML = '';

    const logos = window.BANNER_LOGOS || [];
    const currentLogo = bannerEditorState.logo || bannerEditorState.logoCustom;

    logos.forEach(logo => {
        const option = document.createElement('div');
        option.className = 'banner-logo-option' + (currentLogo === logo.src ? ' selected' : '');
        option.innerHTML = `<img src="${TextSanitizer.escapeHTML(logo.src)}" alt="${TextSanitizer.escapeHTML(logo.label || 'Логотип')}">`;
        option.addEventListener('click', () => {
            grid.querySelectorAll('.banner-logo-option').forEach(o => o.classList.remove('selected'));
            option.classList.add('selected');
            bannerEditorState.logo = logo.src;
            bannerEditorState.logoCustom = null;
            updateBannerPreview();
        });
        grid.appendChild(option);
    });

    const uploadBtn = document.getElementById('btn-upload-banner-logo');
    const uploadInput = document.getElementById('banner-logo-input');
    if (uploadBtn && uploadInput) {
        uploadBtn.onclick = () => uploadInput.click();
        uploadInput.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                bannerEditorState.logoCustom = ev.target.result;
                bannerEditorState.logo = null;
                grid.querySelectorAll('.banner-logo-option').forEach(o => o.classList.remove('selected'));
                updateBannerPreview();
            };
            reader.readAsDataURL(file);
        };
    }

    const scaleSlider = document.getElementById('banner-logo-scale');
    const scaleValue = document.getElementById('banner-logo-scale-value');
    if (scaleSlider && scaleValue) {
        scaleSlider.value = bannerEditorState.logoScale || 100;
        scaleValue.textContent = (bannerEditorState.logoScale || 100) + '%';
        scaleSlider.oninput = () => {
            bannerEditorState.logoScale = parseInt(scaleSlider.value);
            scaleValue.textContent = scaleSlider.value + '%';
            updateBannerPreview();
        };
    }
}

/**
 * Загрузка картинок
 */
function loadBannerImages() {
    const grid = document.getElementById('banner-image-grid');
    if (!grid) return;

    grid.innerHTML = '';

    const images = window.BANNER_BACKGROUNDS || [];
    const currentImage = bannerEditorState.rightImage || bannerEditorState.rightImageCustom;

    images.forEach(img => {
        const option = document.createElement('div');
        option.className = 'banner-image-option' + (currentImage === img.src ? ' selected' : '');
        option.innerHTML = `<img src="${TextSanitizer.escapeHTML(img.src)}" alt="${TextSanitizer.escapeHTML(img.label || 'Картинка')}">`;
        option.addEventListener('click', () => {
            grid.querySelectorAll('.banner-image-option').forEach(o => o.classList.remove('selected'));
            option.classList.add('selected');
            bannerEditorState.rightImage = img.src;
            bannerEditorState.rightImageCustom = null;
            updateBannerPreview();
        });
        grid.appendChild(option);
    });

    const uploadBtn = document.getElementById('btn-upload-banner-image');
    const uploadInput = document.getElementById('banner-image-input');
    if (uploadBtn && uploadInput) {
        uploadBtn.onclick = () => uploadInput.click();
        uploadInput.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                bannerEditorState.rightImageCustom = ev.target.result;
                bannerEditorState.rightImage = null;
                grid.querySelectorAll('.banner-image-option').forEach(o => o.classList.remove('selected'));
                updateBannerPreview();
            };
            reader.readAsDataURL(file);
        };
    }

    setupImageSlider('banner-image-scale', 'banner-image-scale-value', 'rightImageScale', '%', 100);
    setupImageSlider('banner-image-x', 'banner-image-x-value', 'rightImageX', '', 0);
    setupImageSlider('banner-image-y', 'banner-image-y-value', 'rightImageY', '', 0);
}

/**
 * Настройка слайдера для картинки
 */
function setupImageSlider(sliderId, valueId, settingKey, suffix, defaultValue) {
    const slider = document.getElementById(sliderId);
    const valueEl = document.getElementById(valueId);
    if (slider && valueEl) {
        slider.value = bannerEditorState[settingKey] ?? defaultValue;
        valueEl.textContent = slider.value + suffix;
        slider.oninput = () => {
            bannerEditorState[settingKey] = parseInt(slider.value);
            valueEl.textContent = slider.value + suffix;
            updateBannerPreview();
        };
    }
}

/**
 * Загрузка цветов
 */
function loadBannerColors() {
    const bgColor = document.getElementById('banner-bg-color');
    const bgColorHex = document.getElementById('banner-bg-color-hex');
    if (bgColor && bgColorHex) {
        bindColorTrigger({
            trigger: bgColor,
            valueNode: bgColorHex,
            title: 'Цвет фона',
            currentColor: bannerEditorState.backgroundColor || '#7700FF',
            allowTransparent: false,
            onApply: (chosenColor) => {
                bannerEditorState.backgroundColor = chosenColor;
                updateColorPaletteSelection();
                updateBannerPreview();
            }
        });
    }

    const leftColor = document.getElementById('banner-left-color');
    const leftColorHex = document.getElementById('banner-left-color-hex');
    if (leftColor && leftColorHex) {
        bindColorTrigger({
            trigger: leftColor,
            valueNode: leftColorHex,
            title: 'Цвет левого блока',
            currentColor: bannerEditorState.leftBlockColor || '#1D2533',
            allowTransparent: false,
            onApply: (chosenColor) => {
                bannerEditorState.leftBlockColor = chosenColor;
                updateBannerPreview();
            }
        });
    }

    const palette = document.getElementById('banner-color-palette');
    if (palette) {
        palette.querySelectorAll('.color-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const color = btn.dataset.color;
                if (bgColor) {
                    applyColorTriggerValue(bgColor, color);
                }
                if (bgColorHex) {
                    bgColorHex.textContent = formatColorValue(color);
                }
                bannerEditorState.backgroundColor = color;
                updateColorPaletteSelection();
                updateBannerPreview();
            });
        });
        updateColorPaletteSelection();
    }
}

/**
 * Обновить выделение в палитре цветов
 */
function updateColorPaletteSelection() {
    const palette = document.getElementById('banner-color-palette');
    if (!palette) return;
    const currentColor = (bannerEditorState.backgroundColor || '#7700FF').toUpperCase();
    palette.querySelectorAll('.color-btn').forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.color.toUpperCase() === currentColor);
    });
}

/**
 * Подготовить настройки для рендера.
 * Скрытые текстовые элементы убираются из массива.
 */
function getBannerRenderSettings() {
    const settings = { ...bannerEditorState };
    if (Array.isArray(settings.textElements)) {
        settings.textElements = settings.textElements
            .filter(textEl => !textEl.hidden)
            .map(textEl => ({
                ...textEl,
                // Применяем offsetY к базовой координате y
                y: (textEl.y || 0) + (textEl.offsetY || 0)
            }));
    }
    return settings;
}

/**
 * Обновить превью баннера
 */
function updateBannerPreview() {
    const container = document.getElementById('banner-preview-container');
    if (!container || !currentBannerBlock) return;

    const tempBlock = {
        ...currentBannerBlock,
        settings: getBannerRenderSettings()
    };

    if (typeof renderBannerToDataUrl === 'function') {
        renderBannerToDataUrl(tempBlock, (result) => {
            const dataUrl = (typeof result === 'string') ? result : result?.dataUrl;
            if (dataUrl && dataUrl.length > 100) {
                container.innerHTML = `<img src="${dataUrl}" alt="Превью баннера" style="width:100%;height:auto;border-radius:8px;">`;
            } else {
                container.innerHTML = `<div style="color:#ef4444;padding:20px;">Ошибка рендеринга</div>`;
            }
        });
    }
}

/**
 * Применить изменения
 */
function applyBannerChanges() {
    if (!currentBannerBlock) return;

    Object.assign(currentBannerBlock.settings, bannerEditorState);

    const renderBlock = {
        ...currentBannerBlock,
        settings: getBannerRenderSettings()
    };

    if (typeof renderBannerToDataUrl === 'function') {
        renderBannerToDataUrl(renderBlock, (result) => {
            const dataUrl = (typeof result === 'string') ? result : result?.dataUrl;
            if (dataUrl) currentBannerBlock.settings.renderedBanner = dataUrl;
            UserAppState.isDirty = true;
            if (typeof renderUserCanvas === 'function') renderUserCanvas();
            closeBannerEditor();
        });
    } else {
        closeBannerEditor();
    }
}

/**
 * Escape HTML
 */
// escapeHtml — определена в shared/utils.js

/**
 * Инициализация редактора баннера
 */
function initBannerEditor() {
    const modal = document.getElementById('banner-editor-modal');
    if (!modal) return;
    modal.querySelector('.modal-overlay')?.addEventListener('click', closeBannerEditor);
    modal.querySelector('.modal-close')?.addEventListener('click', closeBannerEditor);
    document.getElementById('btn-apply-banner')?.addEventListener('click', applyBannerChanges);

    initBannerEditorHotkeys();
}

document.addEventListener('DOMContentLoaded', initBannerEditor);
