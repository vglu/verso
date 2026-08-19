import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from 'svelte';
import HeadingPalette from '../src/lib/components/HeadingPalette.svelte';
import { workspace } from '../src/lib/stores/workspace.svelte';

/**
 * The palette is opened by a keystroke and answered by a keystroke; if it
 * fails to render there is nothing on screen to say so, which is exactly the
 * kind of silence a test has to break.
 */

let instance: Record<string, unknown> | null = null;

afterEach(() => {
  if (instance) void unmount(instance);
  instance = null;
  document.body.innerHTML = '';
  workspace.setOutline([], -1);
});

function open(props: { onGo?: (pos: number) => void; onClose?: () => void } = {}) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  instance = mount(HeadingPalette, {
    target,
    props: { onGo: props.onGo ?? (() => {}), onClose: props.onClose ?? (() => {}) }
  }) as Record<string, unknown>;
  return target;
}

function type(target: HTMLElement, text: string): void {
  const field = target.querySelector('.field') as HTMLInputElement;
  field.value = text;
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

function press(target: HTMLElement, key: string): void {
  const field = target.querySelector('.field') as HTMLInputElement;
  field.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
}

const outline = [
  { level: 1, text: 'Data safety', from: 0 },
  { level: 2, text: 'Drafts', from: 100 },
  { level: 2, text: 'Everything about drafts', from: 200 }
];

describe('the go-to palette', () => {
  it('renders, and lists every heading before anything is typed', async () => {
    workspace.setOutline(outline, 0);
    const target = open();
    await vi.waitFor(() => expect(target.querySelectorAll('.row')).toHaveLength(3));
  });

  it('takes the focus, so typing goes into the field', async () => {
    workspace.setOutline(outline, 0);
    const target = open();
    await vi.waitFor(() => expect(document.activeElement).toBe(target.querySelector('.field')));
  });

  it('narrows as you type, and marks what matched', async () => {
    workspace.setOutline(outline, 0);
    const target = open();
    type(target, 'draft');

    await vi.waitFor(() => expect(target.querySelectorAll('.row')).toHaveLength(2));
    expect(target.querySelector('mark')?.textContent).toBe('Draft');
  });

  it('jumps to the selected heading on Enter', async () => {
    workspace.setOutline(outline, 0);
    const jumped: number[] = [];
    const target = open({ onGo: (pos) => jumped.push(pos) });

    type(target, 'draft');
    await vi.waitFor(() => expect(target.querySelectorAll('.row')).toHaveLength(2));
    press(target, 'Enter');

    // "Drafts" ranks above "Everything about drafts": the match is at its start.
    expect(jumped).toEqual([100]);
  });

  it('moves the highlight with the arrow keys', async () => {
    workspace.setOutline(outline, 0);
    const jumped: number[] = [];
    const target = open({ onGo: (pos) => jumped.push(pos) });

    await vi.waitFor(() => expect(target.querySelectorAll('.row')).toHaveLength(3));
    press(target, 'ArrowDown');
    press(target, 'Enter');

    expect(jumped).toEqual([100]);
  });

  it('closes on Escape without going anywhere', async () => {
    workspace.setOutline(outline, 0);
    let closed = 0;
    const jumped: number[] = [];
    const target = open({ onGo: (pos) => jumped.push(pos), onClose: () => (closed += 1) });

    await vi.waitFor(() => expect(target.querySelectorAll('.row')).toHaveLength(3));
    press(target, 'Escape');

    expect(closed).toBe(1);
    expect(jumped).toEqual([]);
  });

  it('says so when a document has no headings at all', async () => {
    const target = open();
    await vi.waitFor(() => expect(target.querySelector('.empty')).not.toBeNull());
  });
});
