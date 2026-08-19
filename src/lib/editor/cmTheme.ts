import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import type { Extension } from '@codemirror/state';

/**
 * CodeMirror theme. Every value is a token so a user theme repaints the
 * editor along with the rest of the app (DESIGN-SYSTEM §2).
 */
const base = EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: 'var(--bg)',
    color: 'var(--fg)',
    fontFamily: 'var(--font-text)',
    fontSize: 'var(--font-size)'
  },
  '.cm-scroller': {
    fontFamily: 'var(--font-text)',
    lineHeight: 'var(--line-height)',
    overflowX: 'hidden',
    padding: 'var(--sp-6) 0 40vh'
  },
  '.cm-content': {
    maxWidth: 'var(--editor-max-width)',
    margin: '0 auto',
    padding: '0 var(--sp-6)',
    caretColor: 'var(--caret)'
  },
  '.cm-line': {
    padding: '0'
  },
  '&.cm-focused': {
    outline: 'none'
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--caret)',
    borderLeftWidth: '2px'
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'var(--selection)'
  },
  '.cm-selectionMatch': {
    backgroundColor: 'var(--accent-soft)'
  },
  '.cm-searchMatch': {
    backgroundColor: 'var(--search-match)',
    borderRadius: '2px'
  },
  '.cm-searchMatch.cm-searchMatch-selected': {
    backgroundColor: 'var(--search-match-current)'
  },
  '.cm-gutters': {
    display: 'none'
  },
  '.cm-activeLine': {
    backgroundColor: 'transparent'
  },
  '.cm-tooltip': {
    backgroundColor: 'var(--bg-panel)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-m)',
    color: 'var(--fg-ui)',
    boxShadow: 'var(--shadow-panel)'
  },

  // — Search panel: CodeMirror's own, dressed in our tokens —
  '.cm-panels': {
    backgroundColor: 'var(--bg-panel)',
    color: 'var(--fg-ui)',
    fontFamily: 'var(--font-ui)',
    fontSize: '13px'
  },
  '.cm-panels.cm-panels-top': {
    borderBottom: '1px solid var(--border)'
  },
  '.cm-panel.cm-search': {
    padding: 'var(--sp-2) var(--sp-3)',
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 'var(--sp-2)'
  },
  '.cm-panel.cm-search label': {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '12px',
    color: 'var(--fg-muted)'
  },
  '.cm-panel.cm-search input[type=text]': {
    padding: '4px 8px',
    minWidth: '180px',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-s)',
    backgroundColor: 'var(--bg)',
    color: 'var(--fg-ui)',
    fontFamily: 'var(--font-ui)',
    fontSize: '13px',
    outline: 'none'
  },
  '.cm-panel.cm-search input[type=text]:focus': {
    borderColor: 'var(--accent)'
  },
  '.cm-panel.cm-search button': {
    padding: '4px 10px',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-s)',
    backgroundColor: 'var(--bg)',
    backgroundImage: 'none',
    color: 'var(--fg-ui)',
    fontFamily: 'var(--font-ui)',
    fontSize: '12px',
    cursor: 'pointer'
  },
  '.cm-panel.cm-search button:hover': {
    backgroundColor: 'var(--bg-hover)'
  },
  '.cm-panel.cm-search button[name=close]': {
    border: 'none',
    background: 'transparent',
    color: 'var(--fg-muted)',
    fontSize: '16px',
    lineHeight: 1,
    padding: '2px 6px'
  }
});

/** Syntax colors for fenced code. */
const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.moduleKeyword, t.controlKeyword], color: 'var(--syn-keyword)' },
  { tag: [t.string, t.special(t.string), t.regexp], color: 'var(--syn-string)' },
  { tag: [t.number, t.bool, t.null, t.atom], color: 'var(--syn-number)' },
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: 'var(--syn-comment)' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: 'var(--syn-function)' },
  {
    tag: [t.typeName, t.className, t.namespace, t.definition(t.typeName)],
    color: 'var(--syn-type)'
  },
  { tag: [t.operator, t.punctuation, t.separator, t.bracket], color: 'var(--syn-operator)' },
  { tag: [t.propertyName, t.attributeName, t.tagName], color: 'var(--syn-property)' },
  { tag: [t.variableName, t.definition(t.variableName)], color: 'var(--fg)' },
  { tag: t.invalid, color: 'var(--danger)' }
]);

export function editorTheme(): Extension {
  return [base, syntaxHighlighting(highlight)];
}
