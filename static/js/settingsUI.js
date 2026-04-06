// settingsUI.js - Вспомогательные функции для создания UI элементов настроек

function createSettingInput(label, value, blockId, settingKey, type = 'text', extraOptions = {}) {
    // Специальный UI для выбора цвета
    if (type === 'color') {
        const group = document.createElement('div');
        group.className = 'setting-group';

        const colorLabel = document.createElement('label');
        colorLabel.className = 'color-setting-button';

        const textSpan = document.createElement('span');
        textSpan.textContent = label;

        const colorInput = document.createElement('input');
        colorInput.type = 'color';
        colorInput.value = value || '#ffffff';
        colorInput.className = 'color-setting-input';

        colorInput.addEventListener('input', (e) => {
            updateBlockSetting(blockId, settingKey, e.target.value);

            // Если пользователь меняет цвет напрямую (не через градиент) —
            // отключаем градиент, закрываем попап если открыт
            if (extraOptions.showGradientBtn) {
                const block = AppState.findBlockById(blockId);
                if (block && block.settings.gradientEnabled) {
                    updateBlockSetting(blockId, 'gradientEnabled', false);
                    if (typeof window.closeGradientPopup === 'function') {
                        window.closeGradientPopup();
                    }
                    renderSettings();
                }
            }
        });

        colorLabel.appendChild(textSpan);

        // Кнопка загрузки фонового изображения (только для rounded режима)
        if (extraOptions.showBgImageBtn) {
            const bgImgBtn = document.createElement('button');
            bgImgBtn.type = 'button';
            bgImgBtn.className = 'color-bg-image-btn';
            bgImgBtn.title = 'Загрузить фоновое изображение';

            const hasBgImage = Boolean(extraOptions.bgImageValue);
            if (hasBgImage) bgImgBtn.classList.add('color-bg-image-btn--active');

            bgImgBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="1" y="1" width="14" height="14" rx="3" stroke="rgba(255,255,255,0.4)" stroke-width="1" fill="none"/>
  <path d="M3 12 L6 7.5 L8.5 10.5 L10.5 8 L13 12 Z" fill="rgba(255,255,255,0.5)"/>
  <circle cx="11" cy="5" r="1.8" fill="rgba(255,255,255,0.6)"/>
</svg>`;

            const bgFileInput = document.createElement('input');
            bgFileInput.type = 'file';
            bgFileInput.accept = 'image/*';
            bgFileInput.style.display = 'none';

            bgFileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                    const dataUrl = ev.target.result;
                    updateBlockSetting(blockId, 'bgImage', dataUrl);
                    bgImgBtn.classList.add('color-bg-image-btn--active');
                    renderSettings();
                };
                reader.readAsDataURL(file);
            });

            bgImgBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                // Если уже есть картинка — правый клик сбрасывает, левый открывает выбор
                bgFileInput.click();
            });

            bgImgBtn.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                updateBlockSetting(blockId, 'bgImage', '');
                bgImgBtn.classList.remove('color-bg-image-btn--active');
                renderSettings();
            });

            colorLabel.appendChild(bgImgBtn);
            colorLabel.appendChild(bgFileInput);
        }

        // Кнопка градиента (только если передан флаг showGradientBtn)
        if (extraOptions.showGradientBtn) {
            const gradBtn = document.createElement('button');
            gradBtn.type = 'button';
            gradBtn.className = 'color-gradient-btn';
            gradBtn.title = 'Настроить градиент';

            const isActive = extraOptions.gradientEnabled;
            if (isActive) gradBtn.classList.add('color-gradient-btn--active');

            // SVG иконка градиента (как в Figma)
            gradBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="gi_${settingKey}" x1="0" y1="8" x2="16" y2="8" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.15"/>
      <stop offset="100%" stop-color="#9466FF" stop-opacity="1"/>
    </linearGradient>
  </defs>
  <rect x="1" y="1" width="14" height="14" rx="3" fill="url(#gi_${settingKey})" stroke="rgba(255,255,255,0.25)" stroke-width="1"/>
  <line x1="4" y1="12" x2="12" y2="4" stroke="white" stroke-width="1.2" stroke-linecap="round"/>
  <line x1="3" y1="8" x2="13" y2="8" stroke="white" stroke-width="0.7" stroke-linecap="round" opacity="0.5"/>
</svg>`;

            gradBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (typeof extraOptions.onGradientClick === 'function') {
                    extraOptions.onGradientClick(gradBtn);
                }
            });

            colorLabel.appendChild(gradBtn);
        }

        colorLabel.appendChild(colorInput);
        group.appendChild(colorLabel);

        return group;
    }

    // Обычный текстовый/числовой инпут
    const group = document.createElement('div');
    group.className = 'setting-group';

    const labelEl = document.createElement('label');
    labelEl.className = 'setting-label';
    labelEl.textContent = label;

    const input = document.createElement('input');
    input.className = 'setting-input';
    input.type = type;
    input.value = value || '';

    input.addEventListener('input', (e) => {
        updateBlockSetting(
            blockId,
            settingKey,
            type === 'number' ? parseFloat(e.target.value) : e.target.value
        );
    });

    group.appendChild(labelEl);
    group.appendChild(input);

    return group;
}

