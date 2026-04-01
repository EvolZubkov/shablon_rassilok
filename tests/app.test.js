/**
 * Тесты для JavaScript модулей Email Builder
 * Покрывает: shared/utils.js, state.js, definitions.js, buttonAutoStyle.js,
 *            blockDefaults.js, templatesAPI.js, configLoader, blockPreview-логику,
 *            toast.js, undo-стек, операции с блоками, isPreset.
 *
 * Запуск: npm test
 */

const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
const escapeHtmlAttr = escapeHtml;

function findBlockDeep(blocks, id) {
    for (const block of blocks || []) {
        if (block.id === id) return block;
        if (block.columns) {
            for (const col of block.columns) {
                const found = findBlockDeep(col.blocks || [], id);
                if (found) return found;
            }
        }
    }
    return null;
}

function normalizeButtonText(text) {
    return String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function getButtonAutoStyle(settings = {}) {
    const normalizedText = normalizeButtonText(settings.text);
    const isMif = normalizedText === 'миф';
    const isAlpina = normalizedText === 'альпина';
    const color = isMif ? '#FFB608' : isAlpina ? '#A078FF' : (settings.color || '#f97316');
    const icon = isMif
        ? 'button-icons/Миф.png'
        : isAlpina
            ? 'button-icons/Альпина.png'
            : (settings.icon || '');
    return { normalizedText, isMif, isAlpina, isAuto: isMif || isAlpina, color, icon };
}

function sanitizeUrl(url) {
    if (!url) return '#';
    const trimmed = String(url).trim();
    if (/^(javascript|data|vbscript):/i.test(trimmed)) return '#';
    return trimmed.replace(/"/g, '&quot;');
}

function makeAppState() {
    return {
        blocks: [],
        selectedBlockId: null,
        multiSelectedBlockIds: new Set(),
        multiSelectAnchorId: null,
        blockIdCounter: 1,
        undoStack: [],
        UNDO_MAX: 20,
        addBlock(block) { this.blocks.push(block); },
        removeBlock(blockId) { this.blocks = this.blocks.filter(b => b.id !== blockId); },
        getNextBlockId() { return this.blockIdCounter++; },
        selectBlock(blockId) { this.selectedBlockId = blockId; },
        clearSelection() { this.selectedBlockId = null; },
        findBlockById(id, blocksList = null) {
            const list = blocksList || this.blocks;
            for (let block of list) {
                if (block.id === id) return block;
                if (block.columns) {
                    for (let col of block.columns) {
                        const found = this.findBlockById(id, col.blocks);
                        if (found) return found;
                    }
                }
            }
            return null;
        },
        clearMultiSelection() {
            this.multiSelectedBlockIds.clear();
            this.multiSelectAnchorId = null;
        },
        toggleMultiSelect(blockId) {
            if (this.multiSelectedBlockIds.has(blockId)) {
                this.multiSelectedBlockIds.delete(blockId);
            } else {
                this.multiSelectedBlockIds.add(blockId);
            }
            this.selectedBlockId = blockId;
            if (!this.multiSelectAnchorId) this.multiSelectAnchorId = blockId;
        },
        rangeSelectTopLevel(blockId) {
            const ids = this.blocks.map(b => b.id);
            const anchor = this.multiSelectAnchorId || this.selectedBlockId || blockId;
            const a = ids.indexOf(anchor);
            const b = ids.indexOf(blockId);
            if (a === -1 || b === -1) {
                this.clearMultiSelection();
                this.selectedBlockId = blockId;
                this.multiSelectAnchorId = blockId;
                return;
            }
            const [from, to] = a <= b ? [a, b] : [b, a];
            this.multiSelectedBlockIds.clear();
            for (let i = from; i <= to; i++) this.multiSelectedBlockIds.add(ids[i]);
            this.selectedBlockId = blockId;
        },
        pushUndo() {
            this.undoStack.push(JSON.stringify({
                blocks: this.blocks,
                selectedBlockId: this.selectedBlockId
            }));
            if (this.undoStack.length > this.UNDO_MAX) this.undoStack.shift();
        },
        undo() {
            if (!this.undoStack.length) return false;
            const prev = JSON.parse(this.undoStack.pop());
            this.blocks = prev.blocks || [];
            this.selectedBlockId = prev.selectedBlockId ?? null;
            return true;
        },
        get canUndo() { return this.undoStack.length > 0; }
    };
}

function isPresetTemplate(t) {
    return t.isPreset === true || (typeof t.name === 'string' && t.name.startsWith('🧩'));
}

function applyConfig(config) {
    return {
        BANNERS: config.banners || [],
        IMPORTANT_ICONS: config.icons?.important || [],
        EXPERT_BADGE_ICONS: config.expertBadges || [],
        BULLET_TYPES: config.bullets || [],
        BUTTON_ICONS: config.buttonIcons || [],
        DIVIDER_IMAGES: config.dividers || [],
        BANNER_BACKGROUNDS: config.bannerBackgrounds || [],
        BANNER_LOGOS: config.bannerLogos || [],
        BANNER_ICONS: config.bannerIcons || [],
    };
}

const FALLBACK_BULLET_TYPES = [
    { id: 'circle',  src: 'bullets/Буллет.png',   label: 'Буллет' },
    { id: 'circle2', src: 'bullets/Буллет 2.png', label: 'Буллет 2' },
    { id: 'circle3', src: 'bullets/Буллет 3.png', label: 'Буллет 3' },
    { id: 'circle4', src: 'bullets/Буллет 4.png', label: 'Буллет 4' },
];
const FALLBACK_IMPORTANT_ICONS = [
    { id: 'i1', src: 'icons/Геометка с картой.png', label: 'Геометрия' },
    { id: 'i6', src: 'icons/Мегафон. Внимание.png', label: 'Мегафон' },
];
const FALLBACK_EXPERT_BADGE_ICONS = [
    { id: 'e1', src: 'expert-badges/Сообщение.png', label: 'Сообщение' },
];
const FALLBACK_BUTTON_ICONS = [
    { id: 'none',     src: '',                       label: 'Без иконки' },
    { id: 'download', src: 'button-icons/Знак.png', label: 'Лого' },
];

function resolveBulletSrc(s, BULLET_TYPES) {
    return s.bulletCustom ||
        ((BULLET_TYPES.find(b => b.id === s.bulletType) || BULLET_TYPES[0])?.src || '');
}

const DEFAULT_SETTINGS = {
    text: {
        content: 'Введите текст здесь.',
        fontSize: 14, lineHeight: 1.15, align: 'left',
        color: '#e5e7eb', fontFamily: 'rt-light', customFontFamily: ''
    },
    list: {
        items: ['Первый', 'Второй', 'Третий'],
        bulletType: 'circle', bulletCustom: '',
        fontFamily: 'rt-light', customFontFamily: '',
        fontSize: 14, lineHeight: 1.0,
        bulletSize: 40, bulletGap: 10, itemSpacing: 8, listStyle: 'bullets'
    },
    button: {
        text: 'Подключиться', url: 'https://example.com',
        color: '#ff4f12', icon: '', align: 'center'
    },
    expert: {
        variant: 'full', align: 'center',
        photo: 'images/expert-placeholder.png',
        name: 'Имя эксперта', title: 'Должность', bio: 'Описание',
        badgeIcon: '', bgColor: '#0f172a', renderedExpert: null
    },
    important: {
        text: 'Важная информация',
        icon: '', textColor: '#e5e7eb', borderColor: '#a855f7',
        renderedIcon: null, fontSize: 14
    },
    spacer: { height: 20 },
    divider: { image: '', customImage: '' },
    image: {
        src: '', alt: 'Изображение', width: '100%', align: 'center',
        borderRadiusMode: 'all', borderRadiusAll: 0
    },
};

function getDefaultSettings(type) {
    const settings = DEFAULT_SETTINGS[type];
    if (!settings) return {};
    const result = {};
    for (let key in settings) {
        const value = settings[key];
        result[key] = typeof value === 'function' ? value() : value;
    }
    return result;
}


// ─────────────────────────────────────────────────────────────────────────────
// 1. shared/utils.js — escapeHtml
// ─────────────────────────────────────────────────────────────────────────────

describe('escapeHtml — экранирование спецсимволов', () => {
    test('экранирует <', () => expect(escapeHtml('<b>')).toBe('&lt;b&gt;'));
    test('экранирует >', () => expect(escapeHtml('a>b')).toBe('a&gt;b'));
    test('экранирует &', () => expect(escapeHtml('a & b')).toBe('a &amp; b'));
    test('экранирует двойные кавычки', () => expect(escapeHtml('"test"')).toBe('&quot;test&quot;'));
    test('экранирует одинарные кавычки', () => expect(escapeHtml("it's")).toBe('it&#039;s'));
    test('возвращает "" для null', () => expect(escapeHtml(null)).toBe(''));
    test('возвращает "" для undefined', () => expect(escapeHtml(undefined)).toBe(''));
    test('возвращает "" для пустой строки', () => expect(escapeHtml('')).toBe(''));
    test('не меняет обычный текст', () => expect(escapeHtml('Привет мир')).toBe('Привет мир'));
    test('конвертирует число', () => expect(escapeHtml(42)).toBe('42'));
    test('XSS-пример', () => {
        expect(escapeHtml('<script>alert("xss")</script>'))
            .toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    });
    test('двойное экранирование & ', () => {
        expect(escapeHtml('&amp;')).toBe('&amp;amp;');
    });
    test('escapeHtmlAttr — псевдоним идентичен', () => {
        expect(escapeHtmlAttr('<div>')).toBe(escapeHtml('<div>'));
    });
});


// ─────────────────────────────────────────────────────────────────────────────
// 2. shared/utils.js — findBlockDeep
// ─────────────────────────────────────────────────────────────────────────────

describe('findBlockDeep — рекурсивный поиск блока', () => {
    test('находит на верхнем уровне', () => {
        const blocks = [{ id: 1, type: 'text' }, { id: 2, type: 'image' }];
        expect(findBlockDeep(blocks, 2).type).toBe('image');
    });

    test('возвращает null если не найден', () => {
        expect(findBlockDeep([{ id: 1 }], 999)).toBeNull();
    });

    test('находит вложенный блок в колонке', () => {
        const blocks = [{
            id: 1, type: 'columns',
            columns: [{ id: 'col-a', blocks: [{ id: 10, type: 'button' }] }]
        }];
        expect(findBlockDeep(blocks, 10).type).toBe('button');
    });

    test('находит во второй колонке', () => {
        const blocks = [{
            id: 1, type: 'columns',
            columns: [
                { id: 'col-a', blocks: [{ id: 10 }] },
                { id: 'col-b', blocks: [{ id: 20, type: 'image' }] }
            ]
        }];
        expect(findBlockDeep(blocks, 20).type).toBe('image');
    });

    test('пустой массив → null', () => expect(findBlockDeep([], 1)).toBeNull());
    test('null → null', () => expect(findBlockDeep(null, 1)).toBeNull());
    test('undefined → null', () => expect(findBlockDeep(undefined, 1)).toBeNull());

    test('глубокая вложенность 3 уровня', () => {
        const blocks = [{
            id: 1, type: 'columns',
            columns: [{
                id: 'c1', blocks: [{
                    id: 2, type: 'columns',
                    columns: [{ id: 'c2', blocks: [{ id: 99, type: 'expert' }] }]
                }]
            }]
        }];
        expect(findBlockDeep(blocks, 99).type).toBe('expert');
    });

    test('возвращает первый при дублях id', () => {
        const blocks = [{ id: 5, type: 'text' }, { id: 5, type: 'image' }];
        expect(findBlockDeep(blocks, 5).type).toBe('text');
    });
});


// ─────────────────────────────────────────────────────────────────────────────
// 3. AppState — блоки и выбор
// ─────────────────────────────────────────────────────────────────────────────

describe('AppState — управление блоками', () => {
    let s;
    beforeEach(() => { s = makeAppState(); });

    test('addBlock — добавляет блок', () => {
        s.addBlock({ id: 1, type: 'text' });
        expect(s.blocks).toHaveLength(1);
    });

    test('removeBlock — удаляет по id', () => {
        s.addBlock({ id: 1 }); s.addBlock({ id: 2 });
        s.removeBlock(1);
        expect(s.blocks.map(b => b.id)).toEqual([2]);
    });

    test('removeBlock — не падает при несуществующем', () => {
        s.addBlock({ id: 1 });
        expect(() => s.removeBlock(999)).not.toThrow();
    });

    test('getNextBlockId — инкремент', () => {
        expect(s.getNextBlockId()).toBe(1);
        expect(s.getNextBlockId()).toBe(2);
        expect(s.getNextBlockId()).toBe(3);
    });

    test('selectBlock / clearSelection', () => {
        s.selectBlock(42);
        expect(s.selectedBlockId).toBe(42);
        s.clearSelection();
        expect(s.selectedBlockId).toBeNull();
    });

    test('findBlockById — верхний уровень', () => {
        s.addBlock({ id: 1 }); s.addBlock({ id: 2, type: 'image' });
        expect(s.findBlockById(2).type).toBe('image');
    });

    test('findBlockById — вложенный', () => {
        s.addBlock({
            id: 1, type: 'columns',
            columns: [{ id: 'c', blocks: [{ id: 10, type: 'button' }] }]
        });
        expect(s.findBlockById(10).type).toBe('button');
    });

    test('findBlockById — null если нет', () => {
        expect(s.findBlockById(999)).toBeNull();
    });
});


// ─────────────────────────────────────────────────────────────────────────────
// 4. AppState — мультивыбор
// ─────────────────────────────────────────────────────────────────────────────

describe('AppState — мультивыбор', () => {
    let s;
    beforeEach(() => { s = makeAppState(); });

    test('toggleMultiSelect — добавляет и снимает', () => {
        s.toggleMultiSelect(5);
        expect(s.multiSelectedBlockIds.has(5)).toBe(true);
        s.toggleMultiSelect(5);
        expect(s.multiSelectedBlockIds.has(5)).toBe(false);
    });

    test('toggleMultiSelect — устанавливает anchor при первом', () => {
        s.toggleMultiSelect(3);
        expect(s.multiSelectAnchorId).toBe(3);
    });

    test('clearMultiSelection — очищает всё', () => {
        s.toggleMultiSelect(1); s.toggleMultiSelect(2);
        s.clearMultiSelection();
        expect(s.multiSelectedBlockIds.size).toBe(0);
        expect(s.multiSelectAnchorId).toBeNull();
    });

    test('rangeSelectTopLevel — диапазон', () => {
        [1,2,3,4,5].forEach(id => s.addBlock({ id }));
        s.multiSelectAnchorId = 2;
        s.rangeSelectTopLevel(4);
        expect([...s.multiSelectedBlockIds]).toEqual(expect.arrayContaining([2, 3, 4]));
        expect(s.multiSelectedBlockIds.has(1)).toBe(false);
        expect(s.multiSelectedBlockIds.has(5)).toBe(false);
    });

    test('rangeSelectTopLevel — обратный порядок', () => {
        [1,2,3,4,5].forEach(id => s.addBlock({ id }));
        s.multiSelectAnchorId = 4;
        s.rangeSelectTopLevel(2);
        expect([...s.multiSelectedBlockIds]).toEqual(expect.arrayContaining([2, 3, 4]));
    });
});


// ─────────────────────────────────────────────────────────────────────────────
// 5. AppState — Undo стек (admin)
// ─────────────────────────────────────────────────────────────────────────────

describe('AppState — Undo стек', () => {
    let s;
    beforeEach(() => { s = makeAppState(); });

    test('canUndo — false при пустом', () => expect(s.canUndo).toBe(false));
    test('canUndo — true после pushUndo', () => {
        s.pushUndo();
        expect(s.canUndo).toBe(true);
    });

    test('pushUndo — сохраняет снимок блоков', () => {
        s.blocks = [{ id: 1, type: 'text' }];
        s.pushUndo();
        const snap = JSON.parse(s.undoStack[0]);
        expect(snap.blocks[0].type).toBe('text');
    });

    test('undo — восстанавливает состояние', () => {
        s.blocks = [{ id: 1 }]; s.pushUndo();
        s.blocks = [{ id: 1 }, { id: 2 }];
        s.undo();
        expect(s.blocks).toHaveLength(1);
    });

    test('undo — false при пустом стеке', () => {
        expect(s.undo()).toBe(false);
    });

    test('undo — true при успехе', () => {
        s.pushUndo();
        expect(s.undo()).toBe(true);
    });

    test('undo — восстанавливает selectedBlockId', () => {
        s.selectedBlockId = 5; s.pushUndo();
        s.selectedBlockId = null;
        s.undo();
        expect(s.selectedBlockId).toBe(5);
    });

    test('стек ограничен UNDO_MAX=20', () => {
        for (let i = 0; i < 25; i++) { s.blocks = [{ id: i }]; s.pushUndo(); }
        expect(s.undoStack).toHaveLength(20);
    });

    test('несколько undo подряд', () => {
        s.blocks = []; s.pushUndo();
        s.blocks = [{ id: 1 }]; s.pushUndo();
        s.blocks = [{ id: 1 }, { id: 2 }]; s.pushUndo();
        s.blocks = [{ id: 1 }, { id: 2 }, { id: 3 }];
        s.undo(); expect(s.blocks).toHaveLength(2);
        s.undo(); expect(s.blocks).toHaveLength(1);
        s.undo(); expect(s.blocks).toHaveLength(0);
    });

    test('undo не мутирует снимок — изменение после pushUndo не затрагивает стек', () => {
        s.blocks = [{ id: 1, type: 'text' }];
        s.pushUndo();
        s.blocks.push({ id: 2 });
        s.undo();
        expect(s.blocks.find(b => b.id === 2)).toBeUndefined();
    });
});


// ─────────────────────────────────────────────────────────────────────────────
// 6. User Undo стек
// ─────────────────────────────────────────────────────────────────────────────

describe('User Undo стек', () => {
    let state;
    beforeEach(() => {
        state = { blocks: [], selectedBlockId: null, undoStack: [], isDirty: false };
    });

    function push(st) {
        st.undoStack.push(JSON.stringify({ blocks: st.blocks, selectedBlockId: st.selectedBlockId }));
        if (st.undoStack.length > 20) st.undoStack.shift();
    }
    function undo(st) {
        if (!st.undoStack || st.undoStack.length === 0) return false;
        const prev = JSON.parse(st.undoStack.pop());
        st.blocks = prev.blocks || [];
        st.selectedBlockId = prev.selectedBlockId ?? null;
        st.isDirty = true;
        return true;
    }

    test('push — сохраняет снимок', () => { push(state); expect(state.undoStack).toHaveLength(1); });
    test('undo — восстанавливает блоки', () => {
        state.blocks = [{ id: 1 }]; push(state);
        state.blocks = [{ id: 1 }, { id: 2 }];
        undo(state);
        expect(state.blocks).toHaveLength(1);
    });
    test('undo — false при пустом', () => expect(undo(state)).toBe(false));
    test('undo — isDirty = true', () => { push(state); undo(state); expect(state.isDirty).toBe(true); });
    test('стек ограничен 20', () => {
        for (let i = 0; i < 25; i++) { state.blocks = [{ id: i }]; push(state); }
        expect(state.undoStack).toHaveLength(20);
    });
});


// ─────────────────────────────────────────────────────────────────────────────
// 7. buttonAutoStyle.js
// ─────────────────────────────────────────────────────────────────────────────

describe('normalizeButtonText', () => {
    test('нижний регистр', () => expect(normalizeButtonText('МИФ')).toBe('миф'));
    test('обрезает пробелы', () => expect(normalizeButtonText('  Альпина  ')).toBe('альпина'));
    test('схлопывает внутренние пробелы', () => expect(normalizeButtonText('a  b')).toBe('a b'));
    test('null → пустая строка', () => expect(normalizeButtonText(null)).toBe(''));
    test('undefined → пустая строка', () => expect(normalizeButtonText(undefined)).toBe(''));
});

describe('getButtonAutoStyle', () => {
    test('МИФ — жёлтый + иконка', () => {
        const s = getButtonAutoStyle({ text: 'Миф' });
        expect(s.isMif).toBe(true);
        expect(s.color).toBe('#FFB608');
        expect(s.icon).toContain('Миф.png');
        expect(s.isAuto).toBe(true);
    });
    test('МИФ — регистронезависимо', () => {
        expect(getButtonAutoStyle({ text: 'МИФ' }).isMif).toBe(true);
    });
    test('Альпина — фиолетовый + иконка', () => {
        const s = getButtonAutoStyle({ text: 'Альпина' });
        expect(s.isAlpina).toBe(true);
        expect(s.color).toBe('#A078FF');
        expect(s.icon).toContain('Альпина.png');
    });
    test('обычная кнопка — цвет из settings', () => {
        const s = getButtonAutoStyle({ text: 'Кнопка', color: '#ff0000' });
        expect(s.isAuto).toBe(false);
        expect(s.color).toBe('#ff0000');
    });
    test('обычная кнопка — дефолтный цвет', () => {
        expect(getButtonAutoStyle({ text: 'Test' }).color).toBe('#f97316');
    });
    test('иконка из settings', () => {
        expect(getButtonAutoStyle({ text: 'Test', icon: 'c.png' }).icon).toBe('c.png');
    });
    test('пустые settings — не падает', () => {
        expect(() => getButtonAutoStyle({})).not.toThrow();
    });
    test('normalizedText в результате', () => {
        expect(getButtonAutoStyle({ text: '  Миф  ' }).normalizedText).toBe('миф');
    });
});


// ─────────────────────────────────────────────────────────────────────────────
// 8. sanitizeUrl
// ─────────────────────────────────────────────────────────────────────────────

describe('sanitizeUrl', () => {
    test('javascript: → #', () => expect(sanitizeUrl('javascript:alert(1)')).toBe('#'));
    test('data: → #', () => expect(sanitizeUrl('data:text/html,x')).toBe('#'));
    test('vbscript: → #', () => expect(sanitizeUrl('vbscript:msg()')).toBe('#'));
    test('JavaScript: → # (регистр)', () => expect(sanitizeUrl('JavaScript:void(0)')).toBe('#'));
    test('DATA: → # (регистр)', () => expect(sanitizeUrl('DATA:x')).toBe('#'));
    test('https пропускается', () => expect(sanitizeUrl('https://example.com')).toBe('https://example.com'));
    test('http пропускается', () => expect(sanitizeUrl('http://example.com')).toBe('http://example.com'));
    test('относительный путь', () => expect(sanitizeUrl('/path')).toBe('/path'));
    test('null → #', () => expect(sanitizeUrl(null)).toBe('#'));
    test('пустая строка → #', () => expect(sanitizeUrl('')).toBe('#'));
    test('кавычки экранируются', () => {
        expect(sanitizeUrl('https://x.com?q="t"')).toBe('https://x.com?q=&quot;t&quot;');
    });
    test('пробелы обрезаются', () => {
        expect(sanitizeUrl('  https://example.com  ')).toBe('https://example.com');
    });
});


// ─────────────────────────────────────────────────────────────────────────────
// 9. isPreset — логика пресетов
// ─────────────────────────────────────────────────────────────────────────────

describe('isPresetTemplate', () => {
    test('isPreset:true → пресет', () => expect(isPresetTemplate({ name: 'X', isPreset: true })).toBe(true));
    test('isPreset:false → не пресет', () => expect(isPresetTemplate({ name: 'X', isPreset: false })).toBe(false));
    test('без поля → не пресет', () => expect(isPresetTemplate({ name: 'X' })).toBe(false));
    test('имя с 🧩 → пресет (обратная совместимость)', () => {
        expect(isPresetTemplate({ name: '🧩 Старый' })).toBe(true);
    });
    test('обычное имя без 🧩 → не пресет', () => {
        expect(isPresetTemplate({ name: 'Анонс' })).toBe(false);
    });
    test('isPreset:true без эмодзи → пресет', () => {
        expect(isPresetTemplate({ name: 'Без эмодзи', isPreset: true })).toBe(true);
    });
    test('пустое имя → не пресет', () => expect(isPresetTemplate({ name: '' })).toBe(false));
});


// ─────────────────────────────────────────────────────────────────────────────
// 10. ConfigLoader — applyConfig
// ─────────────────────────────────────────────────────────────────────────────

describe('ConfigLoader — applyConfig', () => {
    test('BULLET_TYPES из config', () => {
        const cfg = applyConfig({ bullets: [{ id: 'x', src: 'x.png' }] });
        expect(cfg.BULLET_TYPES[0].id).toBe('x');
    });
    test('IMPORTANT_ICONS из icons.important', () => {
        const cfg = applyConfig({ icons: { important: [{ id: 'i1' }] } });
        expect(cfg.IMPORTANT_ICONS[0].id).toBe('i1');
    });
    test('EXPERT_BADGE_ICONS из expertBadges', () => {
        const cfg = applyConfig({ expertBadges: [{ id: 'e1' }] });
        expect(cfg.EXPERT_BADGE_ICONS[0].id).toBe('e1');
    });
    test('пустой config → все пустые массивы', () => {
        const cfg = applyConfig({});
        ['BULLET_TYPES','IMPORTANT_ICONS','EXPERT_BADGE_ICONS','BUTTON_ICONS',
         'DIVIDER_IMAGES','BANNERS'].forEach(k => expect(cfg[k]).toEqual([]));
    });
    test('BANNER_BACKGROUNDS/LOGOS/ICONS', () => {
        const cfg = applyConfig({
            bannerBackgrounds: [{}], bannerLogos: [{}], bannerIcons: [{}]
        });
        expect(cfg.BANNER_BACKGROUNDS).toHaveLength(1);
        expect(cfg.BANNER_LOGOS).toHaveLength(1);
        expect(cfg.BANNER_ICONS).toHaveLength(1);
    });
    test('config перезаписывает fallback', () => {
        const cfg = applyConfig({ bullets: [{ id: 'new', src: 'new.png' }] });
        expect(cfg.BULLET_TYPES.find(b => b.id === 'circle')).toBeUndefined();
        expect(cfg.BULLET_TYPES[0].id).toBe('new');
    });
});


// ─────────────────────────────────────────────────────────────────────────────
// 11. Fallback-данные definitions.js
// ─────────────────────────────────────────────────────────────────────────────

describe('Fallback-данные definitions.js', () => {
    test('BULLET_TYPES — 4 элемента', () => expect(FALLBACK_BULLET_TYPES).toHaveLength(4));
    test('BULLET_TYPES[0].id = circle', () => expect(FALLBACK_BULLET_TYPES[0].id).toBe('circle'));
    test('BULLET_TYPES — все имеют id и src', () => {
        FALLBACK_BULLET_TYPES.forEach(b => {
            expect(b.id).toBeTruthy();
            expect(b.src).toBeTruthy();
        });
    });
    test('IMPORTANT_ICONS — не пустой', () => expect(FALLBACK_IMPORTANT_ICONS.length).toBeGreaterThan(0));
    test('EXPERT_BADGE_ICONS — не пустой', () => expect(FALLBACK_EXPERT_BADGE_ICONS.length).toBeGreaterThan(0));
    test('BUTTON_ICONS — содержит элемент none с пустым src', () => {
        const none = FALLBACK_BUTTON_ICONS.find(b => b.id === 'none');
        expect(none).toBeDefined();
        expect(none.src).toBe('');
    });
    test('BUTTON_ICONS — элемент download имеет src', () => {
        const dl = FALLBACK_BUTTON_ICONS.find(b => b.id === 'download');
        expect(dl.src).toBeTruthy();
    });
});


// ─────────────────────────────────────────────────────────────────────────────
// 12. blockPreview — resolveBulletSrc
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveBulletSrc — выбор источника буллета', () => {
    test('bulletCustom имеет приоритет', () => {
        expect(resolveBulletSrc({ bulletCustom: 'c.png', bulletType: 'circle' }, FALLBACK_BULLET_TYPES))
            .toBe('c.png');
    });
    test('находит по bulletType', () => {
        expect(resolveBulletSrc({ bulletCustom: '', bulletType: 'circle2' }, FALLBACK_BULLET_TYPES))
            .toBe('bullets/Буллет 2.png');
    });
    test('fallback на [0] если bulletType пустой', () => {
        expect(resolveBulletSrc({ bulletCustom: '', bulletType: '' }, FALLBACK_BULLET_TYPES))
            .toBe('bullets/Буллет.png');
    });
    test('fallback на [0] если bulletType не найден', () => {
        expect(resolveBulletSrc({ bulletCustom: '', bulletType: 'unknown' }, FALLBACK_BULLET_TYPES))
            .toBe('bullets/Буллет.png');
    });
    test('пустой BULLET_TYPES → пустая строка', () => {
        expect(resolveBulletSrc({ bulletCustom: '', bulletType: 'circle' }, [])).toBe('');
    });
    test('не падает с пустыми settings', () => {
        expect(() => resolveBulletSrc({}, FALLBACK_BULLET_TYPES)).not.toThrow();
    });
});


