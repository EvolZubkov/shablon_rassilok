// user/bulkFieldPicker.js — выпадающий список колонок с поиском.
//
// Кнопка «Вставить поле» открывает компактный список с поиском: колонок в файле может
// быть и 200, показывать их все чипами нельзя. Выбор вызывает onPick(колонка).

const BulkFieldPicker = (() => {
  const MAX_VISIBLE = 8;   // строк списка до прокрутки; шаг сетки 4px: 32px строка

  function mount(container, { getColumns, onPick }) {
    container.textContent = '';
    const columns = getColumns();
    if (!columns.length) return null;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'bm-field-picker-btn';
    button.setAttribute('aria-haspopup', 'listbox');
    button.setAttribute('aria-expanded', 'false');
    button.textContent = '{{ }} Вставить поле из файла';

    const popover = document.createElement('div');
    popover.className = 'bm-field-picker';
    popover.hidden = true;

    const search = document.createElement('input');
    search.type = 'search';
    search.className = 'bm-field-picker-search';
    search.placeholder = `Поиск среди ${columns.length}`;
    search.setAttribute('aria-label', 'Поиск колонки');

    const list = document.createElement('div');
    list.className = 'bm-field-picker-list';
    list.setAttribute('role', 'listbox');
    list.style.maxHeight = `${MAX_VISIBLE * 32}px`;

    popover.append(search, list);
    container.append(button, popover);

    function close() {
      popover.hidden = true;
      button.setAttribute('aria-expanded', 'false');
      document.removeEventListener('mousedown', onOutside, true);
    }

    function onOutside(e) {
      if (!container.contains(e.target)) close();
    }

    function pick(column) {
      close();
      onPick(column);
    }

    function render() {
      const query = search.value.trim().toLowerCase();
      const shown = columns.filter(c => c.toLowerCase().includes(query));
      list.textContent = '';
      if (!shown.length) {
        const empty = document.createElement('div');
        empty.className = 'bm-field-picker-empty';
        empty.textContent = 'Ничего не найдено';
        list.appendChild(empty);
        return shown;
      }
      shown.forEach(column => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'bm-field-picker-item';
        item.setAttribute('role', 'option');
        item.textContent = column;
        item.title = `{{${column}}}`;
        item.addEventListener('click', () => pick(column));
        list.appendChild(item);
      });
      return shown;
    }

    function open() {
      search.value = '';
      render();
      popover.hidden = false;
      button.setAttribute('aria-expanded', 'true');
      document.addEventListener('mousedown', onOutside, true);
      search.focus();
    }

    button.addEventListener('click', () => (popover.hidden ? open() : close()));
    search.addEventListener('input', render);
    search.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); close(); button.focus(); }
      if (e.key === 'Enter') {
        e.preventDefault();
        const first = list.querySelector('.bm-field-picker-item');
        if (first) first.click();
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        list.querySelector('.bm-field-picker-item')?.focus();
      }
    });
    list.addEventListener('keydown', e => {
      const items = [...list.querySelectorAll('.bm-field-picker-item')];
      const at = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown' && at < items.length - 1) { e.preventDefault(); items[at + 1].focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); (at > 0 ? items[at - 1] : search).focus(); }
      if (e.key === 'Escape') { e.preventDefault(); close(); button.focus(); }
    });

    return { open, close };
  }

  /** Вставляет text в позицию курсора поля ввода и сообщает об изменении. */
  function insertAtCursor(field, text) {
    const start = field.selectionStart ?? field.value.length;
    const end   = field.selectionEnd   ?? start;
    field.value = field.value.slice(0, start) + text + field.value.slice(end);
    const caret = start + text.length;
    field.focus();
    field.setSelectionRange(caret, caret);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  }

  return { mount, insertAtCursor };
})();

if (typeof window !== 'undefined') window.BulkFieldPicker = BulkFieldPicker;
