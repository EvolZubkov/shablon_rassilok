/**
 * tests/dropLogic.test.js
 *
 * Чистая логика перетаскивания и колонок (static/js/shared/dropLogic.js):
 * разбор колонок в блоки и выбор места вставки по геометрии.
 */

const DropLogic = require('../static/js/shared/dropLogic.js')

const { flattenColumnsContainer, computeDropTarget, slotFromY, isNoopSlot, canJoinColumns } = DropLogic

// Три блока верхнего уровня по 100px с зазором 20px: 0-100, 120-220, 240-340.
const plain = (id, index, type, top) => ({
    id, index, type, top, bottom: top + 100, left: 0, right: 600
})

const row = (id, index, top) => ({
    id, index, type: 'columns_container', top, bottom: top + 120, left: 0, right: 600,
    body: { top: top + 30, bottom: top + 110, left: 10, right: 590 },
    columns: [
        { id: 11, left: 10, right: 300, top: top + 30, bottom: top + 110,
          children: [{ id: 101, top: top + 30, bottom: top + 60 }, { id: 102, top: top + 70, bottom: top + 110 }] },
        { id: 12, left: 310, right: 590, top: top + 30, bottom: top + 110,
          children: [{ id: 103, top: top + 30, bottom: top + 110 }] }
    ]
})

const drag = (overrides = {}) => ({ id: 900, type: 'text', fromColumn: false, isGroup: false, ...overrides })
const stackOutcome = () => 'stack'

describe('flattenColumnsContainer', () => {
    test('колонки слева направо, внутри колонки сверху вниз', () => {
        const container = {
            type: 'columns_container',
            columns: [
                { id: 1, blocks: [{ id: 'a' }, { id: 'b' }] },
                { id: 2, blocks: [{ id: 'c' }] },
                { id: 3, blocks: [{ id: 'd' }, { id: 'e' }] }
            ]
        }
        expect(flattenColumnsContainer(container).map(b => b.id)).toEqual(['a', 'b', 'c', 'd', 'e'])
    })

    test('пустые колонки пропускаются', () => {
        const container = { columns: [{ id: 1, blocks: [] }, { id: 2, blocks: [{ id: 'x' }] }] }
        expect(flattenColumnsContainer(container).map(b => b.id)).toEqual(['x'])
    })

    test('блок без колонок даёт пустой список', () => {
        expect(flattenColumnsContainer({ type: 'text' })).toEqual([])
        expect(flattenColumnsContainer(null)).toEqual([])
    })

    test('возвращает те же объекты блоков, а не копии', () => {
        const child = { id: 'same' }
        expect(flattenColumnsContainer({ columns: [{ blocks: [child] }] })[0]).toBe(child)
    })
})

describe('slotFromY', () => {
    const blocks = [plain(1, 0, 'text', 0), plain(2, 1, 'text', 120), plain(3, 2, 'text', 240)]

    test('выше середины первого блока — перед ним', () => {
        expect(slotFromY(blocks, 10)).toBe(0)
    })

    test('в зазоре между блоками — по ближайшей середине', () => {
        expect(slotFromY(blocks, 110)).toBe(1)
        expect(slotFromY(blocks, 230)).toBe(2)
    })

    test('ниже всех блоков — в конец', () => {
        expect(slotFromY(blocks, 900)).toBe(3)
    })
})

describe('computeDropTarget: верхний уровень', () => {
    const blocks = [plain(1, 0, 'heading', 0), plain(2, 1, 'heading', 120), plain(3, 2, 'heading', 240)]

    test('пустой холст — слот 0', () => {
        expect(computeDropTarget([], { x: 5, y: 5 }, drag(), stackOutcome)).toEqual({ kind: 'slot', index: 0 })
    })

    test('нижняя половина блока — вставка после него (раньше такой зоны не было)', () => {
        const target = computeDropTarget(blocks, { x: 300, y: 90 }, drag({ type: 'heading' }), stackOutcome)
        expect(target).toEqual({ kind: 'slot', index: 1 })
    })

    test('верхняя половина блока — вставка перед ним', () => {
        const target = computeDropTarget(blocks, { x: 300, y: 130 }, drag({ type: 'heading' }), stackOutcome)
        expect(target).toEqual({ kind: 'slot', index: 1 })
    })

    test('зазор между блоками тоже даёт слот', () => {
        const target = computeDropTarget(blocks, { x: 300, y: 110 }, drag({ type: 'heading' }), stackOutcome)
        expect(target.kind).toBe('slot')
    })

    test('левый край обычного блока — слияние в колонки слева', () => {
        const target = computeDropTarget(blocks, { x: 20, y: 60 }, drag({ type: 'heading' }), stackOutcome)
        expect(target).toEqual({ kind: 'side', index: 0, side: 'left' })
    })

    test('зона слияния — треть ширины, а не узкая кромка', () => {
        const left = computeDropTarget(blocks, { x: 190, y: 60 }, drag({ type: 'heading' }), stackOutcome)
        expect(left).toEqual({ kind: 'side', index: 0, side: 'left' })
        const right = computeDropTarget(blocks, { x: 420, y: 60 }, drag({ type: 'heading' }), stackOutcome)
        expect(right).toEqual({ kind: 'side', index: 0, side: 'right' })
        const middle = computeDropTarget(blocks, { x: 300, y: 20 }, drag({ type: 'heading' }), stackOutcome)
        expect(middle.kind).toBe('slot')
    })

    test('правый край — слияние справа', () => {
        const target = computeDropTarget(blocks, { x: 590, y: 60 }, drag({ type: 'heading' }), stackOutcome)
        expect(target).toEqual({ kind: 'side', index: 0, side: 'right' })
    })

    test('баннер в колонки не сливается — только позиция', () => {
        const banner = computeDropTarget(blocks, { x: 20, y: 60 }, drag({ type: 'banner' }), stackOutcome)
        expect(banner.kind).toBe('slot')
        const target = [plain(1, 0, 'banner', 0)]
        expect(computeDropTarget(target, { x: 20, y: 60 }, drag({ type: 'text' }), stackOutcome).kind).toBe('slot')
    })

    test('разделитель и отступ сливаются в колонки как обычные блоки', () => {
        ;['divider', 'spacer'].forEach(type => {
            const target = computeDropTarget(blocks, { x: 20, y: 60 }, drag({ type }), stackOutcome)
            expect(target).toEqual({ kind: 'side', index: 0, side: 'left' })
        })
    })

    test('центр блока того же типа — слияние одинаковых', () => {
        const texts = [plain(1, 0, 'text', 0)]
        expect(computeDropTarget(texts, { x: 300, y: 50 }, drag({ type: 'text' }), stackOutcome))
            .toEqual({ kind: 'center', index: 0 })
    })

    test('центр блока другого типа — обычная позиция', () => {
        const texts = [plain(1, 0, 'text', 0)]
        expect(computeDropTarget(texts, { x: 300, y: 50 }, drag({ type: 'image' }), stackOutcome).kind).toBe('slot')
    })

    test('над самим собой — позиция, не слияние', () => {
        const self = [plain(900, 0, 'text', 0)]
        const target = computeDropTarget(self, { x: 20, y: 50 }, drag({ id: 900, type: 'text' }), stackOutcome)
        expect(target.kind).toBe('slot')
    })
})

