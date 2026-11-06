/**
 * tests/bulkPlaceholders.test.js
 *
 * Чистая логика плейсхолдеров рассылки (static/js/user/bulkPlaceholders.js).
 */

const BP = require('../static/js/user/bulkPlaceholders.js')

describe('normKey', () => {
    test('регистр, ё/е и пробелы не важны', () => {
        expect(BP.normKey('  Фамилия  Имя ')).toBe(BP.normKey('фамилия имя'))
        expect(BP.normKey('Всё')).toBe(BP.normKey('все'))
    })

    test('пустое значение даёт пустую строку', () => {
        expect(BP.normKey(null)).toBe('')
        expect(BP.normKey(undefined)).toBe('')
    })
})

describe('findPlaceholders', () => {
    test('без повторов, в порядке появления', () => {
        expect(BP.findPlaceholders('{{A}} и {{B}} и {{A}}')).toEqual(['{{A}}', '{{B}}'])
    })

    test('регистр различается: это разные записи одного поля', () => {
        expect(BP.findPlaceholders('{{ФИО}} {{фио}}')).toEqual(['{{ФИО}}', '{{фио}}'])
    })

    test('пустой и неполный текст не даёт плейсхолдеров', () => {
        expect(BP.findPlaceholders('')).toEqual([])
        expect(BP.findPlaceholders(null)).toEqual([])
        expect(BP.findPlaceholders('{{ без закрытия')).toEqual([])
    })
})

describe('countUsage', () => {
    test('считает вхождения в теле, теме и имени файла отдельно', () => {
        const usage = BP.countUsage({
            body: '{{ФИО}}, здравствуйте. {{ФИО}}!',
            subject: 'Для {{ФИО}}',
            file: '{{Файл}}.pdf'
        })
        expect(usage['{{ФИО}}']).toEqual({ body: 2, subject: 1, file: 0 })
        expect(usage['{{Файл}}']).toEqual({ body: 0, subject: 0, file: 1 })
    })
})

describe('usageLabel', () => {
    test('перечисляет места, повторы помечает ×N', () => {
        expect(BP.usageLabel({ body: 2, subject: 1, file: 1 })).toBe('тело ×2 · тема · файл')
        expect(BP.usageLabel({ body: 1, subject: 0, file: 0 })).toBe('тело')
        expect(BP.usageLabel(undefined)).toBe('')
    })
})

describe('groupByKey', () => {
    test('варианты с разным регистром собираются в одну группу', () => {
        const groups = BP.groupByKey(['{{ФИО}}', '{{Дата}}', '{{фио}}'])
        expect(groups).toHaveLength(2)
        expect(groups[0].variants).toEqual(['{{ФИО}}', '{{фио}}'])
        expect(groups[0].label).toBe('{{ФИО}}')
    })

    test('groupUsage суммирует по вариантам', () => {
        const [group] = BP.groupByKey(['{{ФИО}}', '{{фио}}'])
        const usage = {
            '{{ФИО}}': { body: 1, subject: 0, file: 0 },
            '{{фио}}': { body: 0, subject: 1, file: 0 }
        }
        expect(BP.groupUsage(group, usage)).toEqual({ body: 1, subject: 1, file: 0 })
    })
})

describe('resolveMapping', () => {
    const headers = ['ФИО', 'Email', 'Дата']

    test('новый плейсхолдер подбирается по имени колонки без учёта регистра', () => {
        const mapping = BP.resolveMapping(['{{фио}}'], [], {}, headers)
        expect(mapping).toEqual({ '{{фио}}': 'ФИО' })
    })

    test('{{ФИО}} в теле и {{фио}} в теме получают одну колонку', () => {
        const mapping = BP.resolveMapping(['{{ФИО}}', '{{фио}}'], [], {}, headers)
        expect(mapping).toEqual({ '{{ФИО}}': 'ФИО', '{{фио}}': 'ФИО' })
    })

    test('неизвестное имя остаётся несопоставленным', () => {
        expect(BP.resolveMapping(['{{Город}}'], [], {}, headers)).toEqual({})
    })

    test('выбор пользователя сохраняется', () => {
        const mapping = BP.resolveMapping(['{{ФИО}}'], ['{{ФИО}}'], { '{{ФИО}}': 'Дата' }, headers)
        expect(mapping).toEqual({ '{{ФИО}}': 'Дата' })
    })

    test('«не задано» не заменяется автоподбором, пока плейсхолдер тот же', () => {
        expect(BP.resolveMapping(['{{ФИО}}'], ['{{ФИО}}'], {}, headers)).toEqual({})
    })

    test('выбор распространяется на новый вариант написания', () => {
        const mapping = BP.resolveMapping(
            ['{{ФИО}}', '{{фио}}'], ['{{ФИО}}'], { '{{ФИО}}': 'Дата' }, headers)
        expect(mapping).toEqual({ '{{ФИО}}': 'Дата', '{{фио}}': 'Дата' })
    })

    test('колонка в новом файле лишь сменила регистр — сопоставление переезжает на неё', () => {
        const mapping = BP.resolveMapping(['{{Имя}}'], ['{{Имя}}'], { '{{Имя}}': 'ФИО' }, ['фио'])
        expect(mapping).toEqual({ '{{Имя}}': 'фио' })
    })

    test('колонка пропала из файла — сопоставление снимается', () => {
        const mapping = BP.resolveMapping(['{{ФИО}}'], ['{{ФИО}}'], { '{{ФИО}}': 'Старая' }, headers)
        expect(mapping).toEqual({})
    })
})

describe('diffHeaders', () => {
    test('новые и пропавшие колонки', () => {
        const diff = BP.diffHeaders(['ФИО', 'Email', 'Сумма'], ['фио', 'Email', 'Дата'])
        expect(diff).toEqual({ added: ['Дата'], removed: ['Сумма'] })
    })

    test('одинаковый набор — без отличий', () => {
        expect(BP.diffHeaders(['A'], ['A'])).toEqual({ added: [], removed: [] })
    })
})
