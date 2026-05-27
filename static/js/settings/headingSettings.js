// settings/headingSettings.js — renderHeadingSettings

function renderHeadingSettings(container, block) {
    const s = block.settings;
    const hiddenSettings = (typeof ProfileLoader !== 'undefined' && ProfileLoader.loaded)
        ? ProfileLoader.getHiddenSettings('heading') : [];

    const headingTextGroup = createSettingInput('Текст заголовка', s.text, block.id, 'text');
    container.appendChild(headingTextGroup);
    // Apply typography on blur — same behaviour as text block settings.
    const headingInput = headingTextGroup.querySelector('input');
    if (headingInput) {
        headingInput.addEventListener('blur', () => {
            const raw = headingInput.value;
            if (!raw.trim()) return;
            const html = TextSanitizer.applyTypography(TextSanitizer.escapeHTML(raw));
            const tmp = document.createElement('span');
            tmp.innerHTML = html;
            const processed = tmp.textContent;
            if (processed !== raw) {
                headingInput.value = processed;
                updateBlockSetting(block.id, 'text', processed);
            }
        });
    }
    if (!hiddenSettings.includes('fontFamily')) {
        container.appendChild(
            createSettingSelect(
                'Шрифт',
                s.fontFamily || 'default',
                block.id,
                'fontFamily',
                SELECT_OPTIONS.textFontFamily
            )
        );
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
    }
    if (!hiddenSettings.includes('size')) {
        container.appendChild(createSettingFontSize('Размер', s.size, block.id, 'size', [10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48]));
    }
    if (!hiddenSettings.includes('weight')) {
        container.appendChild(createSettingRange('Толщина', s.weight, block.id, 'weight', 300, 900, 100));
    }
    if (!hiddenSettings.includes('align')) {
        container.appendChild(createSettingSelect('Выравнивание', s.align || 'left', block.id, 'align', SELECT_OPTIONS.align));
    }
    if (!hiddenSettings.includes('color')) {
        container.appendChild(createSettingInput('Цвет текста', s.color || '#f9fafb', block.id, 'color', 'color'));
    }
}

