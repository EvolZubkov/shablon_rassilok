// imageRenderers.js - Рендеринг баннеров и экспертов в canvas

// Polyfill for CanvasRenderingContext2D.roundRect (Chrome < 99, Firefox < 112, older Electron)
if (typeof CanvasRenderingContext2D !== 'undefined' &&
    typeof CanvasRenderingContext2D.prototype.roundRect !== 'function') {
    /**
     * Draws a rounded rectangle path on the canvas context.
     * @param {number} x - X coordinate of the top-left corner.
     * @param {number} y - Y coordinate of the top-left corner.
     * @param {number} w - Width of the rectangle.
     * @param {number} h - Height of the rectangle.
     * @param {number|number[]} radii - Corner radius or array [tl, tr, br, bl].
     */
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, radii) {
        let tl, tr, br, bl;
        if (Array.isArray(radii)) {
            const r = radii.map(v => Math.max(0, v));
            tl = r[0] || 0;
            tr = r[1] !== undefined ? r[1] : tl;
            br = r[2] !== undefined ? r[2] : tl;
            bl = r[3] !== undefined ? r[3] : tr;
        } else {
            tl = tr = br = bl = Math.max(0, radii || 0);
        }
        // Clamp radii so they don't exceed half the rectangle's dimension
        const maxR = Math.min(w / 2, h / 2);
        tl = Math.min(tl, maxR);
        tr = Math.min(tr, maxR);
        br = Math.min(br, maxR);
        bl = Math.min(bl, maxR);

        this.moveTo(x + tl, y);
        this.lineTo(x + w - tr, y);
        this.quadraticCurveTo(x + w, y, x + w, y + tr);
        this.lineTo(x + w, y + h - br);
        this.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
        this.lineTo(x + bl, y + h);
        this.quadraticCurveTo(x, y + h, x, y + h - bl);
        this.lineTo(x, y + tl);
        this.quadraticCurveTo(x, y, x + tl, y);
        this.closePath();
    };
}

// Determines whether a color is light

function isLightColor(hexColor) {
    const hex = hexColor.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    // Формула яркости (perceived brightness)
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 128;
}
function renderBannerToDataUrl(block, callback) {
    const s = block.settings || {};
    const SCALE = 2;
    const WIDTH = 600;
    const BASE_HEIGHT = 250;
    const HEIGHT = Number(s.bannerHeight || BASE_HEIGHT);

    // Фиксированные параметры из Figma
    const BORDER_RADIUS = 32;
    const LEFT_BLOCK_ANGLE = 13; // градусов

    // Цвета
    const backgroundColor = s.backgroundColor || '#7700FF';
    const gradientEnabled = Boolean(s.gradientEnabled);

    const gradientAngle = Number.isFinite(Number(s.gradientAngle)) ? Number(s.gradientAngle) : 0;
    const gradientCenterX = Number.isFinite(Number(s.gradientCenterX)) ? Number(s.gradientCenterX) : 50;
    const gradientCenterY = Number.isFinite(Number(s.gradientCenterY)) ? Number(s.gradientCenterY) : 50;
    const gradientBalance = Number.isFinite(Number(s.gradientBalance)) ? Number(s.gradientBalance) : 100;

    const gradientStops = getBannerGradientStopsForRender(s);

    const leftBlockColor = s.leftBlockColor || '#1D2533';
    const textElements = s.textElements || [];

    // Загружаем все необходимые изображения
    const imagesToLoad = [];

    // Фоновое изображение (rounded mode)
    if (s.bgImage) {
        imagesToLoad.push({ key: 'bgImage', src: s.bgImage });
    }

    // Правая картинка
    const rightImageSrc = s.rightImageCustom || s.rightImage;
    if (rightImageSrc) {
        imagesToLoad.push({ key: 'rightImage', src: rightImageSrc });
    }

    // Логотип
    const logoSrc = s.logoCustom || s.logo;
    if (logoSrc) {
        imagesToLoad.push({ key: 'logo', src: logoSrc });
    }

    // Иконки текстовых элементов
    textElements.forEach((el, index) => {
        if (el.iconEnabled) {
            const iconSrc = el.iconCustom || el.icon;
            if (iconSrc) {
                imagesToLoad.push({ key: `icon_${index}`, src: iconSrc });
            }
        }
    });

    // Загружаем все изображения
    loadAllImages(imagesToLoad, (loadedImages) => {
        // Создаём canvas
        const canvas = document.createElement('canvas');
        canvas.width = WIDTH * SCALE;
        canvas.height = HEIGHT * SCALE;

        const ctx = canvas.getContext('2d');
        ctx.scale(SCALE, SCALE);

        // === 1. Рисуем общий фон баннера ===
        const mode = s.rightImageMode || 'mask';

        if (gradientEnabled && mode === 'rounded') {
            ctx.fillStyle = createBannerGradientFillStyle(ctx, {
                width: WIDTH,
                height: HEIGHT,
                angle: gradientAngle,
                centerX: gradientCenterX,
                centerY: gradientCenterY,
                balance: gradientBalance,
                stops: gradientStops
            });
        } else {
            ctx.fillStyle = backgroundColor;
        }

        ctx.beginPath();
        ctx.roundRect(0, 0, WIDTH, HEIGHT, BORDER_RADIUS);
        ctx.fill();

        // === 1b. Фоновое изображение поверх заливки (только rounded) ===
        if (mode === 'rounded' && loadedImages.bgImage) {
            ctx.save();
            ctx.beginPath();
            ctx.roundRect(0, 0, WIDTH, HEIGHT, BORDER_RADIUS);
            ctx.clip();
            const bg = loadedImages.bgImage;
            const bgAspect = bg.width / bg.height;
            const canvasAspect = WIDTH / HEIGHT;
            let bw, bh;
            if (bgAspect > canvasAspect) {
                bh = HEIGHT; bw = bh * bgAspect;
            } else {
                bw = WIDTH; bh = bw / bgAspect;
            }
            ctx.drawImage(bg, (WIDTH - bw) / 2, (HEIGHT - bh) / 2, bw, bh);
            ctx.restore();
        }

        // === 2. Рисуем правую картинку (маска / прямоугольник) ===
        if (loadedImages.rightImage) {
            const mode = s.rightImageMode || 'mask'; // 'mask' | 'rounded'

            if (mode === 'rounded') {
                drawRightImageRounded(ctx, loadedImages.rightImage, WIDTH, HEIGHT, BORDER_RADIUS, s);
            } else {
                drawRightImageMasked(ctx, loadedImages.rightImage, WIDTH, HEIGHT, BORDER_RADIUS, s);
            }
        }

        // === 3. Рисуем левый повёрнутый блок ===
        if (mode === 'mask') {
            if (gradientEnabled) {
                drawLeftBlockWithGradient(ctx, {
                    angle: gradientAngle,
                    centerX: gradientCenterX,
                    centerY: gradientCenterY,
                    balance: gradientBalance,
                    stops: gradientStops,
                    width: WIDTH,
                    height: HEIGHT,
                    borderRadius: BORDER_RADIUS,
                    blockAngle: LEFT_BLOCK_ANGLE
                });
            } else {
                drawLeftBlock(ctx, leftBlockColor, WIDTH, HEIGHT, BORDER_RADIUS, LEFT_BLOCK_ANGLE);
            }
        }

        // === 4. Применяем общую маску скругления ===
        ctx.save();
        ctx.globalCompositeOperation = 'destination-in';
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.roundRect(0, 0, WIDTH, HEIGHT, BORDER_RADIUS);
        ctx.fill();
        ctx.restore();

        // === 5. Рисуем логотип ===
        if (loadedImages.logo) {
            drawBannerLogo(ctx, loadedImages.logo, s);
        }

        // === 6. Рисуем текстовые элементы ===
        // При включённом градиенте нельзя угадать средний цвет фона по одному hex —
        // поэтому при градиенте всегда используем белый текст.
        // При обычной заливке: mask → leftBlockColor, rounded → backgroundColor
        let textBgColor;
        if (gradientEnabled) {
            textBgColor = '#000000'; // принудительно тёмный фон → белый текст
        } else {
            textBgColor = (mode === 'rounded') ? backgroundColor : leftBlockColor;
        }
        textElements.forEach((el, index) => {
            drawBannerTextElement(ctx, el, loadedImages[`icon_${index}`], index, textBgColor);
        });

        // Возвращаем результат
        const dataUrl = canvas.toDataURL('image/png');
        callback(dataUrl);
    });
}

