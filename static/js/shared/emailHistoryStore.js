/**
 * @fileoverview Local email address history store and autocomplete widget.
 *
 * {@link EmailHistoryStore} persists sent-to addresses in localStorage (MRU
 * order, up to {@link MAX_ENTRIES}).  {@link EmailAutocomplete} attaches an
 * autocomplete dropdown to comma-separated email input / textarea elements and
 * queries the store on each keystroke.
 *
 * Both objects are exported on {@code window} so that other modules can call
 * {@code EmailHistoryStore.addMany()} after a successful send and
 * {@code EmailAutocomplete.attach(inputEl)} when building dialogs.
 *
 * @module emailHistoryStore
 */

// ─── Store ────────────────────────────────────────────────────────────────────

/**
 * Maximum number of email addresses kept in history.
 * @constant {number}
 */
const MAX_ENTRIES = 200;

/**
 * Maximum number of suggestions shown in the dropdown at once.
 * @constant {number}
 */
const MAX_SUGGESTIONS = 8;

const EmailHistoryStore = (function () {
    const STORAGE_KEY = 'pochtelye-email-history';

    /**
     * Returns all stored addresses, most-recently-used first.
     * @returns {string[]}
     */
    function getAll() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch {
            return [];
        }
    }

    /** @param {string[]} list */
    function _persist(list) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
        } catch { /* quota exceeded — silently skip */ }
    }

    /**
     * Add a single address.  Moves it to front if already stored.
     * Silently ignores blank values or strings without {@code @}.
     *
     * @param {string} email
     */
    function add(email) {
        const addr = email.trim().toLowerCase();
        if (!addr || !addr.includes('@')) return;
        const list = getAll().filter(e => e !== addr);
        list.unshift(addr);
        _persist(list.slice(0, MAX_ENTRIES));
    }

    /**
     * Add multiple addresses at once.  All are considered equally recent;
     * the first element in the array becomes the most-recent entry.
     *
     * @param {string[]} emails
     */
    function addMany(emails) {
        if (!Array.isArray(emails) || emails.length === 0) return;
        // Process in reverse so the first element ends up at position 0.
        [...emails].reverse().forEach(add);
    }

    /**
     * Search stored addresses.  Entries that start with {@code query} are
     * returned before entries that merely contain it.
     *
     * @param {string} query
     * @returns {string[]} Up to {@link MAX_SUGGESTIONS} results.
     */
    function search(query) {
        const q = query.trim().toLowerCase();
        if (q.length === 0) return [];
        const all = getAll();
        const startsWith = all.filter(e => e.startsWith(q));
        const contains = all.filter(e => !e.startsWith(q) && e.includes(q));
        return [...startsWith, ...contains].slice(0, MAX_SUGGESTIONS);
    }

    return { getAll, add, addMany, search };
}());

// ─── Autocomplete widget ──────────────────────────────────────────────────────

