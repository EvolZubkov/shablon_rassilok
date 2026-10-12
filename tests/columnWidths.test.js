/**
 * tests/columnWidths.test.js
 *
 * Автоподгонка ширины колонок под кнопки (emailGenerator.js:
 * computeColumnCellWidths / getColumnRequiredWidth). Функции берутся из
 * реального файла, а не копируются в тест.
 */

const fs = require('fs')

let computeColumnCellWidths
let getColumnRequiredWidth

function extractFunction(source, name) {
    const start = source.indexOf(`function ${name}(`)
    const end = source.indexOf('\n}\n', start)
    return source.slice(start, end + 2)
}

beforeAll(() => {
    const source = fs.readFileSync('./static/js/emailGenerator.js', 'utf-8')
        .split(String.fromCharCode(13)).join('')
    const api = new Function(
        'getBackgroundPaddingFor',
        extractFunction(source, 'computeColumnCellWidths') +
        extractFunction(source, 'getColumnRequiredWidth') +
        '\nreturn { computeColumnCellWidths, getColumnRequiredWidth };'
    )(block => Number(block.settings?.bgPadding) || 0)
    computeColumnCellWidths = api.computeColumnCellWidths
    getColumnRequiredWidth = api.getColumnRequiredWidth
})

const sum = arr => arr.reduce((a, b) => a + b, 0)

describe('computeColumnCellWidths', () => {
    test('не меняет ширины, если все кнопки помещаются', () => {
        expect(computeColumnCellWidths([137, 137, 137, 135], [100, 90, 0, 120], 546))
            .toEqual([137, 137, 137, 135])
    })

    test('расширяет колонку с широкой кнопкой за счёт остальных, сумма сохраняется', () => {
        // 4 колонки, «Онлайн-университет» ~164px + отступ 6px
        const widths = computeColumnCellWidths([137, 137, 137, 135], [170, 99, 119, 132], 546)
        expect(sum(widths)).toBe(546)
        expect(widths[0]).toBeGreaterThanOrEqual(170)
        widths.forEach((w, i) => expect(w).toBeGreaterThanOrEqual([170, 99, 119, 132][i]))
    })

    test('колонки без ограничений делят остаток пропорционально номиналу', () => {
        const widths = computeColumnCellWidths([100, 200, 200], [150, 0, 0], 500)
        expect(widths).toEqual([150, 175, 175])
    })

    test('возвращает номиналы, если всем вместе не хватает места', () => {
        expect(computeColumnCellWidths([100, 100], [300, 300], 200)).toEqual([100, 100])
    })

    test('результат — целые px с точной суммой', () => {
        const widths = computeColumnCellWidths([181, 182, 183], [190, 0, 0], 546)
        widths.forEach(w => expect(Number.isInteger(w)).toBe(true))
        expect(sum(widths)).toBe(546)
    })
})

describe('getColumnRequiredWidth', () => {
    const pad = { left: 6, right: 6 }
    const button = (w, extra = {}) => ({ type: 'button', settings: { renderedButtonW: w, ...extra } })

    test('ширина PNG кнопки плюс отступы колонки', () => {
        expect(getColumnRequiredWidth({ blocks: [button(164)] }, pad)).toBe(176)
    })

    test('берёт самую широкую кнопку и учитывает подложку кнопки', () => {
        const column = { blocks: [button(100), button(120, { bgPadding: 8 })] }
        expect(getColumnRequiredWidth(column, { left: 0, right: 6 })).toBe(120 + 16 + 6)
    })

    test('0 для колонки без кнопок с готовой картинкой', () => {
        expect(getColumnRequiredWidth({ blocks: [{ type: 'text', settings: {} }, button(0)] }, pad)).toBe(0)
        expect(getColumnRequiredWidth({ blocks: [] }, pad)).toBe(0)
    })
})
