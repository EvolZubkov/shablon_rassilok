/**
 * tests/userToolbarInsert.test.js
 *
 * Вставка поля из таблицы в текст на холсте (static/js/user/userToolbar.js, insertField):
 * поле встаёт на место курсора — и в тексте, и в заголовке, — даже если сохранённая
 * позиция устарела после перерисовки.
 */

const fs = require('node:fs')
const path = require('node:path')
const { JSDOM } = require('jsdom')

const TOOLBAR_SRC = fs.readFileSync(path.join(__dirname, '../static/js/user/userToolbar.js'), 'utf8')

/** Грузит userToolbar.js в окно и выполняет сценарий в той же области видимости. */
function run(html, scenario) {
    const dom = new JSDOM(`<body><div id="user-canvas">${html}</div></body>`, { runScripts: 'outside-only' })
    dom.window.eval(`${TOOLBAR_SRC}\n;window.__result = (function () { ${scenario} })();`)
    return { window: dom.window, result: dom.window.__result }
}

const HEADING = '<div class="editable-text" id="ed" contenteditable="true">Уведомление для !</div>'
const TEXT = '<div class="editable-text" id="ed" contenteditable="true"><p>Здравствуйте, ! Ждём вас.</p></div>'

describe('insertField: место вставки', () => {
    test.each([
        ['заголовок', HEADING, 'Уведомление для {{ФИО}}!'],
        ['текст', TEXT, 'Здравствуйте, {{ФИО}}! Ждём вас.'],
    ])('%s: поле встаёт перед «!», где стоял курсор', (_name, html, expected) => {
        const { window } = run(html, `
            const ed = document.getElementById('ed');
            const node = ed.querySelector('p') ? ed.querySelector('p').firstChild : ed.firstChild;
            const caret = node.nodeValue.indexOf('!');
            const range = document.createRange();
            range.setStart(node, caret); range.collapse(true);
            currentEditableElement = ed;
            savedSelection = range;
            insertField('ФИО');
        `)
        expect(window.document.getElementById('ed').textContent).toBe(expected)
    })

    test('устаревшая сохранённая позиция: берётся живое выделение внутри элемента', () => {
        const { window } = run(HEADING, `
            const ed = document.getElementById('ed');
            const gone = document.createElement('span');
            gone.textContent = 'старый узел';
            const stale = document.createRange();
            stale.setStart(gone.firstChild, 3); stale.collapse(true);   // узел не в документе
            const node = ed.firstChild;
            const live = document.createRange();
            live.setStart(node, node.nodeValue.indexOf('!')); live.collapse(true);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(live);
            currentEditableElement = ed;
            savedSelection = stale;
            insertField('ФИО');
        `)
        expect(window.document.getElementById('ed').textContent).toBe('Уведомление для {{ФИО}}!')
    })

    test('нет ни сохранённой позиции, ни выделения: поле добавляется в конец', () => {
        const { window } = run(HEADING, `
            currentEditableElement = document.getElementById('ed');
            savedSelection = null;
            window.getSelection().removeAllRanges();
            insertField('ФИО');
        `)
        expect(window.document.getElementById('ed').textContent).toBe('Уведомление для !{{ФИО}}')
    })

    test('курсор после поля: второе поле встаёт сразу за первым', () => {
        const { window } = run(HEADING, `
            const ed = document.getElementById('ed');
            const range = document.createRange();
            range.setStart(ed.firstChild, ed.firstChild.nodeValue.indexOf('!')); range.collapse(true);
            currentEditableElement = ed;
            savedSelection = range;
            insertField('ФИО');
            insertField('Договор');
        `)
        expect(window.document.getElementById('ed').textContent).toBe('Уведомление для {{ФИО}}{{Договор}}!')
    })
})
