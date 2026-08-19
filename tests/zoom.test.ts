import { describe, expect, it } from 'vitest';
import { clampZoom, DEFAULT_ZOOM, nextZoom, ZOOM_STEPS, zoomLabel } from '../src/lib/ui/zoom';

describe('the zoom ladder', () => {
  it('steps up and down through the rungs', () => {
    expect(nextZoom(1, 1)).toBe(1.1);
    expect(nextZoom(1.1, 1)).toBe(1.25);
    expect(nextZoom(1, -1)).toBe(0.9);
    expect(nextZoom(0.9, -1)).toBe(0.8);
  });

  it('stops at both ends rather than wrapping or drifting', () => {
    const smallest = ZOOM_STEPS[0]!;
    const largest = ZOOM_STEPS[ZOOM_STEPS.length - 1]!;
    expect(nextZoom(smallest, -1)).toBe(smallest);
    expect(nextZoom(largest, 1)).toBe(largest);
  });

  it('takes a value that is not on the ladder to the next rung, not the nearest', () => {
    // A settings file written by hand, or by an older version. Rounding first
    // and stepping afterwards would swallow the keystroke.
    expect(nextZoom(1.13, 1)).toBe(1.25);
    expect(nextZoom(1.13, -1)).toBe(1.1);
  });

  it('refuses nonsense instead of passing it to the webview', () => {
    expect(clampZoom(Number.NaN)).toBe(DEFAULT_ZOOM);
    expect(clampZoom(0)).toBe(ZOOM_STEPS[0]);
    expect(clampZoom(1000)).toBe(ZOOM_STEPS[ZOOM_STEPS.length - 1]);
  });

  it('reads as a percentage', () => {
    expect(zoomLabel(1)).toBe('100%');
    expect(zoomLabel(1.25)).toBe('125%');
    expect(zoomLabel(0.67)).toBe('67%');
  });
});
