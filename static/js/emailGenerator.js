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
async function generateEmailHTML() {
    const { BODY_BG, TEXT_COLOR, TABLE_WIDTH, FONT_FAMILY } = EMAIL_STYLES;

    // Конвертируем все base64 в URL перед генерацией
    for (let block of AppState.blocks) {
        await convertBlockImages(block);
    }

    let html = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light">
<title>Email</title>
<style>
/* Принудительная светлая тема ТОЛЬКО для email контента */
.email-wrapper {
    color-scheme: light only !important;
}

.email-wrapper * {
    color-scheme: light !important;
}

/* Отключаем темную тему только для email */
@media (prefers-color-scheme: dark) {
    .email-wrapper,
    .email-wrapper table,
    .email-wrapper td,
    .email-wrapper div,
    .email-wrapper p,
    .email-wrapper span {
        background-color: #ffffff !important;
    }
}

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
</style>
</head>
<body style="margin:0; padding:0; background-color:#ffffff; font-family: ${FONT_FAMILY};">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#ffffff;" class="email-wrapper">
  <tr><td align="center">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${TABLE_WIDTH}" style="max-width:${TABLE_WIDTH}px; background-color:#ffffff;">
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

    const textHTML = TextSanitizer.render(s.content || '', DEFAULT_COLORS.LINK);
    const fontFamily = resolveTextFontFamily(s);
    const adaptedColor = adaptColorForWhiteBackground(s.color);
    const fontSize = s.fontSize || LAYOUT.DEFAULT_FONT_SIZE;
    const lineHeight = s.lineHeight || LAYOUT.DEFAULT_LINE_HEIGHT;
    const lineHeightValue = typeof lineHeight === 'number' ? `${lineHeight * 100}%` : lineHeight;
    const align = s.align || 'left';

    return `
        <tr>
            <td style="${getPadding(0, LAYOUT.PADDING_H)} font-size:${fontSize}px; line-height:${lineHeightValue}; text-align:${align}; color:${adaptedColor}; font-family:${fontFamily};">
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

    const fontFamily = resolveTextFontFamily(s);
    const adaptedColor = adaptColorForWhiteBackground(s.color);
    const size = s.size || 24;
    const weight = s.weight || 'bold';
    const align = s.align || 'left';
    const text = escapeHtml(s.text || '');

    return `
        <tr>
            <td style="${getPadding()} font-size:${size}px; font-weight:${weight}; color:${adaptedColor}; text-align:${align}; font-family:${fontFamily};">
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

    const bulletSize = s.bulletSize || 20;
    const bulletGap = s.bulletGap ?? 10;
    const fontSize = s.fontSize || LAYOUT.DEFAULT_FONT_SIZE;
    const lineHeight = s.lineHeight || LAYOUT.DEFAULT_LINE_HEIGHT;
    const cellWidth = bulletSize + bulletGap + 2;
    const fontFamily = resolveTextFontFamily(s);
    const adaptedColor = adaptColorForWhiteBackground(s.textColor || '#e5e7eb');
    const itemSpacing = s.itemSpacing ?? 8;

    const isNumbered = s.listStyle === 'numbered';

    const listItems = (s.items || []).map((item, index) => {
        const formatted = TextSanitizer.render(
            typeof item === 'string' && item.trim().startsWith('<')
                ? item
                : TextSanitizer.sanitize(item || '', true),
            DEFAULT_COLORS.LINK
        );

        let bulletHTML;

        if (isNumbered && s.renderedBullets && s.renderedBullets[index]) {
            bulletHTML = `<img src="${s.renderedBullets[index]}" alt="" width="${bulletSize}" height="${bulletSize}" style="display:block;">`;
        } else {
            const bulletSrc = s.bulletCustom || ((BULLET_TYPES.find(b => b.id === s.bulletType) || BULLET_TYPES[0])?.src || '');
            const numberFontSize = Math.max(10, Math.round(bulletSize * 0.3));

            const baseBullet = bulletSrc
                ? `<img src="${bulletSrc}" alt="" width="${bulletSize}" height="${bulletSize}" style="display:block;">`
                : `<span style="display:inline-block; width:${bulletSize}px; height:${bulletSize}px; border-radius:999px; background-color:${DEFAULT_COLORS.BULLET};"></span>`;

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
                <td valign="middle" style="font-size:${fontSize}px; line-height:${lineHeight}; color:${adaptedColor}; padding:${itemSpacing / 2}px 0; font-family:${fontFamily};">
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

    const iconSrc = s.renderedIcon || s.icon;
    const fontFamily = resolveTextFontFamily(s);
    const fontSize = s.fontSize ?? 14;
    const lineHeight = s.lineHeight ?? 1;
    const borderColor = s.borderColor || DEFAULT_COLORS.BORDER;
    const adaptedColor = adaptColorForWhiteBackground(s.textColor);
    const textContent = TextSanitizer.render(s.text || '', DEFAULT_COLORS.LINK);

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
                        <td valign="middle" style="font-size:${fontSize}px; line-height:${lineHeight}; color:${adaptedColor}; font-family:${fontFamily};">
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