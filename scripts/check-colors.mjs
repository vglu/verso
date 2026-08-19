#!/usr/bin/env node
/**
 * Guard: no literal colors outside the token/theme files.
 * A theme must be able to repaint everything, so components may only use var().
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const SCAN_DIRS = ['src'];
const ALLOWED = [join('src', 'styles', 'tokens.css'), join('src', 'styles', 'themes')];

// #rgb / #rrggbb / #rrggbbaa, rgb(), rgba(), hsl(), hsla()
const COLOR_RE = /#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(/g;
const EXTS = ['.css', '.svelte', '.ts'];

/** Colors that are legitimately literal: pure white/black on fixed-color surfaces. */
const EXEMPT_LINE = /--?[a-z-]*(shadow|scrollbar)|color:\s*#fff\b|currentColor/i;

const offenders = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const rel = relative(ROOT, full);
    if (ALLOWED.some((a) => rel === a || rel.startsWith(a + sep))) continue;
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full);
    } else if (EXTS.some((e) => entry.endsWith(e))) {
      scan(full, rel);
    }
  }
}

function scan(full, rel) {
  const lines = readFileSync(full, 'utf8').split(/\r?\n/);

  // Print is the one place a literal colour is the correct answer. Paper has
  // no theme: printing a reader's dark background would be a black page, so
  // the print stylesheet states black on white and means it. The exemption is
  // this narrow on purpose — it ends with the block.
  let printDepth = 0;
  let inPrint = false;

  lines.forEach((line, i) => {
    if (!inPrint && /@media\s+print/.test(line)) {
      inPrint = true;
      printDepth = 0;
    }
    if (inPrint) {
      printDepth += (line.match(/\{/g) ?? []).length;
      printDepth -= (line.match(/\}/g) ?? []).length;
    }

    if (!inPrint && !EXEMPT_LINE.test(line)) {
      const matches = line.match(COLOR_RE);
      if (matches) offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
    }

    if (inPrint && printDepth <= 0 && /\}/.test(line)) inPrint = false;
  });
}

for (const d of SCAN_DIRS) walk(join(ROOT, d));

if (offenders.length > 0) {
  console.error('❌ Literal colors found outside tokens.css / themes/:\n');
  for (const o of offenders) console.error('  ' + o);
  console.error(
    `\n${offenders.length} violation(s). Use var(--token) instead — see docs/design/DESIGN-SYSTEM.md §2.`
  );
  process.exit(1);
}

console.log('✅ check:colors — no literal colors outside tokens/themes');
