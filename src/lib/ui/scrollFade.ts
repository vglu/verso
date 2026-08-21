/**
 * Tell a horizontal strip to admit that it has more in it.
 *
 * The tab strip and the toolbar both scroll sideways with the scrollbar
 * hidden, which means that in a narrow window content simply stops at the
 * edge: buttons are cut in half by a hard border and nothing says there are
 * more. This marks the element with which sides still have content past them,
 * and the stylesheet fades those edges — the oldest signal there is for
 * "keep going".
 *
 * `scrollWidth` changes when children come and go, not only when the box is
 * resized, so a tab opening has to be observed too.
 */
export function scrollFade(node: HTMLElement): { destroy(): void } {
  let frame = 0;

  const measure = (): void => {
    frame = 0;
    const max = node.scrollWidth - node.clientWidth;
    const start = node.scrollLeft > 1;
    const end = node.scrollLeft < max - 1;
    node.dataset.overflow = start && end ? 'both' : start ? 'start' : end ? 'end' : 'none';
  };

  const schedule = (): void => {
    if (frame) return;
    frame = requestAnimationFrame(measure);
  };

  node.addEventListener('scroll', schedule, { passive: true });
  // jsdom, where the component tests run, has no ResizeObserver; the strip
  // simply never re-measures on resize there, which is all a test needs.
  const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
  resize?.observe(node);
  const mutations = new MutationObserver(schedule);
  mutations.observe(node, { childList: true, subtree: true, characterData: true });
  measure();

  return {
    destroy(): void {
      if (frame) cancelAnimationFrame(frame);
      node.removeEventListener('scroll', schedule);
      resize?.disconnect();
      mutations.disconnect();
    }
  };
}
