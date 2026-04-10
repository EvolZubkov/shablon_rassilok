// settings/gradientInline.js — inline Figma-редактор градиента (используется в bannerSettings)

function createBannerGradientEditor(block) {
    const s = block.settings || {};
    const section = document.createElement('div');
    section.className = 'settings-section';
    section.style.marginTop = '20px';

    const isEnabled = Boolean(s.gradientEnabled);
    const isExpanded = s.gradientUiExpanded !== false;
    const mode = s.rightImageMode || 'mask';

    section.appendChild(createFigmaGradientHeader(block, {
        enabled: isEnabled,
        expanded: isExpanded
    }));

    const targetHint = document.createElement('div');
    targetHint.className = 'fg-subtitle';
    targetHint.textContent = mode === 'mask'
        ? 'Target: Left block'
        : 'Target: Banner background';
    section.appendChild(targetHint);

    section.appendChild(createFigmaGradientFillRow(block));

    if (!isExpanded) {
        return section;
    }

    section.appendChild(createFigmaGradientPreview(block));
    section.appendChild(createFigmaGradientStops(block));
    section.appendChild(createFigmaGradientGeometry(block));

    return section;
}

function createFigmaGradientHeader(block, { enabled, expanded }) {
    const wrap = document.createElement('div');
    wrap.className = 'fg-fill-row';

    const left = document.createElement('div');
    left.className = 'fg-fill-left';

    const title = document.createElement('div');
    title.className = 'fg-section__title';
    title.textContent = 'Fill';

    const badge = document.createElement('span');
    badge.className = 'fg-fill-type';
    badge.textContent = 'Linear';

    left.appendChild(title);
    left.appendChild(badge);

    const right = document.createElement('div');
    right.className = 'fg-fill-right';

    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'fg-icon-btn';
    toggleBtn.textContent = enabled ? 'ON' : 'OFF';
    toggleBtn.onclick = () => {
        updateBlockSetting(block.id, 'gradientEnabled', !enabled);
        renderSettings();
    };

    const expandBtn = document.createElement('button');
    expandBtn.type = 'button';
    expandBtn.className = 'fg-icon-btn';
    expandBtn.textContent = expanded ? '⌃' : '⌄';
    expandBtn.onclick = () => {
        updateBlockSetting(block.id, 'gradientUiExpanded', !expanded);
        renderSettings();
    };

    right.appendChild(toggleBtn);
    right.appendChild(expandBtn);

    wrap.appendChild(left);
    wrap.appendChild(right);

    return wrap;
}

function createFigmaGradientFillRow(block) {
    const s = block.settings || {};
    const row = document.createElement('div');
    row.className = 'fg-fill-row';

    const left = document.createElement('div');
    left.className = 'fg-fill-left';

    const swatch = document.createElement('span');
    swatch.className = 'fg-fill-swatch';
    swatch.style.background = buildGradientPreviewCss(s);

    const type = document.createElement('span');
    type.className = 'fg-fill-type';
    type.textContent = 'Linear';

    left.appendChild(swatch);
    left.appendChild(type);

    const right = document.createElement('div');
    right.className = 'fg-fill-right';

    const opacity = document.createElement('input');
    opacity.className = 'fg-opacity-input';
    opacity.type = 'text';
    opacity.value = String(getGradientSummaryOpacity(s));
    opacity.addEventListener('change', (e) => {
        updateGradientGlobalOpacity(block.id, Number(e.target.value));
    });

    right.appendChild(opacity);

    row.appendChild(left);
    row.appendChild(right);

    return row;
}

function createFigmaGradientPreview(block) {
    const s = block.settings || {};
    const wrap = document.createElement('div');
    wrap.className = 'fg-preview-wrap';

    const divider = document.createElement('div');
    divider.className = 'fg-preview-line';
    wrap.appendChild(divider);

    const stage = document.createElement('div');
    stage.className = 'fg-preview-stage';

    const box = document.createElement('div');
    box.className = 'fg-preview-box';

    const shape = document.createElement('div');
    shape.className = 'fg-preview-shape';
    shape.style.background = buildGradientPreviewCss(s);
    box.appendChild(shape);

    const vector = document.createElement('div');
    vector.className = 'fg-gradient-vector';
    vector.innerHTML = `
        <span class="fg-gradient-vector__line"></span>
        <span class="fg-handle fg-handle--start"><span class="fg-handle__dot"></span></span>
        <span class="fg-handle fg-handle--end"><span class="fg-handle__dot"></span></span>
    `;
    box.appendChild(vector);

    stage.appendChild(box);
    wrap.appendChild(stage);

    const bar = document.createElement('div');
    bar.className = 'fg-gradient-bar';
    bar.style.background = buildGradientPreviewCss(s);

    const stops = getGradientStopsModel(s);
    stops.forEach((stop) => {
        const stopEl = document.createElement('span');
        stopEl.className = 'fg-gradient-stop';
        // Clamp offset so marker never escapes the bar on either edge.
        const pct = Math.max(0, Math.min(100, stop.position));
        stopEl.style.left = `calc(${pct}% - 8px)`;
        stopEl.style.background = stop.color;
        bar.appendChild(stopEl);
    });

    wrap.appendChild(bar);
    return wrap;
}

