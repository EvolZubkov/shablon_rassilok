// settingsPanels.js — диспетчер настроек блоков.
//
// Файл разбит на модули в папке settings/:
//   settings/settingsUtils.js      — математика градиента, createImageGrid, createCompactNumberInput
//   settings/settingsShared.js     — createTextElementCard, createToggleSection, createFileUploadButton
//   settings/gradientInline.js     — inline Figma-редактор градиента
//   settings/gradientPopup.js      — popup-редактор градиента
//   settings/bannerSettings.js     — renderBannerSettings
//   settings/bannerHelpers.js      — addBannerTextElement, deleteBannerTextElement и др.
//   settings/bannerToggles.js      — createBannerHeightToggle, createRightImageModeToggle, createExpertVariantToggle
//   settings/textSettings.js       — renderTextSettings
//   settings/headingSettings.js    — renderHeadingSettings
//   settings/buttonSettings.js     — renderButtonSettings
//   settings/listSettings.js       — renderListSettings
//   settings/expertSettings.js     — renderExpertSettings
//   settings/importantSettings.js  — renderImportantSettings
//   settings/dividerSettings.js    — renderDividerSettings
//   settings/imageSettings.js      — renderImageSettings
//   settings/spacerSettings.js     — renderSpacerSettings
//   settings/columnsSettings.js    — renderColumnsSettings
//
// Все модули подключаются в index.html до этого файла.

// settingsPanels.js - Генерация панелей настроек для каждого типа блока

function renderSettings() {
    const settingsContent = document.getElementById('settings-content');
    const panelTitle = document.getElementById('settings-panel-title');

    if (!AppState.selectedBlockId) {
        if (panelTitle) panelTitle.textContent = 'Настройки';
        settingsContent.innerHTML = `
            <div class="settings-empty">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                    <circle cx="12" cy="12" r="3"></circle>
                    <path d="M12 1v6m0 6v6m0-6h6m-6 0H6"></path>
                </svg>
                <h3>Нет выбранного блока</h3>
                <p>Выберите блок на холсте, чтобы редактировать его текст, размеры и стиль.</p>
            </div>
        `;
        return;
    }

    const block = AppState.findBlockById(AppState.selectedBlockId);
    if (!block) return;

    if (panelTitle) panelTitle.textContent = `Настройки: ${getBlockTypeName(block.type)}`;

    settingsContent.innerHTML = '';

    // Генерируем настройки в зависимости от типа блока
    switch (block.type) {
        case 'banner':
            renderBannerSettings(settingsContent, block);
            break;
        case 'text':
            renderTextSettings(settingsContent, block);
            break;
        case 'heading':
            renderHeadingSettings(settingsContent, block);
            break;
        case 'button':
            renderButtonSettings(settingsContent, block);
            break;
        case 'list':
            renderListSettings(settingsContent, block);
            break;
        case 'expert':
            renderExpertSettings(settingsContent, block);
            break;
        case 'important':
            renderImportantSettings(settingsContent, block);
            break;
        case 'divider':
            renderDividerSettings(settingsContent, block);
            break;
        case 'image':
            renderImageSettings(settingsContent, block);
            break;
        case 'spacer':
            renderSpacerSettings(settingsContent, block);
            break;
    }

    // Если выбран контейнер с колонками, показываем настройки колонок
    const mainBlock = AppState.blocks.find(b => b.id === AppState.selectedBlockId);
    if (mainBlock && mainBlock.columns) {
        renderColumnsSettings(settingsContent, mainBlock);
    }
}
