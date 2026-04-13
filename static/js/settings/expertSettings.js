// settings/expertSettings.js — renderExpertSettings, createExpertAlignToggle

function renderExpertSettings(container, block) {
    const s = block.settings;

    container.appendChild(
        createExpertVariantToggle('Режим блока', s.variant || 'full', block.id)
    );

    // Выравнивание (актуально для lite)
    if ((s.variant || 'full') === 'lite') {
        container.appendChild(
            createExpertAlignToggle('Выравнивание', s.align || 'left', block.id)
        );
    }

    // Превью фото
    const previewGroup = document.createElement('div');
    previewGroup.className = 'setting-group';
    previewGroup.id = `expert-photo-preview-${block.id}`;
    previewGroup.innerHTML = `
        <label class="setting-label">Фото эксперта</label>
        <div class="photo-preview-box">
            <div class="photo-mask">
                <img id="expert-photo-img-${block.id}" src="${s.photo}" style="width: 100%; height: 100%; object-fit: cover; transform: rotate(-45deg) scale(${s.scale / 100}) translate(${s.positionX}%, ${s.positionY}%);">
            </div>
        </div>
    `;
    container.appendChild(previewGroup);
    if (typeof updateExpertSettingsPreview === 'function') {
        updateExpertSettingsPreview(block.id);
    }

    container.appendChild(createFileUploadButton('Загрузить фото', block.id, 'photo'));

    // Настройки фото
    const photoSettingsGroup = document.createElement('div');
    photoSettingsGroup.className = 'expert-photo-settings';

    const photoPositionInput = createPositionInput({
        blockId: block.id,
        xKey: 'positionX',
        yKey: 'positionY',
        xValue: s.positionX || 0,
        yValue: s.positionY || 0,
        xMin: -50,
        xMax: 50,
        yMin: -50,
        yMax: 50
    });
    photoSettingsGroup.appendChild(photoPositionInput);
    photoSettingsGroup.appendChild(createSettingRange('Масштаб', s.scale, block.id, 'scale', 10, 500));
    container.appendChild(photoSettingsGroup);

    // Выбор значка
    const badgeGroup = document.createElement('div');
    badgeGroup.className = 'setting-group expert-badge-settings';

    const badgeLabel = document.createElement('label');
    badgeLabel.className = 'setting-label';
    badgeLabel.textContent = 'Значок на фото';
    badgeGroup.appendChild(badgeLabel);

    badgeGroup.appendChild(createIconGrid(EXPERT_BADGE_ICONS, s.badgeIcon, block.id, 'badgeIcon'));
    // ДОБАВИТЬ ЭТИ СТРОКИ:
    // Кнопка загрузки своего значка
    badgeGroup.appendChild(createFileUploadButton('Загрузить свой значок', block.id, 'badgeIcon'));

    // ДОБАВИТЬ ЭТИ СТРОКИ:
    // Настройки положения значка (только если значок выбран)
    if (s.badgeIcon) {
        const badgePositionGroup = document.createElement('div');
        badgePositionGroup.style.cssText = 'margin-top: 12px; padding: 12px; background: var(--bg-secondary); border: 1px solid var(--border-secondary); border-radius: 8px;';

        const badgePositionLabel = document.createElement('div');
        badgePositionLabel.className = 'setting-label';
        badgePositionLabel.textContent = 'Положение значка';
        badgePositionLabel.style.marginBottom = '8px';
        badgePositionGroup.appendChild(badgePositionLabel);

        // Кнопки пресетов положения
        const positionPresets = [
            { label: 'Снизу справа', x: 100, y: 100 },
            { label: 'Снизу слева', x: 0, y: 100 },
            { label: 'Сверху справа', x: 100, y: 0 },
            { label: 'Сверху слева', x: 0, y: 0 },
        ];

        const presetsContainer = document.createElement('div');
        presetsContainer.style.cssText = 'display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 12px;';

        positionPresets.forEach(preset => {
            const btn = document.createElement('button');
            btn.textContent = preset.label;
            btn.style.cssText = 'padding: 8px; background: var(--bg-hover); color: var(--text-secondary); border: 1px solid var(--border-secondary); border-radius: 4px; cursor: pointer; font-size: 11px;';

            // Подсветка активного пресета
            if (s.badgePositionX === preset.x && s.badgePositionY === preset.y) {
                btn.style.background = 'var(--accent-primary)';
                btn.style.borderColor = 'var(--accent-primary)';
                btn.style.color = '#ffffff';
            }

            btn.addEventListener('click', () => {
                updateBlockSetting(block.id, 'badgePositionX', preset.x);
                updateBlockSetting(block.id, 'badgePositionY', preset.y);
                renderSettings();
            });

            presetsContainer.appendChild(btn);
        });

        badgePositionGroup.appendChild(presetsContainer);

        // Точная настройка
        const badgePositionInput = createPositionInput({
            blockId: block.id,
            xKey: 'badgePositionX',
            yKey: 'badgePositionY',
            xValue: s.badgePositionX ?? 100,
            yValue: s.badgePositionY ?? 100,
            xMin: 0,
            xMax: 100,
            yMin: 0,
            yMax: 100
        });
        badgePositionGroup.appendChild(badgePositionInput);

        badgeGroup.appendChild(badgePositionGroup);
    }
    const removeBadgeBtn = document.createElement('button');
    removeBadgeBtn.type = 'button';
    removeBadgeBtn.textContent = 'Убрать значок';
    removeBadgeBtn.style.cssText = 'width: 100%; min-height: 36px; padding: 8px 12px; background: var(--accent-danger); color: white; border: none; border-radius: 6px; cursor: pointer;';
    removeBadgeBtn.disabled = !s.badgeIcon;
    if (!s.badgeIcon) {
        removeBadgeBtn.style.opacity = '0.5';
        removeBadgeBtn.style.cursor = 'not-allowed';
    }
    removeBadgeBtn.addEventListener('click', () => {
        if (!block.settings.badgeIcon) return;
        block.settings.badgeIcon = '';
        block.settings.renderedExpert = null;
        updateBlockSetting(block.id, 'badgeIcon', '');
        renderCanvas();
        renderSettings();
    });
    badgeGroup.appendChild(removeBadgeBtn);

    container.appendChild(badgeGroup);

    // === ТЕКСТОВЫЕ НАСТРОЙКИ (скрываем в lite) ===
    const isLite = (s.variant || 'full') === 'lite';

    const textWrap = document.createElement('div');
    textWrap.className = 'expert-text-settings';
    if (isLite) textWrap.style.display = 'none';

    // Текстовые поля
    textWrap.appendChild(createSettingInput('Имя', s.name, block.id, 'name'));
    textWrap.appendChild(createSettingInput('Должность', s.title, block.id, 'title'));
    textWrap.appendChild(createSettingTextarea('Описание', s.bio, block.id, 'bio', 3));

    container.appendChild(textWrap);

    // === ЦВЕТА / ФОН (фон оставляем видимым всегда) ===

    // Цвет фона + кнопка "Бесцветный фон"
    const bgColorGroup = createSettingInput(
        'Цвет фона',
        s.bgColor && s.bgColor !== 'transparent' ? s.bgColor : '#FFFFFF',
        block.id,
        'bgColor',
        'color'
    );

    const noBgBtn = document.createElement('button');
    noBgBtn.type = 'button';
    noBgBtn.textContent = 'Бесцветный фон';
    noBgBtn.style.cssText =
        'margin-top:8px; width:100%; padding:8px 12px; ' +
        'border-radius:4px; border:1px solid var(--border-secondary); background:none; ' +
        'color:var(--text-secondary); font-size:12px; cursor:pointer;';

    noBgBtn.addEventListener('click', () => {
        updateBlockSetting(block.id, 'bgColor', 'transparent');
        renderSettings();
    });

    bgColorGroup.appendChild(noBgBtn);
    container.appendChild(bgColorGroup);



}

