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
// Эффективная ширина контентной колонки во время генерации письма.
// Устанавливается в generateEmailHTML() с учётом padding (3-колонный layout).
let _emailContentWidth = LAYOUT.TABLE_WIDTH;

// Общий 2D-контекст canvas для оценки ширины текста (см. generateListHTML)
// — переиспользуем один раз созданный, а не создаём canvas на каждый пункт.
let _textMeasureCtx = null;
function _getTextMeasureCtx() {
    if (!_textMeasureCtx) {
        _textMeasureCtx = document.createElement('canvas').getContext('2d');
    }
    return _textMeasureCtx;
}

// Текст пункта списка для оценки ширины (см. generateListHTML/renderListPreview)
// — TextSanitizer.toPlainText() конвертирует <a href="URL">текст</a> в
// markdown [текст](URL), сохраняя URL в строке. Если мерить эту строку
// как есть, длинная ссылка (которая физически не рендерится — виден
// только текст текст ссылки) сильно раздувает оценённую ширину и,
// соответственно, оценённое число строк. Досюда убираем markdown-обёртки
// ссылок и жирного текста, оставляя только то, что реально видно.
function _measurableListItemText(item) {
    return TextSanitizer.toPlainText(item || '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();
}

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
.email-heading {
    color:${DEFAULT_COLORS.TEXT};
}

.email-text p,
.email-text span,
.email-text strong,
.email-text b,
.email-text em,
.email-text i,
.email-text u {
    color:inherit;
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

body.email-force-dark .email-important-cell--accent,
.email-wrapper.email-force-dark .email-important-cell--accent {
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

    .email-important-cell--accent,
    [data-ogsc] .email-important-cell--accent {
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

/**
 * Resolves text color for a block, honoring its own background when active.
 * When bgEnabled + bgColor are set, auto-contrast is computed from the background
 * (matching blockPreview logic). Otherwise falls back to adaptColorForWhiteBackground.
 */
function resolveBlockTextColor(s, ctx, colorField) {
    // 1. Блок имеет собственный фон — высший приоритет
    if (s.bgEnabled !== false && s.bgColor) {
        return isLightColorPreview(s.bgColor) ? DEFAULT_COLORS.TEXT : '#ffffff';
    }
    // 2. Блок находится внутри контейнера с фоном — средний приоритет
    if (ctx && ctx.parentBgColor) {
        return isLightColorPreview(ctx.parentBgColor) ? DEFAULT_COLORS.TEXT : '#ffffff';
    }
    // 3. Общий фон письма — базовый приоритет
    const savedColor = s[colorField || 'color'] || ctx.textColor;
    if (ctx.previewTheme === 'dark') {
        return savedColor;
    }
    return adaptColorForWhiteBackground(savedColor);
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
    const _cp = (typeof ProfileLoader !== 'undefined' && ProfileLoader.loaded)
        ? ProfileLoader.getContentPadding() : 27;
    const _innerW = TABLE_WIDTH - _cp * 2;
    // Устанавливаем контекстную ширину для generateColumnsHTML
    _emailContentWidth = _cp > 0 ? _innerW : TABLE_WIDTH;
    AppState.blocks.forEach(block => {
        const blockHtml = generateBlockHTML(block);
        // Баннер — полная ширина.
        // Остальные — симметричный отступ через 3 колонки (CSS padding игнорируется Outlook).
        const isFullWidthColumns = block.type === 'columns_container'
            && block.settings?.bgEnabled !== false
            && block.settings?.bgColor
            && block.settings?.bgFullWidth;
        if (block.type === 'banner' || block.type === 'divider' || isFullWidthColumns) {
            // Баннер, разделитель и колонки с full-width фоном — полная ширина
            // (их HTML уже сам компенсирует боковой отступ изнутри при необходимости).
            // При 3-колоночной раскладке первый <td> должен охватить все 3 колонки.
            html += (_cp > 0)
                ? blockHtml.replace(/(<td\b)/, '$1 colspan="3"')
                : blockHtml;
            return;
        }
        if (_cp === 0) {
            html += blockHtml;
        } else {
            html += `<tr>
  <td width="${_cp}" style="width:${_cp}px;min-width:${_cp}px;padding:0;font-size:0;line-height:0;mso-line-height-rule:exactly;">&nbsp;</td>
  <td width="${_innerW}" style="width:${_innerW}px;padding:0;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${_innerW}" style="width:${_innerW}px;">
      ${blockHtml}
    </table>
  </td>
  <td width="${_cp}" style="width:${_cp}px;min-width:${_cp}px;padding:0;font-size:0;line-height:0;mso-line-height-rule:exactly;">&nbsp;</td>
</tr>`;
        }
    });

    // Сбрасываем контекстную ширину
    _emailContentWidth = LAYOUT.TABLE_WIDTH;

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

    // Таблица (плашка-заголовок)
    if (block.type === 'table' && s.renderedTitleBar) {
        s.renderedTitleBar = await convertBase64ToUrl(s.renderedTitleBar, 'table_title');
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

    let html;
    switch (block.type) {
        case 'banner':    html = generateBannerHTML(s);    break;
        case 'text':      html = generateTextHTML(s);      break;
        case 'heading':   html = generateHeadingHTML(s);   break;
        case 'button':    html = generateButtonHTML(s);    break;
        case 'list':      html = generateListHTML(s);      break;
        case 'expert':    html = generateExpertHTML(s);    break;
        case 'important': html = generateImportantHTML(s); break;
        case 'divider':   html = generateDividerHTML(s);   break;
        case 'image':     html = generateImageHTML(s);     break;
        case 'spacer':    html = generateSpacerHTML(s);    break;
        case 'canvas':    html = generateCanvasBlockHTML(s); break;
        case 'table':     html = generateTableHTML(s);     break;
        default:          html = '';
    }
    return CapabilityRegistry.applyWrappers(html, block, 'email');
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
    const fontSize = s.fontSize || LAYOUT.DEFAULT_FONT_SIZE;
    const textHTML = TextSanitizer.render(s.content || '', ctx.linkColor, {
        bulletSize: s.listBulletSize,
        bulletColor: s.listBulletColor,
        itemSpacing: s.listItemSpacing,
        fontSize,
    });
    const fontFamily = resolveTextFontFamily(s);
    const adaptedColor = resolveBlockTextColor(s, ctx);
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
    const adaptedColor = resolveBlockTextColor(s, ctx);
    const size = s.size || 24;
    const weight = s.weight || 'bold';
    const align = s.align || 'left';
    const text = TextSanitizer.applyTypography(escapeHtml(s.text || ''));

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
        const scale = Number(s.size || 1);
        const paddingY = Math.round(12 * scale);
        const paddingX = Math.round(24 * scale);
        const borderRadius = Math.round(6 * scale);
        // В 4-колоночной раскладке колонки узкие — даже ручной размер не
        // должен превышать 14px (см. imageRenderers.js renderButtonToDataUrl).
        const columnsCount = Number(s._columnsCount || 1);
        const effectiveFontSize = Number(s.fontSize) || (14 * scale);
        const fontSize = Math.round(columnsCount >= 4 ? Math.min(effectiveFontSize, 14) : effectiveFontSize);
        const bgColor = s.color || '#f97316';
        const textColor = s.textColor || '#ffffff';
        const text = escapeHtml(s.text || 'Кнопка');
        const url = sanitizeUrl(s.url);

        return `
            <tr>
                <td align="${align}" style="${getPadding()} text-align:${align};">
                    <a href="${url}" style="
                        display:inline-block;
                        padding:${paddingY}px ${paddingX}px;
                        border-radius:${borderRadius}px;
                        background:${bgColor};
                        color:${textColor};
                        font-size:${fontSize}px;
                        font-weight:600;
                        line-height:1;
                        text-align:center;
                        text-decoration:none;
                        white-space:nowrap;
                    ">
                        ${text}
                    </a>
                </td>
            </tr>
        `;
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
    const adaptedColor = resolveBlockTextColor(s, ctx, 'textColor');
    const itemSpacing = s.itemSpacing ?? 8;
    const leftIndent = Number(s.leftIndent) || 0;
    // Подтверждено на реальном отправленном письме: Word/Outlook даже с
    // valign="top" не ведёт себя как честный top-anchor — "лишняя" высота
    // строки (когда буллет короче текста) всё равно частично
    // перераспределяется чем-то похожим на центрирование, независимо от
    // того, что мы просим. Поэтому для 'first-line' точный расчёт отступа
    // (по высоте первой строки) отброшен — упрощено до простого
    // valign="top" без вычисляемого padding-top: буллет прижат к верху,
    // без точного центрирования по первой строке, зато предсказуемо
    // одинаково во всех клиентах (это стандартный приём в email-рассылках).
    // 'block' (дефолт) всё ещё оценивает число строк и добавляет padding —
    // если тот же эффект перераспределения проявится и здесь, эту ветку
    // тоже нужно будет упростить аналогично.
    const isFirstLine = s.bulletAlign === 'first-line';
    // Word игнорирует unitless line-height и считает его по метрикам
    // подставленного шрифта — фиксируем явным пикселем +
    // mso-line-height-rule:exactly (тот же приём, что уже используется в
    // этом файле для колонок-отступов), чтобы высота строки была именно
    // той, что мы посчитали, а не тем, что Word решит сам.
    const lineHeightPx = Math.round(fontSize * lineHeight);

    // Ширина, доступная тексту пункта (сама колонка минус буллет-ячейка) —
    // нужна для оценки числа строк. ctx.parentContentWidth — реальная
    // ширина колонки, если список лежит в columns_container (см.
    // generateColumnsHTML); иначе _emailContentWidth — ширина контента
    // письма верхнего уровня (уже учитывает боковые отступы).
    const availableTextWidth = Math.max(20, (ctx.parentContentWidth || _emailContentWidth) - leftIndent - cellWidth);
    // Word реально подставляет Arial вместо кастомного шрифта (см.
    // resolveTextFontFamily — Arial всегда указан фолбэком) — меряем текст
    // в Arial, а не в кастомном шрифте, чтобы оценка числа строк была
    // ближе к тому, что увидит получатель в реальном письме.
    const measureCtx = _getTextMeasureCtx();
    measureCtx.font = `${fontSize}px Arial`;

    const isNumbered = s.listStyle === 'numbered';

    const listItems = (s.items || []).map((item, index) => {
        const formatted = TextSanitizer.render(
            typeof item === 'string' && item.trim().startsWith('<')
                ? item
                : TextSanitizer.sanitize(item || '', true),
            ctx.linkColor
        );

        let bulletTopExtra;
        if (isFirstLine) {
            bulletTopExtra = 0;
        } else {
            const plainText = _measurableListItemText(item);
            const textWidth = plainText ? measureCtx.measureText(plainText).width : 0;
            const estimatedLines = Math.max(1, Math.ceil(textWidth / availableTextWidth));
            const blockHeight = estimatedLines * lineHeightPx;
            bulletTopExtra = Math.max(0, (blockHeight - bulletSize) / 2);
        }

        let bulletHTML;

        if (isNumbered && s.renderedBullets && s.renderedBullets[index]) {
            bulletHTML = `<img src="${s.renderedBullets[index]}" alt="" width="${bulletSize}" height="${bulletSize}" style="display:block;">`;
        } else {
            // Для обычных (не нумерованных) списков используем заранее
            // растрированный самодостаточный data:URL (renderFlatBulletToDataUrl
            // в imageRenderers.js), если он уже посчитан — иначе в реально
            // отправленном письме путь к static/bullets/*.png будет вести на
            // локальный сервер приложения и картинка окажется битой.
            let bulletSrc = (!isNumbered && s.renderedBulletFlat)
                ? s.renderedBulletFlat
                : (s.bulletCustom || ((BULLET_TYPES.find(b => b.id === s.bulletType || b.src === s.bulletType) || BULLET_TYPES[0])?.src || ''));
            // Relative paths don't resolve inside srcdoc iframes — make absolute
            if (bulletSrc && !bulletSrc.startsWith('data:') && !bulletSrc.startsWith('http') && !bulletSrc.startsWith('/')) {
                bulletSrc = window.location.origin + '/' + bulletSrc;
            }
            const numberFontSize = Math.max(10, Math.round(bulletSize * 0.3));

            const baseBullet = bulletSrc
                ? `<img src="${bulletSrc}" alt="" width="${bulletSize}" height="${bulletSize}" style="display:block;">`
                : `<span class="email-bullet-dot" style="display:inline-block; width:${bulletSize}px; height:${bulletSize}px; border-radius:999px; background-color:${ctx.bulletColor};"></span>`;

            if (isNumbered) {
                const startN = s.startNumber != null ? s.startNumber : 1;
                const num = index + startN;
                const numLabel = (s.numberFormat === 'plain') ? String(num) : (num < 10 ? '0' + num : String(num));

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
                <td valign="top" width="${cellWidth}" style="padding:${itemSpacing / 2 + bulletTopExtra}px ${bulletGap}px ${itemSpacing / 2}px ${bulletGap}px;">
                    ${bulletHTML}
                </td>
                <td valign="top" class="email-text" style="font-size:${fontSize}px; line-height:${lineHeightPx}px; mso-line-height-rule:exactly; color:${adaptedColor}; padding:${itemSpacing / 2}px 0; font-family:${fontFamily};">
                    ${formatted}
                </td>
            </tr>
        `;
    }).join('');

    return `
        <tr>
            <td style="padding:0 0 0 ${leftIndent}px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                    ${listItems}
                </table>
            </td>
        </tr>
    `;
}

/**
 * Генерирует HTML блока "Таблица" — карточка на едином фоне (containerBg) с
 * плашкой-заголовком (растрирована в PNG на клиенте, т.к. Outlook не
 * поддерживает CSS-градиенты — см. imageRenderers.js renderTableTitleToDataUrl)
 * и данными ниже: ячейки БЕЗ собственной заливки.
 *
 * Grid-линии:
 *  - горизонтальные — отдельная «строка-разделитель» (вложенная 1×1 таблица
 *    высотой 1-2px) с padding по бокам — так линия не доходит до краёв
 *    карточки, надёжно работает и в Outlook (в отличие от ::before/::after).
 *  - вертикальные — border-right прямо на ячейке, во всю высоту строки.
 *    Сделать её "не доходящей" до верха/низа ячейки в table-based email
 *    не получится надёжно для Outlook (нет прямого аналога absolute+inset
 *    для переменной высоты строки) — в конструкторе/предпросмотре линия
 *    отрисована с отступом как в референсе, в письме — во всю высоту.
 */
function generateTableHTML(s) {
    if (!s) return '';

    const ctx = getCurrentEmailRenderContext();
    const columns = s.columns || [];
    const rows = s.rows || [];
    const widths = (Array.isArray(s.columnWidths) && s.columnWidths.length === columns.length)
        ? s.columnWidths
        : columns.map(() => Math.round(100 / (columns.length || 1)));
    const fontFamily = resolveTextFontFamily(s);
    const lineHeight = s.lineHeight || 1.5;
    // Единый коэффициент уменьшения шрифта на случай, если в какой-то
    // ячейке есть "слово" без пробелов длиннее своей колонки — Outlook
    // ненадёжно переносит такие слова (word-break/overflow-wrap ниже он
    // может игнорировать), из-за чего колонка/таблица раздувается за
    // пределы письма. Коэффициент один на всю таблицу — оба размера
    // шрифта уменьшаются пропорционально, не по отдельным ячейкам.
    const fontScale = (typeof computeTableFontScale === 'function')
        ? computeTableFontScale(s, _emailContentWidth)
        : 1;
    const fontSize = Math.round((s.fontSize || 15) * fontScale);
    const headerFontSize = Math.round((s.headerFontSize || 18) * fontScale);
    const cellPaddingV = s.cellPaddingV ?? 22;
    const cellPaddingH = s.cellPaddingH ?? 40;
    const dividerColor = s.dividerColor || '#FFFFFF';
    const containerBg = s.containerBg || '#EBF1F6';
    const containerRadius = s.containerRadius ?? 28;
    const linkColor = s.linkColor || '#475569';
    const cellTextAlign = ['left', 'center', 'right'].includes(s.cellTextAlign) ? s.cellTextAlign : 'left';

    // insertTableBreakOpportunities вставляет невидимые точки разрыва
    // внутрь длинных "слов" до санитайзера/HTML-обёртки — см.
    // blockPreview.js. Без этого CSS word-break/overflow-wrap на <td>
    // могут не сработать в Outlook (движок Word) для контента без явных
    // точек разрыва, и колонка/таблица раздуется за пределы письма.
    const renderCell = (value) => {
        const withBreaks = (typeof insertTableBreakOpportunities === 'function')
            ? insertTableBreakOpportunities(value)
            : value;
        return TextSanitizer.render(
            typeof withBreaks === 'string' && withBreaks.trim().startsWith('<')
                ? withBreaks
                : TextSanitizer.sanitize(withBreaks || '', true),
            linkColor
        );
    };

    // Горизонтальная линия-разделитель, инсетнутая по бокам на cellPaddingH.
    const dividerRow = (heightPx) => `
        <tr>
            <td colspan="${columns.length}" style="padding:0 ${cellPaddingH}px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr><td height="${heightPx}" style="height:${heightPx}px; font-size:1px; line-height:${heightPx}px; background-color:${dividerColor};">&nbsp;</td></tr>
                </table>
            </td>
        </tr>`;

    // width="100%" в атрибуте <img> Outlook (движок Word) часто игнорирует и
    // рендерит картинку по натуральному пиксельному размеру растра — карточка
    // раздувается за пределы 536px. Нужен пиксельный атрибут width, как у banner.
    // Ширина равна cardWidth (ширине обеих таблиц карточки, см. ниже) — раньше
    // тут был запас "-2px" на случай, если Outlook проигнорирует атрибут
    // width, но теперь у таблиц карточки тоже жёсткий пиксельный width, и
    // этот запас только создавал видимый шов между плашкой/крышкой и телом
    // карточки (тело оказывалось на 2px шире).
    const cardWidth = Math.max(1, Math.round(_emailContentWidth));
    const titleImgWidth = cardWidth;
    // Фон этой <td> — ctx.bodyBg (фон страницы письма), не containerBg.
    // Плашка скруглена по всем 4 углам (см. renderTableTitleToDataUrl):
    // нижние два угла закрашены containerBg прямо в PNG (задуманный эффект —
    // полоска карточки выглядывает из-под низа плашки), а верхние два
    // остаются прозрачными — под ними просвечивает именно фон этой <td>,
    // то есть фон страницы письма (внешняя верхняя граница карточки).
    const titleBarHTML = s.renderedTitleBar
        ? `
        <tr>
            <td style="padding:0; line-height:0; font-size:0; background-color:${ctx.bodyBg};">
                <img src="${s.renderedTitleBar}" alt="" width="${titleImgWidth}" style="${getImageStyle(titleImgWidth, 'width:100%;')}">
            </td>
        </tr>`
        : '';

    // Нижняя "крышка" карточки — растровая полоса со скруглёнными нижними
    // углами (см. imageRenderers.js renderTableBottomCapToDataUrl). Нужна
    // потому что Outlook игнорирует CSS border-radius на самой таблице ниже.
    //
    // Если крышка ещё не сохранена в settings (старый шаблон, сделанный до
    // появления этой функции, либо блок ни разу не трогали в панели
    // "Карточка" после её добавления) — рендерим её здесь же, при экспорте
    // письма. renderTableBottomCapToDataUrl не грузит внешние картинки, её
    // callback вызывается синхронно, поэтому results доступен сразу же —
    // это гарантирует, что крышка есть ВСЕГДА, не полагаясь на то, что
    // где-то в UI успел сработать нужный триггер перерисовки.
    let bottomCapSrc = s.renderedBottomCap;
    if (!bottomCapSrc && containerRadius > 0 && typeof renderTableBottomCapToDataUrl === 'function') {
        renderTableBottomCapToDataUrl({ settings: s }, (dataUrl) => { bottomCapSrc = dataUrl; });
    }

    // Фон этой <td> — НЕ containerBg. Крышка сама залита containerBg и
    // обрезает только нижние углы, оставляя их прозрачными — скругление
    // видно, только если под вырезом другой цвет. Это внешняя граница
    // карточки (снизу уже ничего, кроме страницы письма), поэтому под
    // вырезом должен просвечивать фон страницы (ctx.bodyBg), а не сам
    // containerBg — иначе вырез сливается с заливкой и угол выглядит
    // прямым, хотя технически отрисован скруглённым.
    const bottomCapImgWidth = titleImgWidth;
    const bottomCapHTML = bottomCapSrc
        ? `
        <tr>
            <td style="padding:0; line-height:0; font-size:0; background-color:${ctx.bodyBg};">
                <img src="${bottomCapSrc}" alt="" width="${bottomCapImgWidth}" style="${getImageStyle(bottomCapImgWidth, 'width:100%; display:block;')}">
            </td>
        </tr>`
        : '';

    // Padding — прямо на <td>, не на вложенном <div>: Outlook (движок Word)
    // ненадёжно уважает padding на обычных <div>, особенно левый (см. тот же
    // приём в dividerRow чуть выше). Раздутие таблицы за 600px, которого
    // опасался прежний div-приём, тут не грозит: внутренняя таблица уже
    // на table-layout:fixed — ширина колонок берётся из width% первой
    // строки, а padding только сокращает доступное место под контент
    // внутри уже фиксированной ширины ячейки, не раздвигая колонку.
    // word-break/overflow-wrap: на table-layout:fixed ширина колонки не
    // растёт от контента, но БЕЗ этих свойств слово без пробелов (длинный
    // тестовый набор символов, ссылка и т.п.) не переносится и вылезает за
    // рамки ячейки — обычный перенос по пробелам работает и без этого, а
    // вот разрыв ВНУТРИ слова нужно включать явно.
    const wrapStyle = 'word-break:break-word; overflow-wrap:break-word; hyphens:auto;';
    // Авто-контраст текста под containerBg, если цвет не задан вручную —
    // тот же приём, что и resolveBlockTextColor() выше для text/heading/list.
    const headerTextColor = s.headerTextColor || (isLightColorPreview(containerBg) ? '#00204A' : '#ffffff');
    const bodyTextColor = s.textColor || (isLightColorPreview(containerBg) ? '#334155' : '#ffffff');
    const headerCellsHTML = columns.map((col, i) => {
        const isLastCol = i === columns.length - 1;
        return `
                <td style="width:${widths[i]}%; padding:${cellPaddingV}px ${cellPaddingH}px; font-weight:bold; font-size:${headerFontSize}px; color:${headerTextColor}; font-family:${fontFamily}; text-align:${cellTextAlign}; ${wrapStyle}${isLastCol ? '' : ` border-right:2px solid ${dividerColor};`}">
                    ${renderCell(col)}
                </td>`;
    }).join('');

    const bodyRowsHTML = rows.map((row, rowIndex) => {
        const isLastRow = rowIndex === rows.length - 1;
        const cellsHTML = columns.map((col, colIndex) => {
            const isLastCol = colIndex === columns.length - 1;
            const borderRight = isLastCol ? '' : `border-right:2px solid ${dividerColor};`;
            return `
                <td style="width:${widths[colIndex]}%; padding:${cellPaddingV}px ${cellPaddingH}px; font-size:${fontSize}px; line-height:${lineHeight}; color:${bodyTextColor}; font-family:${fontFamily}; text-align:${cellTextAlign}; ${wrapStyle} ${borderRight}">
                    ${renderCell(row[colIndex])}
                </td>`;
        }).join('');
        return `<tr>${cellsHTML}</tr>${isLastRow ? '' : dividerRow(1)}`;
    }).join('');

    // Пиксельный width="${cardWidth}" на обеих таблицах карточки, а не
    // width="100%" — по той же причине, что и у <img> выше: Outlook
    // ненадёжно считает вложенные проценты, из-за чего плоская часть
    // карточки (100%-таблицы) может отрендериться шире/со сдвигом
    // относительно плашки/крышки (у них жёсткий пиксельный width) и
    // вылезти за их границы либо продублироваться отдельным слоем фона.
    return `
        <tr>
            <td style="${getPadding()}">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${cardWidth}" style="width:${cardWidth}px;">
                    ${titleBarHTML}
                    <tr>
                        <td style="padding:15px 0 20px; background-color:${containerBg};">
                            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${cardWidth}" style="width:${cardWidth}px; border-collapse:collapse; table-layout:fixed;">
                                <tr>${headerCellsHTML}</tr>
                                ${dividerRow(2)}
                                ${bodyRowsHTML}
                            </table>
                        </td>
                    </tr>
                    ${bottomCapHTML}
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
    const adaptedColor = resolveBlockTextColor(s, ctx, 'textColor');
    const textContent = TextSanitizer.render(TextSanitizer.sanitize(s.text || '', true), ctx.linkColor);
    const textCellAccent = iconSrc
        ? 'padding-left:0;'
        : `border-left:4px solid ${borderColor}; padding-left:12px;`;
    const textCellClass = iconSrc
        ? 'email-text email-important-cell'
        : 'email-text email-important-cell email-important-cell--accent';

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
                        <td valign="middle" class="${textCellClass}" style="font-size:${fontSize}px; line-height:${lineHeight}; color:${adaptedColor}; font-family:${fontFamily}; ${textCellAccent}">
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

    // Если блок лежит в колонке (columns_container передаёт свою реальную
    // ширину через parentContentWidth, см. generateColumnsHTML) — картинка
    // не должна превышать эту ширину, иначе она рендерится на полную
    // ширину письма (LAYOUT.TABLE_WIDTH) независимо от узкой колонки и
    // физически вылезает за её границы.
    const ctx = getCurrentEmailRenderContext();
    const maxWidth = ctx.parentContentWidth || LAYOUT.TABLE_WIDTH;
    const width = Math.min(s.renderedWidth || maxWidth, maxWidth);

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
 * Генерирует HTML свободного блока (PNG из canvas)
 */
function generateCanvasBlockHTML(s) {
    if (!s) return '';
    if (s.renderedCanvas) {
        return `
        <tr>
            <td style="padding:0;font-size:0;line-height:0;">
                <img src="${s.renderedCanvas}" width="600" style="display:block;max-width:100%;height:auto;border:0;" alt="">
            </td>
        </tr>`;
    }
    // Заглушка если ещё не отрендерен
    const h = s.height || 250;
    const bgEnabled = s.bgEnabled !== false;
    const bgStyle = bgEnabled ? `background-color:${s.bgColor || '#1D2533'};` : '';
    return `
        <tr>
            <td style="padding:0;height:${h}px;${bgStyle}"></td>
        </tr>`;
}

/**
 * Генерирует HTML для колонок
 * Gap только между колонками (первая без левого отступа, последняя без правого)
 */
function generateColumnsHTML(block) {
    if (!block || !block.columns) return '';

    const s = block.settings || {};
    // По умолчанию совпадает с canvasRenderer.js renderColumnsPreview
    // (.columns-container/.column-content { gap:12px } в modular-styles.css) —
    // раньше тут было жёстко 10px, не совпадало с канвасом.
    const columnGap = s.colGap ?? 12; // Отступ между колонками (px)
    const blockGap = s.blockGap ?? 12; // Отступ между блоками внутри колонки (px)
    const totalColumns = block.columns.length;

    // Vertical alignment of content within the row
    const valign = s.colValign || 'top';

    // Передаём фон контейнера дочерним блокам через контекст рендера
    const containerBgColor = (s.bgEnabled !== false && s.bgColor) ? s.bgColor : null;
    const savedCtx = CURRENT_EMAIL_RENDER_CONTEXT;
    if (containerBgColor) {
        CURRENT_EMAIL_RENDER_CONTEXT = Object.assign(
            {}, savedCtx || buildEmailRenderContext(), { parentBgColor: containerBgColor }
        );
    }

    // Спейсер-строка между блоками внутри одной колонки — сами блоки
    // выводятся как <tr> (email-таблица), склеить их напрямую как div'ы
    // с CSS gap нельзя, поэтому вставляем отдельную строку нужной высоты.
    const blockGapRow = blockGap > 0
        ? `<tr><td style="padding:0; height:${blockGap}px; font-size:0; line-height:0; mso-line-height-rule:exactly;">&nbsp;</td></tr>`
        : '';

    const columnsContent = block.columns.map((column, index) => {
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

        // _emailContentWidth учитывает padding (3-колонный layout) при генерации письма.
        // padding и width на одной <td> в email складываются (content-box,
        // как и у таблицы — см. generateTableHTML выше в этом файле), поэтому
        // паддинг вычитается из width, иначе ряд из 3+ колонок раздувается
        // за пределы письма на суммарную ширину зазоров между колонками.
        const width = Math.max(1, Math.round(_emailContentWidth * column.width / 100) - paddingLeft - paddingRight);

        console.log(`[COLUMNS] Column ${index}: width=${column.width}% -> ${width}px (contentW=${_emailContentWidth})`);

        // Передаём реальную ширину ЭТОЙ колонки дочерним блокам через контекст —
        // иначе, например, "Изображение" без явно заданного renderedWidth
        // рендерится на LAYOUT.TABLE_WIDTH (600px, вся ширина письма)
        // независимо от того, что оно лежит в узкой колонке, и физически
        // вылезает за её границы (см. generateImageHTML). Сохраняем/
        // восстанавливаем ПОКОЛОНОЧНО (не одним save/restore на весь .map(),
        // как parentBgColor выше) — у каждой колонки своя ширина.
        const savedColumnCtx = CURRENT_EMAIL_RENDER_CONTEXT;
        CURRENT_EMAIL_RENDER_CONTEXT = Object.assign(
            {}, savedColumnCtx || buildEmailRenderContext(), { parentContentWidth: width }
        );
        const columnBlocks = column.blocks
            .map((childBlock, blockIndex) => (blockIndex > 0 ? blockGapRow : '') + generateBlockHTML(childBlock))
            .join('');
        CURRENT_EMAIL_RENDER_CONTEXT = savedColumnCtx;

        // column.valign (если задан в панели настроек) переопределяет общее
        // выравнивание ряда для этой конкретной колонки.
        const columnValign = column.valign || valign;

        return `
            <td valign="${columnValign}" width="${width}" style="padding:0 ${paddingRight}px 0 ${paddingLeft}px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                    ${columnBlocks}
                </table>
            </td>
        `;
    }).join('');

    // Восстанавливаем контекст после рендера детей
    CURRENT_EMAIL_RENDER_CONTEXT = savedCtx;

    const innerRow = `
        <tr>
            <td style="padding:0;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="table-layout:fixed;">
                    <tr>
                        ${columnsContent}
                    </tr>
                </table>
            </td>
        </tr>
    `;
    const bgCap = typeof CapabilityRegistry !== 'undefined' ? CapabilityRegistry.get('background') : null;
    const bgActive = !!(bgCap && bgCap.wrapEmail && s.bgEnabled !== false && s.bgColor);

    if (bgActive && s.bgFullWidth) {
        // Фон растягивается на всю ширину письма (TABLE_WIDTH), а сами колонки
        // остаются на текущей позиции: боковой contentPadding переносим внутрь фона —
        // сам блок выводится с colspan="3" в generateEmailHTML() (как баннер).
        //
        // bgCap.wrapEmail() ниже добавляет padding подложки (s.bgPadding)
        // СНАРУЖИ переданного контента — если строить [cp][content][cp] на
        // полные TABLE_WIDTH (600), после обёртки в wrapEmail итоговая
        // ширина станет 600 + 2×bgPadding, вылезая за пределы письма.
        // Поэтому здесь целимся не в TABLE_WIDTH, а в TABLE_WIDTH за
        // вычетом будущего padding подложки — так после wrapEmail сумма
        // снова точно совпадёт с TABLE_WIDTH.
        const bgPadding = Number(s.bgPadding) || 0;
        const targetWidth = Math.max(1, LAYOUT.TABLE_WIDTH - bgPadding * 2);
        const cp = Math.round((targetWidth - _emailContentWidth) / 2);
        const contentRow = cp > 0 ? `
            <tr>
                <td width="${cp}" style="width:${cp}px;min-width:${cp}px;padding:0;font-size:0;line-height:0;mso-line-height-rule:exactly;">&nbsp;</td>
                <td width="${_emailContentWidth}" style="width:${_emailContentWidth}px;padding:0;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${_emailContentWidth}">
                        ${innerRow}
                    </table>
                </td>
                <td width="${cp}" style="width:${cp}px;min-width:${cp}px;padding:0;font-size:0;line-height:0;mso-line-height-rule:exactly;">&nbsp;</td>
            </tr>
        ` : innerRow;
        return bgCap.wrapEmail(contentRow, s);
    }

    if (bgActive) return bgCap.wrapEmail(innerRow, s);
    return innerRow;
}

window.EmailPreviewTheme = EmailPreviewTheme;

function ensureSharedEmailPreviewModal(options = {}) {
    const {
        title = 'Превью письма',
    } = options;

    let modal = document.getElementById('email-preview-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'email-preview-modal';
        modal.className = 'modal';
        modal.style.display = 'none';
        modal.innerHTML = `
            <div class="modal-overlay"></div>
            <div class="modal-content modal-email-preview">
                <div class="modal-header">
                    <h2 id="email-preview-title">${escapeHtml(title)}</h2>
                    <div class="modal-header-actions">
                        <div id="email-preview-theme-slot"></div>
                        <button id="email-preview-close" type="button" class="modal-close" aria-label="Закрыть">&times;</button>
                    </div>
                </div>
                <div class="modal-body modal-email-preview__body">
                    <div id="email-preview-container" class="preview-container preview-container--email"></div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const closeModal = () => {
            modal.style.display = 'none';
        };

        const closeButton = modal.querySelector('#email-preview-close');
        const overlay = modal.querySelector('.modal-overlay');
        closeButton?.addEventListener('click', closeModal);
        overlay?.addEventListener('click', closeModal);
        modal.addEventListener('click', (event) => {
            if (event.target === modal) {
                closeModal();
            }
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && modal.style.display === 'flex') {
                closeModal();
            }
        });
    }

    const titleNode = document.getElementById('email-preview-title');
    if (titleNode) {
        titleNode.textContent = title;
    }

    const themeSlot = document.getElementById('email-preview-theme-slot');
    if (themeSlot && typeof window.EmailPreviewTheme?.mount === 'function') {
        themeSlot.innerHTML = '';
        window.EmailPreviewTheme.mount(themeSlot);
    }

    return modal;
}

function sharedRenderEmailPreviewFrame(container, html) {
    if (!container) return;

    container.innerHTML = '';

    const frame = document.createElement('iframe');
    frame.className = 'email-preview-frame';
    frame.setAttribute('sandbox', 'allow-same-origin');
    frame.style.cssText = [
        'display:block;',
        'width:100%;',
        'min-height:100%;',
        'border:none;',
        'background:#ffffff;',
        'border-radius:8px;',
    ].join('');
    frame.srcdoc = html;

    const resizeFrame = () => {
        try {
            const frameDocument = frame.contentDocument;
            if (!frameDocument) return;
            const documentElement = frameDocument.documentElement;
            const body = frameDocument.body;
            if (!documentElement || !body) return;

            const contentHeight = Math.max(
                body.scrollHeight,
                body.offsetHeight,
                documentElement.scrollHeight,
                documentElement.offsetHeight
            );
            const containerHeight = container.clientHeight || 640;
            frame.style.height = `${Math.max(contentHeight, containerHeight)}px`;
        } catch (_) {}
    };

    frame.addEventListener('load', () => {
        resizeFrame();
        window.requestAnimationFrame(resizeFrame);
        window.setTimeout(resizeFrame, 100);
    });

    container.appendChild(frame);
}

function openSharedEmailPreviewModal(options = {}) {
    const {
        html = '',
        title = 'Превью письма',
    } = options;

    const modal = ensureSharedEmailPreviewModal({ title });
    const container = document.getElementById('email-preview-container');
    if (!modal || !container) return;

    sharedRenderEmailPreviewFrame(container, html);
    modal.style.display = 'flex';
}

function closeSharedEmailPreviewModal() {
    const modal = document.getElementById('email-preview-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function isSharedEmailPreviewOpen() {
    const modal = document.getElementById('email-preview-modal');
    return modal?.style.display === 'flex';
}

window.ensureSharedEmailPreviewModal = ensureSharedEmailPreviewModal;
window.sharedRenderEmailPreviewFrame = sharedRenderEmailPreviewFrame;
window.openSharedEmailPreviewModal = openSharedEmailPreviewModal;
window.closeSharedEmailPreviewModal = closeSharedEmailPreviewModal;
window.isSharedEmailPreviewOpen = isSharedEmailPreviewOpen;
