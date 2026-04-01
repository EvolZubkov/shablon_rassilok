// settings/headingSettings.js — renderHeadingSettings

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

