// admin/profilesAdmin.js — UI управления профилями аудиторий

const ProfilesAdmin = (() => {

    // ── Схема блоков: что показывать в UI ────────────────────────────────────

    const _ALIGN = [
        { value: 'left',   label: 'По левому краю' },
        { value: 'center', label: 'По центру' },
        { value: 'right',  label: 'По правому краю' },
    ];
    const _FONT = [
        { value: 'rt-regular', label: 'RT Regular' },
        { value: 'rt-medium',  label: 'RT Medium' },
        { value: 'rt-bold',    label: 'RT Bold' },
        { value: 'rt-light',   label: 'RT Light' },
    ];
    const _LH = { type: 'range', min: 1.0, max: 2.5, unit: '×', step: 0.1 };

    const BLOCK_SCHEMA = [
        {
            type: 'banner', label: 'Баннер', icon: '🖼', desc: 'Широкий блок с фото и текстом',
            defaults: [
                { key: 'backgroundColor',    label: 'Цвет фона',           type: 'color' },
                { key: 'leftBlockColor',     label: 'Цвет левого блока',   type: 'color' },
                { key: 'bannerRadius',       label: 'Скругление',          type: 'range', min: 0, max: 32, unit: 'px' },
                { key: 'rightImageMode',     label: 'Формат картинки',     type: 'select', options: [
                    { value: 'mask', label: 'Маска' }, { value: 'rounded', label: 'Прямоугольник' },
                ]},
                { key: 'rightRoundedRadius', label: 'Скругление картинки', type: 'range', min: 0, max: 32, unit: 'px' },
                { key: 'bannerHeight',       label: 'Высота',              type: 'select', options: [
                    { value: 200, label: '200px' }, { value: 250, label: '250px' },
                ]},
            ],
            hideable: ['bannerHeight', 'rightImageMode', 'colors', 'rightImage', 'logo', 'textElements'],
            caps: ['border', 'clickable'],
        },
        {
            type: 'text', label: 'Текст', icon: '📝', desc: 'Блок с основным текстом',
            defaults: [
                { key: 'fontSize',   label: 'Размер шрифта',  type: 'range', min: 10, max: 24, unit: 'px' },
                { key: 'lineHeight', label: 'Межстрочный',    ..._LH },
                { key: 'align',      label: 'Выравнивание',   type: 'select', options: _ALIGN },
                { key: 'color',      label: 'Цвет текста',    type: 'color' },
                { key: 'fontFamily', label: 'Шрифт',          type: 'select', options: _FONT },
            ],
            hideable: ['fontSize', 'lineHeight', 'align', 'color', 'fontFamily'],
            caps: ['background', 'border', 'clickable'],
        },
        {
            type: 'heading', label: 'Заголовок', icon: 'H₁', desc: 'Блок с заголовком',
            defaults: [
                { key: 'size',       label: 'Размер',          type: 'range', min: 14, max: 48, unit: 'px' },
                { key: 'weight',     label: 'Насыщенность',    type: 'select', options: [
                    { value: 300, label: 'Light 300' }, { value: 400, label: 'Regular 400' },
                    { value: 600, label: 'SemiBold 600' }, { value: 700, label: 'Bold 700' },
                ]},
                { key: 'align',      label: 'Выравнивание',    type: 'select', options: _ALIGN },
                { key: 'color',      label: 'Цвет текста',     type: 'color' },
                { key: 'fontFamily', label: 'Шрифт',           type: 'select', options: _FONT },
            ],
            hideable: ['size', 'weight', 'align', 'color', 'fontFamily'],
            caps: ['background', 'border', 'clickable'],
        },
        {
            type: 'button', label: 'Кнопка', icon: '🔘', desc: 'Блок с кнопкой-ссылкой',
            defaults: [
                { key: 'color', label: 'Цвет кнопки', type: 'color' },
                { key: 'align', label: 'Положение',   type: 'select', options: _ALIGN },
            ],
            hideable: ['color', 'align'],
            caps: ['background', 'border', 'clickable'],
        },
        {
            type: 'list', label: 'Список', icon: '📋', desc: 'Маркированный список',
            defaults: [
                { key: 'fontSize',    label: 'Размер шрифта',  type: 'range', min: 10, max: 24, unit: 'px' },
                { key: 'lineHeight',  label: 'Межстрочный',    ..._LH },
                { key: 'fontFamily',  label: 'Шрифт',          type: 'select', options: _FONT },
                { key: 'bulletSize',  label: 'Размер буллета', type: 'range', min: 12, max: 40, unit: 'px' },
                { key: 'bulletGap',   label: 'Отступ буллета', type: 'range', min: 4, max: 32, unit: 'px' },
                { key: 'itemSpacing', label: 'Отступ строк',   type: 'range', min: 0, max: 32, unit: 'px' },
            ],
            hideable: ['fontSize', 'lineHeight', 'fontFamily', 'bulletSize', 'bulletGap', 'itemSpacing'],
            caps: ['background', 'border', 'clickable'],
        },
        {
            type: 'expert', label: 'Эксперт', icon: '👤', desc: 'Блок с фото эксперта',
            defaults: [
                { key: 'bgColor',  label: 'Цвет фона карточки', type: 'color' },
                { key: 'variant',  label: 'Вариант',             type: 'select', options: [
                    { value: 'full', label: 'Полный (фото + текст)' },
                    { value: 'lite', label: 'Лайт (только фото)' },
                ]},
            ],
            hideable: ['bgColor', 'variant'],
            caps: ['background', 'border', 'clickable'],
        },
        {
            type: 'important', label: 'Важно', icon: '⚠️', desc: 'Блок-выноска',
            defaults: [
                { key: 'borderColor', label: 'Цвет полосы',    type: 'color' },
                { key: 'textColor',   label: 'Цвет текста',    type: 'color' },
                { key: 'fontSize',    label: 'Размер шрифта',  type: 'range', min: 10, max: 24, unit: 'px' },
                { key: 'lineHeight',  label: 'Межстрочный',    ..._LH },
                { key: 'fontFamily',  label: 'Шрифт',          type: 'select', options: _FONT },
            ],
            hideable: ['borderColor', 'textColor', 'fontSize', 'lineHeight', 'fontFamily'],
            caps: ['background', 'border', 'clickable'],
        },
        {
            type: 'divider', label: 'Разделитель', icon: '—', desc: 'Горизонтальная линия',
            defaults: [], hideable: [], caps: ['background', 'border', 'clickable'],
        },
        {
            type: 'image', label: 'Изображение', icon: '🖼', desc: 'Блок с картинкой',
            defaults: [
                { key: 'align',           label: 'Выравнивание',     type: 'select', options: _ALIGN },
                { key: 'borderRadiusAll', label: 'Скругление углов', type: 'range', min: 0, max: 48, unit: 'px' },
                { key: 'aspectRatio',     label: 'Соотношение сторон', type: 'select', options: [
                    { value: 'original', label: 'Оригинал' }, { value: '16:9', label: '16:9' },
                    { value: '4:3', label: '4:3' }, { value: '3:2', label: '3:2' }, { value: '1:1', label: '1:1' },
                ]},
            ],
            hideable: ['align', 'borderRadiusAll', 'aspectRatio', 'presets'],
            caps: ['background', 'border', 'clickable'],
        },
        {
            type: 'spacer', label: 'Отступ', icon: '↕', desc: 'Пустое пространство',
            defaults: [
                { key: 'height', label: 'Высота', type: 'range', min: 4, max: 96, unit: 'px' },
            ],
            hideable: ['height'],
            caps: ['background', 'border'],
        },
        {
            type: 'canvas', label: 'Свободный блок', icon: '🎨', desc: 'Блок с произвольными элементами (всегда рендерится в PNG)',
            defaults: [
                { key: 'height',  label: 'Высота',   type: 'range', min: 100, max: 600, unit: 'px' },
                { key: 'bgColor', label: 'Цвет фона', type: 'color' },
            ],
            hideable: [],
            caps: [],
        },
    ];

    const CAPABILITIES = [
        { id: 'background', label: 'Подложка',              desc: 'Добавляет цветной фон за блоком' },
        { id: 'border',     label: 'Рамка',                 desc: 'Цветная рамка вокруг блока' },
        { id: 'clickable',  label: 'Кликабельная область',  desc: 'Весь блок становится ссылкой' },
        { id: 'free',       label: 'Свободный элемент',     desc: 'Наложение текста, фигур и фото поверх блока' },
    ];

    // ── Состояние ─────────────────────────────────────────────────────────────

    let _profiles  = [];    // [{name, label}]
    let _current   = null;  // имя активного профиля
    let _data      = {};    // текущий редактируемый объект профиля
    let _tabState  = {};    // blockType → 'defaults' | 'hidden' | 'caps'

    // ── DOM ───────────────────────────────────────────────────────────────────

    function _buildModal() {
        const overlay = document.createElement('div');
        overlay.id = 'profiles-admin-overlay';
        overlay.style.cssText = `
            position:fixed;top:0;left:0;right:0;bottom:0;z-index:9999;
            background:rgba(0,0,0,.6);
            display:none;align-items:center;justify-content:center;
        `;

        overlay.innerHTML = `
        <div style="
            width:860px;max-width:95vw;max-height:90vh;
            background:var(--bg-primary);border:1px solid var(--border-primary);
            border-radius:12px;display:flex;flex-direction:column;overflow:hidden;
        ">
            <!-- шапка -->
            <div style="
                display:flex;align-items:center;gap:12px;
                padding:16px 20px;border-bottom:1px solid var(--border-primary);flex-shrink:0;
            ">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
                <span style="font-size:15px;font-weight:600;color:var(--text-primary);flex:1">Управление аудиториями</span>
                <button id="pa-close" style="
                    background:none;border:none;cursor:pointer;
                    color:var(--text-muted);font-size:20px;padding:4px 8px;
                ">✕</button>
            </div>

            <!-- тело: список слева + редактор справа -->
            <div style="display:flex;flex:1;overflow:hidden;min-height:0">

                <!-- список профилей -->
                <div style="
                    width:200px;flex-shrink:0;
                    border-right:1px solid var(--border-primary);
                    display:flex;flex-direction:column;overflow:hidden;
                ">
                    <div id="pa-profile-list" style="flex:1;overflow-y:auto;padding:8px"></div>
                    <div style="padding:8px;border-top:1px solid var(--border-primary)">
                        <button id="pa-new-profile" style="
                            width:100%;padding:8px;border-radius:6px;
                            background:rgba(124,58,237,.15);border:1px dashed rgba(124,58,237,.4);
                            color:#a855f7;font-size:12px;cursor:pointer;
                        ">+ Новая аудитория</button>
                    </div>
                </div>

                <!-- редактор -->
                <div id="pa-editor" style="flex:1;overflow-y:auto;padding:20px"></div>
            </div>

            <!-- подвал -->
            <div style="
                display:flex;justify-content:flex-end;gap:10px;
                padding:12px 20px;border-top:1px solid var(--border-primary);flex-shrink:0;
            ">
                <button id="pa-delete" style="
                    padding:8px 16px;border-radius:6px;border:1px solid var(--accent-danger,#ef4444);
                    background:transparent;color:var(--accent-danger,#ef4444);font-size:13px;cursor:pointer;
                ">Удалить</button>
                <button id="pa-save" style="
                    padding:8px 20px;border-radius:6px;border:none;
                    background:#7c3aed;color:#fff;font-size:13px;cursor:pointer;font-weight:600;
                ">Сохранить</button>
            </div>
        </div>`;

        document.body.appendChild(overlay);

        overlay.querySelector('#pa-close').onclick = close;
        overlay.querySelector('#pa-save').onclick   = _save;
        overlay.querySelector('#pa-delete').onclick  = _delete;
        overlay.querySelector('#pa-new-profile').onclick = _newProfile;
        overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

        return overlay;
    }

    // ── Список профилей ───────────────────────────────────────────────────────

    function _renderList() {
        const list = document.getElementById('pa-profile-list');
        list.innerHTML = '';
        _profiles.forEach(p => {
            const btn = document.createElement('button');
            btn.style.cssText = `
                display:block;width:100%;text-align:left;padding:8px 10px;
                border-radius:6px;border:none;cursor:pointer;font-size:13px;
                background:${p.name === _current ? 'rgba(124,58,237,.2)' : 'transparent'};
                color:${p.name === _current ? '#a855f7' : 'var(--text-secondary)'};
                margin-bottom:2px;
            `;
            btn.textContent = p.label || p.name;
            btn.title = p.name;
            btn.onclick = () => _loadProfile(p.name);
            list.appendChild(btn);
        });
    }

    // ── Редактор профиля ─────────────────────────────────────────────────────

    function _renderEditor() {
        const editor = document.getElementById('pa-editor');
        editor.innerHTML = '';
        if (!_current || !_data) {
            editor.innerHTML = '<p style="color:var(--text-muted);font-size:13px">Выберите аудиторию</p>';
            return;
        }

        // Название профиля
        const nameGroup = document.createElement('div');
        nameGroup.style.marginBottom = '20px';
        nameGroup.innerHTML = `
            <label style="font-size:11px;color:var(--text-muted);text-transform:uppercase;
                          letter-spacing:.05em;display:block;margin-bottom:6px">Название</label>
            <input id="pa-profile-label" value="${(_data.name || '').replace(/"/g, '&quot;')}"
                   style="width:100%;padding:8px 10px;border-radius:6px;
                          border:1px solid var(--border-primary);
                          background:var(--bg-secondary);color:var(--text-primary);font-size:13px">
        `;
        editor.appendChild(nameGroup);

        // Макет
        const layoutTitle = document.createElement('div');
        layoutTitle.style.cssText = 'font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px;margin-top:4px';
        layoutTitle.textContent = 'Макет письма';
        editor.appendChild(layoutTitle);

        const layoutCard = document.createElement('div');
        layoutCard.style.cssText = 'border:1px solid var(--border-primary);border-radius:8px;padding:14px 16px;margin-bottom:16px;display:flex;align-items:center;gap:12px;';
        layoutCard.innerHTML = `
            <label style="font-size:13px;color:var(--text-secondary);flex:1;">
                Отступ контента (px)
                <span style="font-size:11px;color:var(--text-muted);display:block;margin-top:2px;">
                    Все блоки кроме баннера сдвигаются на это значение слева и справа
                </span>
            </label>
            <input id="pa-content-padding" type="number" min="0" max="80" value="${_data.contentPadding ?? 27}"
                   style="width:64px;padding:6px 8px;border-radius:6px;border:1px solid var(--border-primary);
                          background:var(--bg-secondary);color:var(--text-primary);font-size:13px;text-align:center;">
            <span style="font-size:12px;color:var(--text-muted);">px</span>
        `;
        editor.appendChild(layoutCard);

        // Блоки
        const blocksTitle = document.createElement('div');
        blocksTitle.style.cssText = 'font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px';
        blocksTitle.textContent = 'Блоки';
        editor.appendChild(blocksTitle);

        BLOCK_SCHEMA.forEach(schema => {
            editor.appendChild(_renderBlockRow(schema));
        });
    }

    function _renderBlockRow(schema) {
        const blockCfg  = (_data.blocks || {})[schema.type] || {};
        const enabled   = blockCfg.enabled !== false;
        const defaults  = blockCfg.defaults || {};
        const hidden    = blockCfg.hidden   || [];
        const caps      = blockCfg.capabilities || [];

        const hasCaps     = (schema.caps     || []).length > 0;
        const hasHideable = (schema.hideable || []).length > 0;
        const hasDefaults = (schema.defaults || []).length > 0;
        const activeTab   = _tabState[schema.type] || 'defaults';

        const card = document.createElement('div');
        card.style.cssText = `
            border:1px solid var(--border-primary);border-radius:8px;
            margin-bottom:8px;overflow:hidden;
            opacity:${enabled ? '1' : '0.55'};transition:opacity .2s;
        `;

        // ── шапка ──
        const head = document.createElement('div');
        head.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;user-select:none';

        const iconSpan = document.createElement('span');
        iconSpan.style.cssText = 'font-size:14px;width:20px;text-align:center;flex-shrink:0;color:var(--text-muted)';
        iconSpan.textContent = schema.icon || '⬜';

        const labelWrap = document.createElement('div');
        labelWrap.style.flex = '1';
        labelWrap.innerHTML = `
            <div style="font-size:13px;font-weight:500;color:var(--text-primary)">${schema.label}</div>
            ${schema.desc ? `<div style="font-size:11px;color:var(--text-muted);margin-top:1px">${schema.desc}</div>` : ''}
        `;

        const toggle = _makeToggle(enabled, val => {
            _setBlock(schema.type, 'enabled', val);
            card.style.opacity = val ? '1' : '0.55';
        });

        const arrow = document.createElement('span');
        arrow.style.cssText = 'font-size:10px;color:var(--text-muted);transition:.2s;flex-shrink:0';
        arrow.textContent = '▸';

        head.appendChild(iconSpan);
        head.appendChild(labelWrap);
        head.appendChild(toggle);
        head.appendChild(arrow);

        // ── тело ──
        const body = document.createElement('div');
        body.style.display = 'none';

        head.addEventListener('click', e => {
            if (e.target.closest('label')) return;
            const open = body.style.display !== 'none';
            body.style.display = open ? 'none' : 'block';
            arrow.textContent  = open ? '▸' : '▾';
        });

        // ── вкладки ──
        const tabs = [{ id: 'defaults', label: 'Дефолты' }];
        if (hasHideable) tabs.push({ id: 'hidden', label: 'Скрытые' });
        if (hasCaps)     tabs.push({ id: 'caps',   label: 'Возможности' });

        const tabBar = document.createElement('div');
        tabBar.style.cssText = `
            display:flex;gap:2px;padding:8px 14px 0;
            background:var(--bg-secondary);border-top:1px solid var(--border-primary);
        `;

        const panelWrap = document.createElement('div');
        panelWrap.style.cssText = 'padding:12px 14px 14px;background:var(--bg-secondary)';

        function showTab(tabId) {
            _tabState[schema.type] = tabId;
            tabBar.querySelectorAll('[data-tab]').forEach(btn => {
                const on = btn.dataset.tab === tabId;
                btn.style.background = on ? 'var(--bg-primary)' : 'transparent';
                btn.style.color      = on ? 'var(--text-primary)' : 'var(--text-muted)';
                btn.style.fontWeight = on ? '600' : '400';
            });
            panelWrap.querySelectorAll('[data-panel]').forEach(p => {
                p.style.display = p.dataset.panel === tabId ? 'block' : 'none';
            });
        }

        tabs.forEach(tab => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.dataset.tab = tab.id;
            btn.textContent = tab.label;
            const on = tab.id === activeTab;
            btn.style.cssText = `
                padding:5px 12px;border:none;border-radius:5px 5px 0 0;cursor:pointer;
                font-size:11px;transition:.15s;
                background:${on ? 'var(--bg-primary)' : 'transparent'};
                color:${on ? 'var(--text-primary)' : 'var(--text-muted)'};
                font-weight:${on ? '600' : '400'};
            `;
            btn.addEventListener('click', () => showTab(tab.id));
            tabBar.appendChild(btn);
        });

        // ── панель: Дефолты ──
        const defaultsPanel = document.createElement('div');
        defaultsPanel.dataset.panel = 'defaults';
        defaultsPanel.style.display = (activeTab === 'defaults') ? 'block' : 'none';

        if (!hasDefaults) {
            defaultsPanel.innerHTML = '<div style="color:var(--text-muted);font-size:12px;padding:4px 0">Нет настраиваемых параметров</div>';
        } else {
            schema.defaults.forEach(field => {
                const isOverridden = defaults[field.key] !== undefined;
                defaultsPanel.appendChild(_renderDefaultField(schema.type, field, defaults[field.key], isOverridden));
            });
        }
        panelWrap.appendChild(defaultsPanel);

        // ── панель: Скрытые ──
        if (hasHideable) {
            const hiddenPanel = document.createElement('div');
            hiddenPanel.dataset.panel = 'hidden';
            hiddenPanel.style.display = (activeTab === 'hidden') ? 'block' : 'none';

            const hint = document.createElement('div');
            hint.style.cssText = 'font-size:11px;color:var(--text-muted);margin-bottom:10px';
            hint.textContent = 'Нажмите на настройку чтобы скрыть её от пользователей этой аудитории';
            hiddenPanel.appendChild(hint);

            const chips = document.createElement('div');
            chips.style.cssText = 'display:flex;flex-wrap:wrap;gap:5px';

            const _SECTION_LABELS = {
                colors: 'Цвета (осн.)', rightImage: 'Картинка справа',
                logo: 'Логотип', textElements: 'Текстовые эл.',
                bgImage: 'Фоновое фото',
                presets: 'Готовые изображения',
            };

            schema.hideable.forEach(key => {
                const fieldDef = schema.defaults.find(f => f.key === key);
                const lbl = fieldDef ? fieldDef.label : (_SECTION_LABELS[key] || key);
                const isHid = hidden.includes(key);

                const chip = document.createElement('span');
                const applyChip = h => {
                    chip.style.cssText = `
                        display:inline-flex;align-items:center;gap:4px;padding:4px 10px;
                        border-radius:12px;font-size:11px;cursor:pointer;user-select:none;transition:all .15s;
                        border:1px solid ${h ? '#ef4444' : 'var(--border-primary)'};
                        background:${h ? 'rgba(239,68,68,.1)' : 'var(--bg-primary)'};
                        color:${h ? '#ef4444' : 'var(--text-secondary)'};
                    `;
                    chip.textContent = (h ? '✕ ' : '◉ ') + lbl;
                };
                applyChip(isHid);
                chip.addEventListener('click', () => {
                    const cur = ((_data.blocks || {})[schema.type] || {}).hidden || [];
                    const nowHid = cur.includes(key);
                    _setBlock(schema.type, 'hidden', nowHid ? cur.filter(k => k !== key) : [...cur, key]);
                    applyChip(!nowHid);
                });
                chips.appendChild(chip);
            });
            hiddenPanel.appendChild(chips);
            panelWrap.appendChild(hiddenPanel);
        }

        // ── панель: Возможности ──
        if (hasCaps) {
            const capsPanel = document.createElement('div');
            capsPanel.dataset.panel = 'caps';
            capsPanel.style.display = (activeTab === 'caps') ? 'block' : 'none';

            schema.caps.forEach(capId => {
                const capDef = CAPABILITIES.find(c => c.id === capId);
                if (!capDef) return;
                const active = caps.includes(capId);

                const row = document.createElement('div');
                row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border-primary)';

                const info = document.createElement('div');
                info.style.flex = '1';
                info.innerHTML = `
                    <div style="font-size:12px;color:var(--text-primary)">${capDef.label}</div>
                    ${capDef.desc ? `<div style="font-size:11px;color:var(--text-muted)">${capDef.desc}</div>` : ''}
                `;

                const capToggle = _makeToggle(active, val => {
                    const cur = ((_data.blocks || {})[schema.type] || {}).capabilities || [];
                    _setBlock(schema.type, 'capabilities', val
                        ? [...new Set([...cur, capId])]
                        : cur.filter(c => c !== capId));
                });

                row.appendChild(info);
                row.appendChild(capToggle);
                capsPanel.appendChild(row);
            });
            panelWrap.appendChild(capsPanel);
        }

        body.appendChild(tabBar);
        body.appendChild(panelWrap);
        card.appendChild(head);
        card.appendChild(body);
        return card;
    }

    function _renderDefaultField(blockType, field, currentValue, isOverridden) {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border-primary)';

        const lbl = document.createElement('span');
        lbl.style.cssText = 'font-size:12px;color:var(--text-secondary);flex:1;min-width:0';
        lbl.innerHTML = field.label +
            (isOverridden ? '<span style="color:#4a6cf7;font-size:9px;margin-left:5px" title="Значение переопределено">●</span>' : '');
        wrap.appendChild(lbl);

        const val = currentValue !== undefined ? currentValue
            : (field.type === 'range' ? field.min : (field.options ? field.options[0].value : ''));

        if (field.type === 'color') {
            const btn = document.createElement('input');
            btn.type = 'color';
            btn.value = val || '#000000';
            btn.style.cssText = 'width:48px;height:28px;border:1px solid var(--border-primary);border-radius:4px;padding:2px;background:var(--bg-secondary);cursor:pointer';
            btn.addEventListener('input', () => _setDefault(blockType, field.key, btn.value));
            wrap.appendChild(btn);

        } else if (field.type === 'range') {
            const range = document.createElement('input');
            range.type = 'range';
            range.min = field.min;
            range.max = field.max;
            range.step = field.step || 1;
            range.value = val;
            range.style.cssText = 'flex:1;accent-color:#a855f7';

            const valSpan = document.createElement('span');
            valSpan.style.cssText = 'font-size:11px;color:var(--text-muted);min-width:36px;text-align:right';
            valSpan.textContent = val + (field.unit || '');

            range.addEventListener('input', () => {
                const n = Number(range.value);
                valSpan.textContent = n + (field.unit || '');
                _setDefault(blockType, field.key, n);
            });
            wrap.appendChild(range);
            wrap.appendChild(valSpan);

        } else if (field.type === 'select') {
            const sel = document.createElement('select');
            sel.style.cssText = 'padding:4px 8px;border-radius:4px;border:1px solid var(--border-primary);background:var(--bg-secondary);color:var(--text-primary);font-size:12px';
            field.options.forEach(opt => {
                const o = document.createElement('option');
                o.value = opt.value;
                o.textContent = opt.label;
                if (String(opt.value) === String(val)) o.selected = true;
                sel.appendChild(o);
            });
            sel.addEventListener('change', () => {
                const v = isNaN(sel.value) ? sel.value : Number(sel.value);
                _setDefault(blockType, field.key, v);
            });
            wrap.appendChild(sel);
        }

        return wrap;
    }

    // ── Хелперы состояния ────────────────────────────────────────────────────

    function _setBlock(type, key, value) {
        if (!_data.blocks) _data.blocks = {};
        if (!_data.blocks[type]) _data.blocks[type] = {};
        _data.blocks[type][key] = value;
    }

    function _setDefault(type, key, value) {
        if (!_data.blocks) _data.blocks = {};
        if (!_data.blocks[type]) _data.blocks[type] = {};
        if (!_data.blocks[type].defaults) _data.blocks[type].defaults = {};
        _data.blocks[type].defaults[key] = value;
    }

    function _makeToggle(checked, onChange) {
        const lbl = document.createElement('label');
        lbl.style.cssText = 'position:relative;width:32px;height:18px;flex-shrink:0;cursor:pointer';
        lbl.innerHTML = `
            <input type="checkbox" ${checked ? 'checked' : ''} style="opacity:0;width:0;height:0;position:absolute">
            <span style="
                position:absolute;inset:0;
                background:${checked ? '#7c3aed' : '#374151'};
                border-radius:99px;transition:.2s;
            ">
                <span style="
                    position:absolute;width:12px;height:12px;
                    left:${checked ? '17px' : '3px'};top:3px;
                    background:#fff;border-radius:50%;transition:.2s;
                "></span>
            </span>
        `;
        const input = lbl.querySelector('input');
        const track = lbl.querySelector('span');
        const thumb = track.querySelector('span');
        input.addEventListener('change', () => {
            track.style.background = input.checked ? '#7c3aed' : '#374151';
            thumb.style.left       = input.checked ? '17px' : '3px';
            onChange(input.checked);
        });
        return lbl;
    }

    // ── API ───────────────────────────────────────────────────────────────────

    async function _loadProfilesList() {
        const resp = await fetch('/api/admin/profiles');
        const data = await resp.json();
        if (data.success) {
            _profiles = data.profiles;
            _renderList();
        }
    }

    async function _loadProfile(name) {
        const resp = await fetch(`/api/admin/profiles/${name}`);
        const data = await resp.json();
        if (data.success) {
            _current = name;
            _data    = data.profile;
            _renderList();
            _renderEditor();
        }
    }

    async function _save() {
        if (!_current) return;
        _data.name = document.getElementById('pa-profile-label')?.value || _data.name;
        const cpInput = document.getElementById('pa-content-padding');
        if (cpInput) _data.contentPadding = Math.max(0, Math.min(80, parseInt(cpInput.value, 10) || 0));
        const resp = await fetch(`/api/admin/profiles/${_current}`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(_data),
        });
        const result = await resp.json();
        if (result.success) {
            Toast.success('Профиль сохранён');
            await _loadProfilesList();
        } else {
            Toast.error(result.error || 'Ошибка');
        }
    }

    async function _delete() {
        if (!_current || _current === 'default') {
            Toast.warning('Нельзя удалить профиль default');
            return;
        }
        if (!confirm(`Удалить профиль «${_current}»?`)) return;
        const resp = await fetch(`/api/admin/profiles/${_current}`, { method: 'DELETE' });
        const result = await resp.json();
        if (result.success) {
            _current = null;
            _data    = {};
            await _loadProfilesList();
            _renderEditor();
        }
    }

    function _newProfile() {
        const name = prompt('Имя профиля (латиница, цифры, _ -)');
        if (!name || !/^[a-z0-9_-]{1,64}$/.test(name)) {
            if (name !== null) Toast.warning('Допустимы латинские буквы, цифры, _ и -');
            return;
        }
        _current = name;
        _data    = {
            name: name,
            blocks: Object.fromEntries(
                BLOCK_SCHEMA.map(s => [s.type, { enabled: true, capabilities: [] }])
            ),
        };
        _profiles.push({ name, label: name });
        _renderList();
        _renderEditor();
    }

    // ── Public ────────────────────────────────────────────────────────────────

    let _overlay = null;

    function open() {
        if (!_overlay) _overlay = _buildModal();
        _overlay.style.display = 'flex';
        _loadProfilesList().then(() => {
            if (_profiles.length > 0 && !_current) {
                _loadProfile(_profiles[0].name);
            }
        });
    }

    function close() {
        if (_overlay) _overlay.style.display = 'none';
    }

    return { open, close };
})();

// ── Инициализация кнопки ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('btn-profiles-admin');
    if (btn) btn.addEventListener('click', () => {
        try {
            ProfilesAdmin.open();
        } catch (e) {
            if (typeof jslog === 'function') jslog('error', '[ProfilesAdmin] open() threw: ' + e);
        }
    });
});
