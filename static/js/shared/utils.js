// shared/utils.js — утилиты, используемые и в admin, и в user интерфейсе.
// Подключается в index.html и index-user.html раньше остальных скриптов.

// ─── Экранирование HTML ──────────────────────────────────────────────────────

/**
 * Экранирует спецсимволы HTML.
 * Используется при вставке пользовательского текста в innerHTML / атрибуты.
 *
 * Единственный источник правды — заменяет:
 *   emailGenerator.js:25   — function escapeHtml (regex-версия)
 *   userBannerEditor.js:567 — function escapeHtml (DOM-версия)
 *   userEditor.js:1196      — function escapeHtmlAttr (то же самое)
 */
function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// escapeHtmlAttr — псевдоним для обратной совместимости
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