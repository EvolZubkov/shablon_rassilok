// userTemplates.js - Вспомогательные функции для работы с шаблонами в user-версии

/**
 * Загрузить шаблон и подготовить его для редактирования
 */
async function prepareTemplateForEditing(templateData) {
    if (!templateData || !templateData.blocks) return null;
    
    const blocks = JSON.parse(JSON.stringify(templateData.blocks));
    
    // Перерендериваем все блоки которые требуют рендеринга
    for (const block of blocks) {
        await prerenderBlock(block);
        
        // Если есть колонки - рендерим вложенные блоки
        if (block.columns) {
            for (const column of block.columns) {
                for (const childBlock of column.blocks || []) {
                    await prerenderBlock(childBlock);
                }
            }
        }
    }
    
    return blocks;
}

/**
 * Пре-рендеринг блока (баннеры, кнопки, эксперты и т.д.)
 */
async function prerenderBlock(block) {
    return new Promise((resolve) => {
        switch (block.type) {
            case 'banner':
                if (typeof renderBannerToDataUrl === 'function') {
                    renderBannerToDataUrl(block, (dataUrl) => {
                        block.settings.renderedBanner = dataUrl;
                        resolve();
                    });
                } else {
                    resolve();
                }
                break;
                
            case 'button':
                if (typeof renderButtonToDataUrl === 'function') {
                    renderButtonToDataUrl(block, (result) => {
                        if (result) {
                            block.settings.renderedButton = result.dataUrl;
                            block.settings.renderedButtonW = result.width;
                            block.settings.renderedButtonH = result.height;
                        }
                        resolve();
                    });
                } else {
                    resolve();
                }
                break;
                
            case 'expert':
                if (typeof renderExpertToDataUrl === 'function') {
                    renderExpertToDataUrl(block, (result) => {
                        if (result) {
                            block.settings.renderedExpert = result.dataUrl;
                            block.settings.renderedExpertWidth = result.width;
                        }
                        resolve();
                    });
                } else {
                    resolve();
                }
                break;
                
            case 'list':
                if (block.settings.listStyle === 'numbered' && typeof renderListBulletsToDataUrls === 'function') {
                    renderListBulletsToDataUrls(block, () => {
                        resolve();
                    });
                } else {
                    resolve();
                }
                break;
                
            case 'image':
                if (block.settings.src && typeof renderImageToDataUrl === 'function') {
                    renderImageToDataUrl(block, (result) => {
                        if (result) {
                            block.settings.renderedImage = result.dataUrl;
                            block.settings.renderedWidth = result.width;
                            block.settings.renderedHeight = result.height;
                        }
                        resolve();
                    });
                } else {
                    resolve();
                }
                break;
                
            case 'important':
                if (block.settings.icon && typeof renderImportantIconToDataUrl === 'function') {
                    renderImportantIconToDataUrl(block, (dataUrl) => {
                        block.settings.renderedIcon = dataUrl;
                        resolve();
                    });
                } else {
                    resolve();
                }
                break;
                
            default:
                resolve();
        }
    });
}

/**
 * Получить статистику шаблонов по категориям
 */
function getTemplateStats() {
    const stats = {
        total: UserAppState.templates.length,
        byCategory: {}
    };
    
    UserAppState.templates.forEach(template => {
        const category = template.category || 'Без категории';
        stats.byCategory[category] = (stats.byCategory[category] || 0) + 1;
    });
    
    return stats;
}

/**
 * Форматирование даты создания шаблона
 */
function formatTemplateDate(isoDate) {
    if (!isoDate) return '';
    
    try {
        const date = new Date(isoDate);
        return date.toLocaleDateString('ru-RU', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });
    } catch {
        return '';
    }
}