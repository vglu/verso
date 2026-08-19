import { syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';

export interface OutlineItem {
  level: number;
  text: string;
  from: number;
}

/**
 * Headings for the outline panel, read straight off the syntax tree —
 * no second Markdown parse, no regex scan of the whole document.
 */
export function extractOutline(state: EditorState): OutlineItem[] {
  const items: OutlineItem[] = [];

  syntaxTree(state).iterate({
    enter: (node) => {
      const atx = /^ATXHeading([1-6])$/.exec(node.name);
      const setext = /^SetextHeading([12])$/.exec(node.name);
      const match = atx ?? setext;
      if (!match) return;

      const raw = state.doc.sliceString(node.from, node.to);
      items.push({
        level: Number(match[1]),
        text: cleanHeadingText(raw),
        from: node.from
      });
      return false;
    }
  });

  return items;
}

/** Strip the syntax so the panel shows what the reader sees. */
export function cleanHeadingText(raw: string): string {
  return (
    raw
      .split('\n')[0]!
      // leading #s and trailing closing #s
      .replace(/^\s{0,3}#{1,6}\s*/, '')
      .replace(/\s+#+\s*$/, '')
      // inline emphasis, code and link syntax
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/_([^_]+)_/g, '$1')
      .replace(/~~([^~]+)~~/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .trim()
  );
}

/** The last heading at or above the given position — the "current section". */
export function activeOutlineIndex(items: OutlineItem[], pos: number): number {
  let index = -1;
  for (let i = 0; i < items.length; i++) {
    if (items[i]!.from <= pos) index = i;
    else break;
  }
  return index;
}
