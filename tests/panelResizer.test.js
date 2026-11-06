/**
 * tests/panelResizer.test.js
 *
 * Изменяемая ширина боковых панелей (static/js/shared/panelResizer.js).
 */

const fs = require('fs')
const { JSDOM } = require('jsdom')
const PanelResizer = require('../static/js/shared/panelResizer.js')

const { clampWidth } = PanelResizer
const LIMITS = { min: 280, max: 720, available: 1600, otherWidth: 0, minCenter: 640 }

describe('clampWidth', () => {
    test('в пределах — как есть', () => {
        expect(clampWidth(400, LIMITS)).toBe(400)
    })

    test('не уже минимума и не шире максимума', () => {
        expect(clampWidth(100, LIMITS)).toBe(280)
        expect(clampWidth(2000, LIMITS)).toBe(720)
    })

    test('холст не сжимается ниже минимума', () => {
        // 1000 - 340 (вторая панель) - 640 (холст) = 20 → не меньше min
        expect(clampWidth(500, { ...LIMITS, available: 1000, otherWidth: 340 })).toBe(280)
        // 1300 - 340 - 640 = 320
        expect(clampWidth(700, { ...LIMITS, available: 1300, otherWidth: 340 })).toBe(320)
    })

    test('дробные значения округляются', () => {
        expect(clampWidth(400.6, LIMITS)).toBe(401)
    })
})

function setup({ stored } = {}) {
    const dom = new JSDOM('<div id="shell"><aside id="side"></aside><main></main></div>', { pretendToBeVisual: true })
    const { window } = dom
    global.window = window
    global.document = window.document
    global.getComputedStyle = window.getComputedStyle.bind(window)
    global.Event = window.Event
    const store = new Map(stored ? [['k', String(stored)]] : [])
    global.localStorage = {
        getItem: key => (store.has(key) ? store.get(key) : null),
        setItem: (key, value) => store.set(key, value)
    }
    const shell = window.document.getElementById('shell')
    const side = window.document.getElementById('side')
    Object.defineProperty(shell, 'clientWidth', { value: 1600 })
    shell.getBoundingClientRect = () => ({ left: 0, right: 1600, width: 1600 })
    side.getBoundingClientRect = () => {
        const w = parseInt(shell.style.getPropertyValue('--w') || '280', 10)
        return { left: 0, right: w, width: w }
    }
    const api = PanelResizer.attach({
        container: shell, panel: side, side: 'left', cssVar: '--w', storageKey: 'k',
        defaultWidth: 280, min: 240, max: 720, label: 'Ширина'
    })
    return { window, shell, api, store }
}

describe('attach', () => {
    test('ручка доступна: separator, фокус, значения', () => {
        const { api } = setup()
        expect(api.handle.getAttribute('role')).toBe('separator')
        expect(api.handle.tabIndex).toBe(0)
        expect(api.handle.getAttribute('aria-valuenow')).toBe('280')
    })

    test('стрелка вправо увеличивает левую панель и запоминает ширину', () => {
        const { window, shell, api, store } = setup()
        api.handle.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight' }))
        expect(shell.style.getPropertyValue('--w')).toBe('296px')
        expect(store.get('k')).toBe('296')
    })

    test('Shift + стрелка — крупный шаг, Home/End — границы', () => {
        const { window, shell, api } = setup()
        api.handle.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true }))
        expect(shell.style.getPropertyValue('--w')).toBe('344px')
        api.handle.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'End' }))
        expect(shell.style.getPropertyValue('--w')).toBe('720px')
        api.handle.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Home' }))
        expect(shell.style.getPropertyValue('--w')).toBe('240px')
    })

    test('двойной клик возвращает ширину по умолчанию', () => {
        const { window, shell, api, store } = setup()
        api.apply(500)
        api.handle.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true }))
        expect(shell.style.getPropertyValue('--w')).toBe('280px')
        expect(store.get('k')).toBe('280')
    })

    test('сохранённая ширина применяется при запуске', () => {
        const { shell } = setup({ stored: 450 })
        expect(shell.style.getPropertyValue('--w')).toBe('450px')
    })

    test('сохранённая ширина вне границ приводится к допустимой', () => {
        const { shell } = setup({ stored: 5000 })
        expect(shell.style.getPropertyValue('--w')).toBe('720px')
    })

    test('перетаскивание мышью меняет ширину по позиции курсора', () => {
        const { window, shell, api } = setup()
        api.handle.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, button: 0 }))
        api.handle.dispatchEvent(new window.MouseEvent('pointermove', { bubbles: true, clientX: 520 }))
        expect(shell.style.getPropertyValue('--w')).toBe('520px')
        api.handle.dispatchEvent(new window.MouseEvent('pointerup', { bubbles: true }))
        expect(window.document.body.classList.contains('panel-resizing')).toBe(false)
    })
})
