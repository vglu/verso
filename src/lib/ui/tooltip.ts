/**
 * Tooltips.
 *
 * The native `title` attribute is the one place an operating system shows
 * through a program that has otherwise been drawn from scratch: it arrives
 * about a second late, in the system's font and the system's grey, and it
 * cannot say that `Ctrl+S` is a key rather than a word. This replaces it with
 * one shared element positioned against the trigger.
 *
 * Two behaviours are worth naming, because they are the whole reason a
 * tooltip feels fast or slow:
 *
 *  - The first tooltip waits. Half a second is long enough that passing the
 *    cursor over a toolbar on the way somewhere else never summons anything.
 *  - Every tooltip after it is instant, and does not animate at all. Once the
 *    reader has asked one question of a row of buttons they are asking the
 *    rest, and re-running the delay for each is what makes a toolbar feel
 *    unresponsive. The grace window closes shortly after the pointer leaves.
 *
 * Only a mouse opens them. Touch has no hover, and a long-press tooltip on a
 * button that also acts on press is a trap.
 */

export interface TipContent {
  text: string;
  /** Drawn as a key, quieter than the label. */
  shortcut?: string;
}

export type TipParam = string | TipContent | null | undefined;

const ID = 'verso-tooltip';
/** Long enough to cross a toolbar without summoning anything. */
const DELAY = 500;
/** How long the toolbar stays "warm" after a tooltip closes. */
const GRACE = 300;
/** Distance from the trigger, and from the window's edges. */
const GAP = 8;
const EDGE = 8;

let host: HTMLDivElement | null = null;
let labelEl: HTMLSpanElement | null = null;
let keyEl: HTMLSpanElement | null = null;
let owner: HTMLElement | null = null;
let showTimer = 0;
let hideTimer = 0;
let lastHidden = 0;

function normalise(param: TipParam): TipContent | null {
  if (!param) return null;
  if (typeof param === 'string') return param.trim() ? { text: param } : null;
  return param.text.trim() ? param : null;
}

function ensureHost(): HTMLDivElement {
  if (host) return host;

  host = document.createElement('div');
  host.id = ID;
  host.className = 'tooltip';
  host.setAttribute('role', 'tooltip');
  host.hidden = true;

  labelEl = document.createElement('span');
  keyEl = document.createElement('span');
  keyEl.className = 'tip-key';
  host.append(labelEl, keyEl);
  document.body.appendChild(host);

  // Anything that moves the trigger or takes the window away closes it: a
  // tooltip pointing at where a button used to be is worse than none.
  window.addEventListener('scroll', () => hide(), true);
  window.addEventListener('blur', () => hide());
  window.addEventListener('resize', () => hide());
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') hide();
  });

  return host;
}

/** Point the scale at the trigger, not at the middle of a clamped tooltip. */
function place(node: HTMLElement): void {
  if (!host) return;
  const rect = node.getBoundingClientRect();
  const width = host.offsetWidth;
  const height = host.offsetHeight;

  let top = rect.bottom + GAP;
  let placement = 'bottom';
  if (top + height > window.innerHeight - EDGE && rect.top - GAP - height >= EDGE) {
    top = rect.top - GAP - height;
    placement = 'top';
  }

  const centre = rect.left + rect.width / 2;
  const left = Math.min(Math.max(EDGE, centre - width / 2), window.innerWidth - width - EDGE);

  host.style.left = `${Math.round(left)}px`;
  host.style.top = `${Math.round(top)}px`;
  host.style.setProperty('--tip-origin-x', `${Math.round(centre - left)}px`);
  host.dataset.placement = placement;
}

function show(node: HTMLElement, content: TipContent, instant: boolean): void {
  const el = ensureHost();
  window.clearTimeout(hideTimer);

  labelEl!.textContent = content.text;
  keyEl!.textContent = content.shortcut ?? '';
  el.hidden = false;
  // An instant tooltip is instant in both senses: no delay, and no animation.
  el.classList.toggle('is-instant', instant);
  el.classList.remove('is-visible');

  place(node);
  void el.offsetWidth; // commit the start state before the class flips it
  el.classList.add('is-visible');

  owner = node;
  if (describes(node, content)) node.setAttribute('aria-describedby', ID);
}

/**
 * A description that repeats the name is noise in a screen reader, and most of
 * these tooltips exist to name an icon that already carries an `aria-label`.
 */
function describes(node: HTMLElement, content: TipContent): boolean {
  const name = node.getAttribute('aria-label') ?? node.textContent ?? '';
  return name.trim() !== content.text.trim();
}

function hide(): void {
  window.clearTimeout(showTimer);
  if (!host || !owner) return;

  owner.removeAttribute('aria-describedby');
  owner = null;
  host.classList.remove('is-visible');
  lastHidden = Date.now();

  const el = host;
  hideTimer = window.setTimeout(() => {
    if (!owner) el.hidden = true;
  }, 150);
}

/**
 * Svelte action. `use:tip={'Open'}` or `use:tip={{ text: 'Save', shortcut: 'Ctrl+S' }}`.
 */
export function tip(
  node: HTMLElement,
  param: TipParam
): { update(next: TipParam): void; destroy(): void } {
  let content = normalise(param);

  const open = (instant: boolean): void => {
    if (content) show(node, content, instant);
  };

  const onEnter = (event: PointerEvent): void => {
    if (event.pointerType !== 'mouse' || !content) return;
    window.clearTimeout(showTimer);
    if (Date.now() - lastHidden < GRACE) {
      open(true);
      return;
    }
    showTimer = window.setTimeout(() => open(false), DELAY);
  };

  const onLeave = (): void => {
    window.clearTimeout(showTimer);
    if (owner === node) hide();
  };

  // Pressing the thing the tooltip describes answers the question it was
  // asking, so it gets out of the way immediately.
  const onDown = (): void => onLeave();

  const onFocus = (): void => {
    if (!content) return;
    // Keyboard focus is deliberate; it does not need talking out of.
    if (node.matches(':focus-visible')) open(true);
  };

  node.addEventListener('pointerenter', onEnter);
  node.addEventListener('pointerleave', onLeave);
  node.addEventListener('pointerdown', onDown);
  node.addEventListener('focus', onFocus);
  node.addEventListener('blur', onLeave);

  return {
    update(next: TipParam): void {
      content = normalise(next);
      if (owner === node) {
        if (!content) hide();
        else show(node, content, true);
      }
    },
    destroy(): void {
      node.removeEventListener('pointerenter', onEnter);
      node.removeEventListener('pointerleave', onLeave);
      node.removeEventListener('pointerdown', onDown);
      node.removeEventListener('focus', onFocus);
      node.removeEventListener('blur', onLeave);
      onLeave();
    }
  };
}
