// settings/columnsSettings.js — renderColumnsSettings

/**
 * Ширина колонок для ряда из ровно 2 колонок — пресеты + слайдер
 * (левая/правая, в сумме всегда 100%).
 */
function renderTwoColumnWidths(container, block) {
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
    info.style.cssText = 'margin-bottom: 12px; color: var(--text-muted); font-size: 13px;';
    group.appendChild(info);

    // Кнопки-пресеты
    const presetsContainer = document.createElement('div');
    presetsContainer.style.cssText = 'display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 12px;';

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
        btn.style.cssText = 'padding: 8px; background: var(--bg-hover); color: var(--text-secondary); border: 1px solid var(--border-secondary); border-radius: 4px; cursor: pointer; font-size: 11px; transition: all 0.2s;';

        // Подсветка активного пресета
        if (leftCol.width === preset.left) {
            btn.style.background = 'var(--accent-primary)';
            btn.style.borderColor = 'var(--accent-primary)';
            btn.style.color = '#ffffff';
            btn.style.fontWeight = '600';
        }

        btn.addEventListener('mouseenter', () => {
            if (leftCol.width !== preset.left) {
                btn.style.background = 'var(--bg-selected)';
                btn.style.borderColor = 'var(--border-hover)';
            }
        });

        btn.addEventListener('mouseleave', () => {
            if (leftCol.width !== preset.left) {
                btn.style.background = 'var(--bg-hover)';
                btn.style.borderColor = 'var(--border-secondary)';
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
    sliderLabel.style.cssText = 'font-size: 12px; color: var(--text-muted); margin-bottom: 8px;';
    group.appendChild(sliderLabel);

    const range = document.createElement('input');
    range.type = 'range';
    range.min = 0;
    range.max = 100;
    range.value = leftCol.width;
    range.className = 'setting-range';

    // ИСПРАВЛЕНИЕ: используем 'input' для плавности + 'change' для финального рендера
    let updateTimeout;
    range.addEventListener('input', (e) => {
        let left = parseInt(e.target.value, 10);
        if (left < 0) left = 0;
        if (left > 100) left = 100;
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

/**
 * Ширина колонок для ряда из 3+ колонок — по числовому полю на колонку,
 * пользователь вводит значение сам. Сумма не может превышать 100%: при
 * вводе значение обрезается до того, что ещё осталось от 100 за вычетом
 * остальных колонок — так инвариант держится сам, без отдельного
 * предупреждения/блокировки. Дефолт при отсутствии сохранённого значения —
 * 33% для 3 колонок, 25% для 4+ (см. defaultWidthFor).
 */
function renderMultiColumnWidths(container, block) {
    const columns = block.columns;
    const defaultWidthFor = (n) => (n === 3 ? 33 : 25);

    const group = document.createElement('div');
    group.className = 'setting-group';

    const label = document.createElement('label');
    label.className = 'setting-label';
    label.textContent = 'Ширина колонок';
    group.appendChild(label);

    const sumInfo = document.createElement('div');
    sumInfo.className = 'columns-width-info';
    sumInfo.style.cssText = 'margin-bottom: 12px; color: var(--text-muted); font-size: 13px;';
    const renderSum = () => {
        const sum = columns.reduce((acc, c) => acc + (Number(c.width) || 0), 0);
        sumInfo.textContent = `Сумма: ${sum}%`;
    };
    renderSum();
    group.appendChild(sumInfo);

    const fieldsContainer = document.createElement('div');
    fieldsContainer.style.cssText = `display: grid; grid-template-columns: repeat(${columns.length}, 1fr); gap: 8px;`;

    columns.forEach((col, i) => {
        if (col.width == null) col.width = defaultWidthFor(columns.length);

        const fieldWrap = document.createElement('div');

        const fieldLabel = document.createElement('div');
        fieldLabel.textContent = `Колонка ${i + 1}`;
        fieldLabel.style.cssText = 'font-size: 11px; color: var(--text-muted); margin-bottom: 4px;';
        fieldWrap.appendChild(fieldLabel);

        const input = document.createElement('input');
        input.type = 'number';
        input.min = 0;
        input.max = 100;
        input.value = col.width;
        input.className = 'setting-input';

        let updateTimeout;
        input.addEventListener('input', (e) => {
            let val = parseInt(e.target.value, 10);
            if (isNaN(val) || val < 0) val = 0;

            const othersSum = columns.reduce((acc, c, j) => j === i ? acc : acc + (Number(c.width) || 0), 0);
            const maxAllowed = Math.max(0, 100 - othersSum);
            if (val > maxAllowed) val = maxAllowed;

            col.width = val;
            if (Number(e.target.value) !== val) input.value = val;
            renderSum();

            clearTimeout(updateTimeout);
            updateTimeout = setTimeout(() => {
                renderCanvas();
            }, 50);
        });

        input.addEventListener('change', () => {
            clearTimeout(updateTimeout);
            renderCanvas();
            renderSettings();
        });

        fieldWrap.appendChild(input);
        fieldsContainer.appendChild(fieldWrap);
    });

    group.appendChild(fieldsContainer);
    container.appendChild(group);
}

function renderColumnsSettings(container, block) {
    if (!block.columns || block.columns.length < 2) return;

    if (block.columns.length === 2) {
        renderTwoColumnWidths(container, block);
    } else {
        renderMultiColumnWidths(container, block);
    }

    // Vertical alignment of column content. 4-я кнопка "Индивидуально" —
    // это не значение colValign, а отдельный режим отображения панели:
    // показывает список колонок ниже, каждая ce своим переопределением
    // (column.valign, хранится на самой колонке — колонки мутируются
    // напрямую, как и ширина в renderMultiColumnWidths/renderTwoColumnWidths).
    // colValign остаётся общим fallback'ом для колонок без переопределения.
    const alignGroup = document.createElement('div');
    alignGroup.className = 'setting-group';

    const alignLabel = document.createElement('label');
    alignLabel.className = 'setting-label';
    alignLabel.textContent = 'Выравнивание содержимого';
    alignGroup.appendChild(alignLabel);

    const alignBtns = document.createElement('div');
    alignBtns.style.cssText = 'display:grid;grid-template-columns:repeat(4,1fr);gap:8px;';

    const perColumnExpanded = block.settings.colPerAlignExpanded === true;
    const currentValign = block.settings.colValign || 'top';
    const alignOptions = [
        { value: 'top',    label: 'Сверху' },
        { value: 'middle', label: 'Центр'  },
        { value: 'bottom', label: 'Снизу'  },
        { value: 'individual', label: 'Индивидуально' },
    ];
    alignOptions.forEach(opt => {
        const isIndividualBtn = opt.value === 'individual';
        const isActive = isIndividualBtn ? perColumnExpanded : (!perColumnExpanded && currentValign === opt.value);

        const btn = document.createElement('button');
        btn.textContent = opt.label;
        btn.style.cssText = `padding:8px; border-radius:4px; cursor:pointer; font-size:11px;
            background:${isActive ? 'var(--accent-primary)' : 'var(--bg-hover)'};
            border:1px solid ${isActive ? 'var(--accent-primary)' : 'var(--border-secondary)'};
            color:${isActive ? '#fff' : 'var(--text-secondary)'};
            font-weight:${isActive ? '600' : 'normal'};`;
        btn.addEventListener('click', () => {
            if (isIndividualBtn) {
                updateBlockSetting(block.id, 'colPerAlignExpanded', true);
            } else {
                updateBlockSetting(block.id, 'colValign', opt.value);
                updateBlockSetting(block.id, 'colPerAlignExpanded', false);
            }
            renderCanvas();
            renderSettings();
        });
        alignBtns.appendChild(btn);
    });
    alignGroup.appendChild(alignBtns);
    container.appendChild(alignGroup);

    // Список колонок со своим выравниванием — показывается только в
    // режиме "Индивидуально". undefined/null у column.valign — "как в
    // ряду" (наследует colValign).
    if (perColumnExpanded) {
        const perColumnGroup = document.createElement('div');
        perColumnGroup.className = 'setting-group';

        const perColumnOptions = [
            { value: null,     label: 'Как в ряду' },
            { value: 'top',    label: 'Сверху' },
            { value: 'middle', label: 'Центр' },
            { value: 'bottom', label: 'Снизу' },
        ];

        block.columns.forEach((column, colIndex) => {
            const colWrap = document.createElement('div');
            colWrap.style.cssText = colIndex > 0 ? 'margin-top:8px;' : '';

            const colLabel = document.createElement('div');
            colLabel.textContent = `Колонка ${colIndex + 1}`;
            colLabel.style.cssText = 'font-size:11px; color:var(--text-muted); margin-bottom:4px;';
            colWrap.appendChild(colLabel);

            const colBtns = document.createElement('div');
            colBtns.style.cssText = 'display:grid; grid-template-columns:repeat(4,1fr); gap:6px;';

            const currentColValign = column.valign ?? null;
            perColumnOptions.forEach(opt => {
                const btn = document.createElement('button');
                btn.textContent = opt.label;
                const isActive = currentColValign === opt.value;
                btn.style.cssText = `padding:6px; border-radius:4px; cursor:pointer; font-size:10px;
                    background:${isActive ? 'var(--accent-primary)' : 'var(--bg-hover)'};
                    border:1px solid ${isActive ? 'var(--accent-primary)' : 'var(--border-secondary)'};
                    color:${isActive ? '#fff' : 'var(--text-secondary)'};
                    font-weight:${isActive ? '600' : 'normal'};`;
                btn.addEventListener('click', () => {
                    if (opt.value === null) {
                        delete column.valign;
                    } else {
                        column.valign = opt.value;
                    }
                    renderCanvas();
                    renderSettings();
                });
                colBtns.appendChild(btn);
            });

            colWrap.appendChild(colBtns);
            perColumnGroup.appendChild(colWrap);
        });

        container.appendChild(perColumnGroup);
    }

    // Зазоры: между колонками (по горизонтали) и между блоками внутри
    // одной колонки (по вертикали). Раньше оба были жёстко зашиты в CSS/JS
    // (12px в канвасе, 10px в письме — несовпадение) — теперь настраиваемы
    // и используют одно и то же значение по умолчанию (12) и в канвасе
    // (canvasRenderer.js renderColumnsPreview), и в письме
    // (emailGenerator.js generateColumnsHTML).
    container.appendChild(createSettingRange('Зазор между колонками', block.settings.colGap ?? 12, block.id, 'colGap', 0, 60, 1, 'px'));
    container.appendChild(createSettingRange('Зазор между блоками в колонке', block.settings.blockGap ?? 12, block.id, 'blockGap', 0, 60, 1, 'px'));

    // Background capability — доступно напрямую, без профиля
    const bgCap = typeof CapabilityRegistry !== 'undefined' ? CapabilityRegistry.get('background') : null;
    if (bgCap && bgCap.renderSettings) {
        bgCap.renderSettings(container, block);
    }

    // Full-width фон: только цвет подложки растягивается на всю ширину письма (600px),
    // сами колонки остаются на текущей позиции (с боковым contentPadding, как обычно).
    if (block.settings.bgEnabled !== false && block.settings.bgColor) {
        const fwGroup = document.createElement('div');
        fwGroup.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px;';

        const fwLabel = document.createElement('label');
        fwLabel.className = 'setting-label';
        fwLabel.textContent = 'Фон на всю ширину (600px)';
        fwLabel.style.cssText = 'margin:0;';
        fwGroup.appendChild(fwLabel);

        const fwEnabled = !!block.settings.bgFullWidth;
        const fwBtn = document.createElement('button');
        fwBtn.type = 'button';
        fwBtn.title = fwEnabled ? 'Отключить растягивание фона' : 'Растянуть фон на всю ширину';
        fwBtn.textContent = fwEnabled ? 'Вкл' : 'Выкл';
        fwBtn.style.cssText = `
            flex-shrink:0; padding:2px 8px; border-radius:4px; cursor:pointer;
            font-size:10px; font-weight:600; letter-spacing:.04em; text-transform:uppercase;
            border:1px solid ${fwEnabled ? 'var(--accent-primary)' : 'var(--border-secondary)'};
            background:${fwEnabled ? 'var(--accent-primary)' : 'var(--bg-hover)'};
            color:${fwEnabled ? '#fff' : 'var(--text-muted)'};
        `;
        fwBtn.addEventListener('click', () => {
            updateBlockSetting(block.id, 'bgFullWidth', !fwEnabled);
            renderCanvas();
            renderSettings();
        });
        fwGroup.appendChild(fwBtn);

        container.appendChild(fwGroup);
    }
}
