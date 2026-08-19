import { EditorSelection, type Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { searchKeymap } from '@codemirror/search';
import { Prec } from '@codemirror/state';
import {
  moveBlockDown,
  moveBlockUp,
  nextBlock,
  nextHeading,
  prevBlock,
  prevHeading,
  selectBlock
} from './blockNav';
import { setHeading, toggleList, toggleQuote } from './format';
import { jumpBack, jumpForward, pushJump } from './history';

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
  onGoToLine?: () => void;
  onGoToHeading?: () => void;
}

/**
 * Wrap a jump so it can be undone with Back.
 *
 * Anything that can move the caret more than a screen records where it came
 * from; ordinary caret movement does not.
 */
function asJump(command: (view: EditorView) => boolean) {
  return (view: EditorView): boolean => {
    const before = view.state.selection.main.head;
    pushJump(view);
    const moved = command(view);
    if (!moved && view.state.selection.main.head === before) jumpBack(view);
    return moved;
  };
}

export function editorKeymap(hooks: KeymapHooks = {}): Extension {
  return [
    history(),
    Prec.high(
      keymap.of([
        // — Inline formatting —
        { key: 'Mod-b', run: (view) => toggleWrap(view, '**') },
        { key: 'Mod-i', run: (view) => toggleWrap(view, '*') },
        { key: 'Mod-e', run: (view) => toggleWrap(view, '`') },
        { key: 'Mod-Shift-x', run: (view) => toggleWrap(view, '~~') },
        { key: 'Mod-k', run: insertLink },

        // — Block structure —
        { key: 'Mod-Alt-1', run: (view) => setHeading(view, 1) },
        { key: 'Mod-Alt-2', run: (view) => setHeading(view, 2) },
        { key: 'Mod-Alt-3', run: (view) => setHeading(view, 3) },
        { key: 'Mod-Shift-8', run: (view) => toggleList(view, 'bullet') },
        { key: 'Mod-Shift-7', run: (view) => toggleList(view, 'ordered') },
        { key: 'Mod-Shift-t', run: (view) => toggleList(view, 'task') },
        { key: 'Mod-Shift-q', run: toggleQuote },

        // — Moving around by block, the way a document editor does —
        { key: 'Mod-ArrowDown', run: nextBlock },
        { key: 'Mod-ArrowUp', run: prevBlock },
        { key: 'Mod-Alt-ArrowDown', run: asJump(nextHeading) },
        { key: 'Mod-Alt-ArrowUp', run: asJump(prevHeading) },
        { key: 'Mod-l', run: selectBlock },

        // — Moving the block itself. Alt is the editor convention on Windows;
        //   the Ctrl+Shift alias catches Typora and Notion muscle memory. —
        { key: 'Alt-ArrowUp', run: moveBlockUp },
        { key: 'Alt-ArrowDown', run: moveBlockDown },
        { key: 'Mod-Shift-ArrowUp', run: moveBlockUp },
        { key: 'Mod-Shift-ArrowDown', run: moveBlockDown },

        // — Where was I? —
        { key: 'Alt-ArrowLeft', run: jumpBack },
        { key: 'Alt-ArrowRight', run: jumpForward },

        {
          key: 'Mod-f',
          run: () => {
            hooks.onFind?.();
            return true;
          }
        },
        {
          key: 'Mod-g',
          run: () => {
            hooks.onGoToLine?.();
            return true;
          }
        },
        {
          key: 'Mod-Shift-o',
          run: () => {
            hooks.onGoToHeading?.();
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
