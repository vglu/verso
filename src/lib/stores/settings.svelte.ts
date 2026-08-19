/**
 * Settings store (Svelte 5 runes) + theme application.
 * The theme value is mirrored into localStorage so index.html can paint the
 * right background before the first frame (anti-FOUC).
 */
import { DEFAULT_SETTINGS, type Settings, type ThemeSetting } from '../ipc/types';
import { setMenuLabels, settingsLoad, settingsSave } from '../ipc/commands';
import { getLang, menuLabels, setLang } from './i18n';
import { clearUserTheme, loadUserTheme } from '../ui/userTheme';
import { syncWindowTheme } from '../ui/windowTheme';
import { clampZoom, DEFAULT_ZOOM, nextZoom } from '../ui/zoom';
import { THEME_CHANGED_EVENT } from '../editor/livePreview/richWidgets';

const THEME_MIRROR_KEY = 'verso.theme';

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
    this.syncMenuLanguage();
    this.applyTheme(false);
    this.applyTypography();
    this.applyZoom();
    this.watchSystemTheme();
    void this.applyUserTheme();
  }

  /** The user's own theme file, if they have chosen one. */
  themeError = $state<string | null>(null);

  async applyUserTheme(): Promise<void> {
    const path = this.value.themeFile;
    if (!path) {
      clearUserTheme();
      this.themeError = null;
      return;
    }

    const result = await loadUserTheme(path);
    // A theme that has been moved or deleted leaves the application in its
    // built-in colours and says so, rather than failing silently or refusing
    // to start.
    this.themeError = result.ok ? null : (result.error ?? 'failed');
  }

  /** Choose, replace or remove the user's theme. */
  setThemeFile(path: string | null): void {
    this.value = { ...this.value, themeFile: path };
    void this.applyUserTheme();
    this.persist();
  }

  /** Patch settings, apply side effects, persist (debounced). */
  update(patch: Partial<Settings>): void {
    const themeChanged = patch.theme !== undefined && patch.theme !== this.value.theme;
    this.value = { ...this.value, ...patch };

    if (themeChanged) this.applyTheme(true);
    if (patch.uiLang !== undefined) {
      setLang(this.value.uiLang);
      this.syncMenuLanguage();
    }
    if (patch.editorFontSize !== undefined || patch.editorMaxWidth !== undefined) {
      this.applyTypography();
    }
    if (patch.zoom !== undefined) this.applyZoom();
    this.persist();
  }

  /**
   * Hand the native menu its labels in the current language.
   *
   * The menu is built in Rust, before the frontend knows anything, so it
   * starts out in English and is re-labelled the moment the settings are
   * loaded. Failing is not worth interrupting anyone over: an English menu is
   * a blemish, not a broken application.
   */
  private syncMenuLanguage(): void {
    // Rust builds the menu in English, so an English window needs nothing —
    // and rebuilding a native menu bar is not free, least of all while the
    // first document is trying to paint.
    if (getLang() === 'en') return;

    // Off the startup path either way: nobody reads the menu bar in the frame
    // where their document appears.
    setTimeout(() => {
      void setMenuLabels(menuLabels()).catch((e) => console.warn('menu labels failed', e));
    }, 0);
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
    void syncWindowTheme(resolved);
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

  /** One rung up or down the zoom ladder; `null` resets to 100%. */
  stepZoom(direction: 1 | -1 | null): void {
    const zoom = direction === null ? DEFAULT_ZOOM : nextZoom(this.value.zoom, direction);
    if (zoom === this.value.zoom) return;
    this.update({ zoom });
  }

  /**
   * Hand the zoom to the webview.
   *
   * Done through the webview rather than by scaling CSS, so it behaves the way
   * a browser's zoom does — text reflows at the new size instead of the layout
   * being stretched, and nothing has to know it is being zoomed.
   */
  private applyZoom(): void {
    const zoom = clampZoom(this.value.zoom);
    void (async () => {
      try {
        const { getCurrentWebview } = await import('@tauri-apps/api/webview');
        await getCurrentWebview().setZoom(zoom);
      } catch (e) {
        // Outside Tauri (vite dev in a browser) there is no webview to zoom.
        console.warn('zoom failed', e);
      }
    })();
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
