/**
 * tests/backgroundWrapper.test.js — подложка блока в письме (capability «background»).
 *
 * Outlook 2016 на масштабируемом экране (RDP) оставляет щели между строками
 * вложенных таблиц, и сквозь них просвечивает белый фон письма (белые полосы и
 * квадраты поверх подложки). Поэтому фон задаётся на каждой вложенной таблице и
 * ячейке обёртки, а не только на средней.
 */
import { describe, test, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync(path.join(__dirname, '../static/js/capabilities/background.js'), 'utf8')

function loadCapability() {
    let capability = null
    const registry = { register: (c) => { capability = c } }
    const documentStub = {
        createElement: () => ({ getContext: () => ({ beginPath() {}, moveTo() {}, lineTo() {}, arcTo() {}, closePath() {}, fill() {} }), toDataURL: () => 'data:image/png;base64,AA==' }),
    }
    new Function('CapabilityRegistry', 'document', source)(registry, documentStub)
    return capability
}

const COLOR = '#D9D5FF'
const settings = (radius) => ({ bgEnabled: true, bgColor: COLOR, bgRadius: radius, bgPadding: 16 })
const CONTENT = '<tr><td>контент</td></tr>'

function branches(html) {
    const plain = html.match(/<!--\[if !mso\]><!-->([\s\S]*?)<!--<!\[endif\]-->/)[1]
    const outlook = html.match(/<!--\[if mso\]>([\s\S]*?)<!\[endif\]-->/)[1]
    return { plain, outlook }
}

function tagsOf(html, tag) {
    return html.match(new RegExp(`<${tag}\\b[^>]*>`, 'g')) || []
}

describe('подложка в письме: фон на вложенных таблицах', () => {
    const capability = loadCapability()
    const { outlook } = branches(capability.wrapEmail(CONTENT, settings(12), 600))

    test('Outlook-ветка: все таблицы с блоками закрашены цветом подложки', () => {
        const tables = tagsOf(outlook, 'table').slice(1) // первая — полоса с углами-картинками
        const filled = tables.filter(t => t.includes(`bgcolor="${COLOR}"`) && t.includes(`background-color:${COLOR}`))

        expect(filled).toHaveLength(2)
    })

    test('Outlook-ветка: ячейки вокруг блоков закрашены цветом подложки', () => {
        const filled = tagsOf(outlook, 'td').filter(t => t.includes(`bgcolor="${COLOR}"`))

        expect(filled).toHaveLength(2)
    })

    test('Outlook-ветка: полосы со скруглёнными углами остаются без фона (под вырезом — фон письма)', () => {
        const stripCells = tagsOf(outlook, 'td').filter(t => t.includes('font-size:1px'))

        expect(stripCells).toHaveLength(2)
        for (const cell of stripCells) expect(cell).not.toContain('bgcolor')
    })

    test('Outlook-ветка: ячейки с уголками без font-size:0 / line-height:0 (иначе Outlook 2016 срезает верх картинки)', () => {
        const stripCells = tagsOf(outlook, 'td').filter(t => t.includes('font-size:1px'))

        expect(stripCells).toHaveLength(2)
        for (const cell of stripCells) {
            expect(cell).toContain('line-height:1px')
            expect(cell).not.toMatch(/font-size:\s*0[;"]|line-height:\s*0[;"]/)
        }
    })

    test('без скругления: все таблицы и ячейки обёртки закрашены', () => {
        const html = capability.wrapEmail(CONTENT, settings(0), 600)
        const tables = tagsOf(html, 'table')
        const cells = tagsOf(html, 'td').filter(t => t.includes('padding:16px'))

        expect(tables).toHaveLength(2)
        for (const table of tables) expect(table).toContain(`bgcolor="${COLOR}"`)
        expect(cells).toHaveLength(1)
        expect(cells[0]).toContain(`bgcolor="${COLOR}"`)
    })

    test('без цвета подложки в письмо не попадает "undefined" (баннер с пустой обёрткой)', () => {
        const noColor = { bgEnabled: undefined, bgColor: undefined, bgRadius: 0, bgPadding: 0 }

        for (const html of [capability.wrapEmail(CONTENT, noColor, 600), capability.wrapEmail(CONTENT, { ...noColor, bgRadius: 12 }, 600)]) {
            expect(html).not.toContain('undefined')
            expect(html).not.toContain('bgcolor')
        }
    })

    test('контент блока вставляется как есть', () => {
        expect(outlook).toContain(CONTENT)
    })
})
