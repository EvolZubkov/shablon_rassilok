// textSanitizer.js — единый модуль обработки текста
// Подключать ПЕРВЫМ среди JS файлов

const TextSanitizer = (() => {

    // Разрешённые теги и их атрибуты
    const ALLOWED_TAGS = {
        'p':      ['data-bullet'],
        'br':     [],
        'strong': [],
        'b':      [],
        'em':     [],
        'i':      [],
        'u':      [],
        'a':      ['href'],
    };

    // -------------------------------------------------------
    // Списки в блоке "Текст" — стандартные маркеры Word (символ → HTML-код)
    // и форматы нумерации. Значение data-bullet для символьного маркера —
    // сам HTML-код (надёжнее сырого Unicode-символа в письме, не зависит
    // от кодировки транспорта); для нумерованного — "num:<style>".
    // -------------------------------------------------------
    const LIST_BULLET_MAP = [
        { glyph: '•', code: '&#8226;',  title: 'Обычная точка' },
        { glyph: '◦', code: '&#9702;',  title: 'Полая точка' },
        { glyph: '■', code: '&#9632;',  title: 'Черный квадрат' },
        { glyph: '♦', code: '&#9830;',  title: 'Ромб' },
        { glyph: '➔', code: '&#10132;', title: 'Стрелка вправо' },
        { glyph: '➢', code: '&#10146;', title: 'Объёмная стрелка' },
        { glyph: '✓', code: '&#10003;', title: 'Галочка' },
    ];

    const LIST_NUMBER_STYLES = ['1.', '1)', 'a.', 'a)', 'I.'];

    // 1→a, 2→b, …, 26→z, 27→aa, 28→ab, … (как буквенная нумерация Word)
    function _toLetterSeq(n) {
        let s = '';
        while (n > 0) {
            n--;
            s = String.fromCharCode(97 + (n % 26)) + s;
            n = Math.floor(n / 26);
        }
        return s;
    }

    function _toRoman(n) {
        const table = [
            [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
            [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
            [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
        ];
        let s = '';
        for (const [val, sym] of table) {
            while (n >= val) { s += sym; n -= val; }
        }
        return s;
    }

    function _formatListNumber(n, style) {
        switch (style) {
            case '1.': return `${n}.`;
            case '1)': return `${n})`;
            case 'a.': return `${_toLetterSeq(n)}.`;
            case 'a)': return `${_toLetterSeq(n)})`;
            case 'I.': return `${_toRoman(n)}.`;
            default:   return `${n}.`;
        }
    }

    // Распознаёт в начале plain-text строки один из маркеров: символьный
    // глиф из LIST_BULLET_MAP, "1." / "1)", "a." / "a)" (1-2 буквы), или
    // римскую цифру "I." (до 4 символов) — плюс пробел и остаток строки.
    const _GLYPH_ALT = LIST_BULLET_MAP
        .map(b => b.glyph.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('|');
    const _BULLET_LINE_RE = new RegExp(
        `^(${_GLYPH_ALT}|\\d+[.)]|[a-zA-Z]{1,2}[.)]|[IVXLCDM]{1,4}\\.)\\s+(.*)$`
    );

    // Классифицирует распознанный токен маркера (см. _BULLET_LINE_RE) в
    // итоговое значение data-bullet. Римские цифры проверяются ДО общей
    // буквенной проверки — "I."/"V." матчатся обоими паттернами.
    function _classifyMarker(token) {
        const glyphEntry = LIST_BULLET_MAP.find(b => b.glyph === token);
        if (glyphEntry) return glyphEntry.code;
        if (/^\d+\.$/.test(token)) return 'num:1.';
        if (/^\d+\)$/.test(token)) return 'num:1)';
        if (/^[IVXLCDM]{1,4}\.$/.test(token)) return 'num:I.';
        if (/^[a-zA-Z]{1,2}\.$/.test(token)) return 'num:a.';
        if (/^[a-zA-Z]{1,2}\)$/.test(token)) return 'num:a)';
        return null;
    }

    // Значение data-bullet может дойти сюда либо как HTML-код (только что
    // подставлен панелью), либо как уже РАСКОДИРОВАННЫЙ сырой символ —
    // DOMParser (см. _applyTypography/_cleanHTML) декодирует entity в
    // атрибутах при парсинге, и при последующей сериализации innerHTML
    // отдаёт исходный Unicode-символ, а не "&#8226;". Нормализуем к
    // канонической HTML-код-форме независимо от того, в каком виде
    // атрибут пришёл — важно для гарантии "именно html-код" в письме.
    function _normalizeBulletAttr(bulletAttr) {
        if (!bulletAttr || bulletAttr.startsWith('num:')) return bulletAttr;
        const entry = LIST_BULLET_MAP.find(b => b.code === bulletAttr || b.glyph === bulletAttr);
        return entry ? entry.code : bulletAttr;
    }

    /**
     * Общий 2D-контекст canvas для измерения РЕАЛЬНОЙ ширины конкретного
     * маркера списка — разные глифы (точка, стрелка ➔, квадрат ■, номер
     * "12.") заметно отличаются по ширине, поэтому фиксированная формула
     * "число символов × N" не может подстроиться под каждый из них
     * одинаково точно. Недоступно вне браузера (Node/Vitest) — тогда
     * вызывающий код падает на приблизительную формулу как раньше.
     * @type {CanvasRenderingContext2D|null}
     */
    let _bulletMeasureCtx = null;
    function _getBulletMeasureCtx() {
        if (typeof document === 'undefined') return null;
        if (!_bulletMeasureCtx) {
            _bulletMeasureCtx = document.createElement('canvas').getContext('2d');
        }
        return _bulletMeasureCtx;
    }

    /**
     * Измеряет реальную ширину текста маркера (в пикселях) при заданном
     * размере и семействе шрифта.
     *
     * fontFamily по умолчанию — Arial: именно на неё Outlook реально
     * подставляет любой кастомный шрифт (см. resolveTextFontFamily в
     * emailGenerator.js — Arial всегда указан фолбэком), так что для
     * ПИСЬМА это самая точная оценка. Для КАНВАСА/превью в приложении
     * (реальный браузер, кастомный шрифт физически загружен и
     * применяется) вызывающий код передаёт настоящий fontFamily блока —
     * иначе ширина мерилась бы в Arial, а показывалась бы в другом
     * шрифте, и появлялся бы перекос именно там (не в письме).
     * @returns {number|null} ширина в px, либо null вне браузера
     */
    function _measureMarkerWidth(text, fontSizePx, fontFamily = 'Arial') {
        const ctx = _getBulletMeasureCtx();
        if (!ctx) return null;
        ctx.font = `${fontSizePx}px ${fontFamily}`;
        return ctx.measureText(text).width;
    }

    /**
     * Shared DOMParser instance. DOMParser is stateless — each parseFromString
     * call returns an independent document — so a single instance is safe to
     * reuse across all calls, avoiding repeated object allocation.
     * Falls back to null when running outside a browser (e.g. Node/Vitest).
     * @type {DOMParser|null}
     */
    const _parser = typeof DOMParser !== 'undefined' ? new DOMParser() : null;

    /**
     * Email address pattern with surrounding-context guards for use in
     * string-level `.replace()` calls (plain text → HTML and render pipeline).
     * Distinct from {@link _EMAIL_RE} which is used for DOM-node walking.
     * The `g` flag is safe to share: `.replace()` always resets lastIndex.
     */
    const _EMAIL_STR_RE = /(^|[\s>])([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})(?=[<\s,;]|$)/g;

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

        // Preserve inline placeholder spans inserted by bulk-mail panel
        if (tag === 'span' && node.classList.contains('bm-inline-ph')) {
            const clean = doc.createElement('span');
            clean.className = 'bm-inline-ph';
            clean.setAttribute('contenteditable', 'false');
            if (node.hasAttribute('data-field')) clean.setAttribute('data-field', node.getAttribute('data-field'));
            if (node.hasAttribute('data-placeholder')) clean.setAttribute('data-placeholder', node.getAttribute('data-placeholder'));
            clean.textContent = node.textContent;
            return clean;
        }

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

        // ВАЖНО: авто-ссылки (URL и email) должны отработать ДО конвертации
        // markdown-ссылок [текст](url) в <a>. Их контекстные guard'ы
        // (предыдущий символ — начало строки/пробел/">") рассчитаны на то,
        // что ссылок в виде <a href="...">текст</a> в тексте ещё нет —
        // иначе символ ">" сразу после открывающего <a ...> и "<" перед
        // </a> сами удовлетворяют guard'у, и уже готовая ссылка оборачивается
        // ещё одной <a> — при повторных проходах (toPlainText ⇄ sanitize при
        // каждом редактировании) это давало вложенные/множащиеся ссылки.
        // Внутри "[текст](url)" эти guard'ы не срабатывают (перед текстом —
        // "[", перед url — "("), так что порядок ниже безопасен.

        // Авто-ссылки http(s)://...
        text = text.replace(
            /(^|[\s>])((https?:\/\/)[^\s<]+)/g,
            '$1<a href="$2">$2</a>'
        );

        // Авто-ссылки email-адресов (не внутри уже существующего тега <a>)
        _EMAIL_STR_RE.lastIndex = 0;
        text = text.replace(_EMAIL_STR_RE, '$1<a href="mailto:$2">$2</a>');

        // Markdown ссылки [текст](url) — поддерживает голые URL без протокола
        text = text.replace(
            /\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+|[a-zA-Z0-9][^\s)]*\.[a-zA-Z]{2,}[^\s)]*)\)/g,
            (_, linkText, url) => {
                const href = /^(https?:\/\/|mailto:)/i.test(url) ? url : `https://${url}`;
                return `<a href="${href}">${linkText}</a>`;
            }
        );

        // Построчно выделяем пункты списка (см. _BULLET_LINE_RE выше) —
        // каждый становится своим <p data-bullet="X">, БЕЗ требования
        // пустой строки между соседними пунктами (в отличие от обычных
        // абзацев). Всё, что не распознано как строка-маркер, копится в
        // буфер и прогоняется через прежнюю логику (двойной \n → новый
        // <p>, одиночный \n → <br>) без изменений.
        const htmlParts = [];
        let buffer = [];

        const flushBuffer = () => {
            if (buffer.length === 0) return;
            const chunkText = buffer.join('\n');
            buffer = [];
            chunkText.split(/\n{2,}/).forEach(p => {
                p = p.trim();
                if (!p) return;
                p = p.replace(/\n/g, '<br>');
                htmlParts.push(`<p>${p}</p>`);
            });
        };

        for (const line of text.split('\n')) {
            const m = line.match(_BULLET_LINE_RE);
            const marker = m ? _classifyMarker(m[1]) : null;
            if (marker) {
                flushBuffer();
                htmlParts.push(`<p data-bullet="${marker}">${m[2]}</p>`);
            } else {
                buffer.push(line);
            }
        }
        flushBuffer();

        return htmlParts.join('');
    }

    // -------------------------------------------------------
    // Очистка HTML из contenteditable / буфера обмена
    // -------------------------------------------------------
    function _cleanHTML(dirtyHTML) {
        if (!dirtyHTML) return '';

        const doc = _parser.parseFromString(dirtyHTML, 'text/html');

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

    // Russian prepositions, conjunctions and particles that must not be left
    // hanging at the end of a line (followed by a line break before the next word).
    // Populated synchronously in Node (tests) and asynchronously in the browser.
    let HANGING_WORDS = new Set();

    (function _initHangingWords() {
        const browserPath = '/data/textSanitizer.hangingWords.json';

        // Node/Vitest path: load synchronously so unit tests remain blocking.
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
                    HANGING_WORDS = new Set(JSON.parse(fs.readFileSync(fullPath, 'utf-8')));
                    return;
                }
            }
        } catch (_) {}

        // Browser path: async fetch — no synchronous XHR on the main thread.
        if (typeof fetch !== 'undefined') {
            fetch(browserPath)
                .then(r => r.ok ? r.json() : [])
                .then(words => { HANGING_WORDS = new Set(words); })
                .catch(() => {});
        }
    }());

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
                // Don't touch placeholder spans — typography must not alter {{ColName}} text
                if (child.classList && child.classList.contains('bm-inline-ph')) continue;
                _walkForTypography(child);
            }
        }
    }

    /** Email address pattern used by the DOM linker. */
    const _EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

    /**
     * Walk every DOM text node inside `root` and wrap bare email addresses in
     * `<a href="mailto:…">` elements.
     *
     * Skips text already inside an `<a>` element so existing links are never
     * double-wrapped.  All text nodes are collected before the DOM is modified
     * to avoid live-NodeList mutation issues.
     *
     * @param {Element} root
     * @param {Document} doc - owner document used to create new elements
     */
    function _linkEmailsInDOM(root, doc) {
        const textNodes = [];
        (function collect(node) {
            for (const child of Array.from(node.childNodes)) {
                if (child.nodeType === 3) textNodes.push(child);
                else if (child.nodeType === 1) collect(child);
            }
        }(root));

        for (const textNode of textNodes) {
            // Skip text that is already inside an <a> element.
            let el = textNode.parentElement;
            let insideAnchor = false;
            while (el) {
                if (el.tagName === 'A') { insideAnchor = true; break; }
                el = el.parentElement;
            }
            if (insideAnchor) continue;

            const text = textNode.textContent;
            _EMAIL_RE.lastIndex = 0;
            if (!_EMAIL_RE.test(text)) continue;

            _EMAIL_RE.lastIndex = 0;
            const frag = doc.createDocumentFragment();
            let last = 0;
            let m;
            while ((m = _EMAIL_RE.exec(text)) !== null) {
                if (m.index > last) {
                    frag.appendChild(doc.createTextNode(text.slice(last, m.index)));
                }
                const a = doc.createElement('a');
                a.href = `mailto:${m[0]}`;
                a.textContent = m[0];
                frag.appendChild(a);
                last = _EMAIL_RE.lastIndex;
            }
            if (last < text.length) {
                frag.appendChild(doc.createTextNode(text.slice(last)));
            }
            textNode.parentNode.replaceChild(frag, textNode);
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
        const doc = _parser.parseFromString(`<div>${html}</div>`, 'text/html');
        const root = doc.body.firstElementChild;
        _walkForTypography(root);
        _linkEmailsInDOM(root, doc);
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
     * @param {{bulletSize?: number, bulletColor?: string, itemSpacing?: number, fontSize?: number}} listOptions —
     *   опциональная стилизация маркеров списка (используется только блоком
     *   "Текст" — см. blockPreview.js/emailGenerator.js; остальные вызовы
     *   render() его не передают, поведение для них не меняется). fontSize —
     *   размер шрифта блока (маркер рендерится этим размером, если не
     *   задан отдельный bulletSize) — нужен, чтобы измерить реальную
     *   ширину конкретного маркера для hanging-indent (см. ниже).
     * @returns {string} — финальный HTML для вставки
     */
    function render(html, linkColor = '#7700ff', listOptions = {}) {
        if (!html) return '';
        const { bulletSize, bulletColor, itemSpacing = 4, fontSize = 14, measureFontFamily = 'Arial' } = listOptions;
        const markerStyle = (bulletSize ? `font-size:${bulletSize}px;` : '') + (bulletColor ? `color:${bulletColor};` : '');
        const markerFontSize = bulletSize || fontSize;

        // Convert markdown links [text](url) → <a href="url">text</a>
        // Handles legacy plain-text content stored without prior sanitize() call
        // Supports bare URLs without protocol (auto-prepends https://)
        html = html.replace(
            /\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+|[a-zA-Z0-9][^\s)]*\.[a-zA-Z]{2,}[^\s)]*)\)/g,
            (_, linkText, url) => {
                const href = /^(https?:\/\/|mailto:)/i.test(url) ? url : `https://${url}`;
                return `<a href="${href}">${linkText}</a>`;
            }
        );

        // Auto-link bare email addresses not already inside an <a> tag
        _EMAIL_STR_RE.lastIndex = 0;
        html = html.replace(_EMAIL_STR_RE, '$1<a href="mailto:$2">$2</a>');

        // Добавляем margin параграфам (кроме последнего). <p data-bullet="X">
        // — пункт списка: hanging-indent (padding-left + отрицательный
        // text-indent — тот же приём, которым сам Word рендерит списки в
        // HTML), маркер выводится как обычный текст перед содержимым.
        // Нумерованные пункты (data-bullet="num:<style>") считаются
        // локальным счётчиком, который продолжается только при
        // непрерывном забеге пунктов ИМЕННО этого формата — сбрасывается
        // на абзаце без data-bullet или при смене формата (как <ol>).
        let listCounter = 0;
        let prevStyle = null;
        const paras = html.split(/(?=<p[ >])/i);
        let result = paras.map((chunk, i) => {
            const m = chunk.match(/^<p(?:\s+data-bullet="([^"]*)")?\s*>/i);
            if (!m) return chunk;
            const bulletAttr = _normalizeBulletAttr(m[1]);
            const isLast = i === paras.length - 1;
            const inner = chunk.slice(m[0].length);
            if (bulletAttr) {
                let marker;
                let glyphForMeasure;
                if (bulletAttr.startsWith('num:')) {
                    const numStyle = bulletAttr.slice(4);
                    listCounter = (prevStyle === numStyle) ? listCounter + 1 : 1;
                    prevStyle = numStyle;
                    marker = _formatListNumber(listCounter, numStyle);
                    glyphForMeasure = marker; // цифры/буквы — уже видимый текст как есть
                } else {
                    prevStyle = null;
                    marker = bulletAttr; // HTML-код (напр. "&#8226;") — идёт в вывод как есть
                    // Для измерения ширины нужен ВИДИМЫЙ глиф, а не строка
                    // HTML-кода (canvas.measureText("&#8226;") посчитал бы
                    // ширину семи символов текста, а не одной точки).
                    const entry = LIST_BULLET_MAP.find(b => b.code === marker);
                    glyphForMeasure = entry ? entry.glyph : marker;
                }
                // margin-left сдвигает ВЕСЬ пункт (включая сам маркер) от
                // левого края блока — без него маркер стоял вровень с
                // обычным текстом. padding-left/text-indent — отдельный
                // "внутренний" hanging-indent для строк 2+ (см. выше), и
                // ОБЯЗАН совпадать с реальной шириной "маркер + отступ до
                // текста" на первой строке — иначе перенос окажется левее
                // или правее начала текста первой строки. Меряем РЕАЛЬНУЮ
                // ширину конкретного маркера (вместе с двумя &nbsp; —
                // именно то, что физически стоит перед текстом на первой
                // строке) через canvas — разные глифы (точка/стрелка/
                // квадрат/номер) слишком по-разному широкие для одной
                // формулы "число символов × N". Вне браузера (Node/тесты)
                // canvas недоступен — используем прежнюю приблизительную
                // формулу как страховку.
                const measuredWidth = _measureMarkerWidth(`${glyphForMeasure}  `, markerFontSize, measureFontFamily);
                const hangIndent = measuredWidth != null
                    ? Math.floor(measuredWidth) - 2
                    : glyphForMeasure.length * 5 + 7;
                const style = `margin:0 0 ${isLast ? '0' : `${itemSpacing}px`} 22px; padding-left:${hangIndent}px; text-indent:-${hangIndent}px;`;
                const markerHTML = markerStyle ? `<span style="${markerStyle}">${marker}</span>` : marker;
                return `<p style="${style}">${markerHTML}&nbsp;&nbsp;${inner}`;
            }
            prevStyle = null;
            return `<p style="margin:${isLast ? '0' : '0 0 0.6em 0'};">${inner}`;
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

        // Счётчик нумерованных пунктов — один проход по всем <p> в порядке
        // документа (см. комментарий у regexp ниже); продолжается только
        // при непрерывном забеге пунктов ИМЕННО этого формата, как в
        // render(). prevWasBullet — вставляет пустую строку при ВЫХОДЕ из
        // списка обратно в обычный текст (иначе последний пункт списка и
        // следующий абзац слипаются в одну строку).
        let listCounter = 0;
        let prevStyle = null;
        let prevWasBullet = false;

        return html
            // <p data-bullet="X">текст</p> → "маркер текст\n" (код →
            // читаемый глиф из LIST_BULLET_MAP для textarea, num:style →
            // вычисленный номер), одна строка на пункт БЕЗ пустой строки
            // между соседними пунктами. Обычный <p> — как раньше.
            .replace(/<p(?:\s+data-bullet="([^"]*)")?[^>]*>([\s\S]*?)<\/p>/gi, (_, bulletAttrRaw, inner) => {
                const bulletAttr = _normalizeBulletAttr(bulletAttrRaw);
                if (bulletAttr) {
                    let marker;
                    if (bulletAttr.startsWith('num:')) {
                        const numStyle = bulletAttr.slice(4);
                        listCounter = (prevStyle === numStyle) ? listCounter + 1 : 1;
                        prevStyle = numStyle;
                        marker = _formatListNumber(listCounter, numStyle);
                    } else {
                        prevStyle = null;
                        const entry = LIST_BULLET_MAP.find(b => b.code === bulletAttr);
                        marker = entry ? entry.glyph : bulletAttr;
                    }
                    prevWasBullet = true;
                    return `${marker} ${inner}\n`;
                }
                prevStyle = null;
                const exitListGap = prevWasBullet ? '\n' : '';
                prevWasBullet = false;
                return exitListGap + inner + '\n\n';
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

    /**
     * Escape HTML special characters so a plain-text value can be safely
     * interpolated into an HTML template literal or injected via innerHTML.
     *
     * Covers the five characters that allow HTML/attribute injection:
     * {@code &}, {@code <}, {@code >}, {@code "}, {@code '}.
     *
     * Use this whenever a dynamic value (template name, filename, CSV field,
     * server message, etc.) is placed inside a template literal that is then
     * assigned to {@code innerHTML}.
     *
     * @param {*} value - Value to escape; null/undefined become empty string.
     * @returns {string} HTML-safe string.
     */
    function escapeHTML(value) {
        if (value == null) return '';
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    /**
     * Убирает существующий маркер-префикс списка (символьный или
     * нумерованный, см. LIST_BULLET_MAP/LIST_NUMBER_STYLES) с начала
     * одной plain-text строки, если он там есть. Используется панелью
     * списков (settings/textSettings.js) перед подстановкой нового
     * маркера — чтобы повторный клик по другому маркеру заменял старый,
     * а не дописывал его вторым префиксом.
     * @param {string} line
     * @returns {string} строка без маркера-префикса (или как есть, если его не было)
     */
    function stripListMarkerLine(line) {
        const m = line.match(_BULLET_LINE_RE);
        return m ? m[2] : line;
    }

    return {
        sanitize, render, toPlainText, applyTypography: _applyTypography, escapeHTML,
        stripListMarkerLine, LIST_BULLET_MAP, LIST_NUMBER_STYLES, formatListNumber: _formatListNumber,
    };

})();
