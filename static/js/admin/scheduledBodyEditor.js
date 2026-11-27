// admin/scheduledBodyEditor.js — правка текста запланированного письма в
// конструкторе. Блоки письма временно занимают холст; прежнее содержимое
// холста возвращается после сохранения или отмены.

const ScheduledBodyEditor = (() => {
    const REVIEW_PREFIX = '[На согласование] ';

    /** Текущая правка или null. */
    let _session = null;

    const isActive = () => _session !== null;

    function _element(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function _snapshotCanvas() {
        return {
            blocks: AppState.blocks,
            blockIdCounter: AppState.blockIdCounter,
            template: TemplatesUI.currentTemplate,
            savedSnapshot: TemplatesUI.savedSnapshot,
            undoStack: AppState.undoStack,
            redoStack: AppState.redoStack,
        };
    }

    function _showCanvas({ blocks, blockIdCounter, template, savedSnapshot,
        undoStack, redoStack }) {
        // У письма и у прежнего холста своя история Ctrl+Z.
        AppState.undoStack = undoStack;
        AppState.redoStack = redoStack;
        AppState.blocks = blocks;
        AppState.blockIdCounter = blockIdCounter;
        AppState.selectedBlockId = null;
        TemplatesUI.currentTemplate = template;
        TemplatesUI.savedSnapshot = savedSnapshot;
        renderCanvas();
        renderSettings();
        if (typeof initializeBlockInteractions === 'function') initializeBlockInteractions();
        window.updateCanvasContext?.();
    }

    function _buildBar(item, letter) {
        const bar = _element('div', 'sched-editbar');
        const sendAt = new Date(item.send_at).toLocaleString('ru-RU');
        const text = _element('div', 'sched-editbar-text');
        text.append(
            _element('strong', '', `Правка запланированного письма «${item.subject}»`),
            _element('span', '', `Уйдёт ${sendAt}. Правки этого письма, `
                + 'сделанные в Outlook, будут заменены.'),
        );

        const comment = _element('textarea', 'sched-input');
        comment.rows = 2;
        comment.value = letter.comment || '';
        comment.placeholder = 'Комментарий в начале письма';
        comment.style.display = letter.comment ? '' : 'none';

        const cancelButton = _element('button', 'sched-btn', 'Отмена');
        cancelButton.type = 'button';
        cancelButton.addEventListener('click', cancel);
        const saveButton = _element('button', 'sched-btn sched-btn--primary', 'Сохранить изменения');
        saveButton.type = 'button';
        saveButton.addEventListener('click', save);
        const actions = _element('div', 'sched-form-actions');
        actions.append(cancelButton, saveButton);

        bar.append(text, comment, actions);
        return { bar, comment, buttons: [cancelButton, saveButton] };
    }

    /**
     * @param {object} item - письмо из списка панели
     * @param {{blocks: object[], comment: string, review: boolean}} letter - локальная копия
     * @param {string} mailbox - ящик, в «Исходящих» которого лежит письмо
     * @returns {boolean} открыта ли правка
     */
    function start(item, letter, mailbox) {
        if (_session) {
            Toast.warning('Сначала сохраните или отмените текущую правку письма');
            return false;
        }
        const previous = _snapshotCanvas();
        const blocks = migrateExpertLite(JSON.parse(JSON.stringify(letter.blocks)));
        const view = _buildBar(item, letter);
        _session = { item, letter, mailbox, previous, ...view };
        _showCanvas({
            blocks,
            blockIdCounter: TemplatesUI.findMaxBlockId(blocks) + 1,
            template: null,
            savedSnapshot: null,
            undoStack: [],
            redoStack: [],
        });
        const canvas = document.getElementById('canvas');
        canvas.parentNode.insertBefore(view.bar, canvas);
        // Пока идёт правка, кнопки отправки скрыты: иначе уйдёт второе письмо.
        document.body.classList.add('sched-editing');
        return true;
    }

    function _finish() {
        const { bar, previous } = _session;
        _session = null;
        bar.remove();
        document.body.classList.remove('sched-editing');
        _showCanvas(previous);
    }

    function cancel() {
        if (!_session) return;
        if (!window.confirm('Выйти без сохранения? Письмо уйдёт в прежнем виде.')) return;
        _finish();
    }

    function _setBusy(busy) {
        const [cancelButton, saveButton] = _session.buttons;
        cancelButton.disabled = saveButton.disabled = busy;
        saveButton.textContent = busy ? 'Сохраняю…' : 'Сохранить изменения';
    }

    async function _send() {
        const { item, letter, mailbox, comment } = _session;
        const body = await ExchangeModals.buildScheduledBody({
            subject: item.subject.replace(REVIEW_PREFIX, ''),
            comment: comment.value,
            review: Boolean(letter.review),
        });
        const response = await fetch('/api/scheduled/body', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...body, schedule_id: item.schedule_id, from_email: mailbox }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success) {
            throw new Error(data.error || `Ошибка сервера (${response.status})`);
        }
    }

    async function save() {
        if (!_session) return;
        if (!AppState.blocks.length) {
            Toast.warning('Письмо пустое — добавьте блоки или нажмите «Отмена»');
            return;
        }
        const other = TemplatesUI.currentTemplate;
        if (other && !window.confirm(`Заменить текст письма шаблоном «${other.name}», `
            + 'который открыт на холсте?')) return;
        _setBusy(true);
        try {
            await _send();
        } catch (error) {
            Toast.error(error.message);
            _setBusy(false);
            return;
        }
        _finish();
        Toast.success('Текст запланированного письма изменён');
    }

    return { start, save, cancel, isActive };
})();
