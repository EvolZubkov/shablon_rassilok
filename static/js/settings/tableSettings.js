// settings/tableSettings.js — renderTableSettings
//
// Панель настроек блока "Таблица": градиентная плашка-заголовок (title +
// title-градиент, растрируется в PNG для писем — см. imageRenderers.js
// renderTableTitleToDataUrl) + гибкий набор колонок/строк данных (карточка
// на едином фоне с белыми grid-линиями между ячейками — см. emailGenerator.js
// generateTableHTML). Текст колонок/ячеек поддерживает переносы строк и
// ссылки в формате [текст](url) — как в блоке "Список".

function renderTableSettings(container, block) {
    const s = block.settings;

    // === Заголовок-плашка (по принципу баннера: цвет ИЛИ градиент + картинка справа) ===
    container.appendChild(createSettingsSectionLabel('Заголовок-плашка'));
    container.appendChild(createSettingInput('Текст заголовка', s.title, block.id, 'title', 'text'));
    container.appendChild(createSettingInput('Цвет текста заголовка', s.titleColor, block.id, 'titleColor', 'color'));

    const gradientEnabled = s.titleGradientEnabled !== false;
    const fillToggle = document.createElement('div');
    fillToggle.style.cssText = 'display:flex; gap:8px; margin-bottom:12px;';
    [['Цвет', false], ['Градиент', true]].forEach(([label, isGradient]) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = label;
        const active = gradientEnabled === isGradient;
        btn.style.cssText = `
            flex:1; padding:6px 12px; border-radius:4px; cursor:pointer;
            font-size:12px; font-weight:600;
            border:1px solid ${active ? 'var(--accent-primary)' : 'var(--border-secondary)'};
            background:${active ? 'var(--accent-primary)' : 'var(--bg-hover)'};
            color:${active ? '#fff' : 'var(--text-muted)'};
        `;
        btn.addEventListener('click', () => {
            updateBlockSetting(block.id, 'titleGradientEnabled', isGradient);
            renderSettings();
        });
        fillToggle.appendChild(btn);
    });
    container.appendChild(fillToggle);

    if (gradientEnabled) {
        container.appendChild(createSettingInput('Градиент: начало', s.titleGradientStart, block.id, 'titleGradientStart', 'color'));
        container.appendChild(createSettingInput('Градиент: конец', s.titleGradientEnd, block.id, 'titleGradientEnd', 'color'));
        container.appendChild(createSettingRange('Угол градиента', s.titleGradientAngle, block.id, 'titleGradientAngle', 0, 360, 1, '°'));
    } else {
        container.appendChild(createSettingInput('Цвет фона плашки', s.titleBgColor, block.id, 'titleBgColor', 'color'));
    }

    // Картинка справа
    const imgGroup = document.createElement('div');
    imgGroup.className = 'setting-group';
    const imgLabel = document.createElement('label');
    imgLabel.className = 'setting-label';
    imgLabel.textContent = 'Картинка справа';
    imgGroup.appendChild(imgLabel);

    const imgRow = document.createElement('div');
    imgRow.style.cssText = 'display:flex; align-items:center; gap:8px;';

    if (s.titleRightImage) {
        const thumb = document.createElement('img');
        thumb.src = s.titleRightImage;
        thumb.style.cssText = 'width:36px; height:36px; object-fit:cover; border-radius:4px; border:1px solid var(--border-secondary);';
        imgRow.appendChild(thumb);

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.textContent = '✕ Удалить';
        removeBtn.style.cssText = 'padding:6px 10px; border-radius:4px; border:1px solid var(--border-secondary); background:none; color:var(--text-muted); cursor:pointer; font-size:11px;';
        removeBtn.addEventListener('click', () => {
            updateBlockSetting(block.id, 'titleRightImage', '');
            renderSettings();
        });
        imgRow.appendChild(removeBtn);
    } else {
        imgRow.appendChild(createFileUploadButton('📁 Загрузить картинку', block.id, 'titleRightImage'));
    }

    imgGroup.appendChild(imgRow);
    container.appendChild(imgGroup);

    container.appendChild(createSettingRange('Размер шрифта заголовка', s.titleFontSize, block.id, 'titleFontSize', 16, 48, 1, 'px'));
    container.appendChild(createSettingRange('Скругление плашки', s.titleRadius, block.id, 'titleRadius', 0, 40, 1, 'px'));

    // === Карточка ===
    container.appendChild(createSettingsSectionLabel('Карточка'));
    container.appendChild(createSettingInput('Фон карточки', s.containerBg, block.id, 'containerBg', 'color'));
    container.appendChild(createSettingRange('Скругление карточки', s.containerRadius, block.id, 'containerRadius', 0, 48, 1, 'px'));

    // === Колонки ===
    container.appendChild(createSettingsSectionLabel('Колонки таблицы'));

    (s.columns || []).forEach((col, index) => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex; gap:4px; margin-bottom:6px;';

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'setting-input';
        input.value = TextSanitizer.toPlainText(col || '');
        input.style.flex = '1';
        input.addEventListener('input', (e) => {
            const newColumns = [...(s.columns || [])];
            newColumns[index] = e.target.value;
            updateBlockSetting(block.id, 'columns', newColumns);
        });

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.textContent = '✕';
        delBtn.title = 'Удалить колонку';
        delBtn.style.cssText = 'padding:8px 12px; background:var(--accent-danger); color:#fff; border:none; border-radius:4px; cursor:pointer;';
        delBtn.addEventListener('click', () => {
            if ((s.columns || []).length <= 1) return; // минимум 1 колонка
            const newColumns = (s.columns || []).filter((_, i) => i !== index);
            const newWidths = (s.columnWidths || []).filter((_, i) => i !== index);
            const newRows = (s.rows || []).map(r => r.filter((_, i) => i !== index));
            updateBlockSetting(block.id, 'columns', newColumns);
            updateBlockSetting(block.id, 'columnWidths', newWidths);
            updateBlockSetting(block.id, 'rows', newRows);
            renderSettings();
        });

        row.appendChild(input);
        row.appendChild(delBtn);
        container.appendChild(row);
    });

    const addColBtn = document.createElement('button');
    addColBtn.type = 'button';
    addColBtn.textContent = '+ Добавить колонку';
    addColBtn.style.cssText = 'width:100%; padding:8px; margin-bottom:16px; border-radius:4px; border:1px solid var(--border-secondary); background:none; color:var(--text-muted); cursor:pointer;';
    addColBtn.addEventListener('click', () => {
        const newColumns = [...(s.columns || []), `Колонка ${(s.columns || []).length + 1}`];
        const newWidths = []; // сброс к равномерному распределению
        const newRows = (s.rows || []).map(r => [...r, '']);
        updateBlockSetting(block.id, 'columns', newColumns);
        updateBlockSetting(block.id, 'columnWidths', newWidths);
        updateBlockSetting(block.id, 'rows', newRows);
        renderSettings();
    });
    container.appendChild(addColBtn);

    // === Ширины колонок ===
    if ((s.columns || []).length > 1) {
        container.appendChild(createSettingsSectionLabel('Ширина колонок, %'));
        const widths = (Array.isArray(s.columnWidths) && s.columnWidths.length === s.columns.length)
            ? [...s.columnWidths]
            : s.columns.map(() => Math.round(100 / s.columns.length));

        s.columns.forEach((col, index) => {
            container.appendChild(
                createColumnWidthControl(col || `Колонка ${index + 1}`, widths, index, block.id)
            );
        });
    }

    // === Строки ===
    container.appendChild(createSettingsSectionLabel('Строки таблицы'));

    (s.rows || []).forEach((row, rowIndex) => {
        const rowWrapper = document.createElement('div');
        rowWrapper.style.cssText = 'margin-bottom:12px; border:1px solid var(--border-primary); border-radius:8px; padding:8px;';

        (s.columns || []).forEach((col, colIndex) => {
            const cellWrap = document.createElement('div');
            cellWrap.style.cssText = 'display:flex; gap:4px; margin-bottom:4px; align-items:flex-start;';

            const cellLabel = document.createElement('span');
            cellLabel.style.cssText = 'font-size:11px; color:var(--text-muted); width:76px; flex-shrink:0; padding-top:8px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;';
            cellLabel.textContent = col || `Кол. ${colIndex + 1}`;
            cellLabel.title = col || '';

            const cellCol = document.createElement('div');
            cellCol.style.cssText = 'flex:1; display:flex; flex-direction:column; gap:4px;';

            const cellInput = document.createElement('textarea');
            cellInput.className = 'setting-input';
            cellInput.value = TextSanitizer.toPlainText(row[colIndex] || '');
            cellInput.style.cssText = 'min-height:36px; resize:vertical;';
            cellInput.addEventListener('input', (e) => {
                const newRows = (s.rows || []).map(r => [...r]);
                newRows[rowIndex][colIndex] = e.target.value;
                updateBlockSetting(block.id, 'rows', newRows);
            });

            // Кнопка "Сделать ссылкой" — та же логика, что в блоке "Список"
            // (listSettings.js): выделяем текст → оборачиваем в [текст](url).
            const linkBtn = document.createElement('button');
            linkBtn.type = 'button';
            linkBtn.textContent = '🔗 Сделать выделенный текст ссылкой';
            linkBtn.style.cssText = 'width:100%; padding:4px 8px; border-radius:4px; border:1px solid var(--border-secondary); background:none; color:var(--text-muted); font-size:10px; cursor:pointer;';
            linkBtn.addEventListener('click', () => {
                const start = cellInput.selectionStart;
                const end = cellInput.selectionEnd;

                if (start === end) {
                    Toast.warning('Сначала выделите текст в поле выше.');
                    return;
                }

                const selected = cellInput.value.slice(start, end);
                const url = prompt('Введите ссылку (https://… или mailto:…):');
                if (!url) return;

                const before = cellInput.value.slice(0, start);
                const after = cellInput.value.slice(end);
                const newValue = before + `[${selected}](${url})` + after;

                cellInput.value = newValue;
                const newRows = (s.rows || []).map(r => [...r]);
                newRows[rowIndex][colIndex] = TextSanitizer.sanitize(newValue, true);
                updateBlockSetting(block.id, 'rows', newRows);
            });

            cellCol.appendChild(cellInput);
            cellCol.appendChild(linkBtn);
            cellWrap.appendChild(cellLabel);
            cellWrap.appendChild(cellCol);
            rowWrapper.appendChild(cellWrap);
        });

        const delRowBtn = document.createElement('button');
        delRowBtn.type = 'button';
        delRowBtn.textContent = '✕ Удалить строку';
        delRowBtn.style.cssText = 'width:100%; padding:6px; margin-top:4px; background:var(--accent-danger); color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:11px;';
        delRowBtn.addEventListener('click', () => {
            const newRows = (s.rows || []).filter((_, i) => i !== rowIndex);
            updateBlockSetting(block.id, 'rows', newRows);
            renderSettings();
        });
        rowWrapper.appendChild(delRowBtn);

        container.appendChild(rowWrapper);
    });

    const addRowBtn = document.createElement('button');
    addRowBtn.type = 'button';
    addRowBtn.textContent = '+ Добавить строку';
    addRowBtn.style.cssText = 'width:100%; padding:8px; margin-bottom:16px; border-radius:4px; border:1px solid var(--border-secondary); background:none; color:var(--text-muted); cursor:pointer;';
    addRowBtn.addEventListener('click', () => {
        const newRow = (s.columns || []).map(() => '');
        const newRows = [...(s.rows || []), newRow];
        updateBlockSetting(block.id, 'rows', newRows);
        renderSettings();
    });
    container.appendChild(addRowBtn);

    // === Стили текста и разделителей ===
    container.appendChild(createSettingsSectionLabel('Стили таблицы'));

    // Выравнивание текста в ячейках (шапка + тело) — три кнопки-переключателя,
    // по тому же паттерну, что и Цвет/Градиент выше.
    const alignGroup = document.createElement('div');
    alignGroup.className = 'setting-group';
    const alignLabel = document.createElement('label');
    alignLabel.className = 'setting-label';
    alignLabel.textContent = 'Выравнивание текста в ячейках';
    alignGroup.appendChild(alignLabel);

    const alignToggle = document.createElement('div');
    alignToggle.style.cssText = 'display:flex; gap:8px; margin-bottom:12px;';
    const currentAlign = s.cellTextAlign || 'left';
    [['Слева', 'left'], ['По центру', 'center'], ['Справа', 'right']].forEach(([label, value]) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = label;
        const active = currentAlign === value;
        btn.style.cssText = `
            flex:1; padding:6px 12px; border-radius:4px; cursor:pointer;
            font-size:12px; font-weight:600;
            border:1px solid ${active ? 'var(--accent-primary)' : 'var(--border-secondary)'};
            background:${active ? 'var(--accent-primary)' : 'var(--bg-hover)'};
            color:${active ? '#fff' : 'var(--text-muted)'};
        `;
        btn.addEventListener('click', () => {
            updateBlockSetting(block.id, 'cellTextAlign', value);
            renderSettings();
        });
        alignToggle.appendChild(btn);
    });
    alignGroup.appendChild(alignToggle);
    container.appendChild(alignGroup);

    container.appendChild(createSettingInput('Цвет текста шапки', s.headerTextColor, block.id, 'headerTextColor', 'color'));
    container.appendChild(createSettingRange('Размер шрифта шапки', s.headerFontSize, block.id, 'headerFontSize', 10, 28, 1, 'px'));
    container.appendChild(createSettingInput('Цвет текста ячеек', s.textColor, block.id, 'textColor', 'color'));
    container.appendChild(createSettingRange('Размер шрифта ячеек', s.fontSize, block.id, 'fontSize', 10, 24, 1, 'px'));
    container.appendChild(createSettingInput('Цвет ссылок', s.linkColor, block.id, 'linkColor', 'color'));
    container.appendChild(createSettingInput('Цвет grid-линий', s.dividerColor, block.id, 'dividerColor', 'color'));
    container.appendChild(createSettingRange('Отступ в ячейке (верт.)', s.cellPaddingV, block.id, 'cellPaddingV', 4, 48, 1, 'px'));
    container.appendChild(createSettingRange('Отступ в ячейке (гориз.)', s.cellPaddingH, block.id, 'cellPaddingH', 4, 64, 1, 'px'));
}