function createSettingTextarea(label, value, blockId, settingKey, rows = 4) {
    const group = document.createElement('div');
    group.className = 'setting-group';

    const labelEl = document.createElement('label');
    labelEl.className = 'setting-label';
    labelEl.textContent = label;

    const textarea = document.createElement('textarea');
    textarea.className = 'setting-textarea';
    textarea.rows = rows;
    textarea.value = value || '';
    textarea.dataset.blockId = blockId;
    textarea.dataset.settingKey = settingKey;

    textarea.addEventListener('input', (e) => {
        updateBlockSetting(blockId, settingKey, e.target.value);
    });

    group.appendChild(labelEl);
    group.appendChild(textarea);

    return group;
}

function createSettingRange(label, value, blockId, settingKey, min, max, step = 1, unit = '') {
    const group = document.createElement('div');
    group.className = 'setting-group';

    const labelEl = document.createElement('label');
    labelEl.className = 'setting-label';
    labelEl.textContent = label;

    const wrapper = document.createElement('div');

    const range = document.createElement('input');
    range.className = 'setting-range';
    range.type = 'range';
    range.min = min;
    range.max = max;
    range.step = step;
    range.value = value;

    const autoUnit = unit || (
        settingKey.includes('height') || settingKey.includes('size') || settingKey.includes('fontSize')
            ? 'px'
            : settingKey.includes('position')
                ? '%'
                : ''
    );

    const valueSpan = document.createElement('span');
    valueSpan.className = 'setting-range-value';
    valueSpan.textContent = value + autoUnit;

    range.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        updateBlockSetting(blockId, settingKey, val);
        valueSpan.textContent = val + autoUnit;
    });

    wrapper.appendChild(range);
    wrapper.appendChild(valueSpan);

    group.appendChild(labelEl);
    group.appendChild(wrapper);

    return group;
}
// Комбинированный селект + input для размера шрифта
function createSettingFontSize(label, value, blockId, settingKey, presets = [8, 10, 12, 14, 16, 18, 20, 24, 32, 48]) {
    const group = document.createElement('div');
    group.className = 'setting-group';

    const labelEl = document.createElement('label');
    labelEl.className = 'setting-label';
    labelEl.textContent = label;

    const wrapper = document.createElement('div');
    wrapper.style.display = 'flex';
    wrapper.style.gap = '8px';
    wrapper.style.alignItems = 'center';

    // Dropdown с пресетами
    const select = document.createElement('select');
    select.className = 'setting-select';
    select.style.flex = '1';

    // Опция "Свой размер"
    const customOption = document.createElement('option');
    customOption.value = 'custom';
    customOption.textContent = 'Свой размер';
    select.appendChild(customOption);

    // Пресеты
    presets.forEach(size => {
        const option = document.createElement('option');
        option.value = size;
        option.textContent = `${size}px`;
        if (value === size) {
            option.selected = true;
        }
        select.appendChild(option);
    });

    // Если текущее значение не в пресетах - выбираем "Свой размер"
    if (!presets.includes(value)) {
        customOption.selected = true;
    }

    // Input для своего значения
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'setting-input';
    input.style.width = '70px';
    input.value = value;
    input.min = 8;
    input.max = 200;

    // Показываем input только если выбран "Свой размер"
    input.style.display = !presets.includes(value) ? 'block' : 'none';

    // Обработчик выбора пресета
    select.addEventListener('change', (e) => {
        const val = e.target.value;
        if (val === 'custom') {
            input.style.display = 'block';
            input.focus();
        } else {
            input.style.display = 'none';
            const numVal = parseInt(val);
            updateBlockSetting(blockId, settingKey, numVal);
        }
    });

    // Обработчик ввода своего значения
    input.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        if (!isNaN(val) && val >= 8 && val <= 200) {
            updateBlockSetting(blockId, settingKey, val);
        }
    });

    wrapper.appendChild(select);
    wrapper.appendChild(input);

    group.appendChild(labelEl);
    group.appendChild(wrapper);

    return group;
}

