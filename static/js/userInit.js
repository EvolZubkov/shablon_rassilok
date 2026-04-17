/**
 * @fileoverview User page bootstrap: mode switcher, user menu actions, menu
 * state sync, and server heartbeat.  Loaded as the last script in
 * index-user.html so all modules are already available.
 *
 * @module userInit
 */

(function () {
    /**
     * Hide or wire up the mode-switch widget based on /api/mode.
     * Sets data-can-switch on <html> so CSS can react, moves the widget
     * into the toolbar slot, and attaches a click handler that POSTs the
     * mode change and redirects to the admin page.
     *
     * @returns {Promise<void>}
     */
    async function initModeSwitcher() {
        try {
            const r = await fetch('/api/mode');
            const data = await r.json();
            document.documentElement.setAttribute('data-can-switch', data.can_switch ? '1' : '0');
            const widget = document.getElementById('mode-switch-widget');
            const slot = document.getElementById('start-mode-switch-slot');
            if (slot) {
                slot.appendChild(widget);
            }
            if (data.can_switch) {
                widget.hidden = false;
                widget.addEventListener('click', async function () {
                    await fetch('/api/mode', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ mode: 'admin' }),
                    });
                    window.location.href = '/';
                });
            }

            document.querySelectorAll('.user-menu-action--admin').forEach((el) => {
                el.hidden = !data.can_switch;
            });

            document.querySelector('[data-action="switch-mode"]')?.classList.remove('is-checked');
        } catch (_) {}
    }

    /**
     * Wire up the hamburger/user menu actions to their respective buttons
     * and API calls.
     */
    function initUserMenu() {
        document.querySelectorAll('.user-menu-action').forEach((btn) => {
            btn.addEventListener('click', () => {
                if (btn.disabled) return;
                const action = btn.dataset.action;
                if (action === 'create-email') {
                    document.getElementById('btn-send-outlook')?.click();
                } else if (action === 'create-meeting') {
                    document.getElementById('btn-send-meeting')?.click();
                } else if (action === 'save') {
                    document.getElementById('btn-save-personal')?.click();
                } else if (action === 'settings') {
                    document.getElementById('btn-exchange-settings')?.click();
                } else if (action === 'preview') {
                    document.getElementById('btn-preview-user')?.click();
                } else if (action === 'toggle-theme') {
                    const themeBtn =
                        document.getElementById('theme-toggle-btn-user-editor') ||
                        document.getElementById('theme-toggle-btn-user-start');
                    themeBtn?.click();
                } else if (action === 'switch-mode') {
                    document.getElementById('mode-switch-widget')?.click();
                } else if (action === 'about') {
                    alert('Почтелье');
                } else if (action === 'open-log') {
                    fetch('/api/open-log', { method: 'POST' })
                        .then(async (r) => {
                            if (!r.ok) throw new Error('open-log failed');
                            const data = await r.json().catch(() => ({}));
                            if (!data.success) throw new Error(data.error || 'open-log failed');
                        })
                        .catch((err) => { console.warn('[open-log] failed to open protocol.log:', err); });
                } else if (action === 'exit') {
                    fetch('/api/shutdown', { method: 'POST' }).catch(() => {});
                    window.close();
                }
            });
        });
    }

    /**
     * Enable/disable menu items that require an open document with blocks.
     * Called on DOMContentLoaded and re-exported as window.updateUserMenuState
     * so other modules can trigger a refresh.
     */
    function updateUserMenuState() {
        const screen = document.documentElement.getAttribute('data-user-screen') || 'start';
        const hasBlocks = document.documentElement.getAttribute('data-user-has-blocks') === '1';
        document.querySelectorAll('.user-menu-action--requires-content').forEach((el) => {
            el.disabled = screen !== 'editor' || !hasBlocks;
        });
    }

    document.addEventListener('DOMContentLoaded', initModeSwitcher);
    document.addEventListener('DOMContentLoaded', initUserMenu);
    document.addEventListener('DOMContentLoaded', updateUserMenuState);
    window.updateUserMenuState = updateUserMenuState;
}());

// Heartbeat — ping the server every 5 seconds to keep the session alive.
// Fire immediately on load so we don't fall into the watchdog timeout window
// while the page is still rendering.
(function heartbeat() {
    fetch('/api/heartbeat', { method: 'POST' }).catch(() => {});
    setInterval(() => {
        fetch('/api/heartbeat', { method: 'POST' }).catch(() => {});
    }, 5000);
}());
