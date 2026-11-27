// admin/scheduledEditForm.js — форма изменения запланированного письма:
// тема, получатели и время отправки.

const ScheduledEditForm = (() => {
    const FIELDS = [
        { key: 'subject', label: 'Тема', tag: 'input' },
        { key: 'to', label: 'Кому (через запятую)', tag: 'textarea' },
        { key: 'cc', label: 'Копия', tag: 'textarea' },
        { key: 'bcc', label: 'Скрытая копия', tag: 'textarea' },
        { key: 'send_at', label: 'Когда отправить', tag: 'input', type: 'datetime-local' },
    ];

    /** ISO-время сервера (UTC) → значение поля datetime-local в местном времени. */
    function toLocalInput(iso) {
        const date = new Date(iso);
        const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
        return shifted.toISOString().slice(0, 16);
    }

    function _element(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function _initialValue(item, key) {
        if (key === 'send_at') return toLocalInput(item.send_at);
        return Array.isArray(item[key]) ? item[key].join(', ') : item[key];
    }

    function _field(item, { key, label, tag, type }) {
        const wrapper = _element('label', 'sched-field', label);
        const input = _element(tag, 'sched-input');
        if (type) input.type = type;
        if (tag === 'textarea') input.rows = 2;
        input.name = key;
        input.value = _initialValue(item, key) || '';
        wrapper.appendChild(input);
        return { wrapper, input };
    }

    /**
     * @param {object} item - письмо из списка панели
     * @param {{onSave: function(object): Promise<void>, onCancel: function()}} handlers
     * @param {Object<string, string>} [labels] - показать только эти поля с этими подписями
     * @returns {HTMLFormElement}
     */
    function create(item, { onSave, onCancel }, labels) {
        const form = _element('form', 'sched-form');
        const inputs = {};
        const fields = labels
            ? FIELDS.filter(f => labels[f.key]).map(f => ({ ...f, label: labels[f.key] }))
            : FIELDS;
        fields.forEach(field => {
            const { wrapper, input } = _field(item, field);
            inputs[field.key] = input;
            form.appendChild(wrapper);
        });

        const error = _element('p', 'sched-status sched-note--warn');
        const back = _element('button', 'sched-btn', 'Назад');
        back.type = 'button';
        back.addEventListener('click', onCancel);
        const save = _element('button', 'sched-btn sched-btn--primary', 'Сохранить изменения');
        save.type = 'submit';
        const actions = _element('div', 'sched-form-actions');
        actions.append(back, save);
        form.append(error, actions);

        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            error.textContent = '';
            if (!inputs.send_at.value) {
                error.textContent = 'Укажите дату и время отправки';
                return;
            }
            const changes = {
                timezone: -(new Date(inputs.send_at.value).getTimezoneOffset() / 60),
            };
            fields.forEach(({ key }) => { changes[key] = inputs[key].value.trim(); });
            save.disabled = back.disabled = true;
            save.textContent = 'Сохраняю…';
            try {
                await onSave(changes);
            } catch (failure) {
                error.textContent = failure.message;
                save.disabled = back.disabled = false;
                save.textContent = 'Сохранить изменения';
            }
        });
        return form;
    }

    return { create, toLocalInput };
})();
