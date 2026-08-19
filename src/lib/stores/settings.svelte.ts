/**
 * Settings store (Svelte 5 runes) + theme application.
 * The theme value is mirrored into localStorage so index.html can paint the
 * right background before the first frame (anti-FOUC).
 */
import { DEFAULT_SETTINGS, type Settings, type ThemeSetting } from '../ipc/types';
import { settingsLoad, settingsSave } from '../ipc/commands';
import { setLang } from './i18n';
import { THEME_CHANGED_EVENT } from '../editor/livePreview/richWidgets';

const THEME_MIRROR_KEY = 'mdviewer.theme';

class SettingsStore {
  value = $state<Settings>({ ...DEFAULT_SETTINGS });
  loaded = $state(false);

  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private mediaQuery: MediaQueryList | null = null;

  async load(): Promise<void> {
    try {
      const loaded = await settingsLoad();
      this.value = { ...DEFAULT_SETTINGS, ...loaded };
    } catch (e) {
      console.warn('settings load failed, using defaults', e);
    }
    this.loaded = true;
    setLang(this.value.uiLang);
    this.applyTheme(false);
    this.applyTypography();
    this.watchSystemTheme();
  }

  /** Patch settings, apply side effects, persist (debounced). */
  update(patch: Partial<Settings>): void {
    const themeChanged = patch.theme !== undefined && patch.theme !== this.value.theme;
    this.value = { ...this.value, ...patch };

    if (themeChanged) this.applyTheme(true);
    if (patch.uiLang !== undefined) setLang(this.value.uiLang);
    if (patch.editorFontSize !== undefined || patch.editorMaxWidth !== undefined) {
      this.applyTypography();
    }
    this.persist();
  }

  private persist(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      settingsSave($state.snapshot(this.value)).catch((e) =>
        console.warn('settings save failed', e)
      );
    }, 300);
  }

  /** Flush pending writes (called before the window closes). */
  async flush(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    try {
      await settingsSave($state.snapshot(this.value));
    } catch (e) {
      console.warn('settings flush failed', e);
    }
  }

  resolvedTheme(): 'light' | 'dark' {
    return resolveTheme(this.value.theme);
  }

  applyTheme(animate: boolean): void {
    const resolved = resolveTheme(this.value.theme);
    const root = document.documentElement;

    if (animate) {
      root.classList.add('theme-transition');
      window.setTimeout(() => root.classList.remove('theme-transition'), 350);
    }
    const previous = root.getAttribute('data-theme');
    root.setAttribute('data-theme', resolved);
    try {
      localStorage.setItem(THEME_MIRROR_KEY, this.value.theme);
    } catch {
      /* private mode — the app still works, just without anti-FOUC */
    }

    // Open editors re-render theme-dependent content (Mermaid bakes colors in).
    if (previous !== resolved) {
      window.dispatchEvent(new CustomEvent(THEME_CHANGED_EVENT));
    }
  }

  private applyTypography(): void {
    const root = document.documentElement;
    root.style.setProperty('--font-size', `${this.value.editorFontSize}px`);
    root.style.setProperty('--editor-max-width', `${this.value.editorMaxWidth}px`);
  }

  private watchSystemTheme(): void {
    if (this.mediaQuery) return;
    this.mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    this.mediaQuery.addEventListener('change', () => {
      if (this.value.theme === 'system') this.applyTheme(true);
    });
  }

  /** Add a path to the recent list (most recent first, max 10). */
  pushRecent(path: string): void {
    const next = [path, ...this.value.recentFiles.filter((p) => p !== path)].slice(0, 10);
    this.update({ recentFiles: next });
  }
}

function resolveTheme(setting: ThemeSetting): 'light' | 'dark' {
  if (setting === 'light' || setting === 'dark') return setting;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export const settings = new SettingsStore();
