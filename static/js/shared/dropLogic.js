// shared/dropLogic.js — чистая логика перетаскивания и колонок (без DOM).
//
// Подключается в браузере как window.DropLogic и в тестах как CommonJS-модуль.
// Геометрия приходит снимком прямоугольников, поэтому всё проверяется юнит-тестами:
// куда встанет блок, определяют эти функции, а dragDrop.js только рисует и применяет.

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.DropLogic = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {

    // Блоки, которые занимают всю ширину письма и в колонки не встают.
    // Разделитель и отступ встают: в колонке они работают по её ширине.
    const FULL_WIDTH_TYPES = ['banner'];
    // Контейнеры: в колонку другого контейнера их класть нельзя.
    const CONTAINER_TYPES = ['columns_container', 'group_container'];
    // Блоки, которые можно «склеить» с таким же в две колонки, бросив в центр.
    const CENTER_MERGE_TYPES = ['text', 'image', 'button'];

    // Доли блока для зон наведения.
    const SIDE_ZONE_RATIO = 0.33;    // треть ширины слева/справа — «в соседнюю колонку»
    const CENTER_ZONE_MIN = 0.3;     // центр блока (по обеим осям) — слияние одинаковых
    const CENTER_ZONE_MAX = 0.7;
    const GROW_EDGE_RATIO = 0.25;    // правый край колонки — «новая колонка»

    /**
     * Разбирает контейнер колонок в плоский список блоков:
     * колонки слева направо, внутри каждой сверху вниз.
     */
    function flattenColumnsContainer(block) {
        if (!block || !Array.isArray(block.columns)) return [];
        const result = [];
        block.columns.forEach(column => {
            (column.blocks || []).forEach(child => result.push(child));
        });
        return result;
    }

    function isContainerType(type) {
        return CONTAINER_TYPES.includes(type);
    }

    function isFullWidthType(type) {
        return FULL_WIDTH_TYPES.includes(type);
    }

    /** Может ли блок стать частью колонок (боковое слияние, новая колонка). */
    function canJoinColumns(type) {
        return !isContainerType(type) && !isFullWidthType(type);
    }

    function inRect(rect, x, y) {
        return !!rect && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    }

    /**
     * Индекс вставки между блоками верхнего уровня по вертикали:
     * перед первым блоком, середина которого ниже курсора, иначе в конец.
     * Работает на всей высоте холста, а не только в узкой зоне между блоками.
     */
    function slotFromY(blocks, y) {
        for (let i = 0; i < blocks.length; i++) {
            const mid = (blocks[i].top + blocks[i].bottom) / 2;
            if (y < mid) return i;
        }
        return blocks.length;
    }

    function nearestColumn(columns, x) {
        let best = null;
        let bestDistance = Infinity;
        columns.forEach(column => {
            const distance = x < column.left ? column.left - x : x > column.right ? x - column.right : 0;
            if (distance < bestDistance) {
                best = column;
                bestDistance = distance;
            }
        });
        return best;
    }

    /**
     * Определяет, куда встанет перетаскиваемый блок.
     *
     * @param {Array}  blocks  блоки верхнего уровня: {id, index, type, top, bottom, left, right,
     *                         body?:{top,bottom,left,right}, columns?:[{id,left,right,top,bottom,
     *                         children:[{id,top,bottom}]}]} — координаты в одной системе с курсором
     * @param {{x:number,y:number}} point  позиция курсора
     * @param {{id:number,type:string,fromColumn:boolean,isGroup:boolean,parentId?:number}} drag  что тащим
     * @param {Function} outcomeFn  (blockId, preferGrow) => 'stack'|'grow'|'below' — правила ряда
     * @returns {{kind:'slot',index:number}
     *   | {kind:'side',index:number,side:'left'|'right'}
     *   | {kind:'center',index:number}
     *   | {kind:'column',index:number,columnId:number,mode:'stack'|'grow',insertAt:number}}
     */
    function computeDropTarget(blocks, point, drag, outcomeFn) {
        if (!blocks.length) return { kind: 'slot', index: 0 };

        const { x, y } = point;
        const hit = blocks.find(b => y >= b.top && y <= b.bottom);
        if (!hit) return { kind: 'slot', index: slotFromY(blocks, y) };

        const slotAroundHit = () => ({
            kind: 'slot',
            index: y < (hit.top + hit.bottom) / 2 ? hit.index : hit.index + 1
        });

        // Контейнеры и группы можно только переставлять между блоками верхнего уровня.
        if (drag.isGroup || isContainerType(drag.type)) return slotAroundHit();

        if (hit.columns) {
            // Заголовок и рамка контейнера — это «между блоками», а не колонка.
            if (!inRect(hit.body, x, y)) return slotAroundHit();

            const column = nearestColumn(hit.columns, x);
            if (!column) return slotAroundHit();

            const children = column.children || [];
            const nearRightEdge = (x - column.left) > (column.right - column.left) * (1 - GROW_EDGE_RATIO);
            const preferGrow = children.length > 0 && nearRightEdge;
            // Блок можно свободно переставлять внутри своего же ряда, даже если ряд
            // «смешанный» (например, кнопка рядом с текстом): правила совместимости
            // нужны для чужих блоков, а не для возврата на место.
            const ownRow = drag.fromColumn && drag.parentId === hit.id;
            const outcome = ownRow ? 'stack' : (outcomeFn ? outcomeFn(hit.id, preferGrow) : 'stack');

            if (outcome === 'grow') {
                return { kind: 'column', index: hit.index, columnId: column.id, mode: 'grow', insertAt: children.length };
            }
            if (outcome === 'stack') {
                let insertAt = 0;
                while (insertAt < children.length && y > (children[insertAt].top + children[insertAt].bottom) / 2) {
                    insertAt++;
                }
                return { kind: 'column', index: hit.index, columnId: column.id, mode: 'stack', insertAt };
            }
            // 'below' и всё остальное — под ряд.
            return { kind: 'slot', index: hit.index + 1 };
        }

        // Обычный блок: края — слияние в колонки, центр — слияние одинаковых, остальное — позиция.
        if (hit.id === drag.id) return slotAroundHit();

        const width = hit.right - hit.left || 1;
        const height = hit.bottom - hit.top || 1;
        const relX = (x - hit.left) / width;
        const relY = (y - hit.top) / height;
        const bothJoinable = canJoinColumns(drag.type) && canJoinColumns(hit.type);

        if (bothJoinable && relY > 0.1 && relY < 0.9) {
            if (relX < SIDE_ZONE_RATIO) return { kind: 'side', index: hit.index, side: 'left' };
            if (relX > 1 - SIDE_ZONE_RATIO) return { kind: 'side', index: hit.index, side: 'right' };
        }

        const sameMergeableType = drag.type === hit.type && CENTER_MERGE_TYPES.includes(hit.type);
        if (sameMergeableType
            && relX > CENTER_ZONE_MIN && relX < CENTER_ZONE_MAX
            && relY > CENTER_ZONE_MIN && relY < CENTER_ZONE_MAX) {
            return { kind: 'center', index: hit.index };
        }

        return slotAroundHit();
    }

    /**
     * Куда фактически встанет блок верхнего уровня, если его бросить в слот:
     * тот же индекс или следующий за ним — это его же место, перенос не нужен.
     */
    function isNoopSlot(slotIndex, sourceIndex) {
        return sourceIndex !== null && sourceIndex !== undefined
            && (slotIndex === sourceIndex || slotIndex === sourceIndex + 1);
    }

    return {
        FULL_WIDTH_TYPES,
        CONTAINER_TYPES,
        flattenColumnsContainer,
        isContainerType,
        isFullWidthType,
        canJoinColumns,
        slotFromY,
        computeDropTarget,
        isNoopSlot
    };
}));
