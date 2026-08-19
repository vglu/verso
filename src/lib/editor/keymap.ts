import { EditorSelection, type Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { searchKeymap } from '@codemirror/search';
import { Prec } from '@codemirror/state';

/**
 * Editor-level shortcuts. Application-level ones (open, save, close tab) live
 * in the native menu so the OS shows them and one place owns the behaviour
 * (DESIGN-SYSTEM §7).
 */

/** Wrap the selection in `marker`, or unwrap it if it is already wrapped. */
export function toggleWrap(view: EditorView, marker: string): boolean {
  const changes = view.state.changeByRange((range) => {
    const { from, to } = range;
    const before = view.state.doc.sliceString(Math.max(0, from - marker.length), from);
    const after = view.state.doc.sliceString(to, to + marker.length);

    if (before === marker && after === marker) {
      return {
        changes: [
          { from: from - marker.length, to: from },
          { from: to, to: to + marker.length }
        ],
        range: EditorSelection.range(from - marker.length, to - marker.length)
      };
    }

    const selected = view.state.doc.sliceString(from, to);
    if (
      selected.startsWith(marker) &&
      selected.endsWith(marker) &&
      selected.length > marker.length * 2
    ) {
      const inner = selected.slice(marker.length, selected.length - marker.length);
      return {
        changes: { from, to, insert: inner },
        range: EditorSelection.range(from, from + inner.length)
      };
    }

    return {
      changes: { from, to, insert: `${marker}${selected}${marker}` },
      range: selected
        ? EditorSelection.range(from + marker.length, to + marker.length)
        : EditorSelection.cursor(from + marker.length)
    };
  });

  view.dispatch(changes, { userEvent: 'input.format' });
  return true;
}

/** Turn the selection into a link, using the clipboard text when it is a URL. */
export function insertLink(view: EditorView): boolean {
  const range = view.state.selection.main;
  const selected = view.state.doc.sliceString(range.from, range.to);
  const insert = `[${selected}]()`;
  view.dispatch({
    changes: { from: range.from, to: range.to, insert },
    // Put the caret inside the parentheses, ready for the URL.
    selection: EditorSelection.cursor(range.from + insert.length - 1),
    userEvent: 'input.format'
  });
  return true;
}

export interface KeymapHooks {
  onFind?: () => void;
  onSave?: () => void;
}

export function editorKeymap(hooks: KeymapHooks = {}): Extension {
  return [
    history(),
    Prec.high(
      keymap.of([
        { key: 'Mod-b', run: (view) => toggleWrap(view, '**') },
        { key: 'Mod-i', run: (view) => toggleWrap(view, '*') },
        { key: 'Mod-k', run: insertLink },
        {
          key: 'Mod-f',
          run: () => {
            hooks.onFind?.();
            return true;
          }
        },
        {
          key: 'Mod-s',
          run: () => {
            hooks.onSave?.();
            return true;
          }
        }
      ])
    ),
    keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab])
  ];
}
