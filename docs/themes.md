# Writing a theme for Verso

A theme is **one CSS file**. It overrides design tokens; it never restyles
components directly. That is the whole contract — if a token exists for
something, changing it repaints every place that uses it, including the
editor, the sidebar, the tabs and the code highlighting.

```css
/* my-theme.css */
:root {
  --bg: #fdfaf3;
  --fg: #2b2118;
  --accent: #b5651d;
}
```

Choose your file in **Settings → Your own theme**. It is applied over the
built-in theme and remembered between sessions, and Verso watches it: save
the file in your editor and the window repaints, which is the difference
between writing a theme and guessing at one. `docs/themes/paper.css` is a
complete example to start from.

## Rules

1. **Only override tokens.** Never target internal class names other than the
   document classes listed below; everything else may change between releases.
2. **Define every token you change in both light and dark** if your theme
   supports both, using `:root` and `[data-theme='dark']`.
3. **Measure contrast.** Body text against `--bg` must reach at least 4.5:1.
   A theme that looks moody but cannot be read is a broken theme.
4. **No network.** Fonts and images must be local or data URIs; the app blocks
   outbound requests.

## Tokens

### Surfaces

| Token | Meaning |
| --- | --- |
| `--bg` | Document background |
| `--bg-app` | Application background around the document (tab strip, status bar) |
| `--bg-panel` | Sidebar, modals, search panel |
| `--bg-hover` | Hover wash over any surface |
| `--bg-active` | Pressed / selected wash |
| `--bg-code` | Code blocks, inline code, diagram frames |

### Text

| Token | Meaning |
| --- | --- |
| `--fg` | Document body text |
| `--fg-ui` | Interface text |
| `--fg-muted` | Secondary text, quotes |
| `--fg-faint` | Captions, placeholders, list markers |
| `--heading` | Heading color (defaults to `--fg`) |

### Accent and state

| Token | Meaning |
| --- | --- |
| `--accent` | Links, active tab marker, checkboxes, focus rings |
| `--accent-hover` | Accent on hover |
| `--accent-soft` | Translucent accent for selected rows |
| `--warning`, `--danger`, `--success` | Banner and badge colors |
| `--selection` | Text selection background |
| `--caret` | Caret color |
| `--search-match`, `--search-match-current` | Search highlighting |

### Structure

| Token | Meaning |
| --- | --- |
| `--border` | All hairlines |
| `--quote-border` | Blockquote rule |
| `--scrollbar`, `--scrollbar-hover` | Scrollbar thumb |
| `--shadow-panel` | Modal and floating panel shadow |

### Typography

| Token | Default |
| --- | --- |
| `--font-text` | Inter, system sans stack |
| `--font-ui` | Inherits `--font-text` |
| `--font-mono` | JetBrains Mono, system mono stack |
| `--font-size` | `16px` (user setting) |
| `--line-height` | `1.75` |
| `--editor-max-width` | `760px` (user setting) |

### Geometry and motion

`--radius-s|m|l`, `--sp-1` … `--sp-6`, `--ease`, `--t-fast|med|slow`.
Setting the duration tokens to `0ms` disables animation; the app already does
this automatically under `prefers-reduced-motion`.

### Code syntax

`--syn-keyword`, `--syn-string`, `--syn-number`, `--syn-comment`,
`--syn-function`, `--syn-type`, `--syn-operator`, `--syn-property`.

## Document classes

These are stable and safe to style for finer control. Renaming one is a
breaking change and will be called out in the changelog.

`.md-doc` · `.md-h1` … `.md-h6` · `.md-bold` · `.md-italic` · `.md-strike` ·
`.md-code` · `.md-link` · `.md-quote` · `.md-bullet` · `.md-li-num` ·
`.md-task` · `.md-task-done` · `.md-codeblock-line` · `.md-codeblock-first` ·
`.md-codeblock-last` · `.md-fence-chip` · `.md-hr` · `.md-img` ·
`.md-img-broken` · `.md-table` · `.md-table-wrap` · `.md-table-src` ·
`.md-math` · `.md-math-display` · `.md-mermaid` · `.md-html`

Heading and block classes are applied to the **line**, so they can change font
size, weight and margins.

## Example: a warm paper theme

```css
:root {
  --bg: #fbf7ef;
  --bg-app: #f3ece0;
  --bg-panel: #efe7d9;
  --bg-code: #f2ebdd;
  --fg: #33291d;
  --fg-ui: #4a3d2c;
  --fg-muted: #7a6a54;
  --fg-faint: #a3947c;
  --accent: #a2542a;
  --accent-hover: #8a4522;
  --accent-soft: rgba(162, 84, 42, 0.12);
  --border: rgba(51, 41, 29, 0.12);
  --quote-border: #d8c9ae;
  --font-text: 'Iowan Old Style', Georgia, serif;
  --line-height: 1.8;
}
```
