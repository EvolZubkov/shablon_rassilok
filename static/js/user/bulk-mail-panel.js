'use strict';

/* ─────────────────────────────────────────────────────────────────────────────
   BulkMailPanel — панель рассылки
   Блоки 1-7 по спецификации
   ───────────────────────────────────────────────────────────────────────────── */
const BulkMailPanel = (() => {

  // ── Режим: 'user' (index-user.html) или 'admin' (index.html) ──────────────────
  const MODE      = document.getElementById('user-canvas') ? 'user' : 'admin';
  const CANVAS_ID = MODE === 'user' ? 'user-canvas' : 'canvas';

  // ── Состояние ──────────────────────────────────────────────────────────────────
  const state = {
    isOpen:        false,
    fileLoaded:    false,
    currentFile:   null,   // File object — нужен для re-parse при смене листа/заголовка
    headers:       [],
    rows:          [],
    currentRow:    0,
    emailColumn:   '',
    mapping:       {},      // { '{{ФИО}}': 'ФИО', ... }
    placeholders:  [],
    canvasBackups: [],
    sending:       false,
    cancelled:     false,
    results:       [],      // { row, email, name, status:'sent'|'error'|'skip', error }
  };

  // ── Helpers ────────────────────────────────────────────────────────────────────
  const $ = id => document.getElementById(id);
  const escHtml = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  // ══════════════════════════════════════════════════════════════════════════════
  // АККОРДЕОН
  // ══════════════════════════════════════════════════════════════════════════════
  function initAccordion() {
    if (MODE === 'user') {
      const trigger = $('bm-accordion-trigger');
      if (trigger) trigger.addEventListener('click', toggleAccordion);
      const body = $('bm-accordion-body');
      if (body) body.style.display = 'none';
    } else {
      // Admin: main.js управляет через .active класс
      const section = document.querySelector('.accordion-item[data-panel="bulk-mail"]');
      if (!section) return;
      new MutationObserver(() => {
        const open = section.classList.contains('active');
        if (open && !state.isOpen)  { state.isOpen = true;  onPanelOpen();  }
        if (!open && state.isOpen)  { state.isOpen = false; onPanelClose(); }
      }).observe(section, { attributes: true, attributeFilter: ['class'] });
    }
  }

  function toggleAccordion() {
    const accordion = $('bm-accordion');
    const body      = $('bm-accordion-body');
    if (!accordion) return;
    state.isOpen = !state.isOpen;
    accordion.classList.toggle('bm-accordion--open', state.isOpen);
    if (body) body.style.display = state.isOpen ? 'flex' : 'none';
    $('bm-accordion-trigger')?.setAttribute('aria-expanded', String(state.isOpen));
    if (state.isOpen) onPanelOpen(); else onPanelClose();
  }

  function onPanelOpen() {
    if (state.fileLoaded) { detectPlaceholders(); showRowNav(); renderCurrentRow(); }
    _checkExchangeStatus();
  }

  async function _checkExchangeStatus() {
    const warn = $('bm-exchange-warn');
    if (!warn) return;
    try {
      const resp = await fetch('/api/credentials/status');
      const data = await resp.json();
      warn.style.display = data.exists ? 'none' : 'flex';
    } catch (_) { /* сервер недоступен — молчим */ }
  }
  function onPanelClose() {
    hideRowNav();
    restoreCanvas();
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // БЛОК 1: ЗАГРУЗКА ФАЙЛА
  // ══════════════════════════════════════════════════════════════════════════════
  function initFileUpload() {
    const btn      = $('bm-file-btn');
    const input    = $('bm-file-input');
    const zone     = $('bm-file-zone');
    const clear    = $('bm-file-clear');
    const sheetSel = $('bm-sheet-sel');
    const hdrSel   = $('bm-header-row-sel');

    if (btn)   btn.addEventListener('click', () => input?.click());
    if (clear) clear.addEventListener('click', clearFile);

    if (input) input.addEventListener('change', e => {
      const f = e.target.files[0];
      if (f) parseFile(f);
      e.target.value = '';
    });

    if (zone) {
      zone.addEventListener('dragover',  e => { e.preventDefault(); zone.classList.add('bm-file-zone--drag'); });
      zone.addEventListener('dragleave', ()  => zone.classList.remove('bm-file-zone--drag'));
      zone.addEventListener('drop', e => {
        e.preventDefault(); zone.classList.remove('bm-file-zone--drag');
        const f = e.dataTransfer.files[0];
        if (f) parseFile(f);
      });
    }

    // Re-parse при смене листа
    if (sheetSel) sheetSel.addEventListener('change', () => {
      if (state.currentFile) parseFile(state.currentFile, sheetSel.value, _getHeaderRow());
    });

    // Re-parse при смене строки заголовка
    if (hdrSel) hdrSel.addEventListener('change', () => {
      if (state.currentFile) parseFile(state.currentFile, _getSelectedSheet(), _getHeaderRow());
    });
  }

  function _getSelectedSheet() {
    return $('bm-sheet-sel')?.value || null;
  }
  function _getHeaderRow() {
    return parseInt($('bm-header-row-sel')?.value) || 1;
  }

  // ── Парсинг файла через /api/bulk/parse ───────────────────────────────────
  async function parseFile(file, sheetName, headerRow) {
    state.currentFile = file;
    _showFileParsing(file.name);

    const fd = new FormData();
    fd.append('file', file);
    if (sheetName) fd.append('sheet', sheetName);
    if (headerRow) fd.append('header_row', String(headerRow));

    try {
      const resp = await fetch('/api/bulk/parse', { method: 'POST', body: fd });
      const ct = resp.headers.get('content-type') || '';
      if (!ct.includes('application/json')) {
        throw new Error(`Сервер вернул ${resp.status} — перезапустите приложение`);
      }
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
      _applyParsedData(file.name, data);
    } catch (err) {
      _showFileError(file.name, err.message);
    }
  }

  function _showFileParsing(filename) {
    const zone   = $('bm-file-zone');
    const info   = $('bm-file-info');
    const nameEl = $('bm-file-name');
    const countEl = $('bm-file-count');
    if (zone)    zone.style.display  = 'none';
    if (info)    info.style.display  = 'flex';
    if (nameEl)  nameEl.textContent  = filename;
    if (countEl) { countEl.textContent = '…'; countEl.style.color = ''; }
  }

  function _showFileError(filename, msg) {
    const countEl = $('bm-file-count');
    const info    = $('bm-file-info');
    const zone    = $('bm-file-zone');
    if (info) info.style.display = 'flex';
    if (zone) zone.style.display = 'none';
    if (countEl) { countEl.textContent = 'Ошибка'; countEl.style.color = '#ef4444'; }
    const nameEl = $('bm-file-name');
    if (nameEl) nameEl.textContent = filename;
    console.error('[BulkMail] parse error:', msg);
  }

  function _applyParsedData(filename, data) {
    const { sheets = [], headers = [], rows = [], total = 0 } = data;

    state.fileLoaded = true;
    state.headers    = headers;
    state.rows       = rows;
    state.currentRow = 0;
    state.results    = [];

    // UI
    const zone     = $('bm-file-zone');
    const info     = $('bm-file-info');
    const nameEl   = $('bm-file-name');
    const countEl  = $('bm-file-count');
    const settings = $('bm-settings-section');
    const badge    = $('bm-accordion-badge');
    const sheetField = $('bm-sheet-field');
    const sheetSel   = $('bm-sheet-sel');
    const hdrField   = $('bm-header-row-field');

    if (zone)     zone.style.display     = 'none';
    if (info)     info.style.display     = 'flex';
    if (nameEl)   nameEl.textContent     = filename;
    if (countEl)  { countEl.textContent  = total + ' строк'; countEl.style.color = ''; }
    if (settings) settings.style.display = 'block';
    if (badge)    { badge.textContent = total; badge.style.display = 'inline-flex'; }
    if (hdrField) hdrField.style.display = 'flex';

    // Листы — показываем если их больше одного
    if (sheetSel && sheetField) {
      const curSheet = sheetSel.value;
      sheetSel.innerHTML = sheets.map(s => `<option value="${escHtml(s)}"${s === curSheet ? ' selected' : ''}>${escHtml(s)}</option>`).join('');
      sheetField.style.display = sheets.length > 1 ? 'block' : 'none';
    }

    populateEmailColumn();
    populateAttachColSel();
    detectPlaceholders();
    buildPreviewTable();
    buildPhInsChips();
    recalcSummary();
    updateSendButton();
    resetProgress();
    if (state.isOpen) { showRowNav(); renderCurrentRow(); }
    notifyColumnsAvailable(true);
  }

  function clearFile() {
    state.fileLoaded = false; state.currentFile = null;
    state.headers = []; state.rows = [];
    state.mapping = {}; state.placeholders = []; state.currentRow = 0; state.results = [];

    [$('bm-file-zone'), $('bm-file-info'), $('bm-settings-section'), $('bm-sheet-field'),
     $('bm-header-row-field'), $('bm-preview-block')].forEach(el => {
      if (el) el.style.display = el.id === 'bm-file-zone' ? 'flex' : 'none';
    });
    setCanvasMode('preview');
    const modeBar = $('bm-mode-bar');
    if (modeBar) modeBar.style.display = 'none';
    const badge = $('bm-accordion-badge');
    if (badge) badge.style.display = 'none';

    hideRowNav();
    restoreCanvas();
    resetProgress();
    notifyColumnsAvailable(false);
  }

  // ── Уведомление тулбара и admin-настроек о загрузке/сбросе файла ─────────────
  function notifyColumnsAvailable(available) {
    // User mode: показать/скрыть кнопку {{}} в тексотвом тулбаре
    if (typeof setBulkMailColumnsAvailable === 'function') {
      setBulkMailColumnsAvailable(available);
    }
    // Показать/скрыть переключатель режима (только admin)
    if (MODE === 'admin') {
      const modeBar = $('bm-mode-bar');
      if (modeBar) modeBar.style.display = available ? 'flex' : 'none';
      if (!available) setCanvasMode('preview');
    }

    // Admin mode: обновить колонки в PatС renderSettings и перерисовать
    if (MODE === 'admin' && typeof AdminBulkMail !== 'undefined') {
      if (available) {
        AdminBulkMail.updateColumns(state.headers);
        // Запатчить renderSettings чтобы секция плейсхолдеров появилась в правой панели
        if (typeof AdminBulkMail.patchRenderSettings === 'function') {
          AdminBulkMail.patchRenderSettings();
        }
        // Перерисовать текущие настройки если открыты
        if (typeof renderSettings === 'function') renderSettings();
      } else {
        AdminBulkMail.updateColumns([]);
        if (typeof renderSettings === 'function') renderSettings();
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // БЛОК 2: ПОЛУЧАТЕЛИ
  // ══════════════════════════════════════════════════════════════════════════════
  function populateEmailColumn() {
    const sel = $('bm-email-col');
    if (!sel) return;
    sel.innerHTML = state.headers.map(h => {
      const lc = h.toLowerCase();
      const sel_ = (lc.includes('email') || lc.includes('e-mail') || lc.includes('почта') || lc.includes('mail'));
      if (sel_) state.emailColumn = h;
      return `<option value="${escHtml(h)}"${sel_ ? ' selected' : ''}>${escHtml(h)}</option>`;
    }).join('');
    if (!state.emailColumn && state.headers[0]) state.emailColumn = state.headers[0];
    sel.addEventListener('change', () => { state.emailColumn = sel.value; updateRowNavInfo(); });
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // БЛОК 3: ПЛЕЙСХОЛДЕРЫ
  // ══════════════════════════════════════════════════════════════════════════════
  function detectPlaceholders() {
    const canvas = $(CANVAS_ID);
    const raw = canvas ? (canvas.innerText || canvas.textContent || '') : '';
    const found = [...new Set([...raw.matchAll(/\{\{([^}]+)\}\}/g)].map(m => m[0]))];

    state.placeholders = found;
    state.mapping = {};
    found.forEach(ph => {
      const name = ph.slice(2, -2);
      if (state.headers.includes(name)) state.mapping[ph] = name;
    });

    renderMappingUI();
  }

  function renderMappingUI() {
    const list   = $('bm-mapping-list');
    const noPhEl = $('bm-no-ph-hint');
    const hintEl = $('bm-mapping-hint');
    const section = $('bm-mapping-section');
    if (!list) return;

    if (section) section.style.display = 'block';
    list.innerHTML = '';

    if (state.placeholders.length === 0) {
      if (noPhEl) noPhEl.style.display = 'block';
      return;
    }
    if (noPhEl) noPhEl.style.display = 'none';

    state.placeholders.forEach(ph => {
      const row = document.createElement('div');
      row.className = 'bm-mapping-row';
      const tag = document.createElement('span');
      tag.className = 'bm-mapping-ph'; tag.textContent = ph;
      const arrow = document.createElement('span');
      arrow.className = 'bm-mapping-arrow'; arrow.textContent = '→';
      const sel = document.createElement('select');
      sel.className = 'bm-mapping-select';
      sel.innerHTML = `<option value="">— не задано —</option>` +
        state.headers.map(h => `<option value="${escHtml(h)}"${state.mapping[ph]===h?' selected':''}>${escHtml(h)}</option>`).join('');
      sel.addEventListener('change', () => {
        if (sel.value) state.mapping[ph] = sel.value; else delete state.mapping[ph];
        updateMappingHint();
        recalcSummary();
        restoreCanvas(); renderCurrentRow();
      });
      row.append(tag, arrow, sel);
      list.appendChild(row);
    });

    updateMappingHint();
  }

  function updateMappingHint() {
    const hintEl = $('bm-mapping-hint');
    if (!hintEl) return;
    const un = state.placeholders.filter(ph => !state.mapping[ph]).length;
    hintEl.textContent = un > 0 ? `${un} не сопоставлено` : '';
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // БЛОК 4: ВЛОЖЕНИЯ
  // ══════════════════════════════════════════════════════════════════════════════
  function populateAttachColSel() {
    const sel = $('bm-attach-col-sel');
    if (!sel) return;
    sel.innerHTML = `<option value="">— выберите колонку —</option>` +
      state.headers.map(h => `<option value="${escHtml(h)}">${escHtml(h)}</option>`).join('');
  }

  function initAttachMode() {
    const tplRadio = $('bm-attach-mode-tpl');
    const colRadio = $('bm-attach-mode-col');
    const tplField = $('bm-attach-tpl-field');
    const colField = $('bm-attach-col-field');
    if (!tplRadio) return;
    function update() {
      const isTpl = tplRadio.checked;
      if (tplField) tplField.style.display = isTpl ? 'block' : 'none';
      if (colField) colField.style.display = isTpl ? 'none' : 'block';
    }
    tplRadio.addEventListener('change', update);
    colRadio.addEventListener('change', update);
    update();
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // БЛОК 5: ПРЕВЬЮ В КАНВАСЕ (навигация строк)
  // ══════════════════════════════════════════════════════════════════════════════
  function showRowNav() {
    const nav = $('bm-row-nav');
    if (nav) nav.style.display = 'flex';
    updateRowNavInfo(); updateNavButtons();
  }
  function hideRowNav() {
    const nav = $('bm-row-nav');
    if (nav) nav.style.display = 'none';
  }
  function updateRowNavInfo() {
    if (!state.rows.length) return;
    const row = state.rows[state.currentRow];
    const infoEl  = $('bm-row-info');
    const nameEl  = $('bm-row-name');
    const emailEl = $('bm-row-email');
    if (infoEl)  infoEl.textContent  = `Строка ${state.currentRow + 1} из ${state.rows.length}`;
    if (nameEl)  nameEl.textContent  = row[state.mapping['{{ФИО}}'] || 'ФИО'] || '';
    if (emailEl) emailEl.textContent = row[state.emailColumn] || '(нет email)';
  }
  function updateNavButtons() {
    const prev = $('bm-row-prev'), next = $('bm-row-next');
    if (prev) prev.disabled = state.currentRow === 0;
    if (next) next.disabled = state.currentRow >= state.rows.length - 1;
  }

  function renderCurrentRow() {
    restoreCanvas();
    if (!state.rows.length) return;
    const row = state.rows[state.currentRow];
    const subMap = {};
    Object.entries(state.mapping).forEach(([ph, col]) => { subMap[ph] = row[col] != null ? String(row[col]) : ''; });
    if (Object.keys(subMap).length > 0) {
      const canvas = $(CANVAS_ID);
      if (canvas) walkAndSubstitute(canvas, subMap);
    }
    updateRowNavInfo(); updateNavButtons(); updateRowWarnings();
  }

  function walkAndSubstitute(root, subMap) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    nodes.forEach(textNode => {
      let text = textNode.nodeValue; let changed = false;
      Object.entries(subMap).forEach(([ph, val]) => {
        if (text.includes(ph)) {
          text = text.split(ph).join(val || `[${ph.slice(2,-2)} — не задано]`);
          changed = true;
        }
      });
      if (changed) { state.canvasBackups.push({ node: textNode, original: textNode.nodeValue }); textNode.nodeValue = text; }
    });
  }

  function restoreCanvas() {
    state.canvasBackups.forEach(({ node, original }) => { try { node.nodeValue = original; } catch(_) {} });
    state.canvasBackups = [];
  }

  // ── Блок 5.4: Фильтр проблемных строк ──────────────────────────────────────
  function goToProblemRow(direction) {
    const skipNoEmail = $('bm-skip-no-email')?.checked;
    let idx = state.currentRow;
    for (let i = 0; i < state.rows.length; i++) {
      idx = (idx + direction + state.rows.length) % state.rows.length;
      const row = state.rows[idx];
      const hasProblem = (skipNoEmail && !row[state.emailColumn]) ||
        state.placeholders.some(ph => !state.mapping[ph] || !row[state.mapping[ph]]);
      if (hasProblem) { state.currentRow = idx; renderCurrentRow(); break; }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // БЛОК 1.5: ПРЕВЬЮ ТАБЛИЦЫ
  // ══════════════════════════════════════════════════════════════════════════════
  function buildPreviewTable() {
    const block = $('bm-preview-block');
    const tbl   = $('bm-preview-tbl');
    const more  = $('bm-tbl-more');
    const hdrField = $('bm-header-row-field');
    if (!block || !tbl) return;
    block.style.display = 'block';
    if (hdrField) hdrField.style.display = 'flex';
    const preview = state.rows.slice(0, 4);
    tbl.innerHTML =
      `<thead><tr>${state.headers.map(h => `<th>${escHtml(h)}</th>`).join('')}</tr></thead>` +
      `<tbody>${preview.map(r =>
        `<tr>${state.headers.map(h => {
          const v = r[h] != null ? String(r[h]) : '';
          return `<td class="${v ? '' : 'bm-tbl-empty'}">${escHtml(v || '(пусто)')}</td>`;
        }).join('')}</tr>`
      ).join('')}</tbody>`;
    if (more) more.textContent = state.rows.length > 4 ? `...и ещё ${state.rows.length - 4} строк` : '';

    const btn  = $('bm-preview-btn');
    const area = $('bm-preview-area');
    if (btn && area && !btn._wired) {
      btn._wired = true;
      btn.addEventListener('click', () => {
        const open = area.style.display !== 'none';
        area.style.display = open ? 'none' : 'block';
        btn.setAttribute('aria-expanded', String(!open));
        btn.classList.toggle('bm-collapse-btn--open', !open);
      });
    }
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // БЛОК 5: СВОДКА РАССЫЛКИ
  // ══════════════════════════════════════════════════════════════════════════════
  const _isValidEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e));

  function recalcSummary() {
    const card  = $('bm-sum-card');
    const warns = $('bm-sum-warns');
    if (!card || !state.rows.length) return;
    const skipNoEmail = $('bm-skip-no-email')?.checked;
    const emailCol = state.emailColumn;
    let total = state.rows.length, toSend = 0, skip = 0, emptyEmail = 0, badEmail = 0;
    state.rows.forEach(r => {
      const e = String(r[emailCol] || '');
      if (!e) { emptyEmail++; if (skipNoEmail) { skip++; return; } }
      else if (!_isValidEmail(e)) { badEmail++; skip++; return; }
      toSend++;
    });
    card.innerHTML = [
      ['Всего строк',   total,      ''],
      ['К отправке',    toSend,     'ok'],
      ['Пропустить',    skip,       skip > 0 ? 'warn' : ''],
      ['Пустой email',  emptyEmail, emptyEmail > 0 ? 'warn' : ''],
      ['Некорр. email', badEmail,   badEmail > 0 ? 'err' : ''],
    ].map(([l, v, cls]) =>
      `<div class="bm-sum-row${cls ? ' bm-sum-row--' + cls : ''}"><span>${l}</span><span class="bm-sum-val">${v}</span></div>`
    ).join('');
    if (warns) {
      const unPH = state.placeholders.filter(ph => !state.mapping[ph]);
      warns.innerHTML = unPH.map(ph =>
        `<div class="bm-warn-box">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/></svg>
          Поле <strong>${escHtml(ph)}</strong> не сопоставлено — останется пустым
        </div>`).join('');
    }
  }

  // ── Предупреждения текущей строки ──────────────────────────────────────────
  function updateRowWarnings() {
    const strip = $('bm-row-warns');
    if (!strip || !state.rows.length || _editMode) { if (strip) strip.style.display = 'none'; return; }
    const row   = state.rows[state.currentRow];
    const email = String(row[state.emailColumn] || '');
    const warns = [];
    if (!email) warns.push('Нет email — строка будет пропущена');
    else if (!_isValidEmail(email)) warns.push(`Некорректный email: ${email}`);
    state.placeholders.forEach(ph => {
      const col = state.mapping[ph];
      if (col && !row[col]) warns.push(`Поле «${col}» пустое`);
    });
    if (!warns.length) { strip.style.display = 'none'; return; }
    strip.style.display = 'flex';
    strip.innerHTML = warns.map(w =>
      `<div class="bm-row-warn">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
        ${escHtml(w)}</div>`
    ).join('');
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // БЛОК 6: ОТПРАВКА
  // ══════════════════════════════════════════════════════════════════════════════
  function updateSendButton() {
    const countEl = $('bm-send-count');
    if (countEl) countEl.textContent = state.rows.length;
  }

  function resetProgress() {
    const section = $('bm-progress-section');
    const list    = $('bm-progress-list');
    const fill    = $('bm-progress-fill');
    const summary = $('bm-progress-summary');
    const postAct = $('bm-post-actions');
    const cancelBtn = $('bm-cancel-btn');
    const sendBtn = $('bm-send-btn');

    if (section)  section.style.display  = 'none';
    if (list)     list.innerHTML         = '';
    if (fill)     fill.style.width       = '0%';
    if (summary)  summary.style.display  = 'none';
    if (postAct)  postAct.style.display  = 'none';
    if (cancelBtn) cancelBtn.style.display = 'inline-flex';
    if (sendBtn)  { sendBtn.disabled = false; updateSendButton(); }
    state.results = []; state.sending = false; state.cancelled = false;
  }

  let _currentJobId = null;
  let _currentEventSource = null;

  async function startSend(rowsToSend) {
    if (state.sending) return;
    state.sending = true; state.cancelled = false;

    const rows        = rowsToSend || state.rows;
    const isDraft     = $('bm-draft-mode')?.checked    || false;
    const stopOnError = $('bm-stop-on-error')?.checked || false;
    const skipNoEmail = $('bm-skip-no-email')?.checked !== false;
    const delay       = parseInt($('bm-delay')?.value) || 0;

    // UI: показать секцию прогресса
    const section   = $('bm-progress-section');
    const list      = $('bm-progress-list');
    const fill      = $('bm-progress-fill');
    const sendBtn   = $('bm-send-btn');
    const cancelBtn = $('bm-cancel-btn');
    const summary   = $('bm-progress-summary');
    const postAct   = $('bm-post-actions');

    if (section)   section.style.display  = 'block';
    if (!rowsToSend) list.innerHTML = '';
    if (summary)   summary.style.display  = 'none';
    if (postAct)   postAct.style.display  = 'none';
    if (sendBtn)   sendBtn.disabled       = true;
    if (cancelBtn) cancelBtn.style.display = 'inline-flex';
    if (fill)      fill.style.width       = '0%';

    // Получаем чистый HTML шаблона через emailGenerator (без лейблов, со светлой темой)
    const templateHtml = await _getTemplateHtml();

    // Стартуем задачу
    let jobId;
    try {
      const resp = await fetch('/api/bulk/send/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_html: templateHtml,
          rows,
          mapping:       state.mapping,
          subject:       $('bm-subject')?.value || '',
          email_column:  state.emailColumn,
          cc:            $('bm-cc')?.value  || '',
          bcc:           $('bm-bcc')?.value || '',
          skip_no_email:    skipNoEmail,
          draft_mode:       isDraft,
          stop_on_error:    stopOnError,
          delay,
          attach_enabled:   $('bm-attach-toggle')?.checked  || false,
          attach_folder:    $('bm-attach-folder')?.value    || '',
          attach_template:  $('bm-attach-template')?.value  || '',
          attach_missing:   $('bm-attach-missing')?.value   || 'send',
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
      jobId = data.job_id;
    } catch (e) {
      finishSend(0, 0, 0, e.message);
      return;
    }

    _currentJobId = jobId;
    const total = rows.length;

    // Слушаем SSE-поток
    const es = new EventSource(`/api/bulk/send/stream/${jobId}`);
    _currentEventSource = es;

    es.onmessage = (e) => {
      const evt = JSON.parse(e.data);
      if (evt.type === 'heartbeat') return;

      if (evt.type === 'progress') {
        const pct = Math.round(((evt.index + 1) / evt.total) * 100);
        if (fill) fill.style.width = pct + '%';
        appendResultItem(evt.name, evt.email, evt.status, evt.comment);
        if (evt.status === 'error') {
          state.results.push({ row: rows[evt.index], email: evt.email, name: evt.name, status: 'error', error: evt.comment });
        }
        return;
      }

      if (evt.type === 'done' || evt.type === 'cancelled') {
        es.close(); _currentEventSource = null; _currentJobId = null;
        finishSend(evt.sent, evt.errors, evt.skipped);
        return;
      }

      if (evt.type === 'error') {
        es.close(); _currentEventSource = null; _currentJobId = null;
        finishSend(0, 0, 0, evt.message);
        return;
      }
    };

    es.onerror = () => {
      es.close(); _currentEventSource = null; _currentJobId = null;
      finishSend(0, 0, 0, 'Потеряно соединение с сервером');
    };
  }

  function finishSend(sent, errors, skipped, fatalError) {
    state.sending = false;
    const fill      = $('bm-progress-fill');
    const summary   = $('bm-progress-summary');
    const postAct   = $('bm-post-actions');
    const cancelBtn = $('bm-cancel-btn');
    const sendBtn   = $('bm-send-btn');
    const retryBtn  = $('bm-retry-btn');

    if (fill)      fill.style.width        = '100%';
    if (cancelBtn) cancelBtn.style.display = 'none';
    if (sendBtn)   { sendBtn.disabled = false; updateSendButton(); }

    if (fatalError) {
      if (summary) {
        summary.style.display = 'flex';
        const okEl = $('bm-progress-ok');
        if (okEl) { okEl.textContent = `⚠ ${fatalError}`; okEl.style.color = '#ef4444'; }
      }
      if (postAct) postAct.style.display = 'flex';
      return;
    }

    if (summary) {
      summary.style.display = 'flex';
      const okEl   = $('bm-progress-ok');
      const errEl  = $('bm-progress-err');
      const skipEl = $('bm-progress-skip');
      if (okEl)   { okEl.textContent = `✓ ${sent} отправлено`; okEl.style.color = ''; }
      if (errEl)  { errEl.textContent  = `✗ ${errors} ошибок`;    errEl.style.display  = errors  > 0 ? 'inline-flex' : 'none'; }
      if (skipEl) { skipEl.textContent = `⊘ ${skipped} пропущено`; skipEl.style.display = skipped > 0 ? 'inline-flex' : 'none'; }
    }

    if (postAct) {
      postAct.style.display = 'flex';
      const failedRows = state.results.filter(r => r.status === 'error').map(r => r.row);
      if (retryBtn) retryBtn.disabled = failedRows.length === 0;
    }
  }

  // Создаёт элемент в списке прогресса
  function appendResultItem(name, email, status, comment) {
    const list = $('bm-progress-list');
    if (!list) return null;
    const item = document.createElement('div');
    item.className = `bm-progress-item bm-progress-item--${status}`;
    item.innerHTML = `
      <span class="bm-progress-dot">${status === 'sending' ? '' : status === 'sent' ? '✓' : status === 'skip' ? '⊘' : '✗'}</span>
      <span class="bm-progress-name">${escHtml(name)}</span>
      <span class="bm-progress-email">${escHtml(email)}</span>
      <span class="bm-progress-comment">${escHtml(comment)}</span>`;
    list.appendChild(item);
    list.scrollTop = list.scrollHeight;
    return item;
  }

  function updateResultItem(item, status, comment) {
    if (!item) return;
    item.className = `bm-progress-item bm-progress-item--${status}`;
    const dot = item.querySelector('.bm-progress-dot');
    const cmt = item.querySelector('.bm-progress-comment');
    if (dot) dot.textContent = status === 'sent' ? '✓' : status === 'skip' ? '⊘' : '✗';
    if (cmt) cmt.textContent = comment;
  }

  // ── Тестовое письмо ────────────────────────────────────────────────────────
  async function sendTest() {
    if (!state.rows.length) return;
    const row = state.rows[state.currentRow];
    const btn = $('bm-test-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Отправка…'; }
    try {
      const resp = await fetch('/api/bulk/send-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_html: await _getTemplateHtml(),
          row,
          mapping:     state.mapping,
          subject:     $('bm-subject')?.value || '',
        }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.success) throw new Error(data.error || 'Ошибка');
      Toast.show(`Тестовое письмо отправлено на ${data.to}`, 'success');
    } catch (e) {
      Toast.show(`Ошибка отправки: ${e.message}`, 'error', 6000);
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8"/><rect x="3" y="6" width="18" height="12" rx="2"/></svg> Тестовое письмо себе'; }
    }
  }

  async function _getTemplateHtml() {
    // generateEmailHTML строит чистый email-HTML из AppState.blocks.
    // В user-режиме блоки живут в UserAppState.blocks — делаем временный своп,
    // как это делает renderTemplatePreview в userApp.js.
    if (typeof generateEmailHTML === 'function') {
      const originalBlocks = (typeof AppState !== 'undefined') ? AppState.blocks : null;
      try {
        if (MODE === 'user' && typeof UserAppState !== 'undefined' && UserAppState.blocks?.length) {
          AppState.blocks = JSON.parse(JSON.stringify(UserAppState.blocks));
        }
        return await generateEmailHTML({ previewTheme: 'light' });
      } catch (e) {
        console.warn('[BulkMail] generateEmailHTML failed, falling back to innerHTML:', e);
      } finally {
        if (typeof AppState !== 'undefined' && originalBlocks !== null) {
          AppState.blocks = originalBlocks;
        }
      }
    }
    // Fallback: canvas innerHTML без UI-элементов
    restoreCanvas();
    const canvas = $(CANVAS_ID);
    if (!canvas) return '';
    const clone = canvas.cloneNode(true);
    clone.querySelectorAll('.block-header, .block-title, .block-controls, [data-ui-only]').forEach(el => el.remove());
    return clone.innerHTML;
  }

  // ── Экспорт CSV ────────────────────────────────────────────────────────────
  function exportCSV() {
    const nameCol  = state.mapping['{{ФИО}}'] || state.headers.find(h => h.toLowerCase().includes('фио') || h.toLowerCase().includes('имя')) || state.headers[0] || '';
    const statusMap = Object.fromEntries(state.results.map(r => [r.email + '|' + (r.name || ''), r]));

    const q = v => `"${String(v ?? '').replace(/"/g,'""')}"`;

    const extraHeaders = state.headers.filter(h => h !== state.emailColumn && h !== nameCol);
    const headerRow = ['Статус', 'Комментарий', nameCol || 'Имя', state.emailColumn || 'Email', ...extraHeaders].join(',');

    const lines = state.rows.map(row => {
      const email = row[state.emailColumn] || '';
      const name  = row[nameCol] || '';
      const key   = email + '|' + name;
      const res   = statusMap[key];
      const status  = res ? (res.status === 'sent' ? 'Отправлено' : res.status === 'error' ? 'Ошибка' : 'Пропущено') : 'Не обработано';
      const comment = res?.error || '';
      const extras  = extraHeaders.map(h => q(row[h] ?? ''));
      return [q(status), q(comment), q(name), q(email), ...extras].join(',');
    });

    const csv  = '﻿' + headerRow + '\n' + lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `rassylka_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // РЕЖИМ КАНВАСА: ПРОСМОТР / РЕДАКТИРОВАТЬ
  // ══════════════════════════════════════════════════════════════════════════════
  let _editMode = false;
  let _lastRange = null;

  function setCanvasMode(mode) {
    _editMode = (mode === 'edit');
    $('bm-mode-preview')?.classList.toggle('bm-mode-btn--active', !_editMode);
    $('bm-mode-edit')?.classList.toggle('bm-mode-btn--active',    _editMode);
    const insBar = $('bm-ph-ins-bar');
    if (insBar) insBar.style.display = _editMode ? 'flex' : 'none';
    if (_editMode) {
      restoreCanvas();
      const strip = $('bm-row-warns');
      if (strip) strip.style.display = 'none';
    } else {
      if (state.fileLoaded) renderCurrentRow();
    }
  }

  function initCanvasSelectionTracking() {
    const canvas = $(CANVAS_ID);
    if (!canvas) return;
    const save = () => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const r = sel.getRangeAt(0);
      let node = r.commonAncestorContainer;
      if (node.nodeType === 3) node = node.parentNode;
      while (node) {
        if (node.id === CANVAS_ID) { _lastRange = r.cloneRange(); break; }
        node = node.parentNode;
      }
    };
    canvas.addEventListener('mouseup', save);
    canvas.addEventListener('keyup',   save);
  }

  function buildPhInsChips() {
    const container = $('bm-ph-ins-chips');
    if (!container) return;
    const cols = state.headers.filter(h => {
      const lc = h.toLowerCase();
      return !lc.includes('email') && !lc.includes('e-mail') && !lc.includes('почта');
    });
    container.innerHTML = cols.map(col =>
      `<button type="button" class="bm-ph-chip" data-col="${escHtml(col)}">{{${escHtml(col)}}}</button>`
    ).join('');
    container.querySelectorAll('.bm-ph-chip').forEach(btn => {
      btn.addEventListener('mousedown', e => {
        e.preventDefault();
        insertPlaceholderAtCursor(btn.dataset.col);
      });
    });
  }

  function insertPlaceholderAtCursor(colName) {
    if (!_editMode) setCanvasMode('edit');
    const span = document.createElement('span');
    span.className = 'bm-inline-ph';
    span.setAttribute('data-field', colName);
    span.setAttribute('contenteditable', 'false');
    span.textContent = `{{${colName}}}`;

    let inserted = false;
    if (_lastRange) {
      try {
        _lastRange.deleteContents();
        _lastRange.insertNode(span);
        const r = document.createRange();
        r.setStartAfter(span); r.collapse(true);
        const sel = window.getSelection();
        sel.removeAllRanges(); sel.addRange(r);
        _lastRange = r.cloneRange();
        inserted = true;
      } catch (_) {}
    }
    if (!inserted) {
      const canvas = $(CANVAS_ID);
      const target = canvas?.querySelector('[contenteditable="true"] p, [contenteditable="true"]');
      if (target) { target.appendChild(document.createTextNode(' ')); target.appendChild(span); inserted = true; }
    }
    if (inserted) {
      span.style.transition = 'background .2s';
      span.style.background = 'rgba(249,115,22,.45)';
      setTimeout(() => span.style.background = '', 400);
      detectPlaceholders();
      recalcSummary();
    }
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // МОДАЛКА ПОДТВЕРЖДЕНИЯ
  // ══════════════════════════════════════════════════════════════════════════════
  function _showConfirmModal(onConfirm) {
    const skipNoEmail = $('bm-skip-no-email')?.checked !== false;
    const isDraft     = $('bm-draft-mode')?.checked || false;
    const isValidEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e));

    let toSend = 0, skip = 0, emptyEmail = 0, badEmail = 0;
    state.rows.forEach(r => {
      const e = String(r[state.emailColumn] || '');
      if (!e) { emptyEmail++; if (skipNoEmail) { skip++; return; } }
      else if (!isValidEmail(e)) { badEmail++; skip++; return; }
      toSend++;
    });

    const unPH = state.placeholders.filter(ph => !state.mapping[ph]);
    const action = isDraft ? 'черновиков' : 'писем';

    const body = $('bm-confirm-body');
    const warns = $('bm-confirm-warns');
    const okLabel = $('bm-confirm-ok-label');
    const modal = $('bm-confirm-modal');
    if (!modal) { onConfirm(); return; }  // fallback if no modal in DOM

    if (body) body.innerHTML =
      `Будет отправлено <strong style="color:#c4b5fd">${toSend} ${_plural(toSend,'письмо','письма','писем')}</strong>.` +
      (skip > 0 ? ` ${skip} ${_plural(skip,'строка','строки','строк')} будут пропущены.` : '');

    if (warns) warns.innerHTML = [
      ...unPH.map(ph =>
        `<div style="display:flex;gap:8px;padding:8px 10px;background:rgba(249,115,22,.08);
                     border:1px solid rgba(249,115,22,.22);border-radius:7px;font-size:12px;color:#fb923c">
           <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;margin-top:1px"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/></svg>
           Поле <strong style="font-family:monospace">${escHtml(ph)}</strong> не сопоставлено — останется пустым
         </div>`),
      ...(badEmail > 0 ? [`<div style="display:flex;gap:8px;padding:8px 10px;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);border-radius:7px;font-size:12px;color:#fca5a5">
           <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;margin-top:1px"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
           ${badEmail} ${_plural(badEmail,'строка','строки','строк')} с некорректным email — будут пропущены
         </div>`] : []),
    ].join('');

    if (okLabel) okLabel.textContent = `${isDraft ? 'Сохранить черновики' : 'Отправить'} — ${toSend} ${action}`;

    // Показываем через JS (не CSS-класс) — совместимо с QWebEngineView
    modal.style.display = 'flex';

    const ok     = $('bm-confirm-ok');
    const cancel = $('bm-confirm-cancel');

    function close() { modal.style.display = 'none'; }
    function onOk()  { close(); onConfirm(); }

    ok?.addEventListener('click', onOk,   { once: true });
    cancel?.addEventListener('click', close, { once: true });
    modal.addEventListener('click', e => { if (e.target === modal) close(); }, { once: true });
  }

  function _plural(n, one, two, five) {
    const m = n % 100, m10 = n % 10;
    if (m >= 11 && m <= 14) return five;
    if (m10 === 1) return one;
    if (m10 >= 2 && m10 <= 4) return two;
    return five;
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // ИНИЦИАЛИЗАЦИЯ СОБЫТИЙ
  // ══════════════════════════════════════════════════════════════════════════════
  function init() {
    initAccordion();
    initFileUpload();
    initAttachMode();
    initCanvasSelectionTracking();

    // Переключатель режима — только в admin (в user канвас всегда в preview)
    if (MODE === 'admin') {
      $('bm-mode-preview')?.addEventListener('click', () => setCanvasMode('preview'));
      $('bm-mode-edit')?.addEventListener('click',    () => setCanvasMode('edit'));
    }
    $('bm-skip-no-email')?.addEventListener('change', recalcSummary);

    // CC / BCC collapse
    const ccBtn  = $('bm-cc-btn');
    const ccArea = $('bm-cc-area');
    if (ccBtn && ccArea) {
      ccBtn.addEventListener('click', () => {
        const open = ccArea.style.display !== 'none';
        ccArea.style.display = open ? 'none' : 'block';
        ccBtn.setAttribute('aria-expanded', String(!open));
        ccBtn.classList.toggle('bm-collapse-btn--open', !open);
      });
    }

    // Вложения toggle
    const attachToggle  = $('bm-attach-toggle');
    const attachContent = $('bm-attach-content');
    if (attachToggle && attachContent) {
      attachToggle.addEventListener('change', () => {
        attachContent.style.display = attachToggle.checked ? 'block' : 'none';
      });
    }

    // Дополнительные настройки collapse
    const advBtn  = $('bm-adv-btn');
    const advArea = $('bm-adv-area');
    if (advBtn && advArea) {
      advBtn.addEventListener('click', () => {
        const open = advArea.style.display !== 'none';
        advArea.style.display = open ? 'none' : 'block';
        advBtn.setAttribute('aria-expanded', String(!open));
        advBtn.classList.toggle('bm-collapse-btn--open', !open);
      });
    }

    // Навигация строк
    $('bm-row-prev')?.addEventListener('click', () => { if (state.currentRow > 0) { state.currentRow--; renderCurrentRow(); } });
    $('bm-row-next')?.addEventListener('click', () => { if (state.currentRow < state.rows.length-1) { state.currentRow++; renderCurrentRow(); } });

    // Кнопки отправки
    $('bm-send-btn')?.addEventListener('click', () => {
      if (!state.rows.length) return;
      _showConfirmModal(() => { resetProgress(); startSend(); });
    });

    $('bm-test-btn')?.addEventListener('click', sendTest);

    // Отмена
    $('bm-cancel-btn')?.addEventListener('click', () => {
      if (!confirm('Остановить рассылку?')) return;
      state.cancelled = true;
      if (_currentJobId) {
        fetch(`/api/bulk/send/cancel/${_currentJobId}`, { method: 'POST' });
      }
      if (_currentEventSource) { _currentEventSource.close(); _currentEventSource = null; }
    });

    // Повторить ошибки
    $('bm-retry-btn')?.addEventListener('click', () => {
      const failedRows = state.results.filter(r => r.status === 'error').map(r => r.row);
      if (!failedRows.length) return;
      state.results = state.results.filter(r => r.status !== 'error');
      startSend(failedRows);
    });

    // Экспорт
    $('bm-export-btn')?.addEventListener('click', exportCSV);

    // Детект плейсхолдеров при смене аккордеона (для user-режима — при открытии)
    // в admin — через onPanelOpen()
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { init, getColumns: () => state.headers, detectPlaceholders, recalcSummary };
})();

// ── Глобальный объект BulkMail для userToolbar.js и admin-bulk-mail.js ────────
window.BulkMail = {
  getColumns: () => BulkMailPanel.getColumns().filter(h => {
    const lc = h.toLowerCase();
    return !lc.includes('email') && !lc.includes('e-mail') && !lc.includes('почта');
  }),
  // Перезапуск детекта плейсхолдеров + пересчёт сводки после внешних изменений
  refresh: () => {
    BulkMailPanel.detectPlaceholders();
    BulkMailPanel.recalcSummary();
  },
};