function createExpertAlignToggle(label, value, blockId) {
    const group = document.createElement('div');
    group.className = 'setting-group';

    const labelEl = document.createElement('label');
    labelEl.className = 'setting-label';
    labelEl.textContent = label;

    const wrap = document.createElement('div');
    wrap.style.cssText = `
        display:flex; align-items:center; border:1px solid var(--border-secondary);
        border-radius:999px; padding:4px; background:var(--bg-primary);
    `;

    const mkBtn = (mode, text) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = text;
        const active = (value === mode);
        b.style.cssText = `
            min-width:90px; padding:8px 10px; border-radius:999px;
            border:0; cursor:pointer; font-size:13px;
            background:${active ? 'var(--accent-primary)' : 'transparent'};
            color:${active ? '#ffffff' : 'var(--text-secondary)'};
        `;
        b.onclick = () => {
            updateBlockSetting(blockId, 'align', mode);
            renderCanvas();     // чтобы сразу видно было на холсте
            renderSettings();   // чтобы кнопки подсветились
        };
        return b;
    };

    wrap.appendChild(mkBtn('left', 'Left'));
    wrap.appendChild(mkBtn('center', 'Center'));
    wrap.appendChild(mkBtn('right', 'Right'));

    group.appendChild(labelEl);
    group.appendChild(wrap);
    return group;
}
