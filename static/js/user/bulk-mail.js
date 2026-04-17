/**
 * bulk-mail.js — Модуль массовой рассылки (прототип)
 *
 * Подключение в index-user.html:
 *   1. <script src="js/user/bulk-mail.js"></script>  — в конце списка скриптов
 *   2. <button onclick="BulkMail.open()">Массовая рассылка</button>  — в .editor-actions
 *
 * Чтобы убрать — удалить эти две строки. Больше ничего не трогать.
 */

const BulkMail = (() => {

    // ── Демо-данные ──────────────────────────────────────────────────────────
    const ROWS = [
        { email: 'i.ivanov@rt.ru',  fio: 'Иванов Иван',    dept: 'ИТ',      pos: 'Разработчик', date: '01.03.2026', warn: ['Поле «Город» пустое'] },
        { email: 'a.petrova@rt.ru', fio: 'Петрова Анна',   dept: 'HR',      pos: 'Менеджер',    date: '05.03.2026', warn: [] },
        { email: '',               fio: 'Сидоров Олег',   dept: 'Финансы', pos: 'Аналитик',    date: '07.03.2026', warn: ['Пустой email — строка будет пропущена'] },
        { email: 'm.kozlova@rt.ru', fio: 'Козлова Мария',  dept: 'PR',      pos: 'Специалист',  date: '10.03.2026', warn: ['Поле «Город» пустое'] },
        { email: 'n.novikov@rt.ru', fio: 'Новиков Николай',dept: 'ИТ',      pos: 'Тестировщик', date: '12.03.2026', warn: [] },
        { email: 'bad-email',       fio: 'Попов Сергей',   dept: 'Продажи', pos: 'Менеджер',    date: '14.03.2026', warn: ['Некорректный email'] },
    ];

    const HISTORY = [
        { date: '10.03.2026 14:22', template: 'Плановое обучение', file: 'список_февраль.xlsx', total: 98,  sent: 95,  skipped: 3, errors: 0 },
        { date: '05.03.2026 09:15', template: 'Приглашение',       file: 'hr_список.xlsx',       total: 210, sent: 204, skipped: 4, errors: 2 },
        { date: '28.02.2026 16:40', template: 'Напоминание',        file: 'все_сотрудники.xlsx',  total: 412, sent: 408, skipped: 2, errors: 2 },
    ];

    // Доступные колонки (заполняются при загрузке файла)
    let availableColumns = ['ФИО', 'Email', 'Отдел', 'Должность', 'Дата'];

    let curRow = 0;
    let curStep = 1;
    let previewFilter = 'all';
    let previewSearch = '';
    let isSending = false;
    let isPaused = false;
    let sendProgress = 0;
    let sendTimer = null;

    // ── CSS ───────────────────────────────────────────────────────────────────
    function getCSS() {
        return `
.bm-screen { display:none; flex:1; overflow:hidden; }
.bm-step { color:var(--text-muted,#9ca3af); transition:background .15s; }
.bm-step:hover { background:var(--bg-hover,#334155) !important; }
.bm-step.bm-step-active { color:var(--accent-primary,#f97316); background:rgba(249,115,22,0.1) !important; }
.bm-step.bm-step-done { color:#10b981; }
.bm-step.bm-step-done .bm-step-num { background:#10b981 !important; border-color:#10b981 !important; color:#fff !important; }
.bm-step.bm-step-active .bm-step-num { background:var(--accent-primary,#f97316) !important; border-color:var(--accent-primary,#f97316) !important; color:#fff !important; }
.bm-panel { background:var(--bg-secondary,#1e293b); border:1px solid var(--border-color,#334155); border-radius:8px; overflow:hidden; }
.bm-panel-header { padding:8px 12px; font-size:11px; font-weight:600; color:var(--text-muted,#9ca3af); text-transform:uppercase; letter-spacing:.5px; background:var(--bg-primary,#0f172a); border-bottom:1px solid var(--border-color,#334155); display:flex; align-items:center; justify-content:space-between; }
.bm-label { display:block; font-size:12px; color:var(--text-muted,#9ca3af); margin-bottom:5px; }
.bm-select, .bm-input { width:100%; background:var(--bg-secondary,#1e293b); border:1px solid var(--border-color,#334155); border-radius:6px; color:var(--text-primary,#f9fafb); padding:7px 10px; font-size:13px; outline:none; transition:border-color .15s; }
.bm-select:focus, .bm-input:focus { border-color:var(--accent-primary,#f97316); }
.bm-select option { background:var(--bg-secondary,#1e293b); }
.bm-btn-primary   { padding:6px 14px; border-radius:6px; border:none; font-size:13px; font-weight:500; cursor:pointer; background:var(--accent-primary,#f97316); color:#fff; transition:background .15s; }
.bm-btn-primary:hover   { background:var(--accent-primary-hover,#ea580c); }
.bm-btn-secondary { padding:6px 14px; border-radius:6px; border:none; font-size:13px; font-weight:500; cursor:pointer; background:var(--bg-hover,#334155); color:var(--text-secondary,#e5e7eb); transition:background .15s; }
.bm-btn-secondary:hover { background:#475569; }
.bm-btn-success   { padding:6px 14px; border-radius:6px; border:none; font-size:13px; font-weight:500; cursor:pointer; background:#10b981; color:#fff; transition:background .15s; }
.bm-btn-success:hover   { background:#059669; }
.bm-btn-warning   { padding:6px 14px; border-radius:6px; border:none; font-size:13px; font-weight:500; cursor:pointer; background:#f59e0b; color:#fff; transition:background .15s; }
.bm-btn-warning:hover   { background:#d97706; }
.bm-btn-icon { padding:3px 7px; background:transparent; color:var(--text-muted,#9ca3af); border:1px solid var(--border-color,#334155); border-radius:5px; cursor:pointer; font-size:12px; transition:all .15s; }
.bm-btn-icon:hover { background:var(--bg-hover,#334155); color:var(--text-primary,#f9fafb); }
.bm-drop { border:2px dashed var(--border-color,#334155); border-radius:10px; padding:22px 16px; text-align:center; cursor:pointer; transition:border-color .2s,background .2s; }
.bm-drop:hover,.bm-drop-hover { border-color:var(--accent-primary,#f97316); background:rgba(249,115,22,0.05); }
.bm-badge { display:inline-block; padding:2px 8px; background:var(--bg-hover,#334155); border-radius:4px; font-size:11px; font-weight:600; color:var(--accent-primary,#f97316); margin:0 3px; }
.bm-table { width:100%; border-collapse:collapse; font-size:12px; }
.bm-table th { background:var(--bg-hover,#334155); padding:6px 10px; text-align:left; font-weight:600; color:var(--text-muted,#9ca3af); border-bottom:1px solid var(--border-color,#334155); white-space:nowrap; }
.bm-table td { padding:5px 10px; border-bottom:1px solid var(--bg-primary,#0f172a); color:var(--text-secondary,#e5e7eb); }
.bm-table tr:last-child td { border-bottom:none; }
.bm-table tr:hover td { background:rgba(255,255,255,0.02); }
.bm-map-table { width:100%; border-collapse:collapse; }
.bm-map-table th { padding:8px 12px; text-align:left; font-size:11px; font-weight:600; color:var(--text-muted,#9ca3af); text-transform:uppercase; letter-spacing:.5px; border-bottom:1px solid var(--border-color,#334155); background:var(--bg-primary,#0f172a); white-space:nowrap; }
.bm-map-table td { padding:8px 12px; border-bottom:1px solid var(--bg-primary,#0f172a); vertical-align:middle; }
.bm-map-table tr:last-child td { border-bottom:none; }
.bm-map-table tr:hover td { background:rgba(255,255,255,0.015); }
.bm-ph-item { display:flex; align-items:center; gap:8px; padding:6px 8px; border-radius:6px; cursor:pointer; transition:background .15s; }
.bm-ph-item:hover { background:var(--bg-hover,#334155); }
.bm-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
.bm-dot-green  { background:#10b981; }
.bm-dot-orange { background:#f59e0b; }
.bm-dot-red    { background:#dc2626; }
.bm-dot-blue   { background:#3b82f6; }
.bm-ph-tag { display:inline-flex; padding:3px 8px; background:rgba(249,115,22,0.1); border:1px solid rgba(249,115,22,0.3); border-radius:4px; font-size:12px; font-weight:500; color:var(--accent-primary,#f97316); font-family:monospace; white-space:nowrap; }
.bm-ph-tag-red { background:rgba(220,38,38,0.1); border-color:rgba(220,38,38,0.4); color:#dc2626; }
.bm-badge-status { display:inline-block; padding:2px 8px; border-radius:10px; font-size:11px; font-weight:500; white-space:nowrap; }
.bm-s-green  { background:rgba(16,185,129,0.15); color:#10b981; }
.bm-s-orange { background:rgba(245,158,11,0.15);  color:#f59e0b; }
.bm-s-red    { background:rgba(220,38,38,0.15);   color:#dc2626; }
.bm-s-blue   { background:rgba(59,130,246,0.15);  color:#3b82f6; }
.bm-warn-item { font-size:11px; color:#f59e0b; display:flex; align-items:center; gap:4px; padding:2px 0; }
.bm-preview-ph    { background:rgba(249,115,22,0.15); border:1px dashed rgba(249,115,22,0.5); border-radius:3px; padding:0 4px; color:#ea580c; font-weight:500; }
.bm-preview-empty { background:rgba(220,38,38,0.1);  border:1px dashed rgba(220,38,38,0.4);  border-radius:3px; padding:0 4px; color:#dc2626; }
.bm-progress-wrap { background:var(--bg-primary,#0f172a); border-radius:6px; height:8px; overflow:hidden; margin:8px 0; }
.bm-progress-bar  { height:100%; border-radius:6px; transition:width .3s; background:linear-gradient(90deg,#10b981,#34d399); }
.bm-progress-bar.paused { background:linear-gradient(90deg,#f59e0b,#fbbf24); }
.bm-filter-tabs { display:flex; gap:4px; }
.bm-filter-tab { padding:3px 10px; border-radius:5px; border:1px solid var(--border-color,#334155); background:transparent; color:var(--text-muted,#9ca3af); font-size:12px; cursor:pointer; transition:all .15s; }
.bm-filter-tab.active { background:var(--accent-primary,#f97316); border-color:var(--accent-primary,#f97316); color:#fff; }
.bm-search-wrap { position:relative; }
.bm-search-icon { position:absolute; left:8px; top:50%; transform:translateY(-50%); color:var(--text-muted,#9ca3af); font-size:13px; pointer-events:none; }
.bm-history-row { display:flex; align-items:center; gap:12px; padding:10px 14px; border-bottom:1px solid var(--border-color,#334155); font-size:12px; transition:background .15s; }
.bm-history-row:last-child { border-bottom:none; }
.bm-history-row:hover { background:rgba(255,255,255,0.02); }
.bm-test-block { background:rgba(139,92,246,0.08); border:1px solid rgba(139,92,246,0.3); border-radius:8px; padding:10px 12px; }
.bm-test-label { font-size:11px; color:#8b5cf6; font-weight:600; margin-bottom:6px; }
.bm-rate-block { background:rgba(59,130,246,0.06); border:1px solid rgba(59,130,246,0.2); border-radius:8px; padding:10px 12px; }
.bm-rate-label { font-size:11px; color:#3b82f6; font-weight:600; margin-bottom:6px; }
#bm-toast { transition:opacity .3s; }
/* Inline плейсхолдер в редакторе */
.bm-inline-ph {
    display:inline-block;
    background:rgba(249,115,22,0.12);
    border:1px solid rgba(249,115,22,0.35);
    border-radius:3px;padding:0 4px;
    color:var(--accent-primary,#f97316);
    font-family:monospace;font-size:.9em;
    user-select:none;cursor:default;
    transition:background .15s;
}
.bm-inline-ph:hover { background:rgba(249,115,22,0.22); }
`;
    }

    // ── HTML ──────────────────────────────────────────────────────────────────
    function getHTML() {
        return `
<div id="bulk-mail-modal" class="modal" style="display:none;z-index:3000">
  <div class="modal-overlay" onclick="BulkMail.close()"></div>
  <div class="modal-content" style="width:96vw;max-width:1260px;height:90vh;max-height:90vh;display:flex;flex-direction:column">

    <div class="modal-header" style="flex-shrink:0;gap:12px;flex-wrap:wrap;padding:12px 20px">
      <span style="font-size:15px;font-weight:600;white-space:nowrap">📋 Массовая рассылка</span>
      <div style="display:flex;align-items:center;gap:3px;flex:1;justify-content:center;flex-wrap:wrap">
        ${[['1','Данные'],['2','Сопоставление'],['3','Предпросмотр'],['4','Отправка'],['5','История']].map(([n,label]) => `
          <div class="bm-step" id="bm-step-${n}" onclick="BulkMail.goTo(${n})"
               style="display:flex;align-items:center;gap:5px;padding:4px 9px;border-radius:6px;cursor:pointer;font-size:12px">
            <span class="bm-step-num" style="width:19px;height:19px;border-radius:50%;border:1.5px solid currentColor;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;flex-shrink:0">${n}</span>
            <span>${label}</span>
          </div>
          ${parseInt(n) < 5 ? '<span style="color:var(--border-color,#334155);font-size:11px">›</span>' : ''}
        `).join('')}
      </div>
      <button class="modal-close" onclick="BulkMail.close()">×</button>
    </div>

    <div style="flex:1;overflow:hidden;display:flex;flex-direction:column">

      <!-- ШАГ 1 -->
      <div id="bm-screen-1" class="bm-screen" style="overflow-y:auto;padding:28px;align-items:center;justify-content:center">
        <div style="background:var(--bg-secondary,#1e293b);border:1px solid var(--border-color,#334155);border-radius:12px;padding:30px;width:540px;max-width:100%">
          <h3 style="font-size:16px;font-weight:600;margin-bottom:20px">Источник данных</h3>
          <div style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.3);border-radius:8px;padding:12px 14px;display:flex;align-items:center;gap:12px;margin-bottom:20px">
            <span style="font-size:22px">📊</span>
            <div style="flex:1">
              <div style="font-size:13px;font-weight:500;color:#10b981">список_сотрудников_март.xlsx</div>
              <div style="font-size:11px;color:var(--text-muted,#9ca3af)">3 листа · 128 строк · 47 KB</div>
            </div>
            <button class="bm-btn-icon">↺ Заменить</button>
          </div>
          <div style="display:grid;grid-template-columns:1fr 100px;gap:12px;margin-bottom:16px">
            <div>
              <label class="bm-label">Лист</label>
              <select class="bm-select"><option>Март 2026</option><option>Февраль 2026</option><option>Архив</option></select>
            </div>
            <div>
              <label class="bm-label">Строка заголовков</label>
              <input type="number" class="bm-input" value="1" min="1">
            </div>
          </div>
          <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);border-radius:6px;padding:8px 12px;font-size:12px;color:#f59e0b;margin-bottom:16px">
            ⚠ Обнаружено: 1 пустой email, 1 некорректный email — эти строки будут пропущены
          </div>
          <div style="border:1px solid var(--border-color,#334155);border-radius:8px;overflow:hidden;margin-bottom:18px">
            <div style="padding:6px 12px;font-size:11px;color:var(--text-muted,#9ca3af);background:var(--bg-primary,#0f172a);border-bottom:1px solid var(--border-color,#334155);text-transform:uppercase;letter-spacing:.5px">Предпросмотр</div>
            <div style="overflow-x:auto">
              <table class="bm-table">
                <thead><tr><th>#</th><th>ФИО</th><th>Email</th><th>Отдел</th><th>Должность</th><th>Дата</th></tr></thead>
                <tbody>
                  <tr><td>1</td><td>Иванов Иван</td><td>i.ivanov@rt.ru</td><td>ИТ</td><td>Разработчик</td><td>01.03.2026</td></tr>
                  <tr><td>2</td><td>Петрова Анна</td><td>a.petrova@rt.ru</td><td>HR</td><td>Менеджер</td><td>05.03.2026</td></tr>
                  <tr><td>3</td><td>Сидоров Олег</td><td style="color:#dc2626">—</td><td>Финансы</td><td>Аналитик</td><td>07.03.2026</td></tr>
                  <tr><td>4</td><td>Козлова Мария</td><td>m.kozlova@rt.ru</td><td>PR</td><td>Специалист</td><td>10.03.2026</td></tr>
                  <tr><td style="color:var(--text-muted,#9ca3af)" colspan="6">… ещё 124 строки</td></tr>
                </tbody>
              </table>
            </div>
          </div>
          <div class="bm-drop" onclick="this.classList.toggle('bm-drop-hover')">
            <div style="font-size:26px;margin-bottom:8px">📂</div>
            <div style="font-size:13px;font-weight:500;margin-bottom:4px">Перетащите файл или нажмите для выбора</div>
            <div style="font-size:12px;color:var(--text-muted,#9ca3af)"><span class="bm-badge">.xlsx</span><span class="bm-badge">.ods</span></div>
          </div>
          <div style="display:flex;justify-content:flex-end;margin-top:16px">
            <button class="bm-btn-primary" onclick="BulkMail.goTo(2)">Далее →</button>
          </div>
        </div>
      </div>

      <!-- ШАГ 2 -->
      <div id="bm-screen-2" class="bm-screen" style="flex-direction:row;gap:14px;padding:14px;overflow:hidden">
        <div style="width:255px;flex-shrink:0;display:flex;flex-direction:column;gap:10px;overflow-y:auto">
          <div class="bm-panel">
            <div class="bm-panel-header">Источник данных</div>
            <div style="padding:9px 12px">
              ${[['Файл','список_март.xlsx'],['Лист','Март 2026'],['Строк','127'],['Колонок','6']].map(([k,v])=>`
                <div style="display:flex;justify-content:space-between;padding:3px 0;font-size:12px">
                  <span style="color:var(--text-muted,#9ca3af)">${k}</span><span style="font-weight:500;font-size:11px">${v}</span>
                </div>`).join('')}
              <button class="bm-btn-secondary" style="width:100%;margin-top:8px;font-size:12px;padding:5px" onclick="BulkMail.goTo(1)">↺ Изменить</button>
            </div>
          </div>
          <div style="background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.3);border-radius:8px;padding:10px 12px">
            <div style="font-size:11px;color:#3b82f6;font-weight:600;margin-bottom:6px">✉ Колонка email</div>
            <select class="bm-select" style="font-size:12px"><option>Email</option><option>ФИО</option><option>— не выбрано —</option></select>
            <div style="font-size:11px;color:#10b981;margin-top:5px">✓ 124 валидных · 3 пропущено</div>
          </div>
          <div class="bm-panel" style="flex:1;overflow:hidden;display:flex;flex-direction:column;min-height:140px">
            <div class="bm-panel-header">Плейсхолдеры <span style="font-size:11px;font-weight:400">4 из 5</span></div>
            <div style="padding:6px;overflow-y:auto;flex:1">
              ${[['green','ФИО','2×'],['green','Отдел','1×'],['orange','Должность','1×'],['green','Дата','1×'],['red','Город','1×']].map(([c,n,cnt])=>`
                <div class="bm-ph-item">
                  <span class="bm-dot bm-dot-${c}"></span>
                  <span style="flex:1;font-size:12px">${n}</span>
                  <span style="font-size:10px;color:var(--text-muted,#9ca3af);background:var(--bg-hover,#334155);padding:1px 5px;border-radius:10px">${cnt}</span>
                </div>`).join('')}
            </div>
          </div>
          <div class="bm-panel">
            <div class="bm-panel-header">Легенда</div>
            <div style="padding:8px 12px;display:flex;flex-direction:column;gap:4px">
              ${[['green','Точное совпадение'],['orange','Частичное'],['red','Не сопоставлено'],['blue','Нет в файле']].map(([c,l])=>`
                <div style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text-muted,#9ca3af)">
                  <span class="bm-dot bm-dot-${c}"></span>${l}
                </div>`).join('')}
            </div>
          </div>
        </div>
        <div style="flex:1;overflow-y:auto">
          <div class="bm-panel">
            <div class="bm-panel-header">
              Таблица сопоставления
              <span style="display:flex;gap:5px;align-items:center">
                <span class="bm-badge-status bm-s-green">4 сопоставлено</span>
                <span class="bm-badge-status bm-s-red">1 ошибка</span>
                <button class="bm-btn-icon" style="font-size:11px;padding:2px 7px" onclick="BulkMail.autoMap()">⚡ Авто</button>
              </span>
            </div>
            <table class="bm-map-table">
              <thead><tr><th>Плейсхолдер</th><th>Колонка из файла</th><th>Статус</th><th>Мест</th><th>Пустых</th><th></th></tr></thead>
              <tbody>
                ${[
                  ['{{ФИО}}',       'ФИО',           'green',  '✓ Совпадение',     '2 места','0',  false],
                  ['{{Отдел}}',     'Отдел',          'green',  '✓ Совпадение',     '1 место', '0',  false],
                  ['{{Должность}}', 'Должность',      'orange', '⚠ Частичное',      '1 место', '2',  false],
                  ['{{Дата}}',      'Дата',           'green',  '✓ Совпадение',     '1 место', '0',  false],
                  ['{{Город}}',     '— не найдено —', 'red',    '✗ Не сопоставлено','1 место', '—',  true],
                ].map(([ph,col,sc,st,cnt,empty,err])=>`
                  <tr style="${err ? 'background:rgba(220,38,38,0.04)' : ''}">
                    <td><span class="bm-ph-tag${err ? ' bm-ph-tag-red' : ''}">${ph}</span></td>
                    <td><select class="bm-select" style="font-size:12px${err ? ';border-color:rgba(220,38,38,0.4)' : ''}">
                      <option>${col}</option><option>ФИО</option><option>Отдел</option><option>— не выбрано —</option>
                    </select></td>
                    <td><span class="bm-badge-status bm-s-${sc}">${st}</span></td>
                    <td><span style="font-size:11px;color:#3b82f6;cursor:pointer;text-decoration:underline">${cnt}</span></td>
                    <td><span style="font-size:11px;color:${empty === '0' ? 'var(--text-muted,#9ca3af)' : '#f59e0b'}">${empty}</span></td>
                    <td><button class="bm-btn-icon" style="${err ? 'color:#dc2626;border-color:rgba(220,38,38,0.3)' : ''}">✕</button></td>
                  </tr>`).join('')}
              </tbody>
            </table>
            <div style="padding:10px 14px;border-top:1px solid var(--border-color,#334155);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
              <span style="font-size:12px;color:#dc2626">⚠ Несопоставленные плейсхолдеры блокируют отправку</span>
              <div style="display:flex;gap:8px">
                <button class="bm-btn-secondary" style="font-size:12px;padding:5px 12px" onclick="BulkMail.goTo(1)">← Назад</button>
                <button class="bm-btn-primary"   style="font-size:12px;padding:5px 12px" onclick="BulkMail.goTo(3)">Предпросмотр →</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ШАГ 3 -->
      <div id="bm-screen-3" class="bm-screen" style="flex-direction:row;overflow:hidden">
        <div style="width:265px;flex-shrink:0;border-right:1px solid var(--border-color,#334155);display:flex;flex-direction:column;gap:10px;padding:14px;overflow-y:auto">
          <div class="bm-panel">
            <div class="bm-panel-header">Строки</div>
            <div style="padding:10px 12px">
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px">
                <button class="bm-btn-secondary" style="padding:3px 10px;font-size:14px" onclick="BulkMail.changeRow(-1)">‹</button>
                <span style="font-size:13px;flex:1;text-align:center">Строка <strong id="bm-cur-row">1</strong> из <strong id="bm-total-rows">6</strong></span>
                <button class="bm-btn-secondary" style="padding:3px 10px;font-size:14px" onclick="BulkMail.changeRow(1)">›</button>
              </div>
              <div class="bm-search-wrap" style="margin-bottom:8px">
                <span class="bm-search-icon">🔍</span>
                <input class="bm-input" id="bm-preview-search" placeholder="Поиск по ФИО или email..." style="font-size:12px;padding:5px 8px 5px 26px" oninput="BulkMail.searchRows(this.value)">
              </div>
              <div class="bm-filter-tabs">
                <button class="bm-filter-tab active" onclick="BulkMail.setFilter('all',this)">Все</button>
                <button class="bm-filter-tab" onclick="BulkMail.setFilter('problems',this)">⚠ Проблемные</button>
              </div>
            </div>
          </div>
          <div class="bm-panel">
            <div class="bm-panel-header">Текущая строка</div>
            <div style="padding:10px 12px">
              <div style="font-size:11px;color:var(--text-muted,#9ca3af);margin-bottom:3px">Email получателя</div>
              <div id="bm-preview-email" style="font-size:13px;font-weight:500;color:#3b82f6;word-break:break-all;margin-bottom:6px">i.ivanov@rt.ru</div>
              <div id="bm-preview-warns"></div>
            </div>
          </div>
          <div class="bm-test-block">
            <div class="bm-test-label">🧪 Тестовая отправка</div>
            <div style="font-size:11px;color:var(--text-muted,#9ca3af);margin-bottom:8px">Отправить письмо только себе перед запуском</div>
            <input class="bm-input" id="bm-test-email" placeholder="ваш@email.ru" style="font-size:12px;padding:5px 8px;margin-bottom:6px">
            <button class="bm-btn-secondary" style="width:100%;font-size:12px;padding:5px" onclick="BulkMail.sendTest()">Отправить тест</button>
            <div id="bm-test-result" style="font-size:11px;margin-top:5px;display:none"></div>
          </div>
          <div class="bm-rate-block">
            <div class="bm-rate-label">⚡ Лимит отправки</div>
            <div style="display:flex;align-items:center;gap:8px">
              <input type="number" class="bm-input" id="bm-rate-limit" value="10" min="1" max="60" style="font-size:12px;padding:5px 8px;width:60px">
              <span style="font-size:12px;color:var(--text-muted,#9ca3af)">писем / мин</span>
            </div>
            <div style="font-size:11px;color:var(--text-muted,#9ca3af);margin-top:4px">≈ 12 минут на 124 письма</div>
          </div>
          <div class="bm-panel">
            <div class="bm-panel-header">Сводка</div>
            <div style="padding:9px 12px">
              ${[['Всего строк','127',''],['К отправке','124','#10b981'],['Пропустить','3','#f59e0b'],['Пустой email','1','#dc2626'],['Некорр. email','2','#f59e0b']].map(([l,v,c])=>`
                <div style="display:flex;justify-content:space-between;padding:3px 0;font-size:12px">
                  <span style="color:var(--text-muted,#9ca3af)">${l}</span>
                  <strong${c ? ` style="color:${c}"` : ''}>${v}</strong>
                </div>`).join('')}
            </div>
          </div>
          <button class="bm-btn-success" style="width:100%;padding:9px;font-size:13px" onclick="BulkMail.openSendConfirm()">✉ Запустить рассылку</button>
          <button class="bm-btn-secondary" style="width:100%;font-size:12px;padding:5px" onclick="BulkMail.goTo(2)">← Назад</button>
        </div>
        <div style="flex:1;display:flex;flex-direction:column;overflow:hidden">
          <div style="background:var(--bg-secondary,#1e293b);border-bottom:1px solid var(--border-color,#334155);padding:8px 14px;display:flex;align-items:center;gap:10px;flex-shrink:0;flex-wrap:wrap">
            <span style="font-size:12px;color:var(--text-muted,#9ca3af)">Строка <strong id="bm-nav-row" style="color:var(--text-primary,#f9fafb)">1</strong>: <strong id="bm-nav-email" style="color:#3b82f6">i.ivanov@rt.ru</strong></span>
            <div style="flex:1"></div>
            <span style="font-size:12px;color:var(--text-muted,#9ca3af)">Несопоставлено:</span>
            <span class="bm-badge-status bm-s-orange">1 поле</span>
          </div>
          <div style="flex:1;overflow-y:auto;padding:20px;background:var(--bg-primary,#0f172a)">
            <div id="bm-preview-content" style="background:#fff;border-radius:6px;padding:28px;max-width:600px;margin:0 auto;color:#333;font-size:14px;line-height:1.7;box-shadow:0 10px 20px rgba(0,0,0,0.4)"></div>
          </div>
        </div>
      </div>

      <!-- ШАГ 4 -->
      <div id="bm-screen-4" class="bm-screen" style="overflow-y:auto;padding:20px;flex-direction:column;align-items:center;gap:14px">
        <div style="width:100%;max-width:820px">
          <div class="bm-panel" style="margin-bottom:14px">
            <div class="bm-panel-header">
              Ход отправки
              <span id="bm-sending-status" style="font-size:12px;font-weight:400;color:#10b981">Ожидание...</span>
            </div>
            <div style="padding:14px 16px">
              <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:5px">
                <span id="bm-progress-label" style="color:var(--text-muted,#9ca3af)">Отправлено 0 из 124</span>
                <span id="bm-progress-pct" style="font-weight:600">0%</span>
              </div>
              <div class="bm-progress-wrap"><div class="bm-progress-bar" id="bm-progress-bar" style="width:0%"></div></div>
              <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
                <button class="bm-btn-warning" id="bm-btn-pause" style="font-size:12px;padding:5px 12px" onclick="BulkMail.togglePause()">⏸ Пауза</button>
                <button class="bm-btn-secondary" style="font-size:12px;padding:5px 12px" onclick="BulkMail.cancelSend()">✕ Отменить</button>
                <span id="bm-rate-info" style="font-size:11px;color:var(--text-muted,#9ca3af);align-self:center;margin-left:4px">⚡ 10 писем/мин</span>
              </div>
            </div>
          </div>
          <div class="bm-panel">
            <div style="padding:16px 20px;border-bottom:1px solid var(--border-color,#334155);display:flex;align-items:center;gap:14px;flex-wrap:wrap">
              <span id="bm-report-icon" style="font-size:24px">⏳</span>
              <div>
                <div id="bm-report-title" style="font-size:15px;font-weight:600">Ожидание запуска...</div>
                <div id="bm-report-subtitle" style="font-size:12px;color:var(--text-muted,#9ca3af)">Шаблон: «Плановое обучение март»</div>
              </div>
              <div id="bm-report-actions" style="margin-left:auto;display:none;gap:8px">
                <button class="bm-btn-secondary" style="font-size:12px">⬇ Экспорт CSV</button>
                <button class="bm-btn-secondary" style="font-size:12px" onclick="BulkMail.retryErrors()">↺ Повторить ошибки</button>
                <button class="bm-btn-secondary" style="font-size:12px" onclick="BulkMail.goTo(1)">Новая рассылка</button>
              </div>
            </div>
            <div style="display:grid;grid-template-columns:repeat(4,1fr);border-bottom:1px solid var(--border-color,#334155)">
              ${[['bm-stat-total','—','Всего',''],['bm-stat-sent','—','Отправлено','#10b981'],['bm-stat-skipped','—','Пропущено','#f59e0b'],['bm-stat-errors','—','Ошибок','#dc2626']].map(([id,n,l,c])=>`
                <div style="padding:14px;text-align:center;border-right:1px solid var(--border-color,#334155)">
                  <div id="${id}" style="font-size:24px;font-weight:700${c ? ';color:'+c : ''}">${n}</div>
                  <div style="font-size:11px;color:var(--text-muted,#9ca3af)">${l}</div>
                </div>`).join('')}
            </div>
            <div style="overflow-x:auto">
              <table class="bm-table" style="width:100%">
                <thead><tr><th>#</th><th>ФИО</th><th>Email</th><th>Статус</th><th>Комментарий</th></tr></thead>
                <tbody id="bm-report-tbody">
                  <tr><td colspan="5" style="text-align:center;color:var(--text-muted,#9ca3af);padding:20px">Запустите рассылку чтобы увидеть результаты</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <!-- ШАГ 5 -->
      <div id="bm-screen-5" class="bm-screen" style="overflow-y:auto;padding:20px;flex-direction:column;align-items:center">
        <div style="width:100%;max-width:820px">
          <div class="bm-panel">
            <div class="bm-panel-header">История запусков <span style="font-size:11px;font-weight:400">${HISTORY.length} записей</span></div>
            <div>
              ${HISTORY.map(h => `
                <div class="bm-history-row">
                  <div style="flex:1">
                    <div style="font-size:13px;font-weight:500">${h.template}</div>
                    <div style="font-size:11px;color:var(--text-muted,#9ca3af);margin-top:2px">${h.date} · ${h.file}</div>
                  </div>
                  <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
                    <span style="font-size:12px;color:var(--text-muted,#9ca3af)">Всего: <strong style="color:var(--text-primary,#f9fafb)">${h.total}</strong></span>
                    <span class="bm-badge-status bm-s-green">✓ ${h.sent}</span>
                    ${h.skipped ? `<span class="bm-badge-status bm-s-orange">⊘ ${h.skipped}</span>` : ''}
                    ${h.errors  ? `<span class="bm-badge-status bm-s-red">✗ ${h.errors}</span>` : ''}
                    <button class="bm-btn-icon" style="font-size:11px;padding:2px 8px">⬇ CSV</button>
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
<div id="bm-confirm-modal" class="modal" style="display:none;z-index:3100">
  <div class="modal-overlay" onclick="BulkMail.closeSendConfirm()"></div>
  <div class="modal-content modal-small">
    <div class="modal-header">
      <h2>Запустить рассылку</h2>
      <button class="modal-close" onclick="BulkMail.closeSendConfirm()">×</button>
    </div>
    <div class="modal-body">
      <p style="font-size:13px;line-height:1.6;margin-bottom:12px">Будет отправлено <strong style="color:#10b981">124 письма</strong>. 3 строки пропущены.</p>
      <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.3);border-radius:8px;padding:10px 14px;font-size:12px;color:#f59e0b;margin-bottom:10px">⚠ Поле «Город» не сопоставлено — останется пустым</div>
      <div style="background:rgba(59,130,246,0.06);border:1px solid rgba(59,130,246,0.2);border-radius:8px;padding:10px 14px;font-size:12px;color:#3b82f6">⚡ Лимит: 10 писем/мин · ~12 минут</div>
    </div>
    <div class="modal-footer">
      <button class="bm-btn-secondary" onclick="BulkMail.closeSendConfirm()">Отмена</button>
      <button class="bm-btn-success"   onclick="BulkMail.startSend()">✉ Отправить 124 письма</button>
    </div>
  </div>
</div>

<div id="bm-toast" style="display:none;position:fixed;bottom:24px;right:24px;background:var(--bg-secondary);border:1px solid var(--border-secondary);border-radius:8px;padding:12px 20px;font-size:13px;color:var(--text-primary);z-index:4000;box-shadow:var(--shadow-lg);max-width:320px;transition:opacity .3s"></div>
`;
    }

    // ── Инициализация ─────────────────────────────────────────────────────────
    function init() {
        const style = document.createElement('style');
        style.textContent = getCSS();
        document.head.appendChild(style);
        const div = document.createElement('div');
        div.innerHTML = getHTML();
        document.body.appendChild(div);
        updatePreview();

        // Инициализируем кнопку вставки поля в тулбаре
        if (typeof initBulkMailFieldButton === 'function') {
            initBulkMailFieldButton();
            // В прототипе сразу показываем кнопку (колонки уже заданы демо-данными)
            if (typeof setBulkMailColumnsAvailable === 'function') {
                setBulkMailColumnsAvailable(true);
            }
        }
    }

    // ── Навигация ─────────────────────────────────────────────────────────────
    function goTo(n) {
        curStep = parseInt(n);
        for (let i = 1; i <= 5; i++) {
            const s = document.getElementById(`bm-screen-${i}`);
            if (s) s.style.display = 'none';
        }
        const screen = document.getElementById(`bm-screen-${n}`);
        if (screen) screen.style.display = 'flex';
        for (let i = 1; i <= 5; i++) {
            const el = document.getElementById(`bm-step-${i}`);
            if (!el) continue;
            el.classList.remove('bm-step-active', 'bm-step-done');
            if (i < n) el.classList.add('bm-step-done');
            if (i === n) el.classList.add('bm-step-active');
        }
    }

    // ── Предпросмотр ──────────────────────────────────────────────────────────
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

        const totalEl = document.getElementById('bm-total-rows');
        if (totalEl) totalEl.textContent = total;

        if (!r) {
            const c = document.getElementById('bm-preview-content');
            if (c) c.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:24px">Нет строк для отображения</p>';
            return;
        }

        [['bm-cur-row', idx + 1],['bm-nav-row', idx + 1]].forEach(([id, val]) => {
            const el = document.getElementById(id); if (el) el.textContent = val;
        });
        [['bm-nav-email', r.email || '—'],['bm-preview-email', r.email || '—']].forEach(([id, val]) => {
            const el = document.getElementById(id); if (el) el.textContent = val;
        });

        const warnsEl = document.getElementById('bm-preview-warns');
        if (warnsEl) warnsEl.innerHTML = r.warn.map(w => `<div class="bm-warn-item">⚠ ${TextSanitizer.escapeHTML(w)}</div>`).join('');

        const cityEmpty = r.warn.some(w => w.includes('Город'));
        const contentEl = document.getElementById('bm-preview-content');
        if (contentEl) contentEl.innerHTML = `
            <h3 style="color:var(--text-primary);margin-bottom:12px;font-size:16px">Уважаемый(ая) <span class="bm-preview-ph">${TextSanitizer.escapeHTML(r.fio)}</span>!</h3>
            <p style="margin-bottom:10px">Информируем вас о плановом обучении для сотрудников отдела <span class="bm-preview-ph">${TextSanitizer.escapeHTML(r.dept)}</span>.</p>
            <p style="margin-bottom:10px">Ваша должность: <span class="bm-preview-ph">${TextSanitizer.escapeHTML(r.pos)}</span>.<br>Дата мероприятия: <span class="bm-preview-ph">${TextSanitizer.escapeHTML(r.date)}</span>.</p>
            <p style="margin-bottom:10px">Место проведения: ${cityEmpty ? '<span class="bm-preview-empty">[Город — не сопоставлено]</span>' : '<span class="bm-preview-ph">Москва</span>'}.</p>
            <p style="margin-bottom:10px">Просьба подтвердить участие до 20.03.2026.</p>
            <hr style="border:none;border-top:1px solid var(--border-primary);margin:16px 0">
            <p style="color:var(--text-muted);font-size:13px">С уважением,<br><strong style="color:var(--text-secondary)">Департамент управления знаниями</strong></p>`;
    }

    function changeRow(dir) {
        const total = getFilteredRows().length;
        curRow = Math.max(0, Math.min(total - 1, curRow + dir));
        updatePreview();
    }

    function setFilter(f, btn) {
        previewFilter = f;
        curRow = 0;
        document.querySelectorAll('.bm-filter-tab').forEach(t => t.classList.remove('active'));
        if (btn) btn.classList.add('active');
        updatePreview();
    }

    function searchRows(val) {
        previewSearch = val;
        curRow = 0;
        updatePreview();
    }

    // ── Автосопоставление ─────────────────────────────────────────────────────
    function autoMap() {
        showToast('⚡ Автосопоставление выполнено — 4 из 5 полей сопоставлены');
    }

    // ── Тестовая отправка ─────────────────────────────────────────────────────
    function sendTest() {
        const emailEl = document.getElementById('bm-test-email');
        const resultEl = document.getElementById('bm-test-result');
        const email = emailEl ? emailEl.value.trim() : '';
        if (!email || !email.includes('@')) {
            if (resultEl) { resultEl.style.display = 'block'; resultEl.style.color = '#dc2626'; resultEl.textContent = '✗ Укажите корректный email'; }
            return;
        }
        if (resultEl) { resultEl.style.display = 'block'; resultEl.style.color = '#f59e0b'; resultEl.textContent = '⏳ Отправка...'; }
        setTimeout(() => {
            if (resultEl) { resultEl.style.color = '#10b981'; resultEl.textContent = `✓ Письмо отправлено на ${email}`; }
            showToast(`🧪 Тестовое письмо отправлено на ${email}`);
        }, 1200);
    }

    // ── Прогресс отправки ─────────────────────────────────────────────────────
    function startSend() {
        closeSendConfirm();
        goTo(4);
        isSending = true;
        isPaused = false;
        sendProgress = 0;
        const total = 124;
        const rateEl = document.getElementById('bm-rate-limit');
        const rate = rateEl ? parseInt(rateEl.value) || 10 : 10;
        const intervalMs = Math.max(50, Math.round(60000 / rate / 8));

        const statusEl = document.getElementById('bm-sending-status');
        const rateInfo = document.getElementById('bm-rate-info');
        if (statusEl) { statusEl.textContent = 'В процессе...'; statusEl.style.color = '#10b981'; }
        if (rateInfo)   rateInfo.textContent = `⚡ ${rate} писем/мин`;

        setReportStats(total, 0, 0, 0);
        const tbody = document.getElementById('bm-report-tbody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted,#9ca3af);padding:16px">⏳ Идёт отправка...</td></tr>';

        sendTimer = setInterval(() => {
            if (isPaused) return;
            sendProgress = Math.min(sendProgress + 1, total);
            const pct = Math.round((sendProgress / total) * 100);
            const bar   = document.getElementById('bm-progress-bar');
            const label = document.getElementById('bm-progress-label');
            const pctEl = document.getElementById('bm-progress-pct');
            if (bar)   bar.style.width = pct + '%';
            if (label) label.textContent = `Отправлено ${sendProgress} из ${total}`;
            if (pctEl) pctEl.textContent = pct + '%';
            setReportStats(total, sendProgress, 3, sendProgress > 110 ? 2 : 0);
            if (sendProgress >= total) { clearInterval(sendTimer); isSending = false; finishSend(total); }
        }, intervalMs);
    }

    function finishSend(total) {
        const el = (id) => document.getElementById(id);
        if (el('bm-report-icon'))    el('bm-report-icon').textContent = '✅';
        if (el('bm-report-title'))   el('bm-report-title').textContent = 'Рассылка завершена';
        if (el('bm-report-subtitle'))el('bm-report-subtitle').textContent = `${new Date().toLocaleString('ru')}`;
        if (el('bm-report-actions')) el('bm-report-actions').style.display = 'flex';
        if (el('bm-sending-status')) { el('bm-sending-status').textContent = 'Завершено'; el('bm-sending-status').style.color = '#10b981'; }
        if (el('bm-progress-bar'))   el('bm-progress-bar').style.background = 'linear-gradient(90deg,#10b981,#34d399)';
        setReportStats(total, 121, 3, 2);
        const tbody = el('bm-report-tbody');
        if (tbody) tbody.innerHTML = `
            <tr><td>1</td><td>Иванов Иван</td><td>i.ivanov@rt.ru</td><td><span class="bm-badge-status bm-s-green">✓ Отправлено</span></td><td style="color:var(--text-muted,#9ca3af);font-size:12px">—</td></tr>
            <tr><td>2</td><td>Петрова Анна</td><td>a.petrova@rt.ru</td><td><span class="bm-badge-status bm-s-green">✓ Отправлено</span></td><td style="color:var(--text-muted,#9ca3af);font-size:12px">—</td></tr>
            <tr><td>3</td><td>Сидоров Олег</td><td>—</td><td><span class="bm-badge-status bm-s-orange">⊘ Пропущено</span></td><td style="color:#f59e0b;font-size:12px">Пустой email</td></tr>
            <tr><td>4</td><td>Новиков Алексей</td><td>novikov@bad</td><td><span class="bm-badge-status bm-s-orange">⊘ Пропущено</span></td><td style="color:#f59e0b;font-size:12px">Некорректный email</td></tr>
            <tr><td>5</td><td>Попова Елена</td><td>e.popova@rt.ru</td><td><span class="bm-badge-status bm-s-red">✗ Ошибка</span></td><td style="color:#dc2626;font-size:12px">Ошибка подключения</td></tr>
            <tr><td colspan="5" style="color:var(--text-muted,#9ca3af);font-size:12px;padding:8px 10px">… ещё 119 строк отправлено успешно</td></tr>`;
        showToast('✅ Рассылка завершена: 121 письмо отправлено');
    }

    function setReportStats(total, sent, skipped, errors) {
        [['bm-stat-total',total],['bm-stat-sent',sent],['bm-stat-skipped',skipped],['bm-stat-errors',errors]].forEach(([id,v]) => {
            const el = document.getElementById(id); if (el) el.textContent = v;
        });
    }

    function togglePause() {
        isPaused = !isPaused;
        const btn    = document.getElementById('bm-btn-pause');
        const bar    = document.getElementById('bm-progress-bar');
        const status = document.getElementById('bm-sending-status');
        if (btn)    btn.textContent = isPaused ? '▶ Продолжить' : '⏸ Пауза';
        if (bar)    bar.classList.toggle('paused', isPaused);
        if (status) { status.textContent = isPaused ? 'На паузе' : 'В процессе...'; status.style.color = isPaused ? '#f59e0b' : '#10b981'; }
        showToast(isPaused ? '⏸ Рассылка поставлена на паузу' : '▶ Рассылка продолжена');
    }

    function cancelSend() {
        if (!confirm('Отменить рассылку?')) return;
        clearInterval(sendTimer);
        isSending = false;
        const el = (id) => document.getElementById(id);
        if (el('bm-report-icon'))    el('bm-report-icon').textContent = '🚫';
        if (el('bm-report-title'))   el('bm-report-title').textContent = 'Рассылка отменена';
        if (el('bm-sending-status')) { el('bm-sending-status').textContent = 'Отменено'; el('bm-sending-status').style.color = '#dc2626'; }
        showToast('🚫 Рассылка отменена');
    }

    function retryErrors() {
        showToast('↺ Повтор для 2 строк с ошибками...');
        setTimeout(() => showToast('✅ Повторная отправка завершена'), 2000);
    }

    // ── Toast ──────────────────────────────────────────────────────────────────
    function showToast(msg, duration = 3000) {
        const t = document.getElementById('bm-toast');
        if (!t) return;
        t.textContent = msg;
        t.style.display = 'block';
        t.style.opacity = '1';
        clearTimeout(t._timer);
        t._timer = setTimeout(() => { t.style.opacity = '0'; setTimeout(() => { t.style.display = 'none'; }, 300); }, duration);
    }

    // ── Открытие / закрытие ───────────────────────────────────────────────────
    function open() {
        const modal = document.getElementById('bulk-mail-modal');
        if (modal) { modal.style.display = 'flex'; goTo(1); }
    }

    function close() {
        if (isSending && !confirm('Идёт рассылка. Всё равно закрыть?')) return;
        const modal = document.getElementById('bulk-mail-modal');
        if (modal) modal.style.display = 'none';
    }

    function openSendConfirm()  { const m = document.getElementById('bm-confirm-modal'); if (m) m.style.display = 'flex'; }
    function closeSendConfirm() { const m = document.getElementById('bm-confirm-modal'); if (m) m.style.display = 'none'; }

    document.addEventListener('DOMContentLoaded', init);

    /** Вернуть список колонок для тулбара */
    function getColumns() {
        return availableColumns;
    }

    /** Вызывается когда файл загружен — обновляем колонки и показываем кнопку */
    function setColumns(cols) {
        availableColumns = cols;
        if (typeof setBulkMailColumnsAvailable === 'function') {
            setBulkMailColumnsAvailable(cols.length > 0);
        }
    }

    return { open, close, goTo, changeRow, setFilter, searchRows, autoMap, sendTest, startSend, togglePause, cancelSend, retryErrors, openSendConfirm, closeSendConfirm, getColumns, setColumns };

})();
