/**
 * Window zoom — the whole interface, not just the text.
 *
 * There is already a font size and a text width in the settings, and they are
 * typography: how a document should be set. Zoom is a different question,
 * asked by eyes and screens rather than by taste — everything gets larger, the
 * file tree and the outline and the status strip with it, exactly as it does
 * in a browser.
 *
 * The steps are a ladder rather than a percentage, so a keystroke always
 * lands somewhere sensible instead of drifting to 1.0999999.
 */
export const ZOOM_STEPS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3] as const;

export const DEFAULT_ZOOM = 1;

export function clampZoom(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_ZOOM;
  const first = ZOOM_STEPS[0]!;
  const last = ZOOM_STEPS[ZOOM_STEPS.length - 1]!;
  return Math.min(last, Math.max(first, value));
}

/**
 * The next rung up or down from where we are.
 *
 * A zoom that did not come from the ladder — an older settings file, or a
 * value typed by hand — steps to the nearest rung in the right direction
 * rather than being rounded first and then stepped, which would swallow the
 * keystroke.
 */
export function nextZoom(current: number, direction: 1 | -1): number {
  const value = clampZoom(current);
  if (direction === 1) {
    return ZOOM_STEPS.find((step) => step > value + 1e-6) ?? value;
  }
  return [...ZOOM_STEPS].reverse().find((step) => step < value - 1e-6) ?? value;
}

/** For the status strip: 1 → "100%", 1.25 → "125%". */
export function zoomLabel(value: number): string {
  return `${Math.round(clampZoom(value) * 100)}%`;
}