function createSettingSelect(label, value, blockId, settingKey, options) {
    const group = document.createElement('div');
    group.className = 'setting-group';

    const labelEl = document.createElement('label');
    labelEl.className = 'setting-label';
    labelEl.textContent = label;

    const select = document.createElement('select');
    select.className = 'setting-select';

    options.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.label;
        if (opt.value == value) option.selected = true;
        select.appendChild(option);
    });

    select.addEventListener('change', (e) => {
        updateBlockSetting(blockId, settingKey, e.target.value);
    });

    group.appendChild(labelEl);
    group.appendChild(select);

    return group;
}

function createIconGrid(icons, currentIcon, blockId, settingKey, customKey = null, saveMode = 'src') {
    const iconGrid = document.createElement('div');
    iconGrid.className = 'icon-grid';

    icons.forEach((iconDef) => {
        const option = document.createElement('div');
        option.className = 'icon-option';

        const isNone = !iconDef.src;
        const currentlyNone = !currentIcon;

        // Проверяем совпадение как по src, так и по id
        const isSelected = (isNone && currentlyNone) ||
            (!isNone && (currentIcon === iconDef.src || currentIcon === iconDef.id));

        if (isSelected) {
            option.classList.add('selected');
        }

        if (iconDef.src) {
            const img = document.createElement('img');
            img.src = iconDef.src;
            img.alt = iconDef.label || '';
            option.appendChild(img);
            if (iconDef.userOwned) {
                const badge = document.createElement('span');
                badge.className = 'user-owned-badge';
                badge.textContent = 'Мои';
                option.appendChild(badge);
            }
        } else {
            const span = document.createElement('span');
            span.textContent = iconDef.label || 'Без иконки';
            span.style.cssText = 'font-size: 12px; color: #e5e7eb; display:flex; align-items:center; justify-content:center; height:100%;';
            option.appendChild(span);
        }

        option.addEventListener('click', () => {
            if (customKey) {
                updateBlockSetting(blockId, customKey, '');
            }
            // Выбираем что сохранять в зависимости от режима
            let valueToSave;
            if (saveMode === 'id') {
                // Для буллетов: сначала пробуем id, потом src
                valueToSave = iconDef.id || iconDef.src || '';
            } else {
                // Для остальных: сначала src, потом id (обратная совместимость)
                valueToSave = iconDef.src || iconDef.id || '';
            }
            updateBlockSetting(blockId, settingKey, valueToSave);
            renderSettings();
        });

        iconGrid.appendChild(option);
    });

    return iconGrid;
}

function createFileUploadButton(label, blockId, settingKey, accept = 'image/*') {
    const uploadWrapper = document.createElement('label');
    uploadWrapper.className = 'file-upload-btn';
    uploadWrapper.textContent = label;

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = accept;

    fileInput.addEventListener('change', (event) => {
        handleFileUpload(event, blockId, settingKey);
    });

    uploadWrapper.appendChild(fileInput);
    return uploadWrapper;
}

