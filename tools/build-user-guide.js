#!/usr/bin/env node
/**
 * Build a single self-contained HTML user guide from docs/user-guide/guide.md.
 *
 * Inlines all screenshots as base64 data URIs and wraps the rendered markdown
 * with a cover + TOC + footer. The HTML/CSS uses the BCCF design system tokens
 * (mirrored from bc_cf_styles.js) so the guide feels native to the product.
 *
 * Output: docs/user-guide/bc-cashflow-user-guide.html
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const GUIDE_MD = path.join(ROOT, 'docs/user-guide/guide.md');
const SCREENSHOTS_DIR = path.join(ROOT, 'docs/user-guide/screenshots');
const OUT_HTML = path.join(ROOT, 'docs/user-guide/bc-cashflow-user-guide.html');

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

    // Images: ![alt](src) — class name is the BCCF-prefixed selector.
    text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => {
        return `<img src="${src}" alt="${alt}" class="bccf-screenshot">`;
    });

    // Links
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
        return `<a href="${href}">${label}</a>`;
    });

    // Bold then italic
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
    let html = '<table>\n<thead><tr>';
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
            const listHtml = parseList(lines, i, isOrdered);
            out.push(listHtml.html);
            i = listHtml.next;
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
            !/^---+\s*$/.test(lines[i])
        ) {
            buf.push(lines[i]);
            i++;
        }
        const para = buf.join(' ');
        out.push(`<p>${renderInline(para)}</p>`);
    }

    return out.join('\n\n');
}

function parseList(lines, start, ordered) {
    const baseIndent = (lines[start].match(/^(\s*)/) || ['', ''])[1].length;
    const items = [];
    let i = start;

    while (i < lines.length) {
        const line = lines[i];
        if (!line.trim()) {
            let j = i + 1;
            while (j < lines.length && !lines[j].trim()) j++;
            if (j >= lines.length) break;
            const nextIndent = (lines[j].match(/^(\s*)/) || ['', ''])[1].length;
            if (nextIndent < baseIndent || !/^\s*([-*+]|\d+\.)\s+/.test(lines[j])) break;
            i = j;
            continue;
        }
        const indent = (line.match(/^(\s*)/) || ['', ''])[1].length;
        const itemMatch = line.match(/^\s*([-*+]|\d+\.)\s+(.*)$/);

        if (indent < baseIndent) break;
        if (!itemMatch && indent === baseIndent) break;

        if (itemMatch && indent === baseIndent) {
            const content = [itemMatch[2]];
            i++;
            while (i < lines.length) {
                const nLine = lines[i];
                if (!nLine.trim()) {
                    let j = i + 1;
                    while (j < lines.length && !lines[j].trim()) j++;
                    if (j >= lines.length) break;
                    const nIndent = (lines[j].match(/^(\s*)/) || ['', ''])[1].length;
                    if (nIndent > baseIndent) {
                        i = j;
                        continue;
                    }
                    break;
                }
                const nIndent = (nLine.match(/^(\s*)/) || ['', ''])[1].length;
                if (nIndent <= baseIndent && /^\s*([-*+]|\d+\.)\s+/.test(nLine)) break;
                if (nIndent <= baseIndent && !/^\s*([-*+]|\d+\.)\s+/.test(nLine)) break;
                if (nIndent > baseIndent && /^\s*([-*+]|\d+\.)\s+/.test(nLine)) {
                    const nestedOrdered = /^\s*\d+\.\s+/.test(nLine);
                    const nested = parseList(lines, i, nestedOrdered);
                    content.push(nested.html);
                    i = nested.next;
                    continue;
                }
                content.push(nLine.trim());
                i++;
            }
            items.push(content);
        } else {
            break;
        }
    }

    const tag = ordered ? 'ol' : 'ul';
    const itemsHtml = items
        .map((parts) => {
            const text = parts.filter((p) => !/^<[uo]l>/.test(p)).join(' ');
            const nested = parts.filter((p) => /^<[uo]l>/.test(p)).join('\n');
            return `<li>${renderInline(text)}${nested ? '\n' + nested : ''}</li>`;
        })
        .join('\n');

    return { html: `<${tag}>\n${itemsHtml}\n</${tag}>`, next: i };
}

// ----------------------------- Image inlining -----------------------------

function inlineScreenshots(html) {
    let count = 0;
    const result = html.replace(
        /<img\s+src="screenshots\/([^"]+)"\s+alt="([^"]*)"\s+class="bccf-screenshot">/g,
        (match, file, alt) => {
            const p = path.join(SCREENSHOTS_DIR, file);
            if (!fs.existsSync(p)) {
                console.warn(`[warn] missing screenshot: ${file}`);
                return match;
            }
            const data = fs.readFileSync(p).toString('base64');
            count++;
            return `<figure><img src="data:image/png;base64,${data}" alt="${alt}" class="bccf-screenshot"><figcaption>${alt}</figcaption></figure>`;
        }
    );
    return { html: result, count };
}

// ----------------------------- TOC -----------------------------

function buildToc(html) {
    const tocItems = [];
    const re = /<h2 id="([^"]+)">([\s\S]*?)<\/h2>/g;
    let m;
    while ((m = re.exec(html)) !== null) {
        const id = m[1];
        const text = m[2].replace(/<[^>]+>/g, '').replace(/^\d+\.\s*/, '').trim();
        tocItems.push({ id, text });
    }
    const lis = tocItems.map((t) => `<li><a href="#${t.id}">${t.text}</a></li>`).join('\n');
    return { html: `<ol>\n${lis}\n</ol>`, count: tocItems.length };
}

// ----------------------------- CSS (BCCF design system) -----------------------------

const CSS = `
:root {
    /* Backgrounds */
    --bccf-bg-50: #f7f8fa;
    --bccf-bg-100: #eef0f4;
    --bccf-surface: #ffffff;
    --bccf-border: #e2e6ec;
    /* Ink */
    --bccf-ink-500: #5b6472;
    --bccf-ink-700: #2f3742;
    --bccf-ink-900: #121821;
    /* Brand */
    --bccf-brand-500: #1f3b5e;
    --bccf-brand-600: #16304d;
    --bccf-brand-50: #eaeef4;
    /* Status */
    --bccf-success-500: #1f9d55;
    --bccf-success-50: #e7f6ec;
    --bccf-warn-500: #c97a0b;
    --bccf-warn-50: #fdf4e3;
    --bccf-danger-500: #c2361d;
    --bccf-danger-50: #fbeceb;
    /* Cost identity */
    --bccf-cost-500: #f97316;
    --bccf-cost-50: #fff7ed;
    /* Radius */
    --bccf-r-sm: 4px; --bccf-r-md: 6px; --bccf-r-lg: 10px; --bccf-r-full: 999px;
}

* { box-sizing: border-box; }

html, body {
    margin: 0;
    padding: 0;
    font-family: "Inter", "Inter Variable", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 11pt;
    line-height: 1.6;
    color: var(--bccf-ink-900);
    background: #fff;
    -webkit-font-smoothing: antialiased;
}

main {
    max-width: 7.5in;
    margin: 0 auto;
    padding: 0.65in 0.55in;
}

/* ── Typography ─────────────────────────────────────────────── */

h1 {
    font-size: 30pt;
    font-weight: 700;
    color: var(--bccf-brand-500);
    margin: 0 0 0.4em;
    letter-spacing: -0.01em;
    line-height: 1.15;
    page-break-after: avoid;
}

h2 {
    font-size: 20pt;
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
    font-size: 13pt;
    font-weight: 600;
    color: var(--bccf-ink-900);
    margin: 1.6em 0 0.5em;
    page-break-after: avoid;
}

h4 {
    font-size: 11.5pt;
    font-weight: 600;
    color: var(--bccf-ink-700);
    margin: 1.2em 0 0.4em;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    page-break-after: avoid;
}

p { margin: 0 0 0.75em; color: var(--bccf-ink-900); }
ul, ol { margin: 0 0 0.85em; padding-left: 1.4em; }
li { margin-bottom: 0.3em; }
li > p { margin-bottom: 0.4em; }
li ul, li ol { margin: 0.3em 0; }
strong { color: var(--bccf-ink-900); font-weight: 600; }
em { font-style: italic; color: var(--bccf-ink-700); }

code {
    font-family: "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
    font-size: 0.9em;
    background: var(--bccf-bg-50);
    padding: 0.1em 0.4em;
    border-radius: var(--bccf-r-sm);
    border: 1px solid var(--bccf-border);
    color: var(--bccf-ink-700);
}

a { color: var(--bccf-brand-500); text-decoration: none; }
a:hover { text-decoration: underline; }

blockquote {
    margin: 1em 0;
    padding: 0.6em 1em;
    border-left: 3px solid var(--bccf-brand-500);
    background: var(--bccf-bg-50);
    color: var(--bccf-ink-700);
    border-radius: 0 var(--bccf-r-sm) var(--bccf-r-sm) 0;
    page-break-inside: avoid;
}

blockquote p:last-child { margin-bottom: 0; }

hr {
    border: none;
    border-top: 1px solid var(--bccf-border);
    margin: 2em 0;
}

table {
    width: 100%;
    border-collapse: collapse;
    margin: 1em 0 1.3em;
    font-size: 10pt;
    page-break-inside: avoid;
}
th, td {
    border: 1px solid var(--bccf-border);
    padding: 0.5em 0.7em;
    text-align: left;
    vertical-align: top;
}
th {
    background: var(--bccf-bg-50);
    color: var(--bccf-ink-900);
    font-weight: 600;
}

/* ── Screenshots ───────────────────────────────────────────── */

img.bccf-screenshot {
    display: block;
    max-width: 100%;
    height: auto;
    margin: 1.2em auto;
    border: 1px solid var(--bccf-border);
    border-radius: var(--bccf-r-md);
    box-shadow: 0 1px 3px rgba(18,24,33,.06), 0 2px 8px rgba(18,24,33,.04);
    page-break-inside: avoid;
}

figure { margin: 1.2em 0; page-break-inside: avoid; }
figcaption {
    font-size: 10pt;
    color: var(--bccf-ink-500);
    text-align: center;
    margin-top: 0.4em;
    font-style: italic;
}

/* ── Cover page ─────────────────────────────────────────────── */

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
    font-size: 42pt;
    margin: 0 0 0.15em;
    line-height: 1.1;
}

.bccf-cover-subtitle {
    font-size: 16pt;
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
    min-width: 5em;
}

/* ── Table of contents ─────────────────────────────────────── */

.bccf-toc { padding: 1em 0 0; page-break-after: always; }

.bccf-toc h2 {
    page-break-before: avoid;
    border-bottom: 3px solid var(--bccf-brand-500);
    font-size: 18pt;
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

/* ── Inline color callouts ─────────────────────────────────── */

.bccf-token {
    display: inline-block;
    padding: 0.1em 0.55em;
    border-radius: var(--bccf-r-full);
    font-size: 0.85em;
    font-weight: 500;
    border: 1px solid var(--bccf-brand-500);
    color: var(--bccf-brand-500);
    background: var(--bccf-brand-50);
    vertical-align: baseline;
}

.bccf-token.cost { color: var(--bccf-cost-500); border-color: var(--bccf-cost-500); background: var(--bccf-cost-50); }
.bccf-token.success { color: var(--bccf-success-500); border-color: var(--bccf-success-500); background: var(--bccf-success-50); }
.bccf-token.warn { color: var(--bccf-warn-500); border-color: var(--bccf-warn-500); background: var(--bccf-warn-50); }
.bccf-token.danger { color: var(--bccf-danger-500); border-color: var(--bccf-danger-500); background: var(--bccf-danger-50); }

/* ── Footer ─────────────────────────────────────────────────── */

.bccf-footer {
    margin-top: 3em;
    padding-top: 1em;
    border-top: 1px solid var(--bccf-border);
    font-size: 9pt;
    color: var(--bccf-ink-500);
    display: flex;
    justify-content: space-between;
}

/* ── Print rules ───────────────────────────────────────────── */

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
    img.bccf-screenshot {
        box-shadow: none;
        max-width: 100%;
    }
    a { color: inherit; text-decoration: none; }
    h2 { page-break-before: always; }
    h2:first-of-type { page-break-before: avoid; }
    .bccf-cover, .bccf-toc { page-break-after: always; }
}
`;

// ----------------------------- Build -----------------------------

function build() {
    const md = fs.readFileSync(GUIDE_MD, 'utf8');
    // Drop the top-level H1 — the cover supplies its own title.
    const mdBody = md.replace(/^#\s+BC Cash Flow Forecasting.*\n/, '');

    const rendered = markdownToHtml(mdBody);
    const { html: withImages, count: imgCount } = inlineScreenshots(rendered);
    const { html: tocList, count: h2Count } = buildToc(withImages);

    // After the TOC the very next heading is h2 #1; we already use
    // `page-break-before: always` on h2 — but the TOC itself ends with
    // page-break-after, so the first h2 starts cleanly on a new page.
    // We *still* want the first h2 to break (it's not :first-of-type because
    // the cover contains an h1, not an h2 — so the h2 in TOC IS the first h2).
    // The h2#:first-of-type rule applies to the TOC h2 only.

    const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>BC Cash Flow Forecasting — End-User Guide</title>
<style>${CSS}</style>
</head>
<body>
<main>
<div class="bccf-cover">
    <div class="bccf-cover-eyebrow">BlueCollar Cash Flow Suite</div>
    <h1>Cash Flow Forecasting</h1>
    <div class="bccf-cover-subtitle">End-User Guide</div>
    <div class="bccf-cover-meta">
        <div class="bccf-cover-meta-row"><span>Version</span><span>1.5</span></div>
        <div class="bccf-cover-meta-row"><span>Issued</span><span>May 2026</span></div>
        <div class="bccf-cover-meta-row"><span>Audience</span><span>Project managers, financial controllers, project executives</span></div>
    </div>
</div>

<nav class="bccf-toc">
    <h2>Contents</h2>
    ${tocList}
</nav>

${withImages}

<div class="bccf-footer">
    <span>BlueCollar Cash Flow Suite · End-User Guide</span>
    <span>Generated 2026-05-24</span>
</div>
</main>
</body>
</html>`;

    fs.writeFileSync(OUT_HTML, fullHtml);

    const stats = fs.statSync(OUT_HTML);
    const mb = (stats.size / (1024 * 1024)).toFixed(2);

    console.log(`[ok] wrote ${OUT_HTML}`);
    console.log(`[ok] file size: ${stats.size} bytes (${mb} MB)`);
    console.log(`[ok] inlined screenshots: ${imgCount}`);
    console.log(`[ok] h2 sections in TOC: ${h2Count}`);
}

build();
