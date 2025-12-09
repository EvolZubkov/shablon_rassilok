// settingsUI.js - Вспомогательные функции для создания UI элементов настроек

function createSettingInput(label, value, blockId, settingKey, type = 'text') {
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
        });

        colorLabel.appendChild(textSpan);
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