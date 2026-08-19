/**
 * Keep the window frame in the same theme as the document.
 *
 * Windows draws the title bar itself, in whatever theme the system is set to.
 * A reader who chooses the light theme on a dark desktop gets a white document
 * under a black caption bar — the one part of the window the application has
 * not answered for. Telling the window which theme it is in fixes that on
 * Windows; on macOS and Linux it is either already right or ignored.
 */
export async function syncWindowTheme(theme: 'light' | 'dark'): Promise<void> {
  try {
    // Imported on demand so the settings store stays loadable outside Tauri
    // (unit tests, and the browser during `vite dev`).
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().setTheme(theme);
  } catch (e) {
    // A frame in the wrong colour is a blemish, not a failure: never let it
    // stop the theme from being applied to the document itself.
    console.warn('window theme sync failed', e);
  }
}