// ─────────────────────────────────────────────────────────────────────────────
// 13. getDefaultSettings
// ─────────────────────────────────────────────────────────────────────────────

describe('getDefaultSettings', () => {
    test('text — fontSize=14, align=left', () => {
        const s = getDefaultSettings('text');
        expect(s.fontSize).toBe(14);
        expect(s.align).toBe('left');
        expect(s.fontFamily).toBe('rt-light');
    });
    test('list — bulletType=circle, 3 пункта, listStyle=bullets', () => {
        const s = getDefaultSettings('list');
        expect(s.bulletType).toBe('circle');
        expect(s.items).toHaveLength(3);
        expect(s.listStyle).toBe('bullets');
    });
    test('button — url и text заданы', () => {
        const s = getDefaultSettings('button');
        expect(s.url).toBe('https://example.com');
        expect(s.icon).toBe('');
    });
    test('expert — badgeIcon пустой, renderedExpert null', () => {
        const s = getDefaultSettings('expert');
        expect(s.badgeIcon).toBe('');
        expect(s.renderedExpert).toBeNull();
    });
    test('important — icon пустой, renderedIcon null', () => {
        const s = getDefaultSettings('important');
        expect(s.icon).toBe('');
        expect(s.renderedIcon).toBeNull();
    });
    test('spacer — height=20', () => {
        expect(getDefaultSettings('spacer').height).toBe(20);
    });
    test('неизвестный тип → {}', () => {
        expect(getDefaultSettings('unknown_xyz')).toEqual({});
    });
    test('возвращает новый объект (нет мутации)', () => {
        const a = getDefaultSettings('text');
        const b = getDefaultSettings('text');
        a.fontSize = 999;
        expect(b.fontSize).toBe(14);
    });
    test('image — borderRadiusMode=all, borderRadiusAll=0', () => {
        const s = getDefaultSettings('image');
        expect(s.borderRadiusMode).toBe('all');
        expect(s.borderRadiusAll).toBe(0);
    });
});


// ─────────────────────────────────────────────────────────────────────────────
// 14. deleteBlock — операции
// ─────────────────────────────────────────────────────────────────────────────

describe('deleteBlock — операции удаления', () => {
    let state;

    function deleteBlock(st, blockId) {
        st.blocks = st.blocks.filter(b => b.id !== blockId);
        if (st.multiSelectedBlockIds) st.multiSelectedBlockIds.delete(blockId);
        if (st.multiSelectAnchorId === blockId) st.multiSelectAnchorId = null;
        if (st.selectedBlockId === blockId) st.selectedBlockId = null;
    }

    beforeEach(() => {
        state = {
            blocks: [{ id: 1 }, { id: 2 }, { id: 3 }],
            selectedBlockId: 2,
            multiSelectedBlockIds: new Set([1, 2]),
            multiSelectAnchorId: 1
        };
    });

    test('удаляет из массива', () => {
        deleteBlock(state, 2);
        expect(state.blocks.map(b => b.id)).toEqual([1, 3]);
    });
    test('сбрасывает selectedBlockId при удалении выделенного', () => {
        deleteBlock(state, 2);
        expect(state.selectedBlockId).toBeNull();
    });
    test('не сбрасывает selection при удалении другого', () => {
        deleteBlock(state, 3);
        expect(state.selectedBlockId).toBe(2);
    });
    test('убирает из мультивыбора', () => {
        deleteBlock(state, 2);
        expect(state.multiSelectedBlockIds.has(2)).toBe(false);
    });
    test('сбрасывает anchor при удалении якоря', () => {
        deleteBlock(state, 1);
        expect(state.multiSelectAnchorId).toBeNull();
    });
    test('не меняет anchor при удалении другого', () => {
        deleteBlock(state, 3);
        expect(state.multiSelectAnchorId).toBe(1);
    });
    test('не падает при несуществующем id', () => {
        expect(() => deleteBlock(state, 999)).not.toThrow();
        expect(state.blocks).toHaveLength(3);
    });
});


// ─────────────────────────────────────────────────────────────────────────────
// 15. Toast — валидация параметров
// ─────────────────────────────────────────────────────────────────────────────

describe('Toast — валидация параметров', () => {
    function validateToastParams(message, type) {
        if (!message || !String(message).trim()) return null;
        const VALID = ['success', 'error', 'info', 'warning'];
        return { message: String(message).trim(), type: VALID.includes(type) ? type : 'info' };
    }

    test('пустое → null', () => {
        expect(validateToastParams('', 'info')).toBeNull();
        expect(validateToastParams('   ', 'info')).toBeNull();
        expect(validateToastParams(null, 'info')).toBeNull();
    });
    test('неизвестный тип → info', () => {
        expect(validateToastParams('msg', 'unknown').type).toBe('info');
    });
    test('известные типы сохраняются', () => {
        ['success','error','info','warning'].forEach(t => {
            expect(validateToastParams('msg', t).type).toBe(t);
        });
    });
    test('message обрезается', () => {
        expect(validateToastParams('  Привет  ', 'info').message).toBe('Привет');
    });
    test('число → строка', () => {
        expect(validateToastParams(42, 'info').message).toBe('42');
    });
});


// ─────────────────────────────────────────────────────────────────────────────
// 16. Интеграционные сценарии
// ─────────────────────────────────────────────────────────────────────────────

describe('Интеграция — добавить блок и undo', () => {
    test('добавить → undo → блок исчезает', () => {
        const s = makeAppState();
        s.pushUndo();
        s.addBlock({ id: 1, type: 'text' });
        s.undo();
        expect(s.blocks).toHaveLength(0);
    });

    test('добавить два → undo → остался один', () => {
        const s = makeAppState();
        s.addBlock({ id: 1 }); s.pushUndo();
        s.addBlock({ id: 2 });
        s.undo();
        expect(s.blocks).toHaveLength(1);
        expect(s.blocks[0].id).toBe(1);
    });
});

describe('Интеграция — findBlockDeep + removeBlock', () => {
    test('найти → удалить → не найти', () => {
        const s = makeAppState();
        s.addBlock({ id: 10, type: 'image' });
        expect(findBlockDeep(s.blocks, 10)).not.toBeNull();
        s.removeBlock(10);
        expect(findBlockDeep(s.blocks, 10)).toBeNull();
    });
});

describe('Интеграция — isPreset фильтрация', () => {
    const templates = [
        { name: 'Анонс',        isPreset: false },
        { name: 'Приглашение',  isPreset: false },
        { name: 'Базовый',      isPreset: true  },
        { name: '🧩 Старый'                      },
    ];

    test('только пресеты', () => expect(templates.filter(isPresetTemplate)).toHaveLength(2));
    test('только пользовательские', () => {
        const user = templates.filter(t => !isPresetTemplate(t));
        expect(user.map(t => t.name)).toEqual(['Анонс', 'Приглашение']);
    });
});

