/**
 * @module favoritesStore
 * @description Per-user favorites store backed by localStorage.
 *
 * Template IDs are persisted as a JSON array under a fixed localStorage key.
 * All operations are synchronous and require no server round-trips, keeping
 * favorites strictly local to the current user and device.
 *
 * Both admin and user modes share this module.
 */

const FavoritesStore = (function () {
    const KEY = 'pochtelye-favorites';

    /**
     * Read the stored set of favorite template IDs.
     *
     * @returns {Set<string>}
     */
    function getAll() {
        try {
            const raw = localStorage.getItem(KEY);
            return new Set(raw ? JSON.parse(raw) : []);
        } catch {
            return new Set();
        }
    }

    /**
     * Persist a set of favorite IDs to localStorage.
     *
     * @private
     * @param {Set<string>} set
     */
    function persist(set) {
        try {
            localStorage.setItem(KEY, JSON.stringify([...set]));
        } catch { /* quota exceeded — silently ignore */ }
    }

    /**
     * Check whether a template is marked as favorite.
     *
     * @param {string} id - Template stable identifier.
     * @returns {boolean}
     */
    function isFavorite(id) {
        return getAll().has(id);
    }

    /**
     * Toggle the favorite state of a template.
     *
     * @param {string} id - Template stable identifier.
     * @returns {boolean} New state: {@code true} means the template is now a favorite.
     */
    function toggle(id) {
        const set = getAll();
        if (set.has(id)) {
            set.delete(id);
        } else {
            set.add(id);
        }
        persist(set);
        return set.has(id);
    }

    return { getAll, isFavorite, toggle };
}());

window.FavoritesStore = FavoritesStore;
