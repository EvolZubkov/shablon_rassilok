/**
 * tests/bulkMailPanelFlow.test.js
 *
 * Панель рассылки целиком на jsdom: настоящая разметка index-user.html и настоящие
 * скрипты bulkPlaceholders.js / bulk-mail-panel.js. Проверяется то, что собирает вместе
 * разметку и логику: чипы колонок, «где используется», замена файла без сброса.
 */

const { makePanel, parsed } = require('./helpers/bulkPanelWindow.js')

const FIRST = parsed(['ФИО', 'Email', 'Сумма'], [{ ФИО: 'Иван', Email: 'a@b.ru', Сумма: '5' }])

function mappingRows(window) {
    return [...window.document.querySelectorAll('#bm-mapping-list .bm-mapping-row')]
}

function typeSubject(window, value) {
    const subject = window.document.getElementById('bm-subject')
    subject.value = value
    subject.setSelectionRange(value.length, value.length)
    subject.dispatchEvent(new window.Event('input', { bubbles: true }))
    return subject
}

function openPicker(window, containerId) {
    const container = window.document.getElementById(containerId)
    container.querySelector('.bm-field-picker-btn').click()
    return container
}

describe('панель рассылки: список колонок под темой и файлом', () => {
    let window
    beforeEach(async () => {
        window = await makePanel()
        window.BulkMailPanel.loadParsed('данные.xlsx', FIRST)
    })

    test('колонки спрятаны: до нажатия виден только кнопка, список закрыт', () => {
        const container = window.document.getElementById('bm-subject-chips')
        expect(container.querySelector('.bm-field-picker-btn')).not.toBeNull()
        expect(container.querySelector('.bm-field-picker').hidden).toBe(true)
        expect(window.document.querySelectorAll('.bm-ph-chip')).toHaveLength(0)
    })

    test('в списке колонки без email, у темы и у имени файла', () => {
        const items = id => [...openPicker(window, id).querySelectorAll('.bm-field-picker-item')].map(i => i.textContent)
        expect(items('bm-subject-chips')).toEqual(['ФИО', 'Сумма'])
        expect(items('bm-subject-chips')).toEqual(['ФИО', 'Сумма'])
    })

    test('поиск сужает список', () => {
        const container = openPicker(window, 'bm-subject-chips')
        const search = container.querySelector('.bm-field-picker-search')
        search.value = 'сум'
        search.dispatchEvent(new window.Event('input'))
        expect([...container.querySelectorAll('.bm-field-picker-item')].map(i => i.textContent)).toEqual(['Сумма'])
        search.value = 'zzz'
        search.dispatchEvent(new window.Event('input'))
        expect(container.querySelector('.bm-field-picker-empty')).not.toBeNull()
    })

    test('выбор вставляет поле в позицию курсора темы и закрывает список', () => {
        const subject = window.document.getElementById('bm-subject')
        subject.value = 'Для '
        subject.setSelectionRange(4, 4)
        const container = openPicker(window, 'bm-subject-chips')
        container.querySelector('.bm-field-picker-item').click()
        expect(subject.value).toBe('Для {{ФИО}}')
        expect(subject.selectionStart).toBe('Для {{ФИО}}'.length)
        expect(container.querySelector('.bm-field-picker').hidden).toBe(true)
    })

    test('вставка в середину сохраняет текст вокруг', () => {
        const subject = window.document.getElementById('bm-subject')
        subject.value = 'Счёт на сумму'
        subject.setSelectionRange(5, 5)
        const container = openPicker(window, 'bm-subject-chips')
        const item = [...container.querySelectorAll('.bm-field-picker-item')].find(i => i.textContent === 'Сумма')
        item.click()
        expect(subject.value).toBe('Счёт {{Сумма}}на сумму')
    })

    test('Enter в поиске выбирает первый найденный, Escape закрывает', () => {
        const container = openPicker(window, 'bm-subject-chips')
        const search = container.querySelector('.bm-field-picker-search')
        search.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        expect(container.querySelector('.bm-field-picker').hidden).toBe(true)

        openPicker(window, 'bm-subject-chips')
        search.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
        expect(window.document.getElementById('bm-subject').value).toBe('{{ФИО}}')
    })

    test('200 колонок: в DOM одна кнопка, список с прокруткой', () => {
        const headers = Array.from({ length: 200 }, (_, i) => `Колонка ${i}`)
        window.BulkMailPanel.loadParsed('большой.xlsx', parsed(headers, [{}]))
        const container = openPicker(window, 'bm-subject-chips')
        expect(container.querySelectorAll('.bm-field-picker-item')).toHaveLength(200)
        expect(container.querySelector('.bm-field-picker-list').style.maxHeight).toBe('256px')
    })
})

describe('панель рассылки: одно поле в нескольких местах', () => {
    test('{{ФИО}} и {{фио}} в теме — одна строка сопоставления, колонка подобрана', async () => {
        const window = await makePanel()
        window.BulkMailPanel.loadParsed('данные.xlsx', FIRST)
        typeSubject(window, '{{ФИО}} и {{фио}}')
        await new Promise(r => setTimeout(r, 400))

        const rows = mappingRows(window)
        expect(rows).toHaveLength(1)
        expect(rows[0].querySelector('select').value).toBe('ФИО')
    })

    test('строка сопоставления показывает, где поле используется', async () => {
        const window = await makePanel()
        window.BulkMailPanel.loadParsed('данные.xlsx', FIRST)
        typeSubject(window, 'Для {{ФИО}}')
        await new Promise(r => setTimeout(r, 400))

        expect(mappingRows(window)[0].querySelector('.bm-mapping-usage').textContent).toBe('тема')
    })

    test('выбор колонки у одной строки действует на все написания', async () => {
        const window = await makePanel()
        window.BulkMailPanel.loadParsed('данные.xlsx', FIRST)
        typeSubject(window, '{{Имя}} {{имя}}')
        await new Promise(r => setTimeout(r, 400))

        const select = mappingRows(window)[0].querySelector('select')
        select.value = 'Сумма'
        select.dispatchEvent(new window.Event('change'))
        // следующая перерисовка списка сохраняет выбор для обоих написаний
        typeSubject(window, '{{Имя}} {{имя}} ')
        await new Promise(r => setTimeout(r, 400))
        expect(mappingRows(window)[0].querySelector('select').value).toBe('Сумма')
    })
})

describe('панель рассылки: замена файла', () => {
    function replaceWith(window, data, name = 'новый.xlsx') {
        window.fetch = async () => ({
            ok: true, status: 200,
            headers: { get: () => 'application/json' },
            json: async () => data
        })
        const input = window.document.getElementById('bm-file-replace-input')
        const file = new window.File(['x'], name)
        Object.defineProperty(input, 'files', { value: [file], configurable: true })
        input.dispatchEvent(new window.Event('change'))
        return new Promise(r => setTimeout(r, 50))
    }

    test('сопоставление и тема остаются, в отчёте новые и пропавшие колонки', async () => {
        const window = await makePanel()
        window.BulkMailPanel.loadParsed('старый.xlsx', FIRST)
        typeSubject(window, 'Для {{ФИО}}, {{Сумма}}')
        await new Promise(r => setTimeout(r, 400))
        const sumRow = mappingRows(window).find(r => r.textContent.includes('{{Сумма}}'))
        expect(sumRow.querySelector('select').value).toBe('Сумма')

        await replaceWith(window, parsed(['ФИО', 'Email', 'Дата'], [
            { ФИО: 'Пётр', Email: 'p@b.ru', Дата: '1' }, { ФИО: 'Анна', Email: 'a@b.ru', Дата: '2' }
        ]))

        expect(window.document.getElementById('bm-subject').value).toBe('Для {{ФИО}}, {{Сумма}}')
        const rows = mappingRows(window)
        const fio = rows.find(r => r.textContent.includes('{{ФИО}}'))
        const sum = rows.find(r => r.textContent.includes('{{Сумма}}'))
        expect(fio.querySelector('select').value).toBe('ФИО')
        expect(sum.querySelector('select').value).toBe('')

        const note = window.document.getElementById('bm-replace-note')
        expect(note.style.display).toBe('block')
        expect(note.textContent).toContain('Новые колонки: Дата')
        expect(note.textContent).toContain('Пропали колонки: Сумма')
        expect(note.textContent).toContain('{{Сумма}}')
        expect(window.document.getElementById('bm-file-count').textContent).toBe('2 строк')
    })

    test('колонка email сохраняется, если есть и в новом файле', async () => {
        const window = await makePanel()
        window.BulkMailPanel.loadParsed('старый.xlsx', parsed(['Почта', 'Рабочий email'], [{}]))
        const emailSel = window.document.getElementById('bm-email-col')
        emailSel.value = 'Рабочий email'
        emailSel.dispatchEvent(new window.Event('change'))

        await replaceWith(window, parsed(['Почта', 'Рабочий email'], [{}, {}]))
        expect(window.document.getElementById('bm-email-col').value).toBe('Рабочий email')
    })

    test('ошибка чтения нового файла оставляет прежний в работе', async () => {
        const window = await makePanel()
        window.BulkMailPanel.loadParsed('старый.xlsx', FIRST)
        window.fetch = async () => ({
            ok: false, status: 400,
            headers: { get: () => 'application/json' },
            json: async () => ({ error: 'битый файл' })
        })
        const input = window.document.getElementById('bm-file-replace-input')
        Object.defineProperty(input, 'files', { value: [new window.File(['x'], 'плохой.xlsx')], configurable: true })
        input.dispatchEvent(new window.Event('change'))
        await new Promise(r => setTimeout(r, 50))

        expect(window.document.getElementById('bm-file-name').textContent).toBe('старый.xlsx')
        expect(window.document.getElementById('bm-file-count').textContent).toBe('1 строк')
        expect(window.document.getElementById('bm-replace-note').textContent).toContain('битый файл')
        expect(window.document.getElementById('bm-replace-note').classList.contains('bm-replace-note--error')).toBe(true)
    })

    test('«убрать файл» прячет отчёт и чипы', async () => {
        const window = await makePanel()
        window.BulkMailPanel.loadParsed('старый.xlsx', FIRST)
        await replaceWith(window, FIRST)
        window.document.getElementById('bm-file-clear').click()

        expect(window.document.getElementById('bm-replace-note').style.display).toBe('none')
        expect(window.document.querySelectorAll('#bm-subject-chips .bm-ph-chip')).toHaveLength(0)
    })
})

describe('панель рассылки: широкая раскладка', () => {
    test('класс bm-wide включается от 560px и выключается при сужении', async () => {
        const callbacks = []
        const window = await makePanel({
            beforeScripts: win => {
                win.ResizeObserver = class { constructor(cb) { callbacks.push(cb) } observe() {} disconnect() {} }
                win.requestAnimationFrame = fn => fn()
            }
        })
        const host = window.document.getElementById('bm-settings-section').parentElement
        const notify = width => callbacks.forEach(cb => cb([{ contentRect: { width } }]))
        notify(700)
        expect(host.classList.contains('bm-wide')).toBe(true)
        notify(420)
        expect(host.classList.contains('bm-wide')).toBe(false)
    })
})