describe('Интеграция — resolveBulletSrc с fallback', () => {
    test('нет bulletType → первый из массива', () => {
        const s = { bulletCustom: null, bulletType: null };
        const src = s.bulletCustom ||
            ((FALLBACK_BULLET_TYPES.find(b => b.id === s.bulletType) || FALLBACK_BULLET_TYPES[0])?.src);
        expect(src).toBe('bullets/Буллет.png');
    });
    test('пустой массив — не падает', () => {
        expect(() => resolveBulletSrc({ bulletCustom: '', bulletType: 'x' }, [])).not.toThrow();
    });
});

describe('Интеграция — getButtonAutoStyle + escapeHtml', () => {
    test('текст кнопки экранируется корректно', () => {
        const text = '<script>alert(1)</script>';
        const escaped = escapeHtml(text);
        expect(escaped).not.toContain('<script>');
        const s = getButtonAutoStyle({ text });
        expect(s.isMif).toBe(false); // не миф
    });
});

describe('Интеграция — config → bullet fallback → render', () => {
    test('при недоступном config fallback работает', () => {
        // config не загрузился — используются FALLBACK данные
        const BULLETS = FALLBACK_BULLET_TYPES;
        const s = { bulletCustom: '', bulletType: 'circle3' };
        const src = resolveBulletSrc(s, BULLETS);
        expect(src).toBe('bullets/Буллет 3.png');
    });

    test('после загрузки config данные из сети', () => {
        const cfg = applyConfig({ bullets: [{ id: 'b1', src: 'net/bullet.png' }] });
        const s = { bulletCustom: '', bulletType: 'b1' };
        const src = resolveBulletSrc(s, cfg.BULLET_TYPES);
        expect(src).toBe('net/bullet.png');
    });
});
