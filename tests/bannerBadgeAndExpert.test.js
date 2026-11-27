import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'fs'

function loadSnippet(path, from, to, deps, exportName) {
    const source = fs.readFileSync(path, 'utf-8')
    const start = source.indexOf(from)
    const end = source.indexOf(to, start)
    const names = Object.keys(deps)
    const fn = new Function(...names, source.slice(start, end) + `\nreturn ${exportName};`)
    return fn(...names.map(name => deps[name]))
}

let getBadgeTextColor
let getExpertRenderWidth

beforeAll(() => {
    getBadgeTextColor = loadSnippet('./static/js/imageRenderers.js',
        'const WHITE_TEXT_BADGE_COLORS', '// Рисуем текстовый элемент',
        { getReadableTextColor: () => 'contrast' }, 'getBadgeTextColor')
    getExpertRenderWidth = loadSnippet('./static/js/blockOperations.js',
        'const EQUAL_COLUMNS_TOLERANCE', '// Рендерится ДВАЖДЫ', {}, 'getExpertRenderWidth')
})

describe('getBadgeTextColor — текст на плашке баннера', () => {
    it.each(['#FFB608', '#29CCA3', '#ff5e2e', 'FE842D'])('белый на %s', color => {
        expect(getBadgeTextColor(color)).toBe('#ffffff')
    })

    it('остальные цвета — по контрасту, как раньше', () => {
        expect(getBadgeTextColor('#7700ff')).toBe('contrast')
    })
})

describe('getExpertRenderWidth — ширина карточки эксперта в колонке', () => {
    const columns = widths => widths.map((width, i) => ({ width, blocks: [{ id: i + 1 }] }))

    it('в равных колонках 33/34/33 ширина у всех одна', () => {
        const row = columns([33, 34, 33])
        expect([1, 2, 3].map(id => getExpertRenderWidth(row, id))).toEqual([198, 198, 198])
    })

    it('в разных колонках берётся своя ширина', () => {
        const row = columns([30, 70])
        expect([1, 2].map(id => getExpertRenderWidth(row, id))).toEqual([180, 420])
    })
})
