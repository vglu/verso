import { describe, expect, it } from 'vitest';
import {
  SearchQuery,
  closeSearchPanel,
  findNext,
  openSearchPanel,
  search,
  setSearchQuery
} from '@codemirror/search';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdownSupport } from '../src/lib/editor/markdownLang';
import { livePreview } from '../src/lib/editor/livePreview';
import { editorKeymap } from '../src/lib/editor/keymap';
import { jumpBack, pushJump } from '../src/lib/editor/history';

/**
 * Where the caret ends up when someone searches.
 *
 * The rule we hold to: typing a query is a look, not a move. Nothing goes
 * anywhere until Enter, so abandoning a search with Escape leaves the reader
 * exactly where they started — there is nothing to restore, because nothing
 * was taken away. Once they do press Enter they have travelled on purpose,
 * and Escape must not undo a deliberate move; Back is what returns them.
 */

const doc = `# Top\n\n${'filler line\n'.repeat(200)}\n## Buried\n\nthe needle is here\n`;

function viewOf(): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  return new EditorView({
    parent,
    state: EditorState.create({
      doc,
      selection: EditorSelection.cursor(0),
      extensions: [markdownSupport(), livePreview(), editorKeymap({}), search({ top: true })]
    })
  });
}

describe('searching does not move the reader until they say so', () => {
  it('leaves the caret alone while the query is being typed', () => {
    const view = viewOf();
    openSearchPanel(view);
    view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: 'needle' })) });

    expect(view.state.selection.main.head).toBe(0);
    view.destroy();
  });

  it('leaves it alone when the search is abandoned', () => {
    const view = viewOf();
    openSearchPanel(view);
    view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: 'needle' })) });
    closeSearchPanel(view);

    expect(view.state.selection.main.head).toBe(0);
    view.destroy();
  });

  it('moves to the match on Enter, and stays there when the panel closes', () => {
    const view = viewOf();
    openSearchPanel(view);
    view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: 'needle' })) });
    findNext(view);

    const found = view.state.selection.main.from;
    expect(view.state.doc.sliceString(found, found + 6)).toBe('needle');

    // Escape dismisses the panel; it does not undo a move the reader chose.
    closeSearchPanel(view);
    expect(view.state.selection.main.from).toBe(found);
    view.destroy();
  });

  it('lets Back return to where the search started', () => {
    const view = viewOf();
    pushJump(view); // what opening the panel records
    openSearchPanel(view);
    view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: 'needle' })) });
    findNext(view);
    closeSearchPanel(view);

    expect(jumpBack(view)).toBe(true);
    expect(view.state.selection.main.head).toBe(0);
    view.destroy();
  });
});
