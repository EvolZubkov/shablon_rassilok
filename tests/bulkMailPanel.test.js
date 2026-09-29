/**
 * tests/bulkMailPanel.test.js
 *
 * Тесты для логики bulk-mail-panel.js и userApp.js — без DOM-зависимостей.
 *
 * Покрывает:
 *   escHtml()                 — HTML-экранирование
 *   detectPlaceholders логика — поиск {{X}} в тексте
 *   autoDetectMapping         — автосопоставление заголовков
 *   walkAndSubstitute логика  — замена плейсхолдеров в тексте
 *   recalcSummary логика      — подсчёт строк для отправки
 *   UserAppState              — инициализация и мутации состояния
 *   isDirty флаг              — отслеживание изменений
 *   undo/redo стек            — история изменений
 *
 * Запуск: npm run test:bulk
 */

import { describe, test, expect, beforeEach } from 'vitest';


// ─── escHtml ─────────────────────────────────────────────────────────────────
// Извлечена из bulk-mail-panel.js: const escHtml = s => ...

function escHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

describe('escHtml', () => {
    test('escapes ampersand', () => {
        expect(escHtml('A&B')).toBe('A&amp;B');
    });

    test('escapes less-than', () => {
        expect(escHtml('<script>')).toBe('&lt;script&gt;');
    });

    test('escapes greater-than', () => {
        expect(escHtml('a>b')).toBe('a&gt;b');
    });

    test('plain text unchanged', () => {
        expect(escHtml('Hello World')).toBe('Hello World');
    });

    test('coerces numbers to string', () => {
        expect(escHtml(42)).toBe('42');
    });

    test('coerces null to string', () => {
        expect(escHtml(null)).toBe('null');
    });

    test('multiple escapes in one string', () => {
        expect(escHtml('<a href="?x=1&y=2">link</a>')).toBe('&lt;a href="?x=1&amp;y=2"&gt;link&lt;/a&gt;');
    });
});


// ─── detectPlaceholders (чистая логика) ──────────────────────────────────────
// Извлечена из detectPlaceholders: find {{X}} patterns in text

function extractPlaceholders(text) {
    return [...new Set([...text.matchAll(/\{\{([^}]+)\}\}/g)].map(m => m[0]))];
}

describe('extractPlaceholders', () => {
    test('finds single placeholder', () => {
        expect(extractPlaceholders('Привет, {{ФИО}}!')).toEqual(['{{ФИО}}']);
    });

    test('finds multiple placeholders', () => {
        const phs = extractPlaceholders('{{ФИО}}, {{Должность}}, {{Email}}');
        expect(phs).toContain('{{ФИО}}');
        expect(phs).toContain('{{Должность}}');
        expect(phs).toContain('{{Email}}');
        expect(phs).toHaveLength(3);
    });

    test('deduplicates repeated placeholders', () => {
        const phs = extractPlaceholders('{{ФИО}} и снова {{ФИО}}');
        expect(phs).toHaveLength(1);
        expect(phs[0]).toBe('{{ФИО}}');
    });

    test('returns empty for no placeholders', () => {
        expect(extractPlaceholders('Обычный текст')).toEqual([]);
    });

    test('handles nested HTML with placeholders', () => {
        const html = '<div><p>Уважаемый {{ФИО}},</p><span>{{Должность}}</span></div>';
        const phs = extractPlaceholders(html);
        expect(phs).toContain('{{ФИО}}');
        expect(phs).toContain('{{Должность}}');
    });

    test('ignores single braces', () => {
        expect(extractPlaceholders('{ not a placeholder }')).toEqual([]);
    });

    test('handles numbers in placeholder names', () => {
        expect(extractPlaceholders('{{Field1}}')).toEqual(['{{Field1}}']);
    });
});


// ─── autoDetectMapping (логика автосопоставления) ────────────────────────────

function autoDetectMapping(placeholders, headers) {
    const mapping = {};
    for (const ph of placeholders) {
        const name = ph.slice(2, -2);
        if (headers.includes(name)) {
            mapping[ph] = name;
        }
    }
    return mapping;
}

describe('autoDetectMapping', () => {
    test('maps exact matches', () => {
        const phs = ['{{ФИО}}', '{{Email}}'];
        const headers = ['ФИО', 'Email', 'Телефон'];
        const mapping = autoDetectMapping(phs, headers);
        expect(mapping['{{ФИО}}']).toBe('ФИО');
        expect(mapping['{{Email}}']).toBe('Email');
    });

    test('unmapped when no header match', () => {
        const mapping = autoDetectMapping(['{{НесуществующееПоле}}'], ['ФИО', 'Email']);
        expect(mapping['{{НесуществующееПоле}}']).toBeUndefined();
    });

    test('empty placeholders gives empty mapping', () => {
        expect(autoDetectMapping([], ['ФИО', 'Email'])).toEqual({});
    });

    test('empty headers gives empty mapping', () => {
        expect(autoDetectMapping(['{{ФИО}}'], [])).toEqual({});
    });

    test('partial match — some mapped, some not', () => {
        const phs = ['{{ФИО}}', '{{Должность}}'];
        const mapping = autoDetectMapping(phs, ['ФИО']);
        expect(mapping['{{ФИО}}']).toBe('ФИО');
        expect(mapping['{{Должность}}']).toBeUndefined();
    });
});


// ─── walkAndSubstitute (чистая логика на строках) ─────────────────────────────

function substituteText(text, subMap) {
    let result = text;
    let changed = false;
    for (const [ph, val] of Object.entries(subMap)) {
        if (result.includes(ph)) {
            result = result.split(ph).join(val || `[${ph.slice(2, -2)} — не задано]`);
            changed = true;
        }
    }
    return { text: result, changed };
}

describe('substituteText (walkAndSubstitute logic)', () => {
    test('replaces placeholder with value', () => {
        const { text } = substituteText('Привет, {{ФИО}}!', { '{{ФИО}}': 'Иван' });
        expect(text).toBe('Привет, Иван!');
    });

    test('placeholder not in text — unchanged', () => {
        const { text, changed } = substituteText('Нет плейсхолдеров', { '{{ФИО}}': 'Иван' });
        expect(text).toBe('Нет плейсхолдеров');
        expect(changed).toBe(false);
    });

    test('empty value shows "не задано" label', () => {
        const { text } = substituteText('{{ФИО}}', { '{{ФИО}}': '' });
        expect(text).toContain('не задано');
        expect(text).toContain('ФИО');
    });

    test('multiple occurrences all replaced', () => {
        const { text } = substituteText('{{X}} и {{X}}', { '{{X}}': 'foo' });
        expect(text).toBe('foo и foo');
    });

    test('multiple different placeholders', () => {
        const { text } = substituteText('{{A}} {{B}}', { '{{A}}': 'Hello', '{{B}}': 'World' });
        expect(text).toBe('Hello World');
    });

    test('changed flag is true when substitution happened', () => {
        const { changed } = substituteText('{{ФИО}}', { '{{ФИО}}': 'Иван' });
        expect(changed).toBe(true);
    });

    test('changed flag is false when no match', () => {
        const { changed } = substituteText('нет', { '{{ФИО}}': 'Иван' });
        expect(changed).toBe(false);
    });
});


// ─── recalcSummary (логика подсчёта строк для отправки) ──────────────────────

function recalcSendCount(rows, emailColumn, skipNoEmail) {
    if (!skipNoEmail) return rows.length;
    return rows.filter(row => Boolean(row[emailColumn])).length;
}

describe('recalcSendCount', () => {
    const rows = [
        { ФИО: 'Иван',  Email: 'ivan@test.ru' },
        { ФИО: 'Мария', Email: '' },
        { ФИО: 'Петр',  Email: 'petr@test.ru' },
        { ФИО: 'Анна',  Email: null },
    ];

    test('all rows when skipNoEmail=false', () => {
        expect(recalcSendCount(rows, 'Email', false)).toBe(4);
    });

    test('only rows with email when skipNoEmail=true', () => {
        expect(recalcSendCount(rows, 'Email', true)).toBe(2);
    });

    test('empty rows gives 0', () => {
        expect(recalcSendCount([], 'Email', true)).toBe(0);
    });

    test('all have email — count equals rows.length', () => {
        const full = [{ Email: 'a@b.ru' }, { Email: 'c@d.ru' }];
        expect(recalcSendCount(full, 'Email', true)).toBe(2);
    });
});


// ─── UserAppState (логика состояния юзер-приложения) ─────────────────────────

function makeUserAppState() {
    return {
        blocks:         [],
        originalBlocks: null,
        isDirty:        false,
        undoStack:      [],
        UNDO_MAX:       20,

        setBlocks(blocks) {
            this.originalBlocks = JSON.parse(JSON.stringify(blocks));
            this.blocks = JSON.parse(JSON.stringify(blocks));
            this.isDirty = false;
            this.undoStack = [];
        },

        pushUndo() {
            if (this.undoStack.length >= this.UNDO_MAX) {
                this.undoStack.shift();
            }
            this.undoStack.push(JSON.parse(JSON.stringify(this.blocks)));
            this.isDirty = true;
        },

        undo() {
            if (!this.undoStack.length) return false;
            this.blocks = this.undoStack.pop();
            this.isDirty = this.undoStack.length > 0 ||
                JSON.stringify(this.blocks) !== JSON.stringify(this.originalBlocks);
            return true;
        },

        reset() {
            this.blocks = this.originalBlocks
                ? JSON.parse(JSON.stringify(this.originalBlocks))
                : [];
            this.isDirty = false;
            this.undoStack = [];
        },
    };
}

describe('UserAppState', () => {
    let state;
    beforeEach(() => { state = makeUserAppState(); });

    test('initial state is clean', () => {
        expect(state.blocks).toEqual([]);
        expect(state.isDirty).toBe(false);
        expect(state.undoStack).toHaveLength(0);
    });

    test('setBlocks loads template and resets dirty', () => {
        state.setBlocks([{ id: 1, type: 'text' }]);
        expect(state.blocks).toHaveLength(1);
        expect(state.isDirty).toBe(false);
        expect(state.undoStack).toHaveLength(0);
    });

    test('pushUndo marks isDirty', () => {
        state.setBlocks([{ id: 1, type: 'text' }]);
        state.blocks.push({ id: 2, type: 'image' });
        state.pushUndo();
        expect(state.isDirty).toBe(true);
    });

    test('undo restores previous state', () => {
        state.setBlocks([{ id: 1, type: 'text' }]);
        state.pushUndo();
        state.blocks.push({ id: 2, type: 'image' });
        state.pushUndo();
        state.undo();
        expect(state.blocks).toHaveLength(2);
    });

    test('undo returns false on empty stack', () => {
        expect(state.undo()).toBe(false);
    });

    test('undo stack capped at UNDO_MAX', () => {
        state.setBlocks([]);
        for (let i = 0; i < 25; i++) state.pushUndo();
        expect(state.undoStack.length).toBe(state.UNDO_MAX);
    });

    test('reset restores original blocks', () => {
        state.setBlocks([{ id: 1, type: 'text' }]);
        state.blocks = [];
        state.pushUndo();
        state.reset();
        expect(state.blocks).toHaveLength(1);
        expect(state.isDirty).toBe(false);
    });

    test('setBlocks makes deep copy — mutations do not affect original', () => {
        const original = [{ id: 1, type: 'text', settings: { color: '#fff' } }];
        state.setBlocks(original);
        state.blocks[0].settings.color = '#000';
        expect(state.originalBlocks[0].settings.color).toBe('#fff');
    });

    test('isDirty false after reset', () => {
        state.setBlocks([{ id: 1 }]);
        state.pushUndo();
        expect(state.isDirty).toBe(true);
        state.reset();
        expect(state.isDirty).toBe(false);
    });
});


// ─── updateMappingHint (количество несопоставленных) ─────────────────────────

function countUnmapped(placeholders, mapping) {
    return placeholders.filter(ph => !mapping[ph]).length;
}

describe('countUnmapped', () => {
    test('zero when all mapped', () => {
        expect(countUnmapped(['{{ФИО}}', '{{Email}}'], { '{{ФИО}}': 'ФИО', '{{Email}}': 'Email' })).toBe(0);
    });

    test('counts unmapped placeholders', () => {
        expect(countUnmapped(['{{ФИО}}', '{{Email}}', '{{Тел}}'], { '{{ФИО}}': 'ФИО' })).toBe(2);
    });

    test('all unmapped when mapping empty', () => {
        expect(countUnmapped(['{{ФИО}}', '{{Email}}'], {})).toBe(2);
    });

    test('empty placeholders gives 0', () => {
        expect(countUnmapped([], {})).toBe(0);
    });
});
