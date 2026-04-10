// settings/bannerSettings.js — renderBannerSettings

function renderBannerSettings(container, block) {
    const s = block.settings;

    // === ОСНОВНЫЕ НАСТРОЙКИ ===
    const mainSection = document.createElement('div');
    mainSection.className = 'settings-section';

    mainSection.appendChild(
        createBannerHeightToggle('Высота баннера', s.bannerHeight || 250, block.id, 'bannerHeight')
    );

    mainSection.appendChild(
        createRightImageModeToggle(
            'Формат правой картинки',
            s.rightImageMode || 'mask',
            block.id
        )
    );

    const mainTitle = document.createElement('h3');
    mainTitle.textContent = 'Основные';
    mainTitle.style.cssText = 'color: #f9fafb; font-size: 14px; margin: 0 0 12px 0; padding-bottom: 8px; border-bottom: 1px solid #374151;';
    mainSection.appendChild(mainTitle);

    const mode = s.rightImageMode || 'mask';
    const gradEnabled = Boolean(s.gradientEnabled);

    // Цвет подложки — иконка градиента если режим "прямоугольник"
    mainSection.appendChild(createSettingInput(
        'Цвет подложки',
        s.backgroundColor || '#7700FF',
        block.id,
        'backgroundColor',
        'color',
        {
            showGradientBtn: mode === 'rounded',
            showBgImageBtn: mode === 'rounded',
            bgImageValue: s.bgImage || '',
            gradientEnabled: gradEnabled,
            onGradientClick: (anchorEl) => openGradientPopup(block, anchorEl)
        }
    ));

    // Цвет левого блока — иконка градиента если режим "маска"
    mainSection.appendChild(createSettingInput(
        'Цвет левого блока',
        s.leftBlockColor || '#1D2533',
        block.id,
        'leftBlockColor',
        'color',
        {
            showGradientBtn: mode === 'mask',
            gradientEnabled: gradEnabled,
            onGradientClick: (anchorEl) => openGradientPopup(block, anchorEl)
        }
    ));

    container.appendChild(mainSection);

    // === ПРАВАЯ КАРТИНКА ===
    const rightImageSection = document.createElement('div');
    rightImageSection.className = 'settings-section';
    rightImageSection.style.marginTop = '20px';

    const rightImageTitle = document.createElement('h3');
    rightImageTitle.textContent = 'Картинка справа';
    rightImageTitle.style.cssText = 'color: #f9fafb; font-size: 14px; margin: 0 0 12px 0; padding-bottom: 8px; border-bottom: 1px solid #374151;';
    rightImageSection.appendChild(rightImageTitle);

    // Сетка выбора
    if (window.BANNER_BACKGROUNDS && window.BANNER_BACKGROUNDS.length > 0) {
        const currentRightImage = s.rightImageCustom || s.rightImage || '';
        const grid = createImageGrid(window.BANNER_BACKGROUNDS, currentRightImage, block.id, 'rightImage', 'rightImageCustom');
        rightImageSection.appendChild(grid);
    }

    rightImageSection.appendChild(createFileUploadButton('Загрузить свою картинку', block.id, 'rightImageCustom'));

    if (s.rightImageCustom) {
        const preview = document.createElement('img');
        preview.src = s.rightImageCustom;
        preview.style.cssText = 'width: 100%; height: 60px; object-fit: cover; border-radius: 6px; margin-top: 8px; border: 2px solid #f97316;';
        rightImageSection.appendChild(preview);
    }

    // Настройки позиционирования картинки
    if (s.rightImage || s.rightImageCustom) {
        const positionTitle = document.createElement('div');
        positionTitle.textContent = 'Позиционирование';
        positionTitle.style.cssText = 'color: #9ca3af; font-size: 12px; margin-top: 16px; margin-bottom: 8px;';
        rightImageSection.appendChild(positionTitle);

        // Смещение X и Y
        const rightImagePositionInput = createPositionInput({
            blockId: block.id,
            xKey: 'rightImageX',
            yKey: 'rightImageY',
            xValue: s.rightImageX || 0,
            yValue: s.rightImageY || 0,
            xMin: -200,
            xMax: 200,
            yMin: -200,
            yMax: 200
        });
        rightImageSection.appendChild(rightImagePositionInput);

        // Поворот и масштаб
        rightImageSection.appendChild(createSettingRange('Поворот', s.rightImageRotate || 0, block.id, 'rightImageRotate', -45, 45, 1, '°'));
        rightImageSection.appendChild(createSettingRange('Масштаб', s.rightImageScale || 100, block.id, 'rightImageScale', 50, 150, 1, '%'));
    }

    container.appendChild(rightImageSection);

    // === ЛОГОТИП ===
    const logoSection = document.createElement('div');
    logoSection.className = 'settings-section';
    logoSection.style.marginTop = '20px';

    const logoTitle = document.createElement('h3');
    logoTitle.textContent = 'Логотип';
    logoTitle.style.cssText = 'color: #f9fafb; font-size: 14px; margin: 0 0 12px 0; padding-bottom: 8px; border-bottom: 1px solid #374151;';
    logoSection.appendChild(logoTitle);

    // Сетка выбора логотипов
    if (window.BANNER_LOGOS && window.BANNER_LOGOS.length > 0) {
        const currentLogo = s.logoCustom || s.logo || '';
        const grid = createImageGrid(window.BANNER_LOGOS, currentLogo, block.id, 'logo', 'logoCustom');
        logoSection.appendChild(grid);
    }

    logoSection.appendChild(createFileUploadButton('Загрузить свой логотип', block.id, 'logoCustom'));

    if (s.logoCustom) {
        const preview = document.createElement('img');
        preview.src = s.logoCustom;
        preview.style.cssText = 'width: 80px; height: 40px; object-fit: contain; border-radius: 6px; margin-top: 8px; border: 2px solid #f97316; background: #1e293b;';
        logoSection.appendChild(preview);
    }

    // Позиция логотипа
    const logoPositionLabel = document.createElement('div');
    logoPositionLabel.textContent = 'Позиция';
    logoPositionLabel.style.cssText = 'color: #9ca3af; font-size: 12px; margin-top: 12px; margin-bottom: 8px;';
    logoSection.appendChild(logoPositionLabel);

    const logoPositionInput = createPositionInput({
        blockId: block.id,
        xKey: 'logoX',
        yKey: 'logoY',
        xValue: s.logoX || 24,
        yValue: s.logoY || 24,
        xMin: 0,
        xMax: 600,
        yMin: 0,
        yMax: s.bannerHeight || 250
    });
    logoSection.appendChild(logoPositionInput);
    logoSection.appendChild(createSettingRange('Масштаб', s.logoScale || 100, block.id, 'logoScale', 50, 150, 1, '%'));

    container.appendChild(logoSection);

    // === ТЕКСТОВЫЕ ЭЛЕМЕНТЫ ===
    const textSection = document.createElement('div');
    textSection.className = 'settings-section';
    textSection.style.marginTop = '20px';

    const textTitle = document.createElement('h3');
    textTitle.textContent = 'Текстовые элементы';
    textTitle.style.cssText = 'color: #f9fafb; font-size: 14px; margin: 0 0 12px 0; padding-bottom: 8px; border-bottom: 1px solid #374151;';
    textSection.appendChild(textTitle);

    // Контейнер для текстовых элементов (drag&drop)
    const textElementsContainer = document.createElement('div');
    textElementsContainer.id = 'banner-text-elements';
    textElementsContainer.style.cssText = 'display: flex; flex-direction: column; gap: 12px;';

    const textElements = s.textElements || [];
    textElements.forEach((textEl, index) => {
        const elementCard = createTextElementCard(block.id, textEl, index, textElements.length);
        textElementsContainer.appendChild(elementCard);
    });

    textSection.appendChild(textElementsContainer);

    // Кнопка добавления
    const addButton = document.createElement('button');
    addButton.textContent = '+ Добавить текст';
    addButton.style.cssText = `
        width: 100%; padding: 12px; margin-top: 12px;
        background: #334155; border: 1px dashed #475569;
        border-radius: 8px; color: #e5e7eb; cursor: pointer;
        font-size: 13px; transition: all 0.2s;
    `;
    addButton.addEventListener('mouseenter', () => {
        addButton.style.background = '#3e4c5e';
        addButton.style.borderColor = '#f97316';
    });
    addButton.addEventListener('mouseleave', () => {
        addButton.style.background = '#334155';
        addButton.style.borderColor = '#475569';
    });
    addButton.addEventListener('click', () => {
        addBannerTextElement(block.id);
    });

    textSection.appendChild(addButton);
    container.appendChild(textSection);
}
