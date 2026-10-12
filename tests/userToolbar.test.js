/**
 * tests/userToolbar.test.js
 *
 * Цвет выделенного фрагмента (userToolbar.js: applyTextColor / wrapRangeInTextColor)
 * на jsdom: один абзац, несколько абзацев, плейсхолдер, снятие цвета.
 */

const { JSDOM } = require('jsdom')
const fs = require('fs')

let dom
let applyTextColor
let TextSanitizer

/** Вырезает исходник функции верхнего уровня из файла по имени. */
function extractFunction(source, name) {
    const start = source.indexOf(`function ${name}(`)
    const end = source.indexOf('\n}\n', start)
    return source.slice(start, end + 2)
}

function select(startNode, startOffset, endNode, endOffset) {
    const range = dom.window.document.createRange()
    range.setStart(startNode, startOffset)
    range.setEnd(endNode, endOffset)
    const selection = dom.window.getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
}

beforeAll(() => {
    dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost' })
    global.window = dom.window
    global.document = dom.window.document
    global.Node = dom.window.Node
    global.DOMParser = dom.window.DOMParser

    // Файл может быть с CRLF — extractFunction ищет конец функции по LF
    const toolbar = fs.readFileSync('./static/js/user/userToolbar.js', 'utf-8')
        .split(String.fromCharCode(13)).join('')
    applyTextColor = new Function(
        extractFunction(toolbar, 'applyTextColor') +
        extractFunction(toolbar, 'wrapRangeInTextColor') +
        '\nreturn applyTextColor;'
    )()

    const sanitizerSource = fs.readFileSync('./static/js/textSanitizer.js', 'utf-8')
    TextSanitizer = new Function(sanitizerSource + ';\nreturn TextSanitizer;')()
})

function mount(html) {
    const editable = document.createElement('div')
    editable.innerHTML = html
    document.body.innerHTML = ''
    document.body.appendChild(editable)
    return editable
}

describe('applyTextColor', () => {
    test('красит только выделенный фрагмент внутри абзаца', () => {
        const editable = mount('<p>Привет Иван!</p>')
        const text = editable.querySelector('p').firstChild
        select(text, 7, text, 11)

        applyTextColor(editable, '#ff0000')

        expect(editable.innerHTML).toBe('<p>Привет <span data-tc="#ff0000" style="color: rgb(255, 0, 0);">Иван</span>!</p>')
    })

    test('на нескольких абзацах красит каждый абзац отдельно, span не содержит <p>', () => {
        const editable = mount('<p>Привет Иван</p><p>Второй абзац</p>')
        const [a, b] = editable.querySelectorAll('p')
        select(a.firstChild, 7, b.firstChild, 6)

        applyTextColor(editable, '#7700ff')

        expect(editable.querySelectorAll('span[data-tc] p')).toHaveLength(0)
        expect(editable.querySelectorAll('p')).toHaveLength(2)
        const spans = [...editable.querySelectorAll('span[data-tc]')]
        expect(spans.map(s => s.textContent)).toEqual(['Иван', 'Второй'])
    })

    test('результат проходит санитайзер без потери цвета и без вложенных <p> в span', () => {
        const editable = mount('<p>Привет Иван</p><p>Второй абзац</p>')
        const [a, b] = editable.querySelectorAll('p')
        select(a.firstChild, 7, b.firstChild, 6)

        applyTextColor(editable, '#7700ff')
        const clean = TextSanitizer.sanitize(editable.innerHTML, false)

        expect(clean).toBe(
            '<p>Привет <span data-tc="#7700ff" style="color:#7700ff;">Иван</span></p>' +
            '<p><span data-tc="#7700ff" style="color:#7700ff;">Второй</span> абзац</p>'
        )
    })

    test('красит плейсхолдер вместе с соседним текстом', () => {
        const editable = mount('<p>Добрый день, <span class="bm-inline-ph" contenteditable="false">{{ФИО}}</span>!</p>')
        const p = editable.querySelector('p')
        const ph = p.querySelector('.bm-inline-ph')
        select(p.firstChild, 7, p.lastChild, 0)

        applyTextColor(editable, '#ff0000')

        const colored = editable.querySelector('span[data-tc]')
        expect(colored.textContent).toBe('день, {{ФИО}}')
        expect(colored.contains(ph)).toBe(true)
    })

    test('повторное применение заменяет прежний цвет, а не вкладывает новый', () => {
        const editable = mount('<p>Привет <span data-tc="#ff0000" style="color:#ff0000">Иван</span></p>')
        const p = editable.querySelector('p')
        select(p.firstChild, 0, p.querySelector('span').firstChild, 4)

        applyTextColor(editable, '#00ff00')

        expect(editable.querySelectorAll('span[data-tc] span[data-tc]')).toHaveLength(0)
        expect(editable.querySelector('span[data-tc]').getAttribute('data-tc')).toBe('#00ff00')
    })

    test('пустой цвет снимает окраску выделения', () => {
        const editable = mount('<p>Привет <span data-tc="#ff0000" style="color:#ff0000">Иван</span></p>')
        const span = editable.querySelector('span')
        select(span.firstChild, 0, span.firstChild, 4)

        applyTextColor(editable, '')

        expect(editable.querySelectorAll('span[data-tc]')).toHaveLength(0)
        expect(editable.textContent).toBe('Привет Иван')
    })
})

describe('applyTextColor — выделение внутри окрашенного фрагмента', () => {
    test('перекрашивает только середину, края сохраняют прежний цвет', () => {
        const editable = mount('<p><span data-tc="#ff0000" style="color:#ff0000">Привет Иван!</span></p>')
        const text = editable.querySelector('span').firstChild
        select(text, 7, text, 11)

        applyTextColor(editable, '#00ff00')

        const spans = [...editable.querySelectorAll('span[data-tc]')]
        expect(spans.map(s => [s.getAttribute('data-tc'), s.textContent])).toEqual([
            ['#ff0000', 'Привет '],
            ['#00ff00', 'Иван'],
            ['#ff0000', '!'],
        ])
        expect(editable.querySelectorAll('span[data-tc] span[data-tc]')).toHaveLength(0)
    })

    test('«без цвета» в середине окрашенного текста убирает цвет только у выделения', () => {
        const editable = mount('<p><span data-tc="#ff0000" style="color:#ff0000">Привет Иван!</span></p>')
        const text = editable.querySelector('span').firstChild
        select(text, 7, text, 11)

        applyTextColor(editable, '')

        expect([...editable.querySelectorAll('span[data-tc]')].map(s => s.textContent))
            .toEqual(['Привет ', '!'])
        expect(editable.textContent).toBe('Привет Иван!')
    })
})
