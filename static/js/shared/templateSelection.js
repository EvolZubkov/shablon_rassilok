// shared/templateSelection.js — чистая логика множественного выделения шаблонов
// (Ctrl/Cmd — добавить или убрать, Shift — диапазон). Без DOM, поэтому
// проверяется юнит-тестами; templatesBulk.js только вешает её на список.
//
// Подключается в браузере как window.TemplateSelection и в тестах как CommonJS-модуль.

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.TemplateSelection = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    /** Ключ шаблона: id уникален только в пределах типа (общие/личные). */
    function keyOf(template) {
        return `${template.type}:${template.id}`;
    }

    /**
     * Ключи от якоря до цели включительно в порядке списка.
     * Один шаблон может быть в списке дважды («Избранные» сверху и своя категория) —
     * остаётся последнее вхождение, то есть место в категории: диапазон внутри
     * категории тогда совпадает с тем, что видно глазами.
     * @param {string[]} orderedKeys ключи видимых строк сверху вниз
     * @param {string|null} anchorKey
     * @param {string} targetKey
     * @returns {string[]}
     */
    function rangeKeys(orderedKeys, anchorKey, targetKey) {
        const unique = orderedKeys.filter((key, i) => orderedKeys.lastIndexOf(key) === i);
        const to = unique.indexOf(targetKey);
        if (to === -1) return [];
        const from = unique.indexOf(anchorKey);
        if (from === -1) return [targetKey];
        return unique.slice(Math.min(from, to), Math.max(from, to) + 1);
    }

    /**
     * Новое состояние выделения после клика по строке.
     * Ctrl/Cmd — переключить строку и сделать её якорем;
     * Shift — выделить диапазон от якоря (с Ctrl — добавить к текущему);
     * якорь при Shift не меняется.
     * @param {{keys: string[], anchor: string|null}} state
     * @param {string[]} orderedKeys
     * @param {string} targetKey
     * @param {{ctrl?: boolean, shift?: boolean}} modifiers
     * @returns {{keys: string[], anchor: string|null}}
     */
    function applyClick(state, orderedKeys, targetKey, { ctrl = false, shift = false } = {}) {
        if (shift) {
            const range = rangeKeys(orderedKeys, state.anchor || targetKey, targetKey);
            const keys = ctrl ? Array.from(new Set([...state.keys, ...range])) : range;
            return { keys, anchor: state.anchor || targetKey };
        }
        if (ctrl) {
            const has = state.keys.includes(targetKey);
            const keys = has ? state.keys.filter(k => k !== targetKey) : [...state.keys, targetKey];
            return { keys, anchor: targetKey };
        }
        return { keys: [], anchor: null };
    }

    /**
     * Что можно сделать с выбранным: перенос — только общие шаблоны и только админу
     * (категории есть только у общих); удаление — личные всем, общие админу.
     * Действие доступно, только если разрешено для каждого выбранного.
     * @param {Array<{type: string}>} templates
     * @param {boolean} isAdmin
     * @returns {{canMove: boolean, canDelete: boolean}}
     */
    function bulkCapabilities(templates, isAdmin) {
        const any = templates.length > 0;
        return {
            canMove: any && isAdmin && templates.every(t => t.type === 'shared'),
            canDelete: any && templates.every(t => t.type === 'personal' || (isAdmin && t.type === 'shared')),
        };
    }

    return { keyOf, rangeKeys, applyClick, bulkCapabilities };
}));
