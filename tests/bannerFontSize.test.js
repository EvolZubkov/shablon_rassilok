import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'fs'

let getSize
let profileDefaults = null

beforeAll(() => {
    const source = fs.readFileSync('./static/js/imageRenderers.js', 'utf-8')
    const start = source.indexOf('const BANNER_TITLE_FONT_SIZE')
    const end = source.indexOf('// Рисуем текстовый элемент', start)
    const fn = new Function('ProfileLoader', source.slice(start, end) + '\nreturn getBannerTextFontSize;')
    getSize = fn({ loaded: true, getBlockDefaults: () => profileDefaults })
})

describe('getBannerTextFontSize — размер шрифта баннера из профиля', () => {
    it('без настроек профиля — стандартные 28 и 14', () => {
        profileDefaults = null
        expect([getSize(0), getSize(1), getSize(2)]).toEqual([28, 14, 14])
    })

    it('берёт размеры из профиля аудитории', () => {
        profileDefaults = { titleFontSize: 36, extraFontSize: 18 }
        expect([getSize(0), getSize(1), getSize(2)]).toEqual([36, 18, 18])
    })

    it('задан только один размер — второй остаётся стандартным', () => {
        profileDefaults = { titleFontSize: 32 }
        expect([getSize(0), getSize(1)]).toEqual([32, 14])
    })
})
