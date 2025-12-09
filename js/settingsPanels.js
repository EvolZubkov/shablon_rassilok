// settingsPanels.js - Генерация панелей настроек для каждого типа блока

function renderSettings() {
    const settingsContent = document.getElementById('settings-content');

    if (!AppState.selectedBlockId) {
        settingsContent.innerHTML = `
            <div class="settings-empty">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                    <circle cx="12" cy="12" r="3"></circle>
                    <path d="M12 1v6m0 6v6m0-6h6m-6 0H6"></path>
                </svg>
                <p>Выберите блок для настройки</p>
            </div>
        `;
        return;
    }

    const block = AppState.findBlockById(AppState.selectedBlockId);
    if (!block) return;

    settingsContent.innerHTML = '';

    // Генерируем настройки в зависимости от типа блока
    switch (block.type) {
        case 'banner':
            renderBannerSettings(settingsContent, block);
            break;
        case 'text':
            renderTextSettings(settingsContent, block);
            break;
        case 'heading':
            renderHeadingSettings(settingsContent, block);
            break;
        case 'button':
            renderButtonSettings(settingsContent, block);
            break;
        case 'list':
            renderListSettings(settingsContent, block);
            break;
        case 'expert':
            renderExpertSettings(settingsContent, block);
            break;
        case 'important':
            renderImportantSettings(settingsContent, block);
            break;
        case 'divider':
            renderDividerSettings(settingsContent, block);
            break;
        case 'image':
            renderImageSettings(settingsContent, block);
            break;
        case 'spacer':
            renderSpacerSettings(settingsContent, block);
            break;
    }

    // Если выбран контейнер с колонками, показываем настройки колонок
    const mainBlock = AppState.blocks.find(b => b.id === AppState.selectedBlockId);
    if (mainBlock && mainBlock.columns) {
        renderColumnsSettings(settingsContent, mainBlock);
    }
}

function renderBannerSettings(container, block) {
    const s = block.settings;

    // Выбор баннера
    const bannerGroup = document.createElement('div');
    bannerGroup.className = 'setting-group';

    const bannerLabel = document.createElement('label');
    bannerLabel.className = 'setting-label';
    bannerLabel.textContent = 'Выберите баннер';
    bannerGroup.appendChild(bannerLabel);

    const bannerGrid = document.createElement('div');
    bannerGrid.className = 'banner-grid';

    BANNERS.forEach(banner => {
        const option = document.createElement('div');
        option.className = 'banner-option';
        if (s.image === banner.src) option.classList.add('selected');

        const img = document.createElement('img');
        img.src = banner.src;
        img.alt = banner.label;

        option.appendChild(img);
        option.addEventListener('click', () => {
            updateBlockSetting(block.id, 'image', banner.src);
            renderSettings();
        });

        bannerGrid.appendChild(option);
    });

    bannerGroup.appendChild(bannerGrid);
    container.appendChild(bannerGroup);

    // Загрузка своего баннера
    container.appendChild(createFileUploadButton('Загрузить свой баннер', block.id, 'image'));

    // Текст на баннере
    container.appendChild(createSettingTextarea('Текст на баннере', s.text, block.id, 'text', 3));

    // Настройки текста
    container.appendChild(createSettingFontSize('Размер шрифта', s.fontSize, block.id, 'fontSize', [6, 8, 10, 12, 14, 16, 18, 20, 24, 32, 48, 60, 72]));
    container.appendChild(createSettingSelect('Шрифт', s.fontFamily || 'rt-regular', block.id, 'fontFamily', SELECT_OPTIONS.textFontFamily));
    container.appendChild(createSettingRange('Позиция по вертикали', s.positionY, block.id, 'positionY', 0, 100));
    container.appendChild(createSettingRange('Позиция по горизонтали', s.positionX, block.id, 'positionX', 0, 100));
    container.appendChild(createSettingRange('Межстрочный интервал', s.lineHeight, block.id, 'lineHeight', 0.5, 3, 0.1));
    container.appendChild(createSettingRange('Расстояние между буквами', s.letterSpacing, block.id, 'letterSpacing', -5, 20, 0.5));
}

