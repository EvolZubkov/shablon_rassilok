/**
 * @fileoverview Personal and shared resource management panel.
 *
 * Two tabs:
 *  - "Мои"    — personal resources stored in ``CACHE_BASE/user-resources/``.
 *               Available to all users; admin can also publish to shared repo.
 *  - "Общие"  — shared network repository resources (admin only).
 *               Admin can upload, delete, and the changes affect all users.
 *
 * Resources are merged into shared pickers via ``/api/config`` on page load.
 *
 * @module userResources
 */

/**
 * @typedef {Object} ResourceItem
 * @property {string} filename
 * @property {string} url
 * @property {string} label
 */

const UserResources = (() => {
    /** @type {Object.<string,ResourceItem[]>|null} Personal resources */
    let _personal = null;
    /** @type {Object.<string,ResourceItem[]>|null} Shared resources */
    let _shared = null;
    /** Whether the current session has admin rights. */
    let _isAdmin = false;
    /** Active tab: 'shared' | 'personal' */
    let _activeTab = 'shared';

    const CATEGORY_LABELS = {
        'icons':              'Иконки (важно)',
        'expert-badges':      'Значки экспертов',
        'bullets':            'Буллеты',
        'button-icons':       'Иконки кнопок',
        'dividers':           'Разделители',
        'banner-backgrounds': 'Фоны баннера',
        'banner-logos':       'Логотипы баннера',
        'banner-icons':       'Иконки баннера',
        'images':             'Изображения',
    };

    // -------------------------------------------------------------------------
    // API helpers
    // -------------------------------------------------------------------------

    async function loadPersonal() {
        try {
            const r = await fetch('/api/user-resources');
            const j = await r.json();
            _personal = j.success ? j.resources : {};
        } catch (_) { _personal = {}; }
        return _personal;
    }

    async function loadShared() {
        try {
            const r = await fetch('/api/shared-resources');
            const j = await r.json();
            _shared = j.success ? j.resources : {};
        } catch (_) { _shared = {}; }
        return _shared;
    }

    async function load() {
        await loadPersonal();
        if (_isAdmin) await loadShared();
    }

    async function uploadPersonal(category, file) {
        const form = new FormData();
        form.append('category', category);
        form.append('file', file);
        const r = await fetch('/api/user-resources/upload', { method: 'POST', body: form });
        return r.json();
    }

    async function deletePersonal(category, filename) {
        const r = await fetch(
            `/api/user-resources/delete?category=${encodeURIComponent(category)}&filename=${encodeURIComponent(filename)}`,
            { method: 'DELETE' }
        );
        return r.json();
    }

    async function publishPersonal(category, filename) {
        const r = await fetch('/api/user-resources/publish', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category, filename }),
        });
        return r.json();
    }

    async function uploadShared(category, file) {
        const form = new FormData();
        form.append('category', category);
        form.append('file', file);
        const r = await fetch('/api/shared-resources/upload', { method: 'POST', body: form });
        return r.json();
    }

    async function deleteShared(category, filename) {
        const r = await fetch(
            `/api/shared-resources/delete?category=${encodeURIComponent(category)}&filename=${encodeURIComponent(filename)}`,
            { method: 'DELETE' }
        );
        return r.json();
    }

    function _getResourceDeleteName(item) {
        return (item.label || item.filename || '').trim();
    }

    async function _confirmResourceDeletion(item) {
        const deleteName = _getResourceDeleteName(item);
        if (!deleteName) return false;

        const answer = window.prompt(
            `Для удаления ресурса введите его название точно так же, как оно показано в библиотеке:\n${deleteName}`,
            ''
        );

        if (answer === null) return false;

        if (answer.trim() !== deleteName) {
            Toast.error('Название ресурса не совпадает. Удаление отменено.');
            return false;
        }

        return true;
    }

    // -------------------------------------------------------------------------
    // Panel wiring
    // -------------------------------------------------------------------------

    let _panel = null;
    let _overlay = null;

    async function init() {
        _panel   = document.getElementById('user-resources-panel');
        _overlay = document.getElementById('user-resources-overlay');
        if (!_panel || !_overlay) return;

        try {
            const r = await fetch('/api/mode');
            const d = await r.json();
            _isAdmin = (d.mode === 'admin');
        } catch (_) {}

        // Non-admin users have no "Общие" tab; default to their own resources.
        if (!_isAdmin) _activeTab = 'personal';

        _overlay.addEventListener('click', close);
        const btnClose = _panel.querySelector('#user-resources-close');
        if (btnClose) btnClose.addEventListener('click', close);

        const btnOpen = document.getElementById('btn-user-resources');
        if (btnOpen) btnOpen.addEventListener('click', open);
    }

    async function open() {
        if (!_panel) return;
        await load();
        _renderPanel();
        _panel.classList.add('open');
        if (_overlay) _overlay.classList.add('active');
    }

    function close() {
        if (!_panel) return;
        _panel.classList.remove('open');
        if (_overlay) _overlay.classList.remove('active');
    }

    // -------------------------------------------------------------------------
    // Rendering
    // -------------------------------------------------------------------------

    function _renderPanel() {
        const body = _panel.querySelector('#user-resources-body');
        if (!body) return;
        body.innerHTML = '';

        // Tab bar — "Общие" only visible for admin
        const tabBar = document.createElement('div');
        tabBar.className = 'ur-tab-bar';

        if (_isAdmin) {
            const tabShared = document.createElement('button');
            tabShared.type = 'button';
            tabShared.className = 'ur-tab' + (_activeTab === 'shared' ? ' ur-tab--active' : '');
            tabShared.textContent = 'Общие';
            tabShared.addEventListener('click', () => {
                _activeTab = 'shared';
                _renderPanel();
            });
            tabBar.appendChild(tabShared);
        }

        const tabPersonal = document.createElement('button');
        tabPersonal.type = 'button';
        tabPersonal.className = 'ur-tab' + (_activeTab === 'personal' ? ' ur-tab--active' : '');
        tabPersonal.textContent = 'Личные';

        tabPersonal.addEventListener('click', () => {
            _activeTab = 'personal';
            _renderPanel();
        });
        tabBar.appendChild(tabPersonal);

        body.appendChild(tabBar);

        // Content
        const data   = _activeTab === 'shared' ? _shared : _personal;
        const isEdit = _activeTab === 'personal' || _isAdmin;

        Object.keys(CATEGORY_LABELS).forEach(category => {
            body.appendChild(_buildSection(category, (data && data[category]) || [], isEdit));
        });
    }

    function _buildSection(category, items, isEdit) {
        const group = document.createElement('div');
        group.className = 'templates-category-group';

        // Header row: collapse button + optional upload label
        const row = document.createElement('div');
        row.className = 'ur-category-row';

        const headerBtn = document.createElement('button');
        headerBtn.type = 'button';
        headerBtn.className = 'templates-category-header';
        headerBtn.setAttribute('aria-expanded', 'true');
        headerBtn.innerHTML =
            `<span class="tcg-title">${CATEGORY_LABELS[category] || category}</span>` +
            `<svg class="tcg-chevron" width="14" height="14" viewBox="0 0 24 24" ` +
            `fill="none" stroke="currentColor" stroke-width="2">` +
            `<polyline points="6 9 12 15 18 9"></polyline></svg>`;
        row.appendChild(headerBtn);

        if (isEdit) {
            const uploadLabel = document.createElement('label');
            uploadLabel.className = 'ur-btn ur-btn-upload';
            uploadLabel.textContent = '+ Добавить';
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = 'image/*';
            fileInput.style.display = 'none';
            fileInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const fn = _activeTab === 'shared' ? uploadShared : uploadPersonal;
                const result = await fn(category, file);
                if (result.success) {
                    Toast.success('Файл загружен');
                    await load();
                    if (typeof ConfigLoader !== 'undefined') await ConfigLoader.load();
                    _renderPanel();
                    if (typeof renderSettings === 'function') renderSettings();
                } else {
                    Toast.error(result.error || 'Ошибка загрузки');
                }
                fileInput.value = '';
            });
            uploadLabel.appendChild(fileInput);
            row.appendChild(uploadLabel);
        }

        group.appendChild(row);

        // Collapsible body
        const body = document.createElement('div');
        body.className = 'templates-category-body';

        headerBtn.addEventListener('click', () => {
            const open = headerBtn.getAttribute('aria-expanded') === 'true';
            headerBtn.setAttribute('aria-expanded', String(!open));
            body.classList.toggle('templates-category-body--collapsed', open);
        });

        if (!items.length) {
            const empty = document.createElement('p');
            empty.className = 'ur-empty';
            empty.textContent = 'Нет ресурсов';
            body.appendChild(empty);
        } else {
            const grid = document.createElement('div');
            grid.className = 'ur-grid';
            items.forEach(item => grid.appendChild(_buildCard(category, item, isEdit)));
            body.appendChild(grid);
        }

        group.appendChild(body);
        return group;
    }

    function _buildCard(category, item, isEdit) {
        const card = document.createElement('div');
        card.className = 'ur-item';

        const img = document.createElement('img');
        img.src = item.url;
        img.alt = item.label;
        img.className = 'ur-item-img';
        card.appendChild(img);

        const label = document.createElement('span');
        label.className = 'ur-item-label';
        label.textContent = item.label;
        card.appendChild(label);

        if (!isEdit) return card;

        const actions = document.createElement('div');
        actions.className = 'ur-item-actions';

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'ur-btn ur-btn-delete';
        delBtn.title = 'Удалить';
        delBtn.textContent = '✕';
        delBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const confirmed = await _confirmResourceDeletion(item);
            if (!confirmed) return;
            const fn = _activeTab === 'shared' ? deleteShared : deletePersonal;
            const result = await fn(category, item.filename);
            if (result.success) {
                Toast.success('Удалено');
                await load();
                if (typeof ConfigLoader !== 'undefined') await ConfigLoader.load();
                _renderPanel();
                if (typeof renderSettings === 'function') renderSettings();
            } else {
                Toast.error(result.error || 'Ошибка удаления');
            }
        });
        actions.appendChild(delBtn);

        // Publish button — only in "Мои" tab for admins
        if (_isAdmin && _activeTab === 'personal') {
            const pubBtn = document.createElement('button');
            pubBtn.type = 'button';
            pubBtn.className = 'ur-btn ur-btn-publish';
            pubBtn.title = 'Опубликовать в общем репозитории';
            pubBtn.textContent = 'В общие';
            pubBtn.addEventListener('click', async () => {
                const result = await publishPersonal(category, item.filename);
                if (result.success) {
                    Toast.success('Опубликовано');
                    await load();
                    if (typeof ConfigLoader !== 'undefined') await ConfigLoader.load();
                    _renderPanel();
                    if (typeof renderSettings === 'function') renderSettings();
                } else {
                    Toast.error(result.error || 'Ошибка публикации');
                }
            });
            actions.appendChild(pubBtn);
        }

        card.appendChild(actions);
        return card;
    }

    return { init, open, close, load };
})();

window.UserResources = UserResources;
