// settings/spacerSettings.js — renderSpacerSettings

function renderSpacerSettings(container, block) {
    const s = block.settings;
    const hidden = (typeof ProfileLoader !== 'undefined' && ProfileLoader.loaded)
        ? ProfileLoader.getHiddenSettings('spacer') : [];

    if (!hidden.includes('height')) {
        container.appendChild(createSettingRange('Высота отступа', s.height, block.id, 'height', 8, 128));
    }
}

