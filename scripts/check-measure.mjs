#!/usr/bin/env node
/**
 * Guard: nothing may take the reading measure off its axis.
 *
 * The measure lives on `.cm-line` — `max-width` plus `margin-inline: auto` —
 * so that a table can be wider than the prose around it while both stay
 * centred on the same line. Any rule that sets side margins on a line breaks
 * that, and the `margin` shorthand does it by accident: `margin: 0.5em 0` is
 * also `margin-left: 0`, which drops the heading against the edge of the
 * window while the paragraph under it stays centred.
 *
 * It is invisible in a narrow window and a hand's width apart on a wide one,
 * which is exactly the kind of thing a person stops seeing and a script does
 * not. Use `margin-block` on a line; never `margin`.
 *
 * Usage: node scripts/check-measure.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SCAN = [join('src', 'styles')];

/** Properties that move a line sideways, and so cannot appear on one. */
const OFFENDING = /^\s*(margin|margin-left|margin-right|margin-inline(-start|-end)?)\s*:/;
/** Except the one declaration that puts it back on the axis. */
const ALLOWED = /^\s*margin-inline\s*:\s*auto\s*;?\s*$/;

const offenders = [];

function scan(file, rel) {
  const text = readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);

  let selector = '';
  let inLine = false;

  lines.forEach((line, i) => {
    const trimmed = line.trim();

    if (trimmed.endsWith('{')) {
      selector += trimmed.slice(0, -1).trim();
      inLine = /\.cm-line\b/.test(selector);
      selector = '';
      return;
    }
    if (trimmed.endsWith(',')) {
      selector += `${trimmed} `;
      return;
    }
    if (trimmed.startsWith('}')) {
      inLine = false;
      selector = '';
      return;
    }

    if (inLine && OFFENDING.test(trimmed) && !ALLOWED.test(trimmed)) {
      offenders.push(`${rel}:${i + 1}: ${trimmed}`);
    }
  });
}

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (entry.endsWith('.css')) scan(full, relative(ROOT, full));
  }
}

for (const dir of SCAN) walk(join(ROOT, dir));

if (offenders.length > 0) {
  console.error('\n✗ side margins on a .cm-line take it off the reading axis:\n');
  for (const o of offenders) console.error(`   ${o}`);
  console.error('\nUse margin-block for the space above and below a line.');
  console.error(`${offenders.length} declaration(s) to fix\n`);
  process.exit(1);
}

console.log('✅ check:measure — every line still centres on the same axis');
