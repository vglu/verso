import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEFAULT_SETTINGS } from '../src/lib/ipc/types';

/**
 * Settings and sessions are saved by round-tripping their Rust structs: the
 * frontend sends the whole object, serde parses it into the struct, and the
 * struct is written back out. A field the struct does not declare is not just
 * unread — it is dropped from the file on the next save, so the feature behind
 * it works until the program is restarted and then quietly does not.
 *
 * Both halves of this contract have been broken that way already: the user's
 * own theme file vanished after the first save, and every document reopened at
 * line one because the reading position never survived the round trip.
 */
const read = (p: string): string => readFileSync(resolve(__dirname, '..', p), 'utf8');
const snake = (key: string): string => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/** The field names of a TypeScript interface or inline object literal. */
function fieldsOf(source: string, block: string): string[] {
  const start = source.indexOf(block);
  if (start < 0) throw new Error(`no block matching ${block} in types.ts`);
  const open = source.indexOf('{', start);
  let depth = 0;
  let end = open;
  for (; end < source.length; end += 1) {
    if (source[end] === '{') depth += 1;
    else if (source[end] === '}' && (depth -= 1) === 0) break;
  }
  const body = source.slice(open + 1, end);
  return [...body.matchAll(/^\s*(\w+)\??:/gm)].map((m) => m[1] ?? '');
}

describe('IPC struct contract', () => {
  const types = read('src/lib/ipc/types.ts');

  it('the Rust Settings struct declares every field the frontend sends', () => {
    const rust = read('src-tauri/src/commands/settings.rs');
    const missing = Object.keys(DEFAULT_SETTINGS).filter(
      (key) => !new RegExp(`\\bpub ${snake(key)}:`).test(rust)
    );
    expect(missing).toEqual([]);
  });

  it('the Rust session structs declare every field the frontend sends', () => {
    const rust = read('src-tauri/src/commands/session.rs');
    const fields = [
      ...fieldsOf(types, 'interface SessionTab'),
      ...fieldsOf(types, 'sidebar: {'),
      ...fieldsOf(types, 'interface SessionState')
    ];
    const missing = fields.filter((key) => !new RegExp(`\\bpub ${snake(key)}:`).test(rust));
    expect(missing).toEqual([]);
  });
});
