import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A theme is one CSS file, applied over the built-in one.
 *
 * The two things that make it work are easy to break by accident: the theme
 * has to be the *last* stylesheet in the head or the built-in one wins, and a
 * theme that cannot be read has to leave the application in its own colours
 * rather than take it down.
 */

const files = new Map<string, string>();

vi.mock('../src/lib/ipc/commands', () => ({
  readTheme: vi.fn(async (path: string) => {
    const css = files.get(path);
    if (css === undefined) throw { kind: 'NotFound', path };
    return css;
  })
}));

const { applyUserThemeCss, clearUserTheme, loadUserTheme } =
  await import('../src/lib/ui/userTheme');

beforeEach(() => {
  files.clear();
  document.head.innerHTML = '';
});

afterEach(() => clearUserTheme());

function themeEl(): HTMLStyleElement | null {
  return document.getElementById('verso-user-theme') as HTMLStyleElement | null;
}

describe('applying a theme', () => {
  it('puts the CSS into the page', async () => {
    files.set('C:/themes/paper.css', ':root { --bg: #fdfaf3; }');
    const result = await loadUserTheme('C:/themes/paper.css');

    expect(result.ok).toBe(true);
    expect(themeEl()?.textContent).toContain('--bg: #fdfaf3');
  });

  it('is the last stylesheet, so it wins against the built-in theme', async () => {
    const builtin = document.createElement('style');
    document.head.appendChild(builtin);

    applyUserThemeCss(':root { --bg: red; }');
    expect(document.head.lastElementChild).toBe(themeEl());

    // A stylesheet added later during startup must not end up above it.
    document.head.appendChild(document.createElement('style'));
    applyUserThemeCss(':root { --bg: blue; }');
    expect(document.head.lastElementChild).toBe(themeEl());
  });

  it('replaces the previous theme instead of stacking them', async () => {
    files.set('a.css', ':root { --bg: red; }');
    files.set('b.css', ':root { --bg: blue; }');

    await loadUserTheme('a.css');
    await loadUserTheme('b.css');

    expect(document.querySelectorAll('#verso-user-theme')).toHaveLength(1);
    expect(themeEl()?.textContent).toContain('blue');
  });

  it('takes it off again', async () => {
    files.set('a.css', ':root { --bg: red; }');
    await loadUserTheme('a.css');

    clearUserTheme();

    expect(themeEl()).toBeNull();
  });
});

describe('a theme that has gone', () => {
  it('reports the failure and leaves the built-in colours in place', async () => {
    files.set('a.css', ':root { --bg: red; }');
    await loadUserTheme('a.css');

    const result = await loadUserTheme('moved.css');

    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
    // Not the old theme either: that would be someone else's colours.
    expect(themeEl()).toBeNull();
  });
});
