/**
 * Панель «Запланированные» в старом встроенном Chromium (PyQtWebEngine 5.15):
 * там нет Element.replaceChildren, CSS `inset` и flex `gap`.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import { JSDOM } from 'jsdom'

const source = fs.readFileSync('./static/js/admin/scheduledPanel.js', 'utf8')

const formSource = fs.readFileSync('./static/js/admin/scheduledEditForm.js', 'utf8')

const batchSource = fs.readFileSync('./static/js/admin/scheduledBatch.js', 'utf8')

const letter = {
    id: '1', subject: 'Тема письма', to: ['a@rt.ru'], cc: [], bcc: [],
    send_at: '2026-12-01T09:00:00+00:00', has_attachments: false, waiting: true,
}

const tick = () => new Promise(resolve => setTimeout(resolve, 0))

function loadPanel(items, { mailboxes = [], calls = [], campaigns, failing } = {}) {
    const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only' })
    const { window } = dom
    delete window.Element.prototype.replaceChildren
    window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
    window.fetch = async (url, options) => {
        calls.push({ url, body: options?.body && JSON.parse(options.body) })
        const status = (failing && options?.body && failing(JSON.parse(options.body))) || 200
        return {
            ok: status === 200, status,
            json: async () => ({
                success: status === 200, error: 'сбой', items, mailboxes, campaigns,
            }),
        }
    }
    window.Toast = { success() {}, error() {}, info() {} }
    window.eval(`${formSource}\n${batchSource}\n${source}\nwindow.__panel = ScheduledPanel;`)
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

    it('кнопку «Текст» показывает только для писем с сохранёнными блоками', async () => {
        const window = loadPanel([letter, { ...letter, id: '2', editable: true }])

        await window.__panel.open()

        const buttons = Array.from(window.document.querySelectorAll('.sched-actions'))
            .map(cell => Array.from(cell.children).map(b => b.textContent))
        expect(buttons).toEqual([
            ['Изменить', 'Отменить'], ['Изменить', 'Текст', 'Отменить'],
        ])
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

describe('ScheduledPanel: массовая рассылка', () => {
    const campaigns = { c1: { subject_template: 'Привет, {{ФИО}}', total: 5 } }
    const mail = (id, to) => ({
        ...letter, id, to: [to], schedule_id: id, editable: true, campaign_id: 'c1',
    })
    const items = [mail('1', 'a@rt.ru'), mail('2', 'b@rt.ru'), mail('3', 'c@rt.ru')]

    async function openPanel(options = {}) {
        const calls = []
        const window = loadPanel(items, { campaigns, calls, ...options })
        window.confirm = () => true
        await window.__panel.open()
        const header = window.document.querySelector('.sched-campaign')
        const press = label => Array.from(header.querySelectorAll('button'))
            .find(b => b.textContent === label).click()
        return { window, calls, header, press }
    }

    const settle = async () => { for (let i = 0; i < 10; i += 1) await tick() }

    it('собирает письма в свёрнутую группу со счётчиком', async () => {
        const { window, header, press } = await openPanel()
        const letters = () => Array.from(
            window.document.querySelectorAll('.sched-campaign-letter'))

        expect(header.textContent).toContain('ждут 3 из 5')
        expect(letters().map(r => r.style.display)).toEqual(['none', 'none', 'none'])
        press('Показать письма')
        expect(letters().map(r => r.style.display)).toEqual(['', '', ''])
    })

    it('отменяет письма по одному и отчитывается', async () => {
        const { window, calls, press } = await openPanel()

        press('Отменить все')
        await settle()

        expect(calls.filter(c => c.url === '/api/scheduled/cancel').map(c => c.body.id))
            .toEqual(['1', '2', '3'])
        expect(window.document.querySelector('.sched-batch').textContent)
            .toContain('Готово: 3 из 3')
    })

    it('останавливается на первой ошибке', async () => {
        const { window, calls, press } = await openPanel({
            failing: body => (body.id === '2' ? 502 : 200),
        })

        press('Отменить все')
        await settle()

        expect(calls.filter(c => c.url === '/api/scheduled/cancel')).toHaveLength(2)
        const report = window.document.querySelector('.sched-batch').textContent
        expect(report).toContain('ошибка: сбой')
        expect(report).toContain('не обработано: 1')
    })

    it('уже отправленное письмо пропускает и идёт дальше', async () => {
        const { calls, press } = await openPanel({
            failing: body => (body.id === '1' ? 404 : 200),
        })

        press('Отменить все')
        await settle()

        expect(calls.filter(c => c.url === '/api/scheduled/cancel')).toHaveLength(3)
    })

    it('при смене только времени не трогает темы писем', async () => {
        const { window, calls, press } = await openPanel()
        press('Тема и время')
        const form = window.document.querySelector('.sched-form')
        expect(form.querySelector('[name=to]')).toBeNull()
        form.querySelector('[name=send_at]').value = '2027-03-04T10:30'

        form.dispatchEvent(new window.Event('submit', { cancelable: true }))
        await settle()

        const updates = calls.filter(c => c.url === '/api/scheduled/update').map(c => c.body)
        expect(updates.map(u => u.send_at)).toEqual(Array(3).fill('2027-03-04T10:30'))
        expect(updates[1]).toMatchObject({ subject: 'Тема письма', to: ['b@rt.ru'] })
        expect(updates[1].subject_template).toBeUndefined()
    })
})
