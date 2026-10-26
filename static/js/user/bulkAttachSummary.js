// user/bulkAttachSummary.js — сводка по вложениям до отправки.
//
// Берёт ответ /api/bulk/preflight и превращает его в понятные строки: что найдено, чего
// не хватает, что случится с такими письмами и поместятся ли письма в лимит сервера.
// summarize() — чистая функция (проверяется тестами), render() рисует результат.

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.BulkAttachSummary = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {

    const MB = 1024 * 1024;
    const LIST_LIMIT = 10;   // сколько проблемных строк показывать сразу

    function formatSize(bytes) {
        if (bytes >= MB) return `${(bytes / MB).toFixed(1).replace('.', ',')} МБ`;
        return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
    }

    function plural(n, one, two, five) {
        const m100 = n % 100;
        const m10 = n % 10;
        if (m100 >= 11 && m100 <= 14) return five;
        if (m10 === 1) return one;
        if (m10 >= 2 && m10 <= 4) return two;
        return five;
    }

    const letters = n => `${n} ${plural(n, 'письмо', 'письма', 'писем')}`;

    function problemCount(entry) {
        return entry.missing + entry.ambiguous + entry.blocked + entry.other;
    }

    /** Что будет с письмами, у которых вложения не хватает, по правилу карточки. */
    function outcomeText(entry, count) {
        if (entry.policy === 'skip') return `${count} ${plural(count, 'получатель будет пропущен', 'получателя будут пропущены', 'получателей будут пропущены')}`;
        if (entry.policy === 'stop') return 'рассылка остановится на первой такой строке';
        return `${letters(count)} уйдут без этого вложения`;
    }

    function individualBlock(entry, rows) {
        const lines = [];
        const bad = problemCount(entry);
        lines.push({ tone: 'ok', text: `Найдено: ${entry.found} из ${rows}` });
        if (entry.missing) lines.push({ tone: 'warn', text: `Не найдено: ${entry.missing}` });
        if (entry.ambiguous) lines.push({ tone: 'warn', text: `Неоднозначно (несколько файлов с таким именем): ${entry.ambiguous}` });
        if (entry.blocked) lines.push({ tone: 'err', text: `Тип файла не пропускают почтовые серверы: ${entry.blocked}` });
        if (entry.other) lines.push({ tone: 'warn', text: `Имя файла не определено: ${entry.other}` });
        if (bad) lines.push({ tone: entry.policy === 'stop' ? 'err' : 'warn', text: `Итог: ${outcomeText(entry, bad)}` });
        const tone = !bad ? 'ok' : (entry.policy === 'stop' || entry.blocked ? 'err' : 'warn');
        return { label: entry.label, tone, lines, problems: entry.problems, hidden: Math.max(0, bad - entry.problems.length) };
    }

    function commonBlock(entry, rows, commonBytes) {
        const files = `${entry.files} ${plural(entry.files, 'файл', 'файла', 'файлов')}`;
        return {
            label: entry.label, tone: 'ok', problems: [], hidden: 0,
            lines: [{ tone: 'ok', text: `${files}, ${formatSize(commonBytes)} — получат все (${rows})` }],
        };
    }

    /**
     * @param {object} report  ответ /api/bulk/preflight
     * @returns {{tone:string, blocks:Array, size:{tone:string,text:string}|null, rows:number}}
     */
    function summarize(report) {
        const rows = report.rows_checked;
        const blocks = report.attachments.map(entry => (
            entry.kind === 'common' ? commonBlock(entry, rows, report.common_bytes) : individualBlock(entry, rows)
        ));

        let size = null;
        if (report.attachments.length) {
            const biggest = report.oversize.max_bytes;
            if (report.oversize.count) {
                size = { tone: 'err', text: `${letters(report.oversize.count)} не уйдут: больше лимита ${formatSize(report.limit_bytes)} (самое большое ≈ ${formatSize(biggest)})` };
            } else {
                size = { tone: 'ok', text: `Самое большое письмо ≈ ${formatSize(biggest)} из ${formatSize(report.limit_bytes)}` };
            }
        }

        const order = { ok: 0, warn: 1, err: 2 };
        const worst = [...blocks.map(b => b.tone), size ? size.tone : 'ok']
            .reduce((a, b) => (order[b] > order[a] ? b : a), 'ok');
        return { tone: worst, blocks, size, rows };
    }

    /** Проблемы вложений одной строки таблицы (для подсказки при просмотре письма). */
    function rowProblems(report, rowNumber) {
        if (!report) return [];
        const result = [];
        report.attachments.forEach(entry => {
            entry.problems.filter(p => p.row === rowNumber).forEach(p => {
                result.push(`${entry.label.split(':')[0]}: ${p.expected ? `«${p.expected}» — ` : ''}${p.text}`);
            });
        });
        if (report.oversize.rows.some(r => r.row === rowNumber)) {
            result.push(`Письмо больше лимита ${formatSize(report.limit_bytes)}`);
        }
        return result;
    }

    /** Номера строк с проблемами вложений, по возрастанию (для «к следующей проблеме»). */
    function problemRows(report) {
        if (!report) return [];
        const rows = new Set();
        report.attachments.forEach(e => e.problems.forEach(p => rows.add(p.row)));
        report.oversize.rows.forEach(r => rows.add(r.row));
        return [...rows].sort((a, b) => a - b);
    }

    function node(tag, className, text) {
        const el = document.createElement(tag);
        if (className) el.className = className;
        if (text !== undefined) el.textContent = text;
        return el;
    }

    const ICONS = { ok: '✓', warn: '!', err: '✕' };

    function line(tone, text) {
        const row = node('div', `bm-asum-line bm-asum-line--${tone}`);
        row.appendChild(node('span', 'bm-asum-icon', ICONS[tone]));
        row.appendChild(node('span', 'bm-asum-text', text));
        return row;
    }

    /**
     * Рисует сводку в контейнер.
     * @param {HTMLElement} container
     * @param {object|null} report
     * @param {{onGoToRow:(row:number)=>void, state?:'loading'|'error', message?:string}} opts
     */
    function render(container, report, opts = {}) {
        container.textContent = '';
        if (opts.state === 'loading') { container.appendChild(node('div', 'bm-asum-muted', 'Проверяю вложения…')); return; }
        if (opts.state === 'error') { container.appendChild(line('err', opts.message || 'Не удалось проверить вложения')); return; }
        if (!report || !report.attachments.length) return;

        const model = summarize(report);
        container.appendChild(node('div', 'bm-asum-title', 'Вложения'));
        model.blocks.forEach(block => {
            const box = node('div', `bm-asum-block bm-asum-block--${block.tone}`);
            box.appendChild(node('div', 'bm-asum-label', block.label));
            block.lines.forEach(l => box.appendChild(line(l.tone, l.text)));
            if (block.problems.length) box.appendChild(problemList(block, opts.onGoToRow));
            container.appendChild(box);
        });
        if (model.size) container.appendChild(line(model.size.tone, model.size.text));
    }

    function problemList(block, onGoToRow) {
        const details = node('details', 'bm-asum-details');
        details.appendChild(node('summary', '', 'Показать, у кого нет вложения'));
        block.problems.slice(0, LIST_LIMIT).forEach(p => {
            const item = node('button', 'bm-asum-problem');
            item.type = 'button';
            item.textContent = `Строка ${p.row} · ${p.email} → ${p.expected || 'имя не определено'} — ${p.text}`;
            item.addEventListener('click', () => onGoToRow && onGoToRow(p.row));
            details.appendChild(item);
        });
        const more = block.hidden + Math.max(0, block.problems.length - LIST_LIMIT);
        if (more > 0) details.appendChild(node('div', 'bm-asum-muted', `и ещё ${more}`));
        return details;
    }

    return { summarize, rowProblems, problemRows, render, formatSize };
}));