function createFigmaGradientStops(block) {
    const s = block.settings || {};
    const stops = getGradientStopsModel(s);

    const wrap = document.createElement('div');

    const head = document.createElement('div');
    head.className = 'fg-block-head';

    const title = document.createElement('span');
    title.className = 'fg-block-head__title';
    title.textContent = 'Stops';

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'fg-icon-btn fg-icon-btn--small';
    addBtn.textContent = '＋';
    addBtn.onclick = () => {
        const nextStops = [...stops, {
            id: Date.now(),
            color: '#FFFFFF',
            opacity: 100,
            position: 50
        }];
        updateBlockSetting(block.id, 'gradientStops', normalizeGradientStops(nextStops));
        renderSettings();
    };

    head.appendChild(title);
    head.appendChild(addBtn);
    wrap.appendChild(head);

    const list = document.createElement('div');
    list.className = 'fg-stop-list';

    stops.forEach((stop) => {
        list.appendChild(createFigmaGradientStopRow(block, stop, stops));
    });

    wrap.appendChild(list);

    const divider = document.createElement('div');
    divider.className = 'fg-divider';
    wrap.appendChild(divider);

    return wrap;
}

function createFigmaGradientStopRow(block, stop, stops) {
    const row = document.createElement('div');
    row.className = 'fg-stop-row';

    const pos = document.createElement('div');
    pos.className = 'fg-stop-pos';

    const posLabel = document.createElement('span');
    posLabel.className = 'fg-stop-label';
    posLabel.textContent = `${stop.position}%`;
    pos.appendChild(posLabel);

    const color = document.createElement('div');
    color.className = 'fg-stop-color';

    const swatch = document.createElement('span');
    swatch.className = 'fg-stop-color__swatch';
    swatch.style.background = stop.color;

    const colorInput = document.createElement('input');
    colorInput.className = 'fg-stop-color__input';
    colorInput.type = 'text';
    colorInput.value = String(stop.color || '').replace('#', '');
    colorInput.addEventListener('change', (e) => {
        updateGradientStop(block.id, stop.id, 'color', ensureHex(e.target.value));
    });

    color.appendChild(swatch);
    color.appendChild(colorInput);

    const opacity = document.createElement('div');
    opacity.className = 'fg-stop-opacity';

    const opacityInput = document.createElement('input');
    opacityInput.className = 'fg-mini-input';
    opacityInput.type = 'text';
    opacityInput.value = stop.opacity ?? 100;
    opacityInput.addEventListener('change', (e) => {
        updateGradientStop(block.id, stop.id, 'opacity', Number(e.target.value));
    });

    const suffix = document.createElement('span');
    suffix.className = 'fg-mini-suffix';
    suffix.textContent = '%';

    opacity.appendChild(opacityInput);
    opacity.appendChild(suffix);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'fg-icon-btn fg-icon-btn--small';
    removeBtn.textContent = '−';
    removeBtn.onclick = () => {
        if (stops.length <= 2) return;
        updateBlockSetting(
            block.id,
            'gradientStops',
            stops.filter(item => item.id !== stop.id)
        );
        renderSettings();
    };

    row.appendChild(pos);
    row.appendChild(color);
    row.appendChild(opacity);
    row.appendChild(removeBtn);

    return row;
}

function createFigmaGradientGeometry(block) {
    const s = block.settings || {};
    const wrap = document.createElement('div');

    const head = document.createElement('div');
    head.className = 'fg-block-head';

    const title = document.createElement('span');
    title.className = 'fg-block-head__title';
    title.textContent = 'Geometry';

    head.appendChild(title);
    wrap.appendChild(head);

    const grid = document.createElement('div');
    grid.className = 'fg-compact-grid';

    grid.appendChild(createFigmaField('Angle', `${Number(s.gradientAngle ?? 0)}°`));
    grid.appendChild(createFigmaField('Opacity', `${getGradientSummaryOpacity(s)}%`));
    grid.appendChild(createFigmaField('Center X', `${Number(s.gradientCenterX ?? 50)}`));
    grid.appendChild(createFigmaField('Center Y', `${Number(s.gradientCenterY ?? 50)}`));
    grid.appendChild(createFigmaSliderField('Balance', Number(s.gradientBalance ?? 100)));

    wrap.appendChild(grid);
    return wrap;
}

function createFigmaField(label, value) {
    const field = document.createElement('div');
    field.className = 'fg-field';

    const labelEl = document.createElement('label');
    labelEl.className = 'fg-field__label';
    labelEl.textContent = label;

    const inputLike = document.createElement('div');
    inputLike.className = 'fg-input-like';
    inputLike.textContent = value;

    field.appendChild(labelEl);
    field.appendChild(inputLike);

    return field;
}

function createFigmaSliderField(label, value) {
    const field = document.createElement('div');
    field.className = 'fg-field fg-field--full';

    const labelEl = document.createElement('label');
    labelEl.className = 'fg-field__label';
    labelEl.textContent = label;

    const row = document.createElement('div');
    row.className = 'fg-slider-row';

    const range = document.createElement('input');
    range.className = 'fg-slider';
    range.type = 'range';
    range.min = '1';
    range.max = '200';
    range.value = value;

    const valueEl = document.createElement('div');
    valueEl.className = 'fg-slider-value';
    valueEl.textContent = `${value}%`;

    row.appendChild(range);
    row.appendChild(valueEl);

    field.appendChild(labelEl);
    field.appendChild(row);

    return field;
}

