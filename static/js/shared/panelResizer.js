// shared/panelResizer.js — изменяемая ширина боковых панелей.
//
// Между панелью и холстом появляется «ручка» шириной 6px: тянется мышью, двигается
// стрелками, двойной клик возвращает ширину по умолчанию. Ширина хранится в CSS-переменной
// контейнера (grid-template-columns читает её) и запоминается в localStorage.
//
// Чистая часть (clampWidth) вынесена отдельно и проверяется юнит-тестами.

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.PanelResizer = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {

    const HANDLE_SIZE = 6;
    const KEY_STEP = 16;
    const KEY_STEP_FAST = 64;

    /**
     * Допустимая ширина панели: не уже min, не шире max и так, чтобы холст
     * (то, что осталось после панелей) не стал уже minCenter.
     */
    function clampWidth(width, { min, max, available, otherWidth = 0, minCenter = 0 }) {
        const byCanvas = available - otherWidth - minCenter;
        const upper = Math.max(min, Math.min(max, byCanvas));
        return Math.round(Math.min(upper, Math.max(min, width)));
    }

    function readStored(key) {
        try {
            const value = parseInt(localStorage.getItem(key), 10);
            return Number.isFinite(value) ? value : null;
        } catch (_) {
            return null;
        }
    }

    function writeStored(key, value) {
        try { localStorage.setItem(key, String(value)); } catch (_) { /* хранилище недоступно */ }
    }

    /**
     * @param {object} cfg
     * @param {HTMLElement} cfg.container   grid-контейнер (получит переменную и position:relative)
     * @param {HTMLElement} cfg.panel       панель, ширину которой меняем
     * @param {'left'|'right'} cfg.side     где панель относительно холста
     * @param {string} cfg.cssVar           имя переменной, например '--sidebar-w'
     * @param {string} cfg.storageKey       ключ localStorage
     * @param {number} cfg.defaultWidth
     * @param {number} cfg.min
     * @param {number} cfg.max
     * @param {number} [cfg.minCenter=640]  минимальная ширина холста
     * @param {()=>number} [cfg.otherWidth] ширина второй панели (для правила холста)
     * @param {string} cfg.label            подпись для скринридера
     */
    function attach(cfg) {
        const { container, panel, side, cssVar, storageKey, defaultWidth, min, max, label } = cfg;
        const minCenter = cfg.minCenter ?? 640;
        const otherWidth = cfg.otherWidth || (() => 0);

        const handle = document.createElement('div');
        handle.className = `panel-resizer panel-resizer--${side}`;
        handle.setAttribute('role', 'separator');
        handle.setAttribute('aria-orientation', 'vertical');
        handle.setAttribute('aria-label', label);
        handle.tabIndex = 0;
        handle.title = 'Потяните, чтобы изменить ширину. Двойной клик — по умолчанию';
        container.appendChild(handle);
        if (getComputedStyle(container).position === 'static') container.style.position = 'relative';

        function limits() {
            return { min, max, available: container.clientWidth, otherWidth: otherWidth(), minCenter };
        }

        function place() {
            const box = container.getBoundingClientRect();
            const rect = panel.getBoundingClientRect();
            const edge = side === 'left' ? rect.right : rect.left;
            handle.style.left = `${Math.round(edge - box.left - HANDLE_SIZE / 2)}px`;
            handle.hidden = rect.width === 0;
            const bounds = limits();
            handle.setAttribute('aria-valuemin', String(bounds.min));
            handle.setAttribute('aria-valuemax', String(Math.max(bounds.min, Math.min(bounds.max, bounds.available - bounds.otherWidth - bounds.minCenter))));
            handle.setAttribute('aria-valuenow', String(Math.round(rect.width)));
        }

        function apply(width) {
            const next = clampWidth(width, limits());
            container.style.setProperty(cssVar, `${next}px`);
            place();
            return next;
        }

        function widthFromPointer(clientX) {
            const box = container.getBoundingClientRect();
            return side === 'left' ? clientX - box.left : box.right - clientX;
        }

        let dragging = false;

        handle.addEventListener('pointerdown', e => {
            if (e.button !== undefined && e.button !== 0) return;
            dragging = true;
            handle.setPointerCapture?.(e.pointerId);
            handle.classList.add('panel-resizer--active');
            document.body.classList.add('panel-resizing');
            e.preventDefault();
        });

        handle.addEventListener('pointermove', e => {
            if (dragging) apply(widthFromPointer(e.clientX));
        });

        function finish(e) {
            if (!dragging) return;
            dragging = false;
            handle.releasePointerCapture?.(e.pointerId);
            handle.classList.remove('panel-resizer--active');
            document.body.classList.remove('panel-resizing');
            writeStored(storageKey, Math.round(panel.getBoundingClientRect().width));
            window.dispatchEvent(new Event('resize'));
        }
        handle.addEventListener('pointerup', finish);
        handle.addEventListener('pointercancel', finish);

        handle.addEventListener('dblclick', () => {
            apply(defaultWidth);
            writeStored(storageKey, defaultWidth);
        });

        handle.addEventListener('keydown', e => {
            const step = e.shiftKey ? KEY_STEP_FAST : KEY_STEP;
            // стрелка «вправо» увеличивает левую панель и уменьшает правую
            const grow = side === 'left' ? 1 : -1;
            let target = null;
            const current = panel.getBoundingClientRect().width;
            if (e.key === 'ArrowRight') target = current + grow * step;
            else if (e.key === 'ArrowLeft') target = current - grow * step;
            else if (e.key === 'Home') target = min;
            else if (e.key === 'End') target = max;
            else if (e.key === 'Enter' || e.key === ' ') target = defaultWidth;
            if (target === null) return;
            e.preventDefault();
            const applied = apply(target);
            writeStored(storageKey, applied);
        });

        const stored = readStored(storageKey);
        if (stored !== null) apply(stored); else place();

        window.addEventListener('resize', () => {
            const current = container.style.getPropertyValue(cssVar);
            if (current) apply(parseInt(current, 10)); else place();
        });
        if (typeof ResizeObserver !== 'undefined') new ResizeObserver(place).observe(panel);

        return { handle, apply, place };
    }

    return { clampWidth, attach, HANDLE_SIZE };
}));
