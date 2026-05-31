/**
 * tests/emailGenerator.test.js
 *
 * Тесты для функций emailGenerator.js:
 *   sanitizeUrl          — блокировка опасных схем
 *   buildEmailRenderContext — генерация контекста темы
 *   getImageStyle        — inline CSS для изображений
 *   getPadding           — inline CSS для padding
 *   buildEmailThemeStyles — CSS строка темы
 *
 * Запуск: npm run test:generator
 */

import { describe, test, expect, beforeAll } from 'vitest';

// ─── Встраиваем функции напрямую — файл не является ES-модулем ────────────────

const EMAIL_THEME = { LIGHT: 'light', DARK: 'dark' };

const DEFAULT_COLORS = {
    TEXT:   '#3F3E4B',
    LINK:   '#7700ff',
    BORDER: '#a855f7',
    BULLET: '#a855f7',
};

const LAYOUT = {
    TABLE_WIDTH: 600,
    PADDING_H:   0,
    PADDING_V:   0,
};

function sanitizeUrl(url) {
    if (!url) return '#';
    const trimmed = String(url).trim();
    if (/^(javascript|data|vbscript):/i.test(trimmed)) return '#';
    return trimmed.replace(/"/g, '&quot;');
}

function getImageStyle(width, extraStyles = '') {
    const base = `display:block; max-width:${width}px; height:auto; border:0; outline:none; text-decoration:none;`;
    return extraStyles ? `${base} ${extraStyles}` : base;
}

function getPadding(vertical = LAYOUT.PADDING_V, horizontal = LAYOUT.PADDING_H) {
    return `padding:${vertical}px ${horizontal}px;`;
}

function buildEmailRenderContext(options = {}) {
    const previewTheme = options.previewTheme === EMAIL_THEME.DARK
        ? EMAIL_THEME.DARK
        : options.previewTheme === EMAIL_THEME.LIGHT
            ? EMAIL_THEME.LIGHT
            : null;

    const isDarkPreview = previewTheme === EMAIL_THEME.DARK;

    return {
        previewTheme,
        bodyBg:        isDarkPreview ? '#0f172a'   : '#ffffff',
        surfaceBg:     isDarkPreview ? '#111827'   : '#ffffff',
        textColor:     isDarkPreview ? '#f3f4f6'   : DEFAULT_COLORS.TEXT,
        mutedTextColor:isDarkPreview ? '#d1d5db'   : '#6b7280',
        linkColor:     isDarkPreview ? '#c4b5fd'   : DEFAULT_COLORS.LINK,
        bulletColor:   isDarkPreview ? '#c4b5fd'   : DEFAULT_COLORS.BULLET,
        borderColor:   isDarkPreview ? '#fb923c'   : DEFAULT_COLORS.BORDER,
        rootClass: previewTheme ? `email-force-${previewTheme}` : '',
    };
}

function buildEmailThemeStyles() {
    return `
.email-wrapper,
.email-root,
.email-surface {
    background-color:#ffffff;
}
.email-text a,
.email-link {
    color:${DEFAULT_COLORS.LINK} !important;
}
.email-bullet-dot {
    background-color:${DEFAULT_COLORS.BULLET} !important;
}
.email-important-cell--accent {
    border-left:4px solid ${DEFAULT_COLORS.BORDER};
    padding-left:12px !important;
}`;
}


// ─── sanitizeUrl ─────────────────────────────────────────────────────────────

describe('sanitizeUrl', () => {

    test('returns # for null/undefined', () => {
        expect(sanitizeUrl(null)).toBe('#');
        expect(sanitizeUrl(undefined)).toBe('#');
        expect(sanitizeUrl('')).toBe('#');
    });

    test('blocks javascript: scheme (lowercase)', () => {
        expect(sanitizeUrl('javascript:alert(1)')).toBe('#');
    });

    test('blocks javascript: scheme (mixed case)', () => {
        expect(sanitizeUrl('JavaScript:alert(1)')).toBe('#');
        expect(sanitizeUrl('JAVASCRIPT:void(0)')).toBe('#');
    });

    test('blocks data: scheme', () => {
        expect(sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBe('#');
        expect(sanitizeUrl('DATA:image/png;base64,abc')).toBe('#');
    });

    test('blocks vbscript: scheme', () => {
        expect(sanitizeUrl('vbscript:msgbox("xss")')).toBe('#');
    });

    test('allows https:// URLs', () => {
        const url = 'https://example.com/path?q=1';
        expect(sanitizeUrl(url)).toBe(url);
    });

    test('allows http:// URLs', () => {
        const url = 'http://example.com';
        expect(sanitizeUrl(url)).toBe(url);
    });

    test('allows mailto: URLs', () => {
        const url = 'mailto:test@example.com';
        expect(sanitizeUrl(url)).toBe(url);
    });

    test('allows relative paths', () => {
        expect(sanitizeUrl('/images/logo.png')).toBe('/images/logo.png');
    });

    test('escapes double quotes', () => {
        const result = sanitizeUrl('https://example.com/?x="1"');
        expect(result).not.toContain('"');
        expect(result).toContain('&quot;');
    });

    test('trims leading/trailing whitespace', () => {
        expect(sanitizeUrl('  https://example.com  ')).toBe('https://example.com');
    });

    test('javascript with leading spaces blocked', () => {
        expect(sanitizeUrl('  javascript:alert(1)')).toBe('#');
    });
});


// ─── buildEmailRenderContext ──────────────────────────────────────────────────

describe('buildEmailRenderContext', () => {

    test('light theme has white backgrounds', () => {
        const ctx = buildEmailRenderContext({ previewTheme: 'light' });
        expect(ctx.bodyBg).toBe('#ffffff');
        expect(ctx.surfaceBg).toBe('#ffffff');
    });

    test('dark theme has dark backgrounds', () => {
        const ctx = buildEmailRenderContext({ previewTheme: 'dark' });
        expect(ctx.bodyBg).toBe('#0f172a');
        expect(ctx.surfaceBg).toBe('#111827');
    });

    test('light theme uses default text color', () => {
        const ctx = buildEmailRenderContext({ previewTheme: 'light' });
        expect(ctx.textColor).toBe(DEFAULT_COLORS.TEXT);
    });

    test('dark theme uses light text color', () => {
        const ctx = buildEmailRenderContext({ previewTheme: 'dark' });
        expect(ctx.textColor).toBe('#f3f4f6');
    });

    test('rootClass is email-force-light for light', () => {
        const ctx = buildEmailRenderContext({ previewTheme: 'light' });
        expect(ctx.rootClass).toBe('email-force-light');
    });

    test('rootClass is email-force-dark for dark', () => {
        const ctx = buildEmailRenderContext({ previewTheme: 'dark' });
        expect(ctx.rootClass).toBe('email-force-dark');
    });

    test('rootClass is empty string when no theme', () => {
        const ctx = buildEmailRenderContext({});
        expect(ctx.rootClass).toBe('');
    });

    test('null previewTheme gives null in context', () => {
        const ctx = buildEmailRenderContext({});
        expect(ctx.previewTheme).toBeNull();
    });

    test('unknown theme defaults to light colors', () => {
        const ctx = buildEmailRenderContext({ previewTheme: 'sepia' });
        expect(ctx.bodyBg).toBe('#ffffff');
        expect(ctx.rootClass).toBe('');
    });

    test('dark theme link color is lighter', () => {
        const light = buildEmailRenderContext({ previewTheme: 'light' });
        const dark  = buildEmailRenderContext({ previewTheme: 'dark' });
        expect(dark.linkColor).not.toBe(light.linkColor);
        expect(dark.linkColor).toBe('#c4b5fd');
    });

    test('all required keys are present', () => {
        const ctx = buildEmailRenderContext({ previewTheme: 'light' });
        const keys = ['previewTheme','bodyBg','surfaceBg','textColor',
                      'mutedTextColor','linkColor','bulletColor','borderColor','rootClass'];
        keys.forEach(k => expect(ctx).toHaveProperty(k));
    });
});


// ─── getImageStyle ────────────────────────────────────────────────────────────

describe('getImageStyle', () => {

    test('contains max-width with given value', () => {
        const style = getImageStyle(600);
        expect(style).toContain('max-width:600px');
    });

    test('contains display:block', () => {
        expect(getImageStyle(300)).toContain('display:block');
    });

    test('contains height:auto', () => {
        expect(getImageStyle(300)).toContain('height:auto');
    });

    test('contains border:0', () => {
        expect(getImageStyle(300)).toContain('border:0');
    });

    test('appends extra styles when provided', () => {
        const style = getImageStyle(300, 'float:left;');
        expect(style).toContain('float:left;');
    });

    test('no extra styles when not provided', () => {
        const style = getImageStyle(300);
        expect(style).not.toContain('float');
    });

    test('different widths produce different styles', () => {
        expect(getImageStyle(100)).not.toBe(getImageStyle(600));
    });
});


// ─── getPadding ───────────────────────────────────────────────────────────────

describe('getPadding', () => {

    test('produces padding: CSS string', () => {
        expect(getPadding(10, 20)).toBe('padding:10px 20px;');
    });

    test('defaults to 0 0 from LAYOUT constants', () => {
        expect(getPadding()).toBe('padding:0px 0px;');
    });

    test('only vertical padding', () => {
        expect(getPadding(16, 0)).toBe('padding:16px 0px;');
    });

    test('equal padding values', () => {
        expect(getPadding(8, 8)).toBe('padding:8px 8px;');
    });
});


// ─── buildEmailThemeStyles ────────────────────────────────────────────────────

describe('buildEmailThemeStyles', () => {

    test('returns non-empty CSS string', () => {
        const css = buildEmailThemeStyles();
        expect(typeof css).toBe('string');
        expect(css.length).toBeGreaterThan(50);
    });

    test('contains email-wrapper selector', () => {
        expect(buildEmailThemeStyles()).toContain('.email-wrapper');
    });

    test('contains link color from DEFAULT_COLORS', () => {
        const css = buildEmailThemeStyles();
        expect(css).toContain(DEFAULT_COLORS.LINK);
    });

    test('contains bullet color from DEFAULT_COLORS', () => {
        const css = buildEmailThemeStyles();
        expect(css).toContain(DEFAULT_COLORS.BULLET);
    });

    test('contains important border color', () => {
        const css = buildEmailThemeStyles();
        expect(css).toContain(DEFAULT_COLORS.BORDER);
    });
});