function renderTextSettings(container, block) {
    const s = block.settings;

    // Сам текст
    container.appendChild(
        createSettingTextarea('Содержимое', s.content, block.id, 'content', 6)
    );
    // Панель форматирования
    const formatGroup = document.createElement('div');
    formatGroup.className = 'setting-group';

    const formatLabel = document.createElement('label');
    formatLabel.className = 'setting-label';
    formatLabel.textContent = 'Форматирование';
    formatGroup.appendChild(formatLabel);

    const formatToolbar = document.createElement('div');
    formatToolbar.style.cssText = 'display: flex; gap: 6px; margin-top: 8px;';

    // Кнопка Bold
    const btnBold = document.createElement('button');
    btnBold.innerHTML = '<strong>B</strong>';
    btnBold.title = 'Жирный текст (выделите текст и нажмите)';
    btnBold.style.cssText = 'padding: 6px 12px; background: #334155; border: 1px solid #475569; border-radius: 4px; color: #e5e7eb; cursor: pointer; font-weight: bold;';

    btnBold.addEventListener('click', () => {
        const textarea = container.querySelector(`textarea[data-block-id="${block.id}"][data-setting-key="content"]`);

        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const selectedText = textarea.value.substring(start, end);

        if (selectedText) {
            // Оборачиваем в **текст** для markdown жирного
            const newText = textarea.value.substring(0, start) +
                `**${selectedText}**` +
                textarea.value.substring(end);

            textarea.value = newText;

            // Обновляем блок
            updateBlockSetting(block.id, 'content', newText);

            // Устанавливаем курсор после вставки
            textarea.focus();
            textarea.setSelectionRange(end + 4, end + 4);
        } else {
            alert('Выделите текст, который нужно сделать жирным');
        }
    });

    formatToolbar.appendChild(btnBold);
    formatGroup.appendChild(formatToolbar);

    const formatHint = document.createElement('div');
    formatHint.style.cssText = 'font-size: 11px; color: #64748b; margin-top: 6px;';
    formatHint.textContent = 'Совет: выделите текст и нажмите B для жирного';
    formatGroup.appendChild(formatHint);

    container.appendChild(formatGroup);

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

    // Размер / межстрочный / выравнивание
    container.appendChild(createSettingFontSize('Размер шрифта', s.fontSize, block.id, 'fontSize', [10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24]));
    container.appendChild(
        createSettingRange('Межстрочный интервал', s.lineHeight, block.id, 'lineHeight', 1, 2.5, 0.1)
    );
    container.appendChild(
        createSettingSelect('Выравнивание', s.align, block.id, 'align', SELECT_OPTIONS.align)
    );

    // Панель "Ссылки"
    container.appendChild(createTextLinkToolbar(block));
}

function createTextLinkToolbar(block) {
    const group = document.createElement('div');
    group.className = 'setting-group';

    const label = document.createElement('label');
    label.className = 'setting-label';
    label.textContent = 'Ссылки в тексте';
    group.appendChild(label);

    const hint = document.createElement('div');
    hint.style.cssText = 'font-size: 12px; color: #9ca3af; margin-bottom: 8px;';
    hint.textContent = 'Выделите текст в поле выше и нажмите кнопку, чтобы сделать его ссылкой.';
    group.appendChild(hint);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Сделать выделенный текст ссылкой';
    btn.style.cssText = 'width: 100%; padding: 8px 12px; border-radius: 6px; border: 1px solid #4b5563; background: none; color: #e5e7eb; font-size: 12px; cursor: pointer;';

    btn.addEventListener('click', () => {
        const textarea = document.querySelector(
            `.setting-textarea[data-block-id="${block.id}"][data-setting-key="content"]`
        );
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;

        if (start === end) {
            alert('Сначала выделите текст в поле "Содержимое".');
            return;
        }

        const selected = textarea.value.slice(start, end);
        const url = prompt('Введите ссылку (https://… или mailto:…):');
        if (!url) return;

        const before = textarea.value.slice(0, start);
        const after = textarea.value.slice(end);

        // Маркап вида [текст](url)
        const replacement = `[${selected}](${url})`;
        const newValue = before + replacement + after;

        textarea.value = newValue;
        updateBlockSetting(block.id, 'content', newValue);
    });

    group.appendChild(btn);
    return group;
}


