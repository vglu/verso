/**
 * The stylesheet an exported document carries with it.
 *
 * A plain string rather than a CSS file imported with `?raw`, because this is
 * the one place where a stylesheet failing to load is not a cosmetic problem:
 * it would produce an unstyled page in a file already sent to someone. A
 * string is in the bundle by construction — no build-tool feature involved,
 * and the test that checks the CSS is really there sees the same text the
 * reader gets.
 *
 * Separate from markdown.css on purpose. That one styles a CodeMirror
 * document — `.cm-line.md-h1`, decorations, widgets — and none of those
 * selectors exist in a plain HTML page. This is the same typography written
 * against ordinary elements.
 *
 * Colours come from tokens the exporter writes into `:root` at export time,
 * which is how a reader's own theme reaches the file they send someone.
 */
export const EXPORT_CSS = String.raw`
html {
  color-scheme: light dark;
}

body {
  margin: 0;
  padding: 3rem 1.5rem 6rem;
  background: var(--bg);
  color: var(--fg);
  font-family: var(--font-text);
  font-size: 16px;
  line-height: 1.7;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

/*
 * The same measure the application reads by, and for the same reason: a column
 * frozen at its narrowest leaves two thirds of a wide screen empty, and one
 * that fills that screen is two hundred characters wide. It grows with the
 * window to the width the reader chose, and stops there.
 */
.page {
  --page-cap: var(--page-width, 1400px);
  max-width: min(100%, clamp(min(760px, var(--page-cap)), 70%, var(--page-cap)));
  margin: 0 auto;
}

/* — Headings — */

h1,
h2,
h3,
h4,
h5,
h6 {
  color: var(--heading);
  font-weight: 650;
  line-height: 1.25;
  margin: 2em 0 0.6em;
  /* A heading belongs to what follows it. */
  break-after: avoid;
  page-break-after: avoid;
}

h1 {
  font-size: 1.9em;
  margin-top: 0;
}
h2 {
  font-size: 1.5em;
}
h3 {
  font-size: 1.24em;
}
h4 {
  font-size: 1.08em;
}
h5,
h6 {
  font-size: 1em;
  color: var(--fg-muted);
}

/* — Text — */

p {
  margin: 0 0 1.1em;
}

a {
  color: var(--accent);
  text-decoration: none;
  border-bottom: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
}

strong {
  font-weight: 650;
}

del {
  color: var(--fg-faint);
}

blockquote {
  margin: 1.4em 0;
  padding: 0.1em 0 0.1em 1.2em;
  border-left: 3px solid var(--quote-border);
  color: var(--fg-muted);
  font-style: italic;
}

hr {
  height: 0;
  margin: 2.4em 0;
  border: 0;
  border-top: 1px solid var(--border);
}

/* — Lists — */

ul,
ol {
  margin: 0 0 1.1em;
  padding-left: 1.6em;
}

li {
  margin: 0.25em 0;
}

li.task {
  list-style: none;
  margin-left: -1.3em;
}

li.task input {
  margin-right: 0.45em;
  accent-color: var(--accent);
}

/* — Code — */

code {
  font-family: var(--font-mono);
  font-size: 0.875em;
  background: var(--bg-code);
  padding: 0.12em 0.35em;
  border-radius: 4px;
}

pre {
  margin: 1.3em 0;
  padding: 0.9em 1.1em;
  background: var(--bg-code);
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow-x: auto;
  line-height: 1.55;
}

pre code {
  background: none;
  padding: 0;
  font-size: 0.86em;
}

/* — Tables — */

table {
  border-collapse: collapse;
  margin: 1.4em 0;
  font-size: 0.95em;
  line-height: 1.5;
}

th,
td {
  border: 1px solid var(--border);
  padding: 6px 12px;
  text-align: left;
  vertical-align: top;
  /* Never let a column be squeezed to one character wide. */
  min-width: 5em;
  overflow-wrap: break-word;
  word-break: normal;
}

th {
  background: var(--bg-panel);
  font-weight: 600;
  color: var(--fg-ui);
}

/* — Pictures, formulas, diagrams — */

img {
  max-width: 100%;
  height: auto;
  border-radius: 6px;
}

figure.diagram {
  margin: 1.6em 0;
  text-align: center;
}

figure.diagram svg {
  max-width: 100%;
  height: auto;
}

.math-display {
  margin: 1.5em 0;
  text-align: center;
  font-size: 1.05em;
}

.math-source {
  font-style: italic;
  color: var(--fg-muted);
}

/* — Print —
 *
 * The same page, on paper. Backgrounds go, because a printer will not thank
 * anyone for a full-bleed dark theme, and nothing is allowed to break across
 * a page in the middle of a table row or a code block. */

@media print {
  body {
    padding: 0;
    background: #ffffff;
    color: #111111;
    font-size: 11.5pt;
  }

  .page {
    max-width: none;
  }

  a {
    color: inherit;
    border-bottom: none;
  }

  /* The address of a link is lost on paper unless it is written out. */
  a[href^='http']::after {
    content: ' (' attr(href) ')';
    font-size: 0.85em;
    color: #555555;
    word-break: break-all;
  }

  pre,
  blockquote,
  table,
  figure,
  img,
  tr {
    break-inside: avoid;
    page-break-inside: avoid;
  }

  pre,
  code,
  th {
    background: #f6f6f6 !important;
    color: #111111;
  }

  @page {
    margin: 18mm 16mm;
  }
}
`;
