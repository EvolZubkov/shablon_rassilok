// settings/columnsSettings.js — renderColumnsSettings

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
