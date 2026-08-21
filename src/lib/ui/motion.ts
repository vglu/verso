/**
 * Shared entrance and exit transitions.
 *
 * Three rules hold everywhere here:
 *
 *  - an exit is always quicker than its entrance — the user has already
 *    decided, and the interface should get out of the way;
 *  - when the system asks for reduced motion the movement goes while the fade
 *    stays, because a state change still has to be readable;
 *  - the curve and the durations are the ones in `tokens.css`. A transition
 *    written in JavaScript and a transition written in CSS have to be the same
 *    transition, or the chrome animates in two dialects at once.
 *
 * Svelte's built-in transitions emit CSS, so these run off the main thread.
 */
import { fade, fly, scale, type TransitionConfig } from 'svelte/transition';

/**
 * `cubic-bezier()` as a function of time, so `--ease-out` can be handed to a
 * Svelte transition. Newton-Raphson on the x-axis, the way browsers do it:
 * eight iterations is well past the point where the error stops being visible
 * at 60fps.
 */
function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const a = (u: number, v: number): number => 1 - 3 * v + 3 * u;
  const b = (u: number, v: number): number => 3 * v - 6 * u;
  const c = (u: number): number => 3 * u;
  const at = (t: number, u: number, v: number): number => ((a(u, v) * t + b(u, v)) * t + c(u)) * t;
  const slope = (t: number, u: number, v: number): number =>
    3 * a(u, v) * t * t + 2 * b(u, v) * t + c(u);

  return (x: number): number => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i += 1) {
      const error = at(t, x1, x2) - x;
      if (Math.abs(error) < 1e-5) break;
      const d = slope(t, x1, x2);
      if (Math.abs(d) < 1e-6) break;
      t -= error / d;
    }
    return at(t, y1, y2);
  };
}

/** `--ease-out` from tokens.css: starts fast, which is when the eye is watching. */
export const easeOut = cubicBezier(0.23, 1, 0.32, 1);

/** Mirrors `--t-*` in tokens.css. Kept in one place so the two cannot drift. */
export const DURATION = {
  fast: 120,
  press: 140,
  med: 200,
  exit: 140,
  slow: 300
} as const;

export function prefersReducedMotion(): boolean {
  // Asked during a transition, so it must not be the thing that throws: a
  // host without matchMedia is a host that cannot state a preference, which
  // is the same as not having one.
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Modal panel: scales from its own centre, because it is not anchored to a trigger. */
export function modalIn(node: Element): TransitionConfig {
  if (prefersReducedMotion()) return fade(node, { duration: DURATION.exit });
  return scale(node, { start: 0.97, opacity: 0, duration: DURATION.med, easing: easeOut });
}

export function modalOut(node: Element): TransitionConfig {
  if (prefersReducedMotion()) return fade(node, { duration: 100 });
  // Less travel on the way out: leaving should feel like a dismissal, not a performance.
  return scale(node, { start: 0.98, opacity: 0, duration: DURATION.exit, easing: easeOut });
}

export function scrimIn(node: Element): TransitionConfig {
  return fade(node, { duration: DURATION.exit });
}

export function scrimOut(node: Element): TransitionConfig {
  return fade(node, { duration: 100 });
}

/**
 * Context menus grow out of the pointer.
 *
 * The scale is deliberately shallow and the element's own `transform-origin`
 * does the rest: the menu is anchored to the corner nearest the click, so it
 * appears to come from where the hand was, including when it had to flip up
 * or left to stay on screen.
 */
export function menuIn(node: Element): TransitionConfig {
  if (prefersReducedMotion()) return fade(node, { duration: DURATION.fast });
  return scale(node, { start: 0.96, opacity: 0, duration: DURATION.exit, easing: easeOut });
}

export function menuOut(node: Element): TransitionConfig {
  if (prefersReducedMotion()) return fade(node, { duration: 90 });
  return scale(node, { start: 0.97, opacity: 0, duration: 100, easing: easeOut });
}

/** Banners drop in from the edge they are attached to, and leave the same way. */
export function bannerIn(node: Element): TransitionConfig {
  if (prefersReducedMotion()) return fade(node, { duration: DURATION.exit });
  return fly(node, { y: -8, opacity: 0, duration: DURATION.med, easing: easeOut });
}

export function bannerOut(node: Element): TransitionConfig {
  if (prefersReducedMotion()) return fade(node, { duration: 100 });
  return fly(node, { y: -6, opacity: 0, duration: DURATION.exit, easing: easeOut });
}

/**
 * Reflow for keyed lists — the tab strip closing a tab in the middle.
 *
 * Movement is the whole point of it, so reduced motion does not soften it,
 * it removes it: the remaining items simply are where they now belong.
 */
export function flipMotion(): { duration: number; easing: (t: number) => number } {
  return { duration: prefersReducedMotion() ? 0 : 160, easing: easeOut };
}
