// imageRenderers.js - Рендеринг баннеров и экспертов в canvas

function renderBannerToDataUrl(block, callback) {
    const s = block.settings;
    if (!s.image) {
        callback(null);
        return;
    }

    const img = new Image();
    img.src = s.image;

    img.onload = () => {
        const { LOGICAL_WIDTH, SCALE_FACTOR, REAL_WIDTH } = CANVAS_CONFIG;
        const k = REAL_WIDTH / img.naturalWidth;
        const realHeight = Math.round(img.naturalHeight * k);

        const canvas = document.createElement('canvas');
        canvas.width = REAL_WIDTH;
        canvas.height = realHeight;

        const ctx = canvas.getContext('2d');
        ctx.scale(SCALE_FACTOR, SCALE_FACTOR);

        // Фоновое изображение
        ctx.drawImage(img, 0, 0, REAL_WIDTH / SCALE_FACTOR, realHeight / SCALE_FACTOR);

        // Текст
        const fontSize = s.fontSize || 24;
        const fontFamily = s.fontFamily || 'rt-regular';
        const lineHeight = (s.lineHeight || 1.2) * fontSize;
        const letterSpacing = s.letterSpacing || 0;

        // Маппинг fontFamily на реальные CSS имена
        const fontMap = {
            'rt-light': 'RostelecomBasis-Light',
            'rt-regular': 'RostelecomBasis-Regular',
            'rt-medium': 'RostelecomBasis-Medium',
            'rt-bold': 'RostelecomBasis-Bold',
            'default': 'RostelecomBasis-Regular'
        };
        const actualFont = fontMap[fontFamily] || 'RostelecomBasis-Regular';

        ctx.font = `${fontSize}px ${actualFont}, Arial, sans-serif`;
        ctx.fillStyle = '#ffffff';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';

        const logicalWidthCanvas = REAL_WIDTH / SCALE_FACTOR;
        const logicalHeightCanvas = realHeight / SCALE_FACTOR;

        const x = (s.positionX || 50) / 100 * logicalWidthCanvas;
        const y = (s.positionY || 50) / 100 * logicalHeightCanvas;

        const lines = (s.text || '').split('\n').filter(l => l.trim());
        const totalHeight = (lines.length - 1) * lineHeight;
        let currentY = y - totalHeight / 2;

        for (const line of lines) {
            if (letterSpacing) {
                let dx = 0;
                for (const ch of line) {
                    ctx.fillText(ch, x + dx, currentY);
                    dx += ctx.measureText(ch).width + letterSpacing;
                }
            } else {
                ctx.fillText(line, x, currentY);
            }
            currentY += lineHeight;
        }

        const dataUrl = canvas.toDataURL('image/png');
        callback(dataUrl);
    };

    img.onerror = () => {
        console.warn('Не удалось загрузить картинку баннера', s.image);
        callback(null);
    };
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
    const { LOGICAL_WIDTH, SCALE_FACTOR, REAL_WIDTH } = CANVAS_CONFIG;

    // Высота блока
    const logicalHeight = 203;
    const realHeight = logicalHeight * SCALE_FACTOR;

    const canvas = document.createElement('canvas');
    canvas.width = REAL_WIDTH;
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
    roundRectPath(ctx, 0, 0, LOGICAL_WIDTH, logicalHeight, 48);
    ctx.clip();

    const bg = s.bgColor;

    // если фон задан и он не "transparent" — рисуем фон,
    // иначе оставляем прозрачный
    if (bg && bg !== 'transparent') {
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, LOGICAL_WIDTH, logicalHeight);
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
        ctx.strokeStyle = '#374151';
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
            const textWidth = LOGICAL_WIDTH - textX - 24;

            // Имя
            ctx.font = 'bold 15px Arial, sans-serif';
            ctx.fillStyle = s.nameColor || '#f9fafb';
            ctx.textBaseline = 'top';
            wrapText(ctx, s.name || 'Имя эксперта', textX, textY, textWidth, 18);

            // Должность
            ctx.font = '12px Arial, sans-serif';
            ctx.fillStyle = s.titleColor || '#9ca3af';
            wrapText(ctx, s.title || 'Должность', textX, textY + 22, textWidth, 16);

            // Био
            ctx.font = '13px Arial, sans-serif';
            ctx.fillStyle = s.textColor || '#e5e7eb';
            wrapText(ctx, s.bio || 'Краткое описание эксперта', textX, textY + 42, textWidth, 18);

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
    const text = s.text || 'Кнопка';
    const scale = s.size || 1;

    const baseFontSize = 14;
    const basePaddingX = 24;
    const basePaddingY = 12;
    const baseRadius = 6;

    const fontSize = baseFontSize * scale;
    const paddingX = basePaddingX * scale;
    const paddingY = basePaddingY * scale;
    const radius = baseRadius * scale;

    const hasIcon = !!s.icon;

    // Замеряем ширину текста
    const measureCanvas = document.createElement('canvas');
    const mctx = measureCanvas.getContext('2d');
    mctx.font = `600 ${fontSize}px Arial, sans-serif`;
    const textWidth = mctx.measureText(text).width;

    // Размер самой цветной кнопки (прямоугольника)
    const rectHeight = fontSize + paddingY * 2;
    const rectWidth = textWidth + paddingX * 2;

    // Параметры иконки слева
    const gap = hasIcon ? 0 * scale : 0;
    const iconSize = hasIcon ? rectHeight : 0;

    // Общий размер картинки = иконка + отступ + прямоугольник
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

        // Рисуем иконку слева, если есть
        if (iconImg) {
            const xIcon = 0;
            const yIcon = (totalHeight - iconSize) / 2;
            ctx.drawImage(iconImg, xIcon, yIcon, iconSize, iconSize);

            rectX = iconSize + gap;
        }

        // Цветная кнопка-rect справа от иконки
        ctx.save();
        roundRectPath(ctx, rectX, 0, rectWidth, rectHeight, radius);
        ctx.fillStyle = s.color || '#f97316';
        ctx.fill();
        ctx.restore();

        // Текст внутри прямоугольника
        ctx.font = `600 ${fontSize}px Arial, sans-serif`;
        ctx.fillStyle = s.textColor || '#ffffff';
        ctx.textBaseline = 'middle';
        const textX = rectX + paddingX;
        const textY = totalHeight / 2;
        ctx.fillText(text, textX, textY);

        const dataUrl = canvas.toDataURL('image/png');
        callback(dataUrl);
    }

    if (hasIcon) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = s.icon;

        img.onload = () => draw(img);
        img.onerror = () => {
            console.warn('Не удалось загрузить иконку кнопки', s.icon);
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
    const bulletSrc = s.bulletCustom || (BULLET_TYPES.find(b => b.id === s.bulletType)?.src || null);

    const SCALE = 2;
    const numberFontSize = Math.max(6, Math.round(bulletSize * 0.3));

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
        const num = index + 1;
        const numLabel = num < 10 ? '0' + num : String(num);

        ctx.font = `600 ${numberFontSize}px Arial, sans-serif`;
        ctx.fillStyle = textColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(numLabel, bulletSize / 2, bulletSize / 2);

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
        width: s.width
    });

    // Если картинки нет, возвращаем null
    if (!imageSrc) {
        console.log('[IMAGE RENDER] No source, skipping render');
        callback(null);
        return;
    }

    const SCALE = 2; // Для retina
    const MAX_WIDTH = 600; // АБСОЛЮТНЫЙ МАКСИМУМ - никогда не превышать!
    const BORDER_RADIUS = 4;

    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = function () {
        console.log('[IMAGE RENDER] Image loaded. Original size:', img.width, 'x', img.height);

        // ШАГ 1: Сначала уменьшаем оригинальную картинку если она больше 600px
        let sourceWidth = img.width;
        let sourceHeight = img.height;

        if (sourceWidth > MAX_WIDTH) {
            const aspectRatio = sourceWidth / sourceHeight;
            sourceWidth = MAX_WIDTH;
            sourceHeight = Math.round(MAX_WIDTH / aspectRatio);
            console.log('[IMAGE RENDER] Step 1: Reduced to', sourceWidth, 'x', sourceHeight);
        }

        // ШАГ 2: Теперь применяем настройки пользователя к уже уменьшенной картинке
        let targetWidth;

        if (s.width === 'auto') {
            // Используем ширину из шага 1
            targetWidth = sourceWidth;
        } else if (s.width && s.width.includes('%')) {
            // Процент от уже уменьшенной ширины
            const percent = parseInt(s.width);
            targetWidth = Math.round(sourceWidth * percent / 100);
        } else if (s.width && s.width.includes('px')) {
            // Пиксели - но не больше sourceWidth!
            targetWidth = Math.min(parseInt(s.width), sourceWidth);
        } else {
            // По умолчанию используем sourceWidth
            targetWidth = sourceWidth;
        }

        console.log('[IMAGE RENDER] Step 2: Applied user width setting, targetWidth =', targetWidth);

        // ШАГ 3: КРИТИЧНАЯ ФИНАЛЬНАЯ ПРОВЕРКА - никогда не превышать 600px!
        targetWidth = Math.min(targetWidth, MAX_WIDTH);

        console.log('[IMAGE RENDER] Step 3: Final width =', targetWidth);

        // Рассчитываем высоту с сохранением пропорций оригинала
        const aspectRatio = img.width / img.height;
        const targetHeight = Math.round(targetWidth / aspectRatio);

        console.log('[IMAGE RENDER] Final render size:', targetWidth, 'x', targetHeight);

        const canvas = document.createElement('canvas');
        canvas.width = targetWidth * SCALE;
        canvas.height = targetHeight * SCALE;

        const ctx = canvas.getContext('2d');
        ctx.scale(SCALE, SCALE);

        // Рисуем картинку со скруглением
        ctx.beginPath();
        ctx.roundRect(0, 0, targetWidth, targetHeight, BORDER_RADIUS);
        ctx.clip();

        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

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
    const textAreaHeight = 120; // примерная высота текста
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
        ctx.strokeStyle = '#374151';
        ctx.lineWidth = 0;
        roundRectPath(ctx, -photoHalf, -photoHalf, photoSize, photoSize, photoSize * 0.45);
        ctx.stroke();
        ctx.restore();

        const drawTextAndFinish = () => {
            const textY = photoAreaHeight;
            const textX = padding;
            const textWidth = logicalWidth - padding * 2;

            // Имя (слева)
            ctx.font = 'bold 15px Arial, sans-serif';
            ctx.fillStyle = s.nameColor || '#f9fafb';
            ctx.textBaseline = 'top';
            ctx.textAlign = 'left';
            ctx.fillText(s.name || 'Имя эксперта', textX, textY);

            // Должность (слева)
            ctx.font = '12px Arial, sans-serif';
            ctx.fillStyle = s.titleColor || '#9ca3af';
            ctx.fillText(s.title || 'Должность', textX, textY + 20);

            // Био (слева, с переносами)
            ctx.font = '13px Arial, sans-serif';
            ctx.fillStyle = s.textColor || '#e5e7eb';

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