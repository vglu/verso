import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from 'svelte';
import OutlinePanel from '../src/lib/components/OutlinePanel.svelte';
import { workspace } from '../src/lib/stores/workspace.svelte';

let instance: Record<string, unknown> | null = null;

afterEach(() => {
  if (instance) void unmount(instance);
  instance = null;
  document.body.innerHTML = '';
  workspace.setOutline([], -1);
});

const outline = [
  { level: 1, text: 'Data safety', from: 0 },
  { level: 2, text: 'Drafts', from: 100 },
  { level: 2, text: 'Everything about drafts', from: 200 },
  { level: 2, text: 'Conflicts', from: 300 }
];

function render(onReveal: (pos: number) => void = () => {}): HTMLElement {
  const target = document.createElement('div');
  document.body.appendChild(target);
  instance = mount(OutlinePanel, { target, props: { onRevealHeading: onReveal } }) as Record<
    string,
    unknown
  >;
  return target;
}

function filter(target: HTMLElement, text: string): void {
  const field = target.querySelector('.filter') as HTMLInputElement;
  field.value = text;
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('the outline panel', () => {
  it('lists the headings of the open document', async () => {
    workspace.setOutline(outline, 0);
    const target = render();
    await vi.waitFor(() => expect(target.querySelectorAll('.item')).toHaveLength(4));
  });

  it('narrows to what was typed, using the palette’s matcher', async () => {
    workspace.setOutline(outline, 0);
    const target = render();
    filter(target, 'draft');

    await vi.waitFor(() => expect(target.querySelectorAll('.item')).toHaveLength(2));
    expect(target.querySelector('mark')?.textContent).toBe('Draft');
  });

  it('keeps marking the section the reader is in, at its new place in the list', async () => {
    // The active heading is an index into the whole outline, and the filtered
    // list is shorter — highlighting by that index would mark the wrong row.
    workspace.setOutline(outline, 3); // "Conflicts"
    const target = render();
    filter(target, 'c');

    await vi.waitFor(() => {
      const rows = [...target.querySelectorAll('.item')];
      const active = rows.findIndex((r) => r.classList.contains('active'));
      expect(rows[active]?.textContent?.trim()).toContain('Conflicts');
    });
  });

  it('says when the filter matches nothing', async () => {
    workspace.setOutline(outline, 0);
    const target = render();
    filter(target, 'zzz');

    await vi.waitFor(() => {
      expect(target.querySelectorAll('.item')).toHaveLength(0);
      expect(target.querySelector('.hint')).not.toBeNull();
    });
  });

  it('offers no filter box for a document with only a few headings', async () => {
    workspace.setOutline(outline.slice(0, 2), 0);
    const target = render();
    await vi.waitFor(() => expect(target.querySelectorAll('.item')).toHaveLength(2));
    expect(target.querySelector('.filter')).toBeNull();
  });

  it('jumps to the heading that was clicked', async () => {
    workspace.setOutline(outline, 0);
    const jumped: number[] = [];
    const target = render((pos) => jumped.push(pos));

    await vi.waitFor(() => expect(target.querySelectorAll('.item')).toHaveLength(4));
    (target.querySelectorAll('.item')[2] as HTMLButtonElement).click();

    expect(jumped).toEqual([200]);
  });
});
