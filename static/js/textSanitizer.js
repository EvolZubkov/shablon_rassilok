// textSanitizer.js — единый модуль обработки текста
// Подключать ПЕРВЫМ среди JS файлов

const TextSanitizer = (() => {

    // Разрешённые теги и их атрибуты
    const ALLOWED_TAGS = {
        'p':      [],
        'br':     [],
        'strong': [],
        'b':      [],
        'em':     [],
        'i':      [],
        'u':      [],
        'a':      ['href'],
    };

    // Цвет ссылок (можно переопределить)
    const LINK_STYLE = 'color:#7700ff; text-decoration:underline;';

    // -------------------------------------------------------
    // Внутренняя очистка DOM-дерева от запрещённых тегов/атрибутов
    // -------------------------------------------------------
    function _cleanNode(node, doc) {
        if (node.nodeType === 3) {
            return node.cloneNode();
        }

        if (node.nodeType !== 1) {
            return null;
        }

        const tag = node.tagName.toLowerCase();

        if (ALLOWED_TAGS.hasOwnProperty(tag)) {
            const clean = doc.createElement(tag);
            for (const attr of ALLOWED_TAGS[tag]) {
                if (node.hasAttribute(attr)) {
                    let val = node.getAttribute(attr);
                    if (attr === 'href') {
                        if (!/^(https?:\/\/|mailto:)/i.test(val)) continue;
                    }
                    clean.setAttribute(attr, val);
                }
            }
            for (const child of node.childNodes) {
                const cleanChild = _cleanNode(child, doc);
                if (cleanChild) clean.appendChild(cleanChild);
            }
            return clean;
        }

        const BLOCK_TAGS = ['div', 'section', 'article', 'header',
                            'footer', 'main', 'nav', 'aside',
                            'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
                            'li', 'dt', 'dd', 'blockquote', 'pre'];
        if (BLOCK_TAGS.includes(tag)) {
            const p = doc.createElement('p');
            for (const child of node.childNodes) {
                const cleanChild = _cleanNode(child, doc);
                if (cleanChild) p.appendChild(cleanChild);
            }
            return p;
        }

        if (tag === 'b' || tag === 'strong') {
            const style = node.getAttribute('style') || '';
            if (style.includes('font-weight:normal') || style.includes('font-weight: normal')) {
                const frag = doc.createDocumentFragment();
                for (const child of node.childNodes) {
                    const cleanChild = _cleanNode(child, doc);
                    if (cleanChild) frag.appendChild(cleanChild);
                }
                return frag;
            }
        }

        const frag = doc.createDocumentFragment();
        for (const child of node.childNodes) {
            const cleanChild = _cleanNode(child, doc);
            if (cleanChild) frag.appendChild(cleanChild);
        }
        return frag;
    }

    // -------------------------------------------------------
    // Нормализация: убираем пустые <p>, схлопываем дубли
    // -------------------------------------------------------
    function _normalizeParagraphs(html) {
        return html
            // Убираем пустые параграфы (только пробелы или <br>)
            .replace(/<p>(\s|<br\s*\/?>)*<\/p>/gi, '')
            // Схлопываем несколько <br> подряд в один
            .replace(/(<br\s*\/?>\s*){3,}/gi, '<br><br>')
            // Убираем пробелы между тегами
            .replace(/>\s+</g, '><')
            .trim();
    }

    // -------------------------------------------------------
    // Конвертация plain text → simple HTML
    // Двойной \n → новый <p>, одиночный \n → <br>
    // Markdown-ссылки [текст](url) → <a href>
    // **текст** → <strong>
    // -------------------------------------------------------
    function _plainTextToHTML(text) {
        if (!text) return '';

        // Нормализуем переносы (\r\n, \r → \n)
        text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

        // Markdown жирный **текст**
        text = text.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');

        // Markdown ссылки [текст](url)
        text = text.replace(
            /\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g,
            '<a href="$2">$1</a>'
        );

        // Авто-ссылки http(s)://...
        text = text.replace(
            /(^|[\s>])((https?:\/\/)[^\s<]+)/g,
            '$1<a href="$2">$2</a>'
        );

        // Разбиваем на абзацы по двойному переносу
        const paragraphs = text.split(/\n{2,}/);

        return paragraphs
            .map(p => {
                p = p.trim();
                if (!p) return '';
                // Одиночный \n внутри абзаца → <br>
                p = p.replace(/\n/g, '<br>');
                return `<p>${p}</p>`;
            })
            .filter(Boolean)
            .join('');
    }

    // -------------------------------------------------------
    // Очистка HTML из contenteditable / буфера обмена
    // -------------------------------------------------------
    function _cleanHTML(dirtyHTML) {
        if (!dirtyHTML) return '';

        // Используем DOMParser для безопасного парсинга
        const parser = new DOMParser();
        const doc = parser.parseFromString(dirtyHTML, 'text/html');

        // Убираем Office/Google теги целиком (мета, стили, скрипты)
        const removeSelectors = [
            'style', 'script', 'meta', 'link',
            'o\\:p', 'w\\:sdt', 'w\\:sdtContent',
            '[class^="Mso"]', '[style*="mso-"]',
        ];
        removeSelectors.forEach(sel => {
            try {
                doc.querySelectorAll(sel).forEach(el => el.remove());
            } catch(e) {}
        });

        // Чистим body
        const result = doc.createElement('div');
        for (const child of doc.body.childNodes) {
            const clean = _cleanNode(child, doc);
            if (clean) result.appendChild(clean);
        }

        let cleaned = _normalizeParagraphs(result.innerHTML);
        // Убеждаемся что между <p> нет слипания
        cleaned = cleaned.replace(/<\/p><p>/gi, '</p><p>');
        return cleaned;
    }

    // -------------------------------------------------------
    // Типографика: неразрывные пробелы после коротких слов
    // -------------------------------------------------------

    function _loadHangingWords() {
        const browserPath = '/data/textSanitizer.hangingWords.json';

        // Node/Vitest path: load directly from the repo so tests remain synchronous.
        try {
            if (typeof process !== 'undefined' && process.versions && process.versions.node) {
                const fs = typeof process.getBuiltinModule === 'function'
                    ? process.getBuiltinModule('fs')
                    : null;
                const path = typeof process.getBuiltinModule === 'function'
                    ? process.getBuiltinModule('path')
                    : null;
                if (fs && path) {
                    const fullPath = path.join(process.cwd(), 'static', 'data', 'textSanitizer.hangingWords.json');
                    return JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
                }
            }
        } catch (_) {}

        // Browser path: same-origin synchronous XHR during script init.
        try {
            if (typeof XMLHttpRequest !== 'undefined') {
                const xhr = new XMLHttpRequest();
                xhr.open('GET', browserPath, false);
                xhr.send(null);
                if (xhr.status >= 200 && xhr.status < 300 && xhr.responseText) {
                    return JSON.parse(xhr.responseText);
                }
            }
        } catch (_) {}

        return [];
    }

    // Russian prepositions, conjunctions and particles that must not be left
    // hanging at the end of a line (followed by a line break before the next word).
    const HANGING_WORDS = new Set(_loadHangingWords());

    // Match any alphabetic word followed by a regular space.
    // The final decision is made by `_shouldNbspWord()`:
    // explicit dictionary match OR any word up to 3 letters long.
    const _HANGING_RE = /(?:^|(?<=[\s\u00A0]))([A-Za-zА-Яа-яЁё]{1,})( )(?=\S)/g;

    function _shouldNbspWord(word) {
        if (!word) return false;
        const lower = word.toLowerCase();
        return HANGING_WORDS.has(lower) || lower.length <= 3;
    }

    /**
     * Replace a regular space with a non-breaking space after Russian prepositions,
     * conjunctions, and particles so they cannot be separated from the following word
     * by a line break.
     *
     * Operates on raw text content (no HTML), so HTML attributes are never affected.
     *
     * @param {string} text - plain text content of a single DOM text node
     * @returns {string}
     */
    function _nbspHanging(text) {
        _HANGING_RE.lastIndex = 0;
        return text.replace(_HANGING_RE, (match, word) => {
            if (!_shouldNbspWord(word)) return match;
            return `${word}\u00A0`;
        });
    }

    /**
     * Replace a hyphen-minus (`-`) with an em dash (`—`) in the following cases:
     *
     *  1. Surrounded by spaces:              `word - word`  → `word — word`
     *  2. After sentence punctuation (, . ! ?) optionally preceded by a space,
     *     followed by a space and a word:    `, - word`     → `, — word`
     *  3. At the very beginning of the text (list-item style):
     *                                         `- text`       → `— text`
     *
     * The hyphen is intentionally left unchanged when:
     *  - Between letters (hyphenated words, compound names, slugs, identifiers).
     *  - Adjacent to digits without spaces (negative numbers, ranges: -5, 5-3).
     *  - Inside URLs or email addresses (detected heuristically as "no surrounding spaces").
     *
     * After all replacements, spaces around `—` are normalised to exactly one on each side.
     *
     * @param {string} text - plain text content of a single DOM text node
     * @returns {string}
     */
    function _replaceDash(text) {
        // Case 3: hyphen at start of text (optionally preceded by whitespace) — list item
        text = text.replace(/^(\s*)-(?=\s+\S)/, '$1\u2014');

        // Case 2: hyphen after sentence punctuation (, . ! ? ; :) with optional surrounding spaces
        text = text.replace(/([,\.!?;:])\s*-(?=\s)/g, '$1\u2014');

        // Case 1: hyphen surrounded by spaces (word - word)
        text = text.replace(/(?<=\s)-(?=\s)/g, '\u2014');

        // Normalise spaces around em dash: exactly one regular space on each side.
        // Collapse multiple spaces, trim NBSP to regular space around dash.
        text = text.replace(/[\s\u00A0]*\u2014[\s\u00A0]*/g, ' \u2014 ');

        // But do not leave a leading space if dash is at the very start of the node.
        text = text.replace(/^ \u2014 /, '\u2014 ');

        return text;
    }

    /**
     * Walk every DOM text node inside `root` and apply typographic transforms:
     * 1. {@link _replaceDash} — hyphen → em dash where appropriate.
     * 2. {@link _nbspHanging} — non-breaking spaces after hanging prepositions.
     *
     * Elements are traversed recursively; other node types are skipped.
     *
     * @param {Element} root
     */
    function _walkForTypography(root) {
        for (const child of Array.from(root.childNodes)) {
            if (child.nodeType === 3) {
                let t = child.textContent;
                t = _replaceDash(t);
                t = _nbspHanging(t);
                child.textContent = t;
            } else if (child.nodeType === 1) {
                _walkForTypography(child);
            }
        }
    }

    /**
     * Replace straight double-quote characters (`"`) with Russian typographic
     * guillemets («»).  Operates directly on the HTML string, matching either a
     * complete HTML tag or a quote character in a single pass so that:
     *   - HTML attributes are never modified (the whole tag is consumed at once).
     *   - Opening/closing state is tracked globally across element boundaries,
     *     so `"<strong>text</strong>"` is correctly converted to «<strong>text</strong>».
     *
     * Odd (unpaired) quotes are handled gracefully: each `"` simply toggles state,
     * so the worst case is a mismatched guillemet rather than broken HTML.
     *
     * @param {string} html - simple HTML (p, br, strong, a …)
     * @returns {string}
     */
    function _replaceQuotes(html) {
        let open = false;
        return html.replace(/<[^>]*>|"/g, (match) => {
            if (match !== '"') return match;   // HTML tag — pass through unchanged
            open = !open;
            return open ? '\u00AB' : '\u00BB'; // « or »
        });
    }

    /**
     * Apply typographic transformations to an HTML fragment:
     * 1. Straight quotes `"` → guillemets «».
     * 2. Non-breaking spaces after hanging prepositions/conjunctions.
     *
     * Parses the fragment via DOMParser so HTML attributes are never touched.
     *
     * @param {string} html - simple HTML (p, br, strong, a …)
     * @returns {string}
     */
    function _applyTypography(html) {
        if (!html) return html;
        html = _replaceQuotes(html);
        const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
        const root = doc.body.firstElementChild;
        _walkForTypography(root);
        return root.innerHTML;
    }

    // -------------------------------------------------------
    // ПУБЛИЧНЫЙ API
    // -------------------------------------------------------

    /**
     * Главная функция.
     * @param {string} input — сырой текст или HTML
     * @param {boolean} isPlainText — true если input это plain text (из textarea)
     * @returns {string} — чистый simple HTML для хранения в s.content
     */
    function sanitize(input, isPlainText = false) {
        if (!input) return '';
        if (isPlainText) {
            return _plainTextToHTML(input);
        } else {
            return _cleanHTML(input);
        }
    }

    /**
     * Рендер для канваса, превью и письма.
     * Принимает simple HTML из s.content, добавляет стили ссылок.
     * @param {string} html — s.content
     * @param {string} linkColor — цвет ссылок (опционально)
     * @returns {string} — финальный HTML для вставки
     */
    function render(html, linkColor = '#7700ff') {
        if (!html) return '';

        // Convert markdown links [text](url) → <a href="url">text</a>
        // Handles legacy plain-text content stored without prior sanitize() call
        html = html.replace(
            /\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g,
            '<a href="$2">$1</a>'
        );

        // Добавляем margin параграфам (кроме последнего)
        const paras = html.split(/(?=<p>)/i);
        let result = paras.map((chunk, i) => {
            if (!chunk.startsWith('<p>') && !chunk.startsWith('<P>')) return chunk;
            const isLast = i === paras.length - 1;
            return chunk.replace(/^<p>/i, `<p style="margin:${isLast ? '0' : '0 0 0.6em 0'};">`);
        }).join('');

        // Добавляем стиль ссылкам
        result = result.replace(
            /<a\s+href="([^"]+)"([^>]*)>/gi,
            (match, href, rest) => {
                if (rest.includes('style=')) return match;
                return `<a href="${href}" style="color:${linkColor}; text-decoration:underline;"${rest}>`;
            }
        );

        return result;
    }

    /**
     * Конвертирует s.content в plain text для отображения в textarea (Админ).
     * simple HTML → plain text с \n
     */
    function toPlainText(html) {
        if (!html) return '';

        return html
            // <p>...</p> → текст + двойной перенос
            .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_, inner) => {
                return inner + '\n\n';
            })
            // <br> → одиночный перенос
            .replace(/<br\s*\/?>/gi, '\n')
            // <strong>текст</strong> → **текст**
            .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**')
            .replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, '**$1**')
            // <a href="url">текст</a> → [текст](url)
            .replace(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')
            // Убираем оставшиеся теги
            .replace(/<[^>]+>/g, '')
            // Убираем HTML entities
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            // Нормализуем пробелы
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    return { sanitize, render, toPlainText, applyTypography: _applyTypography };

})();
