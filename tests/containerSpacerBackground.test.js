/**
 * tests/containerSpacerBackground.test.js — пустые ячейки-распорки внутри цветного контейнера.
 *
 * Outlook 2016 на масштабируемом экране (RDP) заливает белым пустые ячейки с `&nbsp;`,
 * у которых нет собственного фона: боковые ячейки полноширинной подложки (cp),
 * строки-отступы между блоками колонки и блок «Отступ». Белые квадраты и полосы
 * ломали дизайн цветных блоков. Распорки внутри контейнера получают его цвет.
 */
import { describe, test, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync(path.join(__dirname, '../static/js/emailGenerator.js'), 'utf8')

const COLOR = '#DBD9FE'
const HAS_BG = new RegExp(`bgcolor="${COLOR}"[^>]*background-color:${COLOR}`)

function slice(fromMarker, toMarker) {
    const from = source.indexOf(fromMarker)
    return source.slice(from, source.indexOf(toMarker, from + 1))
}

const columnsCode = slice('function getColumnRequiredWidth', 'window.EmailPreviewTheme')
const spacerCode = slice('function generateSpacerHTML', 'function generateCanvasBlockHTML').replace(/\/\*\*[^]*$/, '')
const bgHelpers = slice('// ===== ФОН ЯЧЕЕК-РАСПОРОК', '// ===== ')

function makeColumns() {
    return new Function(`
        let CURRENT_EMAIL_RENDER_CONTEXT = null;
        let _emailContentWidth = 546;
        const LAYOUT = { TABLE_WIDTH: 600 };
        const buildEmailRenderContext = () => ({});
        const generateBlockHTML = (b) => b.html;
        const CapabilityRegistry = { get: () => ({ wrapEmail: (html) => html }) };
        ${bgHelpers}
        ${columnsCode}
        return generateColumnsHTML;
    `)()
}

function makeSpacer(parentBgColor) {
    return new Function(`
        const getCurrentEmailRenderContext = () => ({ parentBgColor: ${JSON.stringify(parentBgColor)} });
        ${bgHelpers}
        ${spacerCode}
        return generateSpacerHTML;
    `)()
}

function container(overrides = {}) {
    return {
        columns: [{ width: 100, blocks: [{ html: '<tr><td>заголовок</td></tr>' }, { html: '<tr><td>текст</td></tr>' }] }],
        settings: { bgEnabled: true, bgColor: COLOR, bgPadding: 16, bgFullWidth: true, blockGap: 12, ...overrides },
    }
}

describe('боковые ячейки полноширинной подложки', () => {
    test('закрашены цветом подложки', () => {
        const html = makeColumns()(container())
        const sideCells = html.match(/<td width="11"[^>]*>&nbsp;<\/td>/g) || []

        expect(sideCells).toHaveLength(2)
        for (const cell of sideCells) expect(cell).toMatch(HAS_BG)
    })
})

describe('строки-отступы между блоками колонки', () => {
    test('закрашены цветом контейнера', () => {
        const html = makeColumns()(container())
        const gapRows = html.match(/<td[^>]*height:12px[^>]*>&nbsp;<\/td>/g) || []

        expect(gapRows).toHaveLength(1)
        expect(gapRows[0]).toMatch(HAS_BG)
    })

    test('без подложки фон не добавляется', () => {
        const html = makeColumns()(container({ bgEnabled: false }))
        const gapRows = html.match(/<td[^>]*height:12px[^>]*>&nbsp;<\/td>/g) || []

        expect(gapRows[0]).not.toContain('bgcolor')
    })
})

describe('блок «Отступ»', () => {
    test('внутри цветного контейнера закрашен его цветом', () => {
        const html = makeSpacer(COLOR)({ height: 20 })

        expect(html).toMatch(HAS_BG)
    })

    test('высота строки задана через font-size:1px и line-height по высоте отступа, не через font-size:0', () => {
        const html = makeSpacer(null)({ height: 20 })

        expect(html).toContain('height="20"')
        expect(html).toContain('height:20px')
        expect(html).toContain('font-size:1px')
        expect(html).toContain('line-height:20px')
        expect(html).toContain('mso-line-height-rule:exactly')
        expect(html).toContain('&nbsp;')
    })

    test('вне контейнера фон не добавляется', () => {
        const html = makeSpacer(null)({ height: 20 })

        expect(html).not.toContain('bgcolor')
    })
})

describe('ячейки с &nbsp; не используют font-size:0', () => {
    // Outlook 2016 рисует в такой ячейке белый прямоугольник (белые полосы и квадраты
    // поверх цветных блоков) — проверено на тестовой странице с вариантами отступов.
    const nbspCellWithZeroFont = /<td[^>]*font-size:\s*0[;"\s][^>]*>\s*&nbsp;\s*<\/td>/

    test('распорки колонок и боковые ячейки полноширинной подложки', () => {
        const html = makeColumns()(container())

        expect(html).not.toMatch(nbspCellWithZeroFont)
    })

    test('блок «Отступ»', () => {
        expect(makeSpacer(COLOR)({ height: 20 })).not.toMatch(nbspCellWithZeroFont)
    })

    test('весь emailGenerator.js: ни одной ячейки с &nbsp; и font-size:0', () => {
        expect(source).not.toMatch(/<td[^>]*font-size:\s*0[;"\s][^>]*>&nbsp;<\/td>/)
    })
})