// Загрузка всех изображений
function loadAllImages(imagesToLoad, callback) {
    const loadedImages = {};
    let loadedCount = 0;
    const totalCount = imagesToLoad.length;

    if (totalCount === 0) {
        callback(loadedImages);
        return;
    }

    imagesToLoad.forEach(item => {
        const img = new Image();
        img.crossOrigin = 'anonymous';

        img.onload = () => {
            loadedImages[item.key] = img;
            loadedCount++;
            if (loadedCount === totalCount) {
                callback(loadedImages);
            }
        };

        img.onerror = () => {
            console.error(`Failed to load image: ${item.src}`);
            loadedCount++;
            if (loadedCount === totalCount) {
                callback(loadedImages);
            }
        };

        img.src = item.src;
    });
}

// Рисуем левый повёрнутый блок (как в Figma)
function drawLeftBlock(ctx, color, canvasWidth, canvasHeight, borderRadius, angle) {
    ctx.save();

    // Параметры из Figma CSS:
    // width: 449.43px; height: 317.89px;
    // left: -66px; top: -74.52px;
    // transform: rotate(13deg);

    const blockWidth = 457.43;
    const blockHeight = 317.89;
    const offsetX = -76.2;
    const offsetY = -30.52;

    // Масштабируем пропорционально если canvas не 600px
    const scale = canvasWidth / 600;

    const angleRad = angle * Math.PI / 180;

    // Точка поворота — центр блока (как в CSS transform-origin по умолчанию)
    const centerX = (offsetX + blockWidth / 2) * scale;
    const centerY = (offsetY + blockHeight / 2) * scale;

    ctx.translate(centerX, centerY);
    ctx.rotate(angleRad);
    ctx.translate(-centerX, -centerY);

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(
        offsetX * scale,
        offsetY * scale,
        blockWidth * scale,
        blockHeight * scale,
        borderRadius
    );
    ctx.fill();

    ctx.restore();
}

function drawLeftBlockWithGradient(ctx, {
    angle,
    centerX,
    centerY,
    balance,
    stops,
    width,
    height,
    borderRadius,
    blockAngle
}) {
    ctx.save();

    // Геометрия левого блока — та же, что в drawLeftBlock
    const blockWidth = 457.43;
    const blockHeight = 317.89;
    const offsetX = -76.2;
    const offsetY = -30.52;

    const scale = width / 600;
    const angleRad = blockAngle * Math.PI / 180;

    const blockCenterX = (offsetX + blockWidth / 2) * scale;
    const blockCenterY = (offsetY + blockHeight / 2) * scale;

    ctx.translate(blockCenterX, blockCenterY);
    ctx.rotate(angleRad);
    ctx.translate(-blockCenterX, -blockCenterY);

    ctx.beginPath();
    ctx.roundRect(
        offsetX * scale,
        offsetY * scale,
        blockWidth * scale,
        blockHeight * scale,
        borderRadius
    );
    ctx.clip();

    ctx.fillStyle = createBannerGradientFillStyle(ctx, {
        width,
        height,
        angle,
        centerX,
        centerY,
        balance,
        stops
    });

    ctx.beginPath();
    ctx.roundRect(
        offsetX * scale,
        offsetY * scale,
        blockWidth * scale,
        blockHeight * scale,
        borderRadius
    );
    ctx.fill();

    ctx.restore();
}
function clipRoundedRectAll(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, rr);
    ctx.clip();
}
// Рисуем правую картинику в скруглённом прямоугольнике
function clipRightRoundedRect(ctx, x, y, w, h, r) {
    // скругляем только правые углы (как правило выглядит лучше, если блок прилегает к краю баннера)
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x, y + h);
    ctx.closePath();
    ctx.clip();
}

function drawRightImageRounded(ctx, img, canvasWidth, canvasHeight, borderRadius, settings) {
    ctx.save();

    // как и в твоей masked-функции: сбрасываем и возвращаем SCALE=2
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(2, 2);

    // размеры правого блока (база 600px ширины)
    const BASE_W = 600;
    const scaleX = canvasWidth / BASE_W;

    const boxW = 300 * scaleX;        // ширина правого блока (подбери если нужно)
    const boxH = canvasHeight;        // ✅ высота = высоте баннера (200/250)
    const boxX = canvasWidth - boxW;  // справа
    const boxY = 0;                   // ✅ сверху

    // маска прямоугольника
    const r = (typeof settings.rightRoundedRadius === 'number')
        ? settings.rightRoundedRadius
        : borderRadius;

    clipRoundedRectAll(ctx, boxX, boxY, boxW, boxH, r);

    // пользовательские настройки (двигаем картинку внутри маски)
    const userOffsetX = settings.rightImageX || 0;
    const userOffsetY = settings.rightImageY || 0;
    const userRotate = settings.rightImageRotate || 0;
    const userScale = (settings.rightImageScale || 100) / 100;

    // cover
    const imgAspect = img.width / img.height;
    const boxAspect = boxW / boxH;

    let drawW, drawH;
    if (imgAspect > boxAspect) {
        drawH = boxH * userScale;
        drawW = drawH * imgAspect;
    } else {
        drawW = boxW * userScale;
        drawH = drawW / imgAspect;
    }

    const cx = boxX + boxW / 2;
    const cy = boxY + boxH / 2;

    if (userRotate !== 0) {
        ctx.translate(cx, cy);
        ctx.rotate(userRotate * Math.PI / 180);
        ctx.translate(-cx, -cy);
    }

    const drawX = cx - drawW / 2 + userOffsetX;
    const drawY = cy - drawH / 2 + userOffsetY;

    ctx.drawImage(img, drawX, drawY, drawW, drawH);

    ctx.restore();
}

