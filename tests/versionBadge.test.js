/**
 * tests/versionBadge.test.js
 *
 * Плашка версии (static/js/shared/versionBadge.js): видна на скриншоте,
 * не перехватывает клики, не дублируется, переживает недоступность сервера.
 */

const { JSDOM } = require('jsdom')
const fs = require('fs')

let dom
let fetchMock

function load() {
    dom = new JSDOM('<!DOCTYPE html><body></body>', { url: 'http://localhost' })
    global.window = dom.window
    global.document = dom.window.document
    global.fetch = (...args) => fetchMock(...args)
    const source = fs.readFileSync('./static/js/shared/versionBadge.js', 'utf-8')
    new Function(source)()
}

const badge = () => document.getElementById('app-version-badge')

const okReply = (version) =>
    () => Promise.resolve({ ok: true, json: () => Promise.resolve({ version }) })

/** Загружает скрипт при заданном ответе сервера (он сам вызывает show() при загрузке). */
async function loadWith(impl) {
    fetchMock = vi.fn(impl)
    load()
    await new Promise(r => setTimeout(r, 0))
}

beforeEach(() => loadWith(okReply('2.9.2')))

it('shows the version from the server', async () => {
    expect(badge().textContent).toBe('v2.9.2')
})

it('does not block clicks on the interface under it', async () => {
    await window.VersionBadge.show()
    expect(badge().style.pointerEvents).toBe('none')
})

it('is created only once', async () => {
    await window.VersionBadge.show()
    await window.VersionBadge.show()
    expect(document.querySelectorAll('#app-version-badge')).toHaveLength(1)
})

it('is not shown when the server answers with an error', async () => {
    await loadWith(() => Promise.resolve({ ok: false }))
    expect(badge()).toBeNull()
})

it('is not shown when the server is unreachable', async () => {
    await loadWith(() => Promise.reject(new Error('offline')))
    expect(badge()).toBeNull()
})

it('inserts the version as text, not as markup', async () => {
    await loadWith(okReply('<img src=x onerror=1>'))
    expect(badge().querySelector('img')).toBeNull()
})
