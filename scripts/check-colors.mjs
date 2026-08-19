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
  lines.forEach((line, i) => {
    if (EXEMPT_LINE.test(line)) return;
    const matches = line.match(COLOR_RE);
    if (matches) {
      offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
    }
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
