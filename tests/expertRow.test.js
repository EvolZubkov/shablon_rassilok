import { describe, it, expect } from 'vitest'
import fs from 'node:fs'

const read = p => fs.readFileSync(p, 'utf8')
const emailSource = read('./static/js/emailGenerator.js')

function slice(from, to) {
    const start = emailSource.indexOf(from)
    return emailSource.slice(start, emailSource.indexOf(to, start + 1))
}

/** Настоящие generateColumnsHTML + generateExpertHTML, ширина слота письма — 564px. */
function renderRow(columns) {
    const render = new Function(`
        ${read('./static/js/shared/expertRow.js').replace(/if \(typeof window[^\n]*/, '')}
        let CURRENT_EMAIL_RENDER_CONTEXT = null;
        let _emailContentWidth = 564;
        const LAYOUT = { TABLE_WIDTH: 600 };
        const buildEmailRenderContext = () => ({});
        const getCurrentEmailRenderContext = () => CURRENT_EMAIL_RENDER_CONTEXT || {};
        const getAvailableBlockWidth = () =>
            getCurrentEmailRenderContext().parentContentWidth || _emailContentWidth;
        const getPadding = () => '';
        const escapeHtml = v => v;
        const CapabilityRegistry = { get: () => null };
        ${slice('// ===== ФОН ЯЧЕЕК-РАСПОРОК', '// ===== ')}
        ${slice('function generateExpertHTML', '\nfunction ')}
        const generateBlockHTML = b => b.type === 'expert' ? generateExpertHTML(b.settings) : '';
        ${slice('function getColumnRequiredWidth', 'window.EmailPreviewTheme')}
        return generateColumnsHTML;
    `)()
    const html = render({ columns, settings: { colGap: 12 } })
    return [...html.matchAll(/<img [^>]*width="(\d+)"/g)].map(m => Number(m[1]))
}

const expert = { type: 'expert', settings: { renderedExpert: 'x.png', renderedExpertWidth: 198 } }
const row = widths => widths.map(width => ({ width, blocks: [expert] }))

describe('ряд экспертов в письме', () => {
    it('в равных колонках 33/33/34 все карточки одной ширины', () => {
        const widths = renderRow(row([33, 33, 34]))

        expect(widths).toHaveLength(3)
        expect(new Set(widths).size).toBe(1)
        expect(widths[0]).toBe(174)
    })

    it('в разных по ширине колонках ширины остаются своими', () => {
        const widths = renderRow(row([30, 70]))

        expect(widths[0]).toBeLessThan(widths[1])
    })
})
