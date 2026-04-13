// settings/gradientPopup.js — popup-редактор градиента (открывается кнопкой)

function openGradientPopup(block, anchorEl, target = null) {
    // Закрываем если уже открыт
    if (_gradientPopupEl) {
        const popupTarget = _gradientPopupEl.dataset.gradientTarget;
        const nextTarget = target || getActiveBannerGradientTarget(block.settings);
        const isForSameBlock = _gradientPopupEl.dataset.blockId === String(block.id) && popupTarget === nextTarget;
        closeGradientPopup();
        if (isForSameBlock) return; // toggle
    }

    const gradientTarget = target || getActiveBannerGradientTarget(block.settings);

    // Автоматически включаем градиент при открытии попапа.
    // renderSettings() is called by the button handler before openGradientPopup,
    // so we only need to sync block.settings here.
    if (!getBannerGradientSettingValue(block.settings, gradientTarget, 'gradientEnabled')) {
        updateBannerGradientSetting(block.id, gradientTarget, 'gradientEnabled', true);
        block.settings = AppState.findBlockById(block.id).settings;
    }

    const popup = document.createElement('div');
    popup.className = 'grad-popup';
    popup.dataset.blockId = String(block.id);
    popup.dataset.gradientTarget = gradientTarget;

    // Header
    const header = document.createElement('div');
    header.className = 'grad-popup__header';

    const modeLabel = document.createElement('span');
    modeLabel.className = 'grad-popup__mode';
    modeLabel.textContent = `Target: ${getBannerGradientMeta(gradientTarget).label}`;

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'grad-popup__close';
    closeBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
    closeBtn.addEventListener('click', closeGradientPopup);

    header.appendChild(modeLabel);
    header.appendChild(closeBtn);
    popup.appendChild(header);

    // Body (preview + stops + geometry) — в отдельной функции для рефреша
    const body = document.createElement('div');
    body.className = 'grad-popup__body';
    popup.appendChild(body);
    refreshGradientPopupBody(popup, block);

    document.body.appendChild(popup);
    _gradientPopupEl = popup;

    // Позиционирование под кнопкой
    positionGradientPopup(popup, anchorEl);

    // Закрытие кликом снаружи
    setTimeout(() => {
        document.addEventListener('mousedown', _outsideClickHandler, { once: false });
    }, 50);
}

