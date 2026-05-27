// settings/canvasBlockSettings.js

let _canvasSelId = null;
let _canvasDrag = null;
let _layerDragId = null;

// ── Drag элементов на холсте ──────────────────────────────────────────
function startCanvasElemDrag(event, blockId, elemId) {
    if (typeof updateBlockSetting !== 'function') return; // user-mode: no editing
    event.preventDefault();
    event.stopPropagation();
    const b = AppState.findBlockById(parseInt(blockId));
    if (!b) return;
    const elem = (b.settings.freeElements || []).find(e => e.id === parseInt(elemId));
    if (!elem) return;
    _canvasSelId = parseInt(elemId);
    const emailBlock = document.querySelector(`.email-block[data-block-id="${blockId}"]`);
    if (emailBlock) emailBlock.draggable = false;
    _canvasDrag = { blockId: parseInt(blockId), elemId: parseInt(elemId), startX: event.clientX, startY: event.clientY, origX: elem.x || 0, origY: elem.y || 0, emailBlock };
    document.addEventListener('mousemove', _onCanvasDragMove);
    document.addEventListener('mouseup', _onCanvasDragEnd);
}
function _onCanvasDragMove(event) {
    if (!_canvasDrag) return;
    const b = AppState.findBlockById(_canvasDrag.blockId);
    if (!b) return;
    const elem = (b.settings.freeElements || []).find(e => e.id === _canvasDrag.elemId);
    if (!elem) return;
    const canvasW = 600;
    const canvasH = b.settings.height || 250;
    const elemW = elem.w || 10;
    const elemH = elem.h != null ? elem.h : 20;
    const rawX = Math.round(_canvasDrag.origX + event.clientX - _canvasDrag.startX);
    const rawY = Math.round(_canvasDrag.origY + event.clientY - _canvasDrag.startY);
    elem.x = Math.max(0, Math.min(rawX, canvasW - elemW));
    elem.y = Math.max(0, Math.min(rawY, canvasH - elemH));
    const elDom = document.querySelector(`[data-canvas-elem-id="${_canvasDrag.elemId}"]`);
    if (elDom) { elDom.style.left = elem.x + 'px'; elDom.style.top = elem.y + 'px'; }
}
function _onCanvasDragEnd() {
    if (!_canvasDrag) return;
    const { blockId, emailBlock } = _canvasDrag;
    if (emailBlock) emailBlock.draggable = true;
    const b = AppState.findBlockById(blockId);
    if (b && typeof updateBlockSetting === 'function') { updateBlockSetting(blockId, 'freeElements', [...(b.settings.freeElements || [])]); }
    if (typeof renderSettings === 'function') { renderSettings(); }
    _canvasDrag = null;
    document.removeEventListener('mousemove', _onCanvasDragMove);
    document.removeEventListener('mouseup', _onCanvasDragEnd);
}

// ── PNG захват через Canvas 2D API (без html2canvas / DOM) ───────────
function renderCanvasBlockToDataUrl(block, callback) {
    if (typeof renderFreeBlockToDataUrl === 'function') {
        renderFreeBlockToDataUrl(block, callback);
    } else {
        callback(null);
    }
}

// ── Фабрика элементов ─────────────────────────────────────────────────
function _mkCanvasEl(type, bgColor) {
    const id = Date.now() + Math.floor(Math.random() * 10000);
    const isLight = bgColor && typeof isLightColorPreview === 'function' ? isLightColorPreview(bgColor) : false;
    const tc = isLight ? '#1D2533' : '#ffffff';
    const sc = isLight ? '#4b5563' : '#e5e7eb';
    if (type === 'heading') return { id, type: 'text', x: 20, y: 20, w: 320, text: 'Заголовок', fontSize: 28, fontWeight: 700, color: tc, textAlign: 'left', lineHeight: 1.2, opacity: 1, visible: true };
    if (type === 'text')    return { id, type: 'text', x: 20, y: 60, w: 260, text: 'Текст',      fontSize: 15, fontWeight: 400, color: sc,  textAlign: 'left', lineHeight: 1.4, opacity: 1, visible: true };
    if (type === 'shape')   return { id, type: 'shape', x: 20, y: 20, w: 120, h: 60, bgColor: '#a855f7', clipPath: 'none', borderRadius: 0, rotation: 0, aspectLock: false, opacity: 1, visible: true };
    if (type === 'image')   return { id, type: 'image', x: 20, y: 20, w: 120, h: 80, src: '', objectFit: 'cover', clipPath: 'none', borderRadius: 0, rotation: 0, aspectLock: true, opacity: 1, visible: true };
    if (type === 'line')    return { id, type: 'line',  x: 20, y: 80, w: 560, h: 2, color: sc, lineStyle: 'solid', rotation: 0, opacity: 1, visible: true };
    return { id, type, x: 20, y: 20, w: 100, h: 60, opacity: 1, visible: true };
}

