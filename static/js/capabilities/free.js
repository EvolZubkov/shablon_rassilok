// capabilities/free.js — capability «Свободный элемент»
// Позволяет накладывать текст, фигуры и картинки поверх любого блока.
// Preview: position:absolute оверлеи. Email: html2canvas → base64 PNG.

let _freeSelId = null;
const _freeRenderGen = new Map();

function _mkFreeEl(type) {
    const id = Date.now() + Math.floor(Math.random() * 10000);
    if (type === 'text')  return { id, type, x: 20, y: 20, w: 180, text: 'Текст', fontSize: 16, fontWeight: 400, color: '#ffffff', opacity: 1 };
    if (type === 'shape') return { id, type, x: 20, y: 20, w: 120, h: 60, bgColor: '#a855f7', borderRadius: 8, opacity: 1 };
    if (type === 'image') return { id, type, x: 20, y: 20, w: 120, h: 80, src: '', borderRadius: 0, objectFit: 'cover', opacity: 1 };
    return { id, type, x: 20, y: 20, w: 100, h: 60, opacity: 1 };
}

function _renderFreeElHTML(e) {
    const base = `position:absolute;left:${e.x||0}px;top:${e.y||0}px;width:${e.w||100}px;${e.h != null ? `height:${e.h}px;` : ''}opacity:${e.opacity ?? 1};pointer-events:none;`;
    if (e.type === 'text') {
        const safe = (e.text || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
        return `<div style="${base}color:${e.color||'#fff'};font-size:${e.fontSize||16}px;font-weight:${e.fontWeight||400};line-height:1.3;white-space:pre-wrap;">${safe}</div>`;
    }
    if (e.type === 'shape') {
        return `<div style="${base}background:${e.bgColor||'#a855f7'};border-radius:${e.borderRadius||0}px;"></div>`;
    }
    if (e.type === 'image' && e.src) {
        return `<img src="${e.src}" style="${base}object-fit:${e.objectFit||'cover'};border-radius:${e.borderRadius||0}px;display:block;" alt="">`;
    }
    return '';
}

// Захватить блок через html2canvas и вернуть base64 в callback
function renderFreeToDataUrl(block, callback) {
    const elements = block.settings.freeElements || [];
    if (!elements.length) { callback(null); return; }
    if (typeof html2canvas === 'undefined') { callback(null); return; }

    const myGen = (_freeRenderGen.get(block.id) || 0) + 1;
    _freeRenderGen.set(block.id, myGen);

    // Ищем .block-content у блока в канвасе
    const blockEl = document.querySelector(`.email-block[data-block-id="${block.id}"] .block-content`);
    if (!blockEl) { callback(null); return; }

    requestAnimationFrame(() => {
        if (_freeRenderGen.get(block.id) !== myGen) return;
        html2canvas(blockEl, {
            scale: 2,
            useCORS: true,
            allowTaint: true,
            backgroundColor: null,
            logging: false,
        }).then(canvas => {
            if (_freeRenderGen.get(block.id) !== myGen) return;
            callback(canvas.toDataURL('image/png'));
        }).catch(() => {
            if (_freeRenderGen.get(block.id) !== myGen) return;
            callback(null);
        });
    });
}

window.renderFreeToDataUrl = renderFreeToDataUrl;

// ─────────────────────────────────────────────────────────────────────────────

CapabilityRegistry.register({
    id: 'free',
    label: 'Свободный элемент',

    defaultSettings: {
        freeEnabled: true,
        freeElements: [],
        freeRendered: null,
    },

    renderSettings(container, block) {
        const s = block.settings;
        const enabled = s.freeEnabled !== false;
        const elements = Array.isArray(s.freeElements) ? s.freeElements : [];

        // ── Заголовок + переключатель ─────────────────────────────────
        const divider = document.createElement('div');
        divider.style.cssText = 'display:flex;align-items:center;gap:8px;margin:16px 0 8px;color:var(--text-muted);font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;';

        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.textContent = enabled ? 'Вкл' : 'Выкл';
        toggleBtn.style.cssText = `flex-shrink:0;padding:2px 8px;border-radius:4px;cursor:pointer;font-size:10px;font-weight:600;text-transform:uppercase;border:1px solid ${enabled ? 'var(--accent-primary)' : 'var(--border-secondary)'};background:${enabled ? 'var(--accent-primary)' : 'var(--bg-hover)'};color:${enabled ? '#fff' : 'var(--text-muted)'};`;
        toggleBtn.addEventListener('click', () => {
            updateBlockSetting(block.id, 'freeEnabled', !enabled);
            renderCanvas();
            renderSettings();
        });

        divider.innerHTML = `<span style="flex:1;height:1px;background:var(--border-primary)"></span><span>Наложение</span><span style="flex:1;height:1px;background:var(--border-primary)"></span>`;
        divider.appendChild(toggleBtn);
        container.appendChild(divider);

        if (!enabled) return;

        // ── Хелперы обновления ────────────────────────────────────────

        // Обновляет одно свойство элемента, ре-рендерит канвас + захватывает PNG
        const updEl = (id, key, value) => {
            const b = AppState.findBlockById(block.id);
            if (!b) return;
            const els = (b.settings.freeElements || []).map(e => e.id === id ? { ...e, [key]: value } : e);
            b.settings.freeElements = els;
            updateBlockSetting(block.id, 'freeElements', els);
            renderCanvas();
            renderFreeToDataUrl(b, (dataUrl) => {
                b.settings.freeRendered = dataUrl || null;
            });
        };

        // Полное сохранение + обновление настроек
        const saveAndRefresh = (newEls) => {
            const b = AppState.findBlockById(block.id);
            if (!b) return;
            b.settings.freeElements = newEls;
            updateBlockSetting(block.id, 'freeElements', newEls);
            renderCanvas();
            renderFreeToDataUrl(b, (dataUrl) => {
                b.settings.freeRendered = dataUrl || null;
            });
            renderSettings();
        };

        // ── Кнопки добавления ─────────────────────────────────────────
        const addRow = document.createElement('div');
        addRow.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:10px;';

        [['+ Текст', 'text'], ['+ Фигура', 'shape'], ['+ Фото', 'image']].forEach(([label, type]) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = label;
            btn.style.cssText = 'padding:7px 4px;background:var(--bg-hover);border:1px dashed var(--border-secondary);border-radius:6px;color:var(--text-secondary);cursor:pointer;font-size:11px;transition:border-color .15s;';
            btn.addEventListener('mouseenter', () => btn.style.borderColor = 'var(--accent-primary)');
            btn.addEventListener('mouseleave', () => btn.style.borderColor = 'var(--border-secondary)');
            btn.addEventListener('click', () => {
                const newEl = _mkFreeEl(type);
                _freeSelId = newEl.id;
                saveAndRefresh([...elements, newEl]);
            });
            addRow.appendChild(btn);
        });
        container.appendChild(addRow);

        if (!elements.length) {
            const empty = document.createElement('div');
            empty.style.cssText = 'text-align:center;color:var(--text-muted);font-size:11px;padding:4px 0 10px;';
            empty.textContent = 'Нет элементов — добавьте выше';
            container.appendChild(empty);
            return;
        }

        // ── Список слоёв ──────────────────────────────────────────────
        const ICONS = { text: 'T', shape: '◻', image: '🖼' };
        const layerList = document.createElement('div');
        layerList.style.cssText = 'display:flex;flex-direction:column;gap:3px;margin-bottom:10px;';

        elements.forEach(e => {
            const isSel = e.id === _freeSelId;
            const row = document.createElement('div');
            row.style.cssText = `display:flex;align-items:center;gap:6px;padding:5px 8px;border-radius:5px;cursor:pointer;background:${isSel ? 'rgba(168,85,247,0.15)' : 'var(--bg-hover)'};border:1px solid ${isSel ? 'var(--accent-primary)' : 'var(--border-secondary)'};`;

            const icon = document.createElement('span');
            icon.textContent = ICONS[e.type] || '?';
            icon.style.cssText = 'font-size:11px;color:var(--text-muted);flex-shrink:0;width:14px;text-align:center;';

            const name = document.createElement('span');
            name.textContent = e.type === 'text' ? (e.text || 'Текст').slice(0, 18) : ({ shape: 'Фигура', image: 'Картинка' }[e.type] || e.type);
            name.style.cssText = 'font-size:11px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-secondary);';

            const delBtn = document.createElement('button');
            delBtn.type = 'button';
            delBtn.textContent = '✕';
            delBtn.style.cssText = 'background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:10px;padding:0 2px;flex-shrink:0;';
            delBtn.addEventListener('click', ev => {
                ev.stopPropagation();
                if (_freeSelId === e.id) _freeSelId = null;
                saveAndRefresh(elements.filter(x => x.id !== e.id));
            });

            row.appendChild(icon);
            row.appendChild(name);
            row.appendChild(delBtn);
            row.addEventListener('click', () => {
                _freeSelId = isSel ? null : e.id;
                renderSettings();
            });
            layerList.appendChild(row);
        });
        container.appendChild(layerList);

        // ── Свойства выбранного элемента ──────────────────────────────
        const sel = elements.find(e => e.id === _freeSelId);
        if (!sel) return;

        const props = document.createElement('div');
        props.style.cssText = 'padding:10px;background:var(--bg-secondary);border:1px solid var(--border-secondary);border-radius:8px;display:flex;flex-direction:column;gap:8px;';

        // Число
        const mkNum = (label, val, key, min, max) => {
            const wrap = document.createElement('div');
            wrap.style.cssText = 'display:flex;align-items:center;gap:8px;';
            const lbl = document.createElement('span');
            lbl.textContent = label;
            lbl.style.cssText = 'font-size:11px;color:var(--text-muted);flex-shrink:0;min-width:56px;';
            const inp = document.createElement('input');
            inp.type = 'number';
            inp.value = Math.round(val ?? 0);
            if (min != null) inp.min = min;
            if (max != null) inp.max = max;
            inp.style.cssText = 'flex:1;padding:5px 7px;border-radius:4px;border:1px solid var(--border-secondary);background:var(--bg-input);color:var(--text-secondary);font-size:12px;';
            inp.addEventListener('input', () => updEl(sel.id, key, Number(inp.value)));
            wrap.appendChild(lbl);
            wrap.appendChild(inp);
            return wrap;
        };

        // Слайдер
        const mkRange = (label, val, key, min, max, unit, toStore) => {
            const wrap = document.createElement('div');
            wrap.style.cssText = 'display:flex;align-items:center;gap:8px;';
            const lbl = document.createElement('span');
            lbl.textContent = label;
            lbl.style.cssText = 'font-size:11px;color:var(--text-muted);flex-shrink:0;min-width:56px;';
            const range = document.createElement('input');
            range.type = 'range';
            range.min = min; range.max = max;
            range.value = val ?? min;
            range.style.cssText = 'flex:1;accent-color:var(--accent-primary);';
            const valSpan = document.createElement('span');
            valSpan.textContent = (val ?? min) + (unit || '');
            valSpan.style.cssText = 'font-size:10px;color:var(--text-muted);min-width:28px;text-align:right;flex-shrink:0;';
            range.addEventListener('input', () => {
                valSpan.textContent = range.value + (unit || '');
                const stored = toStore ? toStore(Number(range.value)) : Number(range.value);
                updEl(sel.id, key, stored);
            });
            wrap.appendChild(lbl);
            wrap.appendChild(range);
            wrap.appendChild(valSpan);
            return wrap;
        };

        // Цвет
        const mkColor = (label, val, key) => {
            const wrap = document.createElement('div');
            wrap.style.cssText = 'display:flex;align-items:center;gap:8px;';
            const lbl = document.createElement('span');
            lbl.textContent = label;
            lbl.style.cssText = 'font-size:11px;color:var(--text-muted);flex-shrink:0;min-width:56px;';
            const inp = document.createElement('input');
            inp.type = 'color';
            inp.value = val || '#ffffff';
            inp.style.cssText = 'width:36px;height:28px;padding:2px;border-radius:4px;border:1px solid var(--border-secondary);background:var(--bg-input);cursor:pointer;';
            inp.addEventListener('input', () => updEl(sel.id, key, inp.value));
            wrap.appendChild(lbl);
            wrap.appendChild(inp);
            return wrap;
        };

        // Позиция и размер
        const posGrid = document.createElement('div');
        posGrid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:6px;';
        posGrid.appendChild(mkNum('X', sel.x, 'x', -600, 1200));
        posGrid.appendChild(mkNum('Y', sel.y, 'y', -600, 1200));
        posGrid.appendChild(mkNum('Ширина', sel.w, 'w', 10, 600));
        if (sel.h != null) posGrid.appendChild(mkNum('Высота', sel.h, 'h', 10, 600));
        props.appendChild(posGrid);

        // Свойства по типу
        if (sel.type === 'text') {
            const ta = document.createElement('textarea');
            ta.value = sel.text || '';
            ta.rows = 2;
            ta.style.cssText = 'width:100%;padding:6px;border-radius:4px;border:1px solid var(--border-secondary);background:var(--bg-input);color:var(--text-secondary);font-size:12px;resize:vertical;';
            ta.addEventListener('input', () => updEl(sel.id, 'text', ta.value));
            props.appendChild(ta);
            props.appendChild(mkColor('Цвет', sel.color || '#ffffff', 'color'));
            props.appendChild(mkRange('Размер', sel.fontSize || 16, 'fontSize', 8, 72, 'px'));
            props.appendChild(mkRange('Жирность', sel.fontWeight || 400, 'fontWeight', 100, 900, '', v => Math.round(v / 100) * 100));
        }

        if (sel.type === 'shape') {
            props.appendChild(mkColor('Цвет', sel.bgColor || '#a855f7', 'bgColor'));
            props.appendChild(mkRange('Скругление', sel.borderRadius || 0, 'borderRadius', 0, 100, 'px'));
        }

        if (sel.type === 'image') {
            const fileWrap = document.createElement('div');
            fileWrap.style.cssText = 'display:flex;align-items:center;gap:8px;';
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = 'image/*';
            fileInput.style.display = 'none';
            fileInput.addEventListener('change', (ev) => {
                const file = ev.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (le) => {
                    updEl(sel.id, 'src', le.target.result);
                    renderSettings();
                };
                reader.readAsDataURL(file);
                ev.target.value = '';
            });
            const fileBtn = document.createElement('button');
            fileBtn.type = 'button';
            fileBtn.textContent = 'Загрузить фото';
            fileBtn.style.cssText = 'padding:6px 12px;background:var(--bg-hover);border:1px solid var(--border-secondary);border-radius:6px;color:var(--text-secondary);cursor:pointer;font-size:12px;';
            fileBtn.addEventListener('click', () => fileInput.click());
            fileWrap.appendChild(fileBtn);
            fileWrap.appendChild(fileInput);
            props.appendChild(fileWrap);

            if (sel.src) {
                const preview = document.createElement('img');
                preview.src = sel.src;
                preview.style.cssText = 'width:100%;height:60px;object-fit:cover;border-radius:6px;border:1px solid var(--border-secondary);';
                props.appendChild(preview);
            }
            props.appendChild(mkRange('Скругление', sel.borderRadius || 0, 'borderRadius', 0, 100, 'px'));
        }

        // Прозрачность (все типы)
        props.appendChild(mkRange('Прозрачность', Math.round((sel.opacity ?? 1) * 100), 'opacity', 0, 100, '%', v => v / 100));

        container.appendChild(props);
    },

    // ── Preview: живые CSS-оверлеи ────────────────────────────────────
    wrapPreview(html, s) {
        if (!s || s.freeEnabled === false) return html;
        const elements = s.freeElements || [];
        if (!elements.length) return html;
        const overlays = elements.map(e => _renderFreeElHTML(e)).join('');
        return `<div style="position:relative;">${html}${overlays}</div>`;
    },

    // ── Email: base64 PNG (совместимо с Outlook) ──────────────────────
    wrapEmail(html, s) {
        if (!s || s.freeEnabled === false) return html;
        if (!(s.freeElements || []).length) return html;

        if (s.freeRendered) {
            return `
        <tr>
          <td style="padding:0;">
            <img src="${s.freeRendered}" width="600" style="display:block;max-width:100%;border:0;height:auto;" alt="">
          </td>
        </tr>`;
        }
        // Если PNG ещё не готов — вернуть оригинальный HTML
        return html;
    },
});
