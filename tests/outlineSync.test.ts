import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createOutlineSync, type OutlineSource } from '../src/lib/editor/outlineSync';
import type { OutlineItem } from '../src/lib/editor/outline';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const headings: Record<string, OutlineItem[]> = {
  visible: [{ level: 1, text: 'On screen', from: 0 }],
  background: [{ level: 1, text: 'Somewhere else', from: 0 }]
};

function harness(activeId: string) {
  let active = activeId;
  const applied: { items: OutlineItem[]; index: number }[] = [];

  const source: OutlineSource = {
    activeId: () => active,
    outlineOf: (id) => headings[id] ?? null,
    activeIndexOf: () => 0
  };

  const sync = createOutlineSync(source, (items, index) => applied.push({ items, index }));
  return { sync, applied, switchTo: (id: string) => (active = id) };
}

describe('the outline follows the document in front of the reader', () => {
  it('builds it for the active document', () => {
    const { sync, applied } = harness('visible');
    sync.schedule('visible');
    vi.runAllTimers();

    expect(applied.at(-1)?.items).toEqual(headings.visible);
  });

  it('is not cancelled by a document nobody is looking at', () => {
    // The bug this exists for: eight tabs restore at once, each finishes
    // parsing and asks for a refresh, and the last one to ask is in the
    // background. It cleared the pending timer and then declined to do the
    // work, so the panel said the document had no headings.
    const { sync, applied } = harness('visible');
    sync.schedule('visible');
    sync.schedule('background');
    vi.runAllTimers();

    expect(applied.at(-1)?.items).toEqual(headings.visible);
  });

  it('shows the new document immediately when tabs are switched', () => {
    const { sync, applied, switchTo } = harness('visible');
    switchTo('background');
    sync.schedule('background');
    sync.flush();

    // No timer has run yet, and the panel is already correct.
    expect(applied.at(-1)?.items).toEqual(headings.background);
  });

  it('does nothing once disposed', () => {
    const { sync, applied } = harness('visible');
    sync.schedule('visible');
    sync.dispose();
    vi.runAllTimers();

    expect(applied).toHaveLength(0);
  });

  it('survives a document closing between the ask and the answer', () => {
    const { sync, applied, switchTo } = harness('visible');
    sync.schedule('visible');
    switchTo('gone');
    vi.runAllTimers();

    expect(applied).toHaveLength(0);
  });
});
