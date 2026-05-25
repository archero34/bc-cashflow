#!/usr/bin/env node
/**
 * Build a single self-contained HTML object inventory from docs/sdf-inventory.md.
 *
 * Mirrors tools/build-user-guide.js (same BCCF design system tokens, cover + TOC +
 * footer layout) but without screenshot inlining. Adds fenced-code-block support
 * for the relationship diagram and zebra-stripe styling for the long field tables.
 *
 * Output: docs/sdf-inventory.html
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const INVENTORY_MD = path.join(ROOT, 'docs/sdf-inventory.md');
const OUT_HTML = path.join(ROOT, 'docs/sdf-inventory.html');

// ----------------------------- Markdown -> HTML -----------------------------

function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function slugify(text) {
    return text
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');
}

function renderInline(text) {
    const codeStash = [];
    text = text.replace(/`([^`]+)`/g, (_, code) => {
        codeStash.push(code);
        return `\x00CODE${codeStash.length - 1}\x00`;
    });

    text = escapeHtml(text);

    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
        return `<a href="${href}">${label}</a>`;
    });

    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');

    text = text.replace(/\x00CODE(\d+)\x00/g, (_, i) => {
        return `<code>${escapeHtml(codeStash[Number(i)])}</code>`;
    });

    return text;
}

function renderTable(rows) {
    if (rows.length < 2) return '';
    const header = rows[0].split('|').slice(1, -1).map((s) => s.trim());
    const body = rows.slice(2).map((r) => r.split('|').slice(1, -1).map((s) => s.trim()));
    let html = '<table class="bccf-data-table">\n<thead><tr>';
    for (const h of header) html += `<th>${renderInline(h)}</th>`;
    html += '</tr></thead>\n<tbody>\n';
    for (const row of body) {
        html += '<tr>';
        for (const cell of row) html += `<td>${renderInline(cell)}</td>`;
        html += '</tr>\n';
    }
    html += '</tbody></table>';
    return html;
}

function markdownToHtml(md) {
    const lines = md.split('\n');
    const out = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];

        if (!line.trim()) {
            i++;
            continue;
        }

        // Fenced code block: ```...```
        if (/^```/.test(line)) {
            i++;
            const buf = [];
            while (i < lines.length && !/^```/.test(lines[i])) {
                buf.push(lines[i]);
                i++;
            }
            i++;
            out.push(`<pre class="bccf-codeblock"><code>${escapeHtml(buf.join('\n'))}</code></pre>`);
            continue;
        }

        if (/^---+\s*$/.test(line)) {
            out.push('<hr>');
            i++;
            continue;
        }

        let m;
        if ((m = line.match(/^(#{1,6})\s+(.*)$/))) {
            const level = m[1].length;
            const text = m[2].trim();
            const inner = renderInline(text);
            const plain = text.replace(/[*`]/g, '').replace(/\[(.+?)\]\(.+?\)/g, '$1');
            const id = slugify(plain);
            out.push(`<h${level} id="${id}">${inner}</h${level}>`);
            i++;
            continue;
        }

        if (line.startsWith('>')) {
            const buf = [];
            while (i < lines.length && lines[i].startsWith('>')) {
                buf.push(lines[i].replace(/^>\s?/, ''));
                i++;
            }
            out.push(`<blockquote><p>${renderInline(buf.join(' '))}</p></blockquote>`);
            continue;
        }

        if (
            line.includes('|') &&
            i + 1 < lines.length &&
            /^\s*\|?[\s-:|]+\|?\s*$/.test(lines[i + 1]) &&
            lines[i + 1].includes('-')
        ) {
            const tableLines = [];
            while (i < lines.length && lines[i].trim() && lines[i].includes('|')) {
                tableLines.push(lines[i]);
                i++;
            }
            out.push(renderTable(tableLines));
            continue;
        }

        if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
            const isOrdered = /^\s*\d+\.\s+/.test(line);
            const buf = [];
            while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i])) {
                const itemMatch = lines[i].match(/^\s*([-*+]|\d+\.)\s+(.*)$/);
                if (itemMatch) buf.push(itemMatch[2]);
                i++;
            }
            const tag = isOrdered ? 'ol' : 'ul';
            out.push(`<${tag}>\n${buf.map((t) => `<li>${renderInline(t)}</li>`).join('\n')}\n</${tag}>`);
            continue;
        }

        const buf = [line];
        i++;
        while (
            i < lines.length &&
            lines[i].trim() &&
            !/^#{1,6}\s/.test(lines[i]) &&
            !/^\s*([-*+]|\d+\.)\s+/.test(lines[i]) &&
            !lines[i].startsWith('>') &&
            !/^---+\s*$/.test(lines[i]) &&
            !/^```/.test(lines[i])
        ) {
            buf.push(lines[i]);
            i++;
        }
        const para = buf.join(' ');
        out.push(`<p>${renderInline(para)}</p>`);
    }

    return out.join('\n\n');
}

// ----------------------------- TOC -----------------------------

function buildToc(html) {
    const tocItems = [];
    const re = /<h2 id="([^"]+)">(.+?)<\/h2>/g;
    let m;
    while ((m = re.exec(html)) !== null) {
        const text = m[2].replace(/<[^>]+>/g, '');
        tocItems.push({ id: m[1], text });
    }
    const lis = tocItems.map((t) => `<li><a href="#${t.id}">${t.text}</a></li>`).join('\n');
    return { html: `<ol>\n${lis}\n</ol>`, count: tocItems.length };
}

// ----------------------------- CSS -----------------------------

const CSS = `
:root {
    --bccf-bg-50: #f7f8fa;
    --bccf-bg-100: #eef0f4;
    --bccf-surface: #ffffff;
    --bccf-border: #e2e6ec;
    --bccf-ink-500: #5b6472;
    --bccf-ink-700: #2f3742;
    --bccf-ink-900: #121821;
    --bccf-brand-500: #1f3b5e;
    --bccf-brand-600: #16304d;
    --bccf-brand-50: #eaeef4;
    --bccf-success-500: #1f9d55;
    --bccf-cost-500: #f97316;
    --bccf-r-sm: 4px;
    --bccf-r-md: 6px;
    --bccf-r-lg: 10px;
}

* { box-sizing: border-box; }

html, body {
    margin: 0;
    padding: 0;
    font-family: "Inter", "Inter Variable", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 10.5pt;
    line-height: 1.55;
    color: var(--bccf-ink-900);
    background: #fff;
    -webkit-font-smoothing: antialiased;
}

main {
    max-width: 8.0in;
    margin: 0 auto;
    padding: 0.6in 0.5in;
}

/* Typography */

h1 {
    font-size: 28pt;
    font-weight: 700;
    color: var(--bccf-brand-500);
    margin: 0 0 0.35em;
    letter-spacing: -0.01em;
    line-height: 1.15;
    page-break-after: avoid;
}

h2 {
    font-size: 18pt;
    font-weight: 700;
    color: var(--bccf-brand-500);
    margin: 0 0 0.5em;
    letter-spacing: -0.005em;
    padding-bottom: 0.3em;
    border-bottom: 3px solid var(--bccf-brand-500);
    page-break-before: always;
    page-break-after: avoid;
}

h3 {
    font-size: 12.5pt;
    font-weight: 600;
    color: var(--bccf-ink-900);
    margin: 1.6em 0 0.5em;
    page-break-after: avoid;
}

h3 code {
    font-size: 0.92em;
    background: var(--bccf-brand-50);
    color: var(--bccf-brand-500);
    border-color: var(--bccf-brand-50);
}

p { margin: 0 0 0.7em; color: var(--bccf-ink-700); }
ul, ol { margin: 0 0 0.85em; padding-left: 1.4em; }
li { margin-bottom: 0.25em; }
strong { color: var(--bccf-ink-900); font-weight: 600; }
em { font-style: italic; color: var(--bccf-ink-700); }

code {
    font-family: "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
    font-size: 0.88em;
    background: var(--bccf-bg-50);
    padding: 0.08em 0.4em;
    border-radius: var(--bccf-r-sm);
    border: 1px solid var(--bccf-border);
    color: var(--bccf-ink-700);
    word-break: break-word;
}

a { color: var(--bccf-brand-500); text-decoration: none; }
a:hover { text-decoration: underline; }

hr {
    border: none;
    border-top: 1px solid var(--bccf-border);
    margin: 2em 0;
}

/* Data tables */

table.bccf-data-table {
    width: 100%;
    border-collapse: collapse;
    margin: 1em 0 1.4em;
    font-size: 9.5pt;
    page-break-inside: auto;
    border: 1px solid var(--bccf-border);
    border-radius: var(--bccf-r-md);
    overflow: hidden;
}

table.bccf-data-table th,
table.bccf-data-table td {
    border-bottom: 1px solid var(--bccf-border);
    padding: 0.5em 0.7em;
    text-align: left;
    vertical-align: top;
}

table.bccf-data-table thead th {
    background: var(--bccf-brand-500);
    color: #fff;
    font-weight: 600;
    font-size: 9pt;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    border-bottom: none;
}

table.bccf-data-table tbody tr:nth-child(even) {
    background: var(--bccf-bg-50);
}

table.bccf-data-table tbody tr:last-child td {
    border-bottom: none;
}

table.bccf-data-table td code {
    font-size: 0.88em;
    background: transparent;
    border-color: transparent;
    padding: 0;
    color: var(--bccf-ink-900);
}

table.bccf-data-table td:first-child code {
    color: var(--bccf-brand-500);
    font-weight: 500;
}

/* Code block (relationship diagram) */

pre.bccf-codeblock {
    background: var(--bccf-bg-50);
    border: 1px solid var(--bccf-border);
    border-left: 4px solid var(--bccf-brand-500);
    border-radius: var(--bccf-r-md);
    padding: 1em 1.2em;
    margin: 1.2em 0;
    font-family: "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
    font-size: 8.5pt;
    line-height: 1.45;
    color: var(--bccf-ink-900);
    overflow-x: auto;
    page-break-inside: avoid;
}

pre.bccf-codeblock code {
    background: transparent;
    border: none;
    padding: 0;
    font-size: inherit;
    color: inherit;
}

/* Cover */

.bccf-cover {
    padding: 2.2in 0 1in;
    page-break-after: always;
    text-align: left;
    border-left: 6px solid var(--bccf-brand-500);
    padding-left: 1.5em;
}

.bccf-cover-eyebrow {
    font-size: 10pt;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--bccf-brand-500);
    font-weight: 600;
    margin-bottom: 0.5em;
}

.bccf-cover h1 {
    font-size: 38pt;
    margin: 0 0 0.15em;
    line-height: 1.1;
}

.bccf-cover-subtitle {
    font-size: 14pt;
    color: var(--bccf-ink-500);
    font-weight: 400;
    margin-bottom: 3.5em;
}

.bccf-cover-meta {
    font-size: 10pt;
    color: var(--bccf-ink-500);
    line-height: 1.9;
    border-top: 1px solid var(--bccf-border);
    padding-top: 1.2em;
    margin-top: 3em;
}

.bccf-cover-meta-row { display: flex; gap: 2em; }
.bccf-cover-meta-row span:first-child {
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-weight: 600;
    color: var(--bccf-ink-700);
    min-width: 6em;
}

/* TOC */

.bccf-toc { padding: 1em 0 0; page-break-after: always; }

.bccf-toc h2 {
    page-break-before: avoid;
    border-bottom: 3px solid var(--bccf-brand-500);
    font-size: 16pt;
    margin-top: 0;
}

.bccf-toc ol {
    list-style: none;
    padding: 0;
    margin: 1.5em 0 0;
    counter-reset: bccf-section;
}

.bccf-toc li {
    counter-increment: bccf-section;
    padding: 0.55em 0;
    border-bottom: 1px dotted var(--bccf-border);
    font-size: 12pt;
    display: flex;
    align-items: baseline;
}

.bccf-toc li:last-child { border-bottom: none; }

.bccf-toc li::before {
    content: counter(bccf-section, decimal-leading-zero) " · ";
    color: var(--bccf-brand-500);
    font-weight: 600;
    margin-right: 0.7em;
    min-width: 2.5em;
    font-feature-settings: "tnum";
}

.bccf-toc a {
    color: var(--bccf-ink-900);
    flex: 1;
    text-decoration: none;
}

.bccf-toc a:hover { color: var(--bccf-brand-500); }

/* Footer */

.bccf-footer {
    margin-top: 3em;
    padding-top: 1em;
    border-top: 1px solid var(--bccf-border);
    font-size: 9pt;
    color: var(--bccf-ink-500);
    display: flex;
    justify-content: space-between;
}

/* Print rules */

@page {
    size: letter;
    margin: 0.55in 0.5in 0.55in 0.5in;
}

@media print {
    html, body { background: #fff; }
    * {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
    }
    main { padding: 0; max-width: none; }
    a { color: inherit; text-decoration: none; }
    h2 { page-break-before: always; }
    h2:first-of-type { page-break-before: avoid; }
    .bccf-cover, .bccf-toc { page-break-after: always; }
}
`;

// ----------------------------- Assembly -----------------------------

function buildHtml() {
    const md = fs.readFileSync(INVENTORY_MD, 'utf8');

    // Strip the leading H1 + intro paragraph (replaced by cover)
    const mdBody = md.replace(/^#\s+[^\n]+\n+([^\n#]+\n+)?/, '');

    const renderedBody = markdownToHtml(mdBody);
    const { html: tocHtml, count: tocCount } = buildToc(renderedBody);

    const cover = `
<div class="bccf-cover">
    <div class="bccf-cover-eyebrow">BlueCollar Cash Flow Suite</div>
    <h1>Object Inventory</h1>
    <div class="bccf-cover-subtitle">Custom objects in the Data Airflow sandbox</div>
    <div class="bccf-cover-meta">
        <div class="bccf-cover-meta-row"><span>Account</span><span>Data Airflow LLC sandbox</span></div>
        <div class="bccf-cover-meta-row"><span>Issued</span><span>May 2026</span></div>
        <div class="bccf-cover-meta-row"><span>Source</span><span>docs/sdf-inventory.md</span></div>
    </div>
</div>`;

    const toc = `
<nav class="bccf-toc">
    <h2 id="contents">Contents</h2>
    ${tocHtml}
</nav>`;

    const footer = `
<div class="bccf-footer">
    <span>BlueCollar Cash Flow Suite · Object Inventory</span>
    <span>Generated 2026-05-24</span>
</div>`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>BC Cash Flow — Object Inventory</title>
<style>${CSS}</style>
</head>
<body>
<main>
${cover}
${toc}
${renderedBody}
${footer}
</main>
</body>
</html>`;

    fs.writeFileSync(OUT_HTML, html);
    const sizeKb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
    console.log(`[ok] wrote ${OUT_HTML}`);
    console.log(`[ok] file size: ${sizeKb} KB`);
    console.log(`[ok] h2 sections in TOC: ${tocCount}`);
}

buildHtml();
