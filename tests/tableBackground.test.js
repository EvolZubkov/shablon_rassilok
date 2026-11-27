/**
 * tests/tableBackground.test.js — фон карточки таблицы в письме.
 *
 * Outlook 2016 на масштабируемом экране (RDP) оставляет волосяные щели между
 * строками, и в них просвечивает белый фон письма — получается белая линия на
 * всю ширину. Поэтому фон карточки задаётся явно на внутренней таблице, ячейках
 * данных и обёртках разделителей, а не только на внешней ячейке.
 */
import { describe, test, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync(path.join(__dirname, '../static/js/emailGenerator.js'), 'utf8')
const start = source.indexOf('function generateTableHTML')
const end = source.indexOf('/**', start)

const generateTableHTML = new Function(`
    const _emailContentWidth = 536;
    const TextSanitizer = { render: t => t, sanitize: t => t };
    const getCurrentEmailRenderContext = () => ({ bodyBg: '#ffffff' });
    const resolveTextFontFamily = () => 'Arial';
    const isLightColorPreview = () => true;
    const getImageStyle = () => '';
    const getPadding = () => 'padding:0;';
    ${source.slice(start, end)}
    return generateTableHTML;
`)()

const CONTAINER_BG = '#EBF1F6'

function render() {
    return generateTableHTML({
        columns: ['Название', 'Для кого'],
        rows: [['Первый', 'Все'], ['Второй', 'B2C']],
        containerBg: CONTAINER_BG,
        dividerColor: '#FFFFFF',
        containerRadius: 0,
    })
}

function cellsWithText(html) {
    return html.match(/<td[^>]*>\s*(?:Название|Для кого|Первый|Все|Второй|B2C)\s*<\/td>/g) || []
}

describe('фон таблицы в письме', () => {
    test('каждая ячейка с данными закрашена фоном карточки', () => {
        const cells = cellsWithText(render())

        expect(cells).toHaveLength(6)
        for (const cell of cells) {
            expect(cell).toContain(`bgcolor="${CONTAINER_BG}"`)
            expect(cell).toContain(`background-color:${CONTAINER_BG}`)
        }
    })

    test('внутренняя таблица закрашена фоном карточки', () => {
        const html = render()

        expect(html).toMatch(new RegExp(`<table[^>]*table-layout:fixed[^>]*background-color:${CONTAINER_BG}`))
        expect(html).toMatch(new RegExp(`<table[^>]*bgcolor="${CONTAINER_BG}"[^>]*table-layout:fixed`))
    })

    test('обёртка разделителя закрашена фоном карточки, сам разделитель — своим цветом', () => {
        const html = render()
        const wrappers = html.match(/<td colspan="2"[^>]*>/g) || []

        expect(wrappers.length).toBeGreaterThan(0)
        for (const wrapper of wrappers) {
            expect(wrapper).toContain(`bgcolor="${CONTAINER_BG}"`)
        }
        expect(html).toContain('background-color:#FFFFFF;">&nbsp;</td>')
    })
})

describe('ячейки шапки и крышки таблицы с картинками', () => {
    // Outlook 2016 срезает верхние ~3 px картинки в ячейке с line-height:0 / font-size:0,
    // поэтому верхние углы шапки получались «приплюснутыми».
    test('без font-size:0 и line-height:0', () => {
        const html = generateTableHTML({
            columns: ['Название'],
            rows: [['Первый']],
            containerBg: CONTAINER_BG,
            containerRadius: 28,
            renderedTitleBar: 'cid:title',
            renderedBottomCap: 'cid:cap',
        })
        const imageCells = html.match(/<td[^>]*>\s*<img src="cid:(?:title|cap)"/g) || []

        expect(imageCells).toHaveLength(2)
        for (const cell of imageCells) {
            expect(cell).toContain('font-size:1px')
            expect(cell).toContain('line-height:1px')
            expect(cell).not.toMatch(/font-size:\s*0[;"]|line-height:\s*0[;"]/)
        }
    })
})

