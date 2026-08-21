/**
 * Run something once the frame that is on its way has been painted.
 *
 * `requestAnimationFrame` is not it: the callback runs *before* the paint, so
 * work started there still delays the pixels. The timeout inside it lands
 * after the frame has been handed to the compositor, which is what "later"
 * has to mean for anything the reader is not waiting for.
 */
export function afterPaint(run: () => void): void {
  if (typeof requestAnimationFrame !== 'function') {
    setTimeout(run, 0);
    return;
  }
  requestAnimationFrame(() => setTimeout(run, 0));
}
