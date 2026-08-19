/**
 * What jsdom is missing to run a component that animates.
 *
 * Both of these exist in the WebView the app actually runs in; stubbing them
 * here keeps the tests about behaviour rather than about the DOM
 * implementation underneath them.
 */

if (typeof window.matchMedia !== 'function') {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false
  })) as typeof window.matchMedia;
}

if (typeof Element.prototype.scrollIntoView !== 'function') {
  // jsdom has no layout, so there is nothing to scroll. Components call this
  // to keep the highlighted row visible; here it is simply a no-op.
  Element.prototype.scrollIntoView = () => {};
}

if (typeof Element.prototype.animate !== 'function') {
  // Svelte's transitions drive the Web Animations API. jsdom has no timeline,
  // so the stub reports a finished animation straight away — the element ends
  // up in its final state, which is what a test wants to assert against.
  Element.prototype.animate = function animate() {
    return {
      cancel: () => {},
      finish: () => {},
      pause: () => {},
      play: () => {},
      reverse: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      currentTime: 0,
      playState: 'finished',
      effect: { getComputedTiming: () => ({ duration: 0 }) },
      finished: Promise.resolve()
    } as unknown as Animation;
  };
}
