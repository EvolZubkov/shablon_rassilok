// settings/textSettings.js — renderTextSettings

function renderTextSettings(container, block) {
    const s = block.settings;
    const hiddenSettings = (typeof ProfileLoader !== 'undefined' && ProfileLoader.loaded)
        ? ProfileLoader.getHiddenSettings('text') : [];

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

    // Кнопки списков — открывают модалку выбора маркера/формата нумерации
    const btnBullet = document.createElement('button');
    btnBullet.type = 'button';
    btnBullet.title = 'Маркированный список (выделите строки и нажмите)';
    btnBullet.style.cssText = 'padding: 6px 10px; background: var(--bg-hover); border: 1px solid var(--border-secondary); border-radius: 4px; color: var(--text-secondary); cursor: pointer; display:flex; align-items:center;';
    btnBullet.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <circle cx="4" cy="6" r="1.5" fill="currentColor" stroke="none"/>
            <line x1="9" y1="6" x2="20" y2="6"/>
            <circle cx="4" cy="12" r="1.5" fill="currentColor" stroke="none"/>
            <line x1="9" y1="12" x2="20" y2="12"/>
            <circle cx="4" cy="18" r="1.5" fill="currentColor" stroke="none"/>
            <line x1="9" y1="18" x2="20" y2="18"/>
        </svg>`;
    btnBullet.addEventListener('click', () => _openListMarkerModal(block, 'bullet'));

    const btnNumbered = document.createElement('button');
    btnNumbered.type = 'button';
    btnNumbered.title = 'Нумерованный список (выделите строки и нажмите)';
    btnNumbered.style.cssText = 'padding: 6px 10px; background: var(--bg-hover); border: 1px solid var(--border-secondary); border-radius: 4px; color: var(--text-secondary); cursor: pointer; display:flex; align-items:center;';
    btnNumbered.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <line x1="9" y1="6" x2="20" y2="6"/>
            <line x1="9" y1="12" x2="20" y2="12"/>
            <line x1="9" y1="18" x2="20" y2="18"/>
            <text x="1" y="8.5" font-size="7" fill="currentColor" stroke="none" font-family="sans-serif">1</text>
            <text x="1" y="14.5" font-size="7" fill="currentColor" stroke="none" font-family="sans-serif">2</text>
            <text x="1" y="20.5" font-size="7" fill="currentColor" stroke="none" font-family="sans-serif">3</text>
        </svg>`;
    btnNumbered.addEventListener('click', () => _openListMarkerModal(block, 'number'));

    formatToolbar.appendChild(btnBullet);
    formatToolbar.appendChild(btnNumbered);

    // Кнопка "Сделать ссылкой" — раньше была отдельным блоком ниже
    // ("Ссылки в тексте"), перенесена сюда как ещё одна кнопка панели.
    const btnLink = document.createElement('button');
    btnLink.type = 'button';
    btnLink.title = 'Сделать выделенный текст ссылкой';
    btnLink.style.cssText = 'padding: 6px 10px; background: var(--bg-hover); border: 1px solid var(--border-secondary); border-radius: 4px; color: var(--text-secondary); cursor: pointer; display:flex; align-items:center;';
    btnLink.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
        </svg>`;
    btnLink.addEventListener('click', () => {
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
    formatToolbar.appendChild(btnLink);

    formatGroup.appendChild(formatToolbar);

    const formatHint = document.createElement('div');
    formatHint.style.cssText = 'font-size: 11px; color: var(--text-muted); margin-top: 6px;';
    formatHint.textContent = 'Совет: выделите текст (или строки для списка) и нажмите кнопку';
    formatGroup.appendChild(formatHint);

    container.appendChild(formatGroup);

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

    if (!hiddenSettings.includes('fontSize')) {
        container.appendChild(
            createSettingFontSize('Размер шрифта', s.fontSize, block.id, 'fontSize',
                [10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24])
        );
    }
    if (!hiddenSettings.includes('lineHeight')) {
        container.appendChild(
            createSettingRange('Межстрочный интервал', s.lineHeight, block.id, 'lineHeight', 1, 2.5, 0.1)
        );
    }
    if (!hiddenSettings.includes('align')) {
        container.appendChild(
            createSettingSelect('Выравнивание', s.align, block.id, 'align', SELECT_OPTIONS.align)
        );
    }
    if (!hiddenSettings.includes('color')) {
        container.appendChild(createSettingInput('Цвет текста', s.color || '#e5e7eb', block.id, 'color', 'color'));
    }

    // Настройки маркеров списка — влияют только на пункты, добавленные
    // кнопками "Список"/"Нумерованный список" выше; null (не трогали) —
    // маркер наследует fontSize/color текста, как было раньше.
    container.appendChild(
        createSettingRange('Размер маркера', s.listBulletSize ?? s.fontSize, block.id, 'listBulletSize', 10, 40, 1, 'px')
    );
    container.appendChild(
        createSettingInput('Цвет маркера', s.listBulletColor || s.color || '#e5e7eb', block.id, 'listBulletColor', 'color')
    );
    container.appendChild(
        createSettingRange('Расстояние между пунктами списка', s.listItemSpacing ?? 4, block.id, 'listItemSpacing', 0, 20, 1, 'px')
    );
}

// Вставка текста в позицию курсора textarea
function insertAtCursor(ta, text) {
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    return ta.value.substring(0, start) + text + ta.value.substring(end);
}

// Модалка выбора маркера/формата нумерации списка — ensure-exists паттерн
// (по образцу ensureSharedEmailPreviewModal в emailGenerator.js): один
// DOM-узел переиспользуется, содержимое body перестраивается под режим.
function _ensureListMarkerModal() {
    let modal = document.getElementById('text-list-marker-modal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'text-list-marker-modal';
    modal.className = 'modal';
    modal.style.display = 'none';
    modal.innerHTML = `
        <div class="modal-overlay"></div>
        <div class="modal-content" style="max-width: 340px;">
            <div class="modal-header">
                <h2 id="text-list-marker-title">Маркер списка</h2>
                <button id="text-list-marker-close" type="button" class="modal-close" aria-label="Закрыть">&times;</button>
            </div>
            <div class="modal-body" id="text-list-marker-body"></div>
        </div>
    `;
    document.body.appendChild(modal);

    const closeModal = () => { modal.style.display = 'none'; };
    modal.querySelector('#text-list-marker-close').addEventListener('click', closeModal);
    modal.querySelector('.modal-overlay').addEventListener('click', closeModal);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.style.display === 'flex') closeModal();
    });

    return modal;
}

function _openListMarkerModal(block, mode) {
    const modal = _ensureListMarkerModal();
    const title = document.getElementById('text-list-marker-title');
    const body = document.getElementById('text-list-marker-body');
    body.innerHTML = '';

    const removeLabel = mode === 'bullet' ? 'Убрать маркер' : 'Убрать нумерацию';
    const makeRemoveBtn = () => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = removeLabel;
        btn.style.cssText = 'margin-top: 12px; width: 100%; padding: 8px; background: none; border: 1px solid var(--border-secondary); border-radius: 6px; color: var(--text-secondary); cursor: pointer; font-size: 12px;';
        btn.addEventListener('click', () => {
            _applyListMarker(block, '');
            modal.style.display = 'none';
        });
        return btn;
    };

    if (mode === 'bullet') {
        title.textContent = 'Маркер списка';

        const grid = document.createElement('div');
        grid.style.cssText = 'display: flex; flex-wrap: wrap; gap: 8px;';
        TextSanitizer.LIST_BULLET_MAP.forEach(entry => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.title = entry.title;
            btn.textContent = entry.glyph;
            btn.style.cssText = 'width: 48px; height: 48px; font-size: 20px; background: var(--surface-secondary); border: 1px solid var(--border-primary); border-radius: 8px; color: var(--text-primary); cursor: pointer;';
            btn.addEventListener('click', () => {
                _applyListMarker(block, entry.glyph);
                modal.style.display = 'none';
            });
            grid.appendChild(btn);
        });
        body.appendChild(grid);
    } else {
        title.textContent = 'Нумерованный список';

        const list = document.createElement('div');
        list.style.cssText = 'display: flex; flex-direction: column; gap: 6px;';
        TextSanitizer.LIST_NUMBER_STYLES.forEach(numStyle => {
            const btn = document.createElement('button');
            btn.type = 'button';
            const preview = [1, 2].map(n => TextSanitizer.formatListNumber(n, numStyle)).join('  ');
            btn.textContent = `${preview}  Текст`;
            btn.style.cssText = 'text-align: left; padding: 8px 12px; background: var(--surface-secondary); border: 1px solid var(--border-primary); border-radius: 6px; color: var(--text-primary); cursor: pointer; font-size: 13px;';
            btn.addEventListener('click', () => {
                _applyListMarker(block, numStyle);
                modal.style.display = 'none';
            });
            list.appendChild(btn);
        });
        body.appendChild(list);
    }

    body.appendChild(makeRemoveBtn());
    modal.style.display = 'flex';
}

// Подставляет/снимает маркер списка на строках textarea, затронутых
// текущим выделением (выделение расширяется до границ полных строк).
// prefixToken — то, что буквально подставляется в начало каждой строки
// (глиф маркера или токен формата нумерации — оба распознаются
// TextSanitizer.stripListMarkerLine/_BULLET_LINE_RE при sanitize), '' —
// чтобы снять маркер.
function _applyListMarker(block, prefixToken) {
    const ta = document.querySelector(
        `textarea[data-block-id="${block.id}"][data-setting-key="content"]`
    );
    if (!ta) return;

    const value = ta.value;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;

    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    let lineEnd = value.indexOf('\n', end);
    if (lineEnd === -1) lineEnd = value.length;

    const rebuilt = value.slice(lineStart, lineEnd).split('\n').map(line => {
        const bare = TextSanitizer.stripListMarkerLine(line);
        if (!prefixToken || bare.trim() === '') return bare;
        return `${prefixToken} ${bare}`;
    }).join('\n');

    const newValue = value.slice(0, lineStart) + rebuilt + value.slice(lineEnd);
    ta.value = newValue;

    const simpleHTML = TextSanitizer.sanitize(newValue, true);
    updateBlockSetting(block.id, 'content', simpleHTML);
    renderCanvas();

    ta.focus();
    ta.setSelectionRange(lineStart, lineStart + rebuilt.length);
}
