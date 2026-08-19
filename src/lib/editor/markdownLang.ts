import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import type { Extension } from '@codemirror/state';

/**
 * Markdown language support. `markdownLanguage` is the GFM-enabled dialect
 * (tables, task lists, strikethrough, autolinks).
 *
 * `codeLanguages: languages` resolves highlighting for fenced blocks lazily —
 * a language package is only fetched when a document actually contains that
 * fence, which keeps the cold-start bundle small (ARCHITECTURE §7).
 */
export function markdownSupport(): Extension {
  return markdown({
    base: markdownLanguage,
    codeLanguages: languages,
    addKeymap: true
  });
}
