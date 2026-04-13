// settings/dividerSettings.js — renderDividerSettings

function renderDividerSettings(container, block) {
    const s = block.settings;

    // Выбор картинки-разделителя
    const imageGroup = document.createElement('div');
    imageGroup.className = 'setting-group';

    const imageLabel = document.createElement('label');
    imageLabel.className = 'setting-label';
    imageLabel.textContent = 'Выберите разделитель';
    imageGroup.appendChild(imageLabel);

    // Сетка с картинками-разделителями
    if (window.DIVIDER_IMAGES && window.DIVIDER_IMAGES.length > 0) {
        const dividerGrid = document.createElement('div');
        dividerGrid.className = 'divider-grid';
        dividerGrid.style.cssText = 'display: grid; grid-template-columns: 1fr; gap: 8px; margin-top: 8px; margin-bottom: 22px;';

        window.DIVIDER_IMAGES.forEach(divider => {
            const option = document.createElement('div');
            option.className = 'divider-option';

            const isSelected = s.image === divider.src;
            option.style.cssText = `
                padding: 8px;
                border: 2px solid ${isSelected ? 'var(--accent-primary)' : 'var(--border-secondary)'};
                border-radius: 8px;
                cursor: pointer;
                background: ${isSelected ? 'var(--bg-selected)' : 'var(--bg-secondary)'};
                transition: all 0.2s;
            `;

            const img = document.createElement('img');
            img.src = divider.src;
            img.alt = divider.label;
            img.style.cssText = 'width: 100%; height: auto; display: block; border-radius: 4px; margin-bottom: 8px;';

            option.appendChild(img);

            option.addEventListener('click', () => {
                updateBlockSetting(block.id, 'image', divider.src);
                updateBlockSetting(block.id, 'customImage', '');
                renderSettings();
            });

            option.addEventListener('mouseenter', () => {
                if (!isSelected) option.style.borderColor = 'var(--border-hover)';
            });
            option.addEventListener('mouseleave', () => {
                if (!isSelected) option.style.borderColor = 'var(--border-secondary)';
            });

            dividerGrid.appendChild(option);
        });

        imageGroup.appendChild(dividerGrid);
    } else {
        const noImages = document.createElement('p');
        noImages.textContent = 'Нет доступных разделителей';
        noImages.style.cssText = 'color: var(--text-muted); font-size: 13px; margin: 8px 0;';
        imageGroup.appendChild(noImages);
    }

    // Кнопка загрузки своей картинки
    imageGroup.appendChild(createFileUploadButton('Загрузить свой разделитель', block.id, 'customImage'));

    // Превью загруженной картинки
    if (s.customImage) {
        const previewLabel = document.createElement('label');
        previewLabel.className = 'setting-label';
        previewLabel.textContent = 'Загруженный разделитель:';
        previewLabel.style.marginTop = '12px';
        imageGroup.appendChild(previewLabel);

        const preview = document.createElement('img');
        preview.src = s.customImage;
        preview.style.cssText = 'width: 100%; height: auto; border-radius: 4px; margin-top: 8px; border: 2px solid var(--accent-primary);';
        imageGroup.appendChild(preview);
    }

    container.appendChild(imageGroup);
}
