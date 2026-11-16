/**
 * tests/templateSelection.test.js
 *
 * Логика множественного выделения шаблонов (static/js/shared/templateSelection.js).
 */

const { keyOf, rangeKeys, applyClick, bulkCapabilities } = require('../static/js/shared/templateSelection.js')

const ORDER = ['shared:a', 'shared:b', 'shared:c', 'shared:d', 'personal:e']
const empty = { keys: [], anchor: null }

describe('rangeKeys', () => {
    test('диапазон вниз от якоря до цели включительно', () => {
        expect(rangeKeys(ORDER, 'shared:b', 'shared:d')).toEqual(['shared:b', 'shared:c', 'shared:d'])
    })

    test('диапазон вверх возвращается в порядке списка', () => {
        expect(rangeKeys(ORDER, 'shared:d', 'shared:b')).toEqual(['shared:b', 'shared:c', 'shared:d'])
    })

    test('без якоря выбирается только цель', () => {
        expect(rangeKeys(ORDER, null, 'shared:c')).toEqual(['shared:c'])
    })

    test('якорь, которого нет в списке (скрыт поиском), даёт только цель', () => {
        expect(rangeKeys(ORDER, 'shared:zzz', 'shared:c')).toEqual(['shared:c'])
    })

    test('цели нет в списке — пусто', () => {
        expect(rangeKeys(ORDER, 'shared:a', 'shared:zzz')).toEqual([])
    })

    test('дубль из «Избранных» не раздувает диапазон', () => {
        const withFavorite = ['shared:c', 'shared:a', 'shared:b', 'shared:c', 'shared:d']
        expect(rangeKeys(withFavorite, 'shared:a', 'shared:d')).toEqual(['shared:a', 'shared:b', 'shared:c', 'shared:d'])
    })
})

describe('applyClick', () => {
    test('Ctrl добавляет строку и делает её якорем', () => {
        const next = applyClick(empty, ORDER, 'shared:b', { ctrl: true })
        expect(next).toEqual({ keys: ['shared:b'], anchor: 'shared:b' })
    })

    test('Ctrl по выбранной строке снимает её', () => {
        const state = { keys: ['shared:a', 'shared:b'], anchor: 'shared:a' }
        const next = applyClick(state, ORDER, 'shared:b', { ctrl: true })
        expect(next.keys).toEqual(['shared:a'])
    })

    test('Shift выделяет диапазон от якоря и якорь не двигает', () => {
        const state = { keys: ['shared:a'], anchor: 'shared:a' }
        const next = applyClick(state, ORDER, 'shared:c', { shift: true })
        expect(next).toEqual({ keys: ['shared:a', 'shared:b', 'shared:c'], anchor: 'shared:a' })
    })

    test('Shift заменяет прежнее выделение диапазоном', () => {
        const state = { keys: ['shared:a', 'personal:e'], anchor: 'shared:a' }
        const next = applyClick(state, ORDER, 'shared:c', { shift: true })
        expect(next.keys).toEqual(['shared:a', 'shared:b', 'shared:c'])
    })

    test('Ctrl+Shift добавляет диапазон к текущему выделению', () => {
        const state = { keys: ['personal:e'], anchor: 'shared:a' }
        const next = applyClick(state, ORDER, 'shared:b', { ctrl: true, shift: true })
        expect(next.keys.sort()).toEqual(['personal:e', 'shared:a', 'shared:b'])
    })

    test('Shift без якоря выбирает только строку и ставит якорь', () => {
        const next = applyClick(empty, ORDER, 'shared:c', { shift: true })
        expect(next).toEqual({ keys: ['shared:c'], anchor: 'shared:c' })
    })

    test('исходное состояние не мутируется', () => {
        const state = { keys: ['shared:a'], anchor: 'shared:a' }
        applyClick(state, ORDER, 'shared:b', { ctrl: true })
        expect(state).toEqual({ keys: ['shared:a'], anchor: 'shared:a' })
    })
})

describe('bulkCapabilities', () => {
    const shared = { type: 'shared', id: '1' }
    const personal = { type: 'personal', id: '2' }

    test('админ: общие шаблоны можно переносить и удалять', () => {
        expect(bulkCapabilities([shared, shared], true)).toEqual({ canMove: true, canDelete: true })
    })

    test('примесь личного шаблона блокирует перенос, но не удаление', () => {
        expect(bulkCapabilities([shared, personal], true)).toEqual({ canMove: false, canDelete: true })
    })

    test('не админ: общие нельзя ни переносить, ни удалять', () => {
        expect(bulkCapabilities([shared], false)).toEqual({ canMove: false, canDelete: false })
    })

    test('не админ: личные можно удалять', () => {
        expect(bulkCapabilities([personal], false)).toEqual({ canMove: false, canDelete: true })
    })

    test('пустой выбор — ничего нельзя', () => {
        expect(bulkCapabilities([], true)).toEqual({ canMove: false, canDelete: false })
    })

    test('keyOf различает общие и личные с одним id', () => {
        expect(keyOf({ type: 'shared', id: 'x' })).not.toBe(keyOf({ type: 'personal', id: 'x' }))
    })
})
