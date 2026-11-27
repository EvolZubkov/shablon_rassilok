// admin/scheduledPanel.js — панель «Запланированные письма» (режим администратора).
// Скрыта, пока не нажато Ctrl+Alt+E; состояние хранится на сервере и
// переживает перезапуск приложения.

const ScheduledPanel = (() => {
    /** Значение пункта «Другой ящик…» в списке. */
    const OTHER_MAILBOX = '__other__';

    let _dialog = null;
    let _rows = null;
    let _status = null;
    let _mailbox = null;
    let _select = null;
    let _listView = null;
    let _formView = null;
    let _unlocked = false;
    /** Номер последнего запроса списка: ответы на более ранние отбрасываются. */
    let _listRequest = 0;
    /** Идёт обработка всей рассылки: список и новые действия недоступны. */
    let _batchRunning = false;

    async function _request(url, options) {
        const response = await fetch(url, options);
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success) {
            const error = new Error(data.error || `Ошибка сервера (${response.status})`);
            error.status = response.status;
            throw error;
        }
        return data;
    }

    function _postJson(url, body) {
        return _request(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
    }

    function _element(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    /** Замена содержимого узла: replaceChildren нет во встроенном Chromium. */
    function _setRows(rows) {
        _rows.textContent = '';
        rows.forEach(row => _rows.appendChild(row));
    }

    function _button(label, onClick, modifier) {
        const button = _element('button', `sched-btn ${modifier || ''}`.trim(), label);
        button.type = 'button';
        button.addEventListener('click', onClick);
        return button;
    }

    /** Все получатели письма одной строкой. */
    function formatRecipients(item) {
        const parts = [item.to.join(', ')];
        if (item.cc.length) parts.push(`копия: ${item.cc.join(', ')}`);
        if (item.bcc.length) parts.push(`скрытая: ${item.bcc.join(', ')}`);
        return parts.filter(Boolean).join('; ') || '—';
    }

    function _formatTime(iso) {
        return new Date(iso).toLocaleString('ru-RU', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
        });
    }

    function _renderRow(item) {
        const row = document.createElement('tr');
        const subject = _element('td', 'sched-subject', item.subject || '(без темы)');
        if (item.has_attachments) subject.append(_element('span', 'sched-note', 'с вложениями'));
        if (!item.editable) {
            subject.append(_element('span', 'sched-note',
                'текст отсюда не изменить: письмо отложено не здесь или до обновления'));
        }
        const when = _element('td', 'sched-when', _formatTime(item.send_at));
        if (!item.waiting) {
            when.append(_element('span', 'sched-note sched-note--warn',
                'снято с отправки — само не уйдёт'));
        }
        const actions = _element('td', 'sched-actions');
        actions.append(_button('Изменить', () => _edit(item)));
        if (item.editable) actions.append(_button('Текст', () => _editBody(item)));
        actions.append(_button('Отменить', () => _cancel(item), 'sched-btn--danger'));
        row.append(subject, _element('td', 'sched-recipients', formatRecipients(item)),
            when, actions);
        return row;
    }

    /** Выбранный ящик: из списка или введённый вручную. */
    function _selectedMailbox() {
        return (_select.value === OTHER_MAILBOX ? _mailbox.value : _select.value).trim();
    }

    function _onMailboxChange() {
        const manual = _select.value === OTHER_MAILBOX;
        _mailbox.style.display = manual ? '' : 'none';
        if (manual) {
            _listRequest += 1;
            _setRows([]);
            _status.textContent = 'Введите адрес ящика и нажмите «Обновить»';
            _mailbox.focus();
        } else {
            refresh();
        }
    }

    async function _loadMailboxes() {
        const selected = _select.value;
        let mailboxes = [];
        try {
            mailboxes = (await _request('/api/scheduled/mailboxes')).mailboxes || [];
        } catch (error) {
            console.warn('[ScheduledPanel] список ящиков не получен:', error.message);
        }
        _select.textContent = '';
        const options = mailboxes.length
            ? mailboxes.map(address => [address, address])
            : [['', 'Ящик из настроек подключения']];
        options.concat([[OTHER_MAILBOX, 'Другой ящик…']]).forEach(([value, label]) => {
            const option = _element('option', '', label);
            option.value = value;
            _select.appendChild(option);
        });
        if (selected && Array.from(_select.options).some(o => o.value === selected)) {
            _select.value = selected;
        }
        _mailbox.style.display = _select.value === OTHER_MAILBOX ? '' : 'none';
    }

    /** Экран с формой или отчётом; close() возвращает список. */
    function _showView(node) {
        _formView.textContent = '';
        _formView.appendChild(node);
        _showList(false);
    }

    function _closeView() {
        _formView.textContent = '';
        _showList(true);
    }

    /** Выполняет действие над письмами рассылки с отчётом по получателям. */
    async function _runBatch(title, items, action) {
        _batchRunning = true;
        const view = ScheduledBatch.view(title, items, action, async () => {
            _closeView();
            await refresh();
        });
        _showView(view.element);
        try {
            await view.done;
        } finally {
            _batchRunning = false;
        }
    }

    function _cancelCampaign({ info, items }) {
        if (!window.confirm(`Отменить отправку всей рассылки «${info.subject_template}»: `
            + `писем — ${items.length}? Они переместятся в «Удалённые».`)) return;
        const mailbox = _selectedMailbox();
        _runBatch('Отмена рассылки', items, item => _postJson('/api/scheduled/cancel',
            { id: item.id, schedule_id: item.schedule_id, from_email: mailbox }));
    }

    function _editCampaign({ info, items }) {
        const mailbox = _selectedMailbox();
        const first = { subject: info.subject_template, send_at: items[0].send_at };
        const initialTime = ScheduledEditForm.toLocalInput(first.send_at);
        _showView(ScheduledEditForm.create(first, {
            onCancel: _closeView,
            onSave: async (changes) => {
                // Неизменённое поле не трогаем: у писем могут быть свои тема и время.
                const subjectChanged = changes.subject !== info.subject_template;
                const timeChanged = changes.send_at !== initialTime;
                if (!changes.subject) throw new Error('Тема обязательна');
                if (!subjectChanged && !timeChanged) { _closeView(); return; }
                _runBatch('Изменение рассылки', items, item => {
                    const sendAt = timeChanged
                        ? changes.send_at : ScheduledEditForm.toLocalInput(item.send_at);
                    return _postJson('/api/scheduled/update', {
                        id: item.id, schedule_id: item.schedule_id, from_email: mailbox,
                        subject: item.subject, to: item.to, cc: item.cc, bcc: item.bcc,
                        subject_template: subjectChanged ? changes.subject : undefined,
                        send_at: sendAt,
                        timezone: -(new Date(sendAt).getTimezoneOffset() / 60),
                    });
                });
            },
        }, { subject: 'Тема (поля вида {{ФИО}} подставятся)', send_at: 'Когда отправить всё' }));
    }

    async function _editCampaignText({ campaignId, info, items }) {
        const mailbox = _selectedMailbox();
        try {
            const query = new URLSearchParams({ campaign_id: campaignId });
            const { letter } = await _request(`/api/scheduled/source?${query}`);
            const started = ScheduledBodyEditor.start(
                { ...items[0], subject: info.subject_template }, letter, mailbox, {
                    title: `Правка текста рассылки «${info.subject_template}»`,
                    confirmText: 'Заменить текст во всех ожидающих письмах рассылки? '
                        + 'Правки отдельных писем будут перезаписаны.',
                    onBody: body => _applyCampaignText(campaignId, mailbox, body),
                });
            if (started) _dialog.close();
        } catch (error) {
            Toast.error(error.message);
        }
    }

    async function _applyCampaignText(campaignId, mailbox, body) {
        _dialog.showModal();
        try {
            // Пока шла правка, часть писем могла уйти — берём свежий список.
            const query = new URLSearchParams({ from_email: mailbox });
            const data = await _request(`/api/scheduled/list?${query}`);
            const waiting = data.items.filter(i => i.campaign_id === campaignId);
            await _runBatch('Замена текста рассылки', waiting, item => _postJson(
                '/api/scheduled/body', {
                    ...body, schedule_id: item.schedule_id, from_email: mailbox,
                    whole_campaign: true,
                }));
        } catch (error) {
            Toast.error(`Текст не изменён: ${error.message}`);
        }
    }

    /** Строки таблицы: отдельные письма и свёрнутые рассылки. */
    function _tableRows(data) {
        return ScheduledBatch.group(data.items, data.campaigns).flatMap(entry => {
            if (entry.item) return [_renderRow(entry.item)];
            const letters = entry.items.map(_renderRow);
            letters.forEach(row => {
                row.classList.add('sched-campaign-letter');
                row.style.display = 'none';
            });
            const header = ScheduledBatch.headerRow(entry, {
                onEdit: () => _editCampaign(entry),
                onText: () => _editCampaignText(entry),
                onCancel: () => _cancelCampaign(entry),
                onToggle: visible => letters.forEach(row => {
                    row.style.display = visible ? '' : 'none';
                }),
            });
            return [header, ...letters];
        });
    }

    /** Открывает текст письма в конструкторе. */
    async function _editBody(item) {
        const mailbox = _selectedMailbox();
        try {
            const query = new URLSearchParams({ schedule_id: item.schedule_id });
            const { letter } = await _request(`/api/scheduled/source?${query}`);
            if (ScheduledBodyEditor.start(item, letter, mailbox)) _dialog.close();
        } catch (error) {
            Toast.error(error.message);
        }
    }

    function _showList(visible) {
        _listView.style.display = visible ? '' : 'none';
        _formView.style.display = visible ? 'none' : '';
    }

    function _edit(item) {
        const close = () => { _formView.textContent = ''; _showList(true); };
        _formView.textContent = '';
        _formView.appendChild(ScheduledEditForm.create(item, {
            onCancel: close,
            onSave: async (changes) => {
                await _postJson('/api/scheduled/update', {
                    ...changes, id: item.id, schedule_id: item.schedule_id,
                    from_email: _selectedMailbox(),
                });
                Toast.success('Письмо изменено');
                close();
                await refresh();
            },
        }));
        _showList(false);
    }

    async function refresh() {
        const request = ++_listRequest;
        _setRows([]);
        _status.textContent = 'Загружаю…';
        try {
            const query = new URLSearchParams({ from_email: _selectedMailbox() });
            const data = await _request(`/api/scheduled/list?${query}`);
            if (request !== _listRequest) return;
            _setRows(_tableRows(data));
            _status.textContent = data.items.length
                ? `Ожидают отправки: ${data.items.length}`
                : 'Запланированных писем нет';
        } catch (error) {
            if (request !== _listRequest) return;
            _status.textContent = error.message;
        }
    }

    async function _cancel(item) {
        const subject = item.subject || '(без темы)';
        if (!window.confirm(`Отменить отправку письма «${subject}»? `
            + 'Оно переместится в «Удалённые».')) return;
        _status.textContent = 'Отменяю…';
        try {
            await _postJson('/api/scheduled/cancel', {
                id: item.id, schedule_id: item.schedule_id, from_email: _selectedMailbox(),
            });
            Toast.success('Отправка отменена');
        } catch (error) {
            Toast.error(error.message);
        }
        await refresh();
    }

    function _build() {
        const dialog = _element('dialog', 'sched-dialog');

        const header = _element('div', 'sched-header');
        header.append(_element('h2', 'sched-title', 'Запланированные письма'),
            _button('Закрыть', () => dialog.close()));

        const controls = _element('div', 'sched-controls');
        _select = _element('select', 'sched-mailbox');
        _select.addEventListener('change', _onMailboxChange);
        _mailbox = _element('input', 'sched-mailbox');
        _mailbox.type = 'email';
        _mailbox.placeholder = 'Адрес ящика';
        _mailbox.style.display = 'none';
        _mailbox.addEventListener('keydown', (e) => { if (e.key === 'Enter') refresh(); });
        controls.append(_select, _mailbox, _button('Обновить', refresh));

        _status = _element('p', 'sched-status');

        const table = _element('table', 'sched-table');
        const head = document.createElement('tr');
        ['Тема', 'Кому', 'Когда уйдёт', ''].forEach(t => head.append(_element('th', '', t)));
        const thead = document.createElement('thead');
        thead.append(head);
        _rows = document.createElement('tbody');
        table.append(thead, _rows);

        const scroll = _element('div', 'sched-scroll');
        scroll.append(table);
        _listView = _element('div', 'sched-view');
        _listView.append(controls, _status, scroll);
        _formView = _element('div', 'sched-view');
        _formView.style.display = 'none';
        dialog.append(header, _listView, _formView);
        document.body.appendChild(dialog);
        return dialog;
    }

    async function open() {
        if (typeof ScheduledBodyEditor !== 'undefined' && ScheduledBodyEditor.isActive()) {
            Toast.warning('Сначала сохраните или отмените правку письма');
            return;
        }
        if (!_dialog) _dialog = _build();
        if (_batchRunning) { _dialog.showModal(); return; }
        _showList(true);
        _dialog.showModal();
        await _loadMailboxes();
        await refresh();
    }

    function _applyVisibility() {
        const button = document.getElementById('btn-scheduled-panel');
        if (button) button.style.display = _unlocked ? '' : 'none';
    }

    async function _toggleUnlocked() {
        try {
            const data = await _postJson('/api/scheduled/state', { unlocked: !_unlocked });
            _unlocked = data.unlocked;
            _applyVisibility();
            Toast.info(_unlocked
                ? 'Панель «Запланированные» открыта'
                : 'Панель «Запланированные» скрыта');
        } catch (error) {
            Toast.error(error.message);
        }
    }

    async function init() {
        document.getElementById('btn-scheduled-panel')?.addEventListener('click', open);
        // e.code, а не e.key — работает в любой раскладке клавиатуры.
        document.addEventListener('keydown', (e) => {
            if (!e.ctrlKey || !e.altKey || e.code !== 'KeyE') return;
            e.preventDefault();
            _toggleUnlocked();
        });
        try {
            _unlocked = (await _request('/api/scheduled/state')).unlocked;
        } catch (error) {
            console.warn('[ScheduledPanel] состояние панели не получено:', error.message);
        }
        _applyVisibility();
    }

    return { init, open, refresh, formatRecipients };
})();

document.addEventListener('DOMContentLoaded', () => ScheduledPanel.init());
