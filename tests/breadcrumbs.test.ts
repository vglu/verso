import { describe, expect, it } from 'vitest';
import { parseFully } from './support/tree';
import { EditorState } from '@codemirror/state';
import { markdownSupport } from '../src/lib/editor/markdownLang';
import { activeOutlineIndex, extractOutline, type OutlineItem } from '../src/lib/editor/outline';

/**
 * The heading path shown above the document. Extracted here as pure logic so
 * the rule can be tested without a laid-out view — the component reads the
 * same shape out of the workspace store.
 */
function trailFor(items: OutlineItem[], index: number): OutlineItem[] {
  if (index < 0 || index >= items.length) return [];
  const path: OutlineItem[] = [];
  let level = Number.POSITIVE_INFINITY;
  for (let i = index; i >= 0; i--) {
    const item = items[i];
    if (!item || item.level >= level) continue;
    path.unshift(item);
    level = item.level;
    if (level === 1) break;
  }
  return path;
}

function outlineOf(doc: string): OutlineItem[] {
  return extractOutline(parseFully(EditorState.create({ doc, extensions: [markdownSupport()] })));
}

const doc = [
  '# Guide',
  '',
  'intro',
  '',
  '## Setup',
  '',
  'text',
  '',
  '### Windows',
  '',
  'text',
  '',
  '## Usage',
  '',
  'text'
].join('\n');

describe('the heading path', () => {
  const items = outlineOf(doc);

  it('reads from the top level down to the current section', () => {
    const deep = items.findIndex((i) => i.text === 'Windows');
    expect(trailFor(items, deep).map((i) => i.text)).toEqual(['Guide', 'Setup', 'Windows']);
  });

  it('drops back out when the section is a sibling again', () => {
    const usage = items.findIndex((i) => i.text === 'Usage');
    expect(trailFor(items, usage).map((i) => i.text)).toEqual(['Guide', 'Usage']);
  });

  it('is just the heading itself at the top level', () => {
    expect(trailFor(items, 0).map((i) => i.text)).toEqual(['Guide']);
  });

  it('is empty before the first heading', () => {
    expect(trailFor(items, -1)).toEqual([]);
  });

  it('copes with a document that skips a level', () => {
    const skipped = outlineOf('# One\n\n### Three\n\ntext\n');
    const last = skipped.length - 1;
    expect(trailFor(skipped, last).map((i) => i.text)).toEqual(['One', 'Three']);
  });
});

describe('which section is current', () => {
  const items = outlineOf(doc);

  it('follows the position being read, not the caret', () => {
    // The index is computed from a viewport probe in the app; here we check
    // the underlying rule: the last heading at or above the position.
    const inWindows = doc.indexOf('### Windows') + 15; // inside its paragraph
    expect(items[activeOutlineIndex(items, inWindows)]!.text).toBe('Windows');

    const inUsage = doc.indexOf('## Usage') + 12;
    expect(items[activeOutlineIndex(items, inUsage)]!.text).toBe('Usage');
  });
});
