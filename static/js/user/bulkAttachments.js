// user/bulkAttachments.js — вложения рассылки: список карточек двух видов.
//
//   • «Файлы для всех» — один или несколько файлов, загружаются в окне и уходят каждому;
//   • «Индивидуальное по таблице» — файл на каждого получателя: имя по шаблону или из колонки,
//     у карточки своя папка и своё правило «если файл не найден».
//
// Карточек может быть сколько угодно, письмо получит файлы всех. Размер общих файлов и
// опасные типы проверяются здесь же, до загрузки: сервер всё равно не пропустит такое письмо.

const BulkAttachments = (() => {
  const MB = 1024 * 1024;
  const FALLBACK_LIMITS = { budget_bytes: 7 * MB, limit_bytes: 10 * MB, max_files: 10, blocked: [] };

  const MISSING_OPTIONS = [
    ['send', 'Отправить без вложения'],
    ['skip', 'Пропустить получателя'],
    ['stop', 'Остановить рассылку'],
  ];

  function formatSize(bytes) {
    if (bytes >= MB) return `${(bytes / MB).toFixed(1).replace('.', ',')} МБ`;
    return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function extensionOf(name) {
    const dot = String(name).lastIndexOf('.');
    return dot < 0 ? '' : String(name).slice(dot).toLowerCase();
  }

  /**
   * @param {HTMLElement} root   контейнер для карточек
   * @param {{getHeaders:()=>string[], onChange:()=>void}} deps
   */
  function mount(root, deps) {
    const items = [];
    let nextId = 1;
    let limits = FALLBACK_LIMITS;

    if (typeof fetch === 'function') {
      fetch('/api/bulk/attach/limits')
        .then(r => (r.ok ? r.json() : null))
        .then(data => { if (data) { limits = data; renderAll(); } })
        .catch(() => { /* остаются запасные значения; сервер проверит сам */ });
    }

    const blockedSet = () => new Set(limits.blocked || []);
    const commonItems = () => items.filter(i => i.kind === 'common');
    const allCommonFiles = () => commonItems().flatMap(i => i.files);
    const commonBytes = () => allCommonFiles().reduce((sum, f) => sum + f.size, 0);
    const indexOf = item => items.indexOf(item) + 1;
    const columns = () => deps.getHeaders().filter(h => !/mail|почта/i.test(h));

    // ── добавление и удаление карточек ────────────────────────────────────────
    function addIndividual() {
      const item = { id: nextId++, kind: 'individual', folder: '', mode: 'template',
        template: '', column: '', missing: 'send' };
      items.push(item);
      renderAll();
      deps.onChange();
      root.querySelector(`[data-item="${item.id}"] input[type=text]`)?.focus();
    }

    function addCommon() {
      const item = { id: nextId++, kind: 'common', files: [], errors: [], uploading: false };
      items.push(item);
      renderAll();
      pickFiles(item);
    }

    function removeItem(item) {
      if (item.kind === 'common') item.files.forEach(f => deleteOnServer(f.token));
      items.splice(items.indexOf(item), 1);
      renderAll();
      deps.onChange();
    }

    function deleteOnServer(token) {
      fetch('/api/bulk/attach/delete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      }).catch(() => { /* временный файл уберёт очистка при выходе */ });
    }

    // ── загрузка общих файлов ─────────────────────────────────────────────────
    let pendingItem = null;
    const picker = el('input');
    picker.type = 'file';
    picker.multiple = true;
    picker.style.display = 'none';
    picker.addEventListener('change', () => {
      if (pendingItem && picker.files.length) upload(pendingItem, [...picker.files]);
      picker.value = '';
    });
    root.appendChild(picker);

    function pickFiles(item) {
      pendingItem = item;
      picker.click();
    }

    // Проверка до отправки на сервер: тип, число файлов, суммарный размер.
    function precheck(files) {
      const blocked = blockedSet();
      const accepted = [];
      const errors = [];
      let count = allCommonFiles().length;
      let bytes = commonBytes();
      files.forEach(file => {
        const ext = extensionOf(file.name);
        if (blocked.has(ext)) {
          errors.push(`${file.name}: файлы ${ext} почтовые серверы не пропускают`);
        } else if (count >= limits.max_files) {
          errors.push(`${file.name}: не больше ${limits.max_files} общих файлов`);
        } else if (bytes + file.size > limits.budget_bytes) {
          errors.push(`${file.name}: не помещается в письмо (${formatSize(bytes + file.size)} из ${formatSize(limits.budget_bytes)})`);
        } else if (!file.size) {
          errors.push(`${file.name}: файл пустой`);
        } else {
          accepted.push(file);
          count += 1;
          bytes += file.size;
        }
      });
      return { accepted, errors };
    }

    async function upload(item, files) {
      const { accepted, errors } = precheck(files);
      item.errors = errors;
      if (!accepted.length) { renderAll(); return; }

      item.uploading = true;
      renderAll();
      const form = new FormData();
      accepted.forEach(file => form.append('files', file, file.name));
      form.append('existing_files', String(allCommonFiles().length));
      form.append('existing_bytes', String(commonBytes()));
      try {
        const resp = await fetch('/api/bulk/attach/upload', { method: 'POST', body: form });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
        const { files: saved, rejected, ...freshLimits } = data;
        limits = { ...limits, ...freshLimits };
        item.files.push(...saved);
        item.errors.push(...rejected.map(r => `${r.name}: ${r.error}`));
      } catch (err) {
        item.errors.push(`Не удалось загрузить: ${err.message}`);
      }
      item.uploading = false;
      renderAll();
      deps.onChange();
    }

    // ── отрисовка ─────────────────────────────────────────────────────────────
    function renderAll() {
      const hint = document.getElementById('bm-attach-empty');
      if (hint) hint.hidden = items.length > 0;
      [...root.querySelectorAll('.bm-att-card')].forEach(node => node.remove());
      items.forEach(item => root.insertBefore(renderCard(item), picker));
    }

    function cardShell(item, title) {
      const card = el('div', `bm-att-card bm-att-card--${item.kind}`);
      card.dataset.item = item.id;
      const head = el('div', 'bm-att-head');
      head.appendChild(el('span', 'bm-att-title', `${indexOf(item)}. ${title}`));
      const remove = el('button', 'bm-btn-clear', '×');
      remove.type = 'button';
      remove.title = 'Убрать это вложение';
      remove.setAttribute('aria-label', `Убрать вложение ${indexOf(item)}`);
      remove.addEventListener('click', () => removeItem(item));
      head.appendChild(remove);
      card.appendChild(head);
      return card;
    }

    function renderCard(item) {
      return item.kind === 'common' ? renderCommon(item) : renderIndividual(item);
    }

    function renderCommon(item) {
      const card = cardShell(item, 'Файлы для всех получателей');
      const list = el('div', 'bm-att-files');
      item.files.forEach(file => {
        const row = el('div', 'bm-att-file');
        row.appendChild(el('span', 'bm-att-file-name', file.name));
        row.appendChild(el('span', 'bm-att-file-size', formatSize(file.size)));
        const del = el('button', 'bm-btn-clear', '×');
        del.type = 'button';
        del.title = 'Убрать файл';
        del.setAttribute('aria-label', `Убрать файл ${file.name}`);
        del.addEventListener('click', () => {
          item.files = item.files.filter(f => f.token !== file.token);
          deleteOnServer(file.token);
          renderAll();
          deps.onChange();
        });
        row.appendChild(del);
        list.appendChild(row);
      });
      card.appendChild(list);

      const add = el('button', 'bm-btn-ghost bm-btn-ghost--sm',
        item.uploading ? 'Загружаю…' : (item.files.length ? '+ Ещё файлы' : 'Выбрать файлы'));
      add.type = 'button';
      add.disabled = item.uploading;
      add.addEventListener('click', () => pickFiles(item));
      card.appendChild(add);

      // перетаскивание файлов на карточку
      card.addEventListener('dragover', e => { e.preventDefault(); card.classList.add('bm-att-card--drag'); });
      card.addEventListener('dragleave', () => card.classList.remove('bm-att-card--drag'));
      card.addEventListener('drop', e => {
        e.preventDefault();
        card.classList.remove('bm-att-card--drag');
        if (e.dataTransfer?.files?.length) upload(item, [...e.dataTransfer.files]);
      });

      card.appendChild(renderMeter());
      item.errors?.forEach(text => {
        const error = el('div', 'bm-att-error', text);
        error.setAttribute('role', 'alert');
        card.appendChild(error);
      });
      return card;
    }

    function renderMeter() {
      const wrap = el('div', 'bm-att-meter');
      const used = commonBytes();
      const ratio = Math.min(1, used / (limits.budget_bytes || 1));
      const bar = el('div', 'bm-att-meter-bar');
      const fill = el('div', 'bm-att-meter-fill');
      fill.style.width = `${Math.round(ratio * 100)}%`;
      if (ratio > 0.9) fill.classList.add('bm-att-meter-fill--full');
      bar.appendChild(fill);
      wrap.appendChild(bar);
      wrap.appendChild(el('span', 'bm-att-meter-text',
        `${formatSize(used)} из ${formatSize(limits.budget_bytes)} — лимит сервера на письмо с учётом кодирования`));
      return wrap;
    }

    function field(labelText) {
      const wrap = el('div', 'bm-field');
      wrap.appendChild(el('label', 'bm-label', labelText));
      return wrap;
    }

    function renderIndividual(item) {
      const card = cardShell(item, 'Индивидуальное по таблице');

      const modes = el('div', 'bm-attach-mode-row');
      [['template', 'Шаблон имени'], ['column', 'Колонка']].forEach(([value, label]) => {
        const wrap = el('label', 'bm-radio-label');
        const radio = el('input');
        radio.type = 'radio';
        radio.name = `bm-att-mode-${item.id}`;
        radio.value = value;
        radio.checked = item.mode === value;
        radio.addEventListener('change', () => {
          item.mode = value;
          renderAll();
          deps.onChange();
        });
        wrap.append(radio, document.createTextNode(` ${label}`));
        modes.appendChild(wrap);
      });
      card.appendChild(modes);

      const folder = field('Папка с файлами');
      const folderInput = el('input', 'bm-input');
      folderInput.type = 'text';
      folderInput.placeholder = 'C:\\Документы\\';
      folderInput.value = item.folder;
      folderInput.addEventListener('input', () => { item.folder = folderInput.value; deps.onChange(); });
      folder.appendChild(folderInput);
      card.appendChild(folder);

      if (item.mode === 'column') {
        const col = field('Колонка с именем файла');
        const select = el('select', 'bm-select');
        select.appendChild(new Option('— выберите колонку —', ''));
        deps.getHeaders().forEach(h => select.appendChild(new Option(h, h, false, h === item.column)));
        select.addEventListener('change', () => { item.column = select.value; deps.onChange(); });
        col.appendChild(select);
        card.appendChild(col);
      } else {
        const tpl = field('Шаблон имени файла');
        const input = el('input', 'bm-input');
        input.type = 'text';
        input.placeholder = '{{ФИО}}.pdf';
        input.value = item.template;
        input.addEventListener('input', () => { item.template = input.value; deps.onChange(); });
        tpl.appendChild(input);
        const chips = el('div', 'bm-ph-chips');
        chips.setAttribute('aria-label', 'Вставить поле из файла');
        tpl.appendChild(chips);
        BulkFieldPicker.mount(chips, {
          getColumns: columns,
          onPick: name => BulkFieldPicker.insertAtCursor(input, `{{${name}}}`),
        });
        card.appendChild(tpl);
      }

      const missing = field('Если файл не найден');
      const policy = el('select', 'bm-select');
      MISSING_OPTIONS.forEach(([value, label]) => policy.appendChild(new Option(label, value, false, value === item.missing)));
      policy.addEventListener('change', () => { item.missing = policy.value; deps.onChange(); });
      missing.appendChild(policy);
      card.appendChild(missing);
      return card;
    }

    // ── наружу ────────────────────────────────────────────────────────────────
    function getSpecs() {
      return items.flatMap(item => {
        if (item.kind === 'common') {
          return item.files.length ? [{ kind: 'common', files: item.files.map(f => f.token) }] : [];
        }
        return [{ kind: 'individual', folder: item.folder.trim(), mode: item.mode,
          template: item.template.trim(), column: item.column, missing: item.missing }];
      });
    }

    function getFileTemplates() {
      return items.filter(i => i.kind === 'individual' && i.mode === 'template').map(i => i.template);
    }

    /** Текст первой проблемы настроек или '' — вызывается перед отправкой. */
    function validate() {
      for (const item of items) {
        const n = indexOf(item);
        if (item.kind === 'common' && !item.files.length) return `Вложение ${n}: добавьте файлы или уберите его`;
        if (item.kind === 'individual') {
          if (!item.folder.trim()) return `Вложение ${n}: укажите папку с файлами`;
          if (item.mode === 'column' && !item.column) return `Вложение ${n}: выберите колонку с именем файла`;
          if (item.mode === 'template' && !item.template.trim()) return `Вложение ${n}: укажите шаблон имени файла`;
        }
      }
      return '';
    }

    function clear() {
      items.slice().forEach(i => { if (i.kind === 'common') i.files.forEach(f => deleteOnServer(f.token)); });
      items.length = 0;
      renderAll();
    }

    return {
      addCommon, addIndividual, getSpecs, getFileTemplates, validate, clear,
      refreshHeaders: renderAll,
      hasItems: () => items.length > 0,
      commonBytes,
      getLimits: () => limits,
    };
  }

  return { mount, formatSize };
})();

if (typeof window !== 'undefined') window.BulkAttachments = BulkAttachments;