function handleFileUpload(event, blockId, settingKey) {
    const file = event.target.files[0];
    if (file && file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
            updateBlockSetting(blockId, settingKey, e.target.result);
            renderSettings();
        };
        reader.readAsDataURL(file);
    }
}

// Универсальный компонент позиционирования (X/Y) с drag-scrub
function createPositionInput(options) {
    const {
        blockId,
        xKey,
        yKey,
        xValue = 0,
        yValue = 0,
        xMin = 0,
        xMax = 600,
        yMin = 0,
        yMax = 250,
        onChange = null  // callback(blockId, key, value)
    } = options;

    const container = document.createElement('div');
    container.style.cssText = `
        display: grid;
        grid-template-columns: 28px 1fr 28px 1fr;
        gap: 6px;
        align-items: center;
        margin-bottom: 12px;
    `;

    function createField(label, key, value, min, max) {
        // Label с возможностью drag
        const tag = document.createElement('div');
        tag.textContent = label;
        tag.style.cssText = `
            font-size: 12px;
            color: #9ca3af;
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
            background: #1e293b;
            border: 1px solid #374151;
            border-radius: 8px;
            padding: 6px 10px;
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
            color: #e5e7eb;
            font-weight: 500;
            font-size: 13px;
            -moz-appearance: textfield;
        `;
        // Убираем стрелки в Chrome
        input.addEventListener('focus', () => {
            input.style.cssText += '-webkit-appearance: none;';
        });

        const suffix = document.createElement('span');
        suffix.textContent = 'px';
        suffix.style.cssText = `
            font-size: 11px;
            color: #6b7280;
            user-select: none;
        `;

        field.appendChild(input);
        field.appendChild(suffix);

        // Функция применения значения
        const applyValue = (newValue) => {
            const clamped = Math.max(min, Math.min(max, Math.round(newValue)));
            input.value = clamped;
            if (onChange) {
                onChange(blockId, key, clamped);
            } else {
                updateBlockSetting(blockId, key, clamped);
            }
        };

        // Input событие
        input.addEventListener('input', () => {
            applyValue(Number(input.value) || 0);
        });

        // Клавиши со стрелками с модификаторами
        input.addEventListener('keydown', (e) => {
            if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
            e.preventDefault();

            let step = 1;
            if (e.shiftKey) step = 10;
            if (e.altKey) step = 0.1;

            const dir = (e.key === 'ArrowUp') ? 1 : -1;
            const next = (Number(input.value) || 0) + dir * step;
            applyValue(next);
        });

        // Scrub: drag за label
        let dragging = false;
        let startX = 0;
        let startVal = 0;

        tag.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            e.preventDefault();
            dragging = true;
            tag.setPointerCapture(e.pointerId);
            startX = e.clientX;
            startVal = Number(input.value) || 0;
            tag.style.color = '#60a5fa';

            // Отключаем drag карточки
            const card = tag.closest('.text-element-card');
            if (card) card.draggable = false;
        });

        tag.addEventListener('dragstart', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });

        tag.addEventListener('pointermove', (e) => {
            if (!dragging) return;
            const dx = e.clientX - startX;

            let speed = 0.5;
            if (e.shiftKey) speed = 2;
            if (e.altKey) speed = 0.1;

            const next = startVal + dx * speed;
            applyValue(next);
        });

        tag.addEventListener('pointerup', () => {
            dragging = false;
            tag.style.color = '#9ca3af';

            // Включаем drag карточки обратно
            const card = tag.closest('.text-element-card');
            if (card) card.draggable = true;
        });

        tag.addEventListener('pointercancel', () => {
            dragging = false;
            tag.style.color = '#9ca3af';

            // Включаем drag карточки обратно
            const card = tag.closest('.text-element-card');
            if (card) card.draggable = true;
        });

        return { tag, field };
    }

    const xField = createField('X', xKey, xValue, xMin, xMax);
    const yField = createField('Y', yKey, yValue, yMin, yMax);

    container.appendChild(xField.tag);
    container.appendChild(xField.field);
    container.appendChild(yField.tag);
    container.appendChild(yField.field);

    return container;
}

