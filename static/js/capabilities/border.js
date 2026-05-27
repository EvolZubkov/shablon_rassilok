// capabilities/border.js — capability «Рамка»

CapabilityRegistry.register({
    id: 'border',
    label: 'Рамка',

    defaultSettings: {
        borderEnabled: true,
        borderColor:  '#a855f7',
        borderWidth:  2,
        borderRadius: 8,
    },

    renderSettings(container, block) {
        const s = block.settings;
        const enabled = s.borderEnabled !== false;

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
            updateBlockSetting(block.id, 'borderEnabled', !enabled);
            renderCanvas();
            renderSettings();
        });

        divider.innerHTML = `
            <span style="flex:1;height:1px;background:var(--border-primary)"></span>
            <span>Рамка</span>
            <span style="flex:1;height:1px;background:var(--border-primary)"></span>
        `;
        divider.appendChild(toggleBtn);
        container.appendChild(divider);

        if (!enabled) return;

        container.appendChild(
            createSettingInput('Цвет рамки', s.borderColor, block.id, 'borderColor', 'color')
        );
        container.appendChild(
            createSettingRange('Толщина', s.borderWidth, block.id, 'borderWidth', 1, 16, 1, 'px')
        );
        container.appendChild(
            createSettingRange('Скругление', s.borderRadius, block.id, 'borderRadius', 0, 32, 1, 'px')
        );
    },

    wrapPreview(html, s) {
        if (!s || s.borderEnabled === false) return html;
        return `<div style="
            border:${s.borderWidth}px solid ${s.borderColor};
            border-radius:${s.borderRadius}px;
            box-sizing:border-box;
        ">${html}</div>`;
    },

    wrapEmail(html, s) {
        if (!s || s.borderEnabled === false) return html;
        return `
        <tr>
          <td style="padding:0;border:${s.borderWidth}px solid ${s.borderColor};border-radius:${s.borderRadius}px;">
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
              ${html}
            </table>
          </td>
        </tr>`;
    },
});
