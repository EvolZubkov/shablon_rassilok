/**
 * @fileoverview Admin page bootstrap: Lucide icons init, mode switcher, and
 * server heartbeat.  Loaded as the last script in index.html so all modules
 * are already available.
 *
 * @module adminInit
 */

(function () {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }

    /**
     * Hide or wire up the mode-switcher toolbar button based on the server's
     * /api/mode response.  If the current user cannot switch modes, the button
     * is hidden; otherwise a click navigates to /user.
     *
     * @returns {Promise<void>}
     */
    async function initModeSwitcher() {
        try {
            const r = await fetch('/api/mode');
            const data = await r.json();
            const btn = document.getElementById('btn-switch-mode');
            if (!btn) return;
            if (!data.can_switch) {
                btn.hidden = true;
                return;
            }
            btn.addEventListener('click', async function () {
                await fetch('/api/mode', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ mode: 'user' }),
                });
                window.location.href = '/user';
            });
        } catch (_) {}
    }

    document.addEventListener('DOMContentLoaded', initModeSwitcher);
}());

// Heartbeat — ping the server every 5 seconds to keep the session alive.
setInterval(() => {
    fetch('/api/heartbeat', { method: 'POST' }).catch(() => {});
}, 5000);
