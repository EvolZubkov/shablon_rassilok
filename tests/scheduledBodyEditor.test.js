/** Правка текста запланированного письма: холст занимается и возвращается. */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import { JSDOM } from 'jsdom'

const source = fs.readFileSync('./static/js/admin/scheduledBodyEditor.js', 'utf8')

const item = {
    id: '1', schedule_id: 'a'.repeat(32), subject: '[На согласование] Тема',
    send_at: '2026-12-01T09:00:00+00:00',
}
const saved = { blocks: [{ id: 7, type: 'text' }], comment: '', review: true }

function load({ status = 200, response = { success: true } } = {}) {
    const dom = new JSDOM(
        '<!doctype html><body><main><div id="canvas"></div></main></body>',
        { runScripts: 'outside-only' },
    )
    const { window } = dom
    const calls = { fetch: [], build: [], errors: [] }
    const original = [{ id: 1, type: 'banner' }]
    Object.assign(window, {
        AppState: { blocks: original, blockIdCounter: 2, selectedBlockId: 1 },
        TemplatesUI: {
            currentTemplate: { name: 'Мой' }, savedSnapshot: 'x',
            findMaxBlockId: blocks => Math.max(...blocks.map(b => b.id)),
        },
        Toast: { success() {}, warning() {}, error: m => calls.errors.push(m) },
        ExchangeModals: {
            buildScheduledBody: async (options) => {
                calls.build.push(options)
                return { html_body: '<p>новое</p>', blocks: window.AppState.blocks }
            },
        },
        renderCanvas() {}, renderSettings() {}, migrateExpertLite: blocks => blocks,
        confirm: () => true,
        fetch: async (url, options) => {
            calls.fetch.push({ url, body: JSON.parse(options.body) })
            return { ok: status === 200, status, json: async () => response }
        },
    })
    window.eval(`${source}\nwindow.__editor = ScheduledBodyEditor;`)
    return { window, editor: window.__editor, calls, original }
}

describe('ScheduledBodyEditor', () => {
    it('занимает холст блоками письма и скрывает отправку', () => {
        const { window, editor } = load()

        editor.start(item, saved, 'me@rt.ru')

        expect(window.AppState.blocks).toEqual(saved.blocks)
        expect(window.AppState.blockIdCounter).toBe(8)
        expect(window.TemplatesUI.currentTemplate).toBeNull()
        expect(window.document.body.classList.contains('sched-editing')).toBe(true)
        expect(window.document.querySelector('.sched-editbar').textContent).toContain('Тема')
    })

    it('отмена возвращает прежний холст и ничего не отправляет', () => {
        const { window, editor, calls, original } = load()
        editor.start(item, saved, 'me@rt.ru')

        editor.cancel()

        expect(window.AppState.blocks).toBe(original)
        expect(window.TemplatesUI.currentTemplate).toEqual({ name: 'Мой' })
        expect(window.document.querySelector('.sched-editbar')).toBeNull()
        expect(calls.fetch).toHaveLength(0)
    })

    it('история Ctrl+Z письма и прежнего холста не смешивается', () => {
        const { window, editor } = load()
        const history = ['прежнее действие']
        window.AppState.undoStack = history
        window.AppState.redoStack = []
        editor.start(item, saved, 'me@rt.ru')
        expect(window.AppState.undoStack).toHaveLength(0)
        window.AppState.undoStack.push('действие в письме')

        editor.cancel()

        expect(window.AppState.undoStack).toBe(history)
        expect(history).toEqual(['прежнее действие'])
    })

    it('сохранение заменяет письмо и возвращает холст', async () => {
        const { window, editor, calls, original } = load()
        editor.start(item, saved, 'me@rt.ru')

        await editor.save()

        expect(calls.build[0]).toMatchObject({ subject: 'Тема', review: true })
        expect(calls.fetch[0].url).toBe('/api/scheduled/body')
        expect(calls.fetch[0].body).toMatchObject({
            schedule_id: item.schedule_id, from_email: 'me@rt.ru', html_body: '<p>новое</p>',
        })
        expect(window.AppState.blocks).toBe(original)
        expect(editor.isActive()).toBe(false)
    })

    it('при ошибке правка остаётся открытой', async () => {
        const { window, editor, calls } = load({
            status: 404, response: { success: false, error: 'уже отправлено' },
        })
        editor.start(item, saved, 'me@rt.ru')

        await editor.save()

        expect(calls.errors).toEqual(['уже отправлено'])
        expect(editor.isActive()).toBe(true)
        expect(window.AppState.blocks).toEqual(saved.blocks)
    })

    it('вторую правку поверх первой не начинает', () => {
        const { editor } = load()
        editor.start(item, saved, 'me@rt.ru')

        expect(editor.start(item, saved, 'me@rt.ru')).toBe(false)
    })
})
