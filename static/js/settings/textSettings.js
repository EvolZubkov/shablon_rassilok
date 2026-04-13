// settings/textSettings.js — renderTextSettings, createTextLinkToolbar

function renderTextSettings(container, block) {
    const s = block.settings;

    // Конвертируем s.content (simple HTML) → plain text для textarea
    const plainTextValue = TextSanitizer.toPlainText(s.content || '');

    const textarea = createSettingTextarea('Содержимое', plainTextValue, block.id, 'content', 6);
    container.appendChild(textarea);

    // Перехватываем изменения — конвертируем plain text → simple HTML при сохранении
    const ta = textarea.querySelector('textarea');
    if (ta) {
        // Apply typography on blur (not on every keystroke — avoids cursor jumps).
        // Use 'blur' rather than 'change' so it fires even when the settings panel
        // is about to be rebuilt (e.g. user clicks another block on canvas).
        ta.addEventListener('blur', (e) => {
            let simpleHTML = TextSanitizer.sanitize(e.target.value, true);
            simpleHTML = TextSanitizer.applyTypography(simpleHTML);
            // Reflect guillemets, em-dashes back into the textarea
            e.target.value = TextSanitizer.toPlainText(simpleHTML);
            updateBlockSetting(block.id, 'content', simpleHTML);
            renderCanvas();
        });

        ta.addEventListener('input', (e) => {
            const simpleHTML = TextSanitizer.sanitize(e.target.value, true);
            updateBlockSetting(block.id, 'content', simpleHTML);
            renderCanvas();
        });

        // Paste — перехватываем вставку
        ta.addEventListener('paste', (e) => {
            e.preventDefault();
            const clipboardData = e.clipboardData || window.clipboardData;

            // Пробуем взять HTML из буфера
            let pastedHTML = clipboardData.getData('text/html');
            let result;

            if (pastedHTML && pastedHTML.trim()) {
                result = TextSanitizer.sanitize(pastedHTML, false);
                const plain = TextSanitizer.toPlainText(result);
                // Если после очистки Word-HTML ничего не осталось — берём plain text
                if (!plain.trim()) {
                    const pastedText = clipboardData.getData('text/plain');
                    // Word разделяет абзацы одиночным \n — нормализуем в \n\n
                    const normalized = pastedText
                        .replace(/\r\n/g, '\n')
                        .replace(/\r/g, '\n')
                        // Одиночный \n между непустыми строками → двойной
                        .replace(/([^\n])\n([^\n])/g, '$1\n\n$2');
                    result = TextSanitizer.sanitize(normalized, true);
                    ta.value = insertAtCursor(ta, TextSanitizer.toPlainText(result));
                } else {
                    ta.value = insertAtCursor(ta, plain);
                }
            } else {
                // Plain text — вставляем как есть
                const pastedText = clipboardData.getData('text/plain');
                ta.value = insertAtCursor(ta, pastedText);
                result = TextSanitizer.sanitize(ta.value, true);
            }

            // Применяем типографику: неразрывные пробелы после предлогов/союзов
            result = TextSanitizer.applyTypography(result);

            updateBlockSetting(block.id, 'content', result);
            renderCanvas();
        });
    }

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
    btnBold.style.cssText = 'padding: 6px 12px; background: var(--bg-hover); border: 1px solid var(--border-secondary); border-radius: 4px; color: var(--text-secondary); cursor: pointer; font-weight: bold;';

    btnBold.addEventListener('click', () => {
        const ta = container.querySelector(
            `textarea[data-block-id="${block.id}"][data-setting-key="content"]`
        );
        if (!ta) return;

        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const selected = ta.value.substring(start, end);

        if (!selected) {
            Toast.warning('Выделите текст, который нужно сделать жирным');
            return;
        }

        // Оборачиваем в **...** в plain text (sanitize потом конвертирует в <strong>)
        const lines = selected.split('\n');
        const boldLines = lines.map(line =>
            line.trim() === '' ? line : `**${line}**`
        ).join('\n');

        const newPlain = ta.value.substring(0, start) + boldLines + ta.value.substring(end);
        ta.value = newPlain;

        const simpleHTML = TextSanitizer.sanitize(newPlain, true);
        updateBlockSetting(block.id, 'content', simpleHTML);
        renderCanvas();

        ta.focus();
        ta.setSelectionRange(start + 2, end + 2);
    });

    formatToolbar.appendChild(btnBold);
    formatGroup.appendChild(formatToolbar);

    const formatHint = document.createElement('div');
    formatHint.style.cssText = 'font-size: 11px; color: var(--text-muted); margin-top: 6px;';
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

    container.appendChild(
        createSettingFontSize('Размер шрифта', s.fontSize, block.id, 'fontSize',
            [10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24])
    );
    container.appendChild(
        createSettingRange('Межстрочный интервал', s.lineHeight, block.id, 'lineHeight', 1, 2.5, 0.1)
    );
    container.appendChild(
        createSettingSelect('Выравнивание', s.align, block.id, 'align', SELECT_OPTIONS.align)
    );

    container.appendChild(createTextLinkToolbar(block));
}

// Вставка текста в позицию курсора textarea
function insertAtCursor(ta, text) {
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    return ta.value.substring(0, start) + text + ta.value.substring(end);
}

function createTextLinkToolbar(block) {
    const group = document.createElement('div');
    group.className = 'setting-group';

    const label = document.createElement('label');
    label.className = 'setting-label';
    label.textContent = 'Ссылки в тексте';
    group.appendChild(label);

    const hint = document.createElement('div');
    hint.style.cssText = 'font-size: 12px; color: var(--text-muted); margin-bottom: 8px;';
    hint.textContent = 'Выделите текст в поле выше и нажмите кнопку, чтобы сделать его ссылкой.';
    group.appendChild(hint);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Сделать выделенный текст ссылкой';
    btn.style.cssText = 'width: 100%; padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border-secondary); background: none; color: var(--text-secondary); font-size: 12px; cursor: pointer;';

    btn.addEventListener('click', () => {
        const ta = document.querySelector(
            `textarea[data-block-id="${block.id}"][data-setting-key="content"]`
        );
        if (!ta) return;

        const start = ta.selectionStart;
        const end = ta.selectionEnd;

        if (start === end) {
            Toast.warning('Сначала выделите текст в поле "Содержимое".');
            return;
        }

        const selected = ta.value.slice(start, end);
        const url = prompt('Введите ссылку (https://… или mailto:…):');
        if (!url) return;

        // Вставляем markdown-ссылку в plain text
        const replacement = `[${selected}](${url})`;
        const newPlain = ta.value.slice(0, start) + replacement + ta.value.slice(end);
        ta.value = newPlain;

        // Конвертируем весь plain text → simple HTML
        const simpleHTML = TextSanitizer.sanitize(newPlain, true);
        updateBlockSetting(block.id, 'content', simpleHTML);
        renderCanvas();
    });

    group.appendChild(btn);
    return group;
}
