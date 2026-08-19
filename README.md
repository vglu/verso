<div align="center">

# Verso

**A beautiful, instant Markdown viewer and editor for Windows, macOS and Linux.**

Double-click a `.md` file — it opens in well under a second and looks like a
finished document, not like source code.

![Verso rendering a document](docs/screenshots/light.png)

</div>

## Why

| | |
| --- | --- |
| **Typora** | Beautiful, but closed and paid. |
| **MarkText** | Electron, ~150 MB, and years of dormancy behind it. |
| **Obsidian** | A vault-shaped knowledge base, not "just open this file". |

Verso is viewer-first: it opens instantly, renders beautifully, lets you
edit in place, and never damages your file.

## What it does

- **Live preview like Typora.** Markdown renders in place; the raw syntax
  appears only on the line your caret touches — and only once you actually
  start interacting, so a freshly opened document stays a clean reading page.
- **Real tables**, not aligned pipes. Column alignment, inline formatting in
  cells, click a cell to edit its source.
- **Math and diagrams.** `$E = mc^2$` via KaTeX, ` ```mermaid ` fences via
  Mermaid — both loaded only when a document needs them.
- **Tabs, folder tree, outline, find & replace**, session restore.
- **Light and dark themes** built from CSS tokens — [write your own](docs/themes.md).
- **~2 MB installer, ~40 MB of RAM.** Tauri 2 and the system webview, no
  bundled browser.

### Your file is safe

- Saves are atomic — the file on disk is the old version or the new one, never
  a half-written mix.
- Encoding, line endings and BOM are preserved: **open and save an untouched
  file and the bytes are identical.**
- Unsaved text is mirrored to a draft, so a crash costs nothing.
- Files that change under you reload when the tab is clean, and ask when it
  isn't.
- Raw HTML in a document is displayed as text, never executed.

![Tables, code and quotes in the dark theme](docs/screenshots/dark.png)

Math and diagrams render inline, and only load when a document actually uses them:

![KaTeX formulas and a Mermaid diagram](docs/screenshots/math-diagrams.png)

## Install

Download the installer for your platform from
[Releases](../../releases), or build it yourself:

```bash
npm ci
npm run tauri build
```

Requires Node 22+ and a stable Rust toolchain. On Linux you also need
`libwebkit2gtk-4.1-dev` and the usual GTK build dependencies (see
[`.github/workflows/ci.yml`](.github/workflows/ci.yml)).

## Develop

```bash
npm ci
npm run tauri dev      # run the app with hot reload
npm run check:all      # lint, types, theme-token guard, unit tests, clippy
```

| Layer | Stack |
| --- | --- |
| Shell | Tauri 2 (Rust) — file associations, single instance, filesystem, watching |
| UI | Svelte 5 + Vite + TypeScript |
| Editor | CodeMirror 6 with a custom live-preview decoration layer |

Design documents live in [`docs/design/`](docs/design/): architecture, the
IPC contract, the editor core, data-safety rules and the design system.
Decisions are recorded as [ADRs](.cursor/decisions/).

## Documentation

- [User guide](docs/guide/README.md) — shortcuts, saving, recovery
- [Writing a theme](docs/themes.md) — the token contract
- [Changelog](CHANGELOG.md)

## Status

**0.1** — the first working release. Plugins, HTML/PDF export and
folder-wide search are next; see the changelog for current limitations.

## License

MIT
