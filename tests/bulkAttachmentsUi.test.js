/**
 * tests/bulkAttachmentsUi.test.js
 *
 * Вложения в окне рассылки целиком на jsdom: карточки двух видов, загрузка нескольких
 * файлов, лимит и опасные типы до отправки, проверка перед отправкой и сводка.
 */

const { makePanel, parsed, routerFetch, wait } = require('./helpers/bulkPanelWindow.js')

const MB = 1024 * 1024
const LIMITS = { limit_bytes: 10 * MB, budget_bytes: 7 * MB, max_files: 10, blocked: ['.exe', '.bat'] }
const DATA = parsed(['ФИО', 'Email', 'Файл'], [
    { ФИО: 'Иван', Email: 'i@x.ru', Файл: 'Иван.pdf' },
    { ФИО: 'Пётр', Email: 'p@x.ru', Файл: 'Пётр.pdf' },
])

const EMPTY_REPORT = {
    limit_bytes: LIMITS.limit_bytes, files_budget: LIMITS.budget_bytes, rows_checked: 2, common_bytes: 0,
    oversize: { count: 0, max_bytes: 300 * 1024, rows: [] }, attachments: [],
}

// jsdom не даёт задать размер File: размеры помнит эта таблица, а заглушка сервера читает из неё
const SIZES = {}

function fakeFile(window, name, size) {
    SIZES[name] = size
    const file = new window.File(['x'], name)
    Object.defineProperty(file, 'size', { value: size })
    return file
}

async function setup(extraRoutes = {}) {
    const calls = []
    const routes = {
        '/api/bulk/attach/limits': () => LIMITS,
        '/api/bulk/attach/upload': form => {
            const files = form.getAll('files').map((f, i) => ({ token: String(i).padStart(32, 'a'), name: f.name, size: SIZES[f.name] }))
            return { files, rejected: [], ...LIMITS }
        },
        '/api/bulk/attach/delete': () => ({ ok: true }),
        '/api/bulk/preflight': () => EMPTY_REPORT,
        ...extraRoutes,
    }
    const window = await makePanel({ fetch: routerFetch(routes, calls) })
    window.BulkMailPanel.loadParsed('данные.xlsx', DATA)
    return { window, calls, doc: window.document }
}

const $ = (doc, id) => doc.getElementById(id)

async function uploadFiles(window, files) {
    const doc = window.document
    $(doc, 'bm-attach-add-common').click()
    const input = doc.querySelector('#bm-attachments input[type=file]')
    Object.defineProperty(input, 'files', { value: files, configurable: true })
    input.dispatchEvent(new window.Event('change'))
    await wait(30)
}

describe('карточки вложений', () => {
    test('в начале вложений нет, подсказка видна', async () => {
        const { doc } = await setup()
        expect(doc.querySelectorAll('.bm-att-card')).toHaveLength(0)
        expect($(doc, 'bm-attach-empty').hidden).toBe(false)
    })

    test('можно добавить и общее, и индивидуальное, и ещё одно индивидуальное', async () => {
        const { window, doc } = await setup()
        await uploadFiles(window, [fakeFile(window, 'a.pdf', 1000)])
        $(doc, 'bm-attach-add-individual').click()
        $(doc, 'bm-attach-add-individual').click()
        const titles = [...doc.querySelectorAll('.bm-att-title')].map(n => n.textContent)
        expect(titles).toEqual([
            '1. Файлы для всех получателей', '2. Индивидуальное по таблице', '3. Индивидуальное по таблице'])
        expect($(doc, 'bm-attach-empty').hidden).toBe(true)
    })

    test('карточку можно убрать, нумерация пересчитывается', async () => {
        const { doc } = await setup()
        $(doc, 'bm-attach-add-individual').click()
        $(doc, 'bm-attach-add-individual').click()
        doc.querySelector('.bm-att-card .bm-btn-clear').click()
        expect([...doc.querySelectorAll('.bm-att-title')].map(n => n.textContent)).toEqual(['1. Индивидуальное по таблице'])
    })

    test('индивидуальная: режим «Колонка» показывает выбор колонки со всеми колонками файла', async () => {
        const { window, doc } = await setup()
        $(doc, 'bm-attach-add-individual').click()
        const radio = doc.querySelector('.bm-att-card input[type=radio][value=column]')
        radio.checked = true
        radio.dispatchEvent(new window.Event('change'))
        const options = [...doc.querySelectorAll('.bm-att-card select')[0].options].map(o => o.value)
        expect(options).toEqual(['', 'ФИО', 'Email', 'Файл'])
    })

    test('поле шаблона имени файла: колонки вставляются через список', async () => {
        const { doc } = await setup()
        $(doc, 'bm-attach-add-individual').click()
        const card = doc.querySelector('.bm-att-card')
        const [, input] = card.querySelectorAll('input[type=text]')   // первое поле — папка
        const chips = card.querySelector('.bm-ph-chips')
        chips.querySelector('.bm-field-picker-btn').click()
        chips.querySelector('.bm-field-picker-item').click()
        expect(input.value).toBe('{{ФИО}}')
    })

    test('поле из имени файла попадает в список плейсхолдеров «где используется: файл»', async () => {
        const { window, doc } = await setup()
        $(doc, 'bm-attach-add-individual').click()
        const input = doc.querySelectorAll('.bm-att-card input[type=text]')[1]
        input.value = '{{ФИО}}.pdf'
        input.dispatchEvent(new window.Event('input', { bubbles: true }))
        await wait(400)
        const row = doc.querySelector('#bm-mapping-list .bm-mapping-row')
        expect(row.querySelector('.bm-mapping-usage').textContent).toBe('файл')
    })
})

describe('общие файлы', () => {
    test('несколько файлов загружаются за один раз и видны списком с размером', async () => {
        const { window, doc, calls } = await setup()
        await uploadFiles(window, [fakeFile(window, 'a.pdf', 1024), fakeFile(window, 'b.docx', 2 * MB)])
        const names = [...doc.querySelectorAll('.bm-att-file-name')].map(n => n.textContent)
        expect(names).toEqual(['a.pdf', 'b.docx'])
        expect([...doc.querySelectorAll('.bm-att-file-size')].map(n => n.textContent)).toEqual(['1 КБ', '2,0 МБ'])
        expect(calls.filter(c => c.url === '/api/bulk/attach/upload')).toHaveLength(1)
    })

    test('опасный тип отклоняется до загрузки, остальные загружаются', async () => {
        const { window, doc, calls } = await setup()
        await uploadFiles(window, [fakeFile(window, 'virus.exe', 100), fakeFile(window, 'ok.pdf', 100)])
        expect([...doc.querySelectorAll('.bm-att-file-name')].map(n => n.textContent)).toEqual(['ok.pdf'])
        expect(doc.querySelector('.bm-att-error').textContent).toContain('.exe')
        const sent = calls.find(c => c.url === '/api/bulk/attach/upload').init.body.getAll('files')
        expect(sent.map(f => f.name)).toEqual(['ok.pdf'])
    })

    test('файл, который не помещается в письмо, не добавляется и не уходит на сервер', async () => {
        const { window, doc, calls } = await setup()
        await uploadFiles(window, [fakeFile(window, 'big.pdf', 8 * MB)])
        expect(doc.querySelectorAll('.bm-att-file')).toHaveLength(0)
        expect(doc.querySelector('.bm-att-error').textContent).toContain('не помещается')
        expect(calls.some(c => c.url === '/api/bulk/attach/upload')).toBe(false)
    })

    test('лимит считается по всем общим файлам вместе', async () => {
        const { window, doc } = await setup()
        await uploadFiles(window, [fakeFile(window, 'a.pdf', 4 * MB)])
        await uploadFiles(window, [fakeFile(window, 'b.pdf', 4 * MB)])
        const names = [...doc.querySelectorAll('.bm-att-file-name')].map(n => n.textContent)
        expect(names).toEqual(['a.pdf'])
        expect(doc.querySelectorAll('.bm-att-error').length).toBeGreaterThan(0)
    })

    test('удаление файла сообщает серверу и убирает строку', async () => {
        const { window, doc, calls } = await setup()
        await uploadFiles(window, [fakeFile(window, 'a.pdf', 100)])
        doc.querySelector('.bm-att-file .bm-btn-clear').click()
        expect(doc.querySelectorAll('.bm-att-file')).toHaveLength(0)
        expect(calls.some(c => c.url === '/api/bulk/attach/delete')).toBe(true)
    })

    test('индикатор показывает занятый размер', async () => {
        const { window, doc } = await setup()
        await uploadFiles(window, [fakeFile(window, 'a.pdf', MB)])
        expect(doc.querySelector('.bm-att-meter-text').textContent).toContain('1,0 МБ из 7,0 МБ')
    })
})

describe('проверка перед отправкой и сводка', () => {
    const REPORT = {
        ...EMPTY_REPORT,
        attachments: [{
            index: 0, kind: 'individual', label: 'Вложение 1: индивидуальное (колонка «Файл»)',
            found: 1, missing: 1, ambiguous: 0, blocked: 0, other: 0, policy: 'skip', files: 0,
            problems: [{ row: 2, email: 'p@x.ru', expected: 'Пётр.pdf', reason: 'missing', text: 'файл не найден' }],
        }],
    }

    async function withIndividual(routes) {
        const ctx = await setup({ '/api/bulk/preflight': () => REPORT, ...routes })
        const { window, doc } = ctx
        $(doc, 'bm-attach-add-individual').click()
        const card = doc.querySelector('.bm-att-card')
        const radio = card.querySelector('input[type=radio][value=column]')
        radio.checked = true
        radio.dispatchEvent(new window.Event('change'))
        const folder = doc.querySelector('.bm-att-card input[type=text]')
        folder.value = 'C:\\docs'
        folder.dispatchEvent(new window.Event('input', { bubbles: true }))
        const select = doc.querySelector('.bm-att-card select')
        select.value = 'Файл'
        select.dispatchEvent(new window.Event('change'))
        await wait(600)
        return ctx
    }

    test('сводка показывает, чего не хватает, и что будет с такими получателями', async () => {
        const { doc } = await withIndividual()
        const box = $(doc, 'bm-sum-attach')
        expect(box.textContent).toContain('Найдено: 1 из 2')
        expect(box.textContent).toContain('Не найдено: 1')
        expect(box.textContent).toContain('1 получатель будет пропущен')
        expect(box.textContent).toContain('Пётр.pdf')
    })

    test('на проверку уходят строки, сопоставление и настройки вложения', async () => {
        const { calls } = await withIndividual()
        const call = calls.filter(c => c.url === '/api/bulk/preflight').at(-1)
        const body = JSON.parse(call.init.body)
        expect(body.rows).toHaveLength(2)
        expect(body.email_column).toBe('Email')
        expect(body.attachments[0]).toMatchObject({ kind: 'individual', folder: 'C:\\docs', mode: 'column', column: 'Файл' })
    })

    test('недозаполненная карточка: вместо проверки подсказка, на сервер ничего не уходит', async () => {
        const { doc, calls } = await setup()
        $(doc, 'bm-attach-add-individual').click()
        await wait(600)
        expect(calls.some(c => c.url === '/api/bulk/preflight')).toBe(false)
        expect($(doc, 'bm-sum-attach').textContent).toContain('укажите папку')
    })

    test('без вложений проверка не запускается, сводка пустая', async () => {
        const { doc, calls } = await setup()
        await wait(600)
        expect(calls.some(c => c.url === '/api/bulk/preflight')).toBe(false)
        expect($(doc, 'bm-sum-attach').textContent).toBe('')
    })

    test('ответ сервера с ошибкой показывается в сводке', async () => {
        const { doc } = await withIndividual({ '/api/bulk/preflight': () => { throw new Error('сервер недоступен') } })
        expect($(doc, 'bm-sum-attach').textContent).toContain('Не удалось проверить вложения')
    })

    test('замена файла данных пересчитывает проверку вложений', async () => {
        const { window, doc, calls } = await withIndividual()
        const before = calls.filter(c => c.url === '/api/bulk/preflight').length
        window.BulkMailPanel.loadParsed('новый.xlsx', parsed(['ФИО', 'Email', 'Файл'], [{ ФИО: 'А', Email: 'a@x.ru', Файл: 'А.pdf' }]))
        await wait(600)
        expect(calls.filter(c => c.url === '/api/bulk/preflight').length).toBe(before + 1)
        expect($(doc, 'bm-attach-add-common')).not.toBeNull()
    })
})

describe('отправка', () => {
    test('в запрос уходит список вложений обоих видов', async () => {
        const startBodies = []
        const { window, doc } = await setup({
            '/api/bulk/send/start': body => { startBodies.push(body); throw new Error('стоп') },
        })
        await uploadFiles(window, [fakeFile(window, 'a.pdf', 100)])
        $(doc, 'bm-attach-add-individual').click()
        const [folder] = doc.querySelectorAll('.bm-att-card--individual input[type=text]')
        folder.value = 'C:\\docs'
        folder.dispatchEvent(new window.Event('input', { bubbles: true }))
        const tpl = doc.querySelectorAll('.bm-att-card--individual input[type=text]')[1]
        tpl.value = '{{ФИО}}.pdf'
        tpl.dispatchEvent(new window.Event('input', { bubbles: true }))
        $(doc, 'btn-bulk-send').click()
        await wait(700)
        $(doc, 'bm-confirm-ok')?.click()
        await wait(100)
        expect(startBodies).toHaveLength(1)
        const specs = startBodies[0].attachments
        expect(specs.map(s => s.kind)).toEqual(['common', 'individual'])
        expect(specs[0].files).toHaveLength(1)
        expect(specs[1]).toMatchObject({ folder: 'C:\\docs', mode: 'template', template: '{{ФИО}}.pdf' })
        expect(startBodies[0].attach_enabled).toBeUndefined()
    })

    test('недозаполненное вложение блокирует отправку с понятным сообщением', async () => {
        const startBodies = []
        const { window, doc } = await setup({ '/api/bulk/send/start': body => { startBodies.push(body); return { job_id: 'x' } } })
        $(doc, 'bm-attach-add-individual').click()
        $(doc, 'btn-bulk-send').click()
        await wait(700)
        $(doc, 'bm-confirm-ok')?.click()
        await wait(100)
        expect(startBodies).toHaveLength(0)
        expect(window.Toast.messages.at(-1).text).toContain('Вложение 1: укажите папку')
    })
})
