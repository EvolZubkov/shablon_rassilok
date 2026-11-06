/**
 * tests/emailAutocompleteRemote.test.js
 *
 * Подсказки получателей из адресной книги Exchange в EmailAutocomplete
 * (static/js/shared/emailHistoryStore.js): слияние с историей, debounce,
 * защита от устаревших ответов, отключение при ошибке сервера.
 */

const { JSDOM } = require('jsdom')
const fs = require('fs')

const DEBOUNCE_MS = 250
const BACKOFF_MS = 60000

let dom
let input
let fetchMock

function loadWidget() {
    dom = new JSDOM('<!DOCTYPE html><body><input id="email-to"></body>', { url: 'http://localhost' })
    global.window = dom.window
    global.document = dom.window.document
    global.localStorage = dom.window.localStorage
    global.fetch = (...args) => fetchMock(...args)
    global.AbortController = dom.window.AbortController

    const source = fs.readFileSync('./static/js/shared/emailHistoryStore.js', 'utf-8')
    new Function(source)()   // регистрирует window.EmailHistoryStore / EmailAutocomplete
    input = document.getElementById('email-to')
    window.EmailAutocomplete.attach(input)
}

function reply(suggestions, ok = true) {
    return Promise.resolve({ ok, json: () => Promise.resolve({ success: ok, suggestions }) })
}

async function type(text) {
    input.focus()
    input.value = text
    input.setSelectionRange(text.length, text.length)
    input.dispatchEvent(new dom.window.Event('input'))
}

async function flush() {
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 10)
}

function shownValues() {
    return [...document.querySelectorAll('.email-ac-item')].map(li => li.dataset.value)
}

beforeEach(() => {
    vi.useFakeTimers()
    fetchMock = vi.fn(() => reply([]))
    loadWidget()
})

afterEach(() => {
    vi.useRealTimers()
})

describe('mergeSuggestions', () => {
    it('puts history first, then server entries, without duplicates', () => {
        const merged = window.EmailAutocomplete._mergeSuggestions(
            ['a@rt.ru'],
            [{ name: 'A', email: 'A@rt.ru' }, { name: 'B', email: 'b@rt.ru' }],
        )
        expect(merged.map(i => i.value)).toEqual(['a@rt.ru', 'b@rt.ru'])
    })

    it('labels server entries with name and address', () => {
        const [item] = window.EmailAutocomplete._mergeSuggestions([], [{ name: 'Зубков Е.', email: 'z@rt.ru' }])
        expect(item.label).toBe('Зубков Е. <z@rt.ru>')
    })

    it('keeps room for server entries when history is long', () => {
        const history = Array.from({ length: 8 }, (_, i) => `h${i}@rt.ru`)
        const remote = [{ name: 'S', email: 's@rt.ru' }]
        const merged = window.EmailAutocomplete._mergeSuggestions(history, remote)
        expect(merged.map(i => i.value)).toContain('s@rt.ru')
        expect(merged.length).toBeLessThanOrEqual(8)
    })
})

describe('remote suggestions', () => {
    it('requests the server after debounce and shows the result', async () => {
        fetchMock.mockImplementation(() => reply([{ name: 'Зубков', email: 'z@rt.ru' }]))
        await type('зубк')
        expect(fetchMock).not.toHaveBeenCalled()
        await flush()
        expect(fetchMock).toHaveBeenCalledTimes(1)
        expect(fetchMock.mock.calls[0][0]).toBe('/api/recipients/suggest?q=' + encodeURIComponent('зубк'))
        expect(shownValues()).toEqual(['z@rt.ru'])
    })

    it('sends one request for a burst of keystrokes', async () => {
        await type('зу')
        await vi.advanceTimersByTimeAsync(100)
        await type('зуб')
        await vi.advanceTimersByTimeAsync(100)
        await type('зубк')
        await flush()
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('does not query the server for a single character', async () => {
        await type('з')
        await flush()
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('queries only the token being edited', async () => {
        await type('a@rt.ru, иван')
        await flush()
        expect(fetchMock.mock.calls[0][0]).toBe('/api/recipients/suggest?q=' + encodeURIComponent('иван'))
    })

    it('ignores a stale response when the text changed meanwhile', async () => {
        let resolveFirst
        fetchMock.mockImplementationOnce(() => new Promise(r => { resolveFirst = r }))
        await type('зубк')
        await flush()
        await type('петр')                       // пользователь ушёл дальше
        resolveFirst({ ok: true, json: () => Promise.resolve({ suggestions: [{ name: 'Z', email: 'z@rt.ru' }] }) })
        await vi.advanceTimersByTimeAsync(0)
        expect(shownValues()).not.toContain('z@rt.ru')
    })

    it('stops calling the server for a while after an error', async () => {
        fetchMock.mockImplementation(() => reply([], false))
        await type('зубк')
        await flush()
        await type('зубков')
        await flush()
        expect(fetchMock).toHaveBeenCalledTimes(1)
        await vi.advanceTimersByTimeAsync(BACKOFF_MS)
        await type('зубков')
        await flush()
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('keeps history suggestions when the server is unreachable', async () => {
        window.EmailHistoryStore.add('zubkov@rt.ru')
        fetchMock.mockImplementation(() => Promise.reject(new Error('offline')))
        await type('zubk')
        await flush()
        expect(shownValues()).toEqual(['zubkov@rt.ru'])
    })

    it('does not start a second request while one is still pending', async () => {
        let resolveFirst
        fetchMock.mockImplementationOnce(() => new Promise(r => { resolveFirst = r }))
        await type('зубк')
        await flush()
        await type('зубков')
        await flush()
        expect(fetchMock).toHaveBeenCalledTimes(1)
        resolveFirst({ ok: true, json: () => Promise.resolve({ suggestions: [] }) })
        await vi.advanceTimersByTimeAsync(0)
        await flush()
        expect(fetchMock).toHaveBeenCalledTimes(2)   // уже по актуальному тексту
        expect(fetchMock.mock.calls[1][0]).toBe('/api/recipients/suggest?q=' + encodeURIComponent('зубков'))
    })

    it('shows the server error in the dropdown instead of staying silent', async () => {
        fetchMock.mockImplementation(() => Promise.resolve({
            ok: false, json: () => Promise.resolve({ error: 'Exchange отклонил учётные данные' }),
        }))
        await type('зубк')
        await flush()
        const note = document.querySelector('.email-ac-note')
        expect(note).not.toBeNull()
        expect(note.textContent).toContain('Адресная книга недоступна')
        expect(note.textContent).toContain('Exchange отклонил учётные данные')
        expect(note.dataset.value).toBeUndefined()      // не выбирается как адрес
    })

    it('keeps history entries visible next to the error note', async () => {
        window.EmailHistoryStore.add('zubkov@rt.ru')
        fetchMock.mockImplementation(() => reply([], false))
        await type('zubk')
        await flush()
        expect(shownValues()).toContain('zubkov@rt.ru')
    })
})
