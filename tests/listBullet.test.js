/**
 * tests/listBullet.test.js — ячейка буллита в списке письма.
 *
 * Word (Outlook) обрезает буллит сверху, если строка его ячейки ровно по высоте
 * буллита или выше на 1–2px, причём порог «плавает» вместе с межстрочным интервалом.
 * Поэтому у ячейки должен быть запас не меньше BULLET_LINE_EXTRA, а высота пункта не растёт.
 */
import { describe, test, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync(path.join(__dirname, '../static/js/emailGenerator.js'), 'utf8')
const start = source.indexOf('function generateListHTML')
const end = source.lastIndexOf('/**', source.indexOf('function generateTableHTML'))

const generateListHTML = new Function(`
    const LAYOUT = { DEFAULT_FONT_SIZE: 14, DEFAULT_LINE_HEIGHT: 1.15 };
    const BULLET_TYPES = [{ id: 'circle', src: '' }];
    const TextSanitizer = { render: t => t, sanitize: t => t };
    const getCurrentEmailRenderContext = () => ({ linkColor: '#7700ff', bulletColor: '#7700ff' });
    const resolveTextFontFamily = () => 'Arial';
    const resolveBlockTextColor = () => '#3F3E4B';
    ${source.slice(start, end)}
    return generateListHTML;
`)()

function bulletCell(settings) {
    const html = generateListHTML({
        items: ['пункт'], bulletType: 'circle', itemSpacing: 8, bulletGap: 4, ...settings
    })
    const cell = html.match(/<td valign="middle" width="\d+" style="([^"]*)"/)
    return cell ? cell[1] : ''
}

const lineHeightOf = style => Number((style.match(/line-height:(\d+)px/) || [])[1])
const paddingOf = style => Number((style.match(/padding:([\d.]+)px/) || [])[1])

describe('ячейка буллита в списке', () => {
    test.each([
        [13, 1.2, 16],
        [14, 1.2, 14],
        [14, 1.2, 17],
        [14, 1.0, 14],
        [14, 2, 20],
        [20, 1.2, 24],
    ])('шрифт %i, интервал %f, буллит %i: строка выше буллита минимум на 4px', (fontSize, lineHeight, bulletSize) => {
        const style = bulletCell({ fontSize, lineHeight, bulletSize })
        expect(lineHeightOf(style)).toBeGreaterThanOrEqual(bulletSize + 4)
    })

    test('высота пункта не растёт: строка + padding ячейки буллита = строка текста + padding текста', () => {
        const fontSize = 13, lineHeight = 1.2, bulletSize = 16, itemSpacing = 8
        const style = bulletCell({ fontSize, lineHeight, bulletSize, itemSpacing })
        const textLine = Math.round(fontSize * lineHeight)
        expect(lineHeightOf(style) + paddingOf(style) * 2).toBe(textLine + itemSpacing)
    })

    test('буллит выше строки текста сам задаёт высоту — фиксации строки нет', () => {
        const style = bulletCell({ fontSize: 14, lineHeight: 1.2, bulletSize: 24 })
        expect(style).not.toContain('line-height')
    })
})