// Рисуем правую картинку в повёрнутой маске (как в Figma)
function drawRightImageMasked(ctx, img, canvasWidth, canvasHeight, borderRadius, settings) {
    ctx.save();

    // База (макет под 600×250)
    const BASE_W = 600;
    const BASE_H = 250;

    // Контейнер маски (твой текущий вариант)
    const maskContainerX0 = 400;
    const maskContainerY0 = 29;
    const maskContainerW0 = 196;
    const maskContainerH0 = 250;

    // X-сдвиг всего правого блока для 200px (подбери число под макет)
    const rightBlockShiftX0 = (canvasHeight <= 200) ? + 5 : 0; // например -15px в координатах 600×250

    // Внутренний повёрнутый прямоугольник
    const rectW0 = 276.24;
    const rectH0 = 287.36;
    const rectOffX0 = -6.34;
    const rectOffY0 = -56.05;
    const rectAngle = -166.92;

    const scaleX = canvasWidth / BASE_W;
    const scaleY = canvasHeight / BASE_H; // ← ключевое: отдельный масштаб по высоте
    const angleRad = rectAngle * Math.PI / 180;

    // Перемещаемся в контейнер маски (уже в координатах текущего баннера)
    const maskX = (maskContainerX0 + rightBlockShiftX0) * scaleX;
    const maskY = maskContainerY0 * scaleY;
    const maskW = maskContainerW0 * scaleX;
    const maskH = maskContainerH0 * scaleY; // при 200 станет 200, при 250 — 250

    ctx.translate(maskX, maskY);

    // Центр внутреннего прямоугольника (тоже с scaleX/scaleY)
    const rectCenterX = (rectOffX0 + rectW0 / 2) * scaleX;
    const rectCenterY = (rectOffY0 + rectH0 / 2) * scaleY;

    // Создаём маску
    ctx.translate(rectCenterX, rectCenterY);
    ctx.rotate(angleRad);
    ctx.translate(-rectCenterX, -rectCenterY);

    ctx.beginPath();
    ctx.roundRect(
        rectOffX0 * scaleX,
        rectOffY0 * scaleY,
        rectW0 * scaleX,
        rectH0 * scaleY,
        borderRadius
    );
    ctx.clip();

    // Сбрасываем трансформации для рисования картинки
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(2, 2); // как у тебя (лучше бы SCALE переменной)

    // Пользовательские настройки
    const userOffsetX = settings.rightImageX || 0;
    const userOffsetY = settings.rightImageY || 0;
    const userRotate = settings.rightImageRotate || 0;
    const userScale = (settings.rightImageScale || 100) / 100;

    // Рисуем картинку в области маски (cover)
    const imgAspect = img.width / img.height;
    const areaWidth = maskW;
    const areaHeight = maskH;

    let drawWidth, drawHeight;

    // ✅ было: areaWidth / canvasHeight (это ломает 200px)
    if (imgAspect > areaWidth / areaHeight) {
        // ✅ было: canvasHeight
        drawHeight = areaHeight * userScale;
        drawWidth = drawHeight * imgAspect;
    } else {
        drawWidth = areaWidth * 1.5 * userScale;
        drawHeight = drawWidth / imgAspect;
    }

    // ✅ центрируем относительно самой маски (с учётом maskY), а не всего canvas
    const areaCenterX = maskX + areaWidth / 2;
    const areaCenterY = maskY + areaHeight / 2;

    if (userRotate !== 0) {
        ctx.translate(areaCenterX, areaCenterY);
        ctx.rotate(userRotate * Math.PI / 180);
        ctx.translate(-areaCenterX, -areaCenterY);
    }

    const drawX = areaCenterX - drawWidth / 2 + userOffsetX;
    const drawY = areaCenterY - drawHeight / 2 + userOffsetY;

    ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);

    ctx.restore();
}
// Рисуем логотип
function drawBannerLogo(ctx, img, settings) {
    const logoScale = (settings.logoScale || 100) / 100;
    const logoX = settings.logoX || 24;
    const logoY = settings.logoY || 24;

    // Базовые размеры логотипа
    const baseHeight = 28;
    const aspectRatio = img.width / img.height;

    const finalHeight = baseHeight * logoScale;
    const finalWidth = finalHeight * aspectRatio;

    ctx.drawImage(img, logoX, logoY, finalWidth, finalHeight);
}

// Рисование многострочного текста с поддержкой \n
function drawMultilineText(ctx, text, x, y, fontSize, lineHeight = 1.4) {
    const lines = text.split('\n');
    const lineSpacing = fontSize * lineHeight;

    lines.forEach((line, index) => {
        ctx.fillText(line, x, y + (index * lineSpacing));
    });
}

