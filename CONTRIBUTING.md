# Contributing to Verso

Thank you for looking. This is a small project with strong opinions, and this
document is mostly about what those opinions are — so your time is not spent on
a change that gets turned down for a reason nobody told you.

## Getting it running

```bash
npm ci
npm run tauri dev      # the application, with hot reload
npm run check:all      # everything CI will run
```

You need Node 22+ and a stable Rust toolchain. On Linux, also
`libwebkit2gtk-4.1-dev` and the usual GTK build dependencies — the exact list is
in [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

`npm run check:all` is lint, formatting, types, the theme-token guard, both test
suites and `cargo clippy -D warnings`. If it is green locally, CI will be green.

## The rules this project actually holds to

These are not style preferences. A change that breaks one of them will be sent
back, however good it looks.

**The file is the only source of truth.** There is no document model. The text
in the file *is* the document, and rendering is decoration drawn over it. This
is what makes byte-exact round-trip possible, and it is the reason there is no
second Markdown implementation anywhere in the codebase.

**Never rewrite a byte the reader did not type.** Encoding, BOM, line endings —
including files that mix them — survive a save. When something cannot be
preserved, the save is refused and says why; it is never silently substituted.

**Say what happened.** No silent degradation. If a document is too large to
render tables, the status bar says so. If a draft was recovered instead of the
file being shown, a banner says so. A feature that quietly does less is worse
than one that is missing.

**Colours come from tokens.** Components may not contain literal colours —
`npm run check:colors` enforces it — because a theme has to be able to repaint
everything. The one exception is the print stylesheet: paper has no theme.

**Beauty is measured, not asserted.** A change to the interface needs a
screenshot in both themes. Typography, spacing and motion are reviewed like
code.

## Tests

Two suites, and both run in CI:

- `npm test` — logic, the editor, the exporter, the data-safety rules.
- `npm run test:ui` — components actually mounted, for the things only a
  rendered component can be wrong about.

A bug fix comes with the test that would have caught it. Where a rule is about
bytes — encodings, line endings, table shapes — the test states the bytes.

## Commits and pull requests

Conventional commits (`feat:`, `fix:`, `docs:`, `perf:`, `chore:`). The subject
line says what changed; the body says **why**, and what the alternative was if
the choice was not obvious. A commit that explains a decision saves the next
person from undoing it.

Open an issue before a large change, so nobody builds something for a week that
the project does not want.

## Where things are

| | |
| --- | --- |
| `src/lib/editor/` | The live-preview engine, on CodeMirror 6 |
| `src/lib/export/` | Markdown to HTML, and the standalone page |
| `src/lib/stores/` | Tabs, settings, session, drafts |
| `src-tauri/` | The Rust shell: files, encodings, watching, menu |
| `docs/design/` | The contracts — read these before changing behaviour |
| `.cursor/decisions/` | Why things are the way they are (ADRs) |

`docs/design/EDITOR-CORE.md` and `docs/design/DATA-SAFETY.md` are the two worth
reading first. They are written to be read, not to be filed.
