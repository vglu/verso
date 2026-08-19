import type { OutlineItem } from './outline';

/**
 * Finding a heading by typing part of its name.
 *
 * Shared by the go-to palette and the outline's filter box, so that typing the
 * same thing in either place finds the same headings — two matchers would
 * drift apart and the reader would have to learn both.
 *
 * The rule is deliberately literal: every whitespace-separated term must
 * appear in the heading. Subsequence matching ("fuzzy" in the editor sense)
 * finds far more than the reader asked for — `dsf` matching "Data safety
 * first" is a party trick that makes the list look random.
 */

export interface HeadingMatch {
  item: OutlineItem;
  /** Position in the unfiltered outline, so the caller can highlight it. */
  index: number;
  /** Character ranges that matched, for emphasis in the list. */
  ranges: [number, number][];
  score: number;
}

/** Matched ranges for one heading, or null when a term is missing. */
export function matchHeading(query: string, text: string): [number, number][] | null {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];

  const haystack = text.toLowerCase();
  const ranges: [number, number][] = [];

  for (const term of terms) {
    const at = haystack.indexOf(term);
    if (at < 0) return null;
    ranges.push([at, at + term.length]);
  }

  return mergeRanges(ranges);
}

function mergeRanges(ranges: [number, number][]): [number, number][] {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const range of sorted) {
    const last = out[out.length - 1];
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else out.push([...range] as [number, number]);
  }
  return out;
}

/**
 * The headings worth showing for this query, best first.
 *
 * An early match beats a late one, and a short heading beats a long one that
 * happens to contain the same words — a match at the start of "Drafts" is what
 * someone typing "draft" means, not "Everything we know about drafts".
 */
export function filterHeadings(items: readonly OutlineItem[], query: string): HeadingMatch[] {
  const matches: HeadingMatch[] = [];

  items.forEach((item, index) => {
    const ranges = matchHeading(query, item.text);
    if (!ranges) return;

    const first = ranges[0]?.[0] ?? 0;
    const atWordStart = first === 0 || /\s/.test(item.text[first - 1] ?? '');
    // With no query there is nothing to rank by, and the outline's own order
    // is the one the reader already has in their head.
    const score = ranges.length === 0 ? 0 : first + (atWordStart ? 0 : 4) + item.text.length * 0.02;
    matches.push({ item, index, ranges, score });
  });

  // A stable sort keeps document order among equally good matches, which is
  // the order the reader already knows from the outline.
  return matches.sort((a, b) => a.score - b.score);
}

/** Split a heading into matched and unmatched pieces, in order. */
export function splitByRanges(
  text: string,
  ranges: [number, number][]
): { text: string; hit: boolean }[] {
  const parts: { text: string; hit: boolean }[] = [];
  let at = 0;
  for (const [from, to] of ranges) {
    if (from > at) parts.push({ text: text.slice(at, from), hit: false });
    parts.push({ text: text.slice(from, to), hit: true });
    at = to;
  }
  if (at < text.length) parts.push({ text: text.slice(at), hit: false });
  return parts;
}