// Измерение размеров многострочного текста
function measureMultilineText(ctx, text, fontSize, lineHeight = 1.4) {
    const lines = text.split('\n');
    let maxWidth = 0;

    lines.forEach(line => {
        const metrics = ctx.measureText(line);
        maxWidth = Math.max(maxWidth, metrics.width);
    });

    const totalHeight = lines.length * fontSize * lineHeight;

    return { width: maxWidth, height: totalHeight, lineCount: lines.length };
}
// Рисуем текстовый элемент
function drawBannerTextElement(ctx, el, iconImg, index = 0, bgColor = '#1D2533') {
    const x = el.x || 0;
    const y = el.y || 0;
    const fontSize = (index === 0) ? 28 : 14;
    const fontFamily = getBannerFontFamily(el.fontFamily || 'rt-regular');
    const color = isLightColor(bgColor) ? '#3F3E4B' : '#ffffff';
    // const color = el.color || '#ffffff';
    const text = el.text || '';
    const letterSpacing = el.letterSpacing || 0;

    // Настройка шрифта для измерения
    ctx.font = `${fontSize}px ${fontFamily}`;
    if (letterSpacing !== 0) {
        ctx.letterSpacing = `${letterSpacing}px`;
    }

    // Рассчитываем размеры иконки
    let iconWidth = 0;
    let iconHeight = 0;
    let iconGap = 0;

    if (el.iconEnabled && iconImg) {
        iconHeight = fontSize * 0.9; // 90% от размера шрифта
        iconWidth = (iconImg.width / iconImg.height) * iconHeight;
        iconGap = 6;
    }

    // ✅ ИСПРАВЛЕНИЕ: Измеряем многострочный текст
    const lineHeight = el.lineHeight || 1.4;
    const textSize = measureMultilineText(ctx, text, fontSize, lineHeight);
    const textWidth = textSize.width;
    const totalWidth = iconWidth + iconGap + textWidth;

    // Если есть плашка — рисуем её
    if (el.badgeEnabled) {
        const badgeColor = el.badgeColor || '#7700ff';
        const badgeRadius = el.badgeRadius || 25;
        const paddingX = el.badgePaddingX || 12;
        const paddingY = el.badgePaddingY || 4;

        const badgeWidth = totalWidth + paddingX * 2;
        const badgeHeight = textSize.height + paddingY * 2;
        const badgeX = x;
        const badgeY = y;

        ctx.fillStyle = badgeColor;
        ctx.beginPath();
        ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, badgeRadius);
        ctx.fill();

        // Рисуем иконку внутри плашки
        if (el.iconEnabled && iconImg) {
            const iconX = x + paddingX;
            const iconY = y + paddingY;
            ctx.drawImage(iconImg, iconX, iconY, iconWidth - (iconWidth * 0.1), iconHeight - (iconHeight * 0.1));
        }

        // Рисуем текст внутри плашки
        ctx.fillStyle = color;
        ctx.font = `${fontSize}px ${fontFamily}`;
        ctx.textBaseline = 'top';
        const textX = x + paddingX + iconWidth + iconGap;
        drawMultilineText(ctx, text, textX, y + paddingY, fontSize, lineHeight);

    } else {
        // Без плашки

        // Рисуем иконку
        if (el.iconEnabled && iconImg) {
            const iconX = x;
            const iconY = y;
            ctx.drawImage(iconImg, iconX, iconY, iconWidth - (iconWidth * 0.1), iconHeight - (iconHeight * 0.1));
        }

        // Рисуем текст
        ctx.fillStyle = color;
        ctx.font = `${fontSize}px ${fontFamily}`;
        ctx.textBaseline = 'top';
        const textX = x + iconWidth + iconGap;
        drawMultilineText(ctx, text, textX, y, fontSize, lineHeight);
    }

    if (letterSpacing !== 0) {
        ctx.letterSpacing = '0px';
    }
}

// Получить CSS имя шрифта для баннера
function getBannerFontFamily(fontKey) {
    const fontMap = {
        'rt-light': 'RostelecomBasis-Light, Arial, sans-serif',
        'rt-regular': 'RostelecomBasis-Regular, Arial, sans-serif',
        'rt-medium': 'RostelecomBasis-Medium, Arial, sans-serif',
        'rt-bold': 'RostelecomBasis-Bold, Arial, sans-serif'
    };
    return fontMap[fontKey] || fontMap['rt-regular'];
}

// Возвращает цвет текста для блока эксперт по цвету фона.
// Светлый фон или нет фона → #1D2533 (стандарт), тёмный → #ffffff.
function getExpertTextColor(bgColor) {
    if (!bgColor || bgColor === 'transparent' || bgColor === '') return '#1D2533';

    let r, g, b;
    const hex = bgColor.trim();
    if (hex.startsWith('#')) {
        const c = hex.slice(1);
        if (c.length === 3) {
            r = parseInt(c[0] + c[0], 16);
            g = parseInt(c[1] + c[1], 16);
            b = parseInt(c[2] + c[2], 16);
        } else {
            r = parseInt(c.slice(0, 2), 16);
            g = parseInt(c.slice(2, 4), 16);
            b = parseInt(c.slice(4, 6), 16);
        }
    } else if (hex.startsWith('rgb')) {
        const m = hex.match(/\d+/g);
        if (m) { r = +m[0]; g = +m[1]; b = +m[2]; }
    }
    if (r === undefined) return '#1D2533';
    const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
    return brightness > 160 ? '#1D2533' : '#ffffff';
}

