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

`npm run check:all` is lint, formatting, types, the theme-token guard, all three
test suites and `cargo clippy -D warnings`. One of those suites is the
performance budgets, which time a keystroke against a 16ms frame; they run on
their own so the stopwatch is not measuring the rest of the suite, and they are
not run in CI, where a shared two-core runner would measure the runner. If
check:all is green locally, CI will be green — with one caveat worth knowing: **CI runs the latest stable Rust**, and each
release brings new Clippy lints. Run `rustup update` before you push, or a
change that is clean on your machine can be rejected for a lint your toolchain
has never heard of.

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

### Measuring what a screenshot would show

Two of the worst bugs this project has shipped were plain in a screenshot and
survived anyway: a document that rendered into nothing, and a table that began
two hundred pixels to the left of the paragraph above it. Both were looked at
once, in one state, by someone who already knew what the picture was supposed
to say.

So the pictures are read by a program:

```bash
npm run tauri build      # it photographs the release binary
npm run qa:visual        # capture twelve states, then measure them
```

`scripts/visual-qa.ps1` opens the application in two themes, one pane and two,
at three window widths, and photographs each. It never takes the screen: the
window stays at the bottom of the stack the whole time. `check-visual.mjs`
reads the pixels back and asserts what a person would have to notice — that
the page is not blank, that nothing on it starts to the left of the text, that
the column is centred in the room it has, and that the body text clears 4.5:1
against the page. Split windows are measured a pane at a time.

It also writes `docs/qa/contact-sheet.png`, which is the twelve states at one
size: some of what is wrong with a page is only wrong beside the same page in
another state.

The pages it photographs — `docs/qa/fixture.md` and `docs/qa/fixture-b.md` —
are written without hard line breaks on purpose. A document wrapped by hand
ends its lines where the author pressed Return, and then no measurement can
tell where the column ends.

This is a pre-release check rather than part of `npm run check:all`: it needs
a built binary and a desktop to draw on.

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
