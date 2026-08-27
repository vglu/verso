# Changelog

All notable changes to Verso are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **The page beside the text.** `Ctrl+Alt+P`, or **View → Source and Preview**,
  puts the document you are writing in the left half of the window and the
  finished page in the right one. The page redraws a quarter of a second after
  you stop typing and follows the section your caret is in; it is not editable,
  because writing lives on the left (ADR-005). It is drawn by the same code as
  **Export as HTML**, so what stands beside you is what the reader gets — and
  the mode comes back when you reopen the app.

### Changed

- **A paragraph wrapped by hand is read as one paragraph.** A single newline
  inside a paragraph is a space in CommonMark, and every renderer flows it as
  one; the editor drew each line of the file as a line of the screen, so a
  document wrapped at seventy-six columns took four lines in a column wide
  enough for two. The file is not touched, a caret inside the paragraph puts
  the lines back, and a hard break — two trailing spaces or a backslash — is
  still a break.

### Fixed

- **An exported checklist says what it says.** The words of a task item were
  dropped from the exported HTML: the parser hangs them off the item's `Task`
  node rather than giving it a paragraph, and the exporter read only the
  paragraph. Every `- [x] …` came out as a correctly ticked, entirely silent
  box.

## [0.6.4] — 2026-08-23

### Fixed

- **A picture sits where the text does.** An image on its own line began at the
  edge of the window rather than on the column's left edge — measured at 976px
  out on a wide screen. It is the one block that is not wrapped in a container
  of its own, so the rule that aligns a table, a diagram and a formula never
  reached it. It is on that rule now, with the extra room a block is allowed
  and a hairline border, so that a screenshot with a pale background no longer
  dissolves into the page.

- **A picture kept anywhere but beside its document now loads.** The webview
  may only read folders it has been given, and it was given the document's own
  — while `../images/diagram.png` from a document in `docs/guide` is an
  ordinary thing to write, and drew a broken-image box. Opening a folder in the
  tree allows that folder too, and a picture that still fails asks for the one
  folder it lives in and tries once more. Nothing wider is opened, and nothing
  at all until something is missing.

## [0.6.3] — 2026-08-23

### Fixed

- **"Open with → Verso" opened the window and no document.** The launcher
  filtered the files it was given through the six Markdown extensions, while
  the application opens some twenty kinds — the data file a table came from,
  the configuration beside the document, the page someone saved. Every XML,
  JSON, CSV, YAML and log was dropped before any part of the program that
  could have explained it. The launcher passes on every existing file now, and
  what can be read is decided where the file is read: `package.json` opens
  with its syntax coloured, a picture says "Not a text file" on a banner
  instead of leaving an empty window.

- **One press of an arrow key moves one step.** In live preview, pressing Up
  from the last line of a document moved the caret from line 71 to line 33 —
  past a formula, a rule, a diagram and a block of code — and a later press
  went from 29 to 17, over a table. Going down, that same table was stepped
  over rather than entered, which is the asymmetry that made the keyboard feel
  arbitrary.

  Vertical motion in CodeMirror is a question about pixels, and the pixels
  above a document full of rendered blocks are estimates until they have been
  drawn. The editor is now asked what it intends and overruled when it intends
  a leap: one step is another row of the same wrapped line, the adjacent line,
  or the near edge of a rendered block. Walking the whole showcase document in
  the running application, up and down, is now 148 presses of exactly one line
  each. Source mode was already correct and is untouched.

- **The exported page grows with the window.** It kept the fixed width the
  application dropped in 0.6.0. Measured on a browser window 2400px wide, the
  column is 1394px with even margins, where it used to sit at 760 with a
  thousand pixels of nothing on either side.

## [0.6.2] — 2026-08-21

### Fixed

- **A table started two hundred pixels to the left of the text.** Anything
  that is not prose — a table, a diagram, a display formula, a block of code —
  is allowed more room than the reading column, and that room was given by
  centring a wider box around the column. The contents of that box are
  left-aligned inside it, so a table narrower than the box began well to the
  left of the paragraph above it and looked like it had come loose.

  Wide blocks now begin on the column's left edge and grow to the right from
  there, which is where the eye is already looking. Measured on the running
  application: paragraph, heading and table all start at the same pixel.

## [0.6.1] — 2026-08-21

### Fixed

- **The document was invisible unless the window was split.** The panes added
  in 0.6.0 size themselves with `flex: 1`, and the area holding them only
  became a flex row when there were two of them — so with one pane the flex
  was ignored, the pane collapsed to no height, and the editor inside it was
  drawn into nothing. Everything around it went on working, which is what made
  it look like the document had failed to open: the tab, the outline and the
  word count were all correct, and the page was blank.

  The area is a row whether or not the window is split. Both states are now
  checked by hand before a release, which is the process failure underneath
  the bug — 0.6.0 was verified split, and only split.

## [0.6.0] — 2026-08-21

### Added

- **Two documents side by side.** `Ctrl+Alt+\`, or **View → Split Editor**,
  divides the window in two. Each half keeps its own tabs, its own scroll and
  its own caret; the divider drags; a tab moves across by being dragged into
  the other half or through its own context menu. The half being typed into is
  marked with a hairline of accent along its top edge rather than by dimming
  the other one — two panes are two documents, not one document and one
  disabled area.

  Underneath it there is still one list of open documents. Everything that
  acts on a document — saving, watching, drafts, reloading — is indifferent to
  which half it is being shown in, and splitting that list in two would have
  meant splitting all of it. A pane is a property of a tab.

  The layout comes back with the session, and folds itself away when the last
  document of a pane is closed.

### Changed

- **The text column grows with the window instead of staying 760px wide.** On
  a 3440px screen the old fixed measure left two thirds of the window empty;
  filling it entirely would give lines of two hundred characters, where the
  eye loses the start of the next one on the way back. So the column takes
  seventy per cent of the room available, never narrower than the classic
  measure and never wider than the ceiling in Settings — which is what the
  "text width" setting now means. A stored value of the old default is moved
  to the new one, because that number was never a choice anyone made.

## [0.5.1] — 2026-08-21

### Fixed

- **Headings sat against the edge of the window while the prose stayed
  centred.** The reading measure is centred by `margin-inline: auto` on each
  line; every heading then set `margin: 0.5em 0`, and the shorthand quietly
  put its side margins back to zero. In a narrow window the two axes are a few
  pixels apart and nobody sees it. On a wide screen a heading and the
  paragraph under it end up a hand's width apart, which is what the layout
  looked like on a 3440px display.

  `npm run check:measure` now refuses any side margin on a line, so the next
  `margin:` shorthand written there fails the gate instead of the page.

## [0.5.0] — 2026-08-21

### Added

- **Two more themes, both blue-green and deliberately opposite.**
  - `docs/themes/tiffany.css` — the little blue box. 1837 blue is a tint and
    cannot be made into type, so it does what the box does: cool white
    surfaces, silver hairlines, the colour itself saved for the accent and for
    the headings in the dark theme, where a tint can finally be itself. One
    coral ribbon is the only warm thing on the page.
  - `docs/themes/mint.css` — the herb rather than the sweet, built as the
    opposite temperature: the hue pulled 20° toward green and every surface
    given a trace of yellow, so the white reads as cream instead of ice. Leaf
    green carries the strings in code, and a raspberry complement keeps all
    that green from turning institutional.

  Both are measured, not eyeballed: `npm run check:themes` clears all
  thirty-six pairs — eighteen in the light block, eighteen in the dark — and
  the ratio of every colour is written next to it in the file.

- **Tooltips of our own.** The native `title` attribute was the last place the
  operating system showed through: it arrived about a second late, in the
  system's grey, and could not tell you that `Ctrl+B` is a key rather than a
  word. All twenty-two of them are now one shared element, themed, with the
  shortcut set as a key — and with the timing that makes a toolbar feel fast:
  the first waits half a second, every one after it is instant and does not
  animate at all, until the pointer has been away long enough to have stopped
  asking.
- **The mode switch is one pill that slides** between Preview and Source
  rather than two that light up in turn — the two halves are one setting with
  two positions, and something that travels between them says so.
- **The tab strip settles instead of jumping.** Closing a tab in the middle
  used to teleport the ones after it; they now move to where they belong. The
  open document is also kept in view, which with a dozen tabs it was not.
- **Strips that scroll say so.** The toolbar and the tab strip hide their
  scrollbars, so in a narrow window buttons simply stopped at a hard edge with
  nothing to suggest there were more. Both now fade at whichever edge still has
  content past it.
- **The tick in a checkbox grows into place** instead of being stamped. The
  fill and the border were already animating; the mark — the one part the eye
  is on — was the only thing that arrived finished.

### Performance

- **A document in a crowded folder opens two to six times faster.** Opening a
  file used to wait for the folder beside it: resolve the root, list it, build
  every row — all before the thing that was double-clicked reached the screen.
  They answer two different questions, and only one of them was asked. The
  document is painted first now and the tree arrives behind it.

  Underneath it, the listing itself stopped opening every sub-folder. Each
  directory row carried a `hasChildren` flag, computed by reading the whole
  child directory to find out whether the row deserved a disclosure arrow —
  a hundred and forty-seven extra directory reads in a folder like Downloads,
  for a flag no part of the interface has ever read. The arrow is drawn for
  every folder either way.

  Measured on `D:\Downloads` — 1,556 entries, 147 sub-folders — from the
  first line of application script to the document on screen:

  | | before | after |
  | --- | ---: | ---: |
  | document painted | 210–669 ms | 95–114 ms |
  | tree finished | 195–655 ms | 116–134 ms |

  The spread matters as much as the median: the slow runs were the ones where
  the folder was not in the filesystem cache, which is exactly the run that
  happens after switching on the computer.

### Changed

- **Nothing animates when the go-to-heading palette opens.** It is opened with
  a keystroke and closed with a keystroke, often several times while chasing a
  heading through a long file, and an entrance of even a hundred milliseconds
  turns "go there" into "wait, then go there".
- **Context menus grow out of the pointer**, from the corner the click
  happened in — including when the menu had to flip up or left to stay on
  screen, which is exactly when scaling from the wrong corner looks like the
  menu came from somewhere else.
- **Press depth is a token now** (`--press-scale`, `--press-scale-icon`,
  `--press-scale-row`). Seven buttons had it written in as a number and so
  went on shrinking under `prefers-reduced-motion`, which is the one setting
  that asks them not to.
- **The transitions written in JavaScript use the same curve and the same
  durations as the ones written in CSS.** They had drifted onto different
  easing, so a banner and the button beside it animated in two dialects.
- **The theme crossfade no longer touches the document.** It put a transition
  on every element on the page, which in a long file is tens of thousands of
  nodes — the only style recalculation in the program that grew with the size
  of what was being read.

### Fixed

- The zoom indicator, breadcrumbs, outline rows, file rows and context-menu
  items answer a press; they were the only clickable things that did not.
- A second finger landing on a panel divider mid-drag no longer takes over and
  teleports it. The cursor also stays a resize cursor for the length of the
  drag, and nothing behind it starts selecting text.
- The search panel's buttons keep their hover state on touch no longer — the
  one `:hover` in the program that was not behind the `hover: hover` guard.

## [0.4.2] — 2026-08-20

### Fixed

- **A table stayed wide while you read it and collapsed the moment you edited
  it.** Opening a block for editing turns the widget back into ordinary lines,
  and those lines still carried the prose measure — wide to read, narrow to
  work in, which is precisely backwards. Revealed tables, formulas and image
  sources now keep the width their rendered form had.

## [0.4.1] — 2026-08-20

### Fixed

- **Wide things are wide now.** The reading measure — the narrow column that
  makes prose easy to follow — was applied to the whole document, so on a large
  screen a table sat squeezed into 760 pixels with three thousand going spare
  beside it. Prose keeps its measure; tables, diagrams, display formulas and
  blocks of code take up to nearly twice it, centred on the same axis.
- **Source mode is full width.** It is editing rather than reading, and the
  measure that helps the eye follow a paragraph is in the way of a table of
  pipes.
- The text-width setting goes up to 1800px instead of 1100 — the old ceiling
  was set for a laptop.
- Clicking beside a paragraph now places the caret. The empty space either side
  used to be outside the editable area entirely, so a click there did nothing.

## [0.4.0] — 2026-08-20

### Added

- **A toolbar that starts with the file.** New, open and save, then undo and
  redo, then cut, copy and paste, before the Markdown tools that were already
  there — and **Format Document** on the right, next to the Preview / Source
  switch, because both act on the whole document. Buttons dim when they have
  nothing to do: save on a clean file, undo with nothing to undo, cut with
  nothing selected.
- **Autosave**, in the vocabulary VS Code taught everyone: off, after a pause,
  or on focus change. Off by default — this program's first promise is that it
  writes nothing you did not type, so writing on a timer is a decision to
  make on purpose. It never saves a document that has never been saved (that
  would open a dialog nobody asked for), and it never writes over a file that
  changed underneath you while the conflict banner is asking what to do.
- **The unsaved dot in the file tree**, not only on the tab. Unsaved work is a
  fact about a file, and the tree is where files are.

### Fixed

- `.txt` is Markdown again. Treating it as a data file in 0.3.0 took the live
  preview and the formatting toolbar away from files that had always had them
  — and `.txt` is in this program's own Markdown filter and file association.
- Formatting was reachable only from a menu, which is why a plugin could be
  installed, enabled and appear to do nothing at all. It has a button now.

## [0.3.0] — 2026-08-20

### Added

- **Plugins.** A plugin is a folder with a manifest and one JavaScript file
  exporting a `format(text, context)` function; it adds a way to format a
  document. The code runs in a Web Worker with no DOM, no file system, no
  Tauri commands and no network, under a two-second deadline — and it does not
  run at all until the plugin is switched on in Settings, because installing a
  plugin and allowing it to run are two different decisions. Writing one is
  documented in [docs/plugins.md](docs/plugins.md), including why the
  content-security policy had to be widened by exactly `blob:` and no further.
  - `examples/plugins/tidy-markdown` is a complete working example: list
    markers, ordered-list numbering, trailing spaces and stray blank lines,
    with everything inside a fenced code block left strictly alone.
- **Optional spell checking** (Settings → Check spelling), using the
  dictionaries the operating system already has — no downloads, no bundled
  word lists, and whatever languages the machine speaks. Right-click an
  underlined word for suggestions. Off by default: the checker reads a
  Markdown file as plain text, so it underlines fenced code and link targets
  as well, which is worth it while writing and not while reading.
- **Two themes, and a way to measure one.**
  - `docs/themes/overworld.css` — Minecraft's palette: sandstone by day,
    deepslate underground, diamond as the accent because it is split-
    complementary to earth, which is exactly why it reads as treasure.
  - `docs/themes/blush.css` — soft rose against warm plum type, with a sage
    complement so the page never cloys; wine-dark in the evening.
  - `scripts/check-theme-contrast.mjs` reports the WCAG ratio of every pair a
    reader has to read, in both the light and dark blocks. All three shipped
    themes pass it; it found three failures in the example theme the first
    time it ran, and those are fixed.

### Fixed

- `paper.css` had links at 4.16:1, accents on panels at 3.58:1 and
  placeholders at 2.77:1 — below the thresholds its own documentation asks
  for. Darkened until they pass.

## [0.2.0] — 2026-08-20

### Added

- **Formatting, and the contract plugins will use.** A formatter is a pure
  function from text to text — no DOM, no IPC, no network — which is exactly
  the interface a plugin will implement later inside a worker. The built-in
  ones are written against it first, because an extension point is only real
  once something real is built on it. View → Format Document, or `Alt+Shift+F`.
  - **JSON**, laid out or minified. A file that does not parse is left exactly
    as it was: a formatter that "fixes" broken JSON by dropping what it could
    not read is a data-loss bug in a helpful hat.
  - **CSV into a Markdown table** — the conversion this program of all programs
    should have. The parser follows RFC 4180: quoted fields, doubled quotes,
    separators and line breaks inside quotes. Pipes in cells are escaped.
  - Formatting is one undoable edit, never automatic, and does nothing at all
    when there is nothing to do — an edit that changes no text would still cost
    a clean file its clean state.
- **Data files open as what they are** — `.json`, `.csv`, `.xml` and the rest;
  `.txt` stays Markdown, which is what this program has always treated it as.
  A `.json` or `.csv` was parsed as
  Markdown until now, so a `#` inside a JSON string became a heading and a row
  of pipes became a table by accident. They now open with their own syntax
  highlighting — loaded on demand, so a reader who only opens Markdown pays
  nothing for it — at full width in a monospaced face, without the toolbar for
  bold and headings. The status strip names the language. Markdown keeps
  everything it had.
- The open dialog and drag-and-drop accept those files too; they were already
  openable by double-click, which made the dialog's refusal look like a bug.

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
- Window zoom (`Ctrl+=`, `Ctrl+-`, `Ctrl+0`, and `Ctrl` with the wheel), from
  50% to 300%: the whole interface, not only the text — the file tree, the
  outline and the status strip scale with it. The level is shown in the status
  strip while it is not 100%, and clicking it goes back. Font size and text
  width stay in the settings, where they belong: those are how a document is
  set, this is how large the screen is being asked to be.
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
