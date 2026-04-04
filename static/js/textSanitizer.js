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

    function _cleanHTML(dirtyHTML) {
        if (!dirtyHTML) return '';

        const parser = new DOMParser();
        const doc = parser.parseFromString(dirtyHTML, 'text/html');

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

        // Используем doc из парсера — тот же контекст
        const result = doc.createElement('div');
        for (const child of doc.body.childNodes) {
            const clean = _cleanNode(child, doc);
            if (clean) result.appendChild(clean);
        }

        let cleaned = _normalizeParagraphs(result.innerHTML);
        cleaned = cleaned.replace(/<\/p><p>/gi, '</p><p>');
        return cleaned;
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
            '[style*="mso-"]',
        ];
        removeSelectors.forEach(sel => {
            try {
                doc.querySelectorAll(sel).forEach(el => el.remove());
            } catch(e) {}
        });

        // Чистим body
        const result = document.createElement('div');
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

    return { sanitize, render, toPlainText };

})();