// shared/utils.js — утилиты, используемые и в admin, и в user интерфейсе.
// Подключается в index.html и index-user.html раньше остальных скриптов.

// ─── Экранирование HTML ──────────────────────────────────────────────────────

/**
 * Escape HTML special characters in a plain-text value.
 *
 * Thin wrapper around {@link TextSanitizer.escapeHTML} — canonical
 * implementation lives in textSanitizer.js which is loaded first.
 * Kept here so existing callers (emailGenerator.js, userBannerEditor.js,
 * userEditor.js) continue to work without change.
 *
 * @param {*} text
 * @returns {string}
 */
function escapeHtml(text) {
    return TextSanitizer.escapeHTML(text);
}

// escapeHtmlAttr — alias for backwards compatibility
const escapeHtmlAttr = escapeHtml;


// ─── Поиск блоков ────────────────────────────────────────────────────────────

/**
 * Рекурсивный поиск блока по id в произвольном дереве блоков.
 * Ищет на всех уровнях вложенности (колонки → вложенные блоки).
 *
 * Заменяет:
 *   userEditor.js:112  — findBlockByIdDeep
 *   userEditor.js:900  — findBlockById  (не рекурсивный, только 2 уровня)
 *
 * AppState.findBlockById в state.js оставляем как есть — он работает
 * с AppState.blocks и используется только в admin-контексте.
 */
function findBlockDeep(blocks, id) {
    for (const block of blocks || []) {
        if (block.id === id) return block;

        if (block.columns) {
            for (const col of block.columns) {
                const found = findBlockDeep(col.blocks || [], id);
                if (found) return found;
            }
        }
    }
    return null;
}