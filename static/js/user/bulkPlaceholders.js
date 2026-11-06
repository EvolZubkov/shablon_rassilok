// user/bulkPlaceholders.js — чистая логика плейсхолдеров рассылки (без DOM).
//
// Подключается в браузере как window.BulkPlaceholders и в тестах как CommonJS-модуль.
// Плейсхолдер — это {{Имя}}; одно и то же имя может встретиться в теле письма, теме и
// шаблоне имени файла, в том числе с другим регистром ({{ФИО}} и {{фио}}). Для
// пользователя это одно поле: сопоставляется один раз и действует везде.

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.BulkPlaceholders = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {

    const PLACEHOLDER_RE = /\{\{([^{}]+)\}\}/g;

    /** Ключ сравнения: без учёта регистра, ё/е и лишних пробелов (как на сервере). */
    function normKey(name) {
        return String(name == null ? '' : name)
            .normalize('NFC')
            .toLowerCase()
            .replace(/ё/g, 'е')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /** Все {{…}} из текста, как они написаны, без повторов, в порядке появления. */
    function findPlaceholders(text) {
        const seen = new Set();
        const found = [];
        for (const match of String(text || '').matchAll(PLACEHOLDER_RE)) {
            if (!seen.has(match[0])) {
                seen.add(match[0]);
                found.push(match[0]);
            }
        }
        return found;
    }

    function nameOf(placeholder) {
        return placeholder.slice(2, -2);
    }

    /**
     * Сколько раз каждый плейсхолдер встречается в теле, теме и имени файла.
     * @param {{body?:string, subject?:string, file?:string}} sources
     * @returns {Object<string,{body:number,subject:number,file:number}>}
     */
    function countUsage(sources) {
        const usage = {};
        ['body', 'subject', 'file'].forEach(place => {
            for (const match of String(sources[place] || '').matchAll(PLACEHOLDER_RE)) {
                const entry = usage[match[0]] || (usage[match[0]] = { body: 0, subject: 0, file: 0 });
                entry[place] += 1;
            }
        });
        return usage;
    }

    /** Группы плейсхолдеров с одним ключом: [{key, label, variants:[…]}]. */
    function groupByKey(placeholders) {
        const groups = new Map();
        placeholders.forEach(ph => {
            const key = normKey(nameOf(ph));
            if (!groups.has(key)) groups.set(key, { key, label: ph, variants: [] });
            groups.get(key).variants.push(ph);
        });
        return [...groups.values()];
    }

    /** Колонка с тем же ключом, что и имя плейсхолдера (точное совпадение — в приоритете). */
    function findColumn(headers, name) {
        if (headers.includes(name)) return name;
        const key = normKey(name);
        return headers.find(h => normKey(h) === key) || null;
    }

    /**
     * Сопоставление плейсхолдеров с колонками после любого изменения текста или файла.
     * Выбор пользователя, в том числе «не задано», не сбрасывается, пока колонка есть
     * в файле; автоподбор по имени — только для плейсхолдеров, которых раньше не было.
     * Варианты одного ключа ({{ФИО}}, {{фио}}) всегда получают одну колонку.
     *
     * @param {string[]} found        плейсхолдеры, найденные сейчас
     * @param {string[]} previous     плейсхолдеры прошлого прохода
     * @param {Object}   prevMapping  прошлое сопоставление {ph: колонка}
     * @param {string[]} headers      колонки файла
     * @returns {Object} новое сопоставление (только сопоставленные)
     */
    function resolveMapping(found, previous, prevMapping, headers) {
        const mapping = {};
        const byKey = new Map();   // ключ -> колонка или null (явно «не задано»)

        found.forEach(ph => {
            const key = normKey(nameOf(ph));
            if (byKey.has(key)) return;
            const known = previous.filter(p => normKey(nameOf(p)) === key);
            if (known.length) {
                // Колонка могла лишь поменять регистр или ё/е в новом файле — это та же колонка.
                const chosen = known
                    .map(p => (prevMapping[p] ? findColumn(headers, prevMapping[p]) : null))
                    .find(Boolean);
                byKey.set(key, chosen || null);
            } else {
                byKey.set(key, findColumn(headers, nameOf(ph)));
            }
        });

        found.forEach(ph => {
            const column = byKey.get(normKey(nameOf(ph)));
            if (column) mapping[ph] = column;
        });
        return mapping;
    }

    /** Чем новый файл отличается от прежнего по колонкам. */
    function diffHeaders(oldHeaders, newHeaders) {
        const oldKeys = new Set(oldHeaders.map(normKey));
        const newKeys = new Set(newHeaders.map(normKey));
        return {
            added: newHeaders.filter(h => !oldKeys.has(normKey(h))),
            removed: oldHeaders.filter(h => !newKeys.has(normKey(h)))
        };
    }

    /** Подпись «где используется»: «тело ×2 · тема · файл». */
    function usageLabel(entry) {
        if (!entry) return '';
        const parts = [];
        if (entry.body) parts.push(entry.body > 1 ? `тело ×${entry.body}` : 'тело');
        if (entry.subject) parts.push(entry.subject > 1 ? `тема ×${entry.subject}` : 'тема');
        if (entry.file) parts.push(entry.file > 1 ? `файл ×${entry.file}` : 'файл');
        return parts.join(' · ');
    }

    /** Сложить использование вариантов одной группы. */
    function groupUsage(group, usage) {
        const total = { body: 0, subject: 0, file: 0 };
        group.variants.forEach(ph => {
            const entry = usage[ph];
            if (!entry) return;
            total.body += entry.body;
            total.subject += entry.subject;
            total.file += entry.file;
        });
        return total;
    }

    return {
        normKey,
        findPlaceholders,
        countUsage,
        groupByKey,
        findColumn,
        resolveMapping,
        diffHeaders,
        usageLabel,
        groupUsage
    };
}));
