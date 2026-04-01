// settings/textSettings.js — renderTextSettings, createTextLinkToolbar

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
            // Оборачиваем каждую строку отдельно в **текст** для markdown жирного
            const lines = selectedText.split('\n');
            const boldLines = lines.map(line => {
                // Пропускаем пустые строки
                if (line.trim() === '') return line;
                return `**${line}**`;
            }).join('\n');

            const newText = textarea.value.substring(0, start) +
                boldLines +
                textarea.value.substring(end);

            textarea.value = newText;

            // Обновляем блок
            updateBlockSetting(block.id, 'content', newText);

            // Устанавливаем курсор после вставки
            textarea.focus();
            textarea.setSelectionRange(end + 4, end + 4);
        } else {
            Toast.warning('Выделите текст, который нужно сделать жирным');
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
            Toast.warning('Сначала выделите текст в поле "Содержимое".');
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