describe('computeDropTarget: ряд колонок', () => {
    const blocks = [plain(1, 0, 'heading', 0), row(2, 1, 120), plain(3, 2, 'heading', 260)]

    test('заголовок контейнера — вставка между блоками верхнего уровня', () => {
        const target = computeDropTarget(blocks, { x: 300, y: 130 }, drag({ fromColumn: true }), stackOutcome)
        expect(target).toEqual({ kind: 'slot', index: 1 })
    })

    test('нижняя рамка контейнера — вставка после него', () => {
        const target = computeDropTarget(blocks, { x: 300, y: 236 }, drag({ fromColumn: true }), stackOutcome)
        expect(target).toEqual({ kind: 'slot', index: 2 })
    })

    test('внутри колонки — в неё, позиция по середине соседних блоков', () => {
        const top = computeDropTarget(blocks, { x: 100, y: 155 }, drag(), stackOutcome)
        expect(top).toEqual({ kind: 'column', index: 1, columnId: 11, mode: 'stack', insertAt: 0 })

        const middle = computeDropTarget(blocks, { x: 100, y: 205 }, drag(), stackOutcome)
        expect(middle).toEqual({ kind: 'column', index: 1, columnId: 11, mode: 'stack', insertAt: 1 })

        const bottom = computeDropTarget(blocks, { x: 100, y: 228 }, drag(), stackOutcome)
        expect(bottom).toEqual({ kind: 'column', index: 1, columnId: 11, mode: 'stack', insertAt: 2 })
    })

    test('правый край занятой колонки — новая колонка, если ряд разрешает', () => {
        const outcome = (id, preferGrow) => (preferGrow ? 'grow' : 'stack')
        const target = computeDropTarget(blocks, { x: 290, y: 180 }, drag(), outcome)
        expect(target.kind).toBe('column')
        expect(target.mode).toBe('grow')
    })

    test('ряд не принимает блок — он уходит под ряд', () => {
        const target = computeDropTarget(blocks, { x: 100, y: 180 }, drag({ type: 'button' }), () => 'below')
        expect(target).toEqual({ kind: 'slot', index: 2 })
    })

    test('блок возвращается в свой же смешанный ряд, хотя для чужих блоков тот его не принимает', () => {
        const refuse = () => 'below'
        const own = computeDropTarget(blocks, { x: 100, y: 180 },
            drag({ id: 101, type: 'button', fromColumn: true, parentId: 2 }), refuse)
        expect(own).toEqual({ kind: 'column', index: 1, columnId: 11, mode: 'stack', insertAt: 1 })

        const foreign = computeDropTarget(blocks, { x: 100, y: 180 },
            drag({ id: 900, type: 'button', fromColumn: true, parentId: 77 }), refuse)
        expect(foreign.kind).toBe('slot')
    })

    test('контейнер нельзя положить в колонку — только позиция', () => {
        const target = computeDropTarget(blocks, { x: 100, y: 180 }, drag({ type: 'columns_container' }), stackOutcome)
        expect(target.kind).toBe('slot')
    })

    test('группа блоков — только позиция', () => {
        const target = computeDropTarget(blocks, { x: 100, y: 180 }, drag({ isGroup: true }), stackOutcome)
        expect(target.kind).toBe('slot')
    })
})

describe('isNoopSlot', () => {
    test('свой же индекс и следующий — перенос не нужен', () => {
        expect(isNoopSlot(2, 2)).toBe(true)
        expect(isNoopSlot(3, 2)).toBe(true)
    })

    test('другие слоты — нужен', () => {
        expect(isNoopSlot(1, 2)).toBe(false)
        expect(isNoopSlot(4, 2)).toBe(false)
    })

    test('блок не из верхнего уровня — всегда нужен', () => {
        expect(isNoopSlot(0, null)).toBe(false)
    })
})

describe('canJoinColumns', () => {
    test('обычные блоки можно, баннер и контейнеры нельзя', () => {
        expect(canJoinColumns('text')).toBe(true)
        expect(canJoinColumns('banner')).toBe(false)
        expect(canJoinColumns('columns_container')).toBe(false)
    })
})
