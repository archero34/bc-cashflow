/* eslint-disable */
/**
 * Extract CLIENT_SCRIPT verbatim from bc_cf_portfolio_sl.js.
 *
 * The SL stores the client-side JS inside a template literal so escapes like
 * \\u2212 / \\d{4} appear doubled in source. Reading the source raw and
 * collapsing the doubled backslashes (template-literal eval) gives us what
 * the browser actually sees.
 */
const fs = require('fs');
const path = require('path');

const SL = path.join(__dirname, '..', 'FileCabinet', 'SuiteScripts', 'BlueCollar', 'CashFlow', 'entry_points', 'bc_cf_portfolio_sl.js');
const src = fs.readFileSync(SL, 'utf8');

const startMarker = 'const CLIENT_SCRIPT = `';
const startIdx = src.indexOf(startMarker);
if (startIdx === -1) throw new Error('CLIENT_SCRIPT start marker not found');
const bodyStart = startIdx + startMarker.length;
const endIdx = src.indexOf('\n`;', bodyStart);
if (endIdx === -1) throw new Error('CLIENT_SCRIPT end marker not found');
const raw = src.slice(bodyStart, endIdx + 1); // include trailing newline before closing backtick

// Collapse template-literal escapes: \\u → \u, \\d → \d, \\n → \n in strings, etc.
// Template literals only unescape: \\, \`, \$, \n, \r, \t, \uXXXX, \xHH.
// Simplest correct collapse: replace any \\X with \X (single backslash + X).
// This is what the JS engine does when evaluating the literal.
const collapsed = raw.replace(/\\(.)/g, (_, c) => '\\' + c).replace(/\\\\/g, '\\');
// The above tries to be a noop unless... actually that's not right.
// Correct: a template-literal '\\u2212' source has TWO chars: '\' and 'u'... no.
// JS source '\\u2212' is the 6-char sequence: \ \ u 2 2 1 2 wait no.
// In a JS template literal, the source `\\u2212` represents − (the literal backslash followed by u2212).
// Actually inside `` template literal: \\ -> \. Then u2212 is just letters/digits.
// So the runtime template value is the 6-char string: '−' (a literal backslash, then 'u2212').
// That string when re-evaluated as a JS source (i.e., placed inside a <script>) becomes the − escape -> minus sign.
//
// So we want raw '\\X' -> '\X' (one backslash). The replace logic:
process.stdout.write(raw.replace(/\\\\/g, '\\'));