function renderExpertToDataUrl(block, callback) {
    console.log('[EXPERT RENDER] Horizontal layout started', {
        blockId: block.id,
        photo: block.settings.photo ? 'loaded' : 'missing',
        scale: block.settings.scale,
        positionX: block.settings.positionX,
        positionY: block.settings.positionY
    });

    const s = block.settings;
    const { LOGICAL_WIDTH, SCALE_FACTOR } = CANVAS_CONFIG;

    const isLite = (s.variant || 'full') === 'lite';

    // Высота блока (как было)
    const logicalHeight = 203;
    const realHeight = logicalHeight * SCALE_FACTOR;

    // Ширина: full = 600, lite = ровно под фото-контейнер
    // containerX=16, containerSize=171, rightPadding=16 => 203
    const liteWidth = 16 + 171 + 16;
    const logicalWidth = isLite ? liteWidth : LOGICAL_WIDTH;
    const realWidth = logicalWidth * SCALE_FACTOR;

    const canvas = document.createElement('canvas');
    canvas.width = realWidth;
    canvas.height = realHeight;

    const ctx = canvas.getContext('2d');
    ctx.scale(SCALE_FACTOR, SCALE_FACTOR);

    // ===== ФОН КАРТОЧКИ СО СКРУГЛЁННЫМИ УГЛАМИ =====

    function roundRectPath(ctx, x, y, w, h, r) {
        const radius = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + w - radius, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
        ctx.lineTo(x + w, y + h - radius);
        ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
        ctx.lineTo(x + radius, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    }

    ctx.save();
    roundRectPath(ctx, 0, 0, logicalWidth, logicalHeight, 48);
    ctx.clip();

    const bg = s.bgColor;

    // если фон задан и он не "transparent" — рисуем фон,
    // иначе оставляем прозрачный
    if (bg && bg !== 'transparent') {
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, logicalWidth, logicalHeight);
    }


    // ===== КОНТЕЙНЕР 171×171 ДЛЯ АВАТАРА (как в HTML) =====
    const containerX = 16;
    const containerY = 16;
    const containerSize = 171;

    const photoSize = 130;        // внутренний ромб 130×130
    const photoHalf = photoSize / 2;

    const centerX = containerX + containerSize / 2;
    const centerY = containerY + containerSize / 2;

    const photoImg = new Image();
    photoImg.crossOrigin = 'anonymous';
    photoImg.src = s.photo || 'images/expert-placeholder.png';

    photoImg.onload = () => {
        // ===== РИСУЕМ ФОТО В ВИДЕ РОМБА =====
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(45 * Math.PI / 180);

        // маска-квадрат 130×130
        ctx.beginPath();
        roundRectPath(
            ctx,
            -photoHalf,
            -photoHalf,
            photoSize,
            photoSize,
            photoSize * 0.45 // 45% от размера, как в CSS
        );
        ctx.closePath();
        ctx.clip();

        const scale = (s.scale || 115) / 100;
        const offsetX = (s.positionX || 0) / 100 * photoSize * 2;
        const offsetY = (s.positionY || 0) / 100 * photoSize * 2;

        ctx.rotate(-45 * Math.PI / 180);
        ctx.translate(offsetX, offsetY);
        ctx.scale(scale, scale);

        // Вычисляем размеры для cover (как object-fit: cover)
        const imgAspect = photoImg.width / photoImg.height;
        const boxAspect = 1; // квадрат

        let drawWidth, drawHeight, drawX, drawY;

        if (imgAspect > boxAspect) {
            // Изображение шире - масштабируем по высоте
            drawHeight = photoSize;
            drawWidth = photoSize * imgAspect;
            drawX = -drawWidth / 2;
            drawY = -drawHeight / 2;
        } else {
            // Изображение выше - масштабируем по ширине
            drawWidth = photoSize;
            drawHeight = photoSize / imgAspect;
            drawX = -drawWidth / 2;
            drawY = -drawHeight / 2;
        }

        ctx.drawImage(photoImg, drawX, drawY, drawWidth, drawHeight);
        ctx.restore();

        // Рамка ромба (как border:2px solid #374151)
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(45 * Math.PI / 180);
        // ctx.strokeStyle = '#374151';
        ctx.lineWidth = 0;
        roundRectPath(
            ctx,
            -photoHalf,
            -photoHalf,
            photoSize,
            photoSize,
            photoSize * 0.45
        );
        ctx.restore();

        // ===== ФУНКЦИЯ ДЛЯ ТЕКСТОВ + БЕЙДЖА =====
        const drawTextAndFinish = () => {
            const textX = containerX + containerSize + 16; // 16 (отступ слева) + 171 + 16
            const textY = 40;
            const textWidth = logicalWidth - textX - 24;

            const isLite = (s.variant || 'full') === 'lite';

            if (!isLite) {
                const textColor = getExpertTextColor(s.bgColor);
                // Имя
                ctx.font = 'bold 15px Arial, sans-serif';
                ctx.fillStyle = textColor;
                ctx.textBaseline = 'top';
                wrapText(ctx, s.name || 'Имя эксперта', textX, textY, textWidth, 18);

                // Должность
                ctx.font = '12px Arial, sans-serif';
                ctx.fillStyle = textColor;
                wrapText(ctx, s.title || 'Должность', textX, textY + 22, textWidth, 16);

                // Био
                ctx.font = '13px Arial, sans-serif';
                ctx.fillStyle = textColor;
                wrapText(ctx, s.bio || 'Краткое описание эксперта', textX, textY + 42, textWidth, 18);
            }


            // снимаем clip скруглённого прямоугольника
            ctx.restore();

            const dataUrl = canvas.toDataURL('image/png');
            callback({
                dataUrl: dataUrl,
                width: LOGICAL_WIDTH  // горизонтальный всегда 600
            });
        };

        // ===== БЕЙДЖ (иконка), ТОЧНО КАК В HTML: bottom:5px; right:-10px; =====
        if (s.badgeIcon) {
            const badgeImg = new Image();
            badgeImg.crossOrigin = 'anonymous';
            badgeImg.src = s.badgeIcon;

            badgeImg.onload = () => {
                const badgeSize = 45;

                // Используем badgePositionX и badgePositionY (проценты 0-100)
                const badgeX = s.badgePositionX ?? 100; // по умолчанию справа
                const badgeY = s.badgePositionY ?? 100; // по умолчанию снизу

                // Вычисляем позицию в пикселях
                // 0% = containerX, 100% = containerX + containerSize - badgeSize
                const badgeLeft = containerX + (containerSize - badgeSize) * (badgeX / 100);
                const badgeTop = containerY + (containerSize - badgeSize) * (badgeY / 100);

                ctx.drawImage(badgeImg, badgeLeft, badgeTop, badgeSize, badgeSize);
                drawTextAndFinish();
            };

            badgeImg.onerror = () => {
                drawTextAndFinish();
            };
        } else {
            drawTextAndFinish();
        }
    };

    photoImg.onerror = () => {
        console.warn('Не удалось загрузить фото эксперта');
        ctx.restore(); // снимем clip
        callback(null);
    };
}

function renderButtonToDataUrl(block, callback) {
    const s = block.settings || {};
    const fullText = s.text || 'Кнопка';

    const autoStyle = getButtonAutoStyle(s);
    const isMif = autoStyle.isMif;
    const isAlpina = autoStyle.isAlpina;
    const renderColor = autoStyle.color;
    const renderIcon = autoStyle.icon;

    const text = fullText.length > 25 ? fullText.slice(0, 25) + '…' : fullText;

    const scale = 1;
    const basePaddingX = 24;
    const baseRadius = 6;

    const columnsCount = Number(s._columnsCount || 1);
    const baseFontSize = (columnsCount >= 4) ? 12 : 14;
    const baseHeight = (columnsCount >= 4) ? 31 : 45;

    const paddingX = basePaddingX * scale;
    const rectHeight = baseHeight * scale;
    const radius = baseRadius * scale;
    const fontSize = baseFontSize * scale;

    const hasIcon = !!(renderIcon && renderIcon !== 'none' && renderIcon.length > 0);

    const measureCanvas = document.createElement('canvas');
    const mctx = measureCanvas.getContext('2d');
    mctx.font = `500 ${fontSize}px RostelecomBasis-Medium, sans-serif`;
    const textWidth = mctx.measureText(text).width;

    const rectWidth = textWidth + paddingX * 2;
    const gap = 0;
    const iconSize = hasIcon ? rectHeight : 0;

    const totalWidth = rectWidth + (hasIcon ? iconSize + gap : 0);
    const totalHeight = rectHeight;

    const SCALE = 2;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(totalWidth * SCALE);
    canvas.height = Math.round(totalHeight * SCALE);

    const ctx = canvas.getContext('2d');
    ctx.scale(SCALE, SCALE);

    function draw(iconImg) {
        ctx.clearRect(0, 0, totalWidth, totalHeight);

        let rectX = 0;

        if (iconImg) {
            ctx.drawImage(iconImg, 0, 0, iconSize, iconSize);
            rectX = iconSize + gap;
        }

        ctx.save();
        roundRectPath(ctx, rectX, 0, rectWidth, rectHeight, radius);
        ctx.fillStyle = renderColor;
        ctx.fill();
        ctx.restore();

        ctx.font = `500 ${fontSize}px RostelecomBasis-Medium, sans-serif`;
        ctx.fillStyle = (isMif || isAlpina)
            ? '#ffffff'
            : (isLightColor(renderColor) ? '#3F3E4B' : '#ffffff');

        ctx.textBaseline = 'middle';
        ctx.fillText(text, rectX + paddingX, totalHeight / 2);

        callback({
            dataUrl: canvas.toDataURL('image/png'),
            width: totalWidth,
            height: totalHeight
        });
    }

    if (hasIcon) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = renderIcon;

        img.onload = () => draw(img);
        img.onerror = () => {
            console.warn('Не удалось загрузить иконку кнопки', renderIcon);
            draw(null);
        };
    } else {
        draw(null);
    }
}

