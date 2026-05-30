'use strict';

/* ─────────────────────────────────────────────────────────────────────────────
   BulkMailPanel — панель рассылки (Фаза 1: прототип с демо-данными)
   Блоки 1-7 по спецификации
   ───────────────────────────────────────────────────────────────────────────── */
const BulkMailPanel = (() => {

  // ── Режим: 'user' (index-user.html) или 'admin' (index.html) ──────────────────
  const MODE      = document.getElementById('user-canvas') ? 'user' : 'admin';
  const CANVAS_ID = MODE === 'user' ? 'user-canvas' : 'canvas';

  // ── Демо-данные (Фаза 1) ──────────────────────────────────────────────────────
  const DEMO_ROWS = [
    { ФИО: 'Иванов Иван Иванович',       Email: 'ivanov@corp.ru',  Отдел: 'ИТ',          Должность: 'Разработчик',  НомерДоговора: 'ИТ-001' },
    { ФИО: 'Петрова Мария Сергеевна',    Email: 'petrova@corp.ru', Отдел: 'Бухгалтерия', Должность: 'Бухгалтер',   НомерДоговора: 'БУХ-002' },
    { ФИО: 'Сидоров Алексей Петрович',   Email: 'sidorov@corp.ru', Отдел: 'HR',          Должность: 'Менеджер',    НомерДоговора: 'HR-003' },
    { ФИО: 'Козлова Ольга Николаевна',   Email: '',                Отдел: 'Маркетинг',   Должность: 'Аналитик',    НомерДоговора: 'МКТ-004' },
    { ФИО: 'Новиков Дмитрий Андреевич',  Email: 'novikov@corp.ru', Отдел: 'ИТ',          Должность: 'Тестировщик', НомерДоговора: 'ИТ-005' },
  ];
  // Демо: два листа
  const DEMO_SHEETS = ['Сотрудники', 'Архив'];
  const DEMO_HEADERS = Object.keys(DEMO_ROWS[0]);

  // ── Состояние ──────────────────────────────────────────────────────────────────
  const state = {
    isOpen:        false,
    fileLoaded:    false,
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
  }
  function onPanelClose() {
    hideRowNav();
    restoreCanvas();
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // БЛОК 1: ЗАГРУЗКА ФАЙЛА
  // ══════════════════════════════════════════════════════════════════════════════
  function initFileUpload() {
    const btn   = $('bm-file-btn');
    const input = $('bm-file-input');
    const zone  = $('bm-file-zone');
    const clear = $('bm-file-clear');
    const sheetSel = $('bm-sheet-sel');

    if (btn)   btn.addEventListener('click',  () => input?.click());
    if (input) input.addEventListener('change', e => { const f = e.target.files[0]; if (f) loadDemoData(f.name); e.target.value=''; });
    if (clear) clear.addEventListener('click', clearFile);

    if (zone) {
      zone.addEventListener('dragover',  e => { e.preventDefault(); zone.classList.add('bm-file-zone--drag'); });
      zone.addEventListener('dragleave', ()  => zone.classList.remove('bm-file-zone--drag'));
      zone.addEventListener('drop', e => {
        e.preventDefault(); zone.classList.remove('bm-file-zone--drag');
        loadDemoData(e.dataTransfer.files[0]?.name || 'данные.xlsx');
      });
    }

    if (sheetSel) sheetSel.addEventListener('change', () => {
      // Демо: при смене листа перезаполняем теми же данными (в реале — запрос к бэкенду)
      populateEmailColumn();
      populateAttachColSel();
      detectPlaceholders();
      updateSendButton();
      renderCurrentRow();
    });
  }

  function loadDemoData(filename) {
    state.fileLoaded = true;
    state.headers    = DEMO_HEADERS;
    state.rows       = [...DEMO_ROWS];
    state.currentRow = 0;
    state.results    = [];

    // UI: зона → файл-инфо
    const zone    = $('bm-file-zone');
    const info    = $('bm-file-info');
    const nameEl  = $('bm-file-name');
    const countEl = $('bm-file-count');
    const settings = $('bm-settings-section');
    const badge   = $('bm-accordion-badge');
    const sheetField = $('bm-sheet-field');
    const sheetSel   = $('bm-sheet-sel');

    if (zone)    zone.style.display    = 'none';
    if (info)    info.style.display    = 'flex';
    if (nameEl)  nameEl.textContent    = filename;
    if (countEl) countEl.textContent   = state.rows.length + ' строк';
    if (settings) settings.style.display = 'block';
    if (badge)   { badge.textContent = state.rows.length; badge.style.display = 'inline-flex'; }

    // Листы (демо: 2 листа)
    if (sheetSel && sheetField) {
      sheetSel.innerHTML = DEMO_SHEETS.map((s,i) => `<option value="${i}">${s}</option>`).join('');
      sheetField.style.display = 'block';
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

    // ── Уведомить тулбар и admin-панель о доступных колонках ──────────────────
    notifyColumnsAvailable(true);
  }

  function clearFile() {
    state.fileLoaded = false; state.headers = []; state.rows = [];
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

  function startSend(rowsToSend) {
    if (state.sending) return;
    state.sending = true; state.cancelled = false;

    const rows = rowsToSend || state.rows;
    const section = $('bm-progress-section');
    const list    = $('bm-progress-list');
    const fill    = $('bm-progress-fill');
    const sendBtn = $('bm-send-btn');
    const cancelBtn = $('bm-cancel-btn');
    const summary = $('bm-progress-summary');
    const postAct = $('bm-post-actions');
    const stopOnError = $('bm-stop-on-error')?.checked;
    const isDraft     = $('bm-draft-mode')?.checked;
    const skipNoEmail = $('bm-skip-no-email')?.checked;

    if (section)  section.style.display = 'block';
    if (!rowsToSend) list.innerHTML = ''; // при retry — добавляем к существующим
    if (summary)  summary.style.display = 'none';
    if (postAct)  postAct.style.display = 'none';
    if (sendBtn)  sendBtn.disabled = true;
    if (cancelBtn) cancelBtn.style.display = 'inline-flex';

    const total = rows.length;
    let processed = 0;
    let sent = 0, errors = 0, skipped = 0;

    function sendNext() {
      if (state.cancelled || processed >= total) {
        finishSend(sent, errors, skipped);
        return;
      }

      const row   = rows[processed];
      const email = row[state.emailColumn] || '';
      const name  = row[state.mapping['{{ФИО}}'] || 'ФИО'] || '';

      // Пропустить если нет email и включена опция
      if (skipNoEmail && !email) {
        skipped++;
        appendResultItem(name || '—', email || '(нет email)', 'skip', isDraft ? 'Пропущено (нет email)' : 'Пропущено');
        processed++;
        if (fill) fill.style.width = `${Math.round((processed / total) * 100)}%`;
        setTimeout(sendNext, 50);
        return;
      }

      const item = appendResultItem(name, email, 'sending', isDraft ? 'Черновик...' : 'Отправка...');
      if (fill) fill.style.width = `${Math.round((processed / total) * 100)}%`;

      // Симуляция задержки. В реале здесь fetch('/api/bulk/send')
      const delay = (parseInt($('bm-delay')?.value) || 0) * 1000;
      const sendTime = 200 + Math.random() * 400 + delay;

      setTimeout(() => {
        // 85% успех в демо
        const ok = Math.random() > 0.15;
        if (ok) {
          sent++;
          updateResultItem(item, 'sent', isDraft ? 'Сохранён черновик' : 'Отправлено');
        } else {
          errors++;
          const errMsg = ['Недоступен сервер Exchange', 'Адрес не найден', 'Превышен лимит'][Math.floor(Math.random()*3)];
          updateResultItem(item, 'error', errMsg);
          state.results.push({ row, email, name, status: 'error', error: errMsg });
          if (stopOnError) { state.cancelled = true; }
        }
        processed++;
        sendNext();
      }, sendTime);
    }

    sendNext();
  }

  function finishSend(sent, errors, skipped) {
    state.sending = false;
    const fill    = $('bm-progress-fill');
    const summary = $('bm-progress-summary');
    const postAct = $('bm-post-actions');
    const cancelBtn = $('bm-cancel-btn');
    const sendBtn   = $('bm-send-btn');
    const retryBtn  = $('bm-retry-btn');

    if (fill)    fill.style.width = '100%';
    if (cancelBtn) cancelBtn.style.display = 'none';
    if (sendBtn)   { sendBtn.disabled = false; $('bm-send-count').textContent = state.rows.length; }

    if (summary) {
      summary.style.display = 'flex';
      const okEl   = $('bm-progress-ok');
      const errEl  = $('bm-progress-err');
      const skipEl = $('bm-progress-skip');
      if (okEl)   okEl.textContent   = `✓ ${sent} отправлено`;
      if (errEl)  { errEl.textContent  = `✗ ${errors} ошибок`;   errEl.style.display  = errors  > 0 ? 'inline-flex' : 'none'; }
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
  function sendTest() {
    if (!state.rows.length) return;
    const row   = state.rows[state.currentRow];
    const email = row[state.emailColumn];
    const name  = row[state.mapping['{{ФИО}}'] || 'ФИО'] || '';
    if (!email) { alert('У текущей строки нет email-адреса'); return; }
    alert(`Тестовое письмо для:\n${name}\n${email}\n\n(Демо: в реальном режиме отправит через Exchange)`);
  }

  // ── Экспорт CSV ────────────────────────────────────────────────────────────
  function exportCSV() {
    const rows = state.results.length > 0 ? state.results : state.rows.map(row => ({
      row, email: row[state.emailColumn] || '', name: row[state.mapping['{{ФИО}}'] || 'ФИО'] || '', status: 'pending'
    }));
    const header = 'ФИО,Email,Статус,Комментарий';
    const lines  = rows.map(r => `"${(r.name||'').replace(/"/g,'""')}","${(r.email||'').replace(/"/g,'""')}","${r.status}","${(r.error||'').replace(/"/g,'""')}"`);
    const csv    = '﻿' + header + '\n' + lines.join('\n'); // BOM for Excel
    const blob   = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url    = URL.createObjectURL(blob);
    const a      = document.createElement('a');
    a.href = url; a.download = 'rassylka_otchet.csv';
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
      const count = state.rows.length;
      const draft = $('bm-draft-mode')?.checked;
      const msg   = draft
        ? `Сохранить черновики для ${count} получателей?`
        : `Отправить рассылку ${count} получателям?`;
      if (confirm(msg)) { resetProgress(); startSend(); }
    });

    $('bm-test-btn')?.addEventListener('click', sendTest);

    // Отмена
    $('bm-cancel-btn')?.addEventListener('click', () => {
      if (!confirm('Остановить рассылку?')) return;
      state.cancelled = true;
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