// Позиционирование для текстовых элементов баннера (с updateBannerTextElement)
function createPositionInputForTextElement(options) {
    const {
        blockId,
        textElId,
        xValue = 0,
        yValue = 0,
        xMin = 0,
        xMax = 600,
        yMin = 0,
        yMax = 250
    } = options;

    const container = document.createElement('div');
    container.style.cssText = `
        display: grid;
        grid-template-columns: 28px 1fr 28px 1fr;
        gap: 6px;
        align-items: center;
        margin-bottom: 12px;
    `;

    function createField(label, key, value, min, max) {
        const tag = document.createElement('div');
        tag.textContent = label;
        tag.style.cssText = `
            font-size: 12px;
            color: #9ca3af;
            user-select: none;
            cursor: ew-resize;
            text-align: center;
            font-weight: 500;
        `;

        const field = document.createElement('div');
        field.style.cssText = `
            display: flex;
            align-items: center;
            background: #1e293b;
            border: 1px solid #374151;
            border-radius: 8px;
            padding: 6px 10px;
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
            color: #e5e7eb;
            font-weight: 500;
            font-size: 13px;
            -moz-appearance: textfield;
        `;

        const suffix = document.createElement('span');
        suffix.textContent = 'px';
        suffix.style.cssText = `
            font-size: 11px;
            color: #6b7280;
            user-select: none;
        `;

        field.appendChild(input);
        field.appendChild(suffix);

        const applyValue = (newValue) => {
            const clamped = Math.max(min, Math.min(max, Math.round(newValue)));
            input.value = clamped;
            updateBannerTextElement(blockId, textElId, key, clamped);
        };

        input.addEventListener('input', () => {
            applyValue(Number(input.value) || 0);
        });

        input.addEventListener('keydown', (e) => {
            if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
            e.preventDefault();

            let step = 1;
            if (e.shiftKey) step = 10;
            if (e.altKey) step = 0.1;

            const dir = (e.key === 'ArrowUp') ? 1 : -1;
            const next = (Number(input.value) || 0) + dir * step;
            applyValue(next);
        });

        // Scrub drag
        let dragging = false;
        let startX = 0;
        let startVal = 0;

        tag.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            e.preventDefault();
            dragging = true;
            tag.setPointerCapture(e.pointerId);
            startX = e.clientX;
            startVal = Number(input.value) || 0;
            tag.style.color = '#60a5fa';

            // Отключаем drag карточки
            const card = tag.closest('.text-element-card');
            if (card) card.draggable = false;
        });

        tag.addEventListener('dragstart', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });

        tag.addEventListener('pointermove', (e) => {
            if (!dragging) return;
            const dx = e.clientX - startX;

            let speed = 0.5;
            if (e.shiftKey) speed = 2;
            if (e.altKey) speed = 0.1;

            const next = startVal + dx * speed;
            applyValue(next);
        });

        tag.addEventListener('pointerup', () => {
            dragging = false;
            tag.style.color = '#9ca3af';

            // Включаем drag карточки обратно
            const card = tag.closest('.text-element-card');
            if (card) card.draggable = true;
        });

        tag.addEventListener('pointercancel', () => {
            dragging = false;
            tag.style.color = '#9ca3af';

            // Включаем drag карточки обратно
            const card = tag.closest('.text-element-card');
            if (card) card.draggable = true;
        });

        return { tag, field };
    }

    const xField = createField('X', 'x', xValue, xMin, xMax);
    const yField = createField('Y', 'y', yValue, yMin, yMax);

    container.appendChild(xField.tag);
    container.appendChild(xField.field);
    container.appendChild(yField.tag);
    container.appendChild(yField.field);

    return container;
}