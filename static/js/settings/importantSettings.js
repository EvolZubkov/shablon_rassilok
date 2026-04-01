// settings/importantSettings.js — renderImportantSettings

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
