/**
 * tests/rtFonts.test.js — ожидание шрифтов Rostelecom перед отрисовкой canvas.
 *
 * Canvas не ждёт @font-face: пока шрифт не загружен, баннер и кнопка рисуются
 * запасным Arial (заголовок «худеет», кнопка меняет гарнитуру). whenRtFontsReady
 * вызывает callback только после загрузки; без Font Loading API — сразу.
 */
import { describe, test, expect, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync(path.join(__dirname, '../static/js/imageRenderers.js'), 'utf8')
const start = source.indexOf('const _RT_CANVAS_FONTS')
const end = source.indexOf('// Polyfill for CanvasRenderingContext2D.roundRect')
const helperCode = source.slice(start, end)

function createHelper(documentStub) {
    return new Function('document', `${helperCode}; return { whenRtFontsReady, isSettled: () => _rtFontsSettled };`)(documentStub)
}

describe('whenRtFontsReady', () => {
    test('вызывает callback сразу, если Font Loading API недоступен', () => {
        const { whenRtFontsReady } = createHelper({})
        const callback = vi.fn()

        whenRtFontsReady(callback)

        expect(callback).toHaveBeenCalledTimes(1)
    })

    test('ждёт загрузки всех четырёх начертаний', async () => {
        const load = vi.fn(() => Promise.resolve([]))
        const { whenRtFontsReady, isSettled } = createHelper({ fonts: { load } })
        const callback = vi.fn()

        whenRtFontsReady(callback)
        expect(callback).not.toHaveBeenCalled()
        await new Promise(resolve => setTimeout(resolve, 0))

        expect(load).toHaveBeenCalledTimes(4)
        expect(callback).toHaveBeenCalledTimes(1)
        expect(isSettled()).toBe(true)
    })

    test('после загрузки вызывает callback синхронно', async () => {
        const { whenRtFontsReady } = createHelper({ fonts: { load: () => Promise.resolve([]) } })
        whenRtFontsReady(() => {})
        await new Promise(resolve => setTimeout(resolve, 0))
        const callback = vi.fn()

        whenRtFontsReady(callback)

        expect(callback).toHaveBeenCalledTimes(1)
    })

    test('ошибка загрузки одного шрифта не блокирует отрисовку', async () => {
        const load = vi.fn(() => Promise.reject(new Error('нет файла')))
        const { whenRtFontsReady } = createHelper({ fonts: { load } })
        const callback = vi.fn()

        whenRtFontsReady(callback)
        await new Promise(resolve => setTimeout(resolve, 0))

        expect(callback).toHaveBeenCalledTimes(1)
    })
})

describe('шрифты в user-режиме', () => {
    test('user-styles.css объявляет все четыре @font-face', () => {
        const css = fs.readFileSync(path.join(__dirname, '../static/user-styles.css'), 'utf8')
        for (const name of ['Light', 'Regular', 'Medium', 'Bold']) {
            expect(css).toContain(`font-family: 'RostelecomBasis-${name}'`)
        }
    })

    test('баннер и кнопка дожидаются шрифтов перед отрисовкой', () => {
        expect(source).toMatch(/function renderBannerToDataUrl[^{]*\{\s*if \(!_rtFontsSettled/)
        expect(source).toMatch(/function renderButtonToDataUrl[^{]*\{\s*if \(!_rtFontsSettled/)
    })
})

describe('разделитель таблицы в письме', () => {
    test('высота полосы жёстко ограничена (клиенты с минимальным размером шрифта)', () => {
        const mail = fs.readFileSync(path.join(__dirname, '../static/js/emailGenerator.js'), 'utf8')
        const row = mail.slice(mail.indexOf('const dividerRow'), mail.indexOf('const cardWidth'))
        expect(row).toContain('max-height:${heightPx}px')
        expect(row).toContain('overflow:hidden')
        expect(row).toContain('mso-line-height-rule:exactly')
    })
})