function renderHeadingSettings(container, block) {
    const s = block.settings;

    container.appendChild(createSettingInput('Текст заголовка', s.text, block.id, 'text'));
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
    container.appendChild(createSettingFontSize('Размер', s.size, block.id, 'size', [10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48]));
    container.appendChild(createSettingRange('Толщина', s.weight, block.id, 'weight', 300, 900, 100));
    container.appendChild(createSettingSelect('Выравнивание', s.align || 'left', block.id, 'align', SELECT_OPTIONS.align));
}

function renderButtonSettings(container, block) {
    const s = block.settings;

    container.appendChild(createSettingInput('Текст кнопки', s.text, block.id, 'text'));
    container.appendChild(createSettingInput('Ссылка', s.url, block.id, 'url', 'url'));
    container.appendChild(createSettingInput('Цвет фона', s.color, block.id, 'color', 'color'));
    container.appendChild(createSettingInput('Цвет текста', s.textColor, block.id, 'textColor', 'color'));
    container.appendChild(createSettingSelect('Положение кнопки', s.align || 'center', block.id, 'align', SELECT_OPTIONS.align));

    // Иконка кнопки
    const iconGroup = document.createElement('div');
    iconGroup.className = 'setting-group';

    const labelEl = document.createElement('label');
    labelEl.className = 'setting-label';
    labelEl.textContent = 'Иконка кнопки';
    iconGroup.appendChild(labelEl);

    const hint = document.createElement('div');
    hint.style.cssText = 'font-size: 12px; color: #9ca3af; margin-top: 4px;';
    hint.textContent = 'Выберите иконку из библиотеки или загрузите свою.';
    iconGroup.appendChild(hint);

    if (BUTTON_ICONS && BUTTON_ICONS.length > 0) {
        iconGroup.appendChild(createIconGrid(BUTTON_ICONS, s.icon, block.id, 'icon'));
    }

    const customLabel = document.createElement('label');
    customLabel.className = 'setting-label';
    customLabel.style.marginTop = '12px';
    customLabel.textContent = 'Своя иконка';
    iconGroup.appendChild(customLabel);

    if (s.icon) {
        const preview = document.createElement('img');
        preview.src = s.icon;
        preview.style.cssText = 'width: 24px; height: 24px; object-fit: contain; display: block; margin-bottom: 8px; border-radius: 4px;';
        iconGroup.appendChild(preview);
    }

    iconGroup.appendChild(createFileUploadButton('Загрузить иконку', block.id, 'icon'));

    if (s.icon) {
        const resetBtn = document.createElement('button');
        resetBtn.textContent = 'Убрать иконку';
        resetBtn.style.cssText = 'margin-top: 8px; width: 100%; padding: 8px; border-radius: 6px; border: 1px solid #4b5563; background: none; color: #e5e7eb; font-size: 12px; cursor: pointer;';
        resetBtn.addEventListener('click', () => {
            updateBlockSetting(block.id, 'icon', '');
            renderSettings();
        });
        iconGroup.appendChild(resetBtn);
    }

    container.appendChild(iconGroup);
    container.appendChild(
        createSettingRange(
            'Размер кнопки',
            s.size ?? 1,
            block.id,
            'size',
            0.45,   // минимум
            2.5,   // максимум
            0.05   // шаг
        )
    );
}

// settingsPanels2.js - Продолжение панелей настроек

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
    hint.style.cssText = 'font-size: 12px; color: #9ca3af; margin-bottom: 8px;';
    hint.textContent = 'Можно переносить строки внутри пункта (Shift+Enter).';
    listGroup.appendChild(hint);

    (s.items || []).forEach((item, index) => {
        const itemDiv = document.createElement('div');
        itemDiv.style.cssText = 'display: flex; gap: 4px; margin-bottom: 8px;';

        const textarea = document.createElement('textarea');
        textarea.className = 'setting-input';
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
        deleteBtn.style.cssText = 'padding: 8px 12px; background: #dc2626; color: white; border: none; border-radius: 4px; cursor: pointer;';
        deleteBtn.addEventListener('click', () => {
            const newItems = (s.items || []).filter((_, i) => i !== index);
            updateBlockSetting(block.id, 'items', newItems);
            renderSettings();
        });

        itemDiv.appendChild(textarea);
        itemDiv.appendChild(deleteBtn);
        listGroup.appendChild(itemDiv);
    });

    const addBtn = document.createElement('button');
    addBtn.textContent = '+ Добавить пункт';
    addBtn.style.cssText = 'width: 100%; padding: 10px; background: #f97316; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;';
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
    bulletHint.style.cssText = 'font-size: 12px; color: #9ca3af; margin-top: 4px;';
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
        resetBtn.style.cssText = 'margin-top: 8px; width: 100%; padding: 8px; border-radius: 6px; border: 1px solid #4b5563; background: none; color: #e5e7eb; font-size: 12px; cursor: pointer;';
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
    container.appendChild(createSettingSelect('Нумерованный список', s.listStyle || 'bullets', block.id, 'listStyle', [{ value: 'bullets', label: 'Обычные буллиты' }, { value: 'numbered', label: 'Нумерованный (01, 02, 03...)' }]));
    container.appendChild(createSettingRange('Расстояние между пунктами', s.itemSpacing ?? 8, block.id, 'itemSpacing', 0, 40, 1, 'px'));
}


function renderExpertSettings(container, block) {
    const s = block.settings;

    // Превью фото
    const previewGroup = document.createElement('div');
    previewGroup.className = 'setting-group';
    previewGroup.id = `expert-photo-preview-${block.id}`;
    previewGroup.innerHTML = `
        <label class="setting-label">Фото эксперта</label>
        <div class="photo-preview-box">
            <div class="photo-mask">
                <img id="expert-photo-img-${block.id}" src="${s.photo}" style="width: 100%; height: 100%; object-fit: cover; transform: rotate(-45deg) scale(${s.scale / 100}) translate(${s.positionX}%, ${s.positionY}%);">
            </div>
            ${s.badgeIcon ? `<div class="expert-badge-preview"><img src="${s.badgeIcon}"></div>` : ''}
        </div>
    `;
    container.appendChild(previewGroup);

    container.appendChild(createFileUploadButton('Загрузить фото', block.id, 'photo'));

    // Настройки фото
    const photoSettingsGroup = document.createElement('div');
    photoSettingsGroup.className = 'expert-photo-settings';
    photoSettingsGroup.appendChild(createSettingRange('Позиция по вертикали', s.positionY, block.id, 'positionY', -50, 50));
    photoSettingsGroup.appendChild(createSettingRange('Позиция по горизонтали', s.positionX, block.id, 'positionX', -50, 50));
    photoSettingsGroup.appendChild(createSettingRange('Масштаб', s.scale, block.id, 'scale', 10, 500));
    container.appendChild(photoSettingsGroup);

    // Выбор значка
    const badgeGroup = document.createElement('div');
    badgeGroup.className = 'setting-group';

    const badgeLabel = document.createElement('label');
    badgeLabel.className = 'setting-label';
    badgeLabel.textContent = 'Значок на фото';
    badgeGroup.appendChild(badgeLabel);

    badgeGroup.appendChild(createIconGrid(EXPERT_BADGE_ICONS, s.badgeIcon, block.id, 'badgeIcon'));
    // ДОБАВИТЬ ЭТИ СТРОКИ:
    // Кнопка загрузки своего значка
    badgeGroup.appendChild(createFileUploadButton('Загрузить свой значок', block.id, 'badgeIcon'));

    // ДОБАВИТЬ ЭТИ СТРОКИ:
    // Настройки положения значка (только если значок выбран)
    if (s.badgeIcon) {
        const badgePositionGroup = document.createElement('div');
        badgePositionGroup.style.cssText = 'margin-top: 12px; padding: 12px; background: #1e293b; border-radius: 6px;';

        const badgePositionLabel = document.createElement('div');
        badgePositionLabel.className = 'setting-label';
        badgePositionLabel.textContent = 'Положение значка';
        badgePositionLabel.style.marginBottom = '8px';
        badgePositionGroup.appendChild(badgePositionLabel);

        // Кнопки пресетов положения
        const positionPresets = [
            { label: 'Снизу справа', x: 100, y: 100 },
            { label: 'Снизу слева', x: 0, y: 100 },
            { label: 'Сверху справа', x: 100, y: 0 },
            { label: 'Сверху слева', x: 0, y: 0 },
        ];

        const presetsContainer = document.createElement('div');
        presetsContainer.style.cssText = 'display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; margin-bottom: 12px;';

        positionPresets.forEach(preset => {
            const btn = document.createElement('button');
            btn.textContent = preset.label;
            btn.style.cssText = 'padding: 6px; background: #334155; color: #e5e7eb; border: 1px solid #475569; border-radius: 4px; cursor: pointer; font-size: 11px;';

            // Подсветка активного пресета
            if (s.badgePositionX === preset.x && s.badgePositionY === preset.y) {
                btn.style.background = '#f97316';
                btn.style.borderColor = '#f97316';
            }

            btn.addEventListener('click', () => {
                updateBlockSetting(block.id, 'badgePositionX', preset.x);
                updateBlockSetting(block.id, 'badgePositionY', preset.y);
                renderSettings();
            });

            presetsContainer.appendChild(btn);
        });

        badgePositionGroup.appendChild(presetsContainer);

        // Точная настройка
        badgePositionGroup.appendChild(createSettingRange('Позиция X (%)', s.badgePositionX ?? 100, block.id, 'badgePositionX', 0, 100, 1, '%'));
        badgePositionGroup.appendChild(createSettingRange('Позиция Y (%)', s.badgePositionY ?? 100, block.id, 'badgePositionY', 0, 100, 1, '%'));

        badgeGroup.appendChild(badgePositionGroup);
    }
    const removeBadgeBtn = document.createElement('button');
    removeBadgeBtn.textContent = 'Убрать значок';
    removeBadgeBtn.style.cssText = 'width: 100%; padding: 8px; background: #dc2626; color: white; border: none; border-radius: 6px; cursor: pointer; margin-top: 8px;';
    removeBadgeBtn.addEventListener('click', () => {
        updateBlockSetting(block.id, 'badgeIcon', '');
        renderSettings();
    });
    badgeGroup.appendChild(removeBadgeBtn);

    container.appendChild(badgeGroup);

    // Текстовые поля
    container.appendChild(createSettingInput('Имя', s.name, block.id, 'name'));
    container.appendChild(createSettingInput('Должность', s.title, block.id, 'title'));
    container.appendChild(createSettingTextarea('Описание', s.bio, block.id, 'bio', 3));

    // Настройки цветов
    // Цвет фона + кнопка "Бесцветный фон"
    const bgColorGroup = createSettingInput(
        'Цвет фона',
        s.bgColor && s.bgColor !== 'transparent' ? s.bgColor : '#0f172a',
        block.id,
        'bgColor',
        'color'
    );

    const noBgBtn = document.createElement('button');
    noBgBtn.type = 'button';
    noBgBtn.textContent = 'Бесцветный фон';
    noBgBtn.style.cssText = 'margin-top:8px; width:100%; padding:6px 10px; ' +
        'border-radius:4px; border:1px solid #4b5563; background:none; ' +
        'color:#e5e7eb; font-size:12px; cursor:pointer;';

    noBgBtn.addEventListener('click', () => {
        updateBlockSetting(block.id, 'bgColor', 'transparent');
        renderSettings();
    });

    bgColorGroup.appendChild(noBgBtn);
    container.appendChild(bgColorGroup)
    container.appendChild(createSettingInput('Цвет текста описания', s.textColor, block.id, 'textColor', 'color'));
    container.appendChild(createSettingInput('Цвет имени', s.nameColor, block.id, 'nameColor', 'color'));
    container.appendChild(createSettingInput('Цвет должности', s.titleColor, block.id, 'titleColor', 'color'));
}

function renderImportantSettings(container, block) {
    const s = block.settings;

    container.appendChild(createSettingTextarea('Текст', s.text, block.id, 'text', 3));

    // Цвета
    container.appendChild(createSettingInput('Цвет текста', s.textColor, block.id, 'textColor', 'color'));
    container.appendChild(createSettingInput('Цвет важно', s.borderColor || '#a855f7', block.id, 'borderColor', 'color'));

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

    // Размер шрифта и межстрочный интервал
    container.appendChild(createSettingFontSize('Размер текста', s.fontSize ?? 13, block.id, 'fontSize', [10, 11, 12, 13, 14, 15, 16, 18, 20]));
    container.appendChild(createSettingRange('Межстрочный интервал', s.lineHeight ?? 1, block.id, 'lineHeight', 1.0, 2.5, 0.1, ''));

    // Внутренний отступ
    // container.appendChild(createSettingRange('Внутренний отступ', s.padding ?? 16, block.id, 'padding', 8, 32, 1, 'px'));

    // Выбор иконки
    const iconGroup = document.createElement('div');
    iconGroup.className = 'setting-group';

    const iconLabel = document.createElement('label');
    iconLabel.className = 'setting-label';
    iconLabel.textContent = 'Иконка';
    iconGroup.appendChild(iconLabel);

    iconGroup.appendChild(createIconGrid(IMPORTANT_ICONS, s.icon, block.id, 'icon'));
    iconGroup.appendChild(createFileUploadButton('Загрузить свою иконку', block.id, 'icon'));
    container.appendChild(iconGroup);
}
function renderDividerSettings(container, block) {
    const s = block.settings;

    container.appendChild(createSettingInput('Цвет', s.color, block.id, 'color', 'color'));
    container.appendChild(createSettingRange('Толщина', s.height, block.id, 'height', 1, 10));
}

function renderImageSettings(container, block) {
    const s = block.settings;

    const uploadGroup = document.createElement('div');
    uploadGroup.className = 'setting-group';

    const label = document.createElement('label');
    label.className = 'setting-label';
    label.textContent = 'Изображение';
    uploadGroup.appendChild(label);

    if (s.src) {
        const img = document.createElement('img');
        img.src = s.src;
        img.style.cssText = 'width: 100%; border-radius: 6px; margin-bottom: 8px;';
        uploadGroup.appendChild(img);
    }

    uploadGroup.appendChild(createFileUploadButton('Загрузить изображение', block.id, 'src'));
    container.appendChild(uploadGroup);

    container.appendChild(createSettingInput('Альтернативный текст', s.alt, block.id, 'alt'));
    container.appendChild(createSettingInput('Ширина (%, px или auto)', s.width, block.id, 'width'));
    container.appendChild(createSettingSelect('Выравнивание', s.align || 'center', block.id, 'align', SELECT_OPTIONS.align));
}

function renderSpacerSettings(container, block) {
    const s = block.settings;

    container.appendChild(createSettingRange('Высота отступа', s.height, block.id, 'height', 8, 128));
}

function renderColumnsSettings(container, block) {
    if (!block.columns || block.columns.length !== 2) return;

    const leftCol = block.columns[0];
    const rightCol = block.columns[1];

    const group = document.createElement('div');
    group.className = 'setting-group';

    const label = document.createElement('label');
    label.className = 'setting-label';
    label.textContent = 'Ширина колонок';
    group.appendChild(label);

    const info = document.createElement('div');
    info.className = 'columns-width-info';
    info.textContent = `Левая: ${leftCol.width}% · Правая: ${rightCol.width}%`;
    info.style.cssText = 'margin-bottom: 12px; color: #9ca3af; font-size: 13px;';
    group.appendChild(info);

    // Кнопки-пресеты
    const presetsContainer = document.createElement('div');
    presetsContainer.style.cssText = 'display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 12px;';

    const presets = [
        { left: 20, right: 80, label: '20/80' },
        { left: 30, right: 70, label: '30/70' },
        { left: 40, right: 60, label: '40/60' },
        { left: 50, right: 50, label: '50/50' },
        { left: 60, right: 40, label: '60/40' },
        { left: 70, right: 30, label: '70/30' },
        { left: 80, right: 20, label: '80/20' },
    ];

    presets.forEach(preset => {
        const btn = document.createElement('button');
        btn.textContent = preset.label;
        btn.style.cssText = 'padding: 6px 8px; background: #334155; color: #e5e7eb; border: 1px solid #475569; border-radius: 4px; cursor: pointer; font-size: 11px; transition: all 0.2s;';

        // Подсветка активного пресета
        if (leftCol.width === preset.left) {
            btn.style.background = '#f97316';
            btn.style.borderColor = '#f97316';
            btn.style.fontWeight = '600';
        }

        btn.addEventListener('mouseenter', () => {
            if (leftCol.width !== preset.left) {
                btn.style.background = '#475569';
            }
        });

        btn.addEventListener('mouseleave', () => {
            if (leftCol.width !== preset.left) {
                btn.style.background = '#334155';
            }
        });

        btn.addEventListener('click', () => {
            leftCol.width = preset.left;
            rightCol.width = preset.right;
            info.textContent = `Левая: ${preset.left}% · Правая: ${preset.right}%`;
            renderCanvas();
            renderSettings();
        });

        presetsContainer.appendChild(btn);
    });

    group.appendChild(presetsContainer);

    // Слайдер для точной настройки
    const sliderLabel = document.createElement('div');
    sliderLabel.textContent = 'Точная настройка:';
    sliderLabel.style.cssText = 'font-size: 12px; color: #9ca3af; margin-bottom: 6px;';
    group.appendChild(sliderLabel);

    const range = document.createElement('input');
    range.type = 'range';
    range.min = 20;
    range.max = 80;
    range.value = leftCol.width;
    range.className = 'setting-range';

    // ИСПРАВЛЕНИЕ: используем 'input' для плавности + 'change' для финального рендера
    let updateTimeout;
    range.addEventListener('input', (e) => {
        let left = parseInt(e.target.value, 10);
        if (left < 20) left = 20;
        if (left > 80) left = 80;
        const right = 100 - left;

        leftCol.width = left;
        rightCol.width = right;
        info.textContent = `Левая: ${left}% · Правая: ${right}%`;

        // Плавное обновление canvas (debounce)
        clearTimeout(updateTimeout);
        updateTimeout = setTimeout(() => {
            renderCanvas();
        }, 50); // Обновляем каждые 50мс для плавности
    });

    // Финальный рендер при отпускании
    range.addEventListener('change', () => {
        clearTimeout(updateTimeout);
        renderCanvas();
        renderSettings();
    });

    group.appendChild(range);
    container.appendChild(group);
}