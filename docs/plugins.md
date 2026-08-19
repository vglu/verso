# Plugins

A plugin adds a way to format a document. It is a folder with two files, and
the code inside it is one function: text goes in, text comes out.

That is deliberately small. The interface can grow later; it cannot shrink
once people have written against it.

## Using a plugin

1. Open **Settings → Plugins → Open folder**. That is
   `%APPDATA%\com.verso.app\plugins` on Windows,
   `~/Library/Application Support/com.verso.app/plugins` on macOS and
   `~/.config/com.verso.app/plugins` on Linux.
2. Put the plugin's folder inside it.
3. Restart Verso. The plugin appears in the list.
4. **Switch it on.** Until you do, its code does not run — installing a plugin
   and allowing it to run are two separate decisions, and Verso keeps them
   separate on purpose.

Then **View → Format Document**, or `Alt+Shift+F`. Verso asks its own
formatters first (JSON, CSV) and then every enabled plugin that offers itself
for this file type, and stops at the first one with something to say.

If nothing applies — no formatter for this kind of file, or the document is
already what the formatter would make it — nothing happens at all. That is the
correct outcome, not a failure: reformatting a document that needed no changes
would mark a clean file as edited and cost you an undo step for nothing.

Formatting is always one ordinary edit. `Ctrl+Z` puts the document back.

### An example to start from

[`examples/plugins/tidy-markdown`](../examples/plugins/tidy-markdown) is a
complete, working plugin — trailing spaces, list markers, ordered-list
numbering and stray blank lines, all made consistent, and everything inside a
fenced code block left strictly alone. Copy the folder into the plugins folder
and switch it on.

## Writing a plugin

### The two files

```
my-plugin/
  manifest.json
  index.js
```

`manifest.json`:

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "description": "One sentence about what it does.",
  "version": "1.0.0",
  "author": "You",
  "entry": "index.js",
  "extensions": ["md", "txt"]
}
```

| Field | Meaning |
| --- | --- |
| `id` | Lower-case letters, digits, `-` and `_`. Names the folder and the settings key, so it never changes |
| `name` | What the settings list shows |
| `description` | One line, shown under the name |
| `entry` | The file to run. Defaults to `index.js`, and must be inside the plugin's own folder |
| `extensions` | Which files to offer for, without the dot. An empty list means every file |

`index.js`:

```js
export function format(text, context) {
  if (!text.includes('\t')) return null; // nothing to do
  return text.replace(/\t/g, '  ');
}
```

### The contract

```ts
format(text: string, context: FormatContext): Result | Promise<Result>

type Result = string | { text: string; note?: string } | null;

interface FormatContext {
  fileName: string;                                // "notes.md"
  ext: string;                                     // "md"
  selection: { from: number; to: number } | null;  // what is selected, if anything
  indent: number;                                  // the reader's indent, in spaces
}
```

Four rules, and the first one matters most:

1. **Return `null` when there is nothing to do.** Returning the text unchanged
   is treated the same way, so either is safe — but say nothing rather than
   saying the same thing.
2. **Never throw at the reader.** A plugin that throws is treated as having
   declined, and the document is untouched. Guard your parsing yourself, so
   that "I do not understand this file" and "I crashed" are not the same
   outcome.
3. **The text you return replaces the document.** Not the selection, the
   document. Read `context.selection` if you want to know where the caret is,
   but hand back the whole thing.
4. **Be quick.** A call that takes longer than two seconds is assumed to be
   stuck: the worker is destroyed, the plugin is marked as failed, and the
   document is left alone.

You may return a `note` alongside the text; it is shown to the reader.

### What a plugin can and cannot reach

A plugin runs in a Web Worker, and that is the whole of its world:

| | |
| --- | --- |
| The document text and the context | **yes** — they are the arguments |
| `fetch`, `XMLHttpRequest`, WebSockets | **no** — the app allows no outbound connections |
| The DOM, the editor, other tabs | **no** — there is no DOM in a worker |
| The file system, Tauri commands | **no** — none of it crosses into the worker |
| `import` of another module in your folder | **no**, not yet — one file, for now |

This is not a promise about behaviour, it is the shape of the sandbox: those
things are absent rather than forbidden. The reasoning, and the price Verso
paid in its content-security policy to allow plugin code at all, is written
down in [ADR-004](../.cursor/decisions/ADR-004-plugins.md).

### Testing your plugin

The entry file is a plain ES module with one export, so it can be tested
without Verso at all:

```js
import { format } from './index.js';

const context = { fileName: 'notes.md', ext: 'md', selection: null, indent: 2 };
console.log(format('* one\n+ two\n', context));
```

The example plugin's own tests live in
[`tests/example-plugin.test.ts`](../tests/example-plugin.test.ts) and import it
exactly this way. If your plugin ever needs a build step to be imported like
that, it has grown something the plugin contract does not have.

## What plugins cannot do yet

Only formatting. No rendering, no commands of their own, no panels, no
settings of their own, no reading other files.

Each of those is a decision rather than a gap to be filled in passing: some can
live inside the worker, and some would mean handing plugin code the things the
sandbox currently keeps away from it. If you want one, open an issue and say
what you are trying to build — that is more useful than an API designed
against nobody's actual plugin.
