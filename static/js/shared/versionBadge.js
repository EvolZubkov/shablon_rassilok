/**
 * @fileoverview On-screen application version badge.
 *
 * Shows "vX.Y.Z" in the bottom-right corner of the window so the version is
 * visible on every screenshot (user and admin modes). The version comes from
 * GET /api/version (single source: pyproject.toml).
 *
 * @module versionBadge
 */

const VersionBadge = (function () {
    const BADGE_ID = 'app-version-badge';
    const VERSION_URL = '/api/version';
    // Above modal overlays, so the version stays on screenshots of dialogs.
    const Z_INDEX = '2147483000';

    /**
     * Create the badge element (once) and return it.
     *
     * @param {string} version
     * @returns {HTMLElement}
     */
    function _ensureBadge(version) {
        let el = document.getElementById(BADGE_ID);
        if (!el) {
            el = document.createElement('div');
            el.id = BADGE_ID;
            el.setAttribute('aria-hidden', 'true');
            el.style.cssText = [
                'position:fixed', 'right:8px', 'bottom:8px', `z-index:${Z_INDEX}`,
                'padding:4px 8px', 'border-radius:4px',
                'font:12px/16px system-ui,sans-serif', 'letter-spacing:.2px',
                'color:#fff', 'background:rgba(15,23,42,.72)',
                'pointer-events:none', 'user-select:none',
            ].join(';');
            document.body.appendChild(el);
        }
        el.textContent = 'v' + version;
        return el;
    }

    /**
     * Fetch the version and show the badge. Resolves quietly (no badge) when
     * the server is unreachable — the badge is informational only.
     *
     * @returns {Promise<void>}
     */
    async function show() {
        try {
            const resp = await fetch(VERSION_URL);
            if (!resp.ok) return;
            const data = await resp.json();
            if (!data || !data.version) return;
            _ensureBadge(String(data.version));
        } catch (_err) {
            // Offline or server restarting: nothing to show.
        }
    }

    return { show };
}());

window.VersionBadge = VersionBadge;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => VersionBadge.show());
} else {
    VersionBadge.show();
}