// ── Главная панель настроек ───────────────────────────────────────────
function renderCanvasBlockSettings(container, block) {
    const s = block.settings;
    const elements = Array.isArray(s.freeElements) ? s.freeElements : [];

    // Высота
    container.appendChild(createSettingRange('Высота блока', s.height || 250, block.id, 'height', 100, 600));

    // Фон
    const isBgEnabled = s.bgEnabled !== false;
    const bgTogRow = document.createElement('div');
    bgTogRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:8px;';
    const bgTogLbl = document.createElement('span');
    bgTogLbl.textContent = 'Фон';
    bgTogLbl.style.cssText = 'font-size:12px;color:var(--text-muted);flex:1;';
    const bgTogBtn = document.createElement('button');
    bgTogBtn.type = 'button';
    bgTogBtn.textContent = isBgEnabled ? 'Вкл' : 'Выкл';
    bgTogBtn.style.cssText = `padding:4px 10px;border-radius:4px;font-size:11px;cursor:pointer;border:1px solid ${isBgEnabled ? 'var(--accent-primary)' : 'var(--border-secondary)'};background:${isBgEnabled ? 'rgba(168,85,247,0.15)' : 'var(--bg-hover)'};color:var(--text-secondary);`;
    bgTogBtn.addEventListener('click', () => { updateBlockSetting(block.id, 'bgEnabled', !isBgEnabled); renderSettings(); });
    bgTogRow.appendChild(bgTogLbl); bgTogRow.appendChild(bgTogBtn);
    container.appendChild(bgTogRow);

    if (isBgEnabled) {
        const bgRow = document.createElement('div');
        bgRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:12px;';
        const bgLbl = document.createElement('span');
        bgLbl.textContent = 'Цвет фона';
        bgLbl.style.cssText = 'font-size:12px;color:var(--text-muted);flex:1;';
        const bgBtn = document.createElement('button');
        bgBtn.type = 'button';
        bgBtn.style.cssText = `width:36px;height:28px;border-radius:4px;border:1px solid var(--border-secondary);background:${s.bgColor || '#1D2533'};cursor:pointer;`;
        bgBtn.addEventListener('click', () => pickColor({ title: 'Цвет фона', currentColor: s.bgColor || '#1D2533', allowTransparent: false, onApply: c => { bgBtn.style.background = c; updateBlockSetting(block.id, 'bgColor', c); } }));
        bgRow.appendChild(bgLbl); bgRow.appendChild(bgBtn);
        container.appendChild(bgRow);
    }

    // Разделитель
    const divider = document.createElement('div');
    divider.style.cssText = 'display:flex;align-items:center;gap:8px;margin:4px 0 10px;color:var(--text-muted);font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;';
    divider.innerHTML = `<span style="flex:1;height:1px;background:var(--border-primary)"></span><span>Элементы</span><span style="flex:1;height:1px;background:var(--border-primary)"></span>`;
    container.appendChild(divider);

    // ── Хелперы ───────────────────────────────────────────────────────
    const updEl = (id, key, value) => {
        const b = AppState.findBlockById(block.id);
        if (!b) return;
        const els = (b.settings.freeElements || []).map(e => e.id === id ? { ...e, [key]: value } : e);
        b.settings.freeElements = els;
        updateBlockSetting(block.id, 'freeElements', els);
    };
    const saveAndRefresh = (newEls) => {
        const b = AppState.findBlockById(block.id);
        if (!b) return;
        b.settings.freeElements = newEls;
        updateBlockSetting(block.id, 'freeElements', newEls);
        renderSettings();
    };

    // ── Кнопки добавления ─────────────────────────────────────────────
    const addRow1 = document.createElement('div');
    addRow1.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin-bottom:5px;';
    const addRow2 = document.createElement('div');
    addRow2.style.cssText = 'display:grid;grid-template-columns:repeat(2,1fr);gap:5px;margin-bottom:10px;';

    const mkAddBtn = (label, type, row) => {
        const btn = document.createElement('button');
        btn.type = 'button'; btn.textContent = label;
        btn.style.cssText = 'padding:6px 4px;background:var(--bg-hover);border:1px dashed var(--border-secondary);border-radius:6px;color:var(--text-secondary);cursor:pointer;font-size:11px;transition:border-color .15s;';
        btn.addEventListener('mouseenter', () => btn.style.borderColor = 'var(--accent-primary)');
        btn.addEventListener('mouseleave', () => btn.style.borderColor = 'var(--border-secondary)');
        btn.addEventListener('click', () => {
            const b = AppState.findBlockById(block.id);
            const bgOn = b ? (b.settings.bgEnabled !== false) : true;
            const curBg = bgOn ? (b ? (b.settings.bgColor || '#1D2533') : '#1D2533') : '#ffffff';
            const newEl = _mkCanvasEl(type, curBg);
            _canvasSelId = newEl.id;
            const cur = b ? (b.settings.freeElements || []) : elements;
            saveAndRefresh([...cur, newEl]);
        });
        row.appendChild(btn);
    };
    mkAddBtn('+ Заголовок', 'heading', addRow1);
    mkAddBtn('+ Текст',     'text',    addRow1);
    mkAddBtn('+ Фигура',    'shape',   addRow1);
    mkAddBtn('+ Картинка',  'image',   addRow2);
    mkAddBtn('+ Линия',     'line',    addRow2);
    container.appendChild(addRow1);
    container.appendChild(addRow2);

    if (!elements.length) {
        const empty = document.createElement('div');
        empty.style.cssText = 'text-align:center;color:var(--text-muted);font-size:11px;padding:4px 0 10px;';
        empty.textContent = 'Нет элементов — добавьте выше';
        container.appendChild(empty);
        return;
    }

    // ── Список слоёв с drag-and-drop ──────────────────────────────────
    const ICONS = { text: 'T', shape: '◻', image: '🖼', line: '—' };
    const TYPE_LABELS = { text: 'Текст', shape: 'Фигура', image: 'Картинка', line: 'Линия' };
    const layerList = document.createElement('div');
    layerList.style.cssText = 'display:flex;flex-direction:column;gap:3px;margin-bottom:10px;';

    elements.forEach(e => {
        const isSel = e.id === _canvasSelId;
        const isVis = e.visible !== false;
        const row = document.createElement('div');
        row.draggable = true;
        row.style.cssText = `display:flex;align-items:center;gap:5px;padding:5px 7px;border-radius:5px;cursor:pointer;background:${isSel ? 'rgba(168,85,247,0.15)' : 'var(--bg-hover)'};border:1px solid ${isSel ? 'var(--accent-primary)' : 'var(--border-secondary)'};transition:opacity .1s;`;

        // Drag-and-drop слоёв
        row.addEventListener('dragstart', ev => {
            _layerDragId = e.id;
            ev.dataTransfer.effectAllowed = 'move';
            setTimeout(() => row.style.opacity = '0.4', 0);
        });
        row.addEventListener('dragend', () => { row.style.opacity = ''; _layerDragId = null; });
        row.addEventListener('dragover', ev => {
            ev.preventDefault();
            ev.dataTransfer.dropEffect = 'move';
            row.style.boxShadow = 'inset 0 2px 0 var(--accent-primary)';
        });
        row.addEventListener('dragleave', () => { row.style.boxShadow = ''; });
        row.addEventListener('drop', ev => {
            ev.preventDefault();
            row.style.boxShadow = '';
            if (_layerDragId == null || _layerDragId === e.id) return;
            const b = AppState.findBlockById(block.id);
            if (!b) return;
            const els = [...(b.settings.freeElements || [])];
            const fromIdx = els.findIndex(x => x.id === _layerDragId);
            const toIdx   = els.findIndex(x => x.id === e.id);
            if (fromIdx === -1 || toIdx === -1) return;
            els.splice(toIdx, 0, els.splice(fromIdx, 1)[0]);
            _layerDragId = null;
            saveAndRefresh(els);
        });

        // Видимость
        const visBtn = document.createElement('button');
        visBtn.type = 'button'; visBtn.textContent = isVis ? '👁' : '·';
        visBtn.style.cssText = `background:none;border:none;cursor:pointer;font-size:11px;padding:0;flex-shrink:0;width:16px;opacity:${isVis ? '0.7' : '0.3'};`;
        visBtn.addEventListener('click', ev => { ev.stopPropagation(); updEl(e.id, 'visible', !isVis); });

        const icon = document.createElement('span');
        icon.textContent = ICONS[e.type] || '?';
        icon.style.cssText = 'font-size:11px;color:var(--text-muted);flex-shrink:0;width:14px;text-align:center;';

        // Drag handle
        const grip = document.createElement('span');
        grip.textContent = '⋮⋮';
        grip.style.cssText = 'font-size:9px;color:var(--text-muted);opacity:0.4;flex-shrink:0;cursor:grab;letter-spacing:-2px;';

        const name = document.createElement('span');
        const lbl = e.type === 'text' ? (e.text || 'Текст').slice(0, 18) : (TYPE_LABELS[e.type] || e.type);
        name.textContent = lbl;
        name.style.cssText = `font-size:11px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-secondary);${!isVis ? 'opacity:.4;' : ''}`;

        const delBtn = document.createElement('button');
        delBtn.type = 'button'; delBtn.textContent = '✕';
        delBtn.style.cssText = 'background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:10px;padding:0 2px;flex-shrink:0;';
        delBtn.addEventListener('click', ev => { ev.stopPropagation(); if (_canvasSelId === e.id) _canvasSelId = null; saveAndRefresh(elements.filter(x => x.id !== e.id)); });

        row.appendChild(grip); row.appendChild(visBtn); row.appendChild(icon); row.appendChild(name); row.appendChild(delBtn);
        row.addEventListener('click', () => { _canvasSelId = isSel ? null : e.id; renderSettings(); });
        layerList.appendChild(row);
    });
    container.appendChild(layerList);

    // ── Свойства выбранного элемента ──────────────────────────────────
    const sel = elements.find(e => e.id === _canvasSelId);
    if (!sel) return;

    const props = document.createElement('div');
    props.style.cssText = 'padding:10px;background:var(--bg-secondary);border:1px solid var(--border-secondary);border-radius:8px;display:flex;flex-direction:column;gap:8px;';

    const wRef = { inp: null };
    const hRef = { inp: null };

    // ── Figma-style scrub на числовых полях ───────────────────────────
    const applyScrub = (inp, onUpdate) => {
        inp.style.cursor = 'ew-resize';
        inp.addEventListener('focus', () => { inp.style.cursor = 'text'; });
        inp.addEventListener('blur',  () => { inp.style.cursor = 'ew-resize'; });
        inp.addEventListener('mousedown', ev => {
            if (ev.button !== 0) return;
            ev.preventDefault(); // не даём браузеру сразу фокусировать
            const startX = ev.clientX, startVal = parseFloat(inp.value) || 0;
            let dragged = false;
            const onMove = ev2 => {
                const dx = ev2.clientX - startX;
                if (!dragged && Math.abs(dx) < 3) return;
                dragged = true;
                const speed = ev2.shiftKey ? 10 : 1;
                let nv = Math.round(startVal + dx * speed);
                if (inp.min !== '') nv = Math.max(parseFloat(inp.min), nv);
                if (inp.max !== '') nv = Math.min(parseFloat(inp.max), nv);
                inp.value = nv;
                onUpdate(nv);
            };
            const onUp = () => {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                if (!dragged) { inp.focus(); inp.select(); }
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
        inp.addEventListener('change', () => onUpdate(parseFloat(inp.value) || 0));
    };

    // Числовое поле с учётом aspect lock для w/h
    const mkPosInp = (lbl, val, key, min, max) => {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex;align-items:center;gap:4px;min-width:0;';
        const l = document.createElement('span');
        l.textContent = lbl;
        l.style.cssText = 'font-size:10px;color:var(--text-muted);flex-shrink:0;';
        const inp = document.createElement('input');
        inp.type = 'number'; inp.value = Math.round(val ?? 0);
        if (min != null) inp.min = min; if (max != null) inp.max = max;
        inp.style.cssText = 'flex:1;min-width:0;width:0;padding:4px 5px;border-radius:4px;border:1px solid var(--border-secondary);background:var(--bg-input);color:var(--text-secondary);font-size:12px;';
        if (key === 'w') wRef.inp = inp;
        if (key === 'h') hRef.inp = inp;
        applyScrub(inp, nv => {
            const b2 = AppState.findBlockById(block.id);
            const cur = b2 && (b2.settings.freeElements || []).find(el => el.id === sel.id);
            if (cur && cur.aspectLock && (key === 'w' || key === 'h') && cur.w && cur.h) {
                const isW = key === 'w';
                const ratio = isW ? cur.h / cur.w : cur.w / cur.h;
                const other = Math.max(1, Math.round(nv * ratio));
                const peerRef = isW ? hRef : wRef;
                if (peerRef.inp) peerRef.inp.value = other;
                const els2 = (b2.settings.freeElements || []).map(el => el.id === sel.id ? { ...el, [key]: nv, [isW ? 'h' : 'w']: other } : el);
                b2.settings.freeElements = els2;
                updateBlockSetting(block.id, 'freeElements', els2);
            } else { updEl(sel.id, key, nv); }
        });
        wrap.appendChild(l); wrap.appendChild(inp);
        return wrap;
    };

    // Обычный range с опциональным reset по dblclick
    const mkRange = (label, val, key, min, max, unit, toStore, resetVal) => {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex;align-items:center;gap:8px;';
        const lbl = document.createElement('span');
        lbl.textContent = label;
        lbl.style.cssText = 'font-size:11px;color:var(--text-muted);flex-shrink:0;min-width:52px;';
        const range = document.createElement('input');
        range.type = 'range'; range.min = min; range.max = max; range.value = val ?? min;
        range.style.cssText = 'flex:1;accent-color:var(--accent-primary);';
        const vl = document.createElement('span');
        vl.textContent = (val ?? min) + (unit || '');
        vl.style.cssText = 'font-size:10px;color:var(--text-muted);min-width:32px;text-align:right;flex-shrink:0;';
        range.addEventListener('input', () => { vl.textContent = range.value + (unit || ''); updEl(sel.id, key, toStore ? toStore(Number(range.value)) : Number(range.value)); });
        if (resetVal !== undefined) {
            range.title = 'Двойной клик — сброс';
            range.addEventListener('dblclick', () => { range.value = resetVal; vl.textContent = resetVal + (unit || ''); updEl(sel.id, key, resetVal); });
        }
        wrap.appendChild(lbl); wrap.appendChild(range); wrap.appendChild(vl);
        return wrap;
    };

    const mkColor = (label, val, key) => {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex;align-items:center;gap:8px;';
        const lbl = document.createElement('span');
        lbl.textContent = label;
        lbl.style.cssText = 'font-size:11px;color:var(--text-muted);flex-shrink:0;min-width:52px;';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.style.cssText = `width:36px;height:28px;border-radius:4px;border:1px solid var(--border-secondary);background:${val || '#ffffff'};cursor:pointer;`;
        btn.addEventListener('click', () => pickColor({ title: label, currentColor: val || '#ffffff', allowTransparent: false, onApply: c => { btn.style.background = c; updEl(sel.id, key, c); } }));
        wrap.appendChild(lbl); wrap.appendChild(btn);
        return wrap;
    };


// ── Позиция X/Y и W/[🔒]/H ───────────────────────────────────────
    const xyRow = document.createElement('div');
    xyRow.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:6px;';
    xyRow.appendChild(mkPosInp('X', sel.x, 'x', -600, 1200));
    xyRow.appendChild(mkPosInp('Y', sel.y, 'y', -600, 1200));
    props.appendChild(xyRow);

    if (sel.h != null && sel.type !== 'line') {
        const whRow = document.createElement('div');
        whRow.style.cssText = 'display:grid;grid-template-columns:1fr auto 1fr;gap:4px;align-items:center;';
        whRow.appendChild(mkPosInp('W', sel.w, 'w', 10, 600));

        const lockBtn = document.createElement('button');
        lockBtn.type = 'button';
        lockBtn.title = sel.aspectLock ? 'Пропорции зафиксированы' : 'Зафиксировать пропорции';
        lockBtn.style.cssText = `display:flex;align-items:center;justify-content:center;width:22px;height:28px;padding:0;border-radius:4px;border:1px solid ${sel.aspectLock ? 'var(--accent-primary)' : 'var(--border-secondary)'};background:${sel.aspectLock ? 'rgba(168,85,247,0.15)' : 'var(--bg-hover)'};cursor:pointer;flex-shrink:0;color:${sel.aspectLock ? 'var(--accent-primary)' : 'var(--text-muted)'};`;
        lockBtn.innerHTML = sel.aspectLock
            ? `<svg width="10" height="16" viewBox="0 0 10 16" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="1" width="8" height="5" rx="1.5" stroke="currentColor" stroke-width="1.5"/><rect x="1" y="10" width="8" height="5" rx="1.5" stroke="currentColor" stroke-width="1.5"/><line x1="5" y1="6" x2="5" y2="10" stroke="currentColor" stroke-width="1.5"/></svg>`
            : `<svg width="10" height="16" viewBox="0 0 10 16" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="1" width="8" height="5" rx="1.5" stroke="currentColor" stroke-width="1.5"/><rect x="1" y="10" width="8" height="5" rx="1.5" stroke="currentColor" stroke-width="1.5"/><line x1="5" y1="6" x2="5" y2="8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="5" y1="9" x2="5" y2="10" stroke="currentColor" stroke-width="1.5" stroke-dasharray="1 2" stroke-linecap="round"/></svg>`;
        lockBtn.addEventListener('click', () => { updEl(sel.id, 'aspectLock', !sel.aspectLock); renderSettings(); });
        whRow.appendChild(lockBtn);

        whRow.appendChild(mkPosInp('H', sel.h, 'h', 10, 600));
        props.appendChild(whRow);
    } else {
        const wRow = document.createElement('div');
        wRow.appendChild(mkPosInp('W', sel.w, 'w', 10, 600));
        props.appendChild(wRow);
    }

    // ── Свойства по типу ─────────────────────────────────────────────
    if (sel.type === 'text' || sel.type === 'heading') {
        const ta = document.createElement('textarea');
        ta.value = sel.text || ''; ta.rows = 2;
        ta.style.cssText = 'width:100%;padding:6px;border-radius:4px;border:1px solid var(--border-secondary);background:var(--bg-input);color:var(--text-secondary);font-size:12px;resize:vertical;box-sizing:border-box;';
        ta.addEventListener('input', () => updEl(sel.id, 'text', ta.value));
        props.appendChild(ta);
        props.appendChild(mkColor('Цвет', sel.color || '#ffffff', 'color'));
        props.appendChild(mkRange('Размер', sel.fontSize || 16, 'fontSize', 8, 72, 'px'));
        props.appendChild(mkRange('Жирность', sel.fontWeight || 400, 'fontWeight', 100, 900, '', v => Math.round(v / 100) * 100));

        const alignWrap = document.createElement('div');
        alignWrap.style.cssText = 'display:flex;align-items:center;gap:8px;';
        const alignLbl = document.createElement('span');
        alignLbl.textContent = 'Выравн.';
        alignLbl.style.cssText = 'font-size:11px;color:var(--text-muted);min-width:52px;flex-shrink:0;';
        const alignBtns = document.createElement('div');
        alignBtns.style.cssText = 'display:flex;gap:4px;flex:1;';
        [['left','←'],['center','↔'],['right','→']].forEach(([a, ic]) => {
            const b2 = document.createElement('button');
            b2.type = 'button'; b2.textContent = ic;
            const isCur = (sel.textAlign || 'left') === a;
            b2.style.cssText = `flex:1;padding:4px;border-radius:4px;font-size:12px;cursor:pointer;border:1px solid ${isCur ? 'var(--accent-primary)' : 'var(--border-secondary)'};background:${isCur ? 'rgba(168,85,247,0.15)' : 'var(--bg-hover)'};color:var(--text-secondary);`;
            b2.addEventListener('click', () => { updEl(sel.id, 'textAlign', a); renderSettings(); });
            alignBtns.appendChild(b2);
        });
        alignWrap.appendChild(alignLbl); alignWrap.appendChild(alignBtns);
        props.appendChild(alignWrap);
        props.appendChild(mkRange('Межстр.', +(sel.lineHeight || 1.3).toFixed(1), 'lineHeight', 0.8, 3, '×', v => +v.toFixed(1)));
    }

    if (sel.type === 'shape') {
        props.appendChild(mkColor('Цвет', sel.bgColor || '#a855f7', 'bgColor'));

        // clipPath сетка 8 форм
        const cpWrap = document.createElement('div');
        cpWrap.style.cssText = 'display:flex;flex-direction:column;gap:5px;';
        const cpLbl = document.createElement('span');
        cpLbl.textContent = 'Форма';
        cpLbl.style.cssText = 'font-size:11px;color:var(--text-muted);';
        const cpGrid = document.createElement('div');
        cpGrid.style.cssText = 'display:grid;grid-template-columns:repeat(4,1fr);gap:3px;';
        [['none','□','Прям.'],['circle','○','Круг'],['tri','△','Треуг.'],['trid','▽','Инв.'],
         ['diamond','◇','Ромб'],['hex','⬡','Гекс.'],['angled','⌒','→Угол'],['angledR','⌒','Угол←']].forEach(([k,ic,lb]) => {
            const b2 = document.createElement('button');
            b2.type = 'button';
            const cur = (sel.clipPath || 'none') === k;
            b2.innerHTML = `<span style="font-size:12px">${ic}</span><span style="display:block;font-size:9px;color:var(--text-muted);margin-top:1px">${lb}</span>`;
            b2.style.cssText = `padding:4px 2px;border-radius:4px;cursor:pointer;text-align:center;border:1px solid ${cur ? 'var(--accent-primary)' : 'var(--border-secondary)'};background:${cur ? 'rgba(168,85,247,0.15)' : 'var(--bg-hover)'};color:var(--text-secondary);`;
            b2.addEventListener('click', () => { updEl(sel.id, 'clipPath', k); renderSettings(); });
            cpGrid.appendChild(b2);
        });
        cpWrap.appendChild(cpLbl); cpWrap.appendChild(cpGrid);
        props.appendChild(cpWrap);

        if ((sel.clipPath || 'none') === 'none') {
            props.appendChild(mkRange('Скругл.', sel.borderRadius || 0, 'borderRadius', 0, 100, 'px'));
        }
        props.appendChild(mkRange('Поворот', sel.rotation || 0, 'rotation', -180, 180, '°', null, 0));
    }

    if (sel.type === 'line') {
        props.appendChild(mkColor('Цвет', sel.color || '#4b5563', 'color'));
        props.appendChild(mkRange('Толщина', sel.h || 2, 'h', 1, 20, 'px'));

        const lsWrap = document.createElement('div');
        lsWrap.style.cssText = 'display:flex;align-items:center;gap:8px;';
        const lsLbl = document.createElement('span');
        lsLbl.textContent = 'Стиль';
        lsLbl.style.cssText = 'font-size:11px;color:var(--text-muted);min-width:52px;flex-shrink:0;';
        const lsBtns = document.createElement('div');
        lsBtns.style.cssText = 'display:flex;gap:4px;flex:1;';
        [['solid','──'],['dashed','- -'],['dotted','···']].forEach(([ls, ic]) => {
            const b2 = document.createElement('button');
            b2.type = 'button'; b2.textContent = ic;
            const cur = (sel.lineStyle || 'solid') === ls;
            b2.style.cssText = `flex:1;padding:4px;border-radius:4px;font-size:11px;cursor:pointer;border:1px solid ${cur ? 'var(--accent-primary)' : 'var(--border-secondary)'};background:${cur ? 'rgba(168,85,247,0.15)' : 'var(--bg-hover)'};color:var(--text-secondary);`;
            b2.addEventListener('click', () => { updEl(sel.id, 'lineStyle', ls); renderSettings(); });
            lsBtns.appendChild(b2);
        });
        lsWrap.appendChild(lsLbl); lsWrap.appendChild(lsBtns);
        props.appendChild(lsWrap);
        props.appendChild(mkRange('Поворот', sel.rotation || 0, 'rotation', -180, 180, '°', null, 0));
    }

    if (sel.type === 'image') {
        const fileWrap = document.createElement('div');
        fileWrap.style.cssText = 'display:flex;align-items:center;gap:8px;';
        const fileInput = document.createElement('input');
        fileInput.type = 'file'; fileInput.accept = 'image/*'; fileInput.style.display = 'none';
        fileInput.addEventListener('change', ev => {
            const file = ev.target.files?.[0]; if (!file) return;
            const reader = new FileReader();
            reader.onload = le => { updEl(sel.id, 'src', le.target.result); renderSettings(); };
            reader.readAsDataURL(file); ev.target.value = '';
        });
        const fileBtn = document.createElement('button');
        fileBtn.type = 'button'; fileBtn.textContent = 'Загрузить картинку';
        fileBtn.style.cssText = 'flex:1;padding:6px 8px;background:var(--bg-hover);border:1px solid var(--border-secondary);border-radius:6px;color:var(--text-secondary);cursor:pointer;font-size:11px;';
        fileBtn.addEventListener('click', () => fileInput.click());
        fileWrap.appendChild(fileBtn); fileWrap.appendChild(fileInput);
        props.appendChild(fileWrap);

        if (sel.src) {
            const thumb = document.createElement('img');
            thumb.src = sel.src;
            thumb.style.cssText = 'width:100%;max-height:100px;object-fit:contain;border-radius:6px;border:1px solid var(--border-secondary);background:#1a1a2e;display:block;';
            props.appendChild(thumb);
        }

        // fill / crop / contain
        const fitWrap = document.createElement('div');
        fitWrap.style.cssText = 'display:flex;align-items:center;gap:8px;';
        const fitLbl = document.createElement('span');
        fitLbl.textContent = 'Показ';
        fitLbl.style.cssText = 'font-size:11px;color:var(--text-muted);min-width:52px;flex-shrink:0;';
        const fitBtns = document.createElement('div');
        fitBtns.style.cssText = 'display:flex;gap:4px;flex:1;';
        // fill=fill, crop=cover, contain=contain
        [['fill','Fill'],['cover','Crop'],['contain','Fit']].forEach(([v, label]) => {
            const b2 = document.createElement('button');
            b2.type = 'button'; b2.textContent = label;
            const cur = (sel.objectFit || 'cover') === v;
            b2.style.cssText = `flex:1;padding:4px;border-radius:4px;font-size:11px;cursor:pointer;border:1px solid ${cur ? 'var(--accent-primary)' : 'var(--border-secondary)'};background:${cur ? 'rgba(168,85,247,0.15)' : 'var(--bg-hover)'};color:var(--text-secondary);`;
            b2.addEventListener('click', () => { updEl(sel.id, 'objectFit', v); renderSettings(); });
            fitBtns.appendChild(b2);
        });
        fitWrap.appendChild(fitLbl); fitWrap.appendChild(fitBtns);
        props.appendChild(fitWrap);

        // clipPath маски (6 вариантов)
        const cpWrap = document.createElement('div');
        cpWrap.style.cssText = 'display:flex;flex-direction:column;gap:5px;';
        const cpLbl = document.createElement('span');
        cpLbl.textContent = 'Маска';
        cpLbl.style.cssText = 'font-size:11px;color:var(--text-muted);';
        const cpGrid = document.createElement('div');
        cpGrid.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:3px;';
        [['none','□','Нет'],['circle','○','Круг'],['tri','△','Треуг.'],
         ['diamond','◇','Ромб'],['angled','⌒','→Угол'],['angledR','⌒','Угол←']].forEach(([k,ic,lb]) => {
            const b2 = document.createElement('button');
            b2.type = 'button';
            const cur = (sel.clipPath || 'none') === k;
            b2.innerHTML = `<span style="font-size:12px">${ic}</span><span style="display:block;font-size:9px;color:var(--text-muted);margin-top:1px">${lb}</span>`;
            b2.style.cssText = `padding:4px 2px;border-radius:4px;cursor:pointer;text-align:center;border:1px solid ${cur ? 'var(--accent-primary)' : 'var(--border-secondary)'};background:${cur ? 'rgba(168,85,247,0.15)' : 'var(--bg-hover)'};color:var(--text-secondary);`;
            b2.addEventListener('click', () => { updEl(sel.id, 'clipPath', k); renderSettings(); });
            cpGrid.appendChild(b2);
        });
        cpWrap.appendChild(cpLbl); cpWrap.appendChild(cpGrid);
        props.appendChild(cpWrap);

        if ((sel.clipPath || 'none') === 'none') {
            props.appendChild(mkRange('Скругл.', sel.borderRadius || 0, 'borderRadius', 0, 100, 'px'));
        }
        props.appendChild(mkRange('Поворот', sel.rotation || 0, 'rotation', -180, 180, '°', null, 0));
    }

    props.appendChild(mkRange('Прозрачн.', Math.round((sel.opacity ?? 1) * 100), 'opacity', 0, 100, '%', v => v / 100));
    container.appendChild(props);
}
