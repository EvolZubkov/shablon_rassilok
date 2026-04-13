// settings/listSettings.js — renderListSettings

function renderListSettings(container, block) {
    const s = block.settings;

    // Пункты списка
    const listGroup = document.createElement('div');
    listGroup.className = 'setting-group';

    const label = document.createElement('label');
    label.className = 'setting-label';
    label.textContent = 'Пункты списка';
    listGroup.appendChild(label);

    const hint = document.createElement('div');
    hint.style.cssText = 'font-size: 12px; color: var(--text-muted); margin-bottom: 8px;';
    hint.textContent = 'Можно переносить строки внутри пункта (Shift+Enter).';
    listGroup.appendChild(hint);

    (s.items || []).forEach((item, index) => {
        const itemWrapper = document.createElement('div');
        itemWrapper.style.cssText = 'margin-bottom: 12px; border: 1px solid var(--border-primary); border-radius: 8px; padding: 8px;';

        // Верхняя строка: textarea + кнопка удалить
        const itemDiv = document.createElement('div');
        itemDiv.style.cssText = 'display: flex; gap: 4px; margin-bottom: 6px;';

        const textarea = document.createElement('textarea');
        textarea.className = 'setting-input list-item-textarea';
        textarea.dataset.blockId = block.id;
        textarea.dataset.itemIndex = index;
        textarea.value = item;
        textarea.style.flex = '1';
        textarea.style.minHeight = '48px';
        textarea.style.resize = 'vertical';

        textarea.addEventListener('input', (e) => {
            const newItems = [...(s.items || [])];
            newItems[index] = e.target.value;
            updateBlockSetting(block.id, 'items', newItems);
        });

        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '✕';
        deleteBtn.style.cssText = 'padding: 8px 12px; background: var(--accent-danger); color: white; border: none; border-radius: 4px; cursor: pointer;';
        deleteBtn.addEventListener('click', () => {
            const newItems = (s.items || []).filter((_, i) => i !== index);
            updateBlockSetting(block.id, 'items', newItems);
            renderSettings();
        });

        itemDiv.appendChild(textarea);
        itemDiv.appendChild(deleteBtn);
        itemWrapper.appendChild(itemDiv);

        // Кнопка "Сделать ссылкой"
        const linkBtn = document.createElement('button');
        linkBtn.type = 'button';
        linkBtn.textContent = '🔗 Сделать выделенный текст ссылкой';
        linkBtn.style.cssText = 'width: 100%; padding: 6px 10px; border-radius: 4px; border: 1px solid var(--border-secondary); background: none; color: var(--text-muted); font-size: 11px; cursor: pointer;';

        linkBtn.addEventListener('click', () => {
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;

            if (start === end) {
                Toast.warning('Сначала выделите текст в поле выше.');
                return;
            }

            const selected = textarea.value.slice(start, end);
            const url = prompt('Введите ссылку (https://… или mailto:…):');
            if (!url) return;

            const before = textarea.value.slice(0, start);
            const after = textarea.value.slice(end);

            const replacement = `[${selected}](${url})`;
            const newValue = before + replacement + after;

            textarea.value = newValue;
            const newItems = [...(s.items || [])];
            newItems[index] = newValue;
            updateBlockSetting(block.id, 'items', newItems);
        });

        itemWrapper.appendChild(linkBtn);
        listGroup.appendChild(itemWrapper);
    });

    const addBtn = document.createElement('button');
    addBtn.textContent = '+ Добавить пункт';
    addBtn.style.cssText = 'width: 100%; padding: 10px; background: var(--accent-primary); color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;';
    addBtn.addEventListener('click', () => {
        const newItems = [...(s.items || []), 'Новый пункт'];
        updateBlockSetting(block.id, 'items', newItems);
        renderSettings();
    });

    listGroup.appendChild(addBtn);
    container.appendChild(listGroup);

    // Дальше — остальные настройки списка (размер шрифта, буллеты и т.д.)
    // Шрифт
    container.appendChild(
        createSettingSelect(
            'Шрифт',
            s.fontFamily || 'default',
            block.id,
            'fontFamily',
            SELECT_OPTIONS.textFontFamily
        )
    );

    // Свой шрифт (CSS-имя) — показываем только если выбран "custom"
    if ((s.fontFamily || 'default') === 'custom') {
        container.appendChild(
            createSettingInput(
                'CSS-имя шрифта (как в CSS)',
                s.customFontFamily || '',
                block.id,
                'customFontFamily'
            )
        );
    }
    // Настройки текста
    container.appendChild(createSettingFontSize('Размер', s.fontSize ?? 14, block.id, 'fontSize', [10, 12, 14, 16, 18, 20, 22, 24]));
    container.appendChild(createSettingRange('Межстрочный интервал', s.lineHeight ?? 1.0, block.id, 'lineHeight', 1.0, 3.5, 0.1, ''));

    // Буллеты
    const bulletGroup = document.createElement('div');
    bulletGroup.className = 'setting-group';

    const bulletLabel = document.createElement('label');
    bulletLabel.className = 'setting-label';
    bulletLabel.textContent = 'Буллет';
    bulletGroup.appendChild(bulletLabel);

    const bulletHint = document.createElement('div');
    bulletHint.style.cssText = 'font-size: 12px; color: var(--text-muted); margin-top: 4px;';
    bulletHint.textContent = 'Выберите иконку из библиотеки или загрузите свою.';
    bulletGroup.appendChild(bulletHint);

    if (BULLET_TYPES && BULLET_TYPES.length > 0) {
        // Если есть кастомная иконка, передаём её src, иначе bulletType (который теперь содержит ID)
        const currentBulletValue = s.bulletCustom || s.bulletType;
        bulletGroup.appendChild(createIconGrid(BULLET_TYPES, currentBulletValue, block.id, 'bulletType', 'bulletCustom', 'id'));
    }

    const customLabel = document.createElement('label');
    customLabel.className = 'setting-label';
    customLabel.style.marginTop = '12px';
    customLabel.textContent = 'Своя иконка';
    bulletGroup.appendChild(customLabel);

    if (s.bulletCustom) {
        const preview = document.createElement('img');
        preview.src = s.bulletCustom;
        preview.style.cssText = 'width: 24px; height: 24px; object-fit: contain; display: block; margin-bottom: 8px; border-radius: 4px;';
        bulletGroup.appendChild(preview);
    }

    bulletGroup.appendChild(createFileUploadButton('Загрузить иконку', block.id, 'bulletCustom'));

    if (s.bulletCustom) {
        const resetBtn = document.createElement('button');
        resetBtn.textContent = 'Сбросить свою иконку';
        resetBtn.style.cssText = 'margin-top: 8px; width: 100%; padding: 8px; border-radius: 6px; border: 1px solid var(--border-secondary); background: none; color: var(--text-secondary); font-size: 12px; cursor: pointer;';
        resetBtn.addEventListener('click', () => {
            updateBlockSetting(block.id, 'bulletCustom', '');
            renderSettings();
        });
        bulletGroup.appendChild(resetBtn);
    }

    container.appendChild(bulletGroup);

    // Размер и положение буллета
    container.appendChild(createSettingRange('Размер буллета', s.bulletSize ?? 20, block.id, 'bulletSize', 0, 100, 1, 'px'));
    container.appendChild(createSettingRange('Отступ от текста', s.bulletGap ?? 10, block.id, 'bulletGap', 0, 40, 1, 'px'));
    // Нумерованный список (с перерисовкой настроек при изменении)
    const listStyleGroup = document.createElement('div');
    listStyleGroup.className = 'setting-group';

    const listStyleLabel = document.createElement('label');
    listStyleLabel.className = 'setting-label';
    listStyleLabel.textContent = 'Нумерованный список';
    listStyleGroup.appendChild(listStyleLabel);

    const listStyleSelect = document.createElement('select');
    listStyleSelect.className = 'setting-select';
    listStyleSelect.innerHTML = `
    <option value="bullets" ${(s.listStyle || 'bullets') === 'bullets' ? 'selected' : ''}>Обычные буллиты</option>
    <option value="numbered" ${s.listStyle === 'numbered' ? 'selected' : ''}>Нумерованный (01, 02, 03...)</option>
`;
    listStyleSelect.addEventListener('change', (e) => {
        s.listStyle = e.target.value;
        renderListBulletsToDataUrls(block, () => {
            renderCanvas();
            renderSettings(); // Перерисовываем настройки!
        });
    });
    listStyleGroup.appendChild(listStyleSelect);
    container.appendChild(listStyleGroup);
    // Начать с номера (только для нумерованного списка)
    if (s.listStyle === 'numbered') {
        const startGroup = document.createElement('div');
        startGroup.className = 'setting-group';

        const startLabel = document.createElement('label');
        startLabel.className = 'setting-label';
        startLabel.textContent = 'Начать с номера';
        startGroup.appendChild(startLabel);

        const startInput = document.createElement('input');
        startInput.type = 'number';
        startInput.min = '1';
        startInput.max = '99';
        startInput.value = s.startNumber || 1;
        startInput.className = 'setting-input';
        startInput.style.width = '80px';
        startInput.addEventListener('change', (e) => {
            let val = parseInt(e.target.value) || 1;
            if (val < 1) val = 1;
            if (val > 99) val = 99;
            s.startNumber = val;
            renderListBulletsToDataUrls(block, () => {
                renderCanvas();
            });
        });
        startGroup.appendChild(startInput);
        container.appendChild(startGroup);
    }
    container.appendChild(createSettingRange('Расстояние между пунктами', s.itemSpacing ?? 8, block.id, 'itemSpacing', 0, 40, 1, 'px'));
}

// Хелпер для получения border-radius из настроек блока