function renderListBulletsToDataUrls(block, callback) {
    const s = block.settings || {};
    const items = s.items || [];
    const isNumbered = s.listStyle === 'numbered';

    // если список не нумерованный — просто очищаем кеш
    if (!isNumbered || items.length === 0) {
        block.settings.renderedBullets = [];
        if (callback) callback([]);
        return;
    }

    const bulletSize = s.bulletSize || 20;
    const bulletSrc = s.bulletCustom || ((BULLET_TYPES.find(b => b.id === s.bulletType) || BULLET_TYPES[0])?.src || null);

    const SCALE = 2;
    const numberFontSize = Math.max(10, Math.round(bulletSize * 0.45));

    const results = new Array(items.length);
    let remaining = items.length;

    function done() {
        remaining--;
        if (remaining <= 0) {
            block.settings.renderedBullets = results;
            if (callback) callback(results);
        }
    }

    // Функция для определения яркости изображения
    function getImageBrightness(img, size) {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = size;
        tempCanvas.height = size;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(img, 0, 0, size, size);

        const imageData = tempCtx.getImageData(0, 0, size, size);
        const data = imageData.data;
        let totalBrightness = 0;
        let pixelCount = 0;

        // Вычисляем среднюю яркость (игнорируем полностью прозрачные пиксели)
        for (let i = 0; i < data.length; i += 4) {
            const alpha = data[i + 3];
            if (alpha > 50) { // учитываем только непрозрачные пиксели
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];
                // Формула яркости (относительная светимость)
                const brightness = (0.299 * r + 0.587 * g + 0.114 * b);
                totalBrightness += brightness;
                pixelCount++;
            }
        }

        return pixelCount > 0 ? totalBrightness / pixelCount : 128;
    }

    function drawForIndex(index, baseImg) {
        const canvas = document.createElement('canvas');
        canvas.width = bulletSize * SCALE;
        canvas.height = bulletSize * SCALE;
        const ctx = canvas.getContext('2d');
        ctx.scale(SCALE, SCALE);

        // фон-буллит: либо картинка, либо кружок
        let textColor = '#ffffff'; // по умолчанию белый

        if (baseImg) {
            ctx.drawImage(baseImg, 0, 0, bulletSize, bulletSize);
            // Определяем яркость иконки
            const brightness = getImageBrightness(baseImg, bulletSize);
            // Если яркость больше 160 (светлая иконка) - используем тёмный текст
            textColor = brightness > 160 ? '#1D2533' : '#ffffff';
        } else {
            // Для фиолетового кружка (#a855f7) оставляем белый текст
            ctx.fillStyle = '#a855f7';
            ctx.beginPath();
            ctx.arc(bulletSize / 2, bulletSize / 2, bulletSize / 2, 0, Math.PI * 2);
            ctx.fill();
            textColor = '#ffffff';
        }

        // номер
        const startNumber = s.startNumber || 1;
        const num = index + startNumber;
        const numLabel = num < 10 ? '0' + num : String(num);

        ctx.font = `${numberFontSize}px RostelecomBasis-Light, sans-serif`;
        ctx.fillStyle = textColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(numLabel, bulletSize / 2, bulletSize / 2 + numberFontSize * 0.1);

        results[index] = canvas.toDataURL('image/png');
        done();
    }

    // грузим базовый bullet-икон, если он есть
    if (bulletSrc) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = bulletSrc;

        img.onload = () => {
            items.forEach((_, idx) => drawForIndex(idx, img));
        };

        img.onerror = () => {
            console.warn('Не удалось загрузить иконку буллита', bulletSrc);
            items.forEach((_, idx) => drawForIndex(idx, null));
        };
    } else {
        items.forEach((_, idx) => drawForIndex(idx, null));
    }
}

function roundRectPath(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split(' ');
    let line = '';
    let currentY = y;

    for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        const metrics = ctx.measureText(testLine);
        const testWidth = metrics.width;

        if (testWidth > maxWidth && n > 0) {
            ctx.fillText(line, x, currentY);
            line = words[n] + ' ';
            currentY += lineHeight;
        } else {
            line = testLine;
        }
    }
    ctx.fillText(line, x, currentY);
}
// Рендеринг иконки для блока "Важно"
function renderImportantIconToDataUrl(block, callback) {
    const s = block.settings || {};
    const iconSrc = s.icon;

    // Если иконки нет, возвращаем null
    if (!iconSrc) {
        callback(null);
        return;
    }

    const SIZE = 60; // Размер иконки
    const SCALE = 2; // Для retina

    const canvas = document.createElement('canvas');
    canvas.width = SIZE * SCALE;
    canvas.height = SIZE * SCALE;

    const ctx = canvas.getContext('2d');
    ctx.scale(SCALE, SCALE);

    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = function () {
        // Рисуем иконку с сохранением пропорций
        const aspectRatio = img.width / img.height;
        let drawWidth = SIZE;
        let drawHeight = SIZE;
        let offsetX = 0;
        let offsetY = 0;

        if (aspectRatio > 1) {
            // Широкая картинка
            drawHeight = SIZE / aspectRatio;
            offsetY = (SIZE - drawHeight) / 2;
        } else if (aspectRatio < 1) {
            // Высокая картинка
            drawWidth = SIZE * aspectRatio;
            offsetX = (SIZE - drawWidth) / 2;
        }

        ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);

        const dataUrl = canvas.toDataURL('image/png');
        callback(dataUrl);
    };

    img.onerror = function () {
        console.error('Ошибка загрузки иконки для блока "Важно"');
        callback(null);
    };

    img.src = iconSrc;
}

