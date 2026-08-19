<div align="center">

# Verso

**A beautiful, instant Markdown viewer and editor.**

Double-click a `.md` file — it opens in well under a second and looks like a
finished document, not like source code.

*verso* — the left-hand page of an open book.

[![CI](https://github.com/vglu/verso/actions/workflows/ci.yml/badge.svg)](https://github.com/vglu/verso/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Made with Tauri](https://img.shields.io/badge/built%20with-Tauri%202-24C8DB.svg)](https://tauri.app)

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
- **Tabs, folder tree, outline, find & replace**, session restore, section
  folding, go-to-heading.
- **Export and print.** A standalone HTML file that carries its own styles,
  pictures, diagrams and formulas — and the print dialog, which is where
  "Save as PDF" lives.
- **Light and dark themes** built from CSS tokens — [write your own](docs/themes.md)
  and Verso repaints as you save the file.
- **Opens what other editors will not.** UTF-8, UTF-16, and the eight-bit
  encodings everything written before UTF-8 is in: windows-1251, DOS 866,
  KOI8-R/U, ISO 8859-5, windows-1252 — saved back byte for byte.
- **3.8 MB installer, ~40 MB of RAM.** Tauri 2 and the system webview, no
  bundled browser. (The Linux AppImage is the exception at ~79 MB — it carries
  its own runtime; the `.deb` and `.rpm` are 4.5 MB.)

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

There is no release to download yet — 0.1 has not been published. Build it
yourself:

```bash
npm ci
npm run tauri build
```

Requires Node 22+ and a stable Rust toolchain. On Linux you also need
`libwebkit2gtk-4.1-dev` and the usual GTK build dependencies (see
[`.github/workflows/ci.yml`](.github/workflows/ci.yml)).

### About the warning you will see

The installer is not code-signed — a certificate costs a few hundred dollars a
year, which is not something a free project carries. Windows SmartScreen will
say "unknown publisher": choose **More info → Run anyway**. macOS will need
**right-click → Open** the first time. If that is not a trade you want to
make, building from source above gives you the same application without it.

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

**0.1, unreleased.** Everything described above works, and is built and used
on Windows every day. macOS and Linux are wired into CI but have not been run
by hand yet — treat them as untested rather than supported until the first
release says otherwise.

Not there yet: plugins, folder-wide search, and renaming or deleting files
from the tree. See the [changelog](CHANGELOG.md) for the current limits.

## License

[MIT](LICENSE) © SIMS tech. Part of the [SIMS tech](https://sims-service.com/products)
product line.
