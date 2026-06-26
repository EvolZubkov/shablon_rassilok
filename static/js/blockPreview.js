// blockPreview.js - Рендеринг превью блоков для canvas

function isLightColorPreview(hexColor) {
    const hex = (hexColor || '#000000').replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 128;
}

function getThemeAwarePreviewTextColor() {
    const theme = document.documentElement?.getAttribute('data-theme') || 'dark';
    return theme === 'light' ? '#1D2533' : '#ffffff';
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
    let s = block.settings;

    // Слой 2: контейнер имеет фон, блок собственного не имеет — адаптируем цвет текста
    const ownBg = s && s.bgEnabled !== false && s.bgColor;
    if (!ownBg && window._previewParentBg && s &&
        (block.type === 'text' || block.type === 'heading' || block.type === 'list')) {
        const contrast = typeof isLightColorPreview === 'function'
            ? (isLightColorPreview(window._previewParentBg) ? '#1D2533' : '#ffffff')
            : '#ffffff';
        s = Object.assign({}, s, { color: contrast });
    }

    let html;
    switch (block.type) {
        case 'banner':    html = renderBannerPreview(s);    break;
        case 'text':      html = renderTextPreview(s);      break;
        case 'heading':   html = renderHeadingPreview(s);   break;
        case 'button':    html = renderButtonPreview(s);    break;
        case 'list':      html = renderListPreview(s);      break;
        case 'expert':    html = renderExpertPreview(s);    break;
        case 'important': html = renderImportantPreview(s); break;
        case 'divider':   html = renderDividerPreview(s);   break;
        case 'image':     html = renderImagePreview(s);     break;
        case 'spacer':    html = renderSpacerPreview(s);    break;
        case 'canvas':    html = renderCanvasBlockPreview(block); break;
        default:          html = '<p>Неизвестный блок</p>';
    }
    return CapabilityRegistry.applyWrappers(html, block, 'preview');
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
                            const startN = s.startNumber != null ? s.startNumber : 1;
                            const num = index + startN;
                            const numLabel = (s.numberFormat === 'plain') ? String(num) : (num < 10 ? '0' + num : String(num));
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
            ${TextSanitizer.applyTypography(TextSanitizer.escapeHTML(s.text || 'Заголовок'))}
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

    // Auto-contrast text color derived from background, same logic as button text.
    const hasBg = s.bgColor && s.bgColor !== 'transparent';
    const autoTextColor = hasBg
        ? (isLightColorPreview(s.bgColor) ? '#1D2533' : '#ffffff')
        : getThemeAwarePreviewTextColor();

    if (s.renderedExpert) {
        const bg = hasBg ? s.bgColor : 'transparent';
        const w = s.renderedExpertWidth || 600;
        const align = s.align || 'left';
        const justify = align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start';

        return `
            <div style="background: ${bg}; border-radius: 6px; padding: 8px; display:flex; justify-content:${justify};">
                <img src="${s.renderedExpert}" style="display:block; width:100%; max-width:${w}px; height:auto;">
            </div>
        `;
    }

    const badgeX = Number(s.badgePositionX ?? 85);
    const badgeY = Number(s.badgePositionY ?? 85);
    const badgeLeft = (100 - 45) * (badgeX / 100);
    const badgeTop = (100 - 45) * (badgeY / 100);

    const badgeHTML = s.badgeIcon ? `
        <div style="position: absolute; left: ${badgeLeft}px; top: ${badgeTop}px; width: 45px; height: 45px; z-index: 2; pointer-events: none;">
            <img src="${s.badgeIcon}" style="width: 100%; height: 100%; display: block;">
        </div>
    ` : '';

    const bg = hasBg ? s.bgColor : 'transparent';

    if (s.verticalLayout) {
        return `
            <div style="display: flex; flex-direction: column; align-items: center; padding: 16px; background: ${bg}; border-radius: 6px;">
                <div style="position: relative; width: 100px; height: 100px; flex-shrink: 0; margin-bottom: 12px; overflow: visible;">
                    <div style="position: relative; z-index: 1; width: 100%; height: 100%; border-radius: 45%; overflow: hidden; transform: rotate(45deg);">
                        <img src="${s.photo}" style="width: 100%; height: 100%; object-fit: cover; display: block; transform: rotate(-45deg) scale(${s.scale / 100}) translate(${s.positionX}%, ${s.positionY}%);">
                    </div>
                    ${badgeHTML}
                </div>
                ${isLite ? '' : `
                    <div style="width: 100%; color: ${autoTextColor}; font-size: 13px; line-height: 1.6; text-align: left;">
                        <div style="font-weight: 600; font-size: 15px; margin-bottom: 4px; color: ${autoTextColor};">${s.name || 'Имя эксперта'}</div>
                        <div style="margin-bottom: 8px; opacity: 0.75; font-size: 12px;">${s.title || 'Должность'}</div>
                        <div style="text-align: left;">${s.bio || 'Описание'}</div>
                    </div>
                `}
            </div>
        `;
    }

    return `
        <div style="display: flex; gap: 16px; padding: 12px; background: ${bg}; border-radius: 6px;">
            <div style="position: relative; width: 100px; height: 100px; flex-shrink: 0; overflow: visible;">
                <div style="position: relative; z-index: 1; width: 100%; height: 100%; border-radius: 45%; overflow: hidden; transform: rotate(45deg);">
                    <img src="${s.photo}" style="width: 100%; height: 100%; object-fit: cover; display: block; transform: rotate(-45deg) scale(${s.scale / 100}) translate(${s.positionX}%, ${s.positionY}%);">
                </div>
                ${badgeHTML}
            </div>
            <div style="flex: 1; color: ${autoTextColor}; font-size: 13px; line-height: 1.6;">
                <div style="font-weight: 600; font-size: 15px; margin-bottom: 4px; color: ${autoTextColor};">${s.name || 'Имя эксперта'}</div>
                <div style="margin-bottom: 8px; opacity: 0.75; font-size: 12px;">${s.title || 'Должность'}</div>
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

// ── Canvas clip-path shapes (from prototype) ─────────────────────────
const CANVAS_CLIPS = {
    'none':    '',
    'circle':  'circle(50% at 50% 50%)',
    'tri':     'polygon(50% 0%,0% 100%,100% 100%)',
    'trid':    'polygon(0% 0%,100% 0%,50% 100%)',
    'diamond': 'polygon(50% 0%,100% 50%,50% 100%,0% 50%)',
    'hex':     'polygon(25% 0%,75% 0%,100% 50%,75% 100%,25% 100%,0% 50%)',
    'angled':  'polygon(14% 0%,100% 0%,100% 100%,0% 100%)',
    'angledR': 'polygon(0% 0%,86% 0%,100% 100%,0% 100%)',
};


// Resolve clipPath: support new `clipPath` field + backward-compat old shapeType/maskType
function _resolveClipPath(e, forImage) {
    if (e.clipPath !== undefined) return e.clipPath;
    // Backward-compat shapeType
    if (e.shapeType) {
        if (e.shapeType === 'oval')     return 'circle';
        if (e.shapeType === 'triangle') return 'tri';
        return 'none'; // rect, strip → none (strip uses borderRadius:100px via borderRadius field)
    }
    // Backward-compat maskType
    if (e.maskType) {
        if (e.maskType === 'circle') return 'circle';
        return 'none';
    }
    return 'none';
}

function _resolveBorderRadius(e) {
    // For old 'strip' shape type — emulate with large radius
    if (!e.clipPath && e.shapeType === 'strip') return 100;
    return e.borderRadius || 0;
}

function renderCanvasBlockPreview(block) {
    const s = block.settings;
    const h = s.height || 250;
    const bgEnabled = s.bgEnabled !== false;
    const bg = s.bgColor || '#1D2533';
    const outerBg = bgEnabled ? bg : 'transparent';
    const blockId = block.id;
    const elements = Array.isArray(s.freeElements) ? s.freeElements : [];
    const selId = (typeof _canvasSelId !== 'undefined') ? _canvasSelId : null;

    const overlays = elements.map(e => {
        if (e.visible === false) return '';

        const isSel = e.id === selId;
        const rot = e.rotation || 0;
        const transformCSS = rot !== 0 ? `transform:rotate(${rot}deg);transform-origin:center center;` : '';
        const base = `position:absolute;left:${e.x||0}px;top:${e.y||0}px;width:${e.w||100}px;${e.h != null ? `height:${e.h}px;` : ''}opacity:${e.opacity ?? 1};box-sizing:border-box;cursor:move;${isSel ? 'outline:2px solid #a855f7;outline-offset:1px;' : ''}`;
        const dnd = `data-canvas-elem-id="${e.id}" onmousedown="startCanvasElemDrag(event,${blockId},${e.id})"`;

        if (e.type === 'text' || e.type === 'heading') {
            const safe = (e.text || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
            const align = e.textAlign || 'left';
            const lh    = e.lineHeight || 1.3;
            return `<div ${dnd} style="${base}color:${e.color||'#fff'};font-size:${e.fontSize||16}px;font-weight:${e.fontWeight||400};line-height:${lh};text-align:${align};white-space:pre-wrap;${transformCSS}">${safe}</div>`;
        }

        if (e.type === 'shape') {
            const cp    = _resolveClipPath(e);
            const br    = _resolveBorderRadius(e);
            const cpCSS = cp && cp !== 'none' ? `clip-path:${CANVAS_CLIPS[cp] || ''};` : `border-radius:${br}px;`;
            return `<div ${dnd} style="${base}background:${e.bgColor||'#a855f7'};${cpCSS}${transformCSS}"></div>`;
        }

        if (e.type === 'line') {
            const ls  = e.lineStyle || 'solid';
            const col = e.color || '#ffffff';
            const lineCSS = (ls === 'dashed' || ls === 'dotted')
                ? `background:transparent;border-top:${e.h||2}px ${ls} ${col};`
                : `background:${col};`;
            return `<div ${dnd} style="${base}${lineCSS}${transformCSS}"></div>`;
        }

        if (e.type === 'image') {
            const cp    = _resolveClipPath(e, true);
            const br    = e.borderRadius || 0;
            const cpCSS = cp && cp !== 'none' ? `clip-path:${CANVAS_CLIPS[cp] || ''};` : `border-radius:${br}px;`;
            if (e.src) {
                // background-image вместо <img object-fit> — html2canvas не поддерживает object-fit
                const fit = e.objectFit || 'cover';
                const bgSize = fit === 'fill' ? '100% 100%' : fit === 'contain' ? 'contain' : 'cover';
                return `<div ${dnd} style="${base}${cpCSS}background-image:url('${e.src}');background-size:${bgSize};background-repeat:no-repeat;background-position:center;${transformCSS}"></div>`;
            }
            return `<div ${dnd} style="${base}${cpCSS}background:#2a2a40;display:flex;align-items:center;justify-content:center;font-size:20px;${transformCSS}">🖼</div>`;
        }
        return '';
    }).join('');

    const placeholder = !elements.length
        ? `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.2);font-size:12px;pointer-events:none;">Добавьте элементы в настройках</div>`
        : '';

    // Outer div fills block width. Inner .canvas-block-inner is exactly 600px (coordinate space).
    // Inner div also gets background so html2canvas captures it correctly.
    return `<div style="width:100%;background:${outerBg};overflow:hidden;" ondragstart="event.preventDefault();">
        <div class="canvas-block-inner" style="position:relative;width:600px;height:${h}px;margin:0 auto;background:${outerBg};box-shadow:inset 0 0 0 1px rgba(255,255,255,0.12);">
            ${placeholder}${overlays}
        </div>
    </div>`;
}
