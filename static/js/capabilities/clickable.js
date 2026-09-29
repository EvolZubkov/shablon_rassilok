// capabilities/clickable.js — capability «Кликабельная область»

CapabilityRegistry.register({
    id: 'clickable',
    label: 'Кликабельная область',

    defaultSettings: {
        clickEnabled: true,
        clickUrl: '',
    },

    renderSettings(container, block) {
        const s = block.settings;
        const enabled = s.clickEnabled !== false;

        const divider = document.createElement('div');
        divider.style.cssText = [
            'display:flex',
            'align-items:center',
            'gap:8px',
            'margin:16px 0 8px',
            'color:var(--text-muted)',
            'font-size:11px',
            'font-weight:600',
            'text-transform:uppercase',
            'letter-spacing:.05em',
        ].join(';');

        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.style.cssText = `
            flex-shrink:0; padding:2px 8px; border-radius:4px; cursor:pointer;
            font-size:10px; font-weight:600; letter-spacing:.04em; text-transform:uppercase;
            border:1px solid ${enabled ? 'var(--accent-primary)' : 'var(--border-secondary)'};
            background:${enabled ? 'var(--accent-primary)' : 'var(--bg-hover)'};
            color:${enabled ? '#fff' : 'var(--text-muted)'};
        `;
        toggleBtn.textContent = enabled ? 'Вкл' : 'Выкл';
        toggleBtn.addEventListener('click', () => {
            updateBlockSetting(block.id, 'clickEnabled', !enabled);
            renderCanvas();
            renderSettings();
        });

        divider.innerHTML = `
            <span style="flex:1;height:1px;background:var(--border-primary)"></span>
            <span>Кликабельная область</span>
            <span style="flex:1;height:1px;background:var(--border-primary)"></span>
        `;
        divider.appendChild(toggleBtn);
        container.appendChild(divider);

        if (!enabled) return;

        container.appendChild(
            createSettingInput('Ссылка (URL)', s.clickUrl || '', block.id, 'clickUrl')
        );
    },

    wrapPreview(html, s) {
        if (!s || s.clickEnabled === false || !s.clickUrl) return html;
        return `<a href="${s.clickUrl}" target="_blank" style="display:block;text-decoration:none;color:inherit;">${html}</a>`;
    },

    wrapEmail(html, s) {
        if (!s || s.clickEnabled === false || !s.clickUrl) return html;
        return `
        <tr>
          <td style="padding:0;">
            <a href="${s.clickUrl}" target="_blank" style="display:block;text-decoration:none;color:inherit;">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                ${html}
              </table>
            </a>
          </td>
        </tr>`;
    },
});