function refreshGradientPopupBody(popup, block) {
    const body = popup.querySelector('.grad-popup__body');
    if (!body) return;
    body.innerHTML = '';
    const target = popup.dataset.gradientTarget || getActiveBannerGradientTarget(block.settings);

    const s = AppState.findBlockById(block.id).settings;
    block.settings = s; // sync

    // === INTERACTIVE GRADIENT PREVIEW (Figma-style) ===
    const previewWrap = document.createElement('div');
    previewWrap.className = 'grad-preview';

    // Квадратный превью-блок
    const previewBox = document.createElement('div');
    previewBox.className = 'grad-preview__box';
    previewBox.style.background = buildGradientPreviewCss(s, target);

    // SVG-слой для линии и хэндлов
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'grad-preview__svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');

    // Линия между хэндлами
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('class', 'grad-preview__line');
    svg.appendChild(line);

    // Хэндл START (пустой ромб)
    const handleStart = document.createElement('div');
    handleStart.className = 'grad-preview__handle grad-preview__handle--start';
    const handleStartDot = document.createElement('div');
    handleStartDot.className = 'grad-preview__handle-dot';
    handleStart.appendChild(handleStartDot);

    // Хэндл END (заполненный ромб с цветом)
    const handleEnd = document.createElement('div');
    handleEnd.className = 'grad-preview__handle grad-preview__handle--end';
    const handleEndDot = document.createElement('div');
    handleEndDot.className = 'grad-preview__handle-dot grad-preview__handle-dot--filled';
    handleEnd.appendChild(handleEndDot);

    previewBox.appendChild(svg);
    previewBox.appendChild(handleStart);
    previewBox.appendChild(handleEnd);
    previewWrap.appendChild(previewBox);
    body.appendChild(previewWrap);

    // Функция обновления позиций хэндлов по текущим настройкам
    function updateHandlePositions() {
        const bs = AppState.findBlockById(block.id).settings;
        const angle = Number(getBannerGradientSettingValue(bs, target, 'gradientAngle') ?? 0);
        const cx = Number(getBannerGradientSettingValue(bs, target, 'gradientCenterX') ?? 50);
        const cy = Number(getBannerGradientSettingValue(bs, target, 'gradientCenterY') ?? 50);
        const balance = Number(getBannerGradientSettingValue(bs, target, 'gradientBalance') ?? 100);

        // Используем ту же математику что в imageRenderers.getAdvancedBannerGradientConfig
        // но в % пространстве превью (квадрат, ratio корректируем через boxW/boxH)
        const boxW = previewBox.offsetWidth  || 220;
        const boxH = previewBox.offsetHeight || 140;

        const rad = angle * Math.PI / 180;
        const base = Math.sqrt(boxW * boxW + boxH * boxH);
        const half = (base * balance / 100) / 2;

        // dx/dy в пикселях
        const dxPx = Math.cos(rad) * half;
        const dyPx = Math.sin(rad) * half;

        // Центр в px
        const cxPx = (cx / 100) * boxW;
        const cyPx = (cy / 100) * boxH;

        const startXpx = cxPx - dxPx;
        const startYpx = cyPx - dyPx;
        const endXpx   = cxPx + dxPx;
        const endYpx   = cyPx + dyPx;

        // Позиционируем хэндлы (transform: translate(-50%,-50%) учитывается в CSS)
        handleStart.style.left = `${startXpx}px`;
        handleStart.style.top  = `${startYpx}px`;
        handleEnd.style.left   = `${endXpx}px`;
        handleEnd.style.top    = `${endYpx}px`;

        // SVG линия
        line.setAttribute('x1', startXpx);
        line.setAttribute('y1', startYpx);
        line.setAttribute('x2', endXpx);
        line.setAttribute('y2', endYpx);

        // Цвет хэндлов
        const stops = getGradientStopsModel(bs, target);
        if (stops.length > 0) {
            handleStartDot.style.background = stops[0].color;
            handleEndDot.style.background   = stops[stops.length - 1].color;
        }

        // Фон превью
        previewBox.style.background = buildGradientPreviewCss(bs, target);
    }

    // Сохраняем функцию на popup для вызова из других мест
    popup._updateHandlePositions = updateHandlePositions;

    // Drag-логика для хэндла
    function makeDraggable(handle, role) {
        let dragging = false;

        handle.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dragging = true;
            handle.setPointerCapture(e.pointerId);
            handle.classList.add('grad-preview__handle--dragging');
        });

        handle.addEventListener('pointermove', (e) => {
            if (!dragging) return;
            e.preventDefault();

            const boxRect = previewBox.getBoundingClientRect();
            const boxW = boxRect.width;
            const boxH = boxRect.height;

            // Позиция мыши в px относительно превью
            const mxPx = e.clientX - boxRect.left;
            const myPx = e.clientY - boxRect.top;

            const bs = AppState.findBlockById(block.id).settings;
            const curAngle = Number(getBannerGradientSettingValue(bs, target, 'gradientAngle') ?? 0);
            const curCX = Number(getBannerGradientSettingValue(bs, target, 'gradientCenterX') ?? 50);
            const curCY = Number(getBannerGradientSettingValue(bs, target, 'gradientCenterY') ?? 50);
            const curBalance = Number(getBannerGradientSettingValue(bs, target, 'gradientBalance') ?? 100);

            const rad  = curAngle * Math.PI / 180;
            const base = Math.sqrt(boxW * boxW + boxH * boxH);
            const half = (base * curBalance / 100) / 2;
            const dxPx = Math.cos(rad) * half;
            const dyPx = Math.sin(rad) * half;
            const cxPx = (curCX / 100) * boxW;
            const cyPx = (curCY / 100) * boxH;

            let newX0 = cxPx - dxPx, newY0 = cyPx - dyPx;
            let newX1 = cxPx + dxPx, newY1 = cyPx + dyPx;

            if (role === 'start') {
                newX0 = mxPx; newY0 = myPx;
            } else {
                newX1 = mxPx; newY1 = myPx;
            }

            // Обратное преобразование: позиции → настройки
            const ncxPx = (newX0 + newX1) / 2;
            const ncyPx = (newY0 + newY1) / 2;
            const vx = newX1 - newX0;
            const vy = newY1 - newY0;
            const dist = Math.sqrt(vx * vx + vy * vy);
            const newAngle   = Math.round(Math.atan2(vy, vx) * 180 / Math.PI);
            const newBalance = Math.round(Math.max(10, Math.min(200, (dist / base) * 100)));
            const newCX      = Math.round(Math.max(0, Math.min(100, (ncxPx / boxW) * 100)));
            const newCY      = Math.round(Math.max(0, Math.min(100, (ncyPx / boxH) * 100)));

            // Обновляем state напрямую (без renderBanner — слишком тяжело при drag)
            const blk = AppState.findBlockById(block.id);
            blk.settings[getBannerGradientKey(target, 'angle')] = newAngle;
            blk.settings[getBannerGradientKey(target, 'balance')] = newBalance;
            blk.settings[getBannerGradientKey(target, 'centerX')] = newCX;
            blk.settings[getBannerGradientKey(target, 'centerY')] = newCY;
            block.settings = blk.settings;

            updateHandlePositions();
            syncGeoFields(popup, block.id, target);
        });

        handle.addEventListener('pointerup', () => {
            if (!dragging) return;
            dragging = false;
            handle.classList.remove('grad-preview__handle--dragging');
            // Финальный рендер баннера после отпускания
            const blk = AppState.findBlockById(block.id);
            renderBannerToDataUrl(blk, (dataUrl) => {
                blk.settings.renderedBanner = dataUrl || null;
                renderCanvas();
            });
        });

        handle.addEventListener('pointercancel', () => {
            dragging = false;
            handle.classList.remove('grad-preview__handle--dragging');
        });
    }

    // Drag за сам превью-блок — перемещает центр градиента
    previewBox.addEventListener('pointerdown', (e) => {
        if (e.target === handleStart || handleStart.contains(e.target)) return;
        if (e.target === handleEnd   || handleEnd.contains(e.target))   return;

        e.preventDefault();
        const boxRect = previewBox.getBoundingClientRect();

        const onMove = (ev) => {
            const newCX = Math.round(Math.max(0, Math.min(100, ((ev.clientX - boxRect.left) / boxRect.width)  * 100)));
            const newCY = Math.round(Math.max(0, Math.min(100, ((ev.clientY - boxRect.top)  / boxRect.height) * 100)));
            const blk = AppState.findBlockById(block.id);
            blk.settings[getBannerGradientKey(target, 'centerX')] = newCX;
            blk.settings[getBannerGradientKey(target, 'centerY')] = newCY;
            block.settings = blk.settings;
            updateHandlePositions();
            syncGeoFields(popup, block.id, target);
        };

        const onUp = () => {
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup', onUp);
            const blk = AppState.findBlockById(block.id);
            renderBannerToDataUrl(blk, (dataUrl) => {
                blk.settings.renderedBanner = dataUrl || null;
                renderCanvas();
            });
        };

        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
    });

    makeDraggable(handleStart, 'start');
    makeDraggable(handleEnd, 'end');

    // Сохраняем функцию на popup для вызова снаружи (слайдеры Geometry)
    popup._updateHandlePositions = updateHandlePositions;

    // Обновляем позиции сразу после добавления в DOM
    requestAnimationFrame(() => updateHandlePositions());
    // Сохраняем для доступа снаружи (balance slider и т.д.)
    popup._updateHandlePositions = updateHandlePositions;

    // Gradient bar под превью
    const barWrap = document.createElement('div');
    barWrap.className = 'grad-popup__bar-wrap';
    const gradBar = document.createElement('div');
    gradBar.className = 'grad-popup__bar';
    gradBar.style.background = buildGradientPreviewCss(s, target);
    const stops = getGradientStopsModel(s, target);

    function syncBarGradient() {
        const bs = AppState.findBlockById(block.id).settings;
        gradBar.style.background = buildGradientPreviewCss(bs, target);
    }

    stops.forEach((stop) => {
        const pin = document.createElement('div');
        pin.className = 'grad-popup__bar-pin';
        pin.style.cursor = 'ew-resize';
        pin.style.touchAction = 'none';
        const clampedPos = Math.max(0, Math.min(100, stop.position));
        pin.style.left = `calc(${clampedPos}% - 8px)`;
        pin.style.background = stop.color;

        pin.addEventListener('pointerdown', (e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();

            pin.classList.add('grad-popup__bar-pin--dragging');

            const barRect = gradBar.getBoundingClientRect();

            const onMove = (ev) => {
                const rawPct = ((ev.clientX - barRect.left) / barRect.width) * 100;
                const pct = Math.round(Math.max(0, Math.min(100, rawPct)));
                pin.style.left = `calc(${pct}% - 8px)`;
                updateGradientStop(block.id, stop.id, 'position', pct, target);
                block.settings = AppState.findBlockById(block.id).settings;
                syncBarGradient();
            };

            const onUp = () => {
                document.removeEventListener('pointermove', onMove);
                document.removeEventListener('pointerup', onUp);
                document.removeEventListener('pointercancel', onUp);
                pin.classList.remove('grad-popup__bar-pin--dragging');
                refreshGradientPopupBody(popup, block);
            };

            document.addEventListener('pointermove', onMove);
            document.addEventListener('pointerup', onUp);
            document.addEventListener('pointercancel', onUp);
        });

        gradBar.appendChild(pin);
    });
    barWrap.appendChild(gradBar);
    body.appendChild(barWrap);

    // STOPS
    const stopsSection = document.createElement('div');
    stopsSection.className = 'grad-popup__section';

    const stopsHead = document.createElement('div');
    stopsHead.className = 'grad-popup__section-head';
    const stopsTitle = document.createElement('span');
    stopsTitle.className = 'grad-popup__section-title';
    stopsTitle.textContent = 'Stops';
    const addStopBtn = document.createElement('button');
    addStopBtn.type = 'button';
    addStopBtn.className = 'grad-popup__icon-btn';
    addStopBtn.textContent = '+';
    addStopBtn.addEventListener('click', () => {
        const cur = getGradientStopsModel(AppState.findBlockById(block.id).settings, target);
        const nextStops = [...cur, { id: Date.now(), color: '#FFFFFF', opacity: 100, position: 50 }];
        updateBannerGradientSetting(block.id, target, 'gradientStops', normalizeGradientStops(nextStops));
        block.settings = AppState.findBlockById(block.id).settings;
        refreshGradientPopupBody(popup, block);
    });
    stopsHead.appendChild(stopsTitle);
    stopsHead.appendChild(addStopBtn);
    stopsSection.appendChild(stopsHead);

    const stopList = document.createElement('div');
    stopList.className = 'grad-popup__stop-list';

    stops.forEach((stop) => {
        const row = document.createElement('div');
        row.className = 'grad-popup__stop-row';

        // Позиция
        const posWrap = document.createElement('div');
        posWrap.className = 'grad-popup__stop-field grad-popup__stop-field--pos';
        const posInput = document.createElement('input');
        posInput.type = 'number';
        posInput.min = 0; posInput.max = 100;
        posInput.value = stop.position;
        posInput.className = 'grad-popup__mini-input';
        const posSuffix = document.createElement('span');
        posSuffix.className = 'grad-popup__mini-suffix';
        posSuffix.textContent = '%';
        posInput.addEventListener('change', (e) => {
            updateGradientStop(block.id, stop.id, 'position', Number(e.target.value), target);
            block.settings = AppState.findBlockById(block.id).settings;
            refreshGradientPopupBody(popup, block);
        });
        posWrap.appendChild(posInput);
        posWrap.appendChild(posSuffix);

        // Цвет
        const colorWrap = document.createElement('div');
        colorWrap.className = 'grad-popup__stop-field grad-popup__stop-field--color';

        const swatch = document.createElement('div');
        swatch.className = 'grad-popup__stop-swatch';
        swatch.style.background = stop.color;
        swatch.addEventListener('click', () => {
            pickColor({
                title: 'Цвет точки',
                currentColor: stop.color,
                allowTransparent: false,
                onApply: (chosen) => {
                    swatch.style.background = chosen;
                    hexInput.value = chosen.replace('#', '').toUpperCase();
                    updateGradientStop(block.id, stop.id, 'color', chosen, target);
                    block.settings = AppState.findBlockById(block.id).settings;
                    gradBar.style.background = buildGradientPreviewCss(block.settings, target);
                },
            });
        });

        const hexInput = document.createElement('input');
        hexInput.type = 'text';
        hexInput.className = 'grad-popup__hex-input';
        hexInput.value = (stop.color || '').replace('#', '').toUpperCase();
        hexInput.maxLength = 6;
        hexInput.addEventListener('change', (e) => {
            const hex = ensureHex(e.target.value);
            swatch.style.background = hex;
            updateGradientStop(block.id, stop.id, 'color', hex, target);
            block.settings = AppState.findBlockById(block.id).settings;
            refreshGradientPopupBody(popup, block);
        });

        colorWrap.appendChild(swatch);
        colorWrap.appendChild(hexInput);

        // Opacity стопа
        const opWrap = document.createElement('div');
        opWrap.className = 'grad-popup__stop-field grad-popup__stop-field--op';
        const opInput = document.createElement('input');
        opInput.type = 'number';
        opInput.min = 0; opInput.max = 100;
        opInput.value = stop.opacity ?? 100;
        opInput.className = 'grad-popup__mini-input';
        const opSuffix2 = document.createElement('span');
        opSuffix2.className = 'grad-popup__mini-suffix';
        opSuffix2.textContent = '%';
        opInput.addEventListener('change', (e) => {
            updateGradientStop(block.id, stop.id, 'opacity', Number(e.target.value), target);
            block.settings = AppState.findBlockById(block.id).settings;
            refreshGradientPopupBody(popup, block);
        });
        opWrap.appendChild(opInput);
        opWrap.appendChild(opSuffix2);

        // Remove
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'grad-popup__icon-btn grad-popup__icon-btn--danger';
        removeBtn.textContent = '−';
        if (stops.length <= 2) {
            removeBtn.disabled = true;
            removeBtn.title = 'Минимум два stop для градиента';
            removeBtn.style.opacity = '0.45';
            removeBtn.style.cursor = 'not-allowed';
        }
        removeBtn.addEventListener('click', () => {
            const cur = getGradientStopsModel(AppState.findBlockById(block.id).settings, target);
            if (cur.length <= 2) return;
            updateBannerGradientSetting(block.id, target, 'gradientStops', cur.filter(item => item.id !== stop.id));
            block.settings = AppState.findBlockById(block.id).settings;
            refreshGradientPopupBody(popup, block);
        });

        row.appendChild(posWrap);
        row.appendChild(colorWrap);
        row.appendChild(opWrap);
        row.appendChild(removeBtn);
        stopList.appendChild(row);
    });

    stopsSection.appendChild(stopList);
    body.appendChild(stopsSection);

    // GEOMETRY
    const geoSection = document.createElement('div');
    geoSection.className = 'grad-popup__section';

    const geoHead = document.createElement('div');
    geoHead.className = 'grad-popup__section-head';
    const geoTitle = document.createElement('span');
    geoTitle.className = 'grad-popup__section-title';
    geoTitle.textContent = 'Geometry';
    geoHead.appendChild(geoTitle);
    geoSection.appendChild(geoHead);

    const geoGrid = document.createElement('div');
    geoGrid.className = 'grad-popup__geo-grid';

    function makeGeoField(labelText, settingKey, min, max, step, unit, currentVal) {
        const cell = document.createElement('div');
        cell.className = 'grad-popup__geo-cell';
        const lbl = document.createElement('label');
        lbl.className = 'grad-popup__geo-label';
        lbl.textContent = labelText;
        const fieldRow = document.createElement('div');
        fieldRow.className = 'grad-popup__geo-field';
        const input = document.createElement('input');
        input.type = 'number';
        input.min = min; input.max = max; input.step = step;
        input.value = currentVal;
        input.className = 'grad-popup__geo-input';
        if (unit) {
            const u = document.createElement('span');
            u.className = 'grad-popup__geo-unit';
            u.textContent = unit;
            fieldRow.appendChild(input);
            fieldRow.appendChild(u);
        } else {
            fieldRow.appendChild(input);
        }
        input.addEventListener('input', (e) => {
            updateBannerGradientSetting(block.id, target, settingKey, Number(e.target.value));
            block.settings = AppState.findBlockById(block.id).settings;
            // live update bar
            gradBar.style.background = buildGradientPreviewCss(block.settings, target);
            // live update preview box
            const prevBox = popup.querySelector('.grad-preview__box');
            if (prevBox) prevBox.style.background = buildGradientPreviewCss(block.settings, target);
        });
        // НЕ вызываем renderSettings() on change — это уничтожит DOM попапа
        cell.appendChild(lbl);
        cell.appendChild(fieldRow);
        return { cell, input };
    }

    const angleField   = makeGeoField('Angle',    'gradientAngle',   -360, 360, 1, '°', Number(getBannerGradientSettingValue(s, target, 'gradientAngle') ?? 0));
    angleField.input.classList.add('grad-geo-angle');
    geoGrid.appendChild(angleField.cell);

    const cxField = makeGeoField('Center X', 'gradientCenterX', 0, 100, 1, '', Number(getBannerGradientSettingValue(s, target, 'gradientCenterX') ?? 50));
    const cyField = makeGeoField('Center Y', 'gradientCenterY', 0, 100, 1, '', Number(getBannerGradientSettingValue(s, target, 'gradientCenterY') ?? 50));
    cxField.input.classList.add('grad-geo-cx');
    cyField.input.classList.add('grad-geo-cy');
    geoGrid.appendChild(cxField.cell);
    geoGrid.appendChild(cyField.cell);

    // Balance — full width slider
    const balCell = document.createElement('div');
    balCell.className = 'grad-popup__geo-cell grad-popup__geo-cell--full';
    const balLbl = document.createElement('label');
    balLbl.className = 'grad-popup__geo-label';
    balLbl.textContent = 'Balance';
    const balRow = document.createElement('div');
    balRow.className = 'grad-popup__balance-row';
    const balSlider = document.createElement('input');
    balSlider.type = 'range';
    balSlider.min = 1; balSlider.max = 200; balSlider.step = 1;
    balSlider.value = Number(getBannerGradientSettingValue(s, target, 'gradientBalance') ?? 100);
    balSlider.className = 'grad-popup__balance-slider grad-geo-balance-slider';
    const balValue = document.createElement('div');
    balValue.className = 'grad-popup__balance-value';
    balValue.textContent = `${balSlider.value}%`;
    balSlider.addEventListener('input', (e) => {
        balValue.textContent = `${e.target.value}%`;
        updateBannerGradientSetting(block.id, target, 'gradientBalance', Number(e.target.value));
        block.settings = AppState.findBlockById(block.id).settings;
        gradBar.style.background = buildGradientPreviewCss(block.settings, target);
        const prevBox = popup.querySelector('.grad-preview__box');
        if (prevBox) prevBox.style.background = buildGradientPreviewCss(block.settings, target);
        // обновляем хэндлы
        const updateFn = popup._updateHandlePositions;
        if (updateFn) updateFn();
    });
    balRow.appendChild(balSlider);
    balRow.appendChild(balValue);
    balCell.appendChild(balLbl);
    balCell.appendChild(balRow);
    geoGrid.appendChild(balCell);

    geoSection.appendChild(geoGrid);
    body.appendChild(geoSection);
}

