// Общая сборка окна рассылки на jsdom: настоящая разметка index-user.html и настоящие скрипты.
const fs = require('fs')
const { JSDOM } = require('jsdom')

const read = file => fs.readFileSync(file, 'utf-8').split(String.fromCharCode(13)).join('')

const SCRIPTS = [
    'static/js/user/bulkPlaceholders.js',
    'static/js/user/bulkFieldPicker.js',
    'static/js/user/bulkAttachSummary.js',
    'static/js/user/bulkAttachments.js',
]

/**
 * @param {{page?:string, fetch?:Function}} [options]
 *   fetch — подмена window.fetch до запуска скриптов (панель обращается к серверу при старте);
 *   beforeScripts(window) — подготовка окна (например, заглушки ResizeObserver) до запуска скриптов.
 */
async function makePanel({ page = 'static/index-user.html', fetch, beforeScripts } = {}) {
    const dom = new JSDOM(read(page), { runScripts: 'outside-only', pretendToBeVisual: true })
    const { window } = dom
    window.Toast = { messages: [], show(text, type) { this.messages.push({ text, type }) } }
    if (fetch) window.fetch = fetch
    if (beforeScripts) beforeScripts(window)
    SCRIPTS.forEach(file => window.eval(read(file)))
    window.eval(read('static/js/user/bulk-mail-panel.js') + '\n;window.BulkMailPanel = BulkMailPanel;')
    // init() панели запускается по DOMContentLoaded — ждём его
    await new Promise(r => setTimeout(r, 20))
    return window
}

const parsed = (headers, rows) => ({ sheets: ['Лист1'], headers, rows, total: rows.length })

/** fetch-заглушка: маршрут -> функция(тело) -> объект ответа. */
function routerFetch(routes, calls = []) {
    return async (url, init = {}) => {
        const handler = routes[url]
        calls.push({ url, init })
        if (!handler) return { ok: false, status: 404, headers: { get: () => 'application/json' }, json: async () => ({ error: 'нет маршрута' }) }
        const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body
        const result = await handler(body, init)
        return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => result }
    }
}

const wait = ms => new Promise(r => setTimeout(r, ms))

module.exports = { makePanel, parsed, routerFetch, wait, read }
