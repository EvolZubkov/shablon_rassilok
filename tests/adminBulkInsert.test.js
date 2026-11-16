/**
 * tests/adminBulkInsert.test.js
 *
 * Вставка {{плейсхолдера}} из админской панели «Плейсхолдеры для рассылки»
 * (static/js/admin-bulk-mail.js): поле встаёт на место курсора и в textarea (текст),
 * и в однострочном input (заголовок), а не в конец.
 */

const fs = require('node:fs')
const path = require('node:path')
const { JSDOM } = require('jsdom')

const SRC = fs.readFileSync(path.join(__dirname, '../static/js/admin-bulk-mail.js'), 'utf8')
const SETTINGS_UI = fs.readFileSync(path.join(__dirname, '../static/js/settingsUI.js'), 'utf8')

function makeWindow() {
    const dom = new JSDOM('<body><div id="settings"></div></body>', { runScripts: 'outside-only' })
    const w = dom.window
    w.eval(`
        var __saved = {};
        var TextSanitizer = { escapeHTML: s => s };
        var AppState = { findBlockById: () => ({ settings: {} }), blocks: [] };
        function updateBlockSetting(id, key, value) { __saved[id + ':' + key] = value; }
        function renderCanvas() { window.__canvasRendered = (window.__canvasRendered || 0) + 1; }
    `)
    w.eval(`${SRC}\n;window.AdminBulkMail = AdminBulkMail;`)
    return w
}

describe('admin: вставка плейсхолдера в поле настроек', () => {
    test('заголовок (input из createSettingInput): поле встаёт на место курсора', () => {
        const w = makeWindow()
        w.eval(`${SETTINGS_UI}\n;window.createSettingInput = createSettingInput;`)
        const group = w.createSettingInput('Текст заголовка', 'Дорогие коллеги!', 7, 'text')
        w.document.getElementById('settings').appendChild(group)
        const input = group.querySelector('input')
        input.setSelectionRange(15, 15)               // перед «!»

        w.AdminBulkMail.insertIntoTextarea(7, 'text', 'Должность')

        expect(input.value).toBe('Дорогие коллеги{{Должность}}!')
        expect(w.eval('__saved["7:text"]')).toBe('Дорогие коллеги{{Должность}}!')
        expect(input.selectionStart).toBe('Дорогие коллеги{{Должность}}'.length)
    })

    test('текст (textarea): поле встаёт на место курсора', () => {
        const w = makeWindow()
        const ta = w.document.createElement('textarea')
        ta.dataset.blockId = '3'
        ta.dataset.settingKey = 'content'
        ta.value = 'Введите текст здесь.'
        w.document.getElementById('settings').appendChild(ta)
        ta.setSelectionRange(4, 4)

        w.AdminBulkMail.insertIntoTextarea(3, 'content', 'ФИО')

        expect(ta.value).toBe('Введ{{ФИО}}ите текст здесь.')
    })

    test('выделенный фрагмент заменяется полем', () => {
        const w = makeWindow()
        w.eval(`${SETTINGS_UI}\n;window.createSettingInput = createSettingInput;`)
        const group = w.createSettingInput('Текст заголовка', 'Дорогие коллеги!', 7, 'text')
        w.document.getElementById('settings').appendChild(group)
        const input = group.querySelector('input')
        input.setSelectionRange(8, 15)                // «коллеги»

        w.AdminBulkMail.insertIntoTextarea(7, 'text', 'ФИО')

        expect(input.value).toBe('Дорогие {{ФИО}}!')
    })
})

describe('admin: вставка плейсхолдера в пункт списка', () => {
    function listPanel(w, blockId, values) {
        const panel = w.document.getElementById('settings')
        values.forEach((value, index) => {
            const ta = w.document.createElement('textarea')
            ta.className = 'list-item-textarea'
            ta.dataset.blockId = String(blockId)
            ta.dataset.itemIndex = String(index)
            ta.value = value
            ta.addEventListener('input', () => { w.__inputs = (w.__inputs || []); w.__inputs.push(`${index}:${ta.value}`) })
            panel.appendChild(ta)
        })
        return [panel, [...panel.querySelectorAll('textarea')]]
    }

    test('поле встаёт на место курсора в пункте, где он был последним', () => {
        const w = makeWindow()
        const [panel, items] = listPanel(w, 5, ['Первый', 'Второй пункт!', 'Третий'])
        items[1].setSelectionRange(12, 12)             // перед «!»

        w.AdminBulkMail.insertIntoListItem(panel, 5, 'ФИО', items[1])

        expect(items[1].value).toBe('Второй пункт{{ФИО}}!')
        expect(items[0].value).toBe('Первый')
        expect(items[2].value).toBe('Третий')
    })

    test('вставка вызывает input — штатный обработчик пункта сохраняет значение', () => {
        const w = makeWindow()
        const [panel, items] = listPanel(w, 5, ['Первый'])
        items[0].setSelectionRange(6, 6)

        w.AdminBulkMail.insertIntoListItem(panel, 5, 'ФИО', items[0])

        expect(w.__inputs).toEqual(['0:Первый{{ФИО}}'])
    })

    test('курсор ни в один пункт не ставили — вставка в последний пункт', () => {
        const w = makeWindow()
        const [panel, items] = listPanel(w, 5, ['Первый', 'Последний'])
        items[1].setSelectionRange(9, 9)

        w.AdminBulkMail.insertIntoListItem(panel, 5, 'ФИО', null)

        expect(items[0].value).toBe('Первый')
        expect(items[1].value).toBe('Последний{{ФИО}}')
    })

    test('пункты другого списка не затрагиваются', () => {
        const w = makeWindow()
        const [panel, items] = listPanel(w, 5, ['Один'])
        const other = w.document.createElement('textarea')
        other.className = 'list-item-textarea'
        other.dataset.blockId = '9'
        other.value = 'Чужой'
        panel.appendChild(other)

        w.AdminBulkMail.insertIntoListItem(panel, 5, 'ФИО', other)   // «последний» не из этого списка

        expect(other.value).toBe('Чужой')
        expect(items[0].value).toContain('{{ФИО}}')
    })
})

describe('admin: вставка плейсхолдера в блок «Важно»', () => {
    test('поле встаёт на место курсора, значение сохраняет штатный обработчик input', () => {
        const w = makeWindow()
        const ta = w.document.createElement('textarea')
        ta.dataset.blockId = '4'
        ta.dataset.settingKey = 'text'
        ta.value = 'Важная информация, срок до пятницы!'
        ta.addEventListener('input', () => { w.__inputs = (w.__inputs || []); w.__inputs.push(ta.value) })
        w.document.getElementById('settings').appendChild(ta)
        ta.setSelectionRange(19, 19)                    // после «информация,» и пробела

        w.AdminBulkMail.insertViaInput(4, 'text', 'ФИО')

        expect(ta.value).toBe('Важная информация, {{ФИО}}срок до пятницы!')
        expect(w.__inputs).toEqual([ta.value])
    })

    test('поля нет в панели — ничего не ломается', () => {
        const w = makeWindow()
        expect(() => w.AdminBulkMail.insertViaInput(99, 'text', 'ФИО')).not.toThrow()
    })
})
