// settings/buttonSettings.js — renderButtonSettings

function renderButtonSettings(container, block) {
    const s = block.settings;

    // Определяем МИФ/Альпина по тексту
    const autoStyle = getButtonAutoStyle(s);
    const isMif = autoStyle.isMif;
    const isAlpina = autoStyle.isAlpina;
    const isMifOrAlpina = autoStyle.isAuto;

    // Текст кнопки с ограничением 25 символов
    const textGroup = document.createElement('div');
    textGroup.className = 'setting-group';

    const textLabel = document.createElement('label');
    textLabel.className = 'setting-label';
    textLabel.textContent = 'Текст кнопки (макс. 25)';
    textGroup.appendChild(textLabel);

    const textInput = document.createElement('input');
    textInput.className = 'setting-input';
    textInput.type = 'text';
    textInput.value = s.text || '';
    textInput.maxLength = 25;
    textInput.addEventListener('input', (e) => {
        updateBlockSetting(block.id, 'text', e.target.value);
    });

    // Перерисовываем настройки только когда пользователь закончил ввод
    textInput.addEventListener('change', () => {
        renderSettings();
    });
    textGroup.appendChild(textInput);

    container.appendChild(textGroup);
    container.appendChild(createSettingInput('Ссылка', s.url, block.id, 'url', 'url'));

    // Цвет фона кнопки — скрываем для МИФ/Альпина
    if (!isMifOrAlpina) {
        const colorGroup = document.createElement('div');
        colorGroup.className = 'setting-group';

        const colorLabel = document.createElement('label');
        colorLabel.className = 'setting-label';
        colorLabel.textContent = 'Цвет кнопки';
        colorGroup.appendChild(colorLabel);

        const colorPalette = document.createElement('div');
        colorPalette.style.cssText = 'display: flex; gap: 8px; margin-top: 8px;';

        const buttonColors = ['#7700ff', '#ff4f12', '#282631', '#d0fd51'];
        buttonColors.forEach(color => {
            const colorBtn = document.createElement('button');
            colorBtn.style.cssText = `
            width: 36px;
            height: 36px;
            border-radius: 8px;
            border: 3px solid ${s.color === color ? 'var(--text-on-accent, #ffffff)' : 'transparent'};
            background: ${color};
            cursor: pointer;
            transition: border-color 0.2s;
        `;
            colorBtn.addEventListener('click', () => {
                updateBlockSetting(block.id, 'color', color);
                renderSettings();
            });
            colorPalette.appendChild(colorBtn);
        });

        colorGroup.appendChild(colorPalette);
        container.appendChild(colorGroup);
    } else {
        // Показываем инфо что цвет задан автоматически
        const infoGroup = document.createElement('div');
        infoGroup.className = 'setting-group';
        const infoText = document.createElement('div');
        infoText.style.cssText = 'font-size: 12px; color: var(--text-muted); padding: 8px; background: var(--bg-secondary); border: 1px solid var(--border-secondary); border-radius: 8px;';
        infoText.textContent = isMif ? '🟣 Кнопка МИФ — цвет и иконка заданы автоматически' : '🟠 Кнопка Альпина — цвет и иконка заданы автоматически';
        infoGroup.appendChild(infoText);
        container.appendChild(infoGroup);
    }

    container.appendChild(createSettingSelect('Положение кнопки', s.align || 'center', block.id, 'align', SELECT_OPTIONS.align));

    // Иконка кнопки — скрываем для МИФ/Альпина
    if (!isMifOrAlpina) {
        const iconGroup = document.createElement('div');
        iconGroup.className = 'setting-group';

        const labelEl = document.createElement('label');
        labelEl.className = 'setting-label';
        labelEl.textContent = 'Иконка кнопки';
        iconGroup.appendChild(labelEl);

        const hint = document.createElement('div');
        hint.style.cssText = 'font-size: 12px; color: var(--text-muted); margin-top: 4px;';
        hint.textContent = 'Выберите иконку из библиотеки или загрузите свою.';
        iconGroup.appendChild(hint);

        if (BUTTON_ICONS && BUTTON_ICONS.length > 0) {
            iconGroup.appendChild(createIconGrid(BUTTON_ICONS, s.icon, block.id, 'icon'));
        }

        const customLabel = document.createElement('label');
        customLabel.className = 'setting-label';
        customLabel.style.marginTop = '12px';
        customLabel.textContent = 'Своя иконка';
        iconGroup.appendChild(customLabel);

        iconGroup.appendChild(createFileUploadButton('Загрузить иконку', block.id, 'icon'));

        container.appendChild(iconGroup);
    }
}

// settingsPanels2.js - Продолжение панелей настроек