/**
 * Range-контрол для ширины одной колонки (% ), пишет в массив
 * block.settings.columnWidths по индексу — createSettingRange для этого не
 * подходит, т.к. умеет писать только в плоский ключ настроек.
 */
function createColumnWidthControl(label, widths, index, blockId) {
    const group = document.createElement('div');
    group.className = 'setting-group';

    const labelEl = document.createElement('label');
    labelEl.className = 'setting-label';
    labelEl.textContent = label;

    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex; align-items:center; gap:8px;';

    const range = document.createElement('input');
    range.type = 'range';
    range.className = 'setting-range';
    range.min = 5;
    range.max = 90;
    range.step = 1;
    range.value = widths[index];

    const valueSpan = document.createElement('span');
    valueSpan.className = 'setting-range-value';
    valueSpan.textContent = widths[index] + '%';

    range.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        widths[index] = val;
        valueSpan.textContent = val + '%';
        updateBlockSetting(blockId, 'columnWidths', [...widths]);
    });

    wrapper.appendChild(range);
    wrapper.appendChild(valueSpan);
    group.appendChild(labelEl);
    group.appendChild(wrapper);
    return group;
}

function createSettingsSectionLabel(text) {
    const divider = document.createElement('div');
    divider.style.cssText = [
        'display:flex',
        'align-items:center',
        'gap:8px',
        'margin:16px 0 8px',
        'color:var(--text-muted)',
        'font-size:11px',
        'font-weight:600',
        'text-transform:uppercase',
        'letter-spacing:.05em',
    ].join(';');
    divider.innerHTML = `
        <span style="flex:1;height:1px;background:var(--border-primary)"></span>
        <span>${text}</span>
        <span style="flex:1;height:1px;background:var(--border-primary)"></span>
    `;
    return divider;
}
