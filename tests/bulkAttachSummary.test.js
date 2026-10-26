/**
 * tests/bulkAttachSummary.test.js
 *
 * Сводка по вложениям до отправки (static/js/user/bulkAttachSummary.js).
 */

const S = require('../static/js/user/bulkAttachSummary.js')

const MB = 1024 * 1024

const individual = (over = {}) => ({
    index: 0, kind: 'individual', label: 'Вложение 1: индивидуальное ({{ФИО}}.pdf)',
    found: 8, missing: 0, ambiguous: 0, blocked: 0, other: 0, problems: [], policy: 'send', files: 0, ...over
})

const common = (over = {}) => ({
    index: 0, kind: 'common', label: 'Вложение 1: общие файлы',
    found: 10, missing: 0, ambiguous: 0, blocked: 0, other: 0, problems: [], policy: 'send', files: 2, ...over
})

const report = (attachments, over = {}) => ({
    limit_bytes: 10 * MB, files_budget: 7 * MB, rows_checked: 10, common_bytes: 3 * MB,
    oversize: { count: 0, max_bytes: 4 * MB, rows: [] }, attachments, ...over
})

describe('summarize', () => {
    test('всё найдено — зелёный итог', () => {
        const model = S.summarize(report([individual({ found: 10 })]))
        expect(model.tone).toBe('ok')
        expect(model.blocks[0].lines[0].text).toBe('Найдено: 10 из 10')
    })

    test('не найдено: правило «отправить без вложения»', () => {
        const model = S.summarize(report([individual({ found: 7, missing: 3, policy: 'send' })]))
        const block = model.blocks[0]
        expect(block.tone).toBe('warn')
        expect(block.lines.map(l => l.text)).toContain('Не найдено: 3')
        expect(block.lines.at(-1).text).toBe('Итог: 3 письма уйдут без этого вложения')
    })

    test('правило «пропустить получателя»', () => {
        const model = S.summarize(report([individual({ found: 9, missing: 1, policy: 'skip' })]))
        expect(model.blocks[0].lines.at(-1).text).toBe('Итог: 1 получатель будет пропущен')
    })

    test('правило «остановить» — красный итог', () => {
        const model = S.summarize(report([individual({ found: 9, missing: 1, policy: 'stop' })]))
        expect(model.blocks[0].tone).toBe('err')
        expect(model.tone).toBe('err')
        expect(model.blocks[0].lines.at(-1).text).toContain('остановится')
    })

    test('неоднозначные и запрещённые типы называются отдельно', () => {
        const model = S.summarize(report([individual({ found: 6, ambiguous: 2, blocked: 2 })]))
        const texts = model.blocks[0].lines.map(l => l.text)
        expect(texts.some(t => t.startsWith('Неоднозначно'))).toBe(true)
        expect(texts.some(t => t.includes('почтовые серверы'))).toBe(true)
        expect(model.blocks[0].tone).toBe('err')
    })

    test('общие файлы: сколько и какого размера, получат все', () => {
        const model = S.summarize(report([common()]))
        expect(model.blocks[0].lines[0].text).toBe('2 файла, 3,0 МБ — получат все (10)')
        expect(model.tone).toBe('ok')
    })

    test('размер: самое большое письмо в пределах лимита', () => {
        const model = S.summarize(report([common()]))
        expect(model.size).toEqual({ tone: 'ok', text: 'Самое большое письмо ≈ 4,0 МБ из 10,0 МБ' })
    })

    test('размер: письма не поместятся — красная строка с числом писем', () => {
        const model = S.summarize(report([common()], { oversize: { count: 3, max_bytes: 12 * MB, rows: [] } }))
        expect(model.size.tone).toBe('err')
        expect(model.size.text).toContain('3 письма не уйдут')
        expect(model.tone).toBe('err')
    })

    test('без вложений сводка пустая', () => {
        const model = S.summarize(report([]))
        expect(model.blocks).toEqual([])
        expect(model.size).toBeNull()
    })

    test('«и ещё N»: проблем больше, чем пришло в списке', () => {
        const entry = individual({ found: 0, missing: 40, problems: [{ row: 1, email: 'a', expected: 'x', text: 't' }] })
        expect(S.summarize(report([entry])).blocks[0].hidden).toBe(39)
    })
})

describe('rowProblems / problemRows', () => {
    const entry = individual({
        label: 'Вложение 2: индивидуальное (колонка «Файл»)',
        found: 1, missing: 2,
        problems: [
            { row: 5, email: 'p@x.ru', expected: 'Пётр.pdf', reason: 'missing', text: 'файл не найден' },
            { row: 2, email: 'a@x.ru', expected: '', reason: 'no_name', text: 'в таблице не указано имя файла' },
        ]
    })
    const r = report([entry], { oversize: { count: 1, max_bytes: 11 * MB, rows: [{ row: 7, email: 'z', bytes: 11 * MB }] } })

    test('проблемы конкретной строки для подсказки при просмотре', () => {
        expect(S.rowProblems(r, 5)).toEqual(['Вложение 2: «Пётр.pdf» — файл не найден'])
        expect(S.rowProblems(r, 2)).toEqual(['Вложение 2: в таблице не указано имя файла'])
        expect(S.rowProblems(r, 3)).toEqual([])
    })

    test('строка, не помещающаяся в лимит', () => {
        expect(S.rowProblems(r, 7)).toEqual(['Письмо больше лимита 10,0 МБ'])
    })

    test('нет проверки — нет подсказок', () => {
        expect(S.rowProblems(null, 1)).toEqual([])
        expect(S.problemRows(null)).toEqual([])
    })

    test('номера проблемных строк по возрастанию без повторов', () => {
        expect(S.problemRows(r)).toEqual([2, 5, 7])
    })
})