// Рендеринг блока картинки
function renderImageToDataUrl(block, callback) {
    const s = block.settings || {};
    const imageSrc = s.src;

    console.log('[IMAGE RENDER] Starting render for image block:', {
        src: imageSrc ? imageSrc.substring(0, 50) + '...' : 'NO SRC',
        width: s.width,
        borderRadius: s.borderRadius,
        aspectRatio: s.aspectRatio
    });

    // Если картинки нет, возвращаем null
    if (!imageSrc) {
        console.log('[IMAGE RENDER] No source, skipping render');
        callback(null);
        return;
    }

    const SCALE = 2; // Для retina
    const MAX_WIDTH = 600; // АБСОЛЮТНЫЙ МАКСИМУМ
    // Получаем border-radius для каждого угла
    let borderRadii;
    if (s.borderRadiusMode === 'each') {
        borderRadii = [
            s.borderRadiusTL || 0,
            s.borderRadiusTR || 0,
            s.borderRadiusBR || 0,
            s.borderRadiusBL || 0
        ];
    } else {
        const r = s.borderRadiusAll || 0;
        borderRadii = [r, r, r, r];
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = function () {
        console.log('[IMAGE RENDER] Image loaded. Original size:', img.width, 'x', img.height);

        // ШАГ 1: Определяем целевую ширину
        let sourceWidth = img.width;
        let sourceHeight = img.height;

        if (sourceWidth > MAX_WIDTH) {
            const aspectRatio = sourceWidth / sourceHeight;
            sourceWidth = MAX_WIDTH;
            sourceHeight = Math.round(MAX_WIDTH / aspectRatio);
        }

        // ШАГ 2: Применяем настройки пользователя
        let targetWidth;

        if (s.width === 'auto') {
            targetWidth = sourceWidth;
        } else if (s.width && s.width.includes('%')) {
            const percent = parseInt(s.width);
            targetWidth = Math.round(sourceWidth * percent / 100);
        } else if (s.width && s.width.includes('px')) {
            targetWidth = Math.min(parseInt(s.width), sourceWidth);
        } else {
            targetWidth = sourceWidth;
        }

        targetWidth = Math.min(targetWidth, MAX_WIDTH);

        // ШАГ 3: Рассчитываем высоту с учётом aspectRatio
        let targetHeight;
        const aspectRatio = s.aspectRatio || 'original';

        if (aspectRatio === 'original') {
            targetHeight = Math.round(targetWidth / (img.width / img.height));
        } else {
            // Парсим соотношение сторон (например '16:9')
            const [w, h] = aspectRatio.split(':').map(Number);
            targetHeight = Math.round(targetWidth / (w / h));
        }

        console.log('[IMAGE RENDER] Final render size:', targetWidth, 'x', targetHeight, 'aspectRatio:', aspectRatio);

        const canvas = document.createElement('canvas');
        canvas.width = targetWidth * SCALE;
        canvas.height = targetHeight * SCALE;

        const ctx = canvas.getContext('2d');
        ctx.scale(SCALE, SCALE);

        // Рисуем со скруглением
        ctx.beginPath();
        ctx.roundRect(0, 0, targetWidth, targetHeight, borderRadii);
        ctx.clip();

        // Рисуем картинку с обрезкой (cover)
        const imgAspect = img.width / img.height;
        const targetAspect = targetWidth / targetHeight;

        let drawWidth, drawHeight, drawX, drawY;

        if (imgAspect > targetAspect) {
            // Картинка шире — обрезаем по бокам
            drawHeight = targetHeight;
            drawWidth = targetHeight * imgAspect;
            drawX = (targetWidth - drawWidth) / 2;
            drawY = 0;
        } else {
            // Картинка выше — обрезаем сверху/снизу
            drawWidth = targetWidth;
            drawHeight = targetWidth / imgAspect;
            drawX = 0;
            drawY = (targetHeight - drawHeight) / 2;
        }

        ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);

        const dataUrl = canvas.toDataURL('image/png');
        console.log('[IMAGE RENDER] Render complete! DataURL length:', dataUrl.length);
        callback({
            dataUrl: dataUrl,
            width: targetWidth,
            height: targetHeight
        });
    };

    img.onerror = function () {
        console.error('[IMAGE RENDER] Error loading image');
        callback(null);
    };

    img.src = imageSrc;
}
// Вертикальный рендеринг эксперта для колонок
function renderExpertVerticalToDataUrl(block, columnWidth, callback) {
    console.log('[EXPERT RENDER] Vertical layout started', {
        blockId: block.id,
        columnWidth: columnWidth,
        photo: block.settings.photo ? 'loaded' : 'missing',
        scale: block.settings.scale,
        positionX: block.settings.positionX,
        positionY: block.settings.positionY
    });

    const s = block.settings;
    const SCALE_FACTOR = 2;

    const logicalWidth = columnWidth || 300;
    const realWidth = logicalWidth * SCALE_FACTOR;

    // Размеры
    const photoContainerSize = Math.min(171, logicalWidth - 32); // max 171px или меньше если колонка узкая
    const photoSize = Math.min(130, photoContainerSize * 0.76);
    const photoHalf = photoSize / 2;
    const padding = 16;

    // Высота: фото + отступ + текст
    const photoAreaHeight = photoContainerSize + padding * 2;
    const isLite = (s.variant || 'full') === 'lite';
    const textAreaHeight = isLite ? 0 : 120;
    const logicalHeight = photoAreaHeight + textAreaHeight;
    const realHeight = logicalHeight * SCALE_FACTOR;

    const canvas = document.createElement('canvas');
    canvas.width = realWidth;
    canvas.height = realHeight;

    const ctx = canvas.getContext('2d');
    ctx.scale(SCALE_FACTOR, SCALE_FACTOR);

    // Фон со скруглёнными углами
    function roundRectPath(ctx, x, y, w, h, r) {
        const radius = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + w - radius, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
        ctx.lineTo(x + w, y + h - radius);
        ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
        ctx.lineTo(x + radius, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    }

    ctx.save();
    roundRectPath(ctx, 0, 0, logicalWidth, logicalHeight, 48);
    ctx.clip();

    const bg = s.bgColor;
    if (bg && bg !== 'transparent') {
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, logicalWidth, logicalHeight);
    }

    // Центрируем фото по горизонтали
    // Размещаем фото слева (как текст)
    const centerX = padding + photoContainerSize / 2;
    const centerY = padding + photoContainerSize / 2;

    const photoImg = new Image();
    photoImg.crossOrigin = 'anonymous';
    photoImg.src = s.photo || 'images/expert-placeholder.png';

    photoImg.onload = () => {
        // Рисуем фото в виде ромба
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(45 * Math.PI / 180);

        ctx.beginPath();
        roundRectPath(ctx, -photoHalf, -photoHalf, photoSize, photoSize, photoSize * 0.45);
        ctx.closePath();
        ctx.clip();

        const scale = (s.scale || 115) / 100;
        const offsetX = (s.positionX || 0) / 100 * photoSize * 2;
        const offsetY = (s.positionY || 0) / 100 * photoSize * 2;

        ctx.rotate(-45 * Math.PI / 180);
        ctx.translate(offsetX, offsetY);
        ctx.scale(scale, scale);

        // Вычисляем размеры для cover (как object-fit: cover)
        const imgAspect = photoImg.width / photoImg.height;
        const boxAspect = 1; // квадрат

        let drawWidth, drawHeight, drawX, drawY;

        if (imgAspect > boxAspect) {
            // Изображение шире - масштабируем по высоте
            drawHeight = photoSize;
            drawWidth = photoSize * imgAspect;
            drawX = -drawWidth / 2;
            drawY = -drawHeight / 2;
        } else {
            // Изображение выше - масштабируем по ширине
            drawWidth = photoSize;
            drawHeight = photoSize / imgAspect;
            drawX = -drawWidth / 2;
            drawY = -drawHeight / 2;
        }

        ctx.drawImage(photoImg, drawX, drawY, drawWidth, drawHeight);
        ctx.restore();

        // Рамка ромба
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(45 * Math.PI / 180);
        // ctx.strokeStyle = '#374151';
        ctx.lineWidth = 0;
        roundRectPath(ctx, -photoHalf, -photoHalf, photoSize, photoSize, photoSize * 0.45);
        // ctx.stroke();
        ctx.restore();

        const drawTextAndFinish = () => {
            const textY = photoAreaHeight;
            const textX = padding;
            const textWidth = logicalWidth - padding * 2;

            const textColorV = getExpertTextColor(s.bgColor);
            // Имя (слева)
            ctx.font = 'bold 15px Arial, sans-serif';
            ctx.fillStyle = textColorV;
            ctx.textBaseline = 'top';
            ctx.textAlign = 'left';
            ctx.fillText(s.name || 'Имя эксперта', textX, textY);

            // Должность (слева)
            ctx.font = '12px Arial, sans-serif';
            ctx.fillStyle = textColorV;
            ctx.fillText(s.title || 'Должность', textX, textY + 20);

            // Био (слева, с переносами)
            ctx.font = '13px Arial, sans-serif';
            ctx.fillStyle = textColorV;

            function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
                const words = text.split(' ');
                let line = '';
                let yPos = y;

                for (let n = 0; n < words.length; n++) {
                    const testLine = line + words[n] + ' ';
                    const metrics = ctx.measureText(testLine);
                    if (metrics.width > maxWidth && n > 0) {
                        ctx.fillText(line, x, yPos);
                        line = words[n] + ' ';
                        yPos += lineHeight;
                    } else {
                        line = testLine;
                    }
                }
                ctx.fillText(line, x, yPos);
            }

            wrapText(ctx, s.bio || 'Краткое описание эксперта', textX, textY + 42, textWidth, 18);

            const dataUrl = canvas.toDataURL('image/png');
            callback({
                dataUrl: dataUrl,
                width: logicalWidth
            });
        };

        // Бейдж
        if (s.badgeIcon) {
            const badgeImg = new Image();
            badgeImg.crossOrigin = 'anonymous';
            badgeImg.src = s.badgeIcon;

            const badgeSize = Math.min(42, photoContainerSize * 0.25);

            // Используем badgePositionX и badgePositionY
            const badgeX = s.badgePositionX ?? 100;
            const badgeY = s.badgePositionY ?? 100;

            // Вычисляем позицию относительно контейнера фото
            const badgeLeft = (centerX - photoContainerSize / 2) + (photoContainerSize - badgeSize) * (badgeX / 100);
            const badgeTop = (centerY - photoContainerSize / 2) + (photoContainerSize - badgeSize) * (badgeY / 100);


            badgeImg.onload = () => {
                ctx.drawImage(badgeImg, badgeLeft, badgeTop, badgeSize, badgeSize);
                drawTextAndFinish();
            };

            badgeImg.onerror = () => {
                drawTextAndFinish();
            };
        } else {
            drawTextAndFinish();
        }
    };

    photoImg.onerror = () => {
        console.warn('Не удалось загрузить фото эксперта');
        ctx.restore();
        callback(null);
    };
}

