/**
 * admin-bulk-mail.js — Модуль массовой рассылки для АДМИНКИ (прототип)
 *
 * Подключение в index.html:
 *   1. <script src="js/admin-bulk-mail.js"></script>  — после js/main.js
 *   2. <button onclick="AdminBulkMail.open()">Массовая рассылка</button>  — в .action-buttons-group
 *
 * Чтобы убрать — удалить эти две строки. Больше ничего не трогать.
 *
 * Отличие от user-версии:
 *   + Секция «Плейсхолдеры» в панели настроек текстовых блоков
 *   + Ручной ввод названия плейсхолдера без загрузки файла
 *   + Кнопки быстрой вставки когда файл загружен
 */

const AdminBulkMail = (() => {

    // ── Демо-данные ──────────────────────────────────────────────────────────
    const ROWS = [
        { email: 'i.ivanov@rt.ru',  fio: 'Иванов Иван',    dept: 'ИТ',      pos: 'Разработчик', date: '01.03.2026', warn: ['Поле «Город» пустое'] },
        { email: 'a.petrova@rt.ru', fio: 'Петрова Анна',   dept: 'HR',      pos: 'Менеджер',    date: '05.03.2026', warn: [] },
        { email: '',               fio: 'Сидоров Олег',   dept: 'Финансы', pos: 'Аналитик',    date: '07.03.2026', warn: ['Пустой email — строка будет пропущена'] },
        { email: 'm.kozlova@rt.ru', fio: 'Козлова Мария',  dept: 'PR',      pos: 'Специалист',  date: '10.03.2026', warn: ['Поле «Город» пустое'] },
    ];

    const HISTORY = [
        { date: '10.03.2026 14:22', template: 'Плановое обучение', file: 'список_февраль.xlsx', total: 98,  sent: 95,  skipped: 3, errors: 0 },
        { date: '05.03.2026 09:15', template: 'Приглашение',       file: 'hr_список.xlsx',       total: 210, sent: 204, skipped: 4, errors: 2 },
    ];

    let availableColumns = ['ФИО', 'Email', 'Отдел', 'Должность', 'Дата'];
    let curRow = 0;
    let curStep = 1;
    let previewFilter = 'all';
    let previewSearch = '';
    let isSending = false;
    let isPaused = false;
    let sendProgress = 0;
    let sendTimer = null;

    // ── CSS (только уникальные для admin, основные в bulk-mail переиспользуются) ──
    function getCSS() {
        return `
.abm-screen { display:none; flex:1; overflow:hidden; }
.abm-step { color:var(--text-muted,#9ca3af); transition:background .15s; }
.abm-step:hover { background:var(--bg-hover,#334155) !important; }
.abm-step.abm-step-active { color:var(--accent-primary,#f97316); background:rgba(249,115,22,0.1) !important; }
.abm-step.abm-step-done { color:#10b981; }
.abm-step.abm-step-done .abm-step-num { background:#10b981 !important; border-color:#10b981 !important; color:#fff !important; }
.abm-step.abm-step-active .abm-step-num { background:var(--accent-primary,#f97316) !important; border-color:var(--accent-primary,#f97316) !important; color:#fff !important; }
.abm-panel { background:var(--bg-secondary,#1e293b); border:1px solid var(--border-color,#334155); border-radius:8px; overflow:hidden; }
.abm-panel-header { padding:8px 12px; font-size:11px; font-weight:600; color:var(--text-muted,#9ca3af); text-transform:uppercase; letter-spacing:.5px; background:var(--bg-primary,#0f172a); border-bottom:1px solid var(--border-color,#334155); display:flex; align-items:center; justify-content:space-between; }
.abm-label { display:block; font-size:12px; color:var(--text-muted,#9ca3af); margin-bottom:5px; }
.abm-select, .abm-input { width:100%; background:var(--bg-secondary,#1e293b); border:1px solid var(--border-color,#334155); border-radius:6px; color:var(--text-primary,#f9fafb); padding:7px 10px; font-size:13px; outline:none; transition:border-color .15s; }
.abm-select:focus, .abm-input:focus { border-color:var(--accent-primary,#f97316); }
.abm-select option { background:var(--bg-secondary,#1e293b); }
.abm-btn-primary   { padding:6px 14px; border-radius:6px; border:none; font-size:13px; font-weight:500; cursor:pointer; background:var(--accent-primary,#f97316); color:#fff; transition:background .15s; }
.abm-btn-primary:hover   { background:var(--accent-primary-hover,#ea580c); }
.abm-btn-secondary { padding:6px 14px; border-radius:6px; border:none; font-size:13px; font-weight:500; cursor:pointer; background:var(--bg-hover,#334155); color:var(--text-secondary,#e5e7eb); transition:background .15s; }
.abm-btn-secondary:hover { background:#475569; }
.abm-btn-success   { padding:6px 14px; border-radius:6px; border:none; font-size:13px; font-weight:500; cursor:pointer; background:#10b981; color:#fff; transition:background .15s; }
.abm-btn-success:hover   { background:#059669; }
.abm-btn-warning   { padding:6px 14px; border-radius:6px; border:none; font-size:13px; font-weight:500; cursor:pointer; background:#f59e0b; color:#fff; transition:background .15s; }
.abm-btn-warning:hover   { background:#d97706; }
.abm-btn-icon { padding:3px 7px; background:transparent; color:var(--text-muted,#9ca3af); border:1px solid var(--border-color,#334155); border-radius:5px; cursor:pointer; font-size:12px; transition:all .15s; }
.abm-btn-icon:hover { background:var(--bg-hover,#334155); color:var(--text-primary,#f9fafb); }
.abm-drop { border:2px dashed var(--border-color,#334155); border-radius:10px; padding:22px 16px; text-align:center; cursor:pointer; transition:border-color .2s,background .2s; }
.abm-drop:hover,.abm-drop-hover { border-color:var(--accent-primary,#f97316); background:rgba(249,115,22,0.05); }
.abm-badge { display:inline-block; padding:2px 8px; background:var(--bg-hover,#334155); border-radius:4px; font-size:11px; font-weight:600; color:var(--accent-primary,#f97316); margin:0 3px; }
.abm-table { width:100%; border-collapse:collapse; font-size:12px; }
.abm-table th { background:var(--bg-hover,#334155); padding:6px 10px; text-align:left; font-weight:600; color:var(--text-muted,#9ca3af); border-bottom:1px solid var(--border-color,#334155); white-space:nowrap; }
.abm-table td { padding:5px 10px; border-bottom:1px solid var(--bg-primary,#0f172a); color:var(--text-secondary,#e5e7eb); }
.abm-table tr:last-child td { border-bottom:none; }
.abm-map-table { width:100%; border-collapse:collapse; }
.abm-map-table th { padding:8px 12px; text-align:left; font-size:11px; font-weight:600; color:var(--text-muted,#9ca3af); text-transform:uppercase; letter-spacing:.5px; border-bottom:1px solid var(--border-color,#334155); background:var(--bg-primary,#0f172a); white-space:nowrap; }
.abm-map-table td { padding:8px 12px; border-bottom:1px solid var(--bg-primary,#0f172a); vertical-align:middle; }
.abm-ph-item { display:flex; align-items:center; gap:8px; padding:6px 8px; border-radius:6px; cursor:pointer; transition:background .15s; }
.abm-ph-item:hover { background:var(--bg-hover,#334155); }
.abm-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
.abm-dot-green { background:#10b981; } .abm-dot-orange { background:#f59e0b; } .abm-dot-red { background:#dc2626; }
.abm-ph-tag { display:inline-flex; padding:3px 8px; background:rgba(249,115,22,0.1); border:1px solid rgba(249,115,22,0.3); border-radius:4px; font-size:12px; font-weight:500; color:var(--accent-primary,#f97316); font-family:monospace; white-space:nowrap; }
.abm-ph-tag-red { background:rgba(220,38,38,0.1); border-color:rgba(220,38,38,0.4); color:#dc2626; }
.abm-badge-status { display:inline-block; padding:2px 8px; border-radius:10px; font-size:11px; font-weight:500; white-space:nowrap; }
.abm-s-green  { background:rgba(16,185,129,0.15); color:#10b981; }
.abm-s-orange { background:rgba(245,158,11,0.15);  color:#f59e0b; }
.abm-s-red    { background:rgba(220,38,38,0.15);   color:#dc2626; }
.abm-warn-item { font-size:11px; color:#f59e0b; display:flex; align-items:center; gap:4px; padding:2px 0; }
.abm-preview-ph    { background:rgba(249,115,22,0.15); border:1px dashed rgba(249,115,22,0.5); border-radius:3px; padding:0 4px; color:#ea580c; font-weight:500; }
.abm-preview-empty { background:rgba(220,38,38,0.1);  border:1px dashed rgba(220,38,38,0.4);  border-radius:3px; padding:0 4px; color:#dc2626; }
.abm-progress-wrap { background:var(--bg-primary,#0f172a); border-radius:6px; height:8px; overflow:hidden; margin:8px 0; }
.abm-progress-bar  { height:100%; border-radius:6px; transition:width .3s; background:linear-gradient(90deg,#10b981,#34d399); }
.abm-progress-bar.paused { background:linear-gradient(90deg,#f59e0b,#fbbf24); }
.abm-filter-tabs { display:flex; gap:4px; }
.abm-filter-tab { padding:3px 10px; border-radius:5px; border:1px solid var(--border-color,#334155); background:transparent; color:var(--text-muted,#9ca3af); font-size:12px; cursor:pointer; transition:all .15s; }
.abm-filter-tab.active { background:var(--accent-primary,#f97316); border-color:var(--accent-primary,#f97316); color:#fff; }
.abm-search-wrap { position:relative; }
.abm-search-icon { position:absolute; left:8px; top:50%; transform:translateY(-50%); color:var(--text-muted,#9ca3af); font-size:13px; pointer-events:none; }
.abm-history-row { display:flex; align-items:center; gap:12px; padding:10px 14px; border-bottom:1px solid var(--border-color,#334155); font-size:12px; transition:background .15s; }
.abm-history-row:last-child { border-bottom:none; }
.abm-history-row:hover { background:rgba(255,255,255,0.02); }
.abm-test-block { background:rgba(139,92,246,0.08); border:1px solid rgba(139,92,246,0.3); border-radius:8px; padding:10px 12px; }
.abm-test-label { font-size:11px; color:#8b5cf6; font-weight:600; margin-bottom:6px; }
.abm-rate-block { background:rgba(59,130,246,0.06); border:1px solid rgba(59,130,246,0.2); border-radius:8px; padding:10px 12px; }
.abm-rate-label { font-size:11px; color:#3b82f6; font-weight:600; margin-bottom:6px; }

/* Секция плейсхолдеров в настройках блока */
.abm-ph-section { background:rgba(249,115,22,0.04); border:1px solid rgba(249,115,22,0.2); border-radius:8px; padding:12px; margin-top:8px; }
.abm-ph-section-title { font-size:11px; font-weight:600; color:var(--accent-primary,#f97316); text-transform:uppercase; letter-spacing:.5px; margin-bottom:8px; }
.abm-ph-chip { display:inline-flex; padding:3px 9px; border-radius:4px; border:1px solid rgba(249,115,22,0.35); background:rgba(249,115,22,0.1); color:var(--accent-primary,#f97316); font-size:12px; font-family:monospace; cursor:pointer; transition:background .15s; }
.abm-ph-chip:hover { background:rgba(249,115,22,0.22); }
.abm-ph-manual-row { display:flex; gap:6px; margin-top:8px; }
.abm-ph-manual-input { flex:1; padding:6px 10px; border-radius:6px; border:1px solid var(--border-color,#334155); background:var(--bg-secondary,#1e293b); color:var(--text-primary,#f9fafb); font-size:13px; outline:none; transition:border-color .15s; }
.abm-ph-manual-input:focus { border-color:var(--accent-primary,#f97316); }
.abm-ph-insert-btn { padding:6px 12px; border-radius:6px; border:none; background:var(--accent-primary,#f97316); color:#fff; font-size:13px; font-weight:500; cursor:pointer; white-space:nowrap; transition:background .15s; }
.abm-ph-insert-btn:hover { background:var(--accent-primary-hover,#ea580c); }
#abm-toast { transition:opacity .3s; }
`;
    }

    // ── Секция плейсхолдеров для правой панели настроек ──────────────────────
    function createPlaceholderSection(blockId, settingKey) {
        const wrap = document.createElement('div');
        wrap.className = 'abm-ph-section';

        const title = document.createElement('div');
        title.className = 'abm-ph-section-title';
        title.textContent = '{} Плейсхолдеры для рассылки';
        wrap.appendChild(title);

        // Чипы колонок если файл загружен
        if (availableColumns.length > 0) {
            const chipLabel = document.createElement('div');
            chipLabel.style.cssText = 'font-size:11px;color:#3b82f6;margin-bottom:5px';
            chipLabel.textContent = 'Поля из файла:';
            wrap.appendChild(chipLabel);

            const chipWrap = document.createElement('div');
            chipWrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px';
            availableColumns.forEach(col => {
                const chip = document.createElement('button');
                chip.type = 'button';
                chip.className = 'abm-ph-chip';
                chip.textContent = col;
                chip.title = `Вставить {{${col}}}`;
                chip.addEventListener('click', () => insertIntoTextarea(blockId, settingKey, col));
                chipWrap.appendChild(chip);
            });
            wrap.appendChild(chipWrap);
        }

        // Ручной ввод — всегда
        const manualLabel = document.createElement('div');
        manualLabel.style.cssText = 'font-size:11px;color:var(--text-muted,#9ca3af);margin-bottom:5px';
        manualLabel.textContent = availableColumns.length > 0 ? 'Или введите вручную:' : 'Название поля:';
        wrap.appendChild(manualLabel);

        const row = document.createElement('div');
        row.className = 'abm-ph-manual-row';

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'abm-ph-manual-input';
        input.placeholder = 'Например: ФИО';
        input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doInsert(); } });

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'abm-ph-insert-btn';
        btn.textContent = '+ Вставить';
        btn.addEventListener('click', doInsert);

        function doInsert() {
            const name = input.value.trim();
            if (!name) return;
            insertIntoTextarea(blockId, settingKey, name);
            input.value = '';
            input.focus();
        }

        row.appendChild(input);
        row.appendChild(btn);
        wrap.appendChild(row);

        return wrap;
    }

    // Вставляет {{name}} в textarea настроек по data-атрибутам
    function insertIntoTextarea(blockId, settingKey, name) {
        const placeholder = `{{${name}}}`;
        const textarea = document.querySelector(
            `textarea[data-block-id="${blockId}"][data-setting-key="${settingKey}"]`
        );

        if (!textarea) {
            // Fallback — дописываем в конец
            if (typeof AppState !== 'undefined' && typeof updateBlockSetting === 'function') {
                const block = AppState.findBlockById(blockId);
                if (block) {
                    const cur = block.settings[settingKey] || '';
                    updateBlockSetting(blockId, settingKey, cur + placeholder);
                    if (typeof renderSettings === 'function') renderSettings();
                }
            }
            return;
        }

        const start = textarea.selectionStart ?? textarea.value.length;
        const end   = textarea.selectionEnd   ?? textarea.value.length;
        const newVal = textarea.value.slice(0, start) + placeholder + textarea.value.slice(end);

        textarea.value = newVal;
        if (typeof updateBlockSetting === 'function') {
            updateBlockSetting(blockId, settingKey, newVal);
        }
        if (typeof renderCanvas === 'function') renderCanvas();

        const newPos = start + placeholder.length;
        textarea.focus();
        textarea.setSelectionRange(newPos, newPos);
    }

    // ── Патч renderSettings — вешается после инициализации ───────────────────
    function patchRenderSettings() {
        if (typeof renderTextSettings !== 'function') return;

        const _origText = renderTextSettings;
        window.renderTextSettings = function(container, block) {
            _origText(container, block);
            container.appendChild(createPlaceholderSection(block.id, 'content'));
        };

        const _origHead = renderHeadingSettings;
        window.renderHeadingSettings = function(container, block) {
            _origHead(container, block);
            container.appendChild(createPlaceholderSection(block.id, 'text'));
        };
    }

    // ── HTML модалки (аналог bulk-mail.js но с префиксом abm-) ───────────────
    function getHTML() {
        return `
<div id="abm-modal" class="modal" style="display:none;z-index:3000">
  <div class="modal-overlay" onclick="AdminBulkMail.close()"></div>
  <div class="modal-content" style="width:96vw;max-width:1260px;height:90vh;max-height:90vh;display:flex;flex-direction:column">

    <div class="modal-header" style="flex-shrink:0;gap:12px;flex-wrap:wrap;padding:12px 20px">
      <span style="font-size:15px;font-weight:600;white-space:nowrap">📋 Массовая рассылка</span>
      <div style="display:flex;align-items:center;gap:3px;flex:1;justify-content:center;flex-wrap:wrap">
        ${[['1','Данные'],['2','Сопоставление'],['3','Предпросмотр'],['4','Отправка'],['5','История']].map(([n,label]) => `
          <div class="abm-step" id="abm-step-${n}" onclick="AdminBulkMail.goTo(${n})"
               style="display:flex;align-items:center;gap:5px;padding:4px 9px;border-radius:6px;cursor:pointer;font-size:12px">
            <span class="abm-step-num" style="width:19px;height:19px;border-radius:50%;border:1.5px solid currentColor;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;flex-shrink:0">${n}</span>
            <span>${label}</span>
          </div>
          ${parseInt(n) < 5 ? '<span style="color:var(--border-color,#334155);font-size:11px">›</span>' : ''}
        `).join('')}
      </div>
      <button class="modal-close" onclick="AdminBulkMail.close()">×</button>
    </div>

    <div style="flex:1;overflow:hidden;display:flex;flex-direction:column">

      <!-- ШАГ 1 -->
      <div id="abm-screen-1" class="abm-screen" style="overflow-y:auto;padding:28px;align-items:center;justify-content:center">
        <div style="background:var(--bg-secondary,#1e293b);border:1px solid var(--border-color,#334155);border-radius:12px;padding:30px;width:540px;max-width:100%">
          <h3 style="font-size:16px;font-weight:600;margin-bottom:20px">Источник данных</h3>
          <div style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.3);border-radius:8px;padding:12px 14px;display:flex;align-items:center;gap:12px;margin-bottom:20px">
            <span style="font-size:22px">📊</span>
            <div style="flex:1">
              <div style="font-size:13px;font-weight:500;color:#10b981">список_сотрудников_март.xlsx</div>
              <div style="font-size:11px;color:var(--text-muted,#9ca3af)">3 листа · 128 строк · 47 KB</div>
            </div>
            <button class="abm-btn-icon">↺ Заменить</button>
          </div>
          <div style="display:grid;grid-template-columns:1fr 100px;gap:12px;margin-bottom:16px">
            <div><label class="abm-label">Лист</label>
              <select class="abm-select"><option>Март 2026</option><option>Февраль 2026</option></select>
            </div>
            <div><label class="abm-label">Строка заголовков</label>
              <input type="number" class="abm-input" value="1" min="1">
            </div>
          </div>
          <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);border-radius:6px;padding:8px 12px;font-size:12px;color:#f59e0b;margin-bottom:16px">
            ⚠ Обнаружено: 1 пустой email, 1 некорректный email — будут пропущены
          </div>
          <div style="border:1px solid var(--border-color,#334155);border-radius:8px;overflow:hidden;margin-bottom:18px">
            <div style="padding:6px 12px;font-size:11px;color:var(--text-muted,#9ca3af);background:var(--bg-primary,#0f172a);border-bottom:1px solid var(--border-color,#334155);text-transform:uppercase;letter-spacing:.5px">Предпросмотр</div>
            <div style="overflow-x:auto">
              <table class="abm-table">
                <thead><tr><th>#</th><th>ФИО</th><th>Email</th><th>Отдел</th><th>Должность</th><th>Дата</th></tr></thead>
                <tbody>
                  <tr><td>1</td><td>Иванов Иван</td><td>i.ivanov@rt.ru</td><td>ИТ</td><td>Разработчик</td><td>01.03.2026</td></tr>
                  <tr><td>2</td><td>Петрова Анна</td><td>a.petrova@rt.ru</td><td>HR</td><td>Менеджер</td><td>05.03.2026</td></tr>
                  <tr><td>3</td><td>Сидоров Олег</td><td style="color:#dc2626">—</td><td>Финансы</td><td>Аналитик</td><td>07.03.2026</td></tr>
                  <tr><td style="color:var(--text-muted,#9ca3af)" colspan="6">… ещё 125 строк</td></tr>
                </tbody>
              </table>
            </div>
          </div>
          <div class="abm-drop" onclick="this.classList.toggle('abm-drop-hover')">
            <div style="font-size:26px;margin-bottom:8px">📂</div>
            <div style="font-size:13px;font-weight:500;margin-bottom:4px">Перетащите файл или нажмите для выбора</div>
            <div style="font-size:12px;color:var(--text-muted,#9ca3af)"><span class="abm-badge">.xlsx</span><span class="abm-badge">.ods</span></div>
          </div>
          <div style="display:flex;justify-content:flex-end;margin-top:16px">
            <button class="abm-btn-primary" onclick="AdminBulkMail.goTo(2)">Далее →</button>
          </div>
        </div>
      </div>

      <!-- ШАГ 2 -->
      <div id="abm-screen-2" class="abm-screen" style="flex-direction:row;gap:14px;padding:14px;overflow:hidden">
        <div style="width:255px;flex-shrink:0;display:flex;flex-direction:column;gap:10px;overflow-y:auto">
          <div class="abm-panel">
            <div class="abm-panel-header">Источник данных</div>
            <div style="padding:9px 12px">
              ${[['Файл','список_март.xlsx'],['Лист','Март 2026'],['Строк','127'],['Колонок','6']].map(([k,v])=>`
                <div style="display:flex;justify-content:space-between;padding:3px 0;font-size:12px">
                  <span style="color:var(--text-muted,#9ca3af)">${k}</span><span style="font-weight:500;font-size:11px">${v}</span>
                </div>`).join('')}
              <button class="abm-btn-secondary" style="width:100%;margin-top:8px;font-size:12px;padding:5px" onclick="AdminBulkMail.goTo(1)">↺ Изменить</button>
            </div>
          </div>
          <div style="background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.3);border-radius:8px;padding:10px 12px">
            <div style="font-size:11px;color:#3b82f6;font-weight:600;margin-bottom:6px">✉ Колонка email</div>
            <select class="abm-select" style="font-size:12px"><option>Email</option><option>ФИО</option></select>
            <div style="font-size:11px;color:#10b981;margin-top:5px">✓ 124 валидных · 3 пропущено</div>
          </div>
          <div class="abm-panel" style="flex:1;overflow:hidden;display:flex;flex-direction:column;min-height:140px">
            <div class="abm-panel-header">Плейсхолдеры <span style="font-size:11px;font-weight:400">4 из 5</span></div>
            <div style="padding:6px;overflow-y:auto;flex:1">
              ${[['green','ФИО','2×'],['green','Отдел','1×'],['orange','Должность','1×'],['green','Дата','1×'],['red','Город','1×']].map(([c,n,cnt])=>`
                <div class="abm-ph-item">
                  <span class="abm-dot abm-dot-${c}"></span>
                  <span style="flex:1;font-size:12px">${n}</span>
                  <span style="font-size:10px;color:var(--text-muted,#9ca3af);background:var(--bg-hover,#334155);padding:1px 5px;border-radius:10px">${cnt}</span>
                </div>`).join('')}
            </div>
          </div>
        </div>
        <div style="flex:1;overflow-y:auto">
          <div class="abm-panel">
            <div class="abm-panel-header">
              Таблица сопоставления
              <span style="display:flex;gap:5px">
                <span class="abm-badge-status abm-s-green">4 сопоставлено</span>
                <span class="abm-badge-status abm-s-red">1 ошибка</span>
                <button class="abm-btn-icon" style="font-size:11px;padding:2px 7px" onclick="AdminBulkMail.autoMap()">⚡ Авто</button>
              </span>
            </div>
            <table class="abm-map-table">
              <thead><tr><th>Плейсхолдер</th><th>Колонка из файла</th><th>Статус</th><th>Мест</th><th>Пустых</th><th></th></tr></thead>
              <tbody>
                ${[
                  ['{{ФИО}}','ФИО','green','✓ Совпадение','2 места','0',false],
                  ['{{Отдел}}','Отдел','green','✓ Совпадение','1 место','0',false],
                  ['{{Должность}}','Должность','orange','⚠ Частичное','1 место','2',false],
                  ['{{Дата}}','Дата','green','✓ Совпадение','1 место','0',false],
                  ['{{Город}}','— не найдено —','red','✗ Не сопоставлено','1 место','—',true],
                ].map(([ph,col,sc,st,cnt,empty,err])=>`
                  <tr style="${err ? 'background:rgba(220,38,38,0.04)' : ''}">
                    <td><span class="abm-ph-tag${err ? ' abm-ph-tag-red' : ''}">${ph}</span></td>
                    <td><select class="abm-select" style="font-size:12px${err ? ';border-color:rgba(220,38,38,0.4)' : ''}">
                      <option>${col}</option><option>ФИО</option><option>— не выбрано —</option>
                    </select></td>
                    <td><span class="abm-badge-status abm-s-${sc}">${st}</span></td>
                    <td><span style="font-size:11px;color:#3b82f6;cursor:pointer;text-decoration:underline">${cnt}</span></td>
                    <td><span style="font-size:11px;color:${empty === '0' ? 'var(--text-muted,#9ca3af)' : '#f59e0b'}">${empty}</span></td>
                    <td><button class="abm-btn-icon" style="${err ? 'color:#dc2626;border-color:rgba(220,38,38,0.3)' : ''}">✕</button></td>
                  </tr>`).join('')}
              </tbody>
            </table>
            <div style="padding:10px 14px;border-top:1px solid var(--border-color,#334155);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
              <span style="font-size:12px;color:#dc2626">⚠ Несопоставленные плейсхолдеры блокируют отправку</span>
              <div style="display:flex;gap:8px">
                <button class="abm-btn-secondary" style="font-size:12px;padding:5px 12px" onclick="AdminBulkMail.goTo(1)">← Назад</button>
                <button class="abm-btn-primary"   style="font-size:12px;padding:5px 12px" onclick="AdminBulkMail.goTo(3)">Предпросмотр →</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ШАГ 3 -->
      <div id="abm-screen-3" class="abm-screen" style="flex-direction:row;overflow:hidden">
        <div style="width:265px;flex-shrink:0;border-right:1px solid var(--border-color,#334155);display:flex;flex-direction:column;gap:10px;padding:14px;overflow-y:auto">
          <div class="abm-panel">
            <div class="abm-panel-header">Строки</div>
            <div style="padding:10px 12px">
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px">
                <button class="abm-btn-secondary" style="padding:3px 10px;font-size:14px" onclick="AdminBulkMail.changeRow(-1)">‹</button>
                <span style="font-size:13px;flex:1;text-align:center">Строка <strong id="abm-cur-row">1</strong> из <strong id="abm-total-rows">4</strong></span>
                <button class="abm-btn-secondary" style="padding:3px 10px;font-size:14px" onclick="AdminBulkMail.changeRow(1)">›</button>
              </div>
              <div class="abm-search-wrap" style="margin-bottom:8px">
                <span class="abm-search-icon">🔍</span>
                <input class="abm-input" id="abm-preview-search" placeholder="Поиск..." style="font-size:12px;padding:5px 8px 5px 26px" oninput="AdminBulkMail.searchRows(this.value)">
              </div>
              <div class="abm-filter-tabs">
                <button class="abm-filter-tab active" onclick="AdminBulkMail.setFilter('all',this)">Все</button>
                <button class="abm-filter-tab" onclick="AdminBulkMail.setFilter('problems',this)">⚠ Проблемные</button>
              </div>
            </div>
          </div>
          <div class="abm-panel">
            <div class="abm-panel-header">Текущая строка</div>
            <div style="padding:10px 12px">
              <div style="font-size:11px;color:var(--text-muted,#9ca3af);margin-bottom:3px">Email</div>
              <div id="abm-preview-email" style="font-size:13px;font-weight:500;color:#3b82f6;word-break:break-all;margin-bottom:6px">i.ivanov@rt.ru</div>
              <div id="abm-preview-warns"></div>
            </div>
          </div>
          <div class="abm-test-block">
            <div class="abm-test-label">🧪 Тестовая отправка</div>
            <div style="font-size:11px;color:var(--text-muted,#9ca3af);margin-bottom:8px">Отправить письмо только себе</div>
            <input class="abm-input" id="abm-test-email" placeholder="ваш@email.ru" style="font-size:12px;padding:5px 8px;margin-bottom:6px">
            <button class="abm-btn-secondary" style="width:100%;font-size:12px;padding:5px" onclick="AdminBulkMail.sendTest()">Отправить тест</button>
            <div id="abm-test-result" style="font-size:11px;margin-top:5px;display:none"></div>
          </div>
          <div class="abm-rate-block">
            <div class="abm-rate-label">⚡ Лимит отправки</div>
            <div style="display:flex;align-items:center;gap:8px">
              <input type="number" class="abm-input" id="abm-rate-limit" value="10" min="1" max="60" style="font-size:12px;padding:5px 8px;width:60px">
              <span style="font-size:12px;color:var(--text-muted,#9ca3af)">писем / мин</span>
            </div>
          </div>
          <div class="abm-panel">
            <div class="abm-panel-header">Сводка</div>
            <div style="padding:9px 12px">
              ${[['Всего','127',''],['К отправке','124','#10b981'],['Пропустить','3','#f59e0b']].map(([l,v,c])=>`
                <div style="display:flex;justify-content:space-between;padding:3px 0;font-size:12px">
                  <span style="color:var(--text-muted,#9ca3af)">${l}</span>
                  <strong${c ? ` style="color:${c}"` : ''}>${v}</strong>
                </div>`).join('')}
            </div>
          </div>
          <button class="abm-btn-success" style="width:100%;padding:9px;font-size:13px" onclick="AdminBulkMail.openSendConfirm()">✉ Запустить рассылку</button>
          <button class="abm-btn-secondary" style="width:100%;font-size:12px;padding:5px" onclick="AdminBulkMail.goTo(2)">← Назад</button>
        </div>
        <div style="flex:1;display:flex;flex-direction:column;overflow:hidden">
          <div style="background:var(--bg-secondary,#1e293b);border-bottom:1px solid var(--border-color,#334155);padding:8px 14px;display:flex;align-items:center;gap:10px;flex-shrink:0">
            <span style="font-size:12px;color:var(--text-muted,#9ca3af)">Строка <strong id="abm-nav-row" style="color:var(--text-primary,#f9fafb)">1</strong>: <strong id="abm-nav-email" style="color:#3b82f6">i.ivanov@rt.ru</strong></span>
            <div style="flex:1"></div>
            <span class="abm-badge-status abm-s-orange">1 поле не сопоставлено</span>
          </div>
          <div style="flex:1;overflow-y:auto;padding:20px;background:var(--bg-primary,#0f172a)">
            <div id="abm-preview-content" style="background:#fff;border-radius:6px;padding:28px;max-width:600px;margin:0 auto;color:#333;font-size:14px;line-height:1.7;box-shadow:0 10px 20px rgba(0,0,0,0.4)"></div>
          </div>
        </div>
      </div>

      <!-- ШАГ 4 -->
      <div id="abm-screen-4" class="abm-screen" style="overflow-y:auto;padding:20px;flex-direction:column;align-items:center;gap:14px">
        <div style="width:100%;max-width:820px">
          <div class="abm-panel" style="margin-bottom:14px">
            <div class="abm-panel-header">Ход отправки <span id="abm-sending-status" style="font-size:12px;font-weight:400;color:#10b981">Ожидание...</span></div>
            <div style="padding:14px 16px">
              <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:5px">
                <span id="abm-progress-label" style="color:var(--text-muted,#9ca3af)">0 из 124</span>
                <span id="abm-progress-pct" style="font-weight:600">0%</span>
              </div>
              <div class="abm-progress-wrap"><div class="abm-progress-bar" id="abm-progress-bar" style="width:0%"></div></div>
              <div style="display:flex;gap:8px;margin-top:10px">
                <button class="abm-btn-warning" id="abm-btn-pause" style="font-size:12px;padding:5px 12px" onclick="AdminBulkMail.togglePause()">⏸ Пауза</button>
                <button class="abm-btn-secondary" style="font-size:12px;padding:5px 12px" onclick="AdminBulkMail.cancelSend()">✕ Отменить</button>
              </div>
            </div>
          </div>
          <div class="abm-panel">
            <div style="padding:16px 20px;border-bottom:1px solid var(--border-color,#334155);display:flex;align-items:center;gap:14px;flex-wrap:wrap">
              <span id="abm-report-icon" style="font-size:24px">⏳</span>
              <div>
                <div id="abm-report-title" style="font-size:15px;font-weight:600">Ожидание запуска...</div>
                <div id="abm-report-subtitle" style="font-size:12px;color:var(--text-muted,#9ca3af)">Шаблон из конструктора</div>
              </div>
              <div id="abm-report-actions" style="margin-left:auto;display:none;gap:8px">
                <button class="abm-btn-secondary" style="font-size:12px">⬇ Экспорт CSV</button>
                <button class="abm-btn-secondary" style="font-size:12px" onclick="AdminBulkMail.retryErrors()">↺ Повторить ошибки</button>
                <button class="abm-btn-secondary" style="font-size:12px" onclick="AdminBulkMail.goTo(1)">Новая рассылка</button>
              </div>
            </div>
            <div style="display:grid;grid-template-columns:repeat(4,1fr);border-bottom:1px solid var(--border-color,#334155)">
              ${[['abm-stat-total','—','Всего',''],['abm-stat-sent','—','Отправлено','#10b981'],['abm-stat-skipped','—','Пропущено','#f59e0b'],['abm-stat-errors','—','Ошибок','#dc2626']].map(([id,n,l,c])=>`
                <div style="padding:14px;text-align:center;border-right:1px solid var(--border-color,#334155)">
                  <div id="${id}" style="font-size:24px;font-weight:700${c?';color:'+c:''}">${n}</div>
                  <div style="font-size:11px;color:var(--text-muted,#9ca3af)">${l}</div>
                </div>`).join('')}
            </div>
            <div style="overflow-x:auto">
              <table class="abm-table" style="width:100%">
                <thead><tr><th>#</th><th>ФИО</th><th>Email</th><th>Статус</th><th>Комментарий</th></tr></thead>
                <tbody id="abm-report-tbody">
                  <tr><td colspan="5" style="text-align:center;color:var(--text-muted,#9ca3af);padding:20px">Запустите рассылку чтобы увидеть результаты</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <!-- ШАГ 5 -->
      <div id="abm-screen-5" class="abm-screen" style="overflow-y:auto;padding:20px;flex-direction:column;align-items:center">
        <div style="width:100%;max-width:820px">
          <div class="abm-panel">
            <div class="abm-panel-header">История запусков <span style="font-size:11px;font-weight:400">${HISTORY.length} записей</span></div>
            <div>
              ${HISTORY.map(h=>`
                <div class="abm-history-row">
                  <div style="flex:1">
                    <div style="font-size:13px;font-weight:500">${h.template}</div>
                    <div style="font-size:11px;color:var(--text-muted,#9ca3af);margin-top:2px">${h.date} · ${h.file}</div>
                  </div>
                  <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
                    <span style="font-size:12px;color:var(--text-muted,#9ca3af)">Всего: <strong style="color:var(--text-primary,#f9fafb)">${h.total}</strong></span>
                    <span class="abm-badge-status abm-s-green">✓ ${h.sent}</span>
                    ${h.skipped?`<span class="abm-badge-status abm-s-orange">⊘ ${h.skipped}</span>`:''}
                    ${h.errors?`<span class="abm-badge-status abm-s-red">✗ ${h.errors}</span>`:''}
                    <button class="abm-btn-icon" style="font-size:11px;padding:2px 8px">⬇ CSV</button>
                  </div>
                </div>`).join('')}
            </div>
          </div>
        </div>
      </div>

    </div>
  </div>
</div>

<!-- Подтверждение -->
<div id="abm-confirm-modal" class="modal" style="display:none;z-index:3100">
  <div class="modal-overlay" onclick="AdminBulkMail.closeSendConfirm()"></div>
  <div class="modal-content modal-small">
    <div class="modal-header"><h2>Запустить рассылку</h2><button class="modal-close" onclick="AdminBulkMail.closeSendConfirm()">×</button></div>
    <div class="modal-body">
      <p style="font-size:13px;line-height:1.6;margin-bottom:12px">Будет отправлено <strong style="color:#10b981">124 письма</strong>. 3 строки пропущены.</p>
      <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.3);border-radius:8px;padding:10px 14px;font-size:12px;color:#f59e0b">⚠ Поле «Город» не сопоставлено — останется пустым</div>
    </div>
    <div class="modal-footer">
      <button class="abm-btn-secondary" onclick="AdminBulkMail.closeSendConfirm()">Отмена</button>
      <button class="abm-btn-success"   onclick="AdminBulkMail.startSend()">✉ Отправить 124 письма</button>
    </div>
  </div>
</div>

<div id="abm-toast" style="display:none;position:fixed;bottom:24px;right:24px;background:#1e293b;border:1px solid #334155;border-radius:8px;padding:12px 18px;font-size:13px;color:#f9fafb;z-index:4000;box-shadow:0 8px 24px rgba(0,0,0,0.4);max-width:320px"></div>
`;
    }

    // ── Логика (аналогична bulk-mail.js) ─────────────────────────────────────
    function getFilteredRows() {
        let rows = [...ROWS];
        if (previewFilter === 'problems') rows = rows.filter(r => !r.email || r.warn.length > 0);
        if (previewSearch) {
            const q = previewSearch.toLowerCase();
            rows = rows.filter(r => r.fio.toLowerCase().includes(q) || r.email.toLowerCase().includes(q));
        }
        return rows;
    }

    function updatePreview() {
        const rows = getFilteredRows();
        const total = rows.length;
        const idx = Math.min(curRow, Math.max(0, total - 1));
        const r = rows[idx];
        const el = id => document.getElementById(id);

        if (el('abm-total-rows')) el('abm-total-rows').textContent = total;
        if (!r) { const c = el('abm-preview-content'); if (c) c.innerHTML = '<p style="color:#9ca3af;text-align:center;padding:24px">Нет строк</p>'; return; }

        [['abm-cur-row',idx+1],['abm-nav-row',idx+1]].forEach(([id,v])=>{ const e=el(id); if(e) e.textContent=v; });
        [['abm-nav-email',r.email||'—'],['abm-preview-email',r.email||'—']].forEach(([id,v])=>{ const e=el(id); if(e) e.textContent=v; });

        const w = el('abm-preview-warns');
        if (w) w.innerHTML = r.warn.map(w=>`<div class="abm-warn-item">⚠ ${TextSanitizer.escapeHTML(w)}</div>`).join('');

        const cityEmpty = r.warn.some(w=>w.includes('Город'));
        const c = el('abm-preview-content');
        if (c) c.innerHTML = `
            <h3 style="color:#111;margin-bottom:12px;font-size:16px">Уважаемый(ая) <span class="abm-preview-ph">${TextSanitizer.escapeHTML(r.fio)}</span>!</h3>
            <p style="margin-bottom:10px">Отдел: <span class="abm-preview-ph">${TextSanitizer.escapeHTML(r.dept)}</span> · Должность: <span class="abm-preview-ph">${TextSanitizer.escapeHTML(r.pos)}</span></p>
            <p style="margin-bottom:10px">Дата: <span class="abm-preview-ph">${TextSanitizer.escapeHTML(r.date)}</span></p>
            <p style="margin-bottom:10px">Место: ${cityEmpty ? '<span class="abm-preview-empty">[Город — не сопоставлено]</span>' : '<span class="abm-preview-ph">Москва</span>'}.</p>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0">
            <p style="color:#666;font-size:13px">С уважением,<br><strong>Департамент управления знаниями</strong></p>`;
    }

    function goTo(n) {
        curStep = parseInt(n);
        for (let i = 1; i <= 5; i++) { const s = document.getElementById(`abm-screen-${i}`); if (s) s.style.display = 'none'; }
        const screen = document.getElementById(`abm-screen-${n}`);
        if (screen) screen.style.display = 'flex';
        for (let i = 1; i <= 5; i++) {
            const e = document.getElementById(`abm-step-${i}`); if (!e) continue;
            e.classList.remove('abm-step-active','abm-step-done');
            if (i < n) e.classList.add('abm-step-done');
            if (i === n) e.classList.add('abm-step-active');
        }
    }

    function changeRow(dir) { curRow = Math.max(0, Math.min(getFilteredRows().length-1, curRow+dir)); updatePreview(); }
    function setFilter(f, btn) { previewFilter=f; curRow=0; document.querySelectorAll('.abm-filter-tab').forEach(t=>t.classList.remove('active')); if(btn) btn.classList.add('active'); updatePreview(); }
    function searchRows(val) { previewSearch=val; curRow=0; updatePreview(); }
    function autoMap() { showToast('⚡ Автосопоставление выполнено — 4 из 5 полей'); }

    function sendTest() {
        const emailEl = document.getElementById('abm-test-email');
        const resultEl = document.getElementById('abm-test-result');
        const email = emailEl ? emailEl.value.trim() : '';
        if (!email || !email.includes('@')) { if(resultEl){resultEl.style.display='block';resultEl.style.color='#dc2626';resultEl.textContent='✗ Укажите email';} return; }
        if(resultEl){resultEl.style.display='block';resultEl.style.color='#f59e0b';resultEl.textContent='⏳ Отправка...';}
        setTimeout(()=>{ if(resultEl){resultEl.style.color='#10b981';resultEl.textContent=`✓ Отправлено на ${email}`;} showToast(`🧪 Тест отправлен на ${email}`); }, 1200);
    }

    function startSend() {
        closeSendConfirm(); goTo(4);
        isSending=true; isPaused=false; sendProgress=0;
        const total=124;
        const rate = parseInt(document.getElementById('abm-rate-limit')?.value)||10;
        const intervalMs = Math.max(50, Math.round(60000/rate/8));
        const el = id => document.getElementById(id);
        if(el('abm-sending-status')){el('abm-sending-status').textContent='В процессе...';el('abm-sending-status').style.color='#10b981';}
        setStats(total,0,0,0);
        const tbody=el('abm-report-tbody'); if(tbody) tbody.innerHTML='<tr><td colspan="5" style="text-align:center;color:var(--text-muted,#9ca3af);padding:16px">⏳ Идёт отправка...</td></tr>';
        sendTimer = setInterval(()=>{
            if(isPaused) return;
            sendProgress=Math.min(sendProgress+1,total);
            const pct=Math.round(sendProgress/total*100);
            if(el('abm-progress-bar')) el('abm-progress-bar').style.width=pct+'%';
            if(el('abm-progress-label')) el('abm-progress-label').textContent=`${sendProgress} из ${total}`;
            if(el('abm-progress-pct')) el('abm-progress-pct').textContent=pct+'%';
            setStats(total,sendProgress,3,sendProgress>110?2:0);
            if(sendProgress>=total){clearInterval(sendTimer);isSending=false;finishSend(total);}
        }, intervalMs);
    }

    function finishSend(total) {
        const el = id => document.getElementById(id);
        if(el('abm-report-icon')) el('abm-report-icon').textContent='✅';
        if(el('abm-report-title')) el('abm-report-title').textContent='Рассылка завершена';
        if(el('abm-report-actions')) el('abm-report-actions').style.display='flex';
        if(el('abm-sending-status')){el('abm-sending-status').textContent='Завершено';el('abm-sending-status').style.color='#10b981';}
        setStats(total,121,3,2);
        const tbody=el('abm-report-tbody');
        if(tbody) tbody.innerHTML=`
            <tr><td>1</td><td>Иванов Иван</td><td>i.ivanov@rt.ru</td><td><span class="abm-badge-status abm-s-green">✓ Отправлено</span></td><td style="font-size:12px;color:var(--text-muted,#9ca3af)">—</td></tr>
            <tr><td>3</td><td>Сидоров Олег</td><td>—</td><td><span class="abm-badge-status abm-s-orange">⊘ Пропущено</span></td><td style="font-size:12px;color:#f59e0b">Пустой email</td></tr>
            <tr><td>6</td><td>Попова Елена</td><td>e.popova@rt.ru</td><td><span class="abm-badge-status abm-s-red">✗ Ошибка</span></td><td style="font-size:12px;color:#dc2626">Ошибка подключения</td></tr>
            <tr><td colspan="5" style="color:var(--text-muted,#9ca3af);font-size:12px;padding:8px 10px">… ещё 119 строк отправлено успешно</td></tr>`;
        showToast('✅ Рассылка завершена: 121 письмо отправлено');
    }

    function setStats(total,sent,skipped,errors) {
        [['abm-stat-total',total],['abm-stat-sent',sent],['abm-stat-skipped',skipped],['abm-stat-errors',errors]].forEach(([id,v])=>{
            const e=document.getElementById(id); if(e) e.textContent=v;
        });
    }

    function togglePause() {
        isPaused=!isPaused;
        const btn=document.getElementById('abm-btn-pause');
        const bar=document.getElementById('abm-progress-bar');
        const st=document.getElementById('abm-sending-status');
        if(btn) btn.textContent=isPaused?'▶ Продолжить':'⏸ Пауза';
        if(bar) bar.classList.toggle('paused',isPaused);
        if(st){st.textContent=isPaused?'На паузе':'В процессе...';st.style.color=isPaused?'#f59e0b':'#10b981';}
        showToast(isPaused?'⏸ Пауза':'▶ Продолжено');
    }

    function cancelSend() {
        if(!confirm('Отменить рассылку?')) return;
        clearInterval(sendTimer); isSending=false;
        const el=id=>document.getElementById(id);
        if(el('abm-report-icon')) el('abm-report-icon').textContent='🚫';
        if(el('abm-report-title')) el('abm-report-title').textContent='Рассылка отменена';
        showToast('🚫 Рассылка отменена');
    }

    function retryErrors() { showToast('↺ Повтор для 2 строк...'); setTimeout(()=>showToast('✅ Повторная отправка завершена'),2000); }

    function showToast(msg, duration=3000) {
        const t=document.getElementById('abm-toast'); if(!t) return;
        t.textContent=msg; t.style.display='block'; t.style.opacity='1';
        clearTimeout(t._timer);
        t._timer=setTimeout(()=>{t.style.opacity='0';setTimeout(()=>{t.style.display='none';},300);},duration);
    }

    function open() {
        const modal=document.getElementById('abm-modal');
        if(modal){modal.style.display='flex';goTo(1);}
    }

    function close() {
        if(isSending && !confirm('Идёт рассылка. Всё равно закрыть?')) return;
        const modal=document.getElementById('abm-modal');
        if(modal) modal.style.display='none';
    }

    function openSendConfirm()  { const m=document.getElementById('abm-confirm-modal'); if(m) m.style.display='flex'; }
    function closeSendConfirm() { const m=document.getElementById('abm-confirm-modal'); if(m) m.style.display='none'; }

    function getColumns() { return availableColumns; }

    // ── Инициализация ─────────────────────────────────────────────────────────
    function init() {
        const style=document.createElement('style');
        style.textContent=getCSS();
        document.head.appendChild(style);

        const div=document.createElement('div');
        div.innerHTML=getHTML();
        document.body.appendChild(div);

        updatePreview();
        patchRenderSettings();
    }

    document.addEventListener('DOMContentLoaded', init);

    return { open, close, goTo, changeRow, setFilter, searchRows, autoMap, sendTest, startSend, togglePause, cancelSend, retryErrors, openSendConfirm, closeSendConfirm, getColumns };

})();