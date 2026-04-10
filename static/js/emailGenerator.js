// emailGenerator.js - Генерация финального HTML письма

// ===== КОНСТАНТЫ =====
const LAYOUT = {
    TABLE_WIDTH: 600,
    PADDING_H: 0,
    PADDING_V: 0,
    ICON_SIZE: 60,
    DEFAULT_FONT_SIZE: 14,
    DEFAULT_LINE_HEIGHT: 1.15
};

const DEFAULT_COLORS = {
    TEXT: '#3F3E4B',
    LINK: '#7700ff',
    BORDER: '#a855f7',
    BULLET: '#a855f7'
};

const EMAIL_THEME = {
    LIGHT: 'light',
    DARK: 'dark',
};

const EMAIL_PREVIEW_THEME_STORAGE_KEY = 'email-builder-email-preview-theme';

let CURRENT_EMAIL_RENDER_CONTEXT = null;

const EmailPreviewTheme = {
    LIGHT: EMAIL_THEME.LIGHT,
    DARK: EMAIL_THEME.DARK,
    STORAGE_KEY: EMAIL_PREVIEW_THEME_STORAGE_KEY,

    get() {
        const saved = localStorage.getItem(this.STORAGE_KEY);
        return saved === this.DARK ? this.DARK : this.LIGHT;
    },

    set(theme) {
        const next = theme === this.DARK ? this.DARK : this.LIGHT;
        localStorage.setItem(this.STORAGE_KEY, next);
        this.syncButtons();
        document.dispatchEvent(new CustomEvent('email-preview-theme-change', {
            detail: { theme: next },
        }));
    },

    toggle() {
        this.set(this.get() === this.DARK ? this.LIGHT : this.DARK);
    },

    getLabel(theme = this.get()) {
        return theme === this.DARK ? 'Письмо: Тёмная' : 'Письмо: Светлая';
    },

    mount(container) {
        if (!container || container.querySelector('.email-theme-toggle')) return;

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'email-theme-toggle';
        button.title = 'Переключить вид письма в предпросмотре';
        button.addEventListener('click', () => {
            window.jslog?.('log', '[THEME-TOGGLE] click fired');
            this.toggle();
        });
        container.insertBefore(button, container.firstChild || null);

        this.syncButton(button);
    },

    syncButton(button) {
        if (!button) return;
        const theme = this.get();
        const isDark = theme === this.DARK;
        button.classList.toggle('email-theme-toggle--dark', isDark);
        button.title = isDark ? 'Переключить на светлую тему письма' : 'Переключить на тёмную тему письма';
        // Sun icon (light mode active) / Moon icon (dark mode active)
        button.innerHTML = isDark
            ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
               </svg>`
            : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="5"/>
                <line x1="12" y1="1" x2="12" y2="3"/>
                <line x1="12" y1="21" x2="12" y2="23"/>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                <line x1="1" y1="12" x2="3" y2="12"/>
                <line x1="21" y1="12" x2="23" y2="12"/>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
               </svg>`;
    },

    syncButtons() {
        document.querySelectorAll('.email-theme-toggle').forEach((button) => {
            this.syncButton(button);
        });
    },
};

// ===== УТИЛИТЫ БЕЗОПАСНОСТИ =====

/**
 * Экранирует HTML-символы для предотвращения XSS
 */
// escapeHtml — определена в shared/utils.js

/**
 * Проверяет и очищает URL от опасных схем
 */
function sanitizeUrl(url) {
    if (!url) return '#';
    const trimmed = String(url).trim();

    // Блокируем опасные схемы
    if (/^(javascript|data|vbscript):/i.test(trimmed)) {
        return '#';
    }

    return trimmed.replace(/"/g, '&quot;');
}

// ===== УТИЛИТЫ СТИЛЕЙ =====

/**
 * Генерирует inline-стили для изображений
 */
function getImageStyle(width, extraStyles = '') {
    const base = `display:block; max-width:${width}px; height:auto; border:0; outline:none; text-decoration:none;`;
    return extraStyles ? `${base} ${extraStyles}` : base;
}

/**
 * Генерирует padding-стиль
 */
function getPadding(vertical = LAYOUT.PADDING_V, horizontal = LAYOUT.PADDING_H) {
    return `padding:${vertical}px ${horizontal}px;`;
}

function getCurrentEmailRenderContext() {
    return CURRENT_EMAIL_RENDER_CONTEXT || buildEmailRenderContext();
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
        bodyBg: isDarkPreview ? '#0f172a' : '#ffffff',
        surfaceBg: isDarkPreview ? '#111827' : '#ffffff',
        textColor: isDarkPreview ? '#f3f4f6' : DEFAULT_COLORS.TEXT,
        mutedTextColor: isDarkPreview ? '#d1d5db' : '#6b7280',
        linkColor: isDarkPreview ? '#c4b5fd' : DEFAULT_COLORS.LINK,
        bulletColor: isDarkPreview ? '#c4b5fd' : DEFAULT_COLORS.BULLET,
        borderColor: isDarkPreview ? '#fb923c' : DEFAULT_COLORS.BORDER,
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

.email-text,
.email-text p,
.email-text span,
.email-text strong,
.email-text b,
.email-text em,
.email-text i,
.email-text u,
.email-heading {
    color:${DEFAULT_COLORS.TEXT};
}

.email-text a,
.email-link {
    color:${DEFAULT_COLORS.LINK} !important;
}

.email-bullet-dot {
    background-color:${DEFAULT_COLORS.BULLET} !important;
}

.email-important-cell {
    border-left:4px solid ${DEFAULT_COLORS.BORDER};
    padding-left:12px !important;
}

body.email-force-dark,
body.email-force-dark .email-wrapper,
body.email-force-dark .email-root,
body.email-force-dark .email-surface,
.email-wrapper.email-force-dark,
.email-wrapper.email-force-dark .email-root,
.email-wrapper.email-force-dark .email-surface {
    background-color:#0f172a !important;
}

body.email-force-dark .email-text,
body.email-force-dark .email-text p,
body.email-force-dark .email-text span,
body.email-force-dark .email-text strong,
body.email-force-dark .email-text b,
body.email-force-dark .email-text em,
body.email-force-dark .email-text i,
body.email-force-dark .email-text u,
body.email-force-dark .email-heading,
body.email-force-dark .email-muted,
.email-wrapper.email-force-dark .email-text,
.email-wrapper.email-force-dark .email-text p,
.email-wrapper.email-force-dark .email-text span,
.email-wrapper.email-force-dark .email-text strong,
.email-wrapper.email-force-dark .email-text b,
.email-wrapper.email-force-dark .email-text em,
.email-wrapper.email-force-dark .email-text i,
.email-wrapper.email-force-dark .email-text u,
.email-wrapper.email-force-dark .email-heading,
.email-wrapper.email-force-dark .email-muted {
    color:#f3f4f6 !important;
}

body.email-force-dark .email-text a,
body.email-force-dark .email-link,
.email-wrapper.email-force-dark .email-text a,
.email-wrapper.email-force-dark .email-link {
    color:#c4b5fd !important;
}

body.email-force-dark .email-bullet-dot,
.email-wrapper.email-force-dark .email-bullet-dot {
    background-color:#c4b5fd !important;
}

body.email-force-dark .email-important-cell,
.email-wrapper.email-force-dark .email-important-cell {
    border-left-color:#fb923c !important;
}

@media (prefers-color-scheme: dark) {
    body,
    .email-wrapper,
    .email-root,
    .email-surface,
    [data-ogsc] .email-wrapper,
    [data-ogsc] .email-root,
    [data-ogsc] .email-surface {
        background-color:#0f172a !important;
    }

    .email-text,
    .email-text p,
    .email-text span,
    .email-text strong,
    .email-text b,
    .email-text em,
    .email-text i,
    .email-text u,
    .email-heading,
    .email-muted,
    [data-ogsc] .email-text,
    [data-ogsc] .email-text p,
    [data-ogsc] .email-text span,
    [data-ogsc] .email-text strong,
    [data-ogsc] .email-text b,
    [data-ogsc] .email-text em,
    [data-ogsc] .email-text i,
    [data-ogsc] .email-text u,
    [data-ogsc] .email-heading,
    [data-ogsc] .email-muted {
        color:#f3f4f6 !important;
    }

    .email-text a,
    .email-link,
    [data-ogsc] .email-text a,
    [data-ogsc] .email-link {
        color:#c4b5fd !important;
    }

    .email-bullet-dot,
    [data-ogsc] .email-bullet-dot {
        background-color:#c4b5fd !important;
    }

    .email-important-cell,
    [data-ogsc] .email-important-cell {
        border-left-color:#fb923c !important;
    }
}
`;
}

// ===== КОНВЕРТАЦИЯ ИЗОБРАЖЕНИЙ =====

/**
 * Конвертация base64 → URL через сервер
 * Пока заглушка — возвращает исходные данные
 */
async function convertBase64ToUrl(base64Data, type) {
    // TODO: Реализовать конвертацию при необходимости
    return base64Data;
}

// ===== АДАПТАЦИЯ ЦВЕТОВ =====

/**
 * Адаптация цвета для белого фона
 * Светлые цвета (для тёмного фона) заменяем на тёмные
 */
function adaptColorForWhiteBackground(originalColor) {
    const lightColors = {
        '#e5e7eb': DEFAULT_COLORS.TEXT,
        '#f9fafb': DEFAULT_COLORS.TEXT,
        '#9ca3af': DEFAULT_COLORS.TEXT,
        '#d1d5db': DEFAULT_COLORS.TEXT,
        '#ffffff': DEFAULT_COLORS.TEXT
    };

    const lowerColor = originalColor?.toLowerCase();

    if (lightColors[lowerColor]) {
        return lightColors[lowerColor];
    }

    return originalColor || DEFAULT_COLORS.TEXT;
}

// ===== РАБОТА СО ШРИФТАМИ =====

/**
 * Резолвит font-family из настроек блока
 */
function resolveTextFontFamily(s) {
    if (!s) return "inherit";
    const type = s.fontFamily || 'default';

    if (type === 'custom' && s.customFontFamily) {
        return `${escapeHtml(s.customFontFamily)}, Arial, sans-serif`;
    }

    switch (type) {
        case 'rt-regular':
            return "'RostelecomBasis-Regular', Arial, sans-serif";
        case 'rt-medium':
            return "'RostelecomBasis-Medium', Arial, sans-serif";
        case 'rt-bold':
            return "'RostelecomBasis-Bold', Arial, sans-serif";
        case 'rt-light':
            return "'RostelecomBasis-Light', Arial, sans-serif";
        default:
            return EMAIL_STYLES ? EMAIL_STYLES.FONT_FAMILY : "Arial, sans-serif";
    }
}

// ===== ФОРМАТИРОВАНИЕ ТЕКСТА =====

// ===== ГЛАВНАЯ ФУНКЦИЯ ГЕНЕРАЦИИ =====

/**
 * Генерирует полный HTML email
 */
async function generateEmailHTML(options = {}) {
    const { TABLE_WIDTH, FONT_FAMILY } = EMAIL_STYLES;
    const context = buildEmailRenderContext(options);
    CURRENT_EMAIL_RENDER_CONTEXT = context;

    try {
        // Конвертируем все base64 в URL перед генерацией
        for (let block of AppState.blocks) {
            await convertBlockImages(block);
        }

        let html = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>Email</title>
<style>
/* Outlook специфичные стили */
.ExternalClass {
    width: 100%;
}

.ExternalClass,
.ExternalClass p,
.ExternalClass span,
.ExternalClass font,
.ExternalClass td,
.ExternalClass div {
    line-height: 100%;
}

${buildEmailThemeStyles()}
</style>
</head>
<body class="${context.rootClass}" style="margin:0; padding:0; background-color:${context.bodyBg}; font-family:${FONT_FAMILY};">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${context.bodyBg};" class="email-wrapper ${context.rootClass}">
  <tr><td align="center">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${TABLE_WIDTH}" style="max-width:${TABLE_WIDTH}px; background-color:${context.surfaceBg};" class="email-root email-surface">
`;

    // Генерируем HTML блоков
    AppState.blocks.forEach(block => {
        html += generateBlockHTML(block);
    });

    html += `
    </table>
  </td></tr>
</table>
</body>
</html>`;

        return html;
    } finally {
        CURRENT_EMAIL_RENDER_CONTEXT = null;
    }
}

// ===== КОНВЕРТАЦИЯ ИЗОБРАЖЕНИЙ В БЛОКАХ =====

/**
 * Рекурсивно конвертирует все изображения в блоке
 */
async function convertBlockImages(block) {
    if (!block) return;

    if (block.columns) {
        for (let column of block.columns) {
            for (let childBlock of column.blocks) {
                await convertBlockImages(childBlock);
            }
        }
        return;
    }

    const s = block.settings;
    if (!s) return;

    // Баннер
    if (block.type === 'banner' && s.renderedBanner) {
        s.renderedBanner = await convertBase64ToUrl(s.renderedBanner, 'banner');
    }

    // Кнопка
    if (block.type === 'button' && s.renderedButton) {
        s.renderedButton = await convertBase64ToUrl(s.renderedButton, 'button');
    }

    // Эксперт
    if (block.type === 'expert' && s.renderedExpert) {
        s.renderedExpert = await convertBase64ToUrl(s.renderedExpert, 'expert');
    }

    // Список (нумерованные буллеты)
    if (block.type === 'list' && s.renderedBullets) {
        for (let i = 0; i < s.renderedBullets.length; i++) {
            s.renderedBullets[i] = await convertBase64ToUrl(s.renderedBullets[i], `bullet_${i}`);
        }
    }

    // Important блок (иконка)
    if (block.type === 'important' && s.renderedIcon) {
        s.renderedIcon = await convertBase64ToUrl(s.renderedIcon, 'important_icon');
    }

    // Image блок
    if (block.type === 'image' && s.renderedImage) {
        s.renderedImage = await convertBase64ToUrl(s.renderedImage, 'image');
    }
}

// ===== РОУТЕР ГЕНЕРАЦИИ БЛОКОВ =====

/**
 * Генерирует HTML для одного блока
 */
function generateBlockHTML(block) {
    if (!block) return '';

    if (block.columns) {
        return generateColumnsHTML(block);
    }

    const s = block.settings;
    if (!s) return '';

    switch (block.type) {
        case 'banner':
            return generateBannerHTML(s);
        case 'text':
            return generateTextHTML(s);
        case 'heading':
            return generateHeadingHTML(s);
        case 'button':
            return generateButtonHTML(s);
        case 'list':
            return generateListHTML(s);
        case 'expert':
            return generateExpertHTML(s);
        case 'important':
            return generateImportantHTML(s);
        case 'divider':
            return generateDividerHTML(s);
        case 'image':
            return generateImageHTML(s);
        case 'spacer':
            return generateSpacerHTML(s);
        default:
            return '';
    }
}

// ===== ГЕНЕРАТОРЫ БЛОКОВ =====

/**
 * Генерирует HTML баннера
 */
function generateBannerHTML(s) {
    if (!s) return '';

    const src = s.renderedBanner;
    if (!src) {
        console.log('[EMAIL GEN] Banner not rendered, skipping');
        return '';
    }

    return `
        <tr>
            <td align="center" style="padding:0;">
                <img src="${src}" alt="Баннер" width="${LAYOUT.TABLE_WIDTH}" style="${getImageStyle(LAYOUT.TABLE_WIDTH, 'width:100%;')}">
            </td>
        </tr>
    `;
}

/**
 * Генерирует HTML текстового блока
 */
function generateTextHTML(s) {
    if (!s) return '';

    const ctx = getCurrentEmailRenderContext();
    const textHTML = TextSanitizer.render(s.content || '', ctx.linkColor);
    const fontFamily = resolveTextFontFamily(s);
    const adaptedColor = adaptColorForWhiteBackground(s.color || ctx.textColor);
    const fontSize = s.fontSize || LAYOUT.DEFAULT_FONT_SIZE;
    const lineHeight = s.lineHeight || LAYOUT.DEFAULT_LINE_HEIGHT;
    const lineHeightValue = typeof lineHeight === 'number' ? `${lineHeight * 100}%` : lineHeight;
    const align = s.align || 'left';

    return `
        <tr>
            <td class="email-text" style="${getPadding(0, LAYOUT.PADDING_H)} font-size:${fontSize}px; line-height:${lineHeightValue}; text-align:${align}; color:${adaptedColor}; font-family:${fontFamily};">
                ${textHTML}
            </td>
        </tr>
    `;
}

/**
 * Генерирует HTML заголовка
 */
function generateHeadingHTML(s) {
    if (!s) return '';

    const ctx = getCurrentEmailRenderContext();
    const fontFamily = resolveTextFontFamily(s);
    const adaptedColor = adaptColorForWhiteBackground(s.color || ctx.textColor);
    const size = s.size || 24;
    const weight = s.weight || 'bold';
    const align = s.align || 'left';
    const text = escapeHtml(s.text || '');

    return `
        <tr>
            <td class="email-heading" style="${getPadding()} font-size:${size}px; font-weight:${weight}; color:${adaptedColor}; text-align:${align}; font-family:${fontFamily};">
                ${text}
            </td>
        </tr>
    `;
}

/**
 * Генерирует HTML кнопки
 */
function generateButtonHTML(s) {
    if (!s) return '';

    const align = s.align || 'center';
    const src = s.renderedButton;

    if (!src) {
        return '';
    }

    const w = s.renderedButtonW;
    const h = s.renderedButtonH;
    const url = sanitizeUrl(s.url);
    const altText = escapeHtml(s.text || '');

    const sizeAttrs = (w && h)
        ? `width="${Math.round(w)}" height="${Math.round(h)}" style="display:block; border:0; outline:none; text-decoration:none; width:${Math.round(w)}px; height:${Math.round(h)}px;"`
        : `style="display:block; border:0; outline:none; text-decoration:none; height:auto; max-width:100%;"`;

    return `
        <tr>
            <td align="${align}" style="${getPadding()} text-align:${align};">
                <a href="${url}" style="text-decoration:none; display:inline-block;">
                    <img src="${src}" alt="${altText}" ${sizeAttrs}>
                </a>
            </td>
        </tr>
    `;
}

/**
 * Генерирует HTML списка
 */
function generateListHTML(s) {
    if (!s) return '';

    const ctx = getCurrentEmailRenderContext();
    const bulletSize = s.bulletSize || 20;
    const bulletGap = s.bulletGap ?? 10;
    const fontSize = s.fontSize || LAYOUT.DEFAULT_FONT_SIZE;
    const lineHeight = s.lineHeight || LAYOUT.DEFAULT_LINE_HEIGHT;
    const cellWidth = bulletSize + bulletGap + 2;
    const fontFamily = resolveTextFontFamily(s);
    const adaptedColor = adaptColorForWhiteBackground(s.textColor || ctx.textColor);
    const itemSpacing = s.itemSpacing ?? 8;

    const isNumbered = s.listStyle === 'numbered';

    const listItems = (s.items || []).map((item, index) => {
        const formatted = TextSanitizer.render(
            typeof item === 'string' && item.trim().startsWith('<')
                ? item
                : TextSanitizer.sanitize(item || '', true),
            ctx.linkColor
        );

        let bulletHTML;

        if (isNumbered && s.renderedBullets && s.renderedBullets[index]) {
            bulletHTML = `<img src="${s.renderedBullets[index]}" alt="" width="${bulletSize}" height="${bulletSize}" style="display:block;">`;
        } else {
            const bulletSrc = s.bulletCustom || ((BULLET_TYPES.find(b => b.id === s.bulletType) || BULLET_TYPES[0])?.src || '');
            const numberFontSize = Math.max(10, Math.round(bulletSize * 0.3));

            const baseBullet = bulletSrc
                ? `<img src="${bulletSrc}" alt="" width="${bulletSize}" height="${bulletSize}" style="display:block;">`
                : `<span class="email-bullet-dot" style="display:inline-block; width:${bulletSize}px; height:${bulletSize}px; border-radius:999px; background-color:${ctx.bulletColor};"></span>`;

            if (isNumbered) {
                const num = index + 1;
                const numLabel = num < 10 ? '0' + num : String(num);

                bulletHTML = `
                    <div style="position:relative; width:${bulletSize}px; height:${bulletSize}px; display:flex; align-items:center; justify-content:center;">
                        ${baseBullet}
                        <div style="position:absolute; left:0; top:0; right:0; bottom:0; display:flex; align-items:center; justify-content:center; font-size:${numberFontSize}px; font-weight:bold; color:#ffffff;">
                            ${numLabel}
                        </div>
                    </div>
                `;
            } else {
                bulletHTML = baseBullet;
            }
        }

        return `
            <tr>
                <td valign="middle" width="${cellWidth}" style="padding:${itemSpacing / 2}px ${bulletGap}px;">
                    ${bulletHTML}
                </td>
                <td valign="middle" class="email-text" style="font-size:${fontSize}px; line-height:${lineHeight}; color:${adaptedColor}; padding:${itemSpacing / 2}px 0; font-family:${fontFamily};">
                    ${formatted}
                </td>
            </tr>
        `;
    }).join('');

    return `
        <tr>
            <td style="${getPadding()}">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                    ${listItems}
                </table>
            </td>
        </tr>
    `;
}

/**
 * Генерирует HTML блока эксперта
 */
function generateExpertHTML(s) {
    if (!s) return '';

    const src = s.renderedExpert;
    if (!src) return '';

    const width = Number(s.renderedExpertWidth || LAYOUT.TABLE_WIDTH);
    const align = ['left', 'right', 'center'].includes(s.align) ? s.align : 'center';
    const isLite = (s.variant || 'full') === 'lite';
    const altText = escapeHtml(s.name || '');

    const imgStyle = isLite
        ? `display:block; width:${width}px; max-width:${width}px; height:auto; border:0; outline:none; text-decoration:none;`
        : `display:block; width:100%; max-width:${width}px; height:auto; border:0; outline:none; text-decoration:none;`;

    const tableStyle = align === 'center' ? 'margin:0 auto;' : '';

    return `
        <tr>
            <td style="${getPadding()}">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="${align}" style="${tableStyle}">
                    <tr>
                        <td>
                            <img src="${src}" alt="${altText}" width="${width}" style="${imgStyle}">
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    `;
}

/**
 * Генерирует HTML блока "Важно"
 */
function generateImportantHTML(s) {
    if (!s) return '';

    const ctx = getCurrentEmailRenderContext();
    const iconSrc = s.renderedIcon || s.icon;
    const fontFamily = resolveTextFontFamily(s);
    const fontSize = s.fontSize ?? 14;
    const lineHeight = s.lineHeight ?? 1;
    const borderColor = s.borderColor || ctx.borderColor;
    const adaptedColor = adaptColorForWhiteBackground(s.textColor || ctx.textColor);
    const textContent = TextSanitizer.render(TextSanitizer.sanitize(s.text || '', true), ctx.linkColor);
    const textCellAccent = iconSrc
        ? 'padding-left:0;'
        : `border-left:4px solid ${borderColor}; padding-left:12px;`;

    const iconHTML = iconSrc ? `
    <td valign="top"
        width="${LAYOUT.ICON_SIZE}"
        style="padding:0 16px 0 0; width:${LAYOUT.ICON_SIZE}px; min-width:${LAYOUT.ICON_SIZE}px; max-width:${LAYOUT.ICON_SIZE}px;">
        <img src="${iconSrc}" alt=""
            width="${LAYOUT.ICON_SIZE}"
            height="${LAYOUT.ICON_SIZE}"
            style="display:block; width:${LAYOUT.ICON_SIZE}px; height:${LAYOUT.ICON_SIZE}px; max-width:${LAYOUT.ICON_SIZE}px; max-height:${LAYOUT.ICON_SIZE}px; border:0; outline:none; text-decoration:none;">
    </td>
    ` : '';

    return `
        <tr>
            <td style="${getPadding()}">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                    <tr>
                        ${iconHTML}
                        <td valign="middle" class="email-text email-important-cell" style="font-size:${fontSize}px; line-height:${lineHeight}; color:${adaptedColor}; font-family:${fontFamily}; ${textCellAccent}">
                            ${textContent}
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    `;
}

/**
 * Генерирует HTML разделителя
 */
function generateDividerHTML(s) {
    if (!s) return '';

    const imageSrc = s.customImage || s.image;

    if (!imageSrc) {
        return '';
    }

    return `
        <tr>
            <td align="center" style="${getPadding()}">
                <img src="${imageSrc}" alt="" width="${LAYOUT.TABLE_WIDTH}" style="${getImageStyle(LAYOUT.TABLE_WIDTH, 'width:100%;')}">
            </td>
        </tr>
    `;
}

/**
 * Генерирует HTML блока изображения
 */
function generateImageHTML(s) {
    if (!s) return '';

    const src = s.renderedImage || s.src;
    if (!src) return '';

    const align = s.align || 'center';
    const altText = escapeHtml(s.alt || '');

    let borderRadius;
    if (s.borderRadiusMode === 'each') {
        borderRadius = `${s.borderRadiusTL || 0}px ${s.borderRadiusTR || 0}px ${s.borderRadiusBR || 0}px ${s.borderRadiusBL || 0}px`;
    } else {
        borderRadius = `${s.borderRadiusAll || 0}px`;
    }

    const width = s.renderedWidth || LAYOUT.TABLE_WIDTH;

    const imgTag = `<img src="${src}" alt="${altText}" width="${width}" style="${getImageStyle(width)} border-radius:${borderRadius};">`;

    const content = s.url
        ? `<a href="${sanitizeUrl(s.url)}" style="display:inline-block; border:0; text-decoration:none;">${imgTag}</a>`
        : imgTag;

    return `
        <tr>
            <td align="${align}" style="${getPadding()}">
                ${content}
            </td>
        </tr>
    `;
}

/**
 * Генерирует HTML отступа
 */
function generateSpacerHTML(s) {
    if (!s) return '';

    const height = s.height || 20;

    return `
        <tr>
            <td style="padding:0; height:${height}px;"></td>
        </tr>
    `;
}

/**
 * Генерирует HTML для колонок
 * Gap только между колонками (первая без левого отступа, последняя без правого)
 */
function generateColumnsHTML(block) {
    if (!block || !block.columns) return '';

    const columnGap = 10; // Отступ между колонками (px)
    const totalColumns = block.columns.length;

    const columnsContent = block.columns.map((column, index) => {
        const columnBlocks = column.blocks.map(childBlock => generateBlockHTML(childBlock)).join('');
        const width = Math.round(LAYOUT.TABLE_WIDTH * column.width / 100);

        console.log(`[COLUMNS] Column ${index}: width=${column.width}% -> ${width}px`);

        // Определяем padding для каждой колонки
        let paddingLeft = 0;
        let paddingRight = 0;

        if (totalColumns > 1) {
            if (index === 0) {
                // Первая колонка: без левого отступа, справа половина gap
                paddingRight = columnGap / 2;
            } else if (index === totalColumns - 1) {
                // Последняя колонка: слева половина gap, без правого отступа
                paddingLeft = columnGap / 2;
            } else {
                // Средние колонки: половина gap с обеих сторон
                paddingLeft = columnGap / 2;
                paddingRight = columnGap / 2;
            }
        }

        return `
            <td valign="top" width="${width}" style="padding:0 ${paddingRight}px 0 ${paddingLeft}px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                    ${columnBlocks}
                </table>
            </td>
        `;
    }).join('');

    return `
        <tr>
            <td style="padding:0;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                    <tr>
                        ${columnsContent}
                    </tr>
                </table>
            </td>
        </tr>
    `;
}

window.EmailPreviewTheme = EmailPreviewTheme;