// Синхронизирует поля Geometry в попапе без полного рефреша
function syncGeoFields(popup, blockId, target = null) {
    const bs = AppState.findBlockById(blockId).settings;
    if (!bs || !popup) return;
    const gradientTarget = target || popup?.dataset?.gradientTarget || getActiveBannerGradientTarget(bs);

    const angleInput   = popup.querySelector('.grad-geo-angle');
    const balanceInput = popup.querySelector('.grad-geo-balance-slider');
    const balanceValue = popup.querySelector('.grad-popup__balance-value');
    const cxInput      = popup.querySelector('.grad-geo-cx');
    const cyInput      = popup.querySelector('.grad-geo-cy');

    if (angleInput)   angleInput.value   = Math.round(Number(getBannerGradientSettingValue(bs, gradientTarget, 'gradientAngle') ?? 0));
    if (cxInput)      cxInput.value      = Math.round(Number(getBannerGradientSettingValue(bs, gradientTarget, 'gradientCenterX') ?? 50));
    if (cyInput)      cyInput.value      = Math.round(Number(getBannerGradientSettingValue(bs, gradientTarget, 'gradientCenterY') ?? 50));
    if (balanceInput) balanceInput.value = Math.round(Number(getBannerGradientSettingValue(bs, gradientTarget, 'gradientBalance') ?? 100));
    if (balanceValue) balanceValue.textContent = `${Math.round(Number(getBannerGradientSettingValue(bs, gradientTarget, 'gradientBalance') ?? 100))}%`;
}

function positionGradientPopup(popup, anchorEl) {
    const rect = anchorEl.getBoundingClientRect();
    const popupW = 300;
    const gap = 8;

    let left = rect.right + gap;
    let top = rect.top;

    // Если не влезает справа — ставим слева от панели
    if (left + popupW > window.innerWidth - 20) {
        left = rect.left - popupW - gap;
    }
    // Если уходит за низ
    if (top + 480 > window.innerHeight) {
        top = window.innerHeight - 490;
    }
    if (top < 10) top = 10;

    popup.style.left = `${Math.round(left)}px`;
    popup.style.top = `${Math.round(top)}px`;
}

function _outsideClickHandler(e) {
    if (!_gradientPopupEl) {
        document.removeEventListener('mousedown', _outsideClickHandler);
        return;
    }
    if (!_gradientPopupEl.contains(e.target) && !e.target.closest('.color-gradient-btn') && !e.target.closest('.banner-gradient-toggle') && !e.target.closest('.banner-gradient-preview')) {
        closeGradientPopup();
        document.removeEventListener('mousedown', _outsideClickHandler);
    }
}

function closeGradientPopup() {
    if (_gradientPopupEl) {
        _gradientPopupEl.remove();
        _gradientPopupEl = null;
    }
    document.removeEventListener('mousedown', _outsideClickHandler);
}

function addBannerTextElement(blockId) {
    const block = AppState.findBlockById(blockId);
    if (!block) return;

    const s = block.settings;
    const newId = s.nextTextId || (s.textElements.length + 1);

    const newElement = {
        id: newId,
        text: 'Новый текст',
        x: 24,
        y: 50 + (s.textElements.length * 40),
        fontSize: 16,
        fontFamily: 'rt-regular',
        color: '#ffffff',
        iconEnabled: false,
        icon: '',
        iconCustom: '',
        badgeEnabled: false,
        badgeColor: '#a855f7',
        badgeRadius: 20,
        badgePaddingX: 16,
        badgePaddingY: 8
    };

    s.textElements.push(newElement);
    s.nextTextId = newId + 1;

    renderSettings();
    renderCanvas();
}

function deleteBannerTextElement(blockId, textElId) {
    const block = AppState.findBlockById(blockId);
    if (!block) return;

    block.settings.textElements = block.settings.textElements.filter(el => el.id !== textElId);

    renderBannerToDataUrl(block, (dataUrl) => {
        block.settings.renderedBanner = dataUrl || null;
        renderCanvas();
    });
    renderSettings();
}

function updateBannerTextElement(blockId, textElId, key, value) {
    const block = AppState.findBlockById(blockId);
    if (!block) return;

    const textEl = block.settings.textElements.find(el => el.id === textElId);
    if (textEl) {
        textEl[key] = value;
        renderBannerToDataUrl(block, (dataUrl) => {
            block.settings.renderedBanner = dataUrl || null;
            renderCanvas();
        });
    }
}

window.addBannerTextElement = addBannerTextElement;
window.deleteBannerTextElement = deleteBannerTextElement;
window.updateBannerTextElement = updateBannerTextElement;
// Делаем функции глобальными для доступа из других модулей
window.closeGradientPopup = closeGradientPopup;
