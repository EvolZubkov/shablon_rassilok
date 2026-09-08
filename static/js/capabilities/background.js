// capabilities/background.js — capability «Подложка»
// Добавляет цветной фон вокруг любого блока (HTML и canvas).

// Outlook desktop (движок Word) игнорирует CSS border-radius целиком —
// подложка в письме там всегда выходит с квадратными углами. Растровые
// картинки Word отрисовывает нормально, поэтому для Outlook собираем
// скруглённые углы из двух маленьких PNG (верх/низ), а прямая середина
// остаётся обычным background-color на <td> — его Word поддерживает,
// ломается только сам border-radius. Средняя полоса тянется на любую
// высоту (сколько бы блоков внутри ни было), т.к. это не картинка.
// Не-Outlook клиенты border-radius поддерживают нативно — им отдаём
// прежнюю (более простую и лёгкую) однотабличную версию через
// MSO-conditional comments (`<!--[if !mso]><!-->`/`<!--[if mso]>`).
function _roundedCornerStripDataUrl(widthPx, radiusPx, color, corner) {
    const w = Math.max(1, Math.round(widthPx));
    const h = Math.max(1, Math.round(radiusPx));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = color;
    ctx.beginPath();
    if (corner === 'top') {
        ctx.moveTo(0, h);
        ctx.lineTo(0, radiusPx);
        ctx.arcTo(0, 0, radiusPx, 0, radiusPx);
        ctx.lineTo(w - radiusPx, 0);
        ctx.arcTo(w, 0, w, radiusPx, radiusPx);
        ctx.lineTo(w, h);
    } else {
        ctx.moveTo(0, 0);
        ctx.lineTo(w, 0);
        ctx.lineTo(w, h - radiusPx);
        ctx.arcTo(w, h, w - radiusPx, h, radiusPx);
        ctx.lineTo(radiusPx, h);
        ctx.arcTo(0, h, 0, h - radiusPx, radiusPx);
    }
    ctx.closePath();
    ctx.fill();
    return canvas.toDataURL('image/png');
}

CapabilityRegistry.register({
    id: 'background',
    label: 'Подложка',

    defaultSettings: {
        bgEnabled: false,
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
    // widthPx — фактическая ширина подложки в px на момент рендера письма;
    // нужна только для скруглённых углов в Outlook (PNG-полоски рисуются
    // строго в размер). Необязательный параметр — если не передан,
    // берётся ширина текущей колонки/контента (тот же источник, которым
    // уже пользуется generateColumnsHTML для позиционирования дочерних
    // блоков), см. emailGenerator.js: CURRENT_EMAIL_RENDER_CONTEXT /
    // _emailContentWidth.
    wrapEmail(html, s, widthPx) {
        if (!s || s.bgEnabled === false) return html;

        const bgColor   = s.bgColor;
        const bgRadius  = Number(s.bgRadius) || 0;
        const bgPadding = Number(s.bgPadding) || 0;

        const plainRow = `
        <tr>
          <td style="padding:0">
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
                   style="background-color:${bgColor};border-radius:${bgRadius}px;">
              <tr>
                <td style="padding:${bgPadding}px">
                  <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                    ${html}
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>`;

        // Без скругления — квадратные углы одинаковы везде, MSO-ветка не нужна.
        if (bgRadius <= 0) return plainRow;

        const ctx = (typeof CURRENT_EMAIL_RENDER_CONTEXT !== 'undefined' && CURRENT_EMAIL_RENDER_CONTEXT)
            || (typeof buildEmailRenderContext === 'function' ? buildEmailRenderContext() : null);

        // Явный widthPx (полный full-width режим, см. generateColumnsHTML)
        // приходит УЖЕ уменьшенным вызывающим кодом на 2×bgPadding заранее
        // (targetWidth = TABLE_WIDTH - bgPadding*2), т.е. это ширина
        // контента, а видимая панель = widthPx + 2×bgPadding (получается
        // ровно TABLE_WIDTH). Без явного widthPx (обычный, не full-width
        // блок) auto-fallback (_emailContentWidth/parentContentWidth) —
        // это ширина ОТВЕДЁННОГО СЛОТА (как её и трактует plainRow ниже:
        // "100%" = ширина слота, padding режет место под контент
        // ИЗНУТРИ неё) — значит видимая панель тут = сам слот, без
        // расширения, а контенту под padding остаётся slot - 2×bgPadding.
        const explicitWidth = widthPx != null;
        const raw = Math.max(1, Math.round(
            widthPx || (ctx && ctx.parentContentWidth) ||
            (typeof _emailContentWidth !== 'undefined' ? _emailContentWidth : 600)
        ));
        const boxW     = explicitWidth ? raw + bgPadding * 2 : raw;
        const contentW = explicitWidth ? raw : Math.max(1, raw - bgPadding * 2);

        const topImg    = _roundedCornerStripDataUrl(boxW, bgRadius, bgColor, 'top');
        const bottomImg = _roundedCornerStripDataUrl(boxW, bgRadius, bgColor, 'bottom');
        const imgStyle  = `display:block;width:${boxW}px;height:${bgRadius}px;border:0;outline:none;line-height:0;`;
        // Word (Outlook desktop) ненадёжно резолвит width="100%" на глубоко
        // вложенных таблицах — вместо растягивания на ширину родителя может
        // схлопнуть таблицу по размеру контента, отчего подложка выходит
        // уже, чем нужно (в Chromium/превью то же самое выглядит нормально,
        // там % работает как положено). Обе ширины (boxW и contentW) уже
        // известны на момент генерации — везде ниже задаём таблицам явную
        // ширину в px, а не %.
        const outlookRow = `
        <tr>
          <td style="padding:0">
            <table width="${boxW}" cellpadding="0" cellspacing="0" role="presentation" style="width:${boxW}px;">
              <tr><td style="padding:0;font-size:0;line-height:0;"><img src="${topImg}" width="${boxW}" height="${bgRadius}" alt="" style="${imgStyle}"></td></tr>
              <tr>
                <td style="background-color:${bgColor};padding:0 ${bgPadding}px;">
                  <table width="${contentW}" cellpadding="0" cellspacing="0" role="presentation" style="width:${contentW}px;">
                    <tr>
                      <td style="padding:${bgPadding}px 0;">
                        <table width="${contentW}" cellpadding="0" cellspacing="0" role="presentation" style="width:${contentW}px;">
                          ${html}
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr><td style="padding:0;font-size:0;line-height:0;"><img src="${bottomImg}" width="${boxW}" height="${bgRadius}" alt="" style="${imgStyle}"></td></tr>
            </table>
          </td>
        </tr>`;

        // Не-Outlook клиенты видят plainRow (легче, поддерживают border-radius
        // нативно); Outlook — outlookRow с картиночными углами. Обе ветки —
        // самостоятельные <tr>, вставляются в ту же позицию у вызывающего кода.
        return `<!--[if !mso]><!-->${plainRow}<!--<![endif]-->`
            + `<!--[if mso]>${outlookRow}<![endif]-->`;
    },
});
