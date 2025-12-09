// emailGenerator.js - Генерация финального HTML письма
function resolveTextFontFamily(s) {
    if (!s) return "inherit";
    const type = s.fontFamily || 'default';

    if (type === 'custom' && s.customFontFamily) {
        return `${s.customFontFamily}, Arial, sans-serif`;
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

function formatTextWithLinks(raw) {
    if (!raw) return '';
    
    let html = raw;

    // 0. Обработка жирного текста **текст**
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // 1. Markdown-ссылки: [текст](что-угодно)
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, urlRaw) => {
        const urlTrim = urlRaw.trim();
        let href;

        if (/^mailto:/i.test(urlTrim)) {
            // уже mailto:
            href = urlTrim;
        } else if (/^https?:\/\//i.test(urlTrim)) {
            // уже полный http/https
            href = urlTrim;
        } else if (/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(urlTrim)) {
            // похоже на email
            href = 'mailto:' + urlTrim;
        } else {
            // всё остальное считаем доменом / URL без схемы
            href = 'https://' + urlTrim;
        }

        const safeText = text.replace(/[<>]/g, c => (c === '<' ? '&lt;' : '&gt;'));
        return `<a href="${href}" style="color:#7700ff; text-decoration:underline;">${safeText}</a>`;
    });

    // 2. Авто email → mailto
    html = html.replace(
        /(^|\s)([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi,
        '$1<a href="mailto:$2" style="color:#7700ff; text-decoration:underline;">$2</a>'
    );

    // 3. Авто http/https ссылки
    html = html.replace(
        /(^|\s)(https?:\/\/[^\s<]+)/gi,
        '$1<a href="$2" style="color:#7700ff; text-decoration:underline;">$2</a>'
    );

    // 4. Авто «голые» домены (saratov.ru, www.saratov.ru)
    html = html.replace(
        /(^|\s)((?:www\.)?[A-Za-z0-9.-]+\.[A-Za-z]{2,})(?![^<]*>)/gi,
        '$1<a href="https://$2" style="color:#7700ff; text-decoration:underline;">$2</a>'
    );

    // 5. Переносы строк
    html = html.replace(/\n/g, '<br>');

    return html;
}


function generateEmailHTML() {
    const { BODY_BG, TEXT_COLOR, TABLE_WIDTH, FONT_FAMILY } = EMAIL_STYLES;

    let html = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<title>Email</title>

</head>
<body style="margin:0; padding:0; background-color:${BODY_BG}; font-family: ${FONT_FAMILY};">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${BODY_BG};">
  <tr><td align="center">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${TABLE_WIDTH}" style="max-width:${TABLE_WIDTH}px; background-color:${BODY_BG}; color:${TEXT_COLOR};">
`;

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

function generateBlockHTML(block) {
    if (block.columns) {
        return generateColumnsHTML(block);
    }

    const s = block.settings;

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

function generateBannerHTML(s) {
    const src = s.renderedBanner || s.image;
    if (!src) return '';

    return `
        <tr>
            <td align="center" style="padding:0;">
                <img src="${src}" alt="" width="600" style="display:block; width:100%; max-width:600px; height:auto; border:0; outline:none; text-decoration:none;">
            </td>
        </tr>
    `;
}

function generateTextHTML(s) {
    const textHTML = formatTextWithLinks(s.content || '');
    const fontFamily = resolveTextFontFamily(s);

    return `
        <tr>
          <td style="
              padding:16px 24px;
              font-size:${s.fontSize}px;
              line-height:${s.lineHeight};
              text-align:${s.align};
              color:${s.color};
              font-family:${fontFamily};
          ">
            ${textHTML}
          </td>
        </tr>
    `;
}


function generateHeadingHTML(s) {
    const fontFamily = resolveTextFontFamily(s);
    return `
        <tr><td style="padding:16px 24px; font-size:${s.size}px; font-weight:${s.weight}; color:${s.color}; text-align:${s.align || 'left'}; font-family:${fontFamily};">
            ${s.text || ''}
        </td></tr>
    `;
}
function generateButtonHTML(s) {
    const align = s.align || 'center';
    const src = s.renderedButton; // сюда кладём dataURL из renderButtonToDataUrl

    // Если картинка кнопки уже отрендерена — используем её
    if (src) {
        return `
            <tr>
                <td align="${align}" style="padding:16px 24px; text-align:${align};">
                    <a href="${s.url || '#'}" style="text-decoration:none; display:inline-block;">
                        <img src="${src}"
                             alt="${s.text || ''}"
                             style="display:block; border:0; outline:none; text-decoration:none; height:auto; max-width:100%;">
                    </a>
                </td>
            </tr>
        `;
    }
}
function generateListHTML(s) {
    const bulletSize = s.bulletSize || 20;
    const bulletGap = s.bulletGap ?? 10;
    const fontSize = s.fontSize || 14;
    const lineHeight = s.lineHeight || 1.0;
    const cellWidth = bulletSize + bulletGap + 2;
    const fontFamily = resolveTextFontFamily(s);

    const isNumbered = s.listStyle === 'numbered';

    const listItems = (s.items || []).map((item, index) => {
        const formatted = (item || '').replace(/\n/g, '<br>');

        let bulletHTML;

        // Если список нумерованный и есть отрендеренные буллеты - используем их
        if (isNumbered && s.renderedBullets && s.renderedBullets[index]) {
            bulletHTML = `<img src="${s.renderedBullets[index]}" alt="" width="${bulletSize}" height="${bulletSize}" style="display:block;">`;
        } else {
            // Иначе генерируем буллет на лету
            const bulletSrc = s.bulletCustom || (BULLET_TYPES.find(b => b.id === s.bulletType)?.src || '');
            const numberFontSize = Math.max(10, Math.round(bulletSize * 0.3));

            const baseBullet = bulletSrc
                ? `<img src="${bulletSrc}" alt="" width="${bulletSize}" height="${bulletSize}" style="display:block;">`
                : `<span style="display:inline-block;width:${bulletSize}px;height:${bulletSize}px;border-radius:999px;background-color:#a855f7;"></span>`;

            if (isNumbered) {
                const num = index + 1;
                const numLabel = num < 10 ? '0' + num : String(num);

                bulletHTML = `
                    <div style="position:relative;width:${bulletSize}px;height:${bulletSize}px;display:flex;align-items:center;justify-content:center;">
                        ${baseBullet}
                        <div style="
                            position:absolute;left:0;top:0;right:0;bottom:0;
                            display:flex;align-items:center;justify-content:center;
                            font-size:${numberFontSize}px;font-weight:bold;color:#ffffff;
                        ">
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
                <td valign="middle" width="${cellWidth}" style="padding:${(s.itemSpacing ?? 8) / 2}px ${bulletGap}px;">
                    ${bulletHTML}
                </td>
                <td valign="middle" style="font-size:${fontSize}px; line-height:${lineHeight}; color:#e5e7eb; padding:${(s.itemSpacing ?? 8) / 2}px 0; font-family:${fontFamily};">
                    ${formatted}
                </td>
            </tr>
        `;
    }).join('');

    return `
        <tr><td style="padding:16px 24px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                ${listItems}
            </table>
        </td></tr>
    `;
}
function generateExpertHTML(s) {
    const src = s.renderedExpert;
    if (!src) {
        return '';
    }

    const width = s.renderedExpertWidth || 600;

    return `
        <tr>
            <td align="center" style="padding:16px 24px;;">
                <img src="${src}" alt="${s.name || ''}" width="${width}"
                     style="display:block; width:100%; max-width:${width}px; height:auto; border:0; outline:none; text-decoration:none;">
            </td>
        </tr>
    `;
}

function generateImportantHTML(s) {
    const iconSrc = s.renderedIcon || s.icon;
    const fontFamily = resolveTextFontFamily(s);
    const fontSize = s.fontSize ?? 13;
    const lineHeight = s.lineHeight ?? 1;
    const borderColor = s.borderColor || '#a855f7';

    const iconHTML = iconSrc ? `
        <td valign="middle" style="padding:0 16px 0 0; width:60px; min-width:60px; max-width:60px;">
            <img src="${iconSrc}" alt="" style="display:block; width:60px !important; max-width:60px !important; height:auto;">
        </td>
    ` : '';

    return `
        <tr><td style="padding:16px 24px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                    ${iconHTML}
                    <td valign="middle" style="font-size:${fontSize}px; line-height:${lineHeight}; color:${s.textColor}; font-family:${fontFamily};">
                        <span style="color:${borderColor}; font-weight:bold;">Важно!</span> ${(s.text || '').replace(/\n/g, '<br>')}
                </tr>
            </table>
        </td></tr>
    `;
}


function generateDividerHTML(s) {
    return `
        <tr><td style="padding:16px 24px;">
            <hr style="border:none; border-top:${s.height}px solid ${s.color}; margin:0;">
        </td></tr>
    `;
}

function generateImageHTML(s) {
    console.log('[EMAIL GEN] generateImageHTML called with settings:', {
        hasRenderedImage: !!s.renderedImage,
        renderedImageLength: s.renderedImage ? s.renderedImage.length : 0,
        renderedWidth: s.renderedWidth,
        renderedHeight: s.renderedHeight,
        hasSrc: !!s.src,
        srcLength: s.src ? s.src.length : 0,
        width: s.width,
        align: s.align
    });

    const src = s.renderedImage || s.src;
    const align = s.align || 'center';

    if (!src) {
        console.log('[EMAIL GEN] No source, returning empty');
        return '';
    }

    // Используем отрендеренную картинку - она УЖЕ нужного размера (max 600px)
    // КРИТИЧНО для Outlook: используем HTML атрибут width (БЕЗ height для auto-пропорций!)
    if (s.renderedImage && s.renderedWidth) {
        console.log('[EMAIL GEN] Using RENDERED image with width:', s.renderedWidth);
        return `
            <tr><td align="${align}" style="padding:16px 24px;">
                <img src="${src}" alt="${s.alt || ''}" width="${s.renderedWidth}" style="display:block; max-width:${s.renderedWidth}px; height:auto; border:0;" border="0">
            </td></tr>
        `;
    }

    // Fallback: если не отрендерена
    console.log('[EMAIL GEN] Using ORIGINAL (fallback)');
    return `
        <tr><td align="${align}" style="padding:16px 24px;">
            <img src="${src}" alt="${s.alt || ''}" width="600" style="display:block; max-width:600px; height:auto; border-radius:4px;" border="0">
        </td></tr>
    `;
}


function generateSpacerHTML(s) {
    return `
        <tr><td style="padding:0; height:${s.height}px;"></td></tr>
    `;
}

function generateColumnsHTML(block) {
    if (!block.columns) return '';

    const columnsContent = block.columns.map(column => {
        const columnBlocks = column.blocks.map(childBlock => generateBlockHTML(childBlock)).join('');
        const width = Math.round(600 * column.width / 100) - 20;

        return `
            <td valign="middle" width="${width}" style="padding: 0;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                    ${columnBlocks}
                </table>
            </td>
        `;
    }).join('');

    return `
    <tr><td style="padding: 0;">
        <table role="presentation" cellpadding="0" cellspacing="10" border="0" width="100%">
            <tr>
                ${columnsContent}
            </tr>
        </table>
    </td></tr>
`;
}