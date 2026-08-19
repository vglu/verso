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
  '.cm-content ::selection, .cm-content::selection': {
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

  // — Search panel: ours (searchPanel.ts), dressed in our tokens —
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
    cursor: 'pointer',
    transition:
      'background-color var(--t-fast) var(--ease), transform var(--t-press) var(--ease-out)'
  },
  '.cm-panel.cm-search button:hover': {
    backgroundColor: 'var(--bg-hover)'
  },
  '.cm-panel.cm-search button:active': {
    transform: 'scale(var(--press-scale))'
  },
  '.cm-panel.cm-search button[name=close]': {
    border: 'none',
    background: 'transparent',
    color: 'var(--fg-muted)',
    fontSize: '16px',
    lineHeight: 1,
    padding: '2px 6px'
  },

  '.md-search': {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    padding: 'var(--sp-2) var(--sp-3)'
  },
  '.md-search-row': {
    display: 'flex',
    alignItems: 'center',
    gap: '6px'
  },
  '.md-search-field': {
    flex: '1 1 auto',
    minWidth: '120px'
  },
  '.md-search-count': {
    flexShrink: 0,
    minWidth: '84px',
    fontSize: '11.5px',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--fg-faint)'
  },
  '.md-search-count.none': {
    color: 'var(--warning)'
  },
  '.md-search-btn': {
    flexShrink: 0
  },
  '.md-search-flags': {
    display: 'flex',
    gap: 'var(--sp-3)'
  },
  '.md-search-toggle': {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '11.5px',
    color: 'var(--fg-muted)',
    cursor: 'pointer',
    userSelect: 'none'
  },
  '.md-search-hint': {
    fontSize: '11px',
    color: 'var(--fg-faint)',
    lineHeight: 1.4
  },

  // — Where the matches are, down the right-hand edge —
  '.md-search-rail': {
    position: 'absolute',
    right: '11px',
    bottom: 0,
    width: '5px',
    pointerEvents: 'none',
    zIndex: 4
  },
  '.md-search-tick': {
    position: 'absolute',
    right: 0,
    width: '5px',
    height: '2px',
    borderRadius: '1px',
    backgroundColor: 'var(--search-match-current)',
    opacity: 0.75
  },
  '.md-search-tick.current': {
    width: '9px',
    height: '3px',
    opacity: 1,
    backgroundColor: 'var(--accent)'
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
