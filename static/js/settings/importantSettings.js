// settings/importantSettings.js — renderImportantSettings

function renderImportantSettings(container, block) {
    const s = block.settings;

    const plainTextValue = TextSanitizer.toPlainText(s.text || '');
    const textareaGroup = createSettingTextarea('Текст', plainTextValue, block.id, 'text', 3);
    container.appendChild(textareaGroup);

    const ta = textareaGroup.querySelector('textarea');
    if (ta) {
        ta.addEventListener('input', (e) => {
            const simpleHTML = TextSanitizer.sanitize(e.target.value, true);
            updateBlockSetting(block.id, 'text', simpleHTML);
            renderCanvas();
        });

        ta.addEventListener('blur', (e) => {
            let simpleHTML = TextSanitizer.sanitize(e.target.value, true);
            simpleHTML = TextSanitizer.applyTypography(simpleHTML);
            e.target.value = TextSanitizer.toPlainText(simpleHTML);
            updateBlockSetting(block.id, 'text', simpleHTML);
            renderCanvas();
        });

        ta.addEventListener('paste', (e) => {
            e.preventDefault();
            const clipboardData = e.clipboardData || window.clipboardData;
            let pastedHTML = clipboardData.getData('text/html');
            let result;

            if (pastedHTML && pastedHTML.trim()) {
                result = TextSanitizer.sanitize(pastedHTML, false);
                const plain = TextSanitizer.toPlainText(result);
                if (!plain.trim()) {
                    const pastedText = clipboardData.getData('text/plain');
                    const normalized = pastedText
                        .replace(/\r\n/g, '\n')
                        .replace(/\r/g, '\n')
                        .replace(/([^\n])\n([^\n])/g, '$1\n\n$2');
                    result = TextSanitizer.sanitize(normalized, true);
                    ta.value = _insertImportantTextAtCursor(ta, TextSanitizer.toPlainText(result));
                } else {
                    ta.value = _insertImportantTextAtCursor(ta, plain);
                }
            } else {
                const pastedText = clipboardData.getData('text/plain');
                ta.value = _insertImportantTextAtCursor(ta, pastedText);
                result = TextSanitizer.sanitize(ta.value, true);
            }

            result = TextSanitizer.applyTypography(result);
            updateBlockSetting(block.id, 'text', result);
            renderCanvas();
        });
    }

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

function _insertImportantTextAtCursor(ta, text) {
    const start = ta.selectionStart ?? ta.value.length;
    const end = ta.selectionEnd ?? ta.value.length;
    return ta.value.substring(0, start) + text + ta.value.substring(end);
}
