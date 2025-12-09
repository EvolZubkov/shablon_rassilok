// blockPreview.js - Рендеринг превью блоков для canvas
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

    // 1) Markdown-ссылки [текст](url)
    html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
        '<a href="$2" style="color:#7700ff; text-decoration:underline;">$1</a>'
    );

    // 2) Email → mailto
    html = html.replace(/(^|\s)([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi,
        '$1<a href="mailto:$2" style="color:#7700ff; text-decoration:underline;">$2</a>'
    );

    // 3) Обычные ссылки http(s)
    html = html.replace(/(^|\s)(https?:\/\/[^\s<]+)/gi,
        '$1<a href="$2" style="color:#7700ff; text-decoration:underline;">$2</a>'
    );

    // 4) Переносы строк
    html = html.replace(/\n/g, '<br>');

    return html;
}

function renderBlockPreviewReal(block) {
    const s = block.settings;

    switch (block.type) {
        case 'banner':
            return renderBannerPreview(s);
        case 'text':
            return renderTextPreview(s);
        case 'heading':
            return renderHeadingPreview(s);
        case 'button':
            return renderButtonPreview(s);
        case 'list':
            return renderListPreview(s);
        case 'expert':
            return renderExpertPreview(s);
        case 'important':
            return renderImportantPreview(s);
        case 'divider':
            return renderDividerPreview(s);
        case 'image':
            return renderImagePreview(s);
        case 'spacer':
            return renderSpacerPreview(s);
        default:
            return '<p>Неизвестный блок</p>';
    }
}

function renderBannerPreview(s) {
    const src = s.renderedBanner || s.image;

    if (!src) {
        return `
            <div style="position:relative; min-height:150px; background:#374151; border-radius:4px; overflow:hidden;">
                <p style="padding:40px; text-align:left; color:#9ca3af;">Выберите баннер</p>
            </div>
        `;
    }

    return `
        <div style="position:relative; border-radius:4px; overflow:hidden;">
            <img src="${src}" style="display:block; width:100%; height:auto;">
        </div>
    `;
}

function renderTextPreview(s) {
    const fontFamily = resolveTextFontFamily(s);
    const textHTML = formatTextWithLinks(s.content || '');

    return `
        <div style="
            font-size:${s.fontSize}px;
            line-height:${s.lineHeight};
            text-align:${s.align};
            color:${s.color};
            font-family:${fontFamily};
            padding:8px;
        ">
            ${textHTML}
        </div>
    `;
}


function renderHeadingPreview(s) {
    return `
        <h3 style="font-size: ${s.size}px; 
                   font-weight: ${s.weight}; 
                   color: ${s.color}; 
                   text-align: ${s.align || 'left'};
                   font-family:${resolveTextFontFamily(s)};
                   margin: 0; 
                   padding: 8px;">
            ${s.text || 'Заголовок'}
        </h3>
    `;
}

function renderButtonPreview(s) {
    const scale = s.size || 1;

    const baseHeight = 40;
    const basePaddingY = 12;
    const basePaddingX = 24;
    const baseRadius = 6;
    const baseFont = 14;

    const buttonHeightPrev = baseHeight * scale;
    const paddingY = basePaddingY * scale;
    const paddingX = basePaddingX * scale;
    const radius = baseRadius * scale;
    const fontSize = baseFont * scale;

    const hasIconPrev = !!s.icon;
    const alignPrev = s.align || 'center';

    const iconBlockPrev = hasIconPrev ? `
        <div style="display:flex; align-items:center; justify-content:center; height:${buttonHeightPrev}px;">
            <img src="${s.icon}" style="display:block; height:${buttonHeightPrev}px; width:auto;">
        </div>
    ` : '';

    return `
        <div style="text-align: ${alignPrev}; ">
            <div style="display: inline-flex; align-items: stretch;">
                ${iconBlockPrev}
                <a href="${s.url || '#'}"
                   style="display: inline-flex; align-items: center; justify-content: center;
                          background: ${s.color}; color: ${s.textColor};
                          padding: ${paddingY}px ${paddingX}px; border-radius: ${radius}px;
                          text-decoration: none; font-weight: 600; font-size: ${fontSize}px;">
                    ${s.text || 'Кнопка'}
                </a>
            </div>
        </div>
    `;
}


function renderListPreview(s) {
    const bulletSizePrev = s.bulletSize || 20;
    const bulletGapPrev = s.bulletGap ?? 10;
    const fontSizePrev = s.fontSize || 14;
    const lineHeightPrev = s.lineHeight || 1.0;
    const cellWidthPrev = bulletSizePrev + bulletGapPrev + 2;

    const isNumbered = s.listStyle === 'numbered';

    return `
        <div style="padding: 8px;">
            <table style="width: 100%;">
                ${(s.items || []).map((item, index) => {
        const formatted = (item || '').replace(/\n/g, '<br>');

        let bulletHTML;

        // Если нумерованный список и есть отрендеренные буллеты - используем их
        if (isNumbered && s.renderedBullets && s.renderedBullets[index]) {
            bulletHTML = `<img src="${s.renderedBullets[index]}" style="display:block;width:${bulletSizePrev}px;height:${bulletSizePrev}px;">`;
        } else {
            // Иначе генерируем на лету
            const bulletSrcPrev = s.bulletCustom || (BULLET_TYPES.find(b => b.id === s.bulletType)?.src || '');
            const numberFontSize = Math.max(10, Math.round(bulletSizePrev * 0.3));

            const baseBullet = bulletSrcPrev
                ? `<img src="${bulletSrcPrev}" style="display:block;width:${bulletSizePrev}px;height:${bulletSizePrev}px;">`
                : `<span style="display:inline-block;width:${bulletSizePrev}px;height:${bulletSizePrev}px;border-radius:999px;background-color:#a855f7;"></span>`;

            if (isNumbered) {
                const num = index + 1;
                const numLabel = num < 10 ? '0' + num : String(num);

                bulletHTML = `
                                <div style="position:relative;width:${bulletSizePrev}px;height:${bulletSizePrev}px;display:flex;align-items:center;justify-content:center;">
                                    ${baseBullet}
                                    <div style="
                                        position:absolute;left:0;top:0;right:0;bottom:0;
                                        display:flex;align-items:center;justify-content:center;
                                        font-size:${numberFontSize}px;font-weight:600;color:#ffffff;
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
                            <td style="width:${cellWidthPrev}px; padding:${(s.itemSpacing ?? 8) / 2}px ${bulletGapPrev}px; vertical-align: middle;">
                                ${bulletHTML}
                            </td>
                            <td style="font-size:${fontSizePrev}px; line-height:${lineHeightPrev}; color:#e5e7eb; padding:${(s.itemSpacing ?? 8) / 2}px 0;">
                                ${formatted}
                            </td>
                        </tr>
                    `;
    }).join('')}
            </table>
        </div>
    `;
}
function renderExpertPreview(s) {
    // Если есть отрендеренная версия - используем её!
    if (s.renderedExpert) {
        const bg = s.bgColor && s.bgColor !== 'transparent' ? s.bgColor : 'transparent';
        return `
            <div style="background: ${bg}; border-radius: 6px; padding: 8px;">
                <img src="${s.renderedExpert}" style="display: block; width: 100%; height: auto;">
            </div>
        `;
    }

    // Fallback: если не отрендерено - показываем CSS версию
    const badgeHTML = s.badgeIcon ? `
        <div style="position: absolute; bottom: 5px; right: -10px; width: 45px; height: 45px; display: flex; align-items: center; justify-content: center;">
            <img src="${s.badgeIcon}" style="width: 100%; height: 100%; display: block;">
        </div>
    ` : '';

    const bg = s.bgColor && s.bgColor !== 'transparent'
        ? s.bgColor
        : 'transparent';

    // Вертикальный layout
    if (s.verticalLayout) {
        return `
            <div style="display: flex; flex-direction: column; align-items: center; padding: 16px; background: ${bg}; border-radius: 6px;">
                <div style="position: relative; width: 100px; height: 100px; flex-shrink: 0; margin-bottom: 12px;">
                    <div style="width: 100%; height: 100%; border-radius: 45%; overflow: hidden; transform: rotate(45deg); border: 2px solid #374151;">
                        <img src="${s.photo}" style="width: 100%; height: 100%; object-fit: cover; display: block; transform: rotate(-45deg) scale(${s.scale / 100}) translate(${s.positionX}%, ${s.positionY}%);">
                    </div>
                    ${badgeHTML}
                </div>
                <div style="width: 100%; color: ${s.textColor}; font-size: 13px; line-height: 1.6; text-align: left;">
                    <div style="font-weight: 600; font-size: 15px; margin-bottom: 4px; color: ${s.nameColor};">
                        ${s.name || 'Имя эксперта'}
                    </div>
                    <div style="margin-bottom: 8px; color: ${s.titleColor}; font-size: 12px;">
                        ${s.title || 'Должность'}
                    </div>
                    <div style="text-align: left;">${s.bio || 'Описание'}</div>
                </div>
            </div>
        `;
    }

    // Горизонтальный layout (по умолчанию)
    return `
        <div style="display: flex; gap: 16px; padding: 12px; background: ${bg}; border-radius: 6px;">
            <div style="position: relative; width: 100px; height: 100px; flex-shrink: 0;">
                <div style="width: 100%; height: 100%; border-radius: 45%; overflow: hidden; transform: rotate(45deg); border: 2px solid #374151;">
                    <img src="${s.photo}" style="width: 100%; height: 100%; object-fit: cover; display: block; transform: rotate(-45deg) scale(${s.scale / 100}) translate(${s.positionX}%, ${s.positionY}%);">
                </div>
                ${badgeHTML}
            </div>
            <div style="flex: 1; color: ${s.textColor}; font-size: 13px; line-height: 1.6;">
                <div style="font-weight: 600; font-size: 15px; margin-bottom: 4px; color: ${s.nameColor};">
                    ${s.name || 'Имя эксперта'}
                </div>
                <div style="margin-bottom: 8px; color: ${s.titleColor}; font-size: 12px;">
                    ${s.title || 'Должность'}
                </div>
                <div>${s.bio || 'Описание'}</div>
            </div>
        </div>
    `;
}
function renderImportantPreview(s) {
    const iconSrc = s.renderedIcon || s.icon;
    const fontSize = s.fontSize ?? 13;
    const lineHeight = s.lineHeight ?? 1;
    const borderColor = s.borderColor || '#a855f7';

    const iconHTML = iconSrc ? `
        <div style="flex-shrink: 0; width: 60px; padding-right: 12px;">
            <img src="${iconSrc}" style="width: 100%; height: auto; display: block;">
        </div>
    ` : '';

    return `
        <div style="display: flex; align-items: center; gap: 12px; padding: 16px 0;
                    color: ${s.textColor}; 
                    font-size: ${fontSize}px; line-height: ${lineHeight};">
            ${iconHTML}
            <div style="flex: 1;">
                <span style="color:${borderColor}; font-weight:bold;">Важно!</span> ${(s.text || '').replace(/\n/g, '<br>')}
            </div>
        </div>
    `;
}
function renderDividerPreview(s) {
    return `<hr style="border: none; border-top: ${s.height}px solid ${s.color}; margin: 16px 0;">`;
}

function renderImagePreview(s) {
    const src = s.renderedImage || s.src;
    
    if (!src) {
        return '<p style="padding: 40px; text-align: center; color: #9ca3af; background: #374151; border-radius: 4px;">Загрузите изображение</p>';
    }
    
    // Если есть отрендеренная версия, показываем её с правильной шириной
    if (s.renderedImage && s.renderedWidth) {
        return `
            <div style="padding: 8px; text-align: ${s.align || 'center'};">
                <img src="${src}" alt="${s.alt}" style="width: ${s.renderedWidth}px; max-width: 100%; height: auto; display: inline-block;">
            </div>
        `;
    }
    
    // Fallback: показываем оригинал с настройками
    return `
        <div style="padding: 8px; text-align: ${s.align || 'center'};">
            <img src="${src}" alt="${s.alt}" style="max-width: 100%; width: ${s.width}; border-radius: 4px; display: inline-block;">
        </div>
    `;
}
function renderSpacerPreview(s) {
    return `<div style="height: ${s.height}px; background: repeating-linear-gradient(90deg, #374151 0, #374151 1px, transparent 1px, transparent 10px); opacity: 0.3;"></div>`;
}