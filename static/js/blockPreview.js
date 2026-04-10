// blockPreview.js - Рендеринг превью блоков для canvas

function isLightColorPreview(hexColor) {
    const hex = (hexColor || '#000000').replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 128;
}

function resolveTextFontFamily(s) {
    if (!s) return "inherit";
    const type = s.fontFamily || 'default';

    if (type === 'custom' && s.customFontFamily) {
        return `${s.customFontFamily}, Arial, sans-serif`;
    }

    switch (type) {
        case 'rt-regular': return "'RostelecomBasis-Regular', Arial, sans-serif";
        case 'rt-medium':  return "'RostelecomBasis-Medium', Arial, sans-serif";
        case 'rt-bold':    return "'RostelecomBasis-Bold', Arial, sans-serif";
        case 'rt-light':   return "'RostelecomBasis-Light', Arial, sans-serif";
        default: return EMAIL_STYLES ? EMAIL_STYLES.FONT_FAMILY : "Arial, sans-serif";
    }
}

// ⚠️ formatTextWithLinks УДАЛЕНА — используем TextSanitizer.render()

function renderBlockPreviewReal(block) {
    const s = block.settings;

    switch (block.type) {
        case 'banner':    return renderBannerPreview(s);
        case 'text':      return renderTextPreview(s);
        case 'heading':   return renderHeadingPreview(s);
        case 'button':    return renderButtonPreview(s);
        case 'list':      return renderListPreview(s);
        case 'expert':    return renderExpertPreview(s);
        case 'important': return renderImportantPreview(s);
        case 'divider':   return renderDividerPreview(s);
        case 'image':     return renderImagePreview(s);
        case 'spacer':    return renderSpacerPreview(s);
        default:          return '<p>Неизвестный блок</p>';
    }
}

// ↓ ИЗМЕНЕНА — теперь использует TextSanitizer.render()
function renderTextPreview(s) {
    const fontFamily = resolveTextFontFamily(s);

    // s.content уже simple HTML — просто рендерим через TextSanitizer.render()
    const textHTML = TextSanitizer.render(s.content || '');

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

// ↓ ИЗМЕНЕНА — items тоже через TextSanitizer.render()
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
                    // item может быть plain text или simple HTML
                    const formatted = TextSanitizer.render(
                        typeof item === 'string' && item.startsWith('<')
                            ? item
                            : TextSanitizer.sanitize(item || '', true)
                    );

                    let bulletHTML;

                    if (isNumbered && s.renderedBullets && s.renderedBullets[index]) {
                        bulletHTML = `<img src="${s.renderedBullets[index]}" style="display:block;width:${bulletSizePrev}px;height:${bulletSizePrev}px;">`;
                    } else {
                        const bulletSrcPrev = s.bulletCustom || ((BULLET_TYPES.find(b => b.id === s.bulletType) || BULLET_TYPES[0])?.src || '');
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
                                    <div style="position:absolute;left:0;top:0;right:0;bottom:0;display:flex;align-items:center;justify-content:center;font-size:${numberFontSize}px;font-weight:600;color:#ffffff;">
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

// Все остальные функции остаются БЕЗ ИЗМЕНЕНИЙ
function renderBannerPreview(s) {
    const src = s.renderedBanner;

    if (!src) {
        const leftColor = s.leftBlockColor || '#1e293b';
        const hasRightImage = s.rightImage || s.rightImageCustom;
        const hasLogo = s.logo || s.logoCustom;
        const textElements = s.textElements || [];

        return `
            <div style="position:relative; min-height:150px; background:${leftColor}; border-radius:4px; overflow:hidden; padding: 20px;">
                <p style="color:#9ca3af; font-size: 13px; margin: 0;">
                    ${!hasRightImage ? '⚠️ Выберите картинку справа<br>' : ''}
                    ${!hasLogo ? '⚠️ Выберите логотип<br>' : ''}
                    ${textElements.length === 0 ? '⚠️ Добавьте текстовые элементы' : ''}
                    ${hasRightImage && hasLogo && textElements.length > 0 ? '⏳ Рендеринг...' : ''}
                </p>
            </div>
        `;
    }

    return `
        <div style="position:relative; border-radius:4px; overflow:hidden;">
            <img src="${src}" alt="Баннер" style="width:100%; height:auto; display:block;">
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

function normalizeButtonText(text) {
    return String(text || '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

function getButtonAutoStyle(settings = {}) {
    const normalizedText = normalizeButtonText(settings.text);
    const isMif = normalizedText === 'миф';
    const isAlpina = normalizedText === 'альпина';

    const color = isMif ? '#FFB608' : isAlpina ? '#A078FF' : (settings.color || '#f97316');
    const icon = isMif ? 'button-icons/Миф.png' : isAlpina ? 'button-icons/Альпина.png' : (settings.icon || '');

    return { isMif, isAlpina, isAuto: isMif || isAlpina, color, icon };
}

function renderButtonPreview(s) {
    const scale = s.size || 1;
    const baseHeight = 40, basePaddingY = 12, basePaddingX = 24, baseRadius = 6, baseFont = 14;
    const buttonHeightPrev = baseHeight * scale;
    const paddingY = basePaddingY * scale;
    const paddingX = basePaddingX * scale;
    const radius = baseRadius * scale;
    const fontSize = baseFont * scale;

    const autoStyle = getButtonAutoStyle(s);
    const previewColor = autoStyle.color;
    const previewIcon = autoStyle.icon;
    const hasIconPrev = !!(previewIcon && previewIcon !== 'none' && previewIcon.length > 0);
    const alignPrev = s.align || 'center';
    const textColor = autoStyle.isAuto ? '#ffffff' : (isLightColorPreview(previewColor) ? '#3F3E4B' : '#ffffff');

    const iconBlockPrev = hasIconPrev ? `
        <div style="display:flex; align-items:center; justify-content:center; height:${buttonHeightPrev}px;">
            <img src="${previewIcon}" style="display:block; height:${buttonHeightPrev}px; width:auto;">
        </div>
    ` : '';

    return `
        <div style="text-align: ${alignPrev};">
            <div style="display: inline-flex; align-items: stretch;">
                ${iconBlockPrev}
                <a href="${s.url || '#'}"
                    target="_blank"
                    onclick="event.stopPropagation();"
                    style="display: inline-flex; align-items: center; justify-content: center;
                          background: ${previewColor}; color: ${textColor};
                          padding: ${paddingY}px ${paddingX}px; border-radius: ${radius}px;
                          text-decoration: none; font-weight: 600; font-size: ${fontSize}px;">
                    ${s.text || 'Кнопка'}
                </a>
            </div>
        </div>
    `;
}

function renderExpertPreview(s) {
    const isLite = (s.variant || 'full') === 'lite';

    if (s.renderedExpert) {
        const bg = s.bgColor && s.bgColor !== 'transparent' ? s.bgColor : 'transparent';
        const w = s.renderedExpertWidth || 600;
        const align = s.align || 'left';
        const justify = align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start';

        return `
            <div style="background: ${bg}; border-radius: 6px; padding: 8px; display:flex; justify-content:${justify};">
                <img src="${s.renderedExpert}" style="display:block; width:100%; max-width:${w}px; height:auto;">
            </div>
        `;
    }

    const badgeHTML = s.badgeIcon ? `
        <div style="position: absolute; bottom: 5px; right: -10px; width: 45px; height: 45px;">
            <img src="${s.badgeIcon}" style="width: 100%; height: 100%; display: block;">
        </div>
    ` : '';

    const bg = s.bgColor && s.bgColor !== 'transparent' ? s.bgColor : 'transparent';

    if (s.verticalLayout) {
        return `
            <div style="display: flex; flex-direction: column; align-items: center; padding: 16px; background: ${bg}; border-radius: 6px;">
                <div style="position: relative; width: 100px; height: 100px; flex-shrink: 0; margin-bottom: 12px;">
                    <div style="width: 100%; height: 100%; border-radius: 45%; overflow: hidden; transform: rotate(45deg);">
                        <img src="${s.photo}" style="width: 100%; height: 100%; object-fit: cover; display: block; transform: rotate(-45deg) scale(${s.scale / 100}) translate(${s.positionX}%, ${s.positionY}%);">
                    </div>
                    ${badgeHTML}
                </div>
                ${isLite ? '' : `
                    <div style="width: 100%; color: ${s.textColor}; font-size: 13px; line-height: 1.6; text-align: left;">
                        <div style="font-weight: 600; font-size: 15px; margin-bottom: 4px; color: ${s.nameColor};">${s.name || 'Имя эксперта'}</div>
                        <div style="margin-bottom: 8px; color: ${s.titleColor}; font-size: 12px;">${s.title || 'Должность'}</div>
                        <div style="text-align: left;">${s.bio || 'Описание'}</div>
                    </div>
                `}
            </div>
        `;
    }

    return `
        <div style="display: flex; gap: 16px; padding: 12px; background: ${bg}; border-radius: 6px;">
            <div style="position: relative; width: 100px; height: 100px; flex-shrink: 0;">
                <div style="width: 100%; height: 100%; border-radius: 45%; overflow: hidden; transform: rotate(45deg);">
                    <img src="${s.photo}" style="width: 100%; height: 100%; object-fit: cover; display: block; transform: rotate(-45deg) scale(${s.scale / 100}) translate(${s.positionX}%, ${s.positionY}%);">
                </div>
                ${badgeHTML}
            </div>
            <div style="flex: 1; color: ${s.textColor}; font-size: 13px; line-height: 1.6;">
                <div style="font-weight: 600; font-size: 15px; margin-bottom: 4px; color: ${s.nameColor};">${s.name || 'Имя эксперта'}</div>
                <div style="margin-bottom: 8px; color: ${s.titleColor}; font-size: 12px;">${s.title || 'Должность'}</div>
                <div>${s.bio || 'Описание'}</div>
            </div>
        </div>
    `;
}

function renderImportantPreview(s) {
    const iconSrc = s.renderedIcon || s.icon;
    const fontSize = s.fontSize ?? 14;
    const lineHeight = s.lineHeight ?? 1;

    const iconHTML = iconSrc ? `
        <div style="flex-shrink: 0; width: 60px; padding-right: 12px;">
            <img src="${iconSrc}" style="width: 100%; height: auto; display: block;">
        </div>
    ` : '';

    return `
        <div style="display: flex; align-items: center; gap: 12px; padding: 16px 0;
                    color: ${s.textColor}; font-size: ${fontSize}px; line-height: ${lineHeight};">
            ${iconHTML}
            <div style="flex: 1;">
                ${TextSanitizer.render(TextSanitizer.sanitize(s.text || '', true), s.textColor || '#000000')}
            </div>
        </div>
    `;
}

function renderDividerPreview(s) {
    const imageSrc = s.customImage || s.image;

    if (imageSrc) {
        return `
            <div style="padding: 8px 0; text-align: center;">
                <img src="${imageSrc}" alt="Разделитель" style="width: 100%; height: auto; display: block;">
            </div>
        `;
    }

    return `<p style="padding: 16px; text-align: center; color: #9ca3af; background: #374151; border-radius: 4px; margin: 8px 0;">Выберите разделитель</p>`;
}

function renderImagePreview(s) {
    const src = s.renderedImage || s.src;

    if (!src) {
        return '<p style="padding: 40px; text-align: center; color: #9ca3af; background: #374151; border-radius: 4px;">Загрузите изображение</p>';
    }

    let borderRadius;
    if (s.borderRadiusMode === 'each') {
        borderRadius = `${s.borderRadiusTL || 0}px ${s.borderRadiusTR || 0}px ${s.borderRadiusBR || 0}px ${s.borderRadiusBL || 0}px`;
    } else {
        borderRadius = `${s.borderRadiusAll || 0}px`;
    }

    if (s.renderedImage && s.renderedWidth) {
        return `
            <div style="padding: 8px; text-align: ${s.align || 'center'};">
                <img src="${src}" alt="${s.alt || ''}" style="width: ${s.renderedWidth}px; max-width: 100%; height: auto; display: inline-block; border-radius: ${borderRadius};">
            </div>
        `;
    }

    return `
        <div style="padding: 8px; text-align: ${s.align || 'center'};">
            <img src="${src}" alt="${s.alt || ''}" style="max-width: 100%; width: ${s.width}; border-radius: ${borderRadius}; display: inline-block;">
        </div>
    `;
}

function renderSpacerPreview(s) {
    return `<div style="height: ${s.height}px; background: repeating-linear-gradient(90deg, #374151 0, #374151 1px, transparent 1px, transparent 10px); opacity: 0.3;"></div>`;
}