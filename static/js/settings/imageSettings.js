// settings/imageSettings.js — renderImageSettings

function renderImageSettings(container, block) {
    const s = block.settings;

    const uploadGroup = document.createElement('div');
    uploadGroup.className = 'setting-group';

    const label = document.createElement('label');
    label.className = 'setting-label';
    label.textContent = 'Изображение';
    uploadGroup.appendChild(label);

    if (s.src) {
        const img = document.createElement('img');
        img.src = s.src;
        img.style.cssText = 'width: 100%; border-radius: 6px; margin-bottom: 8px;';
        uploadGroup.appendChild(img);
    }

    uploadGroup.appendChild(createFileUploadButton('Загрузить изображение', block.id, 'src'));
    container.appendChild(uploadGroup);

    container.appendChild(createSettingInput('Альтернативный текст', s.alt, block.id, 'alt'));
    container.appendChild(createSettingInput('Ширина (%, px или auto)', s.width, block.id, 'width'));
    container.appendChild(createSettingSelect('Выравнивание', s.align || 'center', block.id, 'align', SELECT_OPTIONS.align));

    // Скругление углов
    const radiusGroup = document.createElement('div');
    radiusGroup.className = 'setting-group';

    const radiusLabel = document.createElement('label');
    radiusLabel.className = 'setting-label';
    radiusLabel.textContent = 'Скругление углов';
    radiusGroup.appendChild(radiusLabel);

    // Переключатель режима
    const modeButtons = document.createElement('div');
    modeButtons.style.cssText = 'display: flex; gap: 8px; margin: 8px 0;';

    const btnAll = document.createElement('button');
    btnAll.textContent = 'Все углы';
    btnAll.style.cssText = `
        flex: 1; padding: 8px; border-radius: 6px; cursor: pointer; font-size: 12px;
        border: 1px solid ${s.borderRadiusMode === 'all' ? 'var(--accent-primary)' : 'var(--border-secondary)'};
        background: ${s.borderRadiusMode === 'all' ? 'var(--accent-primary)' : 'var(--bg-hover)'};
        color: #ffffff;
    `;
    btnAll.addEventListener('click', () => {
        updateBlockSetting(block.id, 'borderRadiusMode', 'all');
        renderSettings();
    });

    const btnEach = document.createElement('button');
    btnEach.textContent = 'Каждый угол';
    btnEach.style.cssText = `
        flex: 1; padding: 8px; border-radius: 6px; cursor: pointer; font-size: 12px;
        border: 1px solid ${s.borderRadiusMode === 'each' ? 'var(--accent-primary)' : 'var(--border-secondary)'};
        background: ${s.borderRadiusMode === 'each' ? 'var(--accent-primary)' : 'var(--bg-hover)'};
        color: #ffffff;
    `;
    btnEach.addEventListener('click', () => {
        updateBlockSetting(block.id, 'borderRadiusMode', 'each');
        renderSettings();
    });

    modeButtons.appendChild(btnAll);
    modeButtons.appendChild(btnEach);
    radiusGroup.appendChild(modeButtons);

    if (s.borderRadiusMode === 'each') {
        // 4 отдельных поля
        const cornersGrid = document.createElement('div');
        cornersGrid.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; gap: 8px;';

        const corners = [
            { key: 'borderRadiusTL', label: '↖ Верх-лево' },
            { key: 'borderRadiusTR', label: '↗ Верх-право' },
            { key: 'borderRadiusBL', label: '↙ Низ-лево' },
            { key: 'borderRadiusBR', label: '↘ Низ-право' }
        ];

        corners.forEach(corner => {
            const cornerDiv = document.createElement('div');
            cornerDiv.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';

            const cornerLabel = document.createElement('span');
            cornerLabel.textContent = corner.label;
            cornerLabel.style.cssText = 'font-size: 11px; color: var(--text-muted);';

            const cornerInput = document.createElement('input');
            cornerInput.type = 'number';
            cornerInput.min = 0;
            cornerInput.max = 200;
            cornerInput.value = s[corner.key] || 0;
            cornerInput.style.cssText = 'width: 100%; padding: 8px; border-radius: 6px; border: 1px solid var(--border-secondary); background: var(--bg-input); color: var(--text-secondary); font-size: 14px;';
            cornerInput.addEventListener('input', (e) => {
                updateBlockSetting(block.id, corner.key, parseInt(e.target.value) || 0);
            });

            cornerDiv.appendChild(cornerLabel);
            cornerDiv.appendChild(cornerInput);
            cornersGrid.appendChild(cornerDiv);
        });

        radiusGroup.appendChild(cornersGrid);
    } else {
        // Одно поле для всех
        const allInput = document.createElement('input');
        allInput.type = 'number';
        allInput.min = 0;
        allInput.max = 200;
        allInput.value = s.borderRadiusAll || 0;
        allInput.placeholder = 'px';
        allInput.style.cssText = 'width: 100%; padding: 10px; border-radius: 6px; border: 1px solid var(--border-secondary); background: var(--bg-input); color: var(--text-secondary); font-size: 14px;';
        allInput.addEventListener('input', (e) => {
            updateBlockSetting(block.id, 'borderRadiusAll', parseInt(e.target.value) || 0);
        });
        radiusGroup.appendChild(allInput);
    }

    container.appendChild(radiusGroup);

    // Соотношение сторон
    const aspectRatioOptions = [
        { value: 'original', label: 'Оригинал' },
        { value: '16:9', label: '16:9 (широкий)' },
        { value: '4:3', label: '4:3 (стандарт)' },
        { value: '3:2', label: '3:2 (фото)' },
        { value: '1:1', label: '1:1 (квадрат)' }
    ];
    container.appendChild(createSettingSelect('Соотношение сторон', s.aspectRatio || 'original', block.id, 'aspectRatio', aspectRatioOptions));
    container.appendChild(createSettingInput('Ссылка на картинке', s.url || '', block.id, 'url'));
}
