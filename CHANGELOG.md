# Changelog

All notable changes to Verso are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versions follow [Semantic Versioning](https://semver.org/).

## [0.1.0] — 2026-08-19

First working release: open a Markdown file and read it beautifully, edit it
in place, and never lose a byte.

### Added

**Shell**

- Tauri 2 application for Windows, macOS and Linux; ~2 MB installer, ~4 MB binary.
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
- Find and replace with match highlighting.

**Workspace**

- Tabs with unsaved indicators, middle-click close, and `Ctrl+1…9` switching.
- Folder tree for the document's directory, showing only Markdown and
  sub-folders; refreshes when the folder changes on disk.
- Outline panel that tracks the section you are reading.
- Session restore for open tabs, caret positions and sidebar state.

**Data safety**

- Atomic saves (write to a temp sibling, fsync, rename) with retries for
  transient Windows file locks.
- Byte-exact round-trip: encoding (UTF-8, UTF-8 BOM, UTF-16 LE/BE), line
  endings and trailing newline are preserved. Opening and saving an untouched
  file produces identical bytes.
- Files in encodings we cannot reproduce open read-only rather than risking a
  lossy rewrite.
- Draft autosave outside your file, with recovery offered after a crash.
- Filesystem watching: clean tabs reload silently, modified tabs offer
  **Reload** or **Keep mine**, deletions are reported without losing content.

**Appearance**

- Light and dark themes driven entirely by CSS tokens, with no flash of the
  wrong theme at startup.
- Published theme contract (`docs/themes.md`) so themes written now keep working.
- `prefers-reduced-motion` is honoured throughout.

### Known limitations

- Loading user theme files from disk is not wired up yet; the token contract
  is published ahead of it.
- No plugin API yet — the editor is built from composable extensions so that
  it can arrive without a rewrite.
- Export to HTML and PDF, and search across a folder, are not implemented.
- Table cells are edited as source rather than in the rendered grid.
- Documents larger than 2 MB skip the block-widget scan (tables, diagrams,
  display math render as source) to keep typing responsive.
- Encodings beyond UTF-8/UTF-16 are read-only.

[0.1.0]: https://github.com/OWNER/verso/releases/tag/v0.1.0
