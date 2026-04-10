/**
 * @fileoverview Universal color picker facade.
 *
 * Wraps openBannerColorDialog (bannerSettings.js) and exposes a single
 * entry point used throughout the app instead of native <input type="color">.
 *
 * @module colorPicker
 */

/**
 * Open the custom color picker dialog.
 *
 * @param {object}   options
 * @param {string}   [options.title='Выбор цвета']  - Dialog title.
 * @param {string}   [options.currentColor='#FFFFFF'] - Initial color value.
 * @param {boolean}  [options.allowTransparent=false] - Whether transparent is a valid choice.
 * @param {function} options.onApply  - Called with the chosen color string when user confirms.
 */
function pickColor(options) {
    const {
        title          = 'Выбор цвета',
        currentColor   = '#FFFFFF',
        allowTransparent = false,
        onApply        = null,
    } = options || {};

    openBannerColorDialog({ title, currentColor, allowTransparent, onApply });
}

function formatColorValue(color) {
    if (!color) return '';
    if (String(color).trim().toLowerCase() === 'transparent') {
        return 'Без цвета';
    }
    return String(color).toUpperCase();
}

function applyColorTriggerValue(trigger, value) {
    if (!trigger) return;
    const normalized = value || '#FFFFFF';
    trigger.dataset.colorValue = normalized;
    trigger.style.background = String(normalized).trim().toLowerCase() === 'transparent'
        ? 'linear-gradient(45deg, rgba(255,255,255,0.12) 25%, transparent 25%, transparent 50%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0.12) 75%, transparent 75%, transparent), #334155'
        : normalized;
}

function bindColorTrigger(options) {
    const {
        trigger,
        valueNode = null,
        title = 'Выбор цвета',
        currentColor = '#FFFFFF',
        allowTransparent = false,
        onApply = null,
    } = options || {};

    if (!trigger) return;

    const syncValue = (nextColor) => {
        applyColorTriggerValue(trigger, nextColor);
        if (valueNode) {
            valueNode.textContent = formatColorValue(nextColor);
        }
    };

    syncValue(currentColor);

    trigger.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        pickColor({
            title,
            currentColor: trigger.dataset.colorValue || currentColor,
            allowTransparent,
            onApply: (chosenColor) => {
                syncValue(chosenColor);
                if (typeof onApply === 'function') {
                    onApply(chosenColor);
                }
            },
        });
    };
}

window.pickColor = pickColor;
window.formatColorValue = formatColorValue;
window.applyColorTriggerValue = applyColorTriggerValue;
window.bindColorTrigger = bindColorTrigger;
