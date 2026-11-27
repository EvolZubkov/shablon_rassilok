/**
 * tests/typography.test.js — кавычки-«ёлочки» для текста баннера.
 */

const { toGuillemets } = require('../static/js/shared/typography.js')

describe('toGuillemets', () => {
    it('заменяет прямые кавычки на ёлочки', () => {
        expect(toGuillemets('Акция "Лето" началась')).toBe('Акция «Лето» началась')
    })

    it('заменяет английские “ ” на ёлочки', () => {
        expect(toGuillemets('Проект “Заря”')).toBe('Проект «Заря»')
    })

    it('вложенные кавычки становятся лапками', () => {
        expect(toGuillemets('"Клуб "Ромашка" открыт"')).toBe('«Клуб „Ромашка“ открыт»')
    })

    it('кавычка в начале строки — открывающая, в конце — закрывающая', () => {
        expect(toGuillemets('"Привет"')).toBe('«Привет»')
    })

    it('работает построчно с переводами строки', () => {
        expect(toGuillemets('"Первая"\n"Вторая"')).toBe('«Первая»\n«Вторая»')
    })

    it('не трогает текст без кавычек и пустые значения', () => {
        expect(toGuillemets('Просто текст')).toBe('Просто текст')
        expect(toGuillemets('')).toBe('')
        expect(toGuillemets(undefined)).toBe('')
    })

    it('уже готовые ёлочки остаются ёлочками', () => {
        expect(toGuillemets('«Лето»')).toBe('«Лето»')
    })
})
