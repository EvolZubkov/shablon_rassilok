/**
 * tests/excModalLayout.test.js
 *
 * Контракт раскладки окон отправки (.exc-body) в обоих файлах стилей
 * (user-styles.css — пользователь, modular-styles.css — админ).
 * Раскладку jsdom не считает, поэтому проверяем сами правила: без них блок
 * «Дополнительные настройки» (overflow:hidden) сжимается в flex-колонке
 * и обрезается вместо прокрутки окна на низких экранах.
 */

const fs = require('fs')

const STYLESHEETS = ['./static/user-styles.css', './static/modular-styles.css']

/** Тело правила по точному селектору (первое вхождение на верхнем уровне). */
function ruleBody(css, selector) {
    const start = css.indexOf(`\n${selector} {`)
    if (start === -1) return null
    const open = css.indexOf('{', start)
    return css.slice(open + 1, css.indexOf('}', open))
}

describe.each(STYLESHEETS)('%s', (file) => {
    const css = fs.readFileSync(file, 'utf-8').split('\r\n').join('\n')

    it('does not let children of .exc-body shrink', () => {
        const body = ruleBody(css, '.exc-body > *')
        expect(body).not.toBeNull()
        expect(body).toMatch(/flex-shrink:\s*0/)
    })

    it('keeps .exc-body scrollable', () => {
        expect(ruleBody(css, '.exc-body')).toMatch(/overflow-y:\s*auto/)
    })

    it('has a compact layout for low screens', () => {
        const media = css.match(/@media \(max-height: 720px\) \{([\s\S]*?)\n\}\n/)
        expect(media).not.toBeNull()
        expect(media[1]).toMatch(/\.exc-body \{[^}]*padding:\s*12px 16px/)
        expect(media[1]).toMatch(/\.exc-panel \{[^}]*max-height:\s*96vh/)
    })
})
