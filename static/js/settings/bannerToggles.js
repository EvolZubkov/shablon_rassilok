// settings/bannerToggles.js — createBannerHeightToggle, createRightImageModeToggle, createExpertVariantToggle

function createBannerHeightToggle(label, value, blockId, settingKey) {
    const group = document.createElement('div');
    group.className = 'setting-group';

    const labelEl = document.createElement('label');
    labelEl.className = 'setting-label';
    labelEl.textContent = label;

    const btnWrap = document.createElement('div');
    btnWrap.style.cssText = `
    display:flex; align-items:center; border:1px solid var(--border-secondary);
    border-radius:999px; padding:4px; background:var(--bg-primary);
  `;

    const mkBtn = (px) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = `${px}px`;
        const active = Number(value) === px;
        b.style.cssText = `
      min-width:64px; padding:8px 12px; border-radius:999px;
      border:0; cursor:pointer; font-size:13px;
      background:${active ? 'var(--accent-primary)' : 'transparent'};
      color:${active ? '#ffffff' : 'var(--text-secondary)'};
    `;
        b.onclick = () => { updateBlockSetting(blockId, settingKey, px); renderSettings(); };
        return b;
    };

    btnWrap.appendChild(mkBtn(200));
    btnWrap.appendChild(mkBtn(250));

    group.appendChild(labelEl);
    group.appendChild(btnWrap);
    return group;
}

function createRightImageModeToggle(label, value, blockId) {
    const group = document.createElement('div');
    group.className = 'setting-group';

    const labelEl = document.createElement('label');
    labelEl.className = 'setting-label';
    labelEl.textContent = label;

    const wrap = document.createElement('div');
    wrap.style.cssText = `
    display:flex; align-items:center; border:1px solid var(--border-secondary);
    border-radius:999px; padding:4px; background:var(--bg-primary);
  `;

    const mkBtn = (mode, text) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = text;
        const active = (value === mode);
        b.style.cssText = `
      min-width:120px; padding:8px 12px; border-radius:999px;
      border:0; cursor:pointer; font-size:13px;
      background:${active ? 'var(--accent-primary)' : 'transparent'};
      color:${active ? '#ffffff' : 'var(--text-secondary)'};
    `;
        b.onclick = () => { updateBlockSetting(blockId, 'rightImageMode', mode); renderSettings(); };
        return b;
    };

    wrap.appendChild(mkBtn('mask', 'Маска'));
    wrap.appendChild(mkBtn('rounded', 'Прямоугольник'));

    group.appendChild(labelEl);
    group.appendChild(wrap);
    return group;
}

function createExpertVariantToggle(label, value, blockId) {
    const group = document.createElement('div');
    group.className = 'setting-group';

    const labelEl = document.createElement('label');
    labelEl.className = 'setting-label';
    labelEl.textContent = label;

    const wrap = document.createElement('div');
    wrap.style.cssText = `
        display:flex; align-items:center; border:1px solid var(--border-secondary);
        border-radius:999px; padding:4px; background:var(--bg-primary);
    `;

    const mkBtn = (mode, text) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = text;
        const active = (value === mode);
        b.style.cssText = `
            min-width:120px; padding:8px 12px; border-radius:999px;
            border:0; cursor:pointer; font-size:13px;
            background:${active ? 'var(--accent-primary)' : 'transparent'};
            color:${active ? '#ffffff' : 'var(--text-secondary)'};
        `;
        b.onclick = () => {
            updateBlockSetting(blockId, 'variant', mode);
            renderSettings();
        };
        return b;
    };

    wrap.appendChild(mkBtn('full', 'Полный'));
    wrap.appendChild(mkBtn('lite', 'Лайт'));

    group.appendChild(labelEl);
    group.appendChild(wrap);
    return group;
}

// ============================================================
// GRADIENT POPUP PANEL
// ============================================================

let _gradientPopupEl = null;
