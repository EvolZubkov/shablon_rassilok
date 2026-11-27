// admin/scheduledBatch.js — действия над всей запланированной рассылкой:
// группировка писем, поочерёдное выполнение и отчёт по получателям.
// Письма обрабатываются по одному: каждое изменение самостоятельно, поэтому
// остановка или закрытие приложения не портит остальные.

const ScheduledBatch = (() => {
    const STATUS_TEXT = {
        ok: 'готово',
        gone: 'пропущено: уже отправлено или отменено',
        error: 'ошибка',
        pending: 'не обработано',
    };

    function _element(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function _button(label, onClick, modifier) {
        const button = _element('button', `sched-btn ${modifier || ''}`.trim(), label);
        button.type = 'button';
        button.addEventListener('click', onClick);
        return button;
    }

    /**
     * Письма в порядке отправки; письма одной рассылки собраны в группу
     * на месте самого раннего из них.
     * @returns {Array<{item: object}|{campaignId: string, info: object, items: object[]}>}
     */
    function group(items, campaigns = {}) {
        const result = [];
        const seen = new Set();
        items.forEach(item => {
            const campaignId = item.campaign_id;
            if (!campaignId || !campaigns[campaignId]) {
                result.push({ item });
            } else if (!seen.has(campaignId)) {
                seen.add(campaignId);
                result.push({
                    campaignId,
                    info: campaigns[campaignId],
                    items: items.filter(i => i.campaign_id === campaignId),
                });
            }
        });
        return result;
    }

    /**
     * Выполняет действие над письмами по очереди. Первая ошибка останавливает
     * работу; уже отправленное письмо (404) ошибкой не считается.
     */
    async function run(items, action, { onResult = () => {}, isStopped = () => false } = {}) {
        const report = items.map(item => ({ item, status: 'pending', message: '' }));
        for (let index = 0; index < report.length; index += 1) {
            if (isStopped()) break;
            const { item } = report[index];
            try {
                await action(item);
                report[index] = { item, status: 'ok', message: '' };
            } catch (error) {
                const status = error.status === 404 ? 'gone' : 'error';
                report[index] = { item, status, message: error.message };
            }
            onResult(report[index], index);
            if (report[index].status === 'error') break;
        }
        return report;
    }

    function _describe({ status, message }) {
        return status === 'error' ? `${STATUS_TEXT.error}: ${message}` : STATUS_TEXT[status];
    }

    /**
     * Экран выполнения: счётчик, кнопка остановки и отчёт по каждому получателю.
     * @returns {{element: HTMLElement, done: Promise<object[]>}}
     */
    function view(title, items, action, onClose) {
        let stopped = false;
        const element = _element('div', 'sched-batch');
        const counter = _element('p', 'sched-status', `Обработано 0 из ${items.length}`);
        const list = _element('ul', 'sched-report');
        const lines = items.map(item => {
            const line = _element('li', 'sched-report-line');
            line.append(_element('span', 'sched-report-who', item.to.join(', ') || item.subject),
                _element('span', 'sched-report-result', 'в очереди'));
            list.appendChild(line);
            return line;
        });
        const stop = _button('Остановить', () => { stopped = true; stop.disabled = true; },
            'sched-btn--danger');
        const back = _button('К списку', onClose);
        back.disabled = true;
        const actions = _element('div', 'sched-form-actions');
        actions.append(stop, back);
        element.append(_element('strong', '', title), counter, list, actions);

        const show = (entry, index) => {
            lines[index].lastChild.textContent = _describe(entry);
            lines[index].classList.toggle('sched-note--warn', entry.status === 'error');
        };
        const done = run(items, action, {
            isStopped: () => stopped,
            onResult: (entry, index) => {
                show(entry, index);
                counter.textContent = `Обработано ${index + 1} из ${items.length}`;
            },
        }).then(report => {
            report.forEach((entry, index) => { if (entry.status === 'pending') show(entry, index); });
            const count = status => report.filter(e => e.status === status).length;
            counter.textContent = `Готово: ${count('ok')} из ${items.length}`
                + (count('gone') ? `, пропущено: ${count('gone')}` : '')
                + (count('error') ? `. Остановлено на ошибке` : '')
                + (count('pending') ? `, не обработано: ${count('pending')}` : '');
            stop.disabled = true;
            back.disabled = false;
            return report;
        });
        return { element, done };
    }

    /**
     * Строка-заголовок рассылки в таблице.
     * @param {{info: object, items: object[]}} campaign
     * @param {{onEdit, onText, onCancel, onToggle: function(boolean)}} handlers
     */
    function headerRow({ info, items }, { onEdit, onText, onCancel, onToggle }) {
        const row = _element('tr', 'sched-campaign');
        const title = _element('td', 'sched-subject',
            `Рассылка «${info.subject_template || '(без темы)'}»`);
        const waiting = _element('td', 'sched-recipients',
            `ждут ${items.length} из ${info.total}`);
        let expanded = false;
        const toggle = _button('Показать письма', () => {
            expanded = !expanded;
            toggle.textContent = expanded ? 'Скрыть письма' : 'Показать письма';
            onToggle(expanded);
        });
        waiting.appendChild(toggle);
        const times = items.map(i => new Date(i.send_at).getTime());
        const when = _element('td', 'sched-when',
            new Date(Math.min(...times)).toLocaleString('ru-RU'));
        if (Math.max(...times) !== Math.min(...times)) {
            when.appendChild(_element('span', 'sched-note', 'у писем разное время'));
        }
        const actions = _element('td', 'sched-actions');
        actions.append(_button('Тема и время', onEdit), _button('Текст всем', onText),
            _button('Отменить все', onCancel, 'sched-btn--danger'));
        row.append(title, waiting, when, actions);
        return row;
    }

    return { group, run, view, headerRow };
})();
