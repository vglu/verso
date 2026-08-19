# Changelog

All notable changes to Verso are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versions follow [Semantic Versioning](https://semver.org/).

## [0.1.0] — 2026-08-19

First working release: open a Markdown file and read it beautifully, edit it
in place, and never lose a byte.

### Added

**Shell**

- Tauri 2 application for Windows, macOS and Linux; 3.8 MB installer, ~40 MB
  of memory, using the system webview rather than a bundled browser.
- File association for `.md`, `.markdown`, `.mdown`, `.mkd`.
- Single instance: a second double-click opens a tab in the running window
  instead of starting another copy.
- Native menu with standard accelerators; drag and drop onto the window.
- Window geometry is restored between runs.

**Reading and editing**

- Live preview built on CodeMirror 6: Markdown renders in place, and the raw
  syntax appears only on the line the caret touches — and only once you start
  interacting, so a freshly opened document is a clean reading surface.
- CommonMark + GFM: headings, emphasis, strikethrough, inline and fenced code
  with syntax highlighting, links, images, blockquotes, lists, task lists with
  clickable checkboxes, horizontal rules.
- Tables render as real tables with column alignment and inline formatting
  inside cells; clicking a cell drops the caret into the matching source.
- Math via KaTeX (`$inline$`, `$$display$$`) and diagrams via Mermaid, both
  loaded lazily so documents without them pay nothing.
- Reader mode (`Ctrl+E`).
- Find and replace, with a match count, marks down the right-hand edge showing
  where the matches are, and a note that the search reads the Markdown source.
- Section folding: a heading owns everything under it until the next heading of
  the same rank or higher. Fold All / Unfold All in the View menu.
- Go to heading (`Ctrl+P`) — type part of a heading; the outline panel filters
  with the same matcher.
- Keyboard model for tables: Tab and Shift+Tab walk the cells, Escape steps
  out, and Tab in the last cell adds a row that copies the shape of the one
  above it, so hand-aligned tables stay aligned and ragged ones stay ragged.
- YAML front matter is recognised as metadata: styled as a block, and kept out
  of the outline instead of parsing as a heading.

**Workspace**

- Tabs with unsaved indicators, middle-click close, `Ctrl+1…9` switching, and a
  right-click menu: close, close others, close to the right, close all, save,
  save as, copy path, copy name, show in Explorer, reload from disk.
- New documents (`Ctrl+N`, the tree's **+**, the empty state). Nothing is
  written to disk until the first save, and the save dialog opens in the folder
  the tree is showing.
- A right-click menu in the folder tree: open, new file here, show in Explorer,
  copy path.
- Folder tree for the document's directory, showing only Markdown and
  sub-folders; refreshes when the folder changes on disk.
- Outline panel that tracks the section you are reading.
- Session restore for open tabs, caret positions, reading position and sidebar
  state — a long document reopens where you stopped reading, not at line one.
- Interface in English and Ukrainian, following the system language unless you
  choose one in the settings.

**Export**

- Export as a standalone HTML file (`Ctrl+Shift+E`): the stylesheet, the pictures, the diagrams
  and the formulas are all inside it, so it opens anywhere, offline. Colours
  are the reader's own, including a custom theme.
- Print (`Ctrl+Shift+P`), which is also where "Save as PDF" lives. The page is
  built by the exporter rather than taken from the screen, so the whole
  document prints; the print stylesheet drops backgrounds, keeps tables and
  code blocks whole across pages, and writes out the address of each link.
- Formulas are exported as MathML, which browsers draw without a stylesheet or
  a font, and the LaTeX source is kept in the annotation.

**Data safety**

- Atomic saves (write to a temp sibling, fsync, rename) with retries for
  transient Windows file locks.
- Byte-exact round-trip: encoding, line endings and trailing newline are
  preserved, including files that mix CRLF and LF — lines you did not edit keep
  the endings they had. Opening and saving an untouched file produces identical
  bytes.
- Legacy encodings are read and written back in the same encoding: UTF-8,
  UTF-8 BOM, UTF-16 LE/BE, windows-1251, DOS 866, KOI8-R, KOI8-U, ISO 8859-5
  and windows-1252. Which one a file is in is decided by statistics over the
  text (chardetng), because validity cannot tell them apart.
- A save that would lose a character the file's encoding cannot represent is
  refused, naming the character, instead of quietly substituting it.
- Files in an encoding we cannot reproduce are not opened at all, rather than
  opened in a state that risks a lossy rewrite.
- Draft autosave outside your file, with recovery offered after a crash.
- Filesystem watching: clean tabs reload silently, modified tabs offer
  **Reload** or **Keep mine**, deletions are reported without losing content.

**Appearance**

- Light and dark themes driven entirely by CSS tokens, with no flash of the
  wrong theme at startup.
- Your own theme: one CSS file, chosen in Settings, applied over the built-in
  one and watched — save the file and the window repaints. `docs/themes/paper.css`
  is a complete example.
- `prefers-reduced-motion` is honoured throughout, and high-contrast mode
  restores borders where the interface otherwise speaks in tint alone.
- The native menu is translated along with the rest of the interface.

### Known limitations

- No plugin API yet — the editor is built from composable extensions so that
  it can arrive without a rewrite.
- Search covers the open document, not a folder.
- Table cells are edited as source rather than in the rendered grid; the
  keyboard model for moving between them is there, the in-place grid is not.
- Documents larger than 2 MB skip the block scan, so tables, diagrams and
  display math stay as source to keep typing responsive. The status bar says
  so rather than leaving it to be discovered.
- Renaming or deleting a file from the tree is not implemented.
- The installer is not code-signed, so Windows SmartScreen and macOS Gatekeeper
  will warn on first run. See the README.
- Built and used on Windows; macOS and Linux are built by CI but have not been
  tested by hand.

[0.1.0]: https://github.com/vglu/verso/releases/tag/v0.1.0
