// shared/typography.js — типографика текста (без DOM).
//
// Подключается в браузере как window.Typography и в тестах как CommonJS-модуль.

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.Typography = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {

    // Все варианты «прямых» и английских кавычек, которые пользователь мог напечатать.
    const QUOTE_CHARS = new Set(['"', '“', '”', '„', '«', '»']);
    const OUTER_OPEN = '«';   // «
    const OUTER_CLOSE = '»';  // »
    const INNER_OPEN = '„';   // „
    const INNER_CLOSE = '“';  // “

    // Перед такими символами кавычка считается открывающей.
    const OPENING_CONTEXT = /[\s(\[{—–-]/;

    /**
     * Заменяет парные кавычки на «ёлочки»; вложенные — на „лапки“.
     * Кавычка открывающая, если стоит в начале, после пробела/скобки/тире
     * или когда нет открытых; иначе закрывающая. Непарная кавычка
     * в конце строки (нет открытых) не ломает остальной текст.
     *
     * @param {string} text
     * @returns {string}
     */
    function toGuillemets(text) {
        if (typeof text !== 'string' || text === '') return text || '';

        let depth = 0;
        let result = '';
        for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            if (!QUOTE_CHARS.has(ch)) {
                result += ch;
                continue;
            }
            const prev = i === 0 ? '' : text[i - 1];
            const opening = depth === 0
                ? true
                : (prev === '' || OPENING_CONTEXT.test(prev));
            if (opening) {
                result += depth === 0 ? OUTER_OPEN : INNER_OPEN;
                depth++;
            } else {
                depth--;
                result += depth === 0 ? OUTER_CLOSE : INNER_CLOSE;
            }
        }
        return result;
    }

    return { toGuillemets };
}));
