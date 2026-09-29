/**
 * dateTimePicker.js — кастомный пикер даты/времени.
 *
 * Использование:
 *   const dtp = initDateTimePicker('wrapper-id', 'hidden-input-id');
 *   dtp.getValue()      // ISO строка или ''
 *   dtp.setValue(iso)   // установить значение
 *   dtp.clear()         // сбросить
 *   dtp.destroy()       // удалить из DOM
 *
 * Требования:
 *   - #wrapper-id   — пустой <div>, в него вставляется кнопка-триггер
 *   - #hidden-id    — <input type="hidden">, туда пишется ISO-значение
 *
 * Дропдаун вешается на <body> с position:fixed —
 * работает даже внутри overflow:hidden контейнеров.
 */

(function (global) {
    'use strict';

    let _stylesInjected = false;

    function _injectStyles() {
        if (_stylesInjected) return;
        _stylesInjected = true;
        const s = document.createElement('style');
        s.textContent = `
.exc-dtp { width: 100%; display: block; }
.exc-dtp__trigger {
  width: 100%; height: 38px; padding: 0 12px;
  box-sizing: border-box; display: flex; align-items: center; justify-content: space-between;
  background: var(--input-bg, #0c1730); border: 1px solid var(--input-border, #344765);
  border-radius: 8px; color: var(--input-text, #f5f7fb); font-size: 13px;
  font-family: inherit; cursor: pointer; outline: none; text-align: left;
  transition: border-color .18s, box-shadow .18s;
}
.exc-dtp__trigger:hover { border-color: var(--input-border-hover, #45608b); }
.exc-dtp__trigger--open,
.exc-dtp__trigger:focus {
  border-color: var(--input-border-focus, #7c3aed);
  box-shadow: 0 0 0 3px var(--input-focus-ring, rgba(124,58,237,.18));
}
.exc-dtp__trigger-placeholder { color: var(--input-placeholder, #8090a8); }
.exc-dtp__trigger-ico { opacity: .5; flex-shrink: 0; margin-left: 6px; }
.exc-dtp__dropdown {
  position: fixed; z-index: 99999;
  width: 272px; background: var(--exchange-modal-bg, var(--bg-secondary, #1e293b));
  border: 1px solid var(--input-border, #344765);
  border-radius: 12px; box-shadow: 0 12px 40px rgba(0,0,0,.6);
  padding: 14px 14px 12px; box-sizing: border-box; user-select: none;
}
.exc-dtp__nav {
  display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;
}
.exc-dtp__nav-btn {
  width: 28px; height: 28px; border-radius: 6px; border: none;
  background: transparent; color: var(--text-secondary, #e5e7eb);
  font-size: 20px; line-height: 1; cursor: pointer;
  display: flex; align-items: center; justify-content: center; transition: background .15s;
}
.exc-dtp__nav-btn:hover { background: rgba(255,255,255,.08); }
.exc-dtp__month-label {
  font-size: 13px; font-weight: 600; color: var(--text-primary, #f9fafb); letter-spacing: .3px;
}
.exc-dtp__weekdays { display: grid; grid-template-columns: repeat(7,1fr); gap: 2px; margin-bottom: 4px; }
.exc-dtp__weekday {
  text-align: center; font-size: 10px; font-weight: 600;
  color: var(--text-muted, #9ca3af); padding: 3px 0;
}
.exc-dtp__days { display: grid; grid-template-columns: repeat(7,1fr); gap: 2px; }
.exc-dtp__day {
  height: 30px; border-radius: 6px; border: none; background: transparent;
  color: var(--text-secondary, #e5e7eb); font-size: 12px; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: background .12s, color .12s;
}
.exc-dtp__day:hover:not(:disabled) { background: rgba(255,255,255,.08); }
.exc-dtp__day--other  { color: var(--text-disabled, #6b7280); cursor: default; }
.exc-dtp__day--today  { box-shadow: inset 0 0 0 1px var(--accent-primary, #f97316);
                         color: var(--accent-primary, #f97316); font-weight: 600; }
.exc-dtp__day--selected { background: var(--accent-purple, #8b5cf6) !important;
                           color: #fff !important; font-weight: 600; }
.exc-dtp__day--selected.exc-dtp__day--today { box-shadow: none; }
.exc-dtp__day--past   { color: var(--text-disabled, #6b7280) !important;
                         cursor: default; opacity: .4; }
.exc-dtp__error {
  margin-top: 8px; padding: 6px 10px; border-radius: 6px;
  background: rgba(220,38,38,.15); border: 1px solid rgba(220,38,38,.3);
  color: #fca5a5; font-size: 11px; text-align: center;
}
.exc-dtp__sep { height: 1px; background: rgba(255,255,255,.08); margin: 10px 0; }
.exc-dtp__time { display: flex; align-items: flex-start; justify-content: center; gap: 4px; }
.exc-dtp__time-unit { display: flex; flex-direction: column; align-items: center; gap: 3px; }
.exc-dtp__time-btn {
  width: 38px; height: 20px; border: none; border-radius: 5px;
  background: rgba(255,255,255,.07); color: var(--text-secondary, #e5e7eb);
  font-size: 10px; cursor: pointer; transition: background .12s;
  display: flex; align-items: center; justify-content: center;
}
.exc-dtp__time-btn:hover { background: var(--accent-purple, #8b5cf6); color: #fff; }
.exc-dtp__time-val {
  width: 44px; height: 36px; background: var(--input-bg, #0c1730);
  border: 1px solid var(--input-border, #344765); border-radius: 7px;
  display: flex; align-items: center; justify-content: center;
  font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums;
  color: var(--text-primary, #f9fafb);
}
.exc-dtp__time-colon {
  font-size: 22px; font-weight: 700; color: var(--text-muted, #9ca3af);
  align-self: center; margin: 0 2px; padding-bottom: 14px;
}
.exc-dtp__time-label { font-size: 9px; color: var(--text-muted, #9ca3af);
                        letter-spacing: .5px; text-transform: uppercase; }
.exc-dtp__footer { display: flex; gap: 8px; margin-top: 12px; }
.exc-dtp__now-btn {
  flex: 1; height: 30px; border-radius: 7px; border: 1px solid rgba(255,255,255,.12);
  background: transparent; color: var(--text-secondary, #e5e7eb); font-size: 12px;
  cursor: pointer; transition: background .12s;
}
.exc-dtp__now-btn:hover { background: rgba(255,255,255,.07); }
.exc-dtp__ok-btn {
  flex: 1; height: 30px; border-radius: 7px; border: none;
  background: var(--accent-purple, #8b5cf6); color: #fff; font-size: 12px;
  font-weight: 600; cursor: pointer; transition: background .12s;
}
.exc-dtp__ok-btn:hover { background: var(--accent-purple-hover, #7c3aed); }
`;
        document.head.appendChild(s);
    }

    const MONTHS_RU = ['Январь','Февраль','Март','Апрель','Май','Июнь',
                       'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
    const WEEKDAYS  = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];

    const CAL_ICO = `<svg class="exc-dtp__trigger-ico" width="14" height="14" viewBox="0 0 24 24"
         fill="none" stroke="currentColor" stroke-width="2">
      <rect x="3" y="4" width="18" height="18" rx="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
    </svg>`;

    function _pad(n) { return String(n).padStart(2, '0'); }

    function _showError(dropEl, msg) {
        let el = dropEl.querySelector('.exc-dtp__error');
        if (!el) {
            el = document.createElement('div');
            el.className = 'exc-dtp__error';
            dropEl.appendChild(el);
        }
        el.textContent = msg;
        clearTimeout(el._t);
        el._t = setTimeout(() => el.remove(), 3000);
    }

    function initDateTimePicker(wrapperId, hiddenId) {
        _injectStyles();

        const wrapper = document.getElementById(wrapperId);
        if (!wrapper) return null;
        const hidden = document.getElementById(hiddenId);

        let selDate = null;
        const now = new Date();
        let viewYear  = now.getFullYear();
        let viewMonth = now.getMonth();
        let hours     = (now.getHours() + 1) % 24;
        let minutes   = 0;

        // Триггер-кнопка внутри wrapper
        const root = document.createElement('div');
        root.className = 'exc-dtp';
        wrapper.innerHTML = '';
        wrapper.appendChild(root);
        root.innerHTML = `
          <button type="button" class="exc-dtp__trigger" id="${wrapperId}-trigger">
            <span class="exc-dtp__trigger-placeholder">Выберите дату и время</span>
            ${CAL_ICO}
          </button>`;

        // Дропдаун на body (обходит overflow:hidden)
        const drop = document.createElement('div');
        drop.className = 'exc-dtp__dropdown';
        drop.id = `${wrapperId}-drop`;
        drop.style.display = 'none';
        drop.innerHTML = `
          <div class="exc-dtp__nav">
            <button type="button" class="exc-dtp__nav-btn" id="${wrapperId}-prev">‹</button>
            <span class="exc-dtp__month-label" id="${wrapperId}-mlabel"></span>
            <button type="button" class="exc-dtp__nav-btn" id="${wrapperId}-next">›</button>
          </div>
          <div class="exc-dtp__weekdays">
            ${WEEKDAYS.map(d => `<div class="exc-dtp__weekday">${d}</div>`).join('')}
          </div>
          <div class="exc-dtp__days" id="${wrapperId}-days"></div>
          <div class="exc-dtp__sep"></div>
          <div class="exc-dtp__time">
            <div class="exc-dtp__time-unit">
              <button type="button" class="exc-dtp__time-btn" id="${wrapperId}-hup">▲</button>
              <div class="exc-dtp__time-val" id="${wrapperId}-hval">00</div>
              <button type="button" class="exc-dtp__time-btn" id="${wrapperId}-hdn">▼</button>
              <div class="exc-dtp__time-label">чч</div>
            </div>
            <div class="exc-dtp__time-colon">:</div>
            <div class="exc-dtp__time-unit">
              <button type="button" class="exc-dtp__time-btn" id="${wrapperId}-mup">▲</button>
              <div class="exc-dtp__time-val" id="${wrapperId}-mval">00</div>
              <button type="button" class="exc-dtp__time-btn" id="${wrapperId}-mdn">▼</button>
              <div class="exc-dtp__time-label">мм</div>
            </div>
          </div>
          <div class="exc-dtp__footer">
            <button type="button" class="exc-dtp__now-btn" id="${wrapperId}-now">Сейчас</button>
            <button type="button" class="exc-dtp__ok-btn"  id="${wrapperId}-ok">Готово</button>
          </div>`;
        document.body.appendChild(drop);

        const $id = id => document.getElementById(id);
        const trigger  = $id(`${wrapperId}-trigger`);
        const mlabel   = $id(`${wrapperId}-mlabel`);
        const daysGrid = $id(`${wrapperId}-days`);
        const hval     = $id(`${wrapperId}-hval`);
        const mval     = $id(`${wrapperId}-mval`);

        function reposition() {
            const r    = trigger.getBoundingClientRect();
            const W    = 272;
            const GAP  = 6;
            const MARGIN = 8;

            // Горизонталь — не выходим за края экрана
            let left = r.left;
            if (left + W > window.innerWidth - MARGIN) left = window.innerWidth - W - MARGIN;
            if (left < MARGIN) left = MARGIN;

            // Вертикаль — предпочитаем открываться вверх если снизу мало места
            const spaceBelow = window.innerHeight - r.bottom - MARGIN;
            const spaceAbove = r.top - MARGIN;
            const dropH = drop.offsetHeight || 360; // реальная высота или запасная оценка

            let top;
            if (spaceBelow >= dropH) {
                // Достаточно места снизу — открываем вниз
                top = r.bottom + GAP;
            } else if (spaceAbove >= dropH) {
                // Места снизу не хватает, но есть сверху — открываем вверх
                top = r.top - dropH - GAP;
            } else {
                // Не помещается ни сверху ни снизу — выбираем сторону с бо́льшим пространством
                // и прижимаем к краю с отступом
                if (spaceBelow >= spaceAbove) {
                    top = r.bottom + GAP;
                } else {
                    top = Math.max(MARGIN, r.top - dropH - GAP);
                }
            }

            drop.style.top  = top + 'px';
            drop.style.left = left + 'px';
        }

        function renderCalendar() {
            mlabel.textContent = `${MONTHS_RU[viewMonth]} ${viewYear}`;
            let dow = new Date(viewYear, viewMonth, 1).getDay();
            dow = dow === 0 ? 6 : dow - 1;
            const dim  = new Date(viewYear, viewMonth + 1, 0).getDate();
            const prev = new Date(viewYear, viewMonth, 0).getDate();
            const td   = new Date();
            const tY = td.getFullYear(), tM = td.getMonth(), tD = td.getDate();

            let html = '';
            for (let i = dow - 1; i >= 0; i--)
                html += `<button type="button" class="exc-dtp__day exc-dtp__day--other" disabled>${prev - i}</button>`;
            for (let d = 1; d <= dim; d++) {
                const isT    = tY === viewYear && tM === viewMonth && tD === d;
                const isS    = selDate && selDate.getFullYear() === viewYear &&
                               selDate.getMonth() === viewMonth && selDate.getDate() === d;
                const isPast = new Date(viewYear, viewMonth, d) < new Date(tY, tM, tD);
                const cls    = ['exc-dtp__day',
                    isT    ? 'exc-dtp__day--today'    : '',
                    isS    ? 'exc-dtp__day--selected'  : '',
                    isPast ? 'exc-dtp__day--past'      : ''].filter(Boolean).join(' ');
                html += `<button type="button" class="${cls}"${isPast ? ' disabled' : ''} data-d="${d}">${d}</button>`;
            }
            const rem = (dow + dim) % 7;
            for (let d = 1; d <= (rem ? 7 - rem : 0); d++)
                html += `<button type="button" class="exc-dtp__day exc-dtp__day--other" disabled>${d}</button>`;
            daysGrid.innerHTML = html;
            daysGrid.querySelectorAll('[data-d]').forEach(btn =>
                btn.addEventListener('click', () => {
                    selDate = new Date(viewYear, viewMonth, +btn.dataset.d);
                    renderCalendar();
                })
            );
        }

        function renderTime() {
            hval.textContent = _pad(hours);
            mval.textContent = _pad(minutes);
        }

        function commit() {
            if (!selDate) return;
            const iso = `${selDate.getFullYear()}-${_pad(selDate.getMonth()+1)}-${_pad(selDate.getDate())}T${_pad(hours)}:${_pad(minutes)}:00`;
            if (hidden) hidden.value = iso;
            const offsetH  = -(new Date().getTimezoneOffset() / 60);
            const tzLabel  = `UTC${offsetH >= 0 ? '+' : ''}${offsetH}`;
            trigger.innerHTML = `<span style="color:var(--input-text,#f5f7fb)">${_pad(selDate.getDate())}.${_pad(selDate.getMonth()+1)}.${selDate.getFullYear()} ${_pad(hours)}:${_pad(minutes)}</span><span style="color:var(--text-muted,#9ca3af);font-size:11px;margin-left:6px">${tzLabel}</span>${CAL_ICO}`;
        }

        let _oh = null;
        function closeDrop() {
            drop.style.display = 'none';
            trigger.classList.remove('exc-dtp__trigger--open');
            if (_oh) { document.removeEventListener('click', _oh, true); _oh = null; }
        }
        function openDrop() {
            renderCalendar(); renderTime();
            drop.style.display = 'block';
            reposition();
            trigger.classList.add('exc-dtp__trigger--open');
            setTimeout(() => {
                _oh = e => { if (!drop.contains(e.target) && !root.contains(e.target)) closeDrop(); };
                document.addEventListener('click', _oh, true);
            }, 0);
        }

        trigger.addEventListener('click', e => {
            e.stopPropagation();
            drop.style.display === 'none' ? openDrop() : closeDrop();
        });
        $id(`${wrapperId}-prev`).addEventListener('click', () => { if (--viewMonth < 0) { viewMonth = 11; viewYear--; } renderCalendar(); });
        $id(`${wrapperId}-next`).addEventListener('click', () => { if (++viewMonth > 11) { viewMonth = 0; viewYear++; } renderCalendar(); });
        $id(`${wrapperId}-hup`).addEventListener('click', () => { hours = (hours + 1)  % 24; renderTime(); });
        $id(`${wrapperId}-hdn`).addEventListener('click', () => { hours = (hours + 23) % 24; renderTime(); });
        $id(`${wrapperId}-mup`).addEventListener('click', () => { minutes = (minutes + 5)  % 60; renderTime(); });
        $id(`${wrapperId}-mdn`).addEventListener('click', () => { minutes = (minutes + 55) % 60; renderTime(); });
        $id(`${wrapperId}-now`).addEventListener('click', () => {
            const n = new Date();
            selDate = new Date(n.getFullYear(), n.getMonth(), n.getDate());
            viewYear = selDate.getFullYear(); viewMonth = selDate.getMonth();
            hours = n.getHours(); minutes = Math.round(n.getMinutes() / 5) * 5 % 60;
            renderCalendar(); renderTime();
        });
        $id(`${wrapperId}-ok`).addEventListener('click', () => {
            if (!selDate) { _showError(drop, 'Выберите дату'); return; }
            const chosen = new Date(selDate.getFullYear(), selDate.getMonth(), selDate.getDate(), hours, minutes);
            if (chosen <= new Date()) { _showError(drop, 'Дата и время должны быть в будущем'); return; }
            commit(); closeDrop();
        });

        window.addEventListener('resize', () => { if (drop.style.display !== 'none') reposition(); });
        window.addEventListener('scroll', () => { if (drop.style.display !== 'none') reposition(); }, true);

        return {
            getValue() { return hidden ? hidden.value : ''; },
            setValue(iso) {
                if (!iso) return;
                const d = new Date(iso);
                selDate = d; viewYear = d.getFullYear(); viewMonth = d.getMonth();
                hours = d.getHours(); minutes = d.getMinutes(); commit();
            },
            clear() {
                selDate = null; if (hidden) hidden.value = '';
                closeDrop();
                trigger.innerHTML = `<span class="exc-dtp__trigger-placeholder">Выберите дату и время</span>${CAL_ICO}`;
            },
            destroy() { closeDrop(); drop.remove(); wrapper.innerHTML = ''; },
        };
    }

    global.initDateTimePicker = initDateTimePicker;

}(window));
