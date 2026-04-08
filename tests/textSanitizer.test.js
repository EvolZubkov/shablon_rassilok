const { JSDOM } = require('jsdom')
const fs = require('fs')

let TextSanitizer

beforeAll(() => {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
        url: 'http://localhost'
    })
    global.window = dom.window
    global.document = dom.window.document
    global.Node = dom.window.Node
    global.DOMParser = dom.window.DOMParser

    const code = fs.readFileSync('./static/js/textSanitizer.js', 'utf-8')

    // Изолируем Jest globals — передаём undefined чтобы внутри кода
    // sanitizer не было доступа к test/describe/expect
    const fn = new Function(
        'test', 'it', 'describe', 'expect', 'beforeAll', 'afterAll', 'beforeEach', 'afterEach',
        code + ';\nreturn TextSanitizer;'
    )
    TextSanitizer = fn(
        undefined, undefined, undefined,
        undefined, undefined, undefined,
        undefined, undefined
    )
})

// ─── sanitize plain text ──────────────────────────────────────────────────

describe('TextSanitizer.sanitize — plain text', () => {

    test('одиночный \\n → <br> внутри <p>', () => {
        expect(TextSanitizer.sanitize('строка1\nстрока2', true))
            .toBe('<p>строка1<br>строка2</p>')
    })

    test('двойной \\n → два <p>', () => {
        const r = TextSanitizer.sanitize('абзац1\n\nабзац2', true)
        expect(r).toContain('<p>абзац1</p>')
        expect(r).toContain('<p>абзац2</p>')
    })

    test('тройной \\n нормализуется в два <p>', () => {
        const r = TextSanitizer.sanitize('а\n\n\nб', true)
        expect((r.match(/<p>/g) || []).length).toBe(2)
    })

    test('\\r\\n из Word нормализуется', () => {
        const r = TextSanitizer.sanitize('строка1\r\nстрока2', true)
        expect(r).toContain('строка1')
        expect(r).toContain('строка2')
    })

    test('**текст** → <strong>', () => {
        expect(TextSanitizer.sanitize('**жирный**', true))
            .toContain('<strong>жирный</strong>')
    })

    test('[текст](https://url) → <a href>', () => {
        const r = TextSanitizer.sanitize('[ссылка](https://rt.ru)', true)
        expect(r).toContain('<a href="https://rt.ru">')
        expect(r).toContain('ссылка')
    })

    test('[текст](mailto:) → <a href>', () => {
        expect(TextSanitizer.sanitize('[почта](mailto:a@rt.ru)', true))
            .toContain('href="mailto:a@rt.ru"')
    })

    test('javascript: не становится кликабельной ссылкой', () => {
        const r = TextSanitizer.sanitize('[клик](javascript:alert(1))', true)
        expect(r).not.toContain('<a href="javascript:')
        expect(r).toContain('клик')
    })

    test('пустые значения → пустая строка', () => {
        expect(TextSanitizer.sanitize('', true)).toBe('')
        expect(TextSanitizer.sanitize(null, true)).toBe('')
        expect(TextSanitizer.sanitize(undefined, true)).toBe('')
    })

    test('текст без переносов → один <p>', () => {
        expect(TextSanitizer.sanitize('просто текст', true))
            .toBe('<p>просто текст</p>')
    })
})

// ─── sanitize HTML ────────────────────────────────────────────────────────

