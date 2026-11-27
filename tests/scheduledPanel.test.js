/**
 * Панель «Запланированные» в старом встроенном Chromium (PyQtWebEngine 5.15):
 * там нет Element.replaceChildren, CSS `inset` и flex `gap`.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import { JSDOM } from 'jsdom'

const source = fs.readFileSync('./static/js/admin/scheduledPanel.js', 'utf8')

const formSource = fs.readFileSync('./static/js/admin/scheduledEditForm.js', 'utf8')

const letter = {
    id: '1', subject: 'Тема письма', to: ['a@rt.ru'], cc: [], bcc: [],
    send_at: '2026-12-01T09:00:00+00:00', has_attachments: false, waiting: true,
}

const tick = () => new Promise(resolve => setTimeout(resolve, 0))

function loadPanel(items, { mailboxes = [], calls = [] } = {}) {
    const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only' })
    const { window } = dom
    delete window.Element.prototype.replaceChildren
    window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
    window.fetch = async (url, options) => {
        calls.push({ url, body: options?.body && JSON.parse(options.body) })
        return { ok: true, status: 200, json: async () => ({ success: true, items, mailboxes }) }
    }
    window.Toast = { success() {}, error() {}, info() {} }
    window.eval(`${formSource}\n${source}\nwindow.__panel = ScheduledPanel;`)
    return window
}

describe('ScheduledPanel в старом браузере', () => {
    it('открывается и показывает письма без replaceChildren', async () => {
        const window = loadPanel([letter])

        await window.__panel.open()

        const rows = window.document.querySelectorAll('.sched-table tbody tr')
        expect(rows).toHaveLength(1)
        expect(rows[0].textContent).toContain('Тема письма')
        expect(window.document.querySelector('.sched-status').textContent)
            .toBe('Ожидают отправки: 1')
    })

    it('повторное обновление не дублирует строки', async () => {
        const window = loadPanel([letter])
        await window.__panel.open()

        await Promise.all([window.__panel.refresh(), window.__panel.refresh()])

        expect(window.document.querySelectorAll('.sched-table tbody tr')).toHaveLength(1)
    })

    it('предлагает ящики на выбор и запрашивает письма выбранного', async () => {
        const calls = []
        const window = loadPanel([letter], { mailboxes: ['me@rt.ru', 'hr@rt.ru'], calls })
        await window.__panel.open()
        const select = window.document.querySelector('select.sched-mailbox')

        select.value = 'hr@rt.ru'
        select.dispatchEvent(new window.Event('change'))
        await tick()

        expect(Array.from(select.options).map(o => o.textContent))
            .toEqual(['me@rt.ru', 'hr@rt.ru', 'Другой ящик…'])
        expect(calls.at(-1).url).toBe('/api/scheduled/list?from_email=hr%40rt.ru')
    })

    it('сохраняет изменения письма из выбранного ящика', async () => {
        const calls = []
        const window = loadPanel([letter], { mailboxes: ['me@rt.ru'], calls })
        await window.__panel.open()
        window.document.querySelector('.sched-actions .sched-btn').click()
        const form = window.document.querySelector('.sched-form')
        form.querySelector('[name=subject]').value = 'Новая тема'

        form.dispatchEvent(new window.Event('submit', { cancelable: true }))
        await tick()

        const saved = calls.find(c => c.url === '/api/scheduled/update').body
        expect(saved).toMatchObject({
            id: '1', from_email: 'me@rt.ru', subject: 'Новая тема', to: 'a@rt.ru',
        })
        expect(new Date(saved.send_at).getTime()).toBe(new Date(letter.send_at).getTime())
        expect(window.document.querySelector('.sched-form')).toBeNull()
    })

    it('стили диалогов не используют неподдерживаемые inset и gap', () => {
        const panelCss = fs.readFileSync('./static/scheduled-panel.css', 'utf8')
        const userCss = fs.readFileSync('./static/user-styles.css', 'utf8')
        const userDialogCss = userCss.slice(userCss.indexOf('/* Диалог выбора'))

        for (const css of [panelCss, userDialogCss]) {
            expect(css).not.toMatch(/^\s*(inset|gap):/m)
        }
    })
})
