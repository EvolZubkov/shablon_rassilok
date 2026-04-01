// settings/spacerSettings.js — renderSpacerSettings

function renderSpacerSettings(container, block) {
    const s = block.settings;

    container.appendChild(createSettingRange('Высота отступа', s.height, block.id, 'height', 8, 128));
}