describe('TextSanitizer.sanitize — HTML (из буфера)', () => {

    test('чистит class из Word', () => {
        const input = `<p class="MsoNormal">текст</p>`
        console.log('INPUT:', input)
        
        // Проверяем DOMParser напрямую
        const parser = new DOMParser()
        const doc = parser.parseFromString(input, 'text/html')
        console.log('doc.body.innerHTML:', doc.body.innerHTML)
        console.log('doc.body.childNodes.length:', doc.body.childNodes.length)
        const firstChild = doc.body.childNodes[0]
        console.log('firstChild:', firstChild?.nodeName, firstChild?.nodeType)
        console.log('firstChild.childNodes:', firstChild?.childNodes?.length)
        
        const r = TextSanitizer.sanitize(input, false)
        console.log('RESULT:', JSON.stringify(r))
        expect(r).not.toContain('MsoNormal')
        expect(r).toContain('текст')
    })

    test('Google Docs <b style="font-weight:normal"> разворачивается прозрачно', () => {
        const r = TextSanitizer.sanitize(
            `<html><body>
            <b style="font-weight:normal;">
                <p dir="ltr">абзац первый</p>
                <p dir="ltr">абзац второй</p>
            </b>
            </body></html>`,
            false
        )
        expect(r).toContain('абзац первый')
        expect(r).toContain('абзац второй')
        expect((r.match(/<p/g) || []).length).toBeGreaterThanOrEqual(2)
    })

    test('разрешённые теги сохраняются: strong, em, a, br', () => {
        const r = TextSanitizer.sanitize(
            '<p><strong>жирный</strong> и <em>курсив</em> и <a href="https://rt.ru">ссылка</a></p>',
            false
        )
        expect(r).toContain('<strong>жирный</strong>')
        expect(r).toContain('<em>курсив</em>')
        expect(r).toContain('<a href="https://rt.ru">')
    })

    test('script и style удаляются', () => {
        const r = TextSanitizer.sanitize(
            '<div>текст</div><script>alert(1)</script><style>.x{}</style>',
            false
        )
        expect(r).not.toContain('<script')
        expect(r).not.toContain('<style')
        expect(r).toContain('текст')
    })

    test('span со style удаляется, текст сохраняется', () => {
        const r = TextSanitizer.sanitize(
            '<p><span style="color:red;">красный текст</span></p>',
            false
        )
        expect(r).not.toContain('<span')
        expect(r).toContain('красный текст')
    })

    test('style и class удаляются с разрешённых тегов', () => {
        const r = TextSanitizer.sanitize(
            '<p style="margin:0" class="para">текст</p>',
            false
        )
        expect(r).not.toContain('style=')
        expect(r).not.toContain('class=')
        expect(r).toContain('текст')
    })

    test('вредоносный href блокируется', () => {
        const r = TextSanitizer.sanitize(
            '<a href="javascript:void(0)">клик</a>',
            false
        )
        expect(r).not.toContain('javascript:')
    })

    test('пустые <p> удаляются', () => {
        const r = TextSanitizer.sanitize(
            '<p>текст</p><p></p><p>  </p><p>ещё</p>',
            false
        )
        expect(r.match(/<p>\s*<\/p>/g)).toBeNull()
    })

    test('Google Docs span с white-space:pre сохраняет текст', () => {
        const r = TextSanitizer.sanitize(
            '<p><span style="white-space:pre-wrap;">текст абзаца</span></p>',
            false
        )
        expect(r).toContain('текст абзаца')
        expect(r).not.toContain('<span')
    })
})

// ─── render() ─────────────────────────────────────────────────────────────

describe('TextSanitizer.render', () => {

    test('добавляет style к <a> если нет', () => {
        expect(TextSanitizer.render('<p><a href="https://rt.ru">ссылка</a></p>'))
            .toContain('style="color:#7700ff')
    })

    test('не дублирует style на <a> если уже есть', () => {
        const r = TextSanitizer.render(
            '<p><a href="https://rt.ru" style="color:red;">ссылка</a></p>'
        )
        const aTag = (r.match(/<a [^>]+>/g) || [''])[0]
        expect((aTag.match(/style=/g) || []).length).toBe(1)
    })

    test('последний <p> получает margin:0', () => {
        const r = TextSanitizer.render('<p>первый</p><p>последний</p>')
        expect(r.split('<p').pop()).toContain('margin:0')
    })

    test('не последние <p> получают margin > 0', () => {
        const r = TextSanitizer.render('<p>первый</p><p>второй</p><p>третий</p>')
        expect(r).toContain('margin:0 0')
    })

    test('пустые значения → пустая строка', () => {
        expect(TextSanitizer.render('')).toBe('')
        expect(TextSanitizer.render(null)).toBe('')
    })

    test('кастомный цвет ссылки применяется', () => {
        expect(TextSanitizer.render('<p><a href="https://rt.ru">ссылка</a></p>', '#ff0000'))
            .toContain('color:#ff0000')
    })
})

// ─── toPlainText() ────────────────────────────────────────────────────────

describe('TextSanitizer.toPlainText', () => {

    test('<p>текст</p> → содержит текст', () => {
        expect(TextSanitizer.toPlainText('<p>текст</p>')).toContain('текст')
    })

    test('<br> → одиночный \\n', () => {
        expect(TextSanitizer.toPlainText('<p>строка1<br>строка2</p>'))
            .toContain('строка1\nстрока2')
    })

    test('<strong> → **текст**', () => {
        expect(TextSanitizer.toPlainText('<p><strong>жирный</strong></p>'))
            .toContain('**жирный**')
    })

    test('<a href> → [текст](url)', () => {
        expect(TextSanitizer.toPlainText('<p><a href="https://rt.ru">ссылка</a></p>'))
            .toContain('[ссылка](https://rt.ru)')
    })

    test('HTML entities декодируются', () => {
        expect(TextSanitizer.toPlainText('<p>&amp; &lt; &gt;</p>'))
            .toContain('& < >')
    })

    test('roundtrip: sanitize → toPlainText → sanitize = то же самое', () => {
        const original = 'абзац первый\n\nабзац второй'
        const html = TextSanitizer.sanitize(original, true)
        const plain = TextSanitizer.toPlainText(html)
        const html2 = TextSanitizer.sanitize(plain, true)
        expect(html2).toBe(html)
    })
})

// ─── applyTypography() — кавычки ──────────────────────────────────────────

describe('TextSanitizer.applyTypography — замена кавычек', () => {

    test('простая пара → «»', () => {
        const r = TextSanitizer.applyTypography('<p>"текст"</p>')
        expect(r).toContain('«текст»')
        expect(r).not.toContain('"')
    })

    test('несколько пар в одной строке', () => {
        const r = TextSanitizer.applyTypography('<p>"первый" и "второй"</p>')
        expect(r).toContain('«первый»')
        expect(r).toContain('«второй»')
        expect(r).not.toContain('"')
    })

    test('кавычки вокруг элемента с тегами внутри', () => {
        const r = TextSanitizer.applyTypography('<p>"<strong>жирный</strong>"</p>')
        expect(r).toContain('«')
        expect(r).toContain('»')
        expect(r).toContain('<strong>жирный</strong>')
        expect(r).not.toContain('"')
    })

    test('кавычка раскрывается через границу тегов', () => {
        // Открывающая " до тега, закрывающая после — правило должно соблюдаться
        const r = TextSanitizer.applyTypography('<p>"слово <em>курсив</em> конец"</p>')
        expect(r).toContain('«слово')
        expect(r).toContain('конец»')
        expect(r).not.toContain('"')
    })

    test('href в атрибутах не затрагивается', () => {
        const r = TextSanitizer.applyTypography('<p><a href="https://rt.ru">"ссылка"</a></p>')
        expect(r).toContain('href="https://rt.ru"')
        expect(r).toContain('«ссылка»')
    })

    test('нечётная (непарная) кавычка не ломает HTML', () => {
        const r = TextSanitizer.applyTypography('<p>текст "без закрывающей</p>')
        expect(r).toContain('«без закрывающей')
        expect(typeof r).toBe('string')
    })

    test('строка без кавычек и без коротких предлогов не изменяется', () => {
        // Все слова длиннее 6 букв и не входят в список предлогов/союзов
        const input = '<p>совершенно обычный длинный текст</p>'
        expect(TextSanitizer.applyTypography(input)).toBe(input)
    })

    test('пустая строка → пустая строка', () => {
        expect(TextSanitizer.applyTypography('')).toBe('')
    })
})

