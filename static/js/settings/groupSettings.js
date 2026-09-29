// settings/groupSettings.js — renderGroupSettings (для group_container)
//
// В отличие от renderColumnsSettings (columnsSettings.js), тут только одна
// колонка width:100 — ширины/индивидуальное выравнивание колонок и
// "фон на всю ширину 600px" тут не нужны, поэтому renderColumnsSettings не
// переиспользуется, а фон берётся напрямую из capabilities/background.js.

function renderGroupSettings(container, block) {
    if (!block.columns || !block.columns[0]) return;

    container.appendChild(
        createSettingRange('Зазор между блоками', block.settings.blockGap ?? 12, block.id, 'blockGap', 0, 60, 1, 'px')
    );

    const bgCap = typeof CapabilityRegistry !== 'undefined' ? CapabilityRegistry.get('background') : null;
    if (bgCap && bgCap.renderSettings) {
        bgCap.renderSettings(container, block);
    }

    // Full-width фон: тот же переключатель, что и в columnsSettings.js —
    // подложка растягивается на всю ширину письма (600px), сама группа
    // остаётся на текущей позиции (с боковым contentPadding, как обычно).
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

    const ungroupGroup = document.createElement('div');
    ungroupGroup.className = 'setting-group';
    ungroupGroup.style.cssText = 'margin-top: 12px;';

    const ungroupBtn = document.createElement('button');
    ungroupBtn.type = 'button';
    ungroupBtn.textContent = 'Разгруппировать';
    ungroupBtn.style.cssText = `
        width: 100%;
        padding: 10px;
        border-radius: 8px;
        border: 1px solid var(--border-secondary);
        background: var(--bg-hover);
        color: var(--text-secondary);
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
    `;
    ungroupBtn.addEventListener('click', () => {
        ungroupBlock(block.id);
    });

    ungroupGroup.appendChild(ungroupBtn);
    container.appendChild(ungroupGroup);
}
