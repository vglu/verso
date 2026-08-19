import { StateEffect, StateField } from '@codemirror/state';

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