function getAdvancedBannerGradientConfig({
    width,
    height,
    angle,
    centerX,
    centerY,
    balance
}) {
    const safeAngle = Number(angle) || 0;
    const safeCenterX = clamp(Number(centerX) || 50, 0, 100);
    const safeCenterY = clamp(Number(centerY) || 50, 0, 100);
    const safeBalance = Math.max(1, Number(balance) || 100);

    const cx = width * (safeCenterX / 100);
    const cy = height * (safeCenterY / 100);

    const radians = safeAngle * Math.PI / 180;
    const dx = Math.cos(radians);
    const dy = Math.sin(radians);

    const baseLength = Math.sqrt(width * width + height * height);
    const halfLength = (baseLength * safeBalance / 100) / 2;

    const x0 = cx - dx * halfLength;
    const y0 = cy - dy * halfLength;
    const x1 = cx + dx * halfLength;
    const y1 = cy + dy * halfLength;

    return { x0, y0, x1, y1 };
}

function applyOpacityToHex(hex, opacityPercent) {
    if (!hex || typeof hex !== 'string') return 'rgba(0,0,0,1)';

    let normalized = hex.replace('#', '').trim();
    if (normalized.length === 3) {
        normalized = normalized.split('').map(ch => ch + ch).join('');
    }
    if (normalized.length !== 6) return 'rgba(0,0,0,1)';

    const r = parseInt(normalized.slice(0, 2), 16);
    const g = parseInt(normalized.slice(2, 4), 16);
    const b = parseInt(normalized.slice(4, 6), 16);
    const a = clamp(Number(opacityPercent) || 100, 0, 100) / 100;

    return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function getBannerGradientStopsForRender(settings) {
    if (Array.isArray(settings.gradientStops) && settings.gradientStops.length >= 2) {
        return normalizeRenderGradientStops(settings.gradientStops);
    }

    // Дефолтный градиент зависит от режима:
    // mask → градиент на левом блоке, стартовый цвет = leftBlockColor
    // rounded → градиент на фоне, стартовый цвет = backgroundColor
    const mode = settings.rightImageMode || 'mask';
    const baseColor = (mode === 'mask')
        ? (settings.leftBlockColor || '#1D2533')
        : (settings.backgroundColor || '#7700FF');

    return normalizeRenderGradientStops([
        {
            id: 1,
            color: baseColor,
            opacity: 100,
            position: Number(settings.gradientStart ?? 0)
        },
        {
            id: 2,
            color: settings.gradientColor || '#A855F7',
            opacity: Number(settings.gradientOpacity ?? 100),
            position: Number(settings.gradientEnd ?? 100)
        }
    ]);
}

function normalizeRenderGradientStops(stops) {
    return [...stops]
        .map((stop, index) => ({
            id: stop?.id ?? Date.now() + index,
            color: normalizeRenderHex(stop?.color || '#7700FF'),
            opacity: clamp(stop?.opacity != null ? Number(stop.opacity) : 100, 0, 100),
            position: clamp(stop?.position != null ? Number(stop.position) : (index === 0 ? 0 : 100), 0, 100)
        }))
        .sort((a, b) => a.position - b.position);
}

function createBannerGradientFillStyle(ctx, {
    width,
    height,
    angle,
    centerX,
    centerY,
    balance,
    stops
}) {
    const gradientConfig = getAdvancedBannerGradientConfig({
        width,
        height,
        angle,
        centerX,
        centerY,
        balance
    });

    const gradient = ctx.createLinearGradient(
        gradientConfig.x0,
        gradientConfig.y0,
        gradientConfig.x1,
        gradientConfig.y1
    );

    stops.forEach(stop => {
        gradient.addColorStop(
            stop.position / 100,
            applyOpacityToHex(stop.color, stop.opacity)
        );
    });

    return gradient;
}

function normalizeRenderHex(value) {
    const raw = String(value || '').trim().replace('#', '');
    if (/^[0-9a-fA-F]{6}$/.test(raw)) {
        return `#${raw.toUpperCase()}`;
    }
    return '#7700FF';
}