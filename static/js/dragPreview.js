// dragPreview.js — наглядный предпросмотр места вставки при перетаскивании.
//
// Вместо оранжевой линии блоки раздвигаются: на месте вставки плавно раскрывается
// «окно» высотой с переносимый блок, а соседи сдвигаются. Для слияния в колонки
// целевой блок сжимается к своей стороне, а рядом проявляется пустая половина.
//
// Все элементы предпросмотра имеют pointer-events:none и не влияют на попадание курсора.

const DragPreview = (() => {
    const CLOSE_DELAY_MS = 180;     // совпадает с transition в modular-styles.css
    const MIN_HEIGHT = 40;
    const MAX_HEIGHT = 140;

    let state = null;               // { key, nodes: [...], cleanup: fn }
    let closing = new Set();

    function clampHeight(height) {
        return Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, Math.round(height) || MIN_HEIGHT));
    }

    function keyOf(target) {
        if (!target) return '';
        return [target.kind, target.index, target.side || '', target.columnId || '', target.mode || '',
            target.insertAt ?? ''].join(':');
    }

    function createPlaceholder(height, label, modifier) {
        const el = document.createElement('div');
        el.className = `drop-placeholder${modifier ? ' ' + modifier : ''}`;
        el.style.setProperty('--drop-h', `${clampHeight(height)}px`);
        el.setAttribute('aria-hidden', 'true');
        const text = document.createElement('span');
        text.textContent = label;
        el.appendChild(text);
        return el;
    }

    // Раскрываем на следующем кадре, чтобы сработал transition от нулевой высоты.
    function open(el) {
        requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('open')));
    }

    function closeAndRemove(el) {
        if (!el || !el.parentNode || closing.has(el)) return;
        closing.add(el);
        el.classList.remove('open');
        setTimeout(() => {
            closing.delete(el);
            el.remove();
        }, CLOSE_DELAY_MS);
    }

    function topLevelBlockEls(canvas) {
        return Array.from(canvas.children).filter(el => el.classList.contains('email-block'));
    }

    function blockElById(canvas, blockId) {
        return canvas.querySelector(`.email-block[data-block-id="${blockId}"]`);
    }

    function previewSlot(canvas, target, ctx) {
        const blocks = topLevelBlockEls(canvas);
        const reference = blocks[target.index] || null;
        const placeholder = createPlaceholder(ctx.height, ctx.label);
        canvas.insertBefore(placeholder, reference);
        open(placeholder);
        return { nodes: [placeholder], cleanup: () => closeAndRemove(placeholder) };
    }

    function previewSide(canvas, target, ctx, blockId) {
        const el = blockElById(canvas, blockId);
        if (!el) return null;
        const side = target.kind === 'center' ? 'right' : target.side;
        const cls = `drop-merge-${side}`;
        // width:auto не анимируется — фиксируем 100% и на следующем кадре сужаем до половины.
        el.style.width = '100%';
        el.dataset.dropLabel = ctx.label;
        el.classList.add('drop-merging');
        requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add(cls)));
        return {
            nodes: [el],
            cleanup: () => {
                el.classList.remove(cls, 'drop-merge-left', 'drop-merge-right');
                delete el.dataset.dropLabel;
                // Дожидаемся возврата ширины, затем снимаем служебные стили.
                setTimeout(() => {
                    if (!el.classList.contains('drop-merge-left') && !el.classList.contains('drop-merge-right')) {
                        el.classList.remove('drop-merging');
                        el.style.width = '';
                    }
                }, CLOSE_DELAY_MS);
            }
        };
    }

    function previewColumnStack(canvas, target, ctx, blockId) {
        const container = blockElById(canvas, blockId);
        const columnEl = container && container.querySelector(`.column[data-column-id="${target.columnId}"]`);
        const content = columnEl && columnEl.querySelector('.column-content');
        if (!content) return null;

        const children = Array.from(content.children).filter(el => el.classList.contains('column-block'));
        const placeholder = createPlaceholder(ctx.height, ctx.label);
        content.insertBefore(placeholder, children[target.insertAt] || null);
        columnEl.classList.add('drop-active');
        open(placeholder);
        return {
            nodes: [placeholder],
            cleanup: () => {
                closeAndRemove(placeholder);
                columnEl.classList.remove('drop-active');
            }
        };
    }

    function previewColumnGrow(canvas, target, ctx, blockId) {
        const container = blockElById(canvas, blockId);
        const row = container && container.querySelector('.columns-container');
        if (!row) return null;

        const ghost = document.createElement('div');
        ghost.className = 'column drop-ghost-column';
        ghost.setAttribute('aria-hidden', 'true');
        const text = document.createElement('span');
        text.textContent = ctx.label;
        ghost.appendChild(text);
        row.appendChild(ghost);
        row.classList.add('drop-growing');
        open(ghost);
        return {
            nodes: [ghost],
            cleanup: () => {
                closeAndRemove(ghost);
                row.classList.remove('drop-growing');
            }
        };
    }

    /**
     * Показывает место вставки. Повторный вызов с тем же местом ничего не делает,
     * чтобы анимация не перезапускалась на каждое движение мыши.
     * @param {HTMLElement} canvas
     * @param {object|null} target  результат DropLogic.computeDropTarget (null — убрать)
     * @param {{height:number,label:string,blockId?:number}} ctx
     * @param {Function} blockIdAt  индекс блока верхнего уровня -> его id
     */
    function show(canvas, target, ctx, blockIdAt) {
        const key = keyOf(target);
        if (state && state.key === key) return;
        clear();
        if (!target || target.kind === 'none') return;

        let built = null;
        if (target.kind === 'slot') {
            built = previewSlot(canvas, target, ctx);
        } else if (target.kind === 'side' || target.kind === 'center') {
            built = previewSide(canvas, target, ctx, blockIdAt(target.index));
        } else if (target.kind === 'column' && target.mode === 'grow') {
            built = previewColumnGrow(canvas, target, ctx, blockIdAt(target.index));
        } else if (target.kind === 'column') {
            built = previewColumnStack(canvas, target, ctx, blockIdAt(target.index));
        }
        state = built ? { key, ...built } : null;
    }

    /** Убирает предпросмотр. immediate — без анимации (перед применением дропа). */
    function clear(immediate = false) {
        if (!state) return;
        const { cleanup, nodes } = state;
        state = null;
        cleanup();
        if (immediate) {
            nodes.forEach(node => {
                if (node.classList && node.classList.contains('drop-placeholder')) node.remove();
                if (node.classList && node.classList.contains('drop-ghost-column')) node.remove();
            });
        }
    }

    return { show, clear };
})();
