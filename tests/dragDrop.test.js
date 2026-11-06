/**
 * tests/dragDrop.test.js
 *
 * Применение дропа и правила рядов (static/js/dragDrop.js, columnOperations.js).
 * Файлы берутся из репозитория целиком; холст и состояние приложения заменены заглушками.
 */

const fs = require('fs')
const DropLogic = require('../static/js/shared/dropLogic.js')

const read = file => fs.readFileSync(file, 'utf-8').split(String.fromCharCode(13)).join('')

function makeAppState(blocks) {
    let nextId = 1000
    return {
        blocks,
        selectedBlockId: null,
        undoStack: [],
        pushUndo() { this.undoStack.push(JSON.stringify(this.blocks)) },
        undo() { this.blocks = JSON.parse(this.undoStack.pop()); return true },
        getNextBlockId() { return nextId++ },
        removeBlock(id) { this.blocks = this.blocks.filter(b => b.id !== id) },
        findBlockById(id, list = null) {
            for (const block of (list || this.blocks)) {
                if (block.id === id) return block
                if (block.columns) {
                    for (const col of block.columns) {
                        const found = this.findBlockById(id, col.blocks)
                        if (found) return found
                    }
                }
            }
            return null
        },
        startDrag() {},
        endDrag() {},
        draggedBlockIds: null
    }
}

function loadDragDrop(blocks) {
    const AppState = makeAppState(blocks)
    const selected = []
    const api = new Function(
        'AppState', 'DropLogic', 'DragPreview', 'renderCanvas', 'selectBlock',
        'refreshSelectionStyles', 'getBlockTypeName',
        read('./static/js/dragDrop.js') +
        '\nreturn { executeDrop, DragSession, getRowDropOutcome, canPlaceInColumn, cleanupEmptyColumns };'
    )(AppState, DropLogic, { clear() {}, show() {} }, () => {}, id => selected.push(id), () => {}, t => t)
    return { AppState, selected, ...api }
}

const block = (id, type, extra = {}) => ({ id, type, settings: {}, columns: null, ...extra })
const container = (id, columns) => ({
    id, type: 'columns_container', settings: {},
    columns: columns.map((blocks, i) => ({ id: id * 100 + i, width: 50, blocks }))
})
const ids = list => list.map(b => b.id)

function startDrag(ctx, drag) {
    ctx.DragSession.active = true
    ctx.DragSession.drag = { isGroup: false, ids: null, sourceIndex: null, parentId: null, columnId: null, ...drag }
}

describe('правила ряда (getRowDropOutcome / canPlaceInColumn)', () => {
    test('текстовый ряд: кнопка уходит под ряд, остальное встаёт в колонку', () => {
        const { getRowDropOutcome, canPlaceInColumn } = loadDragDrop([])
        const row = container(1, [[block(2, 'text')], [block(3, 'text')]])
        expect(getRowDropOutcome(row, block(9, 'button'), false, false)).toBe('below')
        expect(canPlaceInColumn(row, block(9, 'button'))).toBe(false)
        expect(canPlaceInColumn(row, block(9, 'text'))).toBe(true)
        expect(canPlaceInColumn(row, block(9, 'expert'))).toBe(true)
    })

    test('ряд кнопок: кнопка встаёт в колонку, всё остальное — под ряд', () => {
        const { canPlaceInColumn } = loadDragDrop([])
        const row = container(1, [[block(2, 'button')], [block(3, 'button')]])
        expect(canPlaceInColumn(row, block(9, 'button'))).toBe(true)
        expect(canPlaceInColumn(row, block(9, 'expert'))).toBe(false)
        expect(canPlaceInColumn(row, block(9, 'text'))).toBe(false)
    })

    test('баннер не встаёт в колонку, разделитель и отступ встают', () => {
        const { canPlaceInColumn } = loadDragDrop([])
        const row = container(1, [[block(2, 'text')], [block(3, 'text')]])
        expect(canPlaceInColumn(row, block(9, 'banner'))).toBe(false)
        expect(canPlaceInColumn(row, block(9, 'divider'))).toBe(true)
        expect(canPlaceInColumn(row, block(9, 'spacer'))).toBe(true)
    })

    test('в группе блоков баннер тоже не встаёт внутрь, остальные типы встают', () => {
        const { canPlaceInColumn } = loadDragDrop([])
        const group = { id: 1, type: 'group_container', settings: {}, columns: [{ id: 2, width: 100, blocks: [block(3, 'text')] }] }
        expect(canPlaceInColumn(group, block(9, 'banner'))).toBe(false)
        expect(canPlaceInColumn(group, block(9, 'button'))).toBe(true)
    })

    test('занятая колонка у правого края растёт новой колонкой, пока есть место', () => {
        const { getRowDropOutcome } = loadDragDrop([])
        const row = container(1, [[block(2, 'text')], [block(3, 'text')]])
        expect(getRowDropOutcome(row, block(9, 'text'), false, true)).toBe('grow')
        const full = container(1, [[block(2, 'text')], [block(3, 'text')], [block(4, 'text')]])
        expect(getRowDropOutcome(full, block(9, 'text'), false, true)).toBe('below')
    })
})

describe('executeDrop: блок верхнего уровня', () => {
    test('переставляет блок на новое место', () => {
        const ctx = loadDragDrop([block(1, 'text'), block(2, 'text'), block(3, 'text')])
        startDrag(ctx, { id: 1, type: 'text', fromColumn: false, sourceIndex: 0 })
        ctx.executeDrop({ kind: 'slot', index: 3 })
        expect(ids(ctx.AppState.blocks)).toEqual([2, 3, 1])
        expect(ctx.selected).toEqual([1])
    })

    test('свой же слот — ничего не меняет и не пишет в историю', () => {
        const ctx = loadDragDrop([block(1, 'text'), block(2, 'text')])
        startDrag(ctx, { id: 1, type: 'text', fromColumn: false, sourceIndex: 0 })
        ctx.executeDrop({ kind: 'none' })
        expect(ids(ctx.AppState.blocks)).toEqual([1, 2])
        expect(ctx.AppState.undoStack).toHaveLength(0)
    })

    test('боковое слияние создаёт ряд из двух блоков, перенесённый блок — слева', () => {
        const ctx = loadDragDrop([block(1, 'heading'), block(2, 'text'), block(3, 'text')])
        startDrag(ctx, { id: 3, type: 'text', fromColumn: false, sourceIndex: 2 })
        ctx.executeDrop({ kind: 'side', index: 0, side: 'left' })
        const [row, second] = ctx.AppState.blocks
        expect(row.type).toBe('columns_container')
        expect(row.columns.map(c => ids(c.blocks))).toEqual([[3], [1]])
        expect(ids([second])).toEqual([2])
    })

    test('перенос ряда колонок целиком на другое место', () => {
        const row = container(10, [[block(11, 'text')], [block(12, 'text')]])
        const ctx = loadDragDrop([block(1, 'text'), row, block(2, 'text')])
        startDrag(ctx, { id: 10, type: 'columns_container', fromColumn: false, sourceIndex: 1 })
        ctx.executeDrop({ kind: 'slot', index: 0 })
        expect(ids(ctx.AppState.blocks)).toEqual([10, 1, 2])
        expect(ctx.AppState.blocks[0].columns).toHaveLength(2)
    })

    test('группа выделенных блоков переносится вместе', () => {
        const ctx = loadDragDrop([block(1, 'text'), block(2, 'text'), block(3, 'text'), block(4, 'text')])
        startDrag(ctx, { id: 1, type: 'text', fromColumn: false, isGroup: true, ids: [1, 2], sourceIndex: 0 })
        ctx.executeDrop({ kind: 'slot', index: 4 })
        expect(ids(ctx.AppState.blocks)).toEqual([3, 4, 1, 2])
    })
})

describe('executeDrop: блок из колонки', () => {
    const setup = () => {
        const row = container(10, [[block(11, 'text'), block(12, 'text')], [block(13, 'text')]])
        return loadDragDrop([block(1, 'heading'), row, block(2, 'heading')])
    }

    test('вынос между блоками верхнего уровня: блок встаёт перед нужным, колонка остаётся', () => {
        const ctx = setup()
        startDrag(ctx, { id: 12, type: 'text', fromColumn: true, parentId: 10, columnId: 1000 })
        ctx.executeDrop({ kind: 'slot', index: 0 })
        expect(ids(ctx.AppState.blocks)).toEqual([12, 1, 10, 2])
        expect(ctx.AppState.blocks[2].columns.map(c => ids(c.blocks))).toEqual([[11], [13]])
    })

    test('последний блок колонки вынесен — ряд из двух колонок разворачивается в обычные блоки', () => {
        const ctx = setup()
        startDrag(ctx, { id: 13, type: 'text', fromColumn: true, parentId: 10, columnId: 1001 })
        ctx.executeDrop({ kind: 'slot', index: 3 })
        expect(ids(ctx.AppState.blocks)).toEqual([1, 11, 12, 2, 13])
    })

    test('перенос в другую колонку того же ряда на нужную позицию', () => {
        const ctx = setup()
        startDrag(ctx, { id: 11, type: 'text', fromColumn: true, parentId: 10, columnId: 1000 })
        ctx.executeDrop({ kind: 'column', index: 1, columnId: 1001, mode: 'stack', insertAt: 0 })
        const row = ctx.AppState.blocks[1]
        expect(row.columns.map(c => ids(c.blocks))).toEqual([[12], [11, 13]])
    })

    test('перенос внутри той же колонки вниз', () => {
        const ctx = setup()
        startDrag(ctx, { id: 11, type: 'text', fromColumn: true, parentId: 10, columnId: 1000 })
        ctx.executeDrop({ kind: 'column', index: 1, columnId: 1000, mode: 'stack', insertAt: 2 })
        expect(ctx.AppState.blocks[1].columns[0].blocks.map(b => b.id)).toEqual([12, 11])
    })

    test('блок верхнего уровня встаёт новой колонкой', () => {
        const ctx = setup()
        startDrag(ctx, { id: 2, type: 'text', fromColumn: false, sourceIndex: 2 })
        ctx.executeDrop({ kind: 'column', index: 1, columnId: 1001, mode: 'grow', insertAt: 1 })
        const row = ctx.AppState.blocks[1]
        expect(row.columns).toHaveLength(3)
        expect(ids(ctx.AppState.blocks)).toEqual([1, 10])
    })

    test('действие записывается в историю одним шагом', () => {
        const ctx = setup()
        startDrag(ctx, { id: 12, type: 'text', fromColumn: true, parentId: 10, columnId: 1000 })
        ctx.executeDrop({ kind: 'slot', index: 0 })
        expect(ctx.AppState.undoStack).toHaveLength(1)
    })
})

describe('mergeColumns (разобрать колонки на блоки)', () => {
    function loadMerge(blocks) {
        const AppState = makeAppState(blocks)
        const selected = []
        const merge = new Function(
            'AppState', 'DropLogic', 'renderCanvas', 'renderSettings', 'selectBlock',
            read('./static/js/columnOperations.js') + '\nreturn mergeColumns;'
        )(AppState, DropLogic, () => {}, () => {}, id => selected.push(id))
        return { AppState, selected, merge }
    }

    test('два текста распадаются на два блока слева направо', () => {
        const ctx = loadMerge([block(1, 'heading'), container(10, [[block(11, 'text')], [block(12, 'text')]]), block(2, 'heading')])
        ctx.merge(10)
        expect(ids(ctx.AppState.blocks)).toEqual([1, 11, 12, 2])
        expect(ctx.selected).toEqual([11])
    })

    test('порядок: колонка за колонкой, внутри колонки сверху вниз', () => {
        const ctx = loadMerge([container(10, [[block(11, 'text'), block(12, 'button')], [block(13, 'expert')]])])
        ctx.merge(10)
        expect(ids(ctx.AppState.blocks)).toEqual([11, 12, 13])
    })

    test('история: действие записывается одним шагом', () => {
        const ctx = loadMerge([container(10, [[block(11, 'text')], [block(12, 'text')]])])
        ctx.merge(10)
        expect(ctx.AppState.undoStack).toHaveLength(1)
    })

    test('блок старого формата с полем columns возвращается к обычному виду', () => {
        const ctx = loadMerge([{ id: 5, type: 'text', settings: {}, columns: [{ id: 1, width: 100, blocks: [] }] }])
        ctx.merge(5)
        expect(ctx.AppState.blocks[0].columns).toBeNull()
    })
})
