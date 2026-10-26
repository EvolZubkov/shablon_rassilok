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
    usage:         {},      // { '{{X}}': { body, subject, file } } — где встречается плейсхолдер
    preflight:     null,    // ответ /api/bulk/preflight: что с вложениями у каждой строки
    canvasBackups: [],
    sending:       false,
    cancelled:     false,
    results:       [],      // { row, email, name, status:'sent'|'error'|'skip', error }
    log:           [],      // журнал рассылки: все строки с временем, Message-ID и ответом сервера
    channel:       'exchange',  // 'exchange' | 'smtp'
  };

  const WIDE_PANEL_PX = 560;   // от этой ширины форма и сводка встают в две колонки

  // ── Helpers ────────────────────────────────────────────────────────────────────
  const $ = id => document.getElementById(id);
  let attachments = null;   // карточки вложений (bulkAttachments.js), создаются в init()
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
    try {
      const resp = await fetch('/api/credentials/status');
      const data = await resp.json();
      const warn = $('bm-exchange-warn');
      if (warn) warn.style.display = data.exists ? 'none' : 'flex';
      _renderChannelSwitch(data);
      _populateFromSelectForChannel(data, state.channel);
    } catch (_) { /* сервер недоступен — молчим */ }
  }

  function _populateFromSelect(status) {
    const sel = $('bm-from');
    if (!sel) return;
    _populateFromSelectForChannel(status, state.channel);
  }

  function _populateFromSelectForChannel(status, channel) {
    const sel = $('bm-from');
    if (!sel) return;
    let primary, senders;
    if (channel === 'smtp') {
      primary = status.smtp_from_email || '';
      senders = (status.smtp_default_senders || []).filter(e => e && e !== primary);
    } else {
      primary = status.from_email || status.username || '';
      senders = (status.default_senders || []).filter(e => e && e !== primary);
    }
    const all = primary ? [primary, ...senders] : senders;
    sel.innerHTML = '';
    all.forEach(email => {
      const opt = document.createElement('option');
      opt.value = opt.textContent = email;
      sel.appendChild(opt);
    });
  }

  function _renderChannelSwitch(status) {
    const smtpConfigured = !!(status.smtp_host && status.smtp_username);
    const block = $('bm-channel-block');
    if (!block) return;
    if (!smtpConfigured) {
      block.style.display = 'none';
      state.channel = 'exchange';
      return;
    }
    block.style.display = '';
    // Render switcher if not already rendered
    if (!$('bm-ch-btn-exchange')) {
      block.innerHTML = `
        <div class="bm-section-label">Канал отправки</div>
        <div class="bm-channel-switch">
          <button type="button" class="bm-channel-btn active" id="bm-ch-btn-exchange">📧 Exchange</button>
          <button type="button" class="bm-channel-btn" id="bm-ch-btn-smtp">📨 SMTP</button>
        </div>`;
      $('bm-ch-btn-exchange').addEventListener('click', () => _selectChannel('exchange', status));
      $('bm-ch-btn-smtp').addEventListener('click',    () => _selectChannel('smtp',     status));
    }
  }

  function _selectChannel(ch, status) {
    state.channel = ch;
    const isSmtp = ch === 'smtp';
    $('bm-ch-btn-exchange')?.classList.toggle('active', !isSmtp);
    $('bm-ch-btn-smtp')?.classList.toggle('active',     isSmtp);
    _populateFromSelectForChannel(status || {}, ch);
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

    const ALLOWED_EXT = ['.xlsx', '.xls', '.ods', '.csv'];

    function _checkExt(file) {
      const name = (file.name || '').toLowerCase();
      if (ALLOWED_EXT.some(e => name.endsWith(e))) return true;
      const allowed = ALLOWED_EXT.join(', ');
      _showFileError(file.name, `Неподдерживаемый формат. Разрешены: ${allowed}`);
      return false;
    }

    if (input) input.addEventListener('change', e => {
      const f = e.target.files[0];
      if (f && _checkExt(f)) parseFile(f);
      e.target.value = '';
    });

    // «Заменить»: новый файл вместо загруженного, сопоставление и настройки остаются.
    const replaceBtn   = $('bm-file-replace');
    const replaceInput = $('bm-file-replace-input');
    if (replaceBtn)   replaceBtn.addEventListener('click', () => replaceInput?.click());
    if (replaceInput) replaceInput.addEventListener('change', e => {
      const f = e.target.files[0];
      if (f && _checkExt(f)) parseFile(f, null, _getHeaderRow(), { replace: true });
      e.target.value = '';
    });

    if (zone) {
      zone.addEventListener('dragover',  e => { e.preventDefault(); zone.classList.add('bm-file-zone--drag'); });
      zone.addEventListener('dragleave', ()  => zone.classList.remove('bm-file-zone--drag'));
      zone.addEventListener('drop', e => {
        e.preventDefault(); zone.classList.remove('bm-file-zone--drag');
        const f = e.dataTransfer.files[0];
        if (f && _checkExt(f)) parseFile(f);
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
  async function parseFile(file, sheetName, headerRow, opts = {}) {
    const previousFile = state.currentFile;
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
      _applyParsedData(file.name, data, opts);
    } catch (err) {
      // Не удалось прочитать новый файл при замене: прежние данные остаются в работе.
      if (opts.replace && state.fileLoaded) {
        state.currentFile = previousFile;
        _showFileName($('bm-file-name')?.dataset.current || previousFile?.name || '', state.rows.length);
        _showReplaceNote([`Не удалось заменить файл «${file.name}»: ${err.message}. Остался прежний файл.`], true);
        return;
      }
      _showFileError(file.name, err.message);
    }
  }

  function _showFileName(filename, total) {
    const nameEl  = $('bm-file-name');
    const countEl = $('bm-file-count');
    if (nameEl)  { nameEl.textContent = filename; nameEl.dataset.current = filename; }
    if (countEl) { countEl.textContent = total + ' строк'; countEl.style.color = ''; }
  }

  /** Отчёт о замене файла под именем файла; пустой список прячет его. */
  function _showReplaceNote(lines, isError) {
    const note = $('bm-replace-note');
    if (!note) return;
    note.textContent = '';
    note.classList.toggle('bm-replace-note--error', !!isError);
    if (!lines.length) { note.style.display = 'none'; return; }
    lines.forEach(text => {
      const line = document.createElement('div');
      line.textContent = text;
      note.appendChild(line);
    });
    note.style.display = 'block';
  }

  /** Что изменилось после замены файла: строки, колонки, потерянные сопоставления. */
  function _replaceReport(prev, filename, total) {
    const lines = [`Файл заменён на «${filename}»: ${total} ${_plural(total, 'строка', 'строки', 'строк')}.`];
    const diff = BulkPlaceholders.diffHeaders(prev.headers, state.headers);
    if (diff.added.length)   lines.push(`Новые колонки: ${diff.added.join(', ')}.`);
    if (diff.removed.length) lines.push(`Пропали колонки: ${diff.removed.join(', ')}.`);
    const lost = BulkPlaceholders.groupByKey(Object.keys(prev.mapping))
      .filter(g => !g.variants.some(ph => state.mapping[ph]))
      .map(g => g.label);
    if (lost.length) lines.push(`Не сопоставлены, выберите колонку заново: ${lost.join(', ')}.`);
    if (prev.emailColumn && state.emailColumn !== prev.emailColumn) {
      lines.push(`Колонка email: теперь «${state.emailColumn}» (была «${prev.emailColumn}»).`);
    }
    return lines;
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

  function _applyParsedData(filename, data, opts = {}) {
    const { sheets = [], headers = [], rows = [], total = 0 } = data;
    // Снимок до перезаписи: нужен для отчёта о замене файла.
    const prev = { headers: state.headers, mapping: { ...state.mapping }, emailColumn: state.emailColumn };

    state.fileLoaded = true;
    state.headers    = headers;
    state.rows       = rows;
    state.currentRow = 0;
    state.results    = [];

    // UI
    const zone     = $('bm-file-zone');
    const info     = $('bm-file-info');
    const settings = $('bm-settings-section');
    const badge    = $('bm-accordion-badge');
    const sheetField = $('bm-sheet-field');
    const sheetSel   = $('bm-sheet-sel');
    const hdrField   = $('bm-header-row-field');

    if (zone)     zone.style.display     = 'none';
    if (info)     info.style.display     = 'flex';
    _showFileName(filename, total);
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
    attachments?.refreshHeaders();
    detectPlaceholders();
    buildPreviewTable();
    buildPhInsChips();
    buildFieldChips();
    recalcSummary();
    updateSendButton();
    resetProgress();
    if (state.isOpen) { showRowNav(); renderCurrentRow(); }
    notifyColumnsAvailable(true);
    _showReplaceNote(opts.replace ? _replaceReport(prev, filename, total) : []);
    schedulePreflight();
  }

  function clearFile() {
    state.fileLoaded = false; state.currentFile = null;
    state.headers = []; state.rows = [];
    state.mapping = {}; state.placeholders = []; state.usage = {}; state.currentRow = 0; state.results = [];
    state.emailColumn = '';
    FIELD_CHIPS.forEach(({ chips }) => { const el = $(chips); if (el) el.textContent = ''; });
    state.preflight = null;
    const attachBox = $('bm-sum-attach');
    if (attachBox) attachBox.textContent = '';
    attachments?.refreshHeaders();
    _showReplaceNote([]);

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
    // Прежняя колонка email остаётся, если она есть в файле (замена файла, смена листа),
    // иначе подбираем по имени.
    const kept = state.emailColumn ? BulkPlaceholders.findColumn(state.headers, state.emailColumn) : null;
    const guessed = state.headers.find(h => /mail|почта/i.test(h)) || state.headers[0] || '';
    state.emailColumn = kept || guessed;
    sel.innerHTML = state.headers.map(h =>
      `<option value="${escHtml(h)}"${h === state.emailColumn ? ' selected' : ''}>${escHtml(h)}</option>`
    ).join('');
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // БЛОК 3: ПЛЕЙСХОЛДЕРЫ
  // ══════════════════════════════════════════════════════════════════════════════
  // Тексты, в которых пользователь может использовать {{плейсхолдеры}}: тело письма,
  // тема и (если включены вложения по шаблону) шаблон имени файла.
  function collectPlaceholderSources() {
    const canvas = $(CANVAS_ID);
    return {
      body:    canvas ? (canvas.innerText || canvas.textContent || '') : '',
      subject: $('bm-subject')?.value || '',
      file:    (attachments?.getFileTemplates() || []).join('\n'),
    };
  }

  function detectPlaceholders() {
    // В режиме превью канвас показывает значения выбранной строки вместо {{…}}:
    // читаем текст только после возврата оригинала, иначе плейсхолдеры тела
    // «пропадают» и их сопоставление сбрасывается.
    restoreCanvas();
    const sources = collectPlaceholderSources();
    const found = BulkPlaceholders.findPlaceholders(Object.values(sources).join('\n'));

    // Выбор пользователя (в т.ч. «не задано») не сбрасывается, автоподбор по имени
    // колонки — только для новых плейсхолдеров; {{ФИО}} и {{фио}} — одно поле.
    state.mapping = BulkPlaceholders.resolveMapping(found, state.placeholders, state.mapping, state.headers);
    state.placeholders = found;
    state.usage = BulkPlaceholders.countUsage(sources);

    renderMappingUI();
  }

  /** Несопоставленные поля группами: [{label, variants, usage}]. */
  function unmappedGroups() {
    return BulkPlaceholders.groupByKey(state.placeholders)
      .filter(g => !g.variants.some(ph => state.mapping[ph]))
      .map(g => ({ ...g, usage: BulkPlaceholders.groupUsage(g, state.usage || {}) }));
  }

  // Тема/шаблон имени файла набираются вручную — обновляем список плейсхолдеров на лету.
  let _placeholderTimer = null;
  function schedulePlaceholderRefresh() {
    clearTimeout(_placeholderTimer);
    _placeholderTimer = setTimeout(() => {
      if (!state.fileLoaded) return;
      detectPlaceholders();
      recalcSummary();
      if (!_editMode) renderCurrentRow();   // вернуть превью строки, снятое при поиске
    }, 300);
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

    BulkPlaceholders.groupByKey(state.placeholders).forEach(group => {
      const current = group.variants.map(ph => state.mapping[ph]).find(Boolean) || '';
      const row = document.createElement('div');
      row.className = 'bm-mapping-row';
      const tag = document.createElement('span');
      tag.className = 'bm-mapping-ph'; tag.textContent = group.label;
      const arrow = document.createElement('span');
      arrow.className = 'bm-mapping-arrow'; arrow.textContent = '→';
      const sel = document.createElement('select');
      sel.className = 'bm-mapping-select';
      sel.innerHTML = `<option value="">— не задано —</option>` +
        state.headers.map(h => `<option value="${escHtml(h)}"${current===h?' selected':''}>${escHtml(h)}</option>`).join('');
      sel.addEventListener('change', () => {
        group.variants.forEach(ph => {
          if (sel.value) state.mapping[ph] = sel.value; else delete state.mapping[ph];
        });
        updateMappingHint();
        recalcSummary();
        schedulePreflight();
        restoreCanvas(); renderCurrentRow();
      });
      row.append(tag, arrow, sel);

      const where = BulkPlaceholders.usageLabel(BulkPlaceholders.groupUsage(group, state.usage || {}));
      if (where) {
        const usage = document.createElement('span');
        usage.className = 'bm-mapping-usage'; usage.textContent = where;
        row.appendChild(usage);
      }
      list.appendChild(row);
    });

    updateMappingHint();
  }

  function updateMappingHint() {
    const hintEl = $('bm-mapping-hint');
    if (!hintEl) return;
    const un = unmappedGroups().length;
    hintEl.textContent = un > 0 ? `${un} не сопоставлено` : '';
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // БЛОК 4: ВЛОЖЕНИЯ
  // ══════════════════════════════════════════════════════════════════════════════
  function initAttachments() {
    const root = $('bm-attachments');
    if (!root) return;
    attachments = BulkAttachments.mount(root, {
      getHeaders: () => state.headers,
      onChange: onAttachmentsChanged,
    });
    $('bm-attach-add-common')?.addEventListener('click', () => attachments.addCommon());
    $('bm-attach-add-individual')?.addEventListener('click', () => attachments.addIndividual());
  }

  // Панель можно растянуть: в широкой форма слева, сводка справа (класс переключается здесь,
  // а не container-запросом: во встроенном браузере приложения они могут не поддерживаться).
  function initWideLayout() {
    const host = $('bm-settings-section')?.parentElement;
    if (!host || typeof ResizeObserver === 'undefined') return;
    // Переключение класса меняет раскладку: делаем это на следующем кадре, иначе
    // браузер сообщит о «ResizeObserver loop».
    new ResizeObserver(entries => {
      const wide = entries[0].contentRect.width >= WIDE_PANEL_PX;
      requestAnimationFrame(() => host.classList.toggle('bm-wide', wide));
    }).observe(host);
  }

  function onAttachmentsChanged() {
    schedulePlaceholderRefresh();   // имя файла может содержать {{поля}}
    schedulePreflight();
  }

  // Проверка вложений до отправки: сервер перебирает все строки и говорит, у кого каких
  // файлов не хватает и какие письма не поместятся в лимит. Ничего не отправляется.
  let _preflightTimer = null;
  let _preflightSeq = 0;

  function schedulePreflight() {
    clearTimeout(_preflightTimer);
    _preflightTimer = setTimeout(runPreflight, 400);
  }

  function renderAttachSummary(opts = {}) {
    const box = $('bm-sum-attach');
    if (!box) return;
    BulkAttachSummary.render(box, state.preflight, { onGoToRow: goToRow, ...opts });
  }

  function goToRow(rowNumber) {
    if (rowNumber < 1 || rowNumber > state.rows.length) return;
    state.currentRow = rowNumber - 1;
    if (state.isOpen) { showRowNav(); renderCurrentRow(); }
  }

  async function runPreflight() {
    clearTimeout(_preflightTimer);
    const seq = ++_preflightSeq;
    const specs = attachments?.getSpecs() || [];
    const box = $('bm-sum-attach');
    if (!state.fileLoaded || !specs.length) {
      state.preflight = null;
      if (box) box.textContent = '';
      updateRowWarnings();
      return null;
    }
    const unfinished = attachments.validate();
    if (unfinished) {
      state.preflight = null;
      if (box) { box.textContent = ''; const hint = document.createElement('div'); hint.className = 'bm-asum-muted'; hint.textContent = `Проверка вложений: ${unfinished.toLowerCase()}`; box.appendChild(hint); }
      updateRowWarnings();
      return null;
    }
    renderAttachSummary({ state: 'loading' });
    try {
      const resp = await fetch('/api/bulk/preflight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: state.rows,
          mapping: state.mapping,
          placeholders: state.placeholders,
          email_column: state.emailColumn,
          skip_no_email: $('bm-skip-no-email')?.checked !== false,
          attachments: specs,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
      if (seq !== _preflightSeq) return state.preflight;   // пока считали, настройки изменились
      state.preflight = data;
      renderAttachSummary();
    } catch (err) {
      if (seq !== _preflightSeq) return state.preflight;
      state.preflight = null;
      renderAttachSummary({ state: 'error', message: `Не удалось проверить вложения: ${err.message}` });
    }
    updateRowWarnings();
    return state.preflight;
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

  // Пока пользователь правит текст на холсте, значения строки не подставляем:
  // правка и сохранение блока должны видеть исходные {{плейсхолдеры}}, иначе
  // значения строки записываются в блок «статичным» текстом.
  let _inlineEditing = false;

  function beginCanvasEdit() {
    _inlineEditing = true;
    clearTimeout(_placeholderTimer);
    if (!state.canvasBackups.length) return;
    // restoreCanvas перезаписывает текстовые узлы — курсор из них уехал бы в начало.
    const sel = window.getSelection();
    const anchor = sel && sel.rangeCount ? sel.anchorNode : null;
    const caretInSubstituted = !!anchor && state.canvasBackups.some(b => b.node === anchor);
    restoreCanvas();
    if (caretInSubstituted && anchor.nodeType === 3) {
      const r = document.createRange();
      r.setStart(anchor, anchor.nodeValue.length);
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
    }
  }

  function endCanvasEdit() {
    if (!_inlineEditing) return;
    _inlineEditing = false;
    if (!state.fileLoaded || _editMode) return;
    detectPlaceholders();
    recalcSummary();
    renderCurrentRow();
  }

  function renderCurrentRow() {
    if (_inlineEditing) return;
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
    const attachProblemRows = new Set(BulkAttachSummary.problemRows(state.preflight));
    let idx = state.currentRow;
    for (let i = 0; i < state.rows.length; i++) {
      idx = (idx + direction + state.rows.length) % state.rows.length;
      const row = state.rows[idx];
      const hasProblem = (skipNoEmail && !row[state.emailColumn]) ||
        state.placeholders.some(ph => !state.mapping[ph] || !row[state.mapping[ph]]) ||
        attachProblemRows.has(idx + 1);
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
      warns.innerHTML = unmappedGroups().map(g => {
        const where = BulkPlaceholders.usageLabel(g.usage);
        return `<div class="bm-warn-box">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/></svg>
          Поле <strong>${escHtml(g.label)}</strong>${where ? ` (${escHtml(where)})` : ''} не сопоставлено — останется пустым
        </div>`;
      }).join('');
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
    warns.push(...BulkAttachSummary.rowProblems(state.preflight, state.currentRow + 1));
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
    setProgressStatus('');
    clearProgressNotes();
    const hint = $('bm-progress-hint');
    if (hint) hint.style.display = 'none';
    state.results = []; state.log = []; state.sending = false; state.cancelled = false;
  }

  // Строка «что происходит сейчас». Пустой текст скрывает её.
  function setProgressStatus(text) {
    const el = $('bm-progress-status');
    if (!el) return;
    el.textContent = text || '';
    el.style.display = text ? 'block' : 'none';
  }

  function addProgressNote(text) {
    const box = $('bm-progress-notes');
    if (!box || !text) return;
    const line = document.createElement('div');
    line.textContent = `⚠ ${text}`;
    box.appendChild(line);
    box.style.display = 'flex';
  }

  function clearProgressNotes() {
    const box = $('bm-progress-notes');
    if (!box) return;
    box.innerHTML = '';
    box.style.display = 'none';
  }

  let _currentJobId = null;
  let _currentEventSource = null;

  // Отложенная отправка: значение поля даты, только если чекбокс включён.
  function getScheduledSendAt() {
    return $('bm-schedule-toggle')?.checked ? ($('bm-send-at')?.value || '') : '';
  }

  // Текст ошибки отложенной отправки или '' если всё в порядке. Те же правила
  // проверяет сервер, но здесь пользователь узнаёт о проблеме до подтверждения.
  function validateSchedule() {
    if (!$('bm-schedule-toggle')?.checked) return '';
    const sendAt = $('bm-send-at')?.value || '';
    if (!sendAt) return 'Укажите дату и время отложенной отправки';
    if (state.channel === 'smtp') return 'Отложенная отправка доступна только для канала Exchange';
    if ($('bm-draft-mode')?.checked) return 'Черновики не отправляются по расписанию: снимите «Черновик» или отложенную отправку';
    const when = new Date(sendAt);
    if (Number.isNaN(when.getTime())) return 'Некорректная дата отложенной отправки';
    if (when <= new Date()) return 'Дата отложенной отправки должна быть в будущем';
    return '';
  }

  async function startSend(rowsToSend) {
    if (state.sending) return;
    state.sending = true; state.cancelled = false;

    const rows        = rowsToSend || state.rows;
    const isDraft     = $('bm-draft-mode')?.checked    || false;
    const stopOnError = $('bm-stop-on-error')?.checked || false;
    const skipNoEmail = $('bm-skip-no-email')?.checked !== false;
    const delay       = parseInt($('bm-delay')?.value) || 0;
    const scheduleError = validateSchedule();
    if (scheduleError) {
      Toast.show(scheduleError, 'warning');
      state.sending = false;
      return;
    }
    const sendAtVal = getScheduledSendAt();

    // Вложения: недозаполненная карточка отправила бы письма без файла молча.
    const attachProblem = attachments?.validate();
    if (attachProblem) {
      Toast.show(attachProblem, 'warning');
      state.sending = false;
      return;
    }

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
    clearProgressNotes();
    setProgressStatus('Запускаю рассылку…');
    if ($('bm-progress-hint')) $('bm-progress-hint').style.display = 'none';

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
          placeholders:  state.placeholders,
          subject:       $('bm-subject')?.value || '',
          from_email:    $('bm-from')?.value    || '',
          channel:       state.channel,
          importance:    document.querySelector('#bm-importance .bm-imp-active')?.dataset.val || 'normal',
          read_receipt:  $('bm-read-receipt')?.checked || false,
          email_column:  state.emailColumn,
          cc:            $('bm-cc')?.value  || '',
          bcc:           $('bm-bcc')?.value || '',
          skip_no_email:    skipNoEmail,
          draft_mode:       isDraft,
          stop_on_error:    stopOnError,
          delay,
          send_at:          sendAtVal || null,
          timezone:         -(new Date().getTimezoneOffset() / 60),
          attachments:      attachments?.getSpecs() || [],
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

      if (evt.type === 'status') {
        setProgressStatus(evt.message);
        return;
      }

      if (evt.type === 'warning') {
        addProgressNote(evt.message);
        return;
      }

      if (evt.type === 'progress') {
        const pct = Math.round(((evt.index + 1) / evt.total) * 100);
        if (fill) fill.style.width = pct + '%';
        appendResultItem(evt.name, evt.email, evt.status, evt.comment, progressDetails(evt));
        state.log.push({
          time: evt.time || '', name: evt.name, email: evt.email, status: evt.status,
          comment: evt.comment || '', messageId: evt.message_id || '',
          serverReply: evt.server_reply || '',
        });
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
    setProgressStatus('');

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
      const smtpRun = state.channel === 'smtp';
      if (okEl)   { okEl.textContent = smtpRun ? `✓ ${sent} принято сервером` : `✓ ${sent} отправлено`; okEl.style.color = ''; }
      const hintEl = $('bm-progress-hint');
      if (hintEl) hintEl.style.display = smtpRun && sent > 0 ? 'block' : 'none';
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
  // Подсказка к строке списка: всё, что известно о письме (комментарий в списке обрезается).
  function progressDetails(evt) {
    return [
      evt.time,
      evt.email,
      evt.comment,
      evt.message_id ? `Message-ID: ${evt.message_id}` : '',
    ].filter(Boolean).join('\n');
  }

  function appendResultItem(name, email, status, comment, details) {
    const list = $('bm-progress-list');
    if (!list) return null;
    const item = document.createElement('div');
    item.className = `bm-progress-item bm-progress-item--${status}`;
    if (details) item.title = details;
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
          placeholders: state.placeholders,
          subject:     $('bm-subject')?.value || '',
          from_email:   $('bm-from')?.value    || '',
          channel:      state.channel,
          importance:   document.querySelector('#bm-importance .bm-imp-active')?.dataset.val || 'normal',
          read_receipt: $('bm-read-receipt')?.checked || false,
        }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.success) throw new Error(data.error || 'Ошибка');
      const idPart = data.message_id ? ` · ${data.message_id}` : '';
      const replyPart = data.server_reply ? ` · ${data.server_reply}` : '';
      Toast.show(state.channel === 'smtp'
        ? `Тестовое письмо принято сервером для ${data.to}${idPart}${replyPart}`
        : `Тестовое письмо отправлено на ${data.to}`, 'success', 8000);
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
    // Журнал рассылки (все строки) приоритетнее state.results: там только ошибки.
    const statusMap = Object.fromEntries(
      [...state.results, ...state.log].map(r => [r.email + '|' + (r.name || ''), r]));

    const q = v => `"${String(v ?? '').replace(/"/g,'""')}"`;

    const extraHeaders = state.headers.filter(h => h !== state.emailColumn && h !== nameCol);
    const headerRow = ['Статус', 'Комментарий', 'Время', 'Message-ID', 'Ответ сервера',
                       nameCol || 'Имя', state.emailColumn || 'Email', ...extraHeaders].join(',');

    const lines = state.rows.map(row => {
      const email = row[state.emailColumn] || '';
      const name  = row[nameCol] || '';
      const key   = email + '|' + name;
      const res   = statusMap[key];
      const status  = res ? (res.status === 'sent' ? 'Отправлено' : res.status === 'error' ? 'Ошибка' : 'Пропущено') : 'Не обработано';
      const comment = res?.error || res?.comment || '';
      const extras  = extraHeaders.map(h => q(row[h] ?? ''));
      return [q(status), q(comment), q(res?.time || ''), q(res?.messageId || ''),
              q(res?.serverReply || ''), q(name), q(email), ...extras].join(',');
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

  // Список колонок под темой и шаблоном имени файла (выпадающий, с поиском):
  // выбор вставляет {{колонка}} в позицию курсора поля.
  const FIELD_CHIPS = [
    { chips: 'bm-subject-chips', input: 'bm-subject' },
  ];

  function buildFieldChips() {
    const cols = state.headers.filter(h => !/mail|почта/i.test(h));
    FIELD_CHIPS.forEach(({ chips, input }) => {
      const container = $(chips);
      if (!container) return;
      BulkFieldPicker.mount(container, {
        getColumns: () => cols,
        onPick: col => insertIntoField(input, `{{${col}}}`),
      });
    });
  }

  function insertIntoField(inputId, text) {
    const field = $(inputId);
    if (field) BulkFieldPicker.insertAtCursor(field, text);   // input-событие обновит список плейсхолдеров
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
    const scheduleError = validateSchedule();
    if (scheduleError) {
      Toast.show(scheduleError, 'warning');
      return;
    }
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

    const unPH = unmappedGroups();
    const attachWarns = state.preflight ? BulkAttachSummary.summarize(state.preflight) : null;
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
      ...unPH.map(g => {
        const where = BulkPlaceholders.usageLabel(g.usage);
        return `<div style="display:flex;gap:8px;padding:8px 10px;background:rgba(249,115,22,.08);
                     border:1px solid rgba(249,115,22,.22);border-radius:7px;font-size:12px;color:#fb923c">
           <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;margin-top:1px"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/></svg>
           <span>Поле <strong style="font-family:monospace">${escHtml(g.label)}</strong>${where ? ` (${escHtml(where)})` : ''} не сопоставлено — в письмах будет пустое значение</span>
         </div>`;
      }),
      ...(attachWarns ? attachWarns.blocks.filter(b => b.tone !== 'ok').map(b => {
        const text = b.lines.filter(l => l.tone !== 'ok').map(l => l.text).join('; ');
        return `<div style="display:flex;gap:8px;padding:8px 10px;background:rgba(249,115,22,.08);
                     border:1px solid rgba(249,115,22,.22);border-radius:7px;font-size:12px;color:#fb923c">
           <span><strong>${escHtml(b.label)}</strong> — ${escHtml(text)}</span></div>`;
      }) : []),
      ...(attachWarns && attachWarns.size && attachWarns.size.tone === 'err' ? [`<div style="display:flex;gap:8px;padding:8px 10px;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);border-radius:7px;font-size:12px;color:#fca5a5"><span>${escHtml(attachWarns.size.text)}</span></div>`] : []),
      ...(badEmail > 0 ? [`<div style="display:flex;gap:8px;padding:8px 10px;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);border-radius:7px;font-size:12px;color:#fca5a5">
           <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;margin-top:1px"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
           ${badEmail} ${_plural(badEmail,'строка','строки','строк')} с некорректным email — будут пропущены
         </div>`] : []),
    ].join('');

    const sendAtLabel = getScheduledSendAt();
    const okText = isDraft ? 'Сохранить черновики'
                 : sendAtLabel ? `Запланировать на ${sendAtLabel.replace('T', ' ')}`
                 : 'Отправить';
    if (okLabel) okLabel.textContent = `${okText} — ${toSend} ${action}`;

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
    initAttachments();
    initWideLayout();
    initCanvasSelectionTracking();

    // Переключатель режима — только в admin (в user канвас всегда в preview)
    if (MODE === 'admin') {
      $('bm-mode-preview')?.addEventListener('click', () => setCanvasMode('preview'));
      $('bm-mode-edit')?.addEventListener('click',    () => setCanvasMode('edit'));
    }
    $('bm-skip-no-email')?.addEventListener('change', () => { recalcSummary(); schedulePreflight(); });
    $('bm-email-col')?.addEventListener('change', e => {
      state.emailColumn = e.target.value;
      updateRowNavInfo();
      recalcSummary();
      schedulePreflight();
    });

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

    // Плейсхолдеры из темы тоже попадают в сопоставление колонок
    $('bm-subject')?.addEventListener('input', schedulePlaceholderRefresh);

    // Важность — клики по кнопкам
    document.querySelectorAll('#bm-importance .bm-imp-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#bm-importance .bm-imp-btn')
          .forEach(b => b.classList.remove('bm-imp-active'));
        btn.classList.add('bm-imp-active');
      });
    });

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

    // Отложенная отправка: кастомный пикер из dateTimePicker.js
    let _bmDtp = null;
    const scheduleTgl = $('bm-schedule-toggle');
    if (scheduleTgl) {
      scheduleTgl.addEventListener('change', () => {
        const wrapper = $('bm-send-at-wrapper');
        if (scheduleTgl.checked) {
          if (wrapper) wrapper.style.display = 'block';
          if (!_bmDtp && typeof initDateTimePicker === 'function') {
            _bmDtp = initDateTimePicker('bm-send-at-wrapper', 'bm-send-at');
          }
        } else {
          if (wrapper) wrapper.style.display = 'none';
          if (_bmDtp) { _bmDtp.clear(); }
        }
      });
    }

    // Навигация строк
    $('bm-row-prev')?.addEventListener('click', () => { if (state.currentRow > 0) { state.currentRow--; renderCurrentRow(); } });
    $('bm-row-next')?.addEventListener('click', () => { if (state.currentRow < state.rows.length-1) { state.currentRow++; renderCurrentRow(); } });

    // Кнопки отправки (сайдбар — если элемент остался) + тулбар
    // Перед окном подтверждения вложения проверяются заново: файлы в папке могли измениться.
    const confirmAndSend = async () => {
      if (!state.rows.length) return;
      await runPreflight();
      _showConfirmModal(() => { resetProgress(); startSend(); });
    };
    $('bm-send-btn')?.addEventListener('click', confirmAndSend);
    document.getElementById('btn-bulk-send')?.addEventListener('click', confirmAndSend);

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

  function loadParsed(filename, data) {
    if (data && data.error) {
      _showFileError(filename, data.error);
      return;
    }
    _showFileParsing(filename);
    _applyParsedData(filename, data);
  }

  return {
    init, getColumns: () => state.headers, detectPlaceholders, recalcSummary, loadParsed,
    refreshRowPreview: () => { if (state.fileLoaded && !_editMode) renderCurrentRow(); },
    beginCanvasEdit,
    endCanvasEdit,
  };
})();

// ── Глобальный объект BulkMail для userToolbar.js и admin-bulk-mail.js ────────
window.BulkMail = {
  getColumns: () => BulkMailPanel.getColumns().filter(h => {
    const lc = h.toLowerCase();
    return !lc.includes('email') && !lc.includes('e-mail') && !lc.includes('почта');
  }),
  refresh: () => {
    BulkMailPanel.detectPlaceholders();
    BulkMailPanel.recalcSummary();
  },
};
