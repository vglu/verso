/**
 * The tooltip's timing is the whole feature.
 *
 * A tooltip that appears too eagerly follows the cursor around like a fly, and
 * one that re-runs its delay for every button in a row makes a toolbar feel
 * unresponsive. Both are timing, both are invisible in a screenshot, and both
 * are what these tests hold in place.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tip } from '../src/lib/ui/tooltip';

const DELAY = 500;
const GRACE = 300;

const made: HTMLElement[] = [];

function trigger(label?: string): HTMLButtonElement {
  const node = document.createElement('button');
  if (label) node.setAttribute('aria-label', label);
  document.body.appendChild(node);
  made.push(node);
  return node;
}

function hover(node: HTMLElement, type: 'mouse' | 'touch' = 'mouse'): void {
  const event = new Event('pointerenter') as Event & { pointerType: string };
  event.pointerType = type;
  node.dispatchEvent(event);
}

function leave(node: HTMLElement): void {
  node.dispatchEvent(new Event('pointerleave'));
}

const host = (): HTMLElement | null => document.getElementById('verso-tooltip');
const visible = (): boolean => host()?.classList.contains('is-visible') ?? false;

describe('tooltip', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Past the grace window left by whatever ran before.
    vi.advanceTimersByTime(GRACE * 4);
  });

  afterEach(() => {
    vi.useRealTimers();
    // Only the triggers: the tooltip host is a singleton and lives on, the
    // same way it does in the application.
    made.splice(0).forEach((el) => el.remove());
  });

  it('waits before the first one, so crossing a toolbar summons nothing', () => {
    const node = trigger();
    const action = tip(node, 'Save');

    hover(node);
    vi.advanceTimersByTime(DELAY - 50);
    expect(visible()).toBe(false);

    vi.advanceTimersByTime(60);
    expect(visible()).toBe(true);
    expect(host()?.textContent).toContain('Save');

    action.destroy();
  });

  it('leaving before the delay is up cancels it', () => {
    const node = trigger();
    const action = tip(node, 'Save');

    hover(node);
    vi.advanceTimersByTime(200);
    leave(node);
    vi.advanceTimersByTime(DELAY);

    expect(visible()).toBe(false);
    action.destroy();
  });

  it('the next button in the row answers instantly, and without animating', () => {
    const first = trigger();
    const second = trigger();
    const a = tip(first, 'Undo');
    const b = tip(second, 'Redo');

    hover(first);
    vi.advanceTimersByTime(DELAY);
    expect(visible()).toBe(true);

    leave(first);
    vi.advanceTimersByTime(50); // still warm
    hover(second);

    expect(visible()).toBe(true);
    expect(host()?.textContent).toContain('Redo');
    expect(host()?.classList.contains('is-instant')).toBe(true);

    a.destroy();
    b.destroy();
  });

  it('goes cold again once the pointer has been away long enough', () => {
    const first = trigger();
    const second = trigger();
    const a = tip(first, 'Undo');
    const b = tip(second, 'Redo');

    hover(first);
    vi.advanceTimersByTime(DELAY);
    leave(first);
    vi.advanceTimersByTime(GRACE + 100);

    hover(second);
    expect(visible()).toBe(false);
    vi.advanceTimersByTime(DELAY);
    expect(visible()).toBe(true);

    a.destroy();
    b.destroy();
  });

  it('never opens on touch, where a hover is really a press', () => {
    const node = trigger();
    const action = tip(node, 'Save');

    hover(node, 'touch');
    vi.advanceTimersByTime(DELAY * 2);

    expect(visible()).toBe(false);
    action.destroy();
  });

  it('describes an icon, and does not repeat a name it already has', () => {
    const icon = trigger('Close tab');
    const named = trigger('Save');

    const a = tip(icon, { text: 'The full path', shortcut: 'Ctrl+P' });
    hover(icon);
    vi.advanceTimersByTime(DELAY);
    expect(icon.getAttribute('aria-describedby')).toBe('verso-tooltip');
    expect(host()?.textContent).toContain('Ctrl+P');
    leave(icon);
    a.destroy();

    const b = tip(named, 'Save');
    hover(named);
    vi.advanceTimersByTime(DELAY);
    // The label already says "Save"; a description repeating it is noise.
    expect(named.hasAttribute('aria-describedby')).toBe(false);
    leave(named);
    b.destroy();
  });

  it('lets go of the trigger when the element it was attached to disappears', () => {
    const node = trigger();
    const action = tip(node, 'Save');

    hover(node);
    vi.advanceTimersByTime(DELAY);
    expect(visible()).toBe(true);

    action.destroy();
    expect(visible()).toBe(false);
    expect(node.hasAttribute('aria-describedby')).toBe(false);
  });
});
