// settings/settingsShared.js — createTextElementCard и хелперы, createToggleSection, createFileUploadButton

function createTextElementCard(blockId, textEl, index, totalCount) {
    const card = document.createElement('div');
    card.className = 'text-element-card';
    card.draggable = true;
    card.draggable = true;

    // Отключаем draggable для интерактивных элементов
    card.addEventListener('mousedown', (e) => {
        const target = e.target;
        if (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.tagName === 'SELECT' ||
            target.tagName === 'BUTTON' ||
            target.type === 'range') {
            card.draggable = false;
        } else {
            card.draggable = true;
        }
    });
    card.dataset.index = index;
    card.style.cssText = `
        background: var(--bg-secondary); border: 1px solid var(--border-primary);
        border-radius: 8px; padding: 12px;
        cursor: grab; transition: all 0.2s;
    `;

    // Заголовок карточки
    const header = document.createElement('div');
    header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;';

    const dragHandle = document.createElement('span');
    dragHandle.textContent = '⋮⋮';
    dragHandle.style.cssText = 'color: var(--text-muted); cursor: grab; font-size: 16px; margin-right: 8px;';

    const titleWrapper = document.createElement('div');
    titleWrapper.style.cssText = 'display: flex; align-items: center; flex: 1;';
    titleWrapper.appendChild(dragHandle);

    const title = document.createElement('span');
    title.textContent = `Текст ${index + 1}`;
    title.style.cssText = 'color: var(--text-secondary); font-size: 13px; font-weight: 500;';
    titleWrapper.appendChild(title);

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '✕';
    deleteBtn.style.cssText = `
        background: transparent; border: none; color: var(--accent-danger);
        cursor: pointer; font-size: 16px; padding: 4px 8px;
        border-radius: 4px; transition: all 0.2s;
    `;
    deleteBtn.addEventListener('click', () => {
        deleteBannerTextElement(blockId, textEl.id);
    });

    header.appendChild(titleWrapper);
    header.appendChild(deleteBtn);
    card.appendChild(header);

    // Текст
    const textInput = document.createElement('textarea');
    textInput.value = textEl.text || '';
    textInput.rows = 2;
    textInput.style.cssText = 'width: 100%; padding: 8px; border-radius: 6px; border: 1px solid var(--border-secondary); background: var(--bg-input); color: var(--text-secondary); font-size: 13px; resize: vertical; margin-bottom: 12px;';
    textInput.addEventListener('input', (e) => {
        updateBannerTextElement(blockId, textEl.id, 'text', e.target.value);
    });
    card.appendChild(textInput);

    // Позиция X, Y с drag-scrub
    const bannerBlock = AppState.findBlockById(blockId);
    const bannerHeight = bannerBlock?.settings?.bannerHeight || 250;
    const positionInput = createPositionInputForTextElement({
        blockId: blockId,
        textElId: textEl.id,
        xValue: textEl.x || 0,
        yValue: textEl.y || 0,
        xMax: 600,
        yMax: bannerHeight
    });
    card.appendChild(positionInput);

    // Размер и цвет
    const styleGrid = document.createElement('div');
    styleGrid.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px;';

    // styleGrid.appendChild(createTextElementNumberInput('Размер', textEl.fontSize || 16, blockId, textEl.id, 'fontSize'));
    // styleGrid.appendChild(createTextElementColorInput('Цвет', textEl.color || '#ffffff', blockId, textEl.id, 'color'));
    card.appendChild(styleGrid);

    // Шрифт
    const fontSelect = document.createElement('select');
    fontSelect.style.cssText = 'width: 100%; padding: 8px; border-radius: 6px; border: 1px solid var(--border-secondary); background: var(--bg-input); color: var(--text-secondary); font-size: 13px; margin-bottom: 12px;';
    SELECT_OPTIONS.textFontFamily.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.label;
        if (textEl.fontFamily === opt.value) option.selected = true;
        fontSelect.appendChild(option);
    });
    fontSelect.addEventListener('change', (e) => {
        updateBannerTextElement(blockId, textEl.id, 'fontFamily', e.target.value);
    });
    card.appendChild(fontSelect);

    // Межстрочный интервал
    const lineHeightLabel = document.createElement('label');
    lineHeightLabel.textContent = 'Межстрочный интервал';
    lineHeightLabel.style.cssText = 'display: block; font-size: 11px; color: var(--text-muted); margin: 12px 0 4px 0;';
    card.appendChild(lineHeightLabel);

    const lineHeightWrapper = document.createElement('div');
    lineHeightWrapper.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-bottom: 12px;';

    const lineHeightRange = document.createElement('input');
    lineHeightRange.type = 'range';
    lineHeightRange.min = '1.0';
    lineHeightRange.max = '2.5';
    lineHeightRange.step = '0.1';
    lineHeightRange.value = textEl.lineHeight || 1.0;
    lineHeightRange.style.cssText = 'flex: 1;';

    const lineHeightValue = document.createElement('span');
    lineHeightValue.textContent = (textEl.lineHeight || 1.0).toFixed(1);
    lineHeightValue.style.cssText = 'font-size: 12px; color: var(--text-secondary); min-width: 30px;';

    lineHeightRange.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        updateBannerTextElement(blockId, textEl.id, 'lineHeight', val);
        lineHeightValue.textContent = val.toFixed(1);
    });

    lineHeightWrapper.appendChild(lineHeightRange);
    lineHeightWrapper.appendChild(lineHeightValue);
    card.appendChild(lineHeightWrapper);

    // Межбуквенный интервал
    const letterSpacingLabel = document.createElement('label');
    letterSpacingLabel.textContent = 'Межбуквенный интервал';
    letterSpacingLabel.style.cssText = 'display: block; font-size: 11px; color: var(--text-muted); margin-bottom: 4px;';
    card.appendChild(letterSpacingLabel);

    const letterSpacingWrapper = document.createElement('div');
    letterSpacingWrapper.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-bottom: 12px;';

    const letterSpacingRange = document.createElement('input');
    letterSpacingRange.type = 'range';
    letterSpacingRange.min = '-2';
    letterSpacingRange.max = '10';
    letterSpacingRange.step = '0.5';
    letterSpacingRange.value = textEl.letterSpacing || 0;
    letterSpacingRange.style.cssText = 'flex: 1;';

    const letterSpacingValue = document.createElement('span');
    letterSpacingValue.textContent = (textEl.letterSpacing || 0) + 'px';
    letterSpacingValue.style.cssText = 'font-size: 12px; color: var(--text-secondary); min-width: 36px;';

    letterSpacingRange.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        updateBannerTextElement(blockId, textEl.id, 'letterSpacing', val);
        letterSpacingValue.textContent = val + 'px';
    });

    letterSpacingWrapper.appendChild(letterSpacingRange);
    letterSpacingWrapper.appendChild(letterSpacingValue);
    card.appendChild(letterSpacingWrapper);

    // === ИКОНКА ===
    const iconToggle = createToggleSection('Иконка', textEl.iconEnabled, (enabled) => {
        updateBannerTextElement(blockId, textEl.id, 'iconEnabled', enabled);
        renderSettings();
    });
    card.appendChild(iconToggle);

    if (textEl.iconEnabled) {
        const iconContent = document.createElement('div');
        iconContent.style.cssText = 'padding: 12px; background: var(--bg-primary); border: 1px solid var(--border-primary); border-radius: 8px; margin-bottom: 12px;';

        // Сетка иконок
        if (window.BANNER_ICONS && window.BANNER_ICONS.length > 0) {
            const iconGrid = document.createElement('div');
            iconGrid.style.cssText = 'display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 8px;';

            window.BANNER_ICONS.forEach(icon => {
                const iconOption = document.createElement('div');
                const isSelected = textEl.icon === icon.src;
                iconOption.style.cssText = `
                    border: 2px solid ${isSelected ? 'var(--accent-primary)' : 'var(--border-secondary)'};
                    border-radius: 8px; padding: 8px; cursor: pointer;
                    display: flex; align-items: center; justify-content: center;
                    background: ${isSelected ? 'var(--bg-selected)' : 'transparent'};
                `;

                const iconImg = document.createElement('img');
                iconImg.src = icon.src;
                iconImg.style.cssText = 'width: 24px; height: 24px; object-fit: contain;';
                iconOption.appendChild(iconImg);

                iconOption.addEventListener('click', () => {
                    updateBannerTextElement(blockId, textEl.id, 'icon', icon.src);
                    updateBannerTextElement(blockId, textEl.id, 'iconCustom', '');
                    renderSettings();
                });

                iconGrid.appendChild(iconOption);
            });

            iconContent.appendChild(iconGrid);
        }

        // Загрузка своей иконки
        const iconUpload = createFileUploadButtonForTextElement('Загрузить иконку', blockId, textEl.id, 'iconCustom');
        iconContent.appendChild(iconUpload);

        if (textEl.iconCustom) {
            const preview = document.createElement('img');
            preview.src = textEl.iconCustom;
            preview.style.cssText = 'width: 32px; height: 32px; object-fit: contain; margin-top: 8px; border: 2px solid var(--accent-primary); border-radius: 4px;';
            iconContent.appendChild(preview);
        }

        card.appendChild(iconContent);
    }

    // === ПЛАШКА ===
    const badgeToggle = createToggleSection('Плашка (фон)', textEl.badgeEnabled, (enabled) => {
        updateBannerTextElement(blockId, textEl.id, 'badgeEnabled', enabled);
        renderSettings();
    });
    card.appendChild(badgeToggle);

    if (textEl.badgeEnabled) {
        const badgeContent = document.createElement('div');
        badgeContent.style.cssText = 'padding: 12px; background: var(--bg-primary); border: 1px solid var(--border-primary); border-radius: 6px;';

        const badgeGrid = document.createElement('div');
        badgeGrid.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px;';

        badgeGrid.appendChild(createTextElementColorInput('Цвет', textEl.badgeColor || '#a855f7', blockId, textEl.id, 'badgeColor'));
        badgeGrid.appendChild(createTextElementNumberInput('Скругление', textEl.badgeRadius || 20, blockId, textEl.id, 'badgeRadius'));

        badgeContent.appendChild(badgeGrid);

        const paddingGrid = document.createElement('div');
        paddingGrid.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; gap: 8px;';

        paddingGrid.appendChild(createTextElementNumberInput('Отступ X', textEl.badgePaddingX || 16, blockId, textEl.id, 'badgePaddingX'));
        paddingGrid.appendChild(createTextElementNumberInput('Отступ Y', textEl.badgePaddingY || 8, blockId, textEl.id, 'badgePaddingY'));

        badgeContent.appendChild(paddingGrid);

        card.appendChild(badgeContent);
    }

    // Drag & Drop events
    card.addEventListener('dragstart', (e) => {
        card.style.opacity = '0.5';
        e.dataTransfer.setData('text/plain', index.toString());
    });

    card.addEventListener('dragend', () => {
        card.style.opacity = '1';
    });

    card.addEventListener('dragover', (e) => {
        e.preventDefault();
        card.style.borderColor = 'var(--accent-primary)';
    });

    card.addEventListener('dragleave', () => {
        card.style.borderColor = 'var(--border-primary)';
    });

    card.addEventListener('drop', (e) => {
        e.preventDefault();
        card.style.borderColor = 'var(--border-primary)';
        const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
        const toIndex = index;
        if (fromIndex !== toIndex) {
            reorderBannerTextElements(blockId, fromIndex, toIndex);
        }
    });

    return card;
}

// Числовой инпут для текстового элемента
function createTextElementNumberInput(label, value, blockId, textElId, key) {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';

    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    labelEl.style.cssText = 'font-size: 11px; color: var(--text-muted);';

    const input = document.createElement('input');
    input.type = 'number';
    input.value = value;
    input.style.cssText = 'width: 100%; padding: 6px; border-radius: 4px; border: 1px solid var(--border-secondary); background: var(--bg-input); color: var(--text-secondary); font-size: 12px;';
    input.addEventListener('input', (e) => {
        updateBannerTextElement(blockId, textElId, key, parseInt(e.target.value) || 0);
    });

    wrapper.appendChild(labelEl);
    wrapper.appendChild(input);
    return wrapper;
}

// Цветовой инпут для текстового элемента
function createTextElementColorInput(label, value, blockId, textElId, key) {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';

    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    labelEl.style.cssText = 'font-size: 11px; color: var(--text-muted);';

    const colorWrapper = document.createElement('div');
    colorWrapper.style.cssText = 'display: flex; align-items: center; gap: 8px;';

    const colorSwatch = document.createElement('button');
    colorSwatch.type = 'button';
    colorSwatch.style.cssText = 'width: 100%; height: 32px; border: 1px solid var(--border-secondary); border-radius: 4px; cursor: pointer; background: ' + (value || '#ffffff') + ';';
    colorSwatch.addEventListener('click', () => {
        pickColor({
            title: label,
            currentColor: value || '#ffffff',
            allowTransparent: false,
            onApply: (chosen) => {
                colorSwatch.style.background = chosen;
                value = chosen;
                updateBannerTextElement(blockId, textElId, key, chosen);
            },
        });
    });

    colorWrapper.appendChild(colorSwatch);
    wrapper.appendChild(labelEl);
    wrapper.appendChild(colorWrapper);
    return wrapper;
}

// Переключатель секции
function createToggleSection(label, enabled, onChange) {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 8px 0; margin-bottom: 8px;';

    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    labelEl.style.cssText = 'font-size: 13px; color: var(--text-secondary);';

    const toggle = document.createElement('button');
    toggle.textContent = enabled ? 'ВКЛ' : 'ВЫКЛ';
    toggle.style.cssText = `
        padding: 4px 12px; border-radius: 12px; font-size: 11px;
        border: none; cursor: pointer; font-weight: 500;
        background: ${enabled ? 'var(--accent-success)' : 'var(--border-hover)'};
        color: ${enabled ? '#ffffff' : 'var(--text-muted)'};
    `;
    toggle.addEventListener('click', () => onChange(!enabled));

    wrapper.appendChild(labelEl);
    wrapper.appendChild(toggle);
    return wrapper;
}

// Загрузка файла для текстового элемента
function createFileUploadButtonForTextElement(label, blockId, textElId, key) {
    const uploadWrapper = document.createElement('label');
    uploadWrapper.className = 'file-upload-btn';
    uploadWrapper.textContent = label;
    uploadWrapper.style.cssText = 'display: inline-block; padding: 6px 12px; background: var(--bg-hover); border-radius: 6px; color: var(--text-secondary); font-size: 12px; cursor: pointer;';

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';

    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                updateBannerTextElement(blockId, textElId, key, e.target.result);
                renderSettings();
            };
            reader.readAsDataURL(file);
        }
    });

    uploadWrapper.appendChild(fileInput);
    return uploadWrapper;
}
