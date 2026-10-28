import { Facet, StateEffect, StateField, type EditorState } from '@codemirror/state';

/**
 * Whether the user is working in this document, as opposed to reading it.
 *
 * Lives in its own module because both the preview layers and the widgets
 * need it, and widgets are imported by the layers — routing it through
 * `index.ts` would make that circular.
 */
export const setEditing = StateEffect.define<boolean>();

/**
 * True once the user actually works in this document (clicked or typed).
 *
 * A freshly opened file is a *reading* surface: nothing should be revealed,
 * even though the caret technically sits on line 1. Programmatic focus alone
 * does not count — only real interaction flips this.
 */
export const editingField = StateField.define<boolean>({
  create: () => false,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setEditing)) return effect.value;
    }
    return value;
  }
});

/**
 * Dedicated reading mode: syntax never reveals, the document is read-only,
 * and rendered widgets (tables, formulas) keep their painted form so the
 * reader can select and copy from them.
 *
 * Default-on for every new editor. Ctrl+E toggles it for the active tab only;
 * the next file opened starts reading again.
 */
export const readerMode = Facet.define<boolean, boolean>({
  combine: (values) => values.some((v) => v)
});

/** True while Reading Mode is on for this document. */
export function isReaderMode(state: EditorState): boolean {
  return state.facet(readerMode);
}
