/**
 * Shared entrance and exit transitions.
 *
 * Two rules hold everywhere here: an exit is always quicker than its
 * entrance (the user has already decided; the interface should get out of
 * the way), and when the system asks for reduced motion the movement goes
 * while the fade stays — a state change still has to be readable.
 *
 * Svelte's built-in transitions emit CSS, so these run off the main thread.
 */
import { cubicOut } from 'svelte/easing';
import { fade, fly, scale, type TransitionConfig } from 'svelte/transition';

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** Modal panel: scales from its own centre, because it is not anchored to a trigger. */
export function modalIn(node: Element): TransitionConfig {
  if (prefersReducedMotion()) return fade(node, { duration: 140 });
  return scale(node, { start: 0.97, opacity: 0, duration: 200, easing: cubicOut });
}

export function modalOut(node: Element): TransitionConfig {
  if (prefersReducedMotion()) return fade(node, { duration: 100 });
  // Less travel on the way out: leaving should feel like a dismissal, not a performance.
  return scale(node, { start: 0.98, opacity: 0, duration: 140, easing: cubicOut });
}

export function scrimIn(node: Element): TransitionConfig {
  return fade(node, { duration: 140 });
}

export function scrimOut(node: Element): TransitionConfig {
  return fade(node, { duration: 100 });
}

/** Banners drop in from the edge they are attached to, and leave the same way. */
export function bannerIn(node: Element): TransitionConfig {
  if (prefersReducedMotion()) return fade(node, { duration: 140 });
  return fly(node, { y: -8, opacity: 0, duration: 200, easing: cubicOut });
}

export function bannerOut(node: Element): TransitionConfig {
  if (prefersReducedMotion()) return fade(node, { duration: 100 });
  return fly(node, { y: -6, opacity: 0, duration: 140, easing: cubicOut });
}
