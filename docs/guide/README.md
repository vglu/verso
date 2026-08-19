# Verso — user guide

## Opening documents

- **Double-click a `.md` file.** Verso registers itself for `.md`,
  `.markdown`, `.mdown` and `.mkd`. If the app is already running, the file
  opens as a new tab in the existing window instead of starting a second copy.
- **Drag a file onto the window.**
- **Ctrl+O** opens the file picker, **Ctrl+Shift+O** opens a folder in the
  sidebar tree.
- The **Recent** list on the empty screen reopens the last ten documents.

## Reading and editing

Verso renders Markdown in place: headings, bold, links, tables, code and
formulas all look like the finished document, not like source.

The moment you click or type, the line your caret is on shows its raw
Markdown, so you can edit the exact characters. Move away and it renders
again. Click outside the document — into the sidebar, for example — and the
whole page returns to a clean reading view.

**Ctrl+E** toggles reader mode, which never reveals syntax.

## Saving

- **Ctrl+S** saves. **Ctrl+Shift+S** saves under a new name.
- A dot on the tab means unsaved changes.
- Saving is atomic: the file on disk is either the old version or the new one,
  never a half-written mix.
- Your original encoding, line endings (LF or CRLF) and byte-order mark are
  preserved. Opening and saving without editing leaves the file byte for byte
  identical.
- Unsupported encodings open **read-only** rather than risking a lossy rewrite.

### If something happens to the app

Every few hundred milliseconds your unsaved text is written to a private
draft outside your file. If the app or the machine dies, the next start offers
to restore that text.

### If the file changes outside the app

- Tab has no unsaved changes → it silently reloads.
- Tab has unsaved changes → a bar appears with **Reload from disk** and
  **Keep my version**.
- The file was deleted or renamed → the tab says so and keeps your content in
  memory; **Save** writes it somewhere new.

## Getting around

| Action | Shortcut |
| --- | --- |
| Next / previous tab | `Ctrl+Tab` / `Ctrl+Shift+Tab` |
| Tab 1…8, last tab | `Ctrl+1` … `Ctrl+8`, `Ctrl+9` |
| Close tab | `Ctrl+W` |
| Show / hide sidebar | `Ctrl+\` |
| Switch Files ↔ Outline | `Ctrl+Shift+\` |
| Find (and replace) | `Ctrl+F` |
| Next / previous match | `F3` / `Shift+F3` |
| Bold / italic | `Ctrl+B` / `Ctrl+I` |
| Link from selection | `Ctrl+K` |
| Reader mode | `Ctrl+E` |
| Zoom in / out / actual size | `Ctrl+=` / `Ctrl+-` / `Ctrl+0`, or `Ctrl` + wheel |
| Export as HTML | `Ctrl+Shift+E` |
| Print (and Save as PDF) | `Ctrl+Shift+P` |
| Settings | `Ctrl+,` |

On macOS use `Cmd` instead of `Ctrl`.

Zoom scales the whole window — the file tree and the outline with it — from
50% to 300%, and the level appears in the status strip while it is not 100%;
click it to go back. The text size and column width on their own are in
Settings: those are how a document is set, zoom is how large the screen is
being asked to be.

The **Files** panel shows the folder your document lives in — only
sub-folders and Markdown files, so it stays readable inside a code repository.
The **Outline** panel lists the headings; the section you are reading is
highlighted, and clicking a heading jumps to it.

The session — open tabs, caret positions, sidebar state — comes back when you
reopen the app. Turn that off in Settings if you prefer a clean start.

## Spell checking

Off by default, and switched on in **Settings → Check spelling**. It uses the
dictionaries your system already has, so it speaks whatever languages your
computer does — Verso ships no dictionaries of its own and downloads nothing.
Misspelled words are underlined; right-click one for suggestions.

It is off by default because the checker sees a Markdown file as plain text:
fenced code, link targets and file names all get underlined too. For writing
prose it is worth it, and for reading it is not, so it is yours to choose.

## What is supported

CommonMark plus GitHub extensions: tables, task lists, strikethrough and
autolinks. On top of that:

- **Math** — `$inline$` and `$$display$$` rendered with KaTeX. A `$` in prose
  or inside code stays a plain dollar sign.
- **Diagrams** — ` ```mermaid ` fenced blocks render as diagrams and follow
  the app theme.
- **Images** — relative paths resolve against the document's folder; remote
  `https://` images load, everything else stays local.
- **Raw HTML is shown as text, never executed.** A Markdown file cannot run
  code in Verso.

## Settings

`Ctrl+,` — theme (light, dark, follow system), interface language, text size
and column width, draft autosave delay, session restore, status bar. Changes
apply immediately.

## Where files live

| What | Windows | macOS | Linux |
| --- | --- | --- | --- |
| Settings, session | `%APPDATA%\com.verso.app` | `~/Library/Application Support/com.verso.app` | `~/.config/com.verso.app` |
| Recovery drafts | same folder, `drafts/` | same | same |

Deleting those files resets Verso; your documents are never stored there.