// ─── applyTypography() — неразрывные пробелы ─────────────────────────────

describe('TextSanitizer.applyTypography — неразрывные пробелы', () => {

    // jsdom сериализует \u00A0 в innerHTML как &nbsp;
    const NBSP = '&nbsp;'

    test('однобуквенный предлог «в» → неразрывный пробел', () => {
        const r = TextSanitizer.applyTypography('<p>в магазин</p>')
        expect(r).toContain(`в${NBSP}магазин`)
    })

    test('предлог «на» → неразрывный пробел', () => {
        const r = TextSanitizer.applyTypography('<p>на работе</p>')
        expect(r).toContain(`на${NBSP}работе`)
    })

    test('предлог «перед» (6 букв, в явном списке) → неразрывный пробел', () => {
        const r = TextSanitizer.applyTypography('<p>перед домом</p>')
        expect(r).toContain(`перед${NBSP}домом`)
    })

    test('предлог «между» → неразрывный пробел', () => {
        const r = TextSanitizer.applyTypography('<p>между делом</p>')
        expect(r).toContain(`между${NBSP}делом`)
    })

    test('союз «и» → неразрывный пробел', () => {
        const r = TextSanitizer.applyTypography('<p>мама и папа</p>')
        expect(r).toContain(`и${NBSP}папа`)
    })

    test('два союза подряд — оба получают неразрывный пробел', () => {
        // «да» и «или» — оба в списке; lookbehind не потребляет пробел,
        // поэтому второй матч находит ведущий пробел перед «или».
        const r = TextSanitizer.applyTypography('<p>да или нет</p>')
        expect(r).toContain(`да${NBSP}или`)
        expect(r).toContain(`или${NBSP}нет`)
    })

    test('регистронезависимость: «В» в начале предложения', () => {
        const r = TextSanitizer.applyTypography('<p>В начале было слово</p>')
        expect(r).toContain(`В${NBSP}начале`)
    })

    test('длинное слово не из списка → обычный пробел', () => {
        const r = TextSanitizer.applyTypography('<p>программа запущена</p>')
        expect(r).not.toContain(NBSP)
    })

    test('предлог перед тегом: неразрывный пробел внутри текстовой ноды', () => {
        // «с» и «другом» в одной текстовой ноде → NBSP
        const r = TextSanitizer.applyTypography('<p>пришёл с другом</p>')
        expect(r).toContain(`с${NBSP}другом`)
    })

    test('повторный вызов не удваивает nbsp', () => {
        const once = TextSanitizer.applyTypography('<p>в магазин</p>')
        const twice = TextSanitizer.applyTypography(once)
        const nbspCount = (twice.match(/&nbsp;/g) || []).length
        expect(nbspCount).toBe(1)
    })
})

// ─── applyTypography() — совместная работа ────────────────────────────────

describe('TextSanitizer.applyTypography — кавычки + NBSP вместе', () => {

    const NBSP = '&nbsp;'

    test('кавычки и предлог в одном тексте', () => {
        const r = TextSanitizer.applyTypography('<p>"поездка в горы"</p>')
        expect(r).toContain('«')
        expect(r).toContain('»')
        expect(r).toContain(`в${NBSP}горы`)
    })

    test('HTML-структура не ломается после обеих замен', () => {
        // «и» перед <strong> — граница текстовой ноды, NBSP не вставляется.
        // Проверяем целостность HTML и корректную замену кавычек.
        const r = TextSanitizer.applyTypography(
            '<p>"текст" и <strong>жирное</strong> слово</p>'
        )
        expect(r).toContain('<strong>жирное</strong>')
        expect(r).toContain('«текст»')
        // «и» внутри одной текстовой ноды с последующим словом — NBSP есть
        const r2 = TextSanitizer.applyTypography('<p>и слово вместе</p>')
        expect(r2).toContain(`и${NBSP}слово`)
    })
})