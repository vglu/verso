#!/usr/bin/env node
/**
 * Measure a theme instead of admiring it.
 *
 * docs/themes.md asks theme authors for 4.5:1 on body text and offers no way
 * to find out whether they got it. This reads the tokens out of a theme file —
 * both the light block and the dark one — and reports the contrast of every
 * pair that a reader actually has to read, against the thresholds WCAG sets:
 *
 *   4.5:1  normal text
 *   3.0:1  large text (headings), and non-text that carries meaning
 *
 * Usage: node scripts/check-theme-contrast.mjs docs/themes/blush.css [...]
 *        node scripts/check-theme-contrast.mjs --all
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Text tokens and the surface each is read against. */
const TEXT_PAIRS = [
  ['--fg', '--bg', 4.5, 'body text on the document'],
  ['--heading', '--bg', 3, 'headings on the document'],
  ['--fg-ui', '--bg-app', 4.5, 'interface text on the chrome'],
  ['--fg-ui', '--bg-panel', 4.5, 'interface text on panels'],
  ['--fg-muted', '--bg', 4.5, 'quotes and secondary text'],
  ['--fg-muted', '--bg-panel', 4.5, 'secondary text on panels'],
  ['--fg-faint', '--bg-panel', 3, 'placeholders and captions'],
  ['--accent', '--bg', 4.5, 'links in the document'],
  ['--accent', '--bg-panel', 4.5, 'accents on panels'],
  ['--danger', '--bg-panel', 4.5, 'error text'],
  ['--warning', '--bg-panel', 4.5, 'warning text'],
  ['--success', '--bg-panel', 4.5, 'success text'],
  ['--syn-keyword', '--bg-code', 4.5, 'keywords in code'],
  ['--syn-string', '--bg-code', 4.5, 'strings in code'],
  ['--syn-comment', '--bg-code', 3, 'comments in code'],
  ['--syn-function', '--bg-code', 4.5, 'function names in code'],
  ['--syn-number', '--bg-code', 4.5, 'numbers in code'],
  ['--syn-property', '--bg-code', 4.5, 'properties in code']
];

function parseBlocks(css) {
  // Two blocks: the light tokens on :root, the dark ones on [data-theme='dark'].
  const blocks = {};
  const re = /(:root|\[data-theme=['"]dark['"]\])\s*\{([^}]*)\}/g;
  let match;
  while ((match = re.exec(css)) !== null) {
    const key = match[1] === ':root' ? 'light' : 'dark';
    const body = match[2];
    blocks[key] = blocks[key] ?? {};
    const decl = /(--[\w-]+)\s*:\s*([^;]+);/g;
    let d;
    while ((d = decl.exec(body)) !== null) blocks[key][d[1]] = d[2].trim();
  }
  return blocks;
}

/** Resolve `var(--x)` chains, then parse to RGB. Alpha is composited later. */
function resolve(tokens, name, seen = new Set()) {
  const raw = tokens[name];
  if (!raw || seen.has(name)) return null;
  seen.add(name);
  const varRef = raw.match(/^var\((--[\w-]+)\)$/);
  if (varRef) return resolve(tokens, varRef[1], seen);
  return raw;
}

function toRgba(value) {
  if (!value) return null;
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3)
      h = h
        .split('')
        .map((c) => c + c)
        .join('');
    const n = parseInt(h.slice(0, 6), 16);
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
  }
  const rgb = value.match(/^rgba?\(([^)]+)\)$/i);
  if (rgb) {
    const parts = rgb[1].split(/[,/]/).map((p) => parseFloat(p.trim()));
    return [parts[0], parts[1], parts[2], parts[3] ?? 1];
  }
  return null;
}

/** A translucent colour is only readable once you know what is behind it. */
function composite(colour, behind) {
  const [r, g, b, a] = colour;
  if (a >= 1) return [r, g, b];
  const [br, bg, bb] = behind;
  return [r * a + br * (1 - a), g * a + bg * (1 - a), b * a + bb * (1 - a)];
}

function luminance([r, g, b]) {
  const channel = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(fg, bg) {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

function checkBlock(tokens, fallback, label, file) {
  const failures = [];
  const rows = [];
  for (const [fgName, bgName, min, what] of TEXT_PAIRS) {
    const fgRaw = toRgba(resolve(tokens, fgName) ?? resolve(fallback, fgName));
    const bgRaw = toRgba(resolve(tokens, bgName) ?? resolve(fallback, bgName));
    if (!fgRaw || !bgRaw) continue; // token not defined by this theme: inherited

    const page = composite(bgRaw, [255, 255, 255]);
    const ratio = contrast(composite(fgRaw, page), page);
    const ok = ratio >= min;
    rows.push({ what, fgName, bgName, ratio, min, ok });
    if (!ok) failures.push(`${file} [${label}] ${what}: ${ratio.toFixed(2)}:1, needs ${min}:1`);
  }

  console.log(`\n  ${label}`);
  for (const r of rows) {
    const mark = r.ok ? '  ok ' : ' FAIL';
    console.log(
      `   ${mark}  ${r.ratio.toFixed(2).padStart(5)}:1  (min ${String(r.min).padEnd(3)})  ${r.what}`
    );
  }
  return failures;
}

const args = process.argv.slice(2);
const files =
  args[0] === '--all'
    ? readdirSync('docs/themes')
        .filter((f) => f.endsWith('.css'))
        .map((f) => join('docs/themes', f))
    : args;

if (files.length === 0) {
  console.error('usage: node scripts/check-theme-contrast.mjs <theme.css> [...] | --all');
  process.exit(2);
}

let failures = [];
for (const file of files) {
  const css = readFileSync(file, 'utf8');
  const blocks = parseBlocks(css);
  console.log(`\n${file}`);
  if (blocks.light) failures = failures.concat(checkBlock(blocks.light, {}, 'light', file));
  if (blocks.dark) {
    // A dark block usually only overrides part of the palette; the rest comes
    // from the light block above it, exactly as the browser resolves it.
    failures = failures.concat(checkBlock(blocks.dark, blocks.light ?? {}, 'dark', file));
  }
}

console.log('');
if (failures.length > 0) {
  for (const f of failures) console.error(`✗ ${f}`);
  console.error(`\n${failures.length} pair(s) below the threshold`);
  process.exit(1);
}
console.log('✅ every pair meets its contrast threshold');
