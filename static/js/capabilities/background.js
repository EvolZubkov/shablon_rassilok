// capabilities/background.js — capability «Подложка»
// Добавляет цветной фон вокруг любого блока (HTML и canvas).

CapabilityRegistry.register({
    id: 'background',
    label: 'Подложка',

    defaultSettings: {
        bgEnabled: true,
        bgColor:   '#1e293b',
        bgRadius:  8,
        bgPadding: 16,
    },

    // ── Панель настроек ──────────────────────────────────────────────
    renderSettings(container, block) {
        const s = block.settings;
        const enabled = s.bgEnabled !== false;

        // Разделитель с кнопкой включения/выключения
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
        toggleBtn.title = enabled ? 'Отключить подложку' : 'Включить подложку';
        toggleBtn.style.cssText = `
            flex-shrink:0; padding:2px 8px; border-radius:4px; cursor:pointer;
            font-size:10px; font-weight:600; letter-spacing:.04em; text-transform:uppercase;
            border:1px solid ${enabled ? 'var(--accent-primary)' : 'var(--border-secondary)'};
            background:${enabled ? 'var(--accent-primary)' : 'var(--bg-hover)'};
            color:${enabled ? '#fff' : 'var(--text-muted)'};
        `;
        toggleBtn.textContent = enabled ? 'Вкл' : 'Выкл';
        toggleBtn.addEventListener('click', () => {
            updateBlockSetting(block.id, 'bgEnabled', !enabled);
            renderCanvas();
            renderSettings();
        });

        divider.innerHTML = `
            <span style="flex:1;height:1px;background:var(--border-primary)"></span>
            <span>Подложка</span>
            <span style="flex:1;height:1px;background:var(--border-primary)"></span>
        `;
        divider.appendChild(toggleBtn);
        container.appendChild(divider);

        if (!enabled) return;

        // Цвет подложки
        container.appendChild(
            createSettingInput('Цвет подложки', s.bgColor, block.id, 'bgColor', 'color')
        );

        // Скругление
        container.appendChild(
            createSettingRange('Скругление', s.bgRadius, block.id, 'bgRadius', 0, 32, 1, 'px')
        );

        // Отступ
        container.appendChild(
            createSettingRange('Отступ', s.bgPadding, block.id, 'bgPadding', 0, 48, 1, 'px')
        );
    },

    // ── Preview ───────────────────────────────────────────────────────
    wrapPreview(html, s) {
        if (!s || s.bgEnabled === false) return html;
        return `<div style="
            background:${s.bgColor};
            border-radius:${s.bgRadius}px;
            padding:${s.bgPadding}px;
        ">${html}</div>`;
    },

    // ── Email HTML (Outlook-safe nested tables) ───────────────────────
    wrapEmail(html, s) {
        if (!s || s.bgEnabled === false) return html;
        return `
        <tr>
          <td style="padding:0">
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
                   style="background-color:${s.bgColor};border-radius:${s.bgRadius}px;">
              <tr>
                <td style="padding:${s.bgPadding}px">
                  <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                    ${html}
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
    },
});
