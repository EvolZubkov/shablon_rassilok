// settings/gradientPopup.js — popup-редактор градиента (открывается кнопкой)

/**
 * Directly mutates a banner gradient setting in AppState WITHOUT triggering
 * a canvas re-render.  Used inside the popup while the user is editing —
 * the canvas is updated only when the user clicks "Применить".
 * @param {string} blockId
 * @param {string} target - gradient target ('background' | 'leftBlock')
 * @param {string} key    - logical key, e.g. 'gradientAngle'
 * @param {*}      value
 * @returns {object} updated block
 */
function _mutateBannerGradient(blockId, target, key, value) {
    const blk = AppState.findBlockById(blockId);
    if (!blk) return blk;
    const fieldMap = {
        gradientAngle: 'angle', gradientCenterX: 'centerX', gradientCenterY: 'centerY',
        gradientBalance: 'balance', gradientEnabled: 'enabled', gradientStops: 'stops'
    };
    blk.settings[getBannerGradientKey(target, fieldMap[key] || key)] = value;
    return blk;
}

/**
 * Directly mutates a single gradient stop in AppState WITHOUT triggering
 * a canvas re-render.
 * @param {string} blockId
 * @param {number} stopId
 * @param {string} key   - stop property ('color' | 'opacity' | 'position')
 * @param {*}      value
 * @param {string} target
 * @returns {object} updated block
 */
function _mutateGradientStopDirect(blockId, stopId, key, value, target) {
    const blk = AppState.findBlockById(blockId);
    if (!blk) return blk;
    const stops = getGradientStopsModel(blk.settings, target).map(s =>
        s.id === stopId ? { ...s, [key]: value } : s
    );
    blk.settings[getBannerGradientKey(target, 'stops')] = normalizeGradientStops(stops);
    return blk;
}

function createGradientPopupDraft(settings, target) {
    const state = getBannerGradientState(settings, target);
    return {
        enabled: true,
        stops: normalizeGradientStops(state.stops).map((stop) => ({
            ...stop,
            opacity: Math.round(Number(stop.opacity ?? 100)),
            position: Math.round(Number(stop.position ?? 0))
        })),
        angle: Math.round(Number(state.angle ?? 0)),
        centerX: Math.round(Number(state.centerX ?? 50)),
        centerY: Math.round(Number(state.centerY ?? 50)),
        balance: Math.round(Number(state.balance ?? 100))
    };
}

function getGradientPopupDraft(popup) {
    if (!popup?._draft) {
        popup._draft = createGradientPopupDraft({}, popup?.dataset?.gradientTarget || 'background');
    }
    return popup._draft;
}

function buildGradientPreviewCssFromDraft(draft) {
    const stops = normalizeGradientStops(draft?.stops || []).map(
        (stop) => `${hexToRgba(stop.color, stop.opacity)} ${stop.position}%`
    );
    return `linear-gradient(${Number(draft?.angle ?? 0)}deg, ${stops.join(', ')})`;
}

function parseGradientPopupNumber(value, fallback = 0) {
    const normalized = String(value ?? '').trim().replace(',', '.');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? Math.round(parsed) : Math.round(Number(fallback) || 0);
}

function syncGradientPopupStopUi(popup, stopId) {
    if (!popup) return;

    const draft = getGradientPopupDraft(popup);
    const stop = normalizeGradientStops(draft?.stops || []).find((item) => item.id === stopId);
    if (!stop) return;

    const renderBarPins = popup._renderGradientBarPins;
    if (renderBarPins) {
        renderBarPins();
    } else {
        const pin = popup.querySelector(`.grad-popup__bar-pin[data-stop-id="${stopId}"]`);
        if (pin) {
            const clampedPos = Math.max(0, Math.min(100, Number(stop.position) || 0));
            pin.style.left = `calc(${clampedPos}% - 8px)`;
            pin.style.background = stop.color;
        }
    }

    const gradBar = popup.querySelector('.grad-popup__bar');
    if (gradBar) {
        gradBar.style.background = buildGradientPreviewCssFromDraft(draft);
    }

    const previewBox = popup.querySelector('.grad-preview__box');
    if (previewBox) {
        previewBox.style.background = buildGradientPreviewCssFromDraft(draft);
    }

    const updateFn = popup._updateHandlePositions;
    if (updateFn) updateFn();
}

function applyGradientPopupDraft(blockId, target, draft) {
    const blk = AppState.findBlockById(blockId);
    if (!blk) return;

    blk.settings[getBannerGradientKey(target, 'enabled')] = Boolean(draft?.enabled);
    blk.settings[getBannerGradientKey(target, 'stops')] = normalizeGradientStops(draft?.stops || []);
    blk.settings[getBannerGradientKey(target, 'angle')] = Math.round(Number(draft?.angle ?? 0));
    blk.settings[getBannerGradientKey(target, 'centerX')] = Math.round(Number(draft?.centerX ?? 50));
    blk.settings[getBannerGradientKey(target, 'centerY')] = Math.round(Number(draft?.centerY ?? 50));
    blk.settings[getBannerGradientKey(target, 'balance')] = Math.round(Number(draft?.balance ?? 100));

    renderSettings();
    renderBannerToDataUrl(blk, (dataUrl) => {
        blk.settings.renderedBanner = dataUrl || null;
        renderCanvas();
    });
}

function clampGradientPopupPosition(left, top, popup) {
    const popupRect = popup.getBoundingClientRect();
    const popupW = Math.round(popupRect.width || 300);
    const popupH = Math.round(popupRect.height || 0);
    const viewportPadding = 16;
    const maxLeft = Math.max(viewportPadding, window.innerWidth - popupW - viewportPadding);
    const maxTop = Math.max(viewportPadding, window.innerHeight - popupH - viewportPadding);

    return {
        left: Math.max(viewportPadding, Math.min(left, maxLeft)),
        top: Math.max(viewportPadding, Math.min(top, maxTop))
    };
}

function enableGradientPopupDrag(popup, dragHandle) {
    if (!popup || !dragHandle) return;

    let dragState = null;

    dragHandle.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        if (event.target.closest('button, input, select, textarea, label')) return;

        const popupRect = popup.getBoundingClientRect();
        dragState = {
            offsetX: event.clientX - popupRect.left,
            offsetY: event.clientY - popupRect.top,
            pointerId: event.pointerId
        };

        dragHandle.setPointerCapture(event.pointerId);
        popup.classList.add('grad-popup--dragging');
        event.preventDefault();
    });

    dragHandle.addEventListener('pointermove', (event) => {
        if (!dragState || dragState.pointerId !== event.pointerId) return;

        const nextPosition = clampGradientPopupPosition(
            event.clientX - dragState.offsetX,
            event.clientY - dragState.offsetY,
            popup
        );

        popup.style.left = `${Math.round(nextPosition.left)}px`;
        popup.style.top = `${Math.round(nextPosition.top)}px`;
    });

    const stopDragging = (event) => {
        if (!dragState || dragState.pointerId !== event.pointerId) return;
        dragState = null;
        popup.classList.remove('grad-popup--dragging');
        if (dragHandle.hasPointerCapture(event.pointerId)) {
            dragHandle.releasePointerCapture(event.pointerId);
        }
    };

    dragHandle.addEventListener('pointerup', stopDragging);
    dragHandle.addEventListener('pointercancel', stopDragging);
}

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

    const popup = document.createElement('div');
    popup.className = 'grad-popup';
    popup.dataset.blockId = String(block.id);
    popup.dataset.gradientTarget = gradientTarget;
    popup._blockId = block.id;
    popup._draft = createGradientPopupDraft(block.settings, gradientTarget);

    // Header
    const header = document.createElement('div');
    header.className = 'grad-popup__header';

    const modeLabel = document.createElement('span');
    modeLabel.className = 'grad-popup__mode';
    modeLabel.textContent = `Область: ${gradientTarget === 'background' ? 'Подложка' : 'Левый блок'}`;

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'grad-popup__close';
    closeBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
    closeBtn.addEventListener('click', () => closeGradientPopup(false));

    header.appendChild(modeLabel);
    header.appendChild(closeBtn);
    popup.appendChild(header);

    // Body (preview + stops + geometry) — в отдельной функции для рефреша
    const body = document.createElement('div');
    body.className = 'grad-popup__body';
    popup.appendChild(body);
    refreshGradientPopupBody(popup, block);

    const footer = document.createElement('div');
    footer.className = 'grad-popup__footer';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'grad-popup__action';
    cancelBtn.textContent = 'Отменить';
    cancelBtn.addEventListener('click', () => closeGradientPopup(false));

    const okBtn = document.createElement('button');
    okBtn.type = 'button';
    okBtn.className = 'grad-popup__action grad-popup__action--primary';
    okBtn.textContent = 'Применить';
    okBtn.addEventListener('click', () => closeGradientPopup(true));

    footer.appendChild(cancelBtn);
    footer.appendChild(okBtn);
    popup.appendChild(footer);

    document.body.appendChild(popup);
    _gradientPopupEl = popup;

    // Позиционирование под кнопкой
    positionGradientPopup(popup, anchorEl);
    enableGradientPopupDrag(popup, header);

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
    const draft = getGradientPopupDraft(popup);

    // === INTERACTIVE GRADIENT PREVIEW (Figma-style) ===
    const previewWrap = document.createElement('div');
    previewWrap.className = 'grad-preview';

    // Квадратный превью-блок
    const previewBox = document.createElement('div');
    previewBox.className = 'grad-preview__box';
    previewBox.style.background = buildGradientPreviewCssFromDraft(draft);

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
        const currentDraft = getGradientPopupDraft(popup);
        const angle = Number(currentDraft.angle ?? 0);
        const cx = Number(currentDraft.centerX ?? 50);
        const cy = Number(currentDraft.centerY ?? 50);
        const balance = Number(currentDraft.balance ?? 100);

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

        const handleInset = 12;
        const clampHandle = (value, max) => Math.max(handleInset, Math.min(value, max - handleInset));

        const startXpx = clampHandle(cxPx - dxPx, boxW);
        const startYpx = clampHandle(cyPx - dyPx, boxH);
        const endXpx   = clampHandle(cxPx + dxPx, boxW);
        const endYpx   = clampHandle(cyPx + dyPx, boxH);

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
        const stops = normalizeGradientStops(currentDraft.stops || []);
        if (stops.length > 0) {
            handleStartDot.style.background = stops[0].color;
            handleEndDot.style.background   = stops[stops.length - 1].color;
        }

        // Фон превью
        previewBox.style.background = buildGradientPreviewCssFromDraft(currentDraft);
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

            const currentDraft = getGradientPopupDraft(popup);
            const curAngle = Number(currentDraft.angle ?? 0);
            const curCX = Number(currentDraft.centerX ?? 50);
            const curCY = Number(currentDraft.centerY ?? 50);
            const curBalance = Number(currentDraft.balance ?? 100);

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
            currentDraft.angle = newAngle;
            currentDraft.balance = newBalance;
            currentDraft.centerX = newCX;
            currentDraft.centerY = newCY;

            updateHandlePositions();
            syncGeoFields(popup, target);
        });

        handle.addEventListener('pointerup', () => {
            if (!dragging) return;
            dragging = false;
            handle.classList.remove('grad-preview__handle--dragging');
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
            const currentDraft = getGradientPopupDraft(popup);
            currentDraft.centerX = newCX;
            currentDraft.centerY = newCY;
            updateHandlePositions();
            syncGeoFields(popup, target);
        };

        const onUp = () => {
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup', onUp);
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
    gradBar.style.background = buildGradientPreviewCssFromDraft(draft);

    function syncBarGradient() {
        gradBar.style.background = buildGradientPreviewCssFromDraft(getGradientPopupDraft(popup));
    }

    function renderBarPins() {
        gradBar.querySelectorAll('.grad-popup__bar-pin').forEach((pin) => pin.remove());
        const currentStops = normalizeGradientStops(getGradientPopupDraft(popup).stops || []);

        currentStops.forEach((stop) => {
            const pin = document.createElement('div');
            pin.className = 'grad-popup__bar-pin';
            pin.dataset.stopId = String(stop.id);
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
                    const currentDraft = getGradientPopupDraft(popup);
                    currentDraft.stops = normalizeGradientStops(
                        currentDraft.stops.map((item) => item.id === stop.id ? { ...item, position: pct } : item)
                    );
                    syncBarGradient();
                    const updateFn = popup._updateHandlePositions;
                    if (updateFn) updateFn();
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
    }

    popup._renderGradientBarPins = renderBarPins;
    renderBarPins();

    gradBar.addEventListener('dblclick', (e) => {
        if (e.target.closest('.grad-popup__bar-pin')) return;

        const barRect = gradBar.getBoundingClientRect();
        const rawPct = ((e.clientX - barRect.left) / barRect.width) * 100;
        const position = Math.round(Math.max(0, Math.min(100, rawPct)));
        const currentDraft = getGradientPopupDraft(popup);
        const currentStops = normalizeGradientStops(currentDraft.stops || []);

        let color = '#FFFFFF';
        if (currentStops.length === 0) {
            color = '#FFFFFF';
        } else if (currentStops.length === 1) {
            color = currentStops[0].color;
        } else {
            let leftStop = currentStops[0];
            let rightStop = currentStops[currentStops.length - 1];

            for (let i = 0; i < currentStops.length - 1; i += 1) {
                const current = currentStops[i];
                const next = currentStops[i + 1];
                if (position >= current.position && position <= next.position) {
                    leftStop = current;
                    rightStop = next;
                    break;
                }
            }

            const range = rightStop.position - leftStop.position;
            const ratio = range <= 0 ? 0 : (position - leftStop.position) / range;
            color = interpolateGradientHex(leftStop.color, rightStop.color, ratio);
        }

        currentDraft.stops = normalizeGradientStops([
            ...currentStops,
            {
                id: Date.now(),
                color,
                opacity: 100,
                position
            }
        ]);
        refreshGradientPopupBody(popup, block);
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
    stopsTitle.textContent = 'Точки';
    const addStopBtn = document.createElement('button');
    addStopBtn.type = 'button';
    addStopBtn.className = 'grad-popup__icon-btn';
    addStopBtn.textContent = '+';
    addStopBtn.addEventListener('click', () => {
        const currentDraft = getGradientPopupDraft(popup);
        const nextStops = [...currentDraft.stops, { id: Date.now(), color: '#FFFFFF', opacity: 100, position: 50 }];
        currentDraft.stops = normalizeGradientStops(nextStops);
        refreshGradientPopupBody(popup, block);
    });
    stopsHead.appendChild(stopsTitle);
    stopsHead.appendChild(addStopBtn);
    stopsSection.appendChild(stopsHead);

    const stopsLabels = document.createElement('div');
    stopsLabels.className = 'grad-popup__stop-label-row';
    stopsLabels.innerHTML = `
        <span class="grad-popup__stop-col-label">Позиция</span>
        <span class="grad-popup__stop-col-label">Цвет</span>
        <span class="grad-popup__stop-col-label">Непрозрачность</span>
        <span></span>
    `;
    stopsSection.appendChild(stopsLabels);

    const stopList = document.createElement('div');
    stopList.className = 'grad-popup__stop-list';

    const stops = normalizeGradientStops(draft.stops || []);
    stops.forEach((stop) => {
        const row = document.createElement('div');
        row.className = 'grad-popup__stop-row';

        // Позиция
        const posWrap = document.createElement('div');
        posWrap.className = 'grad-popup__stop-field grad-popup__stop-field--pos';
        const posInput = document.createElement('input');
        posInput.type = 'number';
        posInput.min = 0; posInput.max = 100;
        posInput.step = '1';
        posInput.value = stop.position;
        posInput.className = 'grad-popup__mini-input';
        const posSuffix = document.createElement('span');
        posSuffix.className = 'grad-popup__mini-suffix';
        posSuffix.textContent = '%';
        posInput.addEventListener('input', (e) => {
            const currentDraft = getGradientPopupDraft(popup);
            currentDraft.stops = normalizeGradientStops(
                currentDraft.stops.map((item) => item.id === stop.id ? { ...item, position: parseGradientPopupNumber(e.target.value, item.position) } : item)
            );
            syncGradientPopupStopUi(popup, stop.id);
        });
        posInput.addEventListener('change', (e) => {
            const currentDraft = getGradientPopupDraft(popup);
            currentDraft.stops = normalizeGradientStops(
                currentDraft.stops.map((item) => item.id === stop.id ? { ...item, position: parseGradientPopupNumber(e.target.value, item.position) } : item)
            );
            refreshGradientPopupBody(popup, block);
        });
        attachDragScrubToNumberControl(posWrap, posInput, {
            min: 0,
            max: 100,
            onApply: (value) => {
                const currentDraft = getGradientPopupDraft(popup);
                currentDraft.stops = normalizeGradientStops(
                    currentDraft.stops.map((item) => item.id === stop.id ? { ...item, position: parseGradientPopupNumber(value, item.position) } : item)
                );
                posInput.value = String(parseGradientPopupNumber(value, stop.position));
                syncGradientPopupStopUi(popup, stop.id);
            }
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
                    const currentDraft = getGradientPopupDraft(popup);
                    currentDraft.stops = normalizeGradientStops(
                        currentDraft.stops.map((item) => item.id === stop.id ? { ...item, color: chosen } : item)
                    );
                    gradBar.style.background = buildGradientPreviewCssFromDraft(currentDraft);
                    const updateFn = popup._updateHandlePositions;
                    if (updateFn) updateFn();
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
            const currentDraft = getGradientPopupDraft(popup);
            currentDraft.stops = normalizeGradientStops(
                currentDraft.stops.map((item) => item.id === stop.id ? { ...item, color: hex } : item)
            );
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
        opInput.step = '1';
        opInput.value = stop.opacity ?? 100;
        opInput.className = 'grad-popup__mini-input';
        const opSuffix2 = document.createElement('span');
        opSuffix2.className = 'grad-popup__mini-suffix';
        opSuffix2.textContent = '%';
        opInput.addEventListener('change', (e) => {
            const currentDraft = getGradientPopupDraft(popup);
            currentDraft.stops = normalizeGradientStops(
                currentDraft.stops.map((item) => item.id === stop.id ? { ...item, opacity: parseGradientPopupNumber(e.target.value, item.opacity ?? 100) } : item)
            );
            refreshGradientPopupBody(popup, block);
        });
        attachDragScrubToNumberControl(opWrap, opInput, {
            min: 0,
            max: 100,
            onApply: (value) => {
                const currentDraft = getGradientPopupDraft(popup);
                currentDraft.stops = normalizeGradientStops(
                    currentDraft.stops.map((item) => item.id === stop.id ? { ...item, opacity: parseGradientPopupNumber(value, item.opacity ?? 100) } : item)
                );
                opInput.value = String(parseGradientPopupNumber(value, stop.opacity ?? 100));
                syncGradientPopupStopUi(popup, stop.id);
            }
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
            const currentDraft = getGradientPopupDraft(popup);
            const cur = currentDraft.stops;
            if (cur.length <= 2) return;
            currentDraft.stops = normalizeGradientStops(cur.filter(item => item.id !== stop.id));
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
    geoTitle.textContent = 'Геометрия';
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
            const currentDraft = getGradientPopupDraft(popup);
            const nextValue = parseGradientPopupNumber(e.target.value, currentVal);
            if (settingKey === 'gradientAngle') currentDraft.angle = nextValue;
            if (settingKey === 'gradientCenterX') currentDraft.centerX = nextValue;
            if (settingKey === 'gradientCenterY') currentDraft.centerY = nextValue;
            gradBar.style.background = buildGradientPreviewCssFromDraft(currentDraft);
            const prevBox = popup.querySelector('.grad-preview__box');
            if (prevBox) prevBox.style.background = buildGradientPreviewCssFromDraft(currentDraft);
            const updateFn = popup._updateHandlePositions;
            if (updateFn) updateFn();
        });
        attachDragScrubToNumberControl(fieldRow, input, {
            min,
            max,
            onApply: (value) => {
                const currentDraft = getGradientPopupDraft(popup);
                const nextValue = parseGradientPopupNumber(value, currentVal);
                if (settingKey === 'gradientAngle') currentDraft.angle = nextValue;
                if (settingKey === 'gradientCenterX') currentDraft.centerX = nextValue;
                if (settingKey === 'gradientCenterY') currentDraft.centerY = nextValue;
                gradBar.style.background = buildGradientPreviewCssFromDraft(currentDraft);
                const prevBox = popup.querySelector('.grad-preview__box');
                if (prevBox) prevBox.style.background = buildGradientPreviewCssFromDraft(currentDraft);
                const updateFn = popup._updateHandlePositions;
                if (updateFn) updateFn();
            }
        });
        // НЕ вызываем renderSettings() on change — это уничтожит DOM попапа
        cell.appendChild(lbl);
        cell.appendChild(fieldRow);
        return { cell, input };
    }

    const cxField = makeGeoField('Позиция X', 'gradientCenterX', 0, 100, 1, '', Number(draft.centerX ?? 50));
    const cyField = makeGeoField('Позиция Y', 'gradientCenterY', 0, 100, 1, '', Number(draft.centerY ?? 50));
    cxField.input.classList.add('grad-geo-cx');
    cyField.input.classList.add('grad-geo-cy');
    geoGrid.appendChild(cxField.cell);
    geoGrid.appendChild(cyField.cell);

    const balCell = document.createElement('div');
    balCell.className = 'grad-popup__geo-cell';
    const balLbl = document.createElement('label');
    balLbl.className = 'grad-popup__geo-label';
    balLbl.textContent = 'Баланс';
    const balRow = document.createElement('div');
    balRow.className = 'grad-popup__geo-field';
    const balInput = document.createElement('input');
    balInput.type = 'number';
    balInput.min = 1;
    balInput.max = 200;
    balInput.step = 1;
    balInput.value = Number(draft.balance ?? 100);
    balInput.className = 'grad-popup__geo-input grad-geo-balance-input';
    const balUnit = document.createElement('span');
    balUnit.className = 'grad-popup__geo-unit';
    balUnit.textContent = '%';
    balInput.addEventListener('input', (e) => {
        const currentDraft = getGradientPopupDraft(popup);
        currentDraft.balance = parseGradientPopupNumber(e.target.value, currentDraft.balance ?? 100);
        gradBar.style.background = buildGradientPreviewCssFromDraft(currentDraft);
        const prevBox = popup.querySelector('.grad-preview__box');
        if (prevBox) prevBox.style.background = buildGradientPreviewCssFromDraft(currentDraft);
        const updateFn = popup._updateHandlePositions;
        if (updateFn) updateFn();
    });
    attachDragScrubToNumberControl(balRow, balInput, {
        min: 1,
        max: 200,
        onApply: (value) => {
            const currentDraft = getGradientPopupDraft(popup);
            currentDraft.balance = parseGradientPopupNumber(value, currentDraft.balance ?? 100);
            gradBar.style.background = buildGradientPreviewCssFromDraft(currentDraft);
            const prevBox = popup.querySelector('.grad-preview__box');
            if (prevBox) prevBox.style.background = buildGradientPreviewCssFromDraft(currentDraft);
            const updateFn = popup._updateHandlePositions;
            if (updateFn) updateFn();
        }
    });
    balRow.appendChild(balInput);
    balRow.appendChild(balUnit);
    balCell.appendChild(balLbl);
    balCell.appendChild(balRow);
    geoGrid.appendChild(balCell);

    const angleField   = makeGeoField('Угол', 'gradientAngle', -360, 360, 1, '°', Number(draft.angle ?? 0));
    angleField.input.classList.add('grad-geo-angle');
    geoGrid.appendChild(angleField.cell);

    geoSection.appendChild(geoGrid);
    body.appendChild(geoSection);
}

// Синхронизирует поля Geometry в попапе без полного рефреша
function syncGeoFields(popup, target = null) {
    if (!popup) return;
    const draft = getGradientPopupDraft(popup);
    const gradientTarget = target || popup?.dataset?.gradientTarget || 'background';

    const angleInput   = popup.querySelector('.grad-geo-angle');
    const balanceInput = popup.querySelector('.grad-geo-balance-input');
    const cxInput      = popup.querySelector('.grad-geo-cx');
    const cyInput      = popup.querySelector('.grad-geo-cy');

    if (gradientTarget) {
        if (angleInput)   angleInput.value   = Math.round(Number(draft.angle ?? 0));
        if (cxInput)      cxInput.value      = Math.round(Number(draft.centerX ?? 50));
        if (cyInput)      cyInput.value      = Math.round(Number(draft.centerY ?? 50));
        if (balanceInput) balanceInput.value = Math.round(Number(draft.balance ?? 100));
    }
}

function positionGradientPopup(popup, anchorEl) {
    const rect = anchorEl.getBoundingClientRect();
    const popupRect = popup.getBoundingClientRect();
    const popupW = Math.round(popupRect.width || 300);
    const gap = 8;

    let left = rect.right + gap;
    let top = rect.top;

    // Если не влезает справа — ставим слева от панели
    if (left + popupW > window.innerWidth - 16) {
        left = rect.left - popupW - gap;
    }
    if (left < 16) {
        left = Math.max(
            16,
            Math.min(rect.left, window.innerWidth - popupW - 16)
        );
    }
    const nextPosition = clampGradientPopupPosition(left, top, popup);

    popup.style.left = `${Math.round(nextPosition.left)}px`;
    popup.style.top = `${Math.round(nextPosition.top)}px`;
}

function _outsideClickHandler(e) {
    if (!_gradientPopupEl) {
        document.removeEventListener('mousedown', _outsideClickHandler);
        return;
    }
    const colorModal = document.getElementById('banner-color-modal');
    if (colorModal && colorModal.style.display === 'flex') return;
    if (!_gradientPopupEl.contains(e.target) && !e.target.closest('.color-gradient-btn') && !e.target.closest('.banner-gradient-toggle') && !e.target.closest('.banner-gradient-preview')) {
        closeGradientPopup(false);
        document.removeEventListener('mousedown', _outsideClickHandler);
    }
}

function closeGradientPopup(applyChanges = false) {
    if (_gradientPopupEl) {
        if (applyChanges) {
            applyGradientPopupDraft(
                _gradientPopupEl._blockId,
                _gradientPopupEl.dataset.gradientTarget,
                getGradientPopupDraft(_gradientPopupEl)
            );
        }
        _gradientPopupEl.remove();
        _gradientPopupEl = null;
    }
    document.removeEventListener('mousedown', _outsideClickHandler);
}

function interpolateGradientHex(startHex, endHex, ratio) {
    const safeRatio = Math.max(0, Math.min(1, Number(ratio) || 0));
    const parseHex = (hex) => {
        const normalized = ensureHex(hex).replace('#', '');
        return {
            r: parseInt(normalized.slice(0, 2), 16),
            g: parseInt(normalized.slice(2, 4), 16),
            b: parseInt(normalized.slice(4, 6), 16)
        };
    };

    const start = parseHex(startHex);
    const end = parseHex(endHex);
    const toHex = (value) => Math.round(value).toString(16).padStart(2, '0').toUpperCase();

    return `#${toHex(start.r + (end.r - start.r) * safeRatio)}${toHex(start.g + (end.g - start.g) * safeRatio)}${toHex(start.b + (end.b - start.b) * safeRatio)}`;
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
