// toast.js — единая система уведомлений вместо window.alert()
// Подключается первым; заменяет все alert() в приложении.

const Toast = (() => {
    const MAX_VISIBLE = 5;
    const DEFAULT_DURATION = 3500;
    let container = null;

    function getContainer() {
        if (container) return container;
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = `
            position: fixed;
            bottom: 24px;
            left: 50%;
            transform: translateX(-50%);
            display: flex;
            flex-direction: column-reverse;
            gap: 8px;
            z-index: 99999;
            pointer-events: none;
            max-width: 420px;
            width: max-content;
        `;
        document.body.appendChild(container);
        return container;
    }

    const COLORS = {
        success: { bg: '#16a34a', border: '#15803d', icon: '✅' },
        error:   { bg: '#dc2626', border: '#b91c1c', icon: '❌' },
        info:    { bg: '#1e40af', border: '#1d4ed8', icon: 'ℹ️' },
        warning: { bg: '#d97706', border: '#b45309', icon: '⚠️' },
    };

    function show(message, type = 'info', duration = DEFAULT_DURATION) {
        if (!message || !String(message).trim()) return;
        if (!['success', 'error', 'info', 'warning'].includes(type)) type = 'info';

        const c = getContainer();

        // Убираем старые если переполнено
        const visible = c.querySelectorAll('.toast-item');
        if (visible.length >= MAX_VISIBLE) {
            visible[0].remove();
        }

        const style = COLORS[type];
        const el = document.createElement('div');
        el.className = 'toast-item';
        el.style.cssText = `
            background: ${style.bg};
            border: 1px solid ${style.border};
            color: #fff;
            padding: 10px 16px;
            border-radius: 8px;
            font-size: 13px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            line-height: 1.4;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            pointer-events: auto;
            cursor: pointer;
            opacity: 0;
            transform: translateY(8px);
            transition: opacity 0.2s, transform 0.2s;
            white-space: pre-wrap;
            word-break: break-word;
        `;
        el.textContent = message;
        el.title = 'Нажмите чтобы закрыть';
        el.addEventListener('click', () => dismiss(el));

        c.appendChild(el);

        // Анимация появления
        requestAnimationFrame(() => {
            el.style.opacity = '1';
            el.style.transform = 'translateY(0)';
        });

        // Автоудаление
        el._timer = setTimeout(() => dismiss(el), duration);
        return el;
    }

    function dismiss(el) {
        if (!el || !el.parentNode) return;
        clearTimeout(el._timer);
        el.style.opacity = '0';
        el.style.transform = 'translateY(8px)';
        setTimeout(() => el.remove(), 200);
    }

    /**
     * Show a persistent loading toast.
     *
     * Returns a controller object:
     *   • resolve(type, msg) — replace the toast with a final success/error/info message
     *   • dismiss()          — remove silently
     *
     * @param {string} message
     * @returns {{ resolve: (type: string, msg: string) => void, dismiss: () => void }}
     */
    function loading(message) {
        const el = show('\u23F3 ' + message, 'info', 9e8);
        return {
            resolve(type, msg) {
                if (!el || !el.parentNode) return;
                clearTimeout(el._timer);
                const style = COLORS[type] || COLORS.info;
                el.style.background = style.bg;
                el.style.borderColor = style.border;
                el.textContent = msg;
                el._timer = setTimeout(() => dismiss(el), DEFAULT_DURATION);
            },
            dismiss() { dismiss(el); },
        };
    }

    return {
        show,
        success: (msg, dur) => show(msg, 'success', dur),
        error:   (msg, dur) => show(msg, 'error',   dur),
        info:    (msg, dur) => show(msg, 'info',    dur),
        warning: (msg, dur) => show(msg, 'warning', dur),
        loading,
    };
})();

window.Toast = Toast;