// expertRow.js — ряд из карточек экспертов: одинаковая ширина, значит и высота.
//
// Карточка эксперта — картинка: её высота на экране пропорциональна ширине.
// В равных колонках слоты всё равно отличаются (33/33/34%, у средней колонки
// отступы с обеих сторон), поэтому без выравнивания одна карточка ниже других.

const ExpertRow = (() => {
    /** Разница в процентах, при которой колонки считаются равными (33/33/34). */
    const EQUAL_TOLERANCE = 1;

    /**
     * Ряд из двух и более равных колонок, в каждой из которых только эксперты.
     * @param {Array<{width:number, blocks:Array<{type:string}>}>} columns
     * @returns {boolean}
     */
    function isEqualExpertRow(columns) {
        if (!Array.isArray(columns) || columns.length < 2) return false;
        const onlyExperts = columns.every(col =>
            col.blocks && col.blocks.length > 0 && col.blocks.every(b => b.type === 'expert'));
        if (!onlyExperts) return false;
        const widths = columns.map(col => col.width);
        return Math.max(...widths) - Math.min(...widths) <= EQUAL_TOLERANCE;
    }

    /**
     * Общая ширина картинки в письме — по самому узкому слоту ряда.
     * @param {Array} columns
     * @param {number[]} slotWidths - ширины содержимого колонок (px) без отступов
     * @returns {number|null} null, если выравнивать не нужно
     */
    function sharedImageWidth(columns, slotWidths) {
        return isEqualExpertRow(columns) ? Math.min(...slotWidths) : null;
    }

    /**
     * Ширина колонки (%) для холста редактора.
     * @param {Array} columns
     * @param {{width:number}} column
     * @returns {number}
     */
    function displayPercent(columns, column) {
        return isEqualExpertRow(columns) ? 100 / columns.length : column.width;
    }

    return { isEqualExpertRow, sharedImageWidth, displayPercent };
})();

if (typeof window !== 'undefined') window.ExpertRow = ExpertRow;
