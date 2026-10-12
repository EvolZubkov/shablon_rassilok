// settings/settingsUtils.js — createImageGrid, createCompactNumberInput
// Математика градиента вынесена в shared/bannerGradient.js

// Создание сетки картинок для выбора
function createImageGrid(images, currentValue, blockId, settingKey, customKey) {
    const grid = document.createElement('div');
    grid.style.cssText = 'display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 12px;';

    images.forEach(img => {
        const option = document.createElement('div');
        const isSelected = currentValue === img.src;
        option.dataset.selected = isSelected ? 'true' : 'false';
        option.style.cssText = `
            border: 2px solid ${isSelected ? 'var(--accent-primary)' : 'var(--border-primary)'};
            border-radius: 8px; overflow: hidden; cursor: pointer;
            transition: all 0.2s; aspect-ratio: 16/9;
            background: var(--bg-secondary); position: relative;
        `;

        const imgEl = document.createElement('img');
        imgEl.src = img.src;
        imgEl.alt = img.label;
        imgEl.style.cssText = 'width: 100%; height: 100%; object-fit: cover;';
        option.appendChild(imgEl);

        if (img.userOwned) {
            const badge = document.createElement('span');
            badge.className = 'user-owned-badge';
            badge.textContent = 'Мои';
            option.appendChild(badge);
        }

        option.addEventListener('click', () => {
            // Clear customKey directly in block.settings to avoid a redundant
            // renderBannerToDataUrl call that races with the main update below.
            if (customKey) {
                const block = AppState.findBlockById(blockId);
                if (block) block.settings[customKey] = '';
            }
            updateBlockSetting(blockId, settingKey, img.src);
            renderSettings();
        });

        option.addEventListener('mouseenter', () => {
            if (option.dataset.selected !== 'true') option.style.borderColor = 'var(--border-hover)';
        });
        option.addEventListener('mouseleave', () => {
            if (option.dataset.selected !== 'true') option.style.borderColor = 'var(--border-primary)';
        });

        grid.appendChild(option);
    });

    return grid;
}

// Компактный числовой инпут
function createCompactNumberInput(label, value, blockId, settingKey) {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';

    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    labelEl.style.cssText = 'font-size: 11px; color: var(--text-muted);';

    const input = document.createElement('input');
    input.type = 'number';
    input.value = value;
    input.style.cssText = 'width: 100%; padding: 8px; border-radius: 6px; border: 1px solid var(--border-secondary); background: var(--bg-input); color: var(--text-secondary); font-size: 13px;';
    input.addEventListener('input', (e) => {
        updateBlockSetting(blockId, settingKey, parseInt(e.target.value) || 0);
    });
    attachDragScrubToNumberControl(wrapper, input, {
        onApply: (next) => updateBlockSetting(blockId, settingKey, parseInt(next, 10) || 0)
    });

    wrapper.appendChild(labelEl);
    wrapper.appendChild(input);
    return wrapper;
}

// Карточка текстового элемента