const EmailAutocomplete = (function () {
    /** @type {HTMLUListElement|null} */
    let _dropdown = null;
    /** @type {HTMLInputElement|HTMLTextAreaElement|null} */
    let _activeEl = null;
    /** @type {string[]} */
    let _items = [];
    /** @type {number} */
    let _selIdx = -1;
    /** Timeout id for deferred hide on blur. @type {number|null} */
    let _blurTimer = null;

    // ── Dropdown DOM ──────────────────────────────────────────────────────────

    function _ensureDropdown() {
        if (_dropdown) return _dropdown;
        _dropdown = document.createElement('ul');
        _dropdown.className = 'email-ac-dropdown';
        _dropdown.setAttribute('role', 'listbox');
        document.body.appendChild(_dropdown);

        _dropdown.addEventListener('mousedown', (e) => {
            // Prevent blur on the input before the click registers.
            e.preventDefault();
        });

        _dropdown.addEventListener('click', (e) => {
            const li = e.target.closest('li[data-value]');
            if (li) _confirm(li.dataset.value);
        });

        return _dropdown;
    }

    function _show() {
        if (_dropdown) _dropdown.style.display = 'block';
    }

    function _hide() {
        if (_dropdown) _dropdown.style.display = 'none';
        _items = [];
        _selIdx = -1;
    }

    // ── Token helpers ─────────────────────────────────────────────────────────

    /**
     * Return the index of the last separator character ({@code ,}, {@code ;},
     * or newline) in {@code str}, or {@code -1} if none is found.
     *
     * @param {string} str
     * @returns {number}
     */
    function _lastSepIndex(str) {
        let idx = -1;
        for (let i = str.length - 1; i >= 0; i--) {
            if (str[i] === ',' || str[i] === ';' || str[i] === '\n') {
                idx = i;
                break;
            }
        }
        return idx;
    }

    /**
     * Return the index of the first separator character in {@code str},
     * or {@code -1} if none is found.
     *
     * @param {string} str
     * @returns {number}
     */
    function _firstSepIndex(str) {
        for (let i = 0; i < str.length; i++) {
            if (str[i] === ',' || str[i] === ';' || str[i] === '\n') return i;
        }
        return -1;
    }

    /**
     * Extract the email token the user is currently editing (text after the
     * last separator — {@code ,}, {@code ;}, or newline — before the cursor).
     *
     * @param {HTMLInputElement|HTMLTextAreaElement} el
     * @returns {{ token: string, tokenStart: number }}
     */
    function _currentToken(el) {
        const val = el.value;
        const pos = typeof el.selectionStart === 'number' ? el.selectionStart : val.length;
        const before = val.slice(0, pos);
        const lastSep = _lastSepIndex(before);
        const tokenStart = lastSep === -1 ? 0 : lastSep + 1;
        const token = before.slice(tokenStart).trimStart();
        return { token, tokenStart };
    }

    /**
     * Replace the current token with {@code selected} and append {@code ", "}
     * so the user can immediately type the next address.
     * Accepts {@code ,}, {@code ;}, and newline as token separators.
     *
     * @param {HTMLInputElement|HTMLTextAreaElement} el
     * @param {string} selected
     */
    function _replaceToken(el, selected) {
        const val = el.value;
        const pos = typeof el.selectionStart === 'number' ? el.selectionStart : val.length;
        const before = val.slice(0, pos);
        const lastSep = _lastSepIndex(before);

        // Build the part before the replaced token (keep everything up to and
        // including the separator, then normalise trailing whitespace).
        const prefix = lastSep === -1
            ? ''
            : val.slice(0, lastSep + 1) + ' ';

        // Skip the rest of the current token after the cursor (up to next separator).
        const after = val.slice(pos);
        const nextSep = _firstSepIndex(after);
        const suffix = nextSep === -1 ? '' : after.slice(nextSep + 1).trimStart();

        el.value = prefix + selected + (suffix ? ', ' + suffix : ', ');

        // Move cursor to right after the inserted address + separator.
        const newPos = prefix.length + selected.length + 2;
        el.setSelectionRange(newPos, newPos);
    }

    // ── Render / position ─────────────────────────────────────────────────────

    function _render(items, activeEl) {
        const dd = _ensureDropdown();
        if (items.length === 0) { _hide(); return; }

        _items = items;
        _selIdx = -1;

        dd.innerHTML = '';
        items.forEach((addr, i) => {
            const li = document.createElement('li');
            li.className = 'email-ac-item';
            li.setAttribute('role', 'option');
            li.dataset.value = addr;
            li.textContent = addr;
            dd.appendChild(li);
        });

        // Position below the input.
        const rect = activeEl.getBoundingClientRect();
        dd.style.top    = (rect.bottom + 2) + 'px';
        dd.style.left   = rect.left + 'px';
        dd.style.width  = Math.max(rect.width, 220) + 'px';

        _show();
    }

    function _highlight(idx) {
        const items = _dropdown ? _dropdown.querySelectorAll('.email-ac-item') : [];
        items.forEach((li, i) => li.classList.toggle('email-ac-item--active', i === idx));
    }

    // ── Confirm selection ─────────────────────────────────────────────────────

    function _confirm(value) {
        if (!_activeEl) return;
        _replaceToken(_activeEl, value);
        _hide();
        _activeEl.focus();
    }

    // ── Event handlers ────────────────────────────────────────────────────────

    function _onInput() {
        const { token } = _currentToken(this);
        if (token.length === 0) { _hide(); return; }
        const results = EmailHistoryStore.search(token);
        _render(results, this);
    }

    function _onKeydown(e) {
        if (!_dropdown || _dropdown.style.display === 'none') return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            _selIdx = Math.min(_selIdx + 1, _items.length - 1);
            _highlight(_selIdx);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            _selIdx = Math.max(_selIdx - 1, -1);
            _highlight(_selIdx);
        } else if (e.key === 'Enter' || e.key === 'Tab') {
            if (_selIdx >= 0 && _items[_selIdx]) {
                e.preventDefault();
                _confirm(_items[_selIdx]);
            }
        } else if (e.key === 'Escape') {
            _hide();
        }
    }

    function _onFocus() {
        _activeEl = this;
        if (_blurTimer !== null) {
            clearTimeout(_blurTimer);
            _blurTimer = null;
        }
    }

    function _onBlur() {
        _blurTimer = setTimeout(() => {
            _hide();
            _blurTimer = null;
        }, 120);
    }

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * Attach autocomplete behaviour to a comma-separated email input or
     * textarea.  Safe to call multiple times on the same element.
     *
     * @param {HTMLInputElement|HTMLTextAreaElement} el
     */
    function attach(el) {
        if (!el || el.dataset.acAttached) return;
        el.dataset.acAttached = '1';
        el.setAttribute('autocomplete', 'off');
        el.addEventListener('input',   _onInput.bind(el));
        el.addEventListener('keydown', _onKeydown.bind(el));
        el.addEventListener('focus',   _onFocus.bind(el));
        el.addEventListener('blur',    _onBlur.bind(el));
    }

    /**
     * Attach autocomplete to all known recipient fields present in the DOM.
     * Call once after the send-email and send-meeting modals are rendered.
     */
    function attachAll() {
        ['email-to', 'email-cc', 'email-bcc',
         'meeting-to', 'meeting-bcc'].forEach(id => {
            const el = document.getElementById(id);
            if (el) attach(el);
        });
    }

    return { attach, attachAll };
}());

window.EmailHistoryStore = EmailHistoryStore;
window.EmailAutocomplete = EmailAutocomplete;
