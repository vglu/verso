import { readTheme } from '../ipc/commands';

/**
 * A theme the user wrote: one CSS file, applied over the built-in one.
 *
 * The contract is in docs/themes.md and it is narrow on purpose — a theme
 * overrides design tokens, it does not restyle components. That is what makes
 * a theme survive the next version of the application, and it is why this can
 * be as simple as appending a stylesheet: tokens are read by everything, so
 * changing them repaints everything.
 *
 * Appended last so it wins the cascade against the built-in themes, and given
 * an id so applying a different one replaces it rather than stacking.
 */

const ELEMENT_ID = 'mdviewer-user-theme';

export function clearUserTheme(): void {
  document.getElementById(ELEMENT_ID)?.remove();
}

export function applyUserThemeCss(css: string): void {
  let style = document.getElementById(ELEMENT_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = ELEMENT_ID;
    document.head.appendChild(style);
  }
  // Last in the head, always: a stylesheet added later during startup would
  // otherwise sit above it and win.
  if (style !== document.head.lastElementChild) document.head.appendChild(style);
  style.textContent = css;
}

/**
 * Read a theme file and apply it.
 *
 * Returns the failure rather than throwing: a theme that has been moved or
 * deleted should leave the application in its built-in colours with something
 * to say, not stop it from starting.
 */
export async function loadUserTheme(path: string): Promise<{ ok: boolean; error?: string }> {
  try {
    applyUserThemeCss(await readTheme(path));
    return { ok: true };
  } catch (error) {
    clearUserTheme();
    return { ok: false, error: String(error) };
  }
}
