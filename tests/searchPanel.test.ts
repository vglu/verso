import { describe, expect, it } from 'vitest';
import { parseFully } from './support/tree';
import { SearchQuery, openSearchPanel, search, setSearchQuery } from '@codemirror/search';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdownSupport } from '../src/lib/editor/markdownLang';
import { countMatches, createSearchPanel } from '../src/lib/editor/searchPanel';
import { searchRail } from '../src/lib/editor/searchRail';

const doc = 'alpha beta\nalpha gamma\nAlpha delta\nnothing here\n';

function viewOf(text = doc, at = 0): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  return new EditorView({
    parent,
    state: parseFully(
      EditorState.create({
        doc: text,
        selection: EditorSelection.cursor(at),
        extensions: [
          markdownSupport(),
          search({ top: true, createPanel: createSearchPanel }),
          searchRail
        ]
      })
    )
  });
}

function query(view: EditorView, search: string, caseSensitive = false): void {
  view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search, caseSensitive })) });
}

describe('how many matches there are', () => {
  it('counts every one of them', () => {
    const view = viewOf();
    query(view, 'alpha');
    expect(countMatches(view.state, new SearchQuery({ search: 'alpha' })).total).toBe(3);
    view.destroy();
  });

  it('respects match case', () => {
    const view = viewOf();
    const counts = countMatches(
      view.state,
      new SearchQuery({ search: 'alpha', caseSensitive: true })
    );
    expect(counts.total).toBe(2);
    view.destroy();
  });

  it('says which one the reader is on', () => {
    const view = viewOf();
    const second = doc.indexOf('alpha', 11);
    view.dispatch({ selection: EditorSelection.range(second, second + 5) });

    const counts = countMatches(view.state, new SearchQuery({ search: 'alpha' }));
    expect(counts).toMatchObject({ total: 3, current: 2 });
    view.destroy();
  });

  it('reports no position when the selection is not on a match', () => {
    const view = viewOf();
    expect(countMatches(view.state, new SearchQuery({ search: 'alpha' })).current).toBe(0);
    view.destroy();
  });

  it('gives up counting rather than scanning a huge document', () => {
    const view = viewOf('x '.repeat(20000));
    const counts = countMatches(view.state, new SearchQuery({ search: 'x' }));
    expect(counts.capped).toBe(true);
    view.destroy();
  });

  it('counts nothing for an invalid query', () => {
    const view = viewOf();
    const counts = countMatches(view.state, new SearchQuery({ search: '', regexp: true }));
    expect(counts).toMatchObject({ total: 0, current: 0 });
    view.destroy();
  });
});

describe('the panel', () => {
  it('says what is being searched, because the screen shows something else', () => {
    const view = viewOf();
    openSearchPanel(view);

    const hint = view.dom.querySelector('.md-search-hint');
    expect(hint?.textContent).toContain('source');
    view.destroy();
  });

  it('shows the count once there is a query', () => {
    const view = viewOf();
    openSearchPanel(view);
    query(view, 'alpha');

    expect(view.dom.querySelector('.md-search-count')?.textContent).toContain('3');
    view.destroy();
  });

  it('starts from the selected word', () => {
    const view = viewOf();
    view.dispatch({ selection: EditorSelection.range(0, 5) });
    openSearchPanel(view);

    const field = view.dom.querySelector('.md-search-field') as HTMLInputElement;
    expect(field.value).toBe('alpha');
    view.destroy();
  });
});

describe('the rail down the edge', () => {
  it('marks every match', () => {
    const view = viewOf();
    query(view, 'alpha');

    expect(view.dom.querySelectorAll('.md-search-tick')).toHaveLength(3);
    view.destroy();
  });

  it('disappears when the search is cleared', () => {
    const view = viewOf();
    query(view, 'alpha');
    query(view, '');

    expect(view.dom.querySelectorAll('.md-search-tick')).toHaveLength(0);
    view.destroy();
  });

  it('picks out the match the reader is standing on', () => {
    const view = viewOf();
    query(view, 'alpha');
    view.dispatch({ selection: EditorSelection.range(0, 5) });

    expect(view.dom.querySelectorAll('.md-search-tick.current')).toHaveLength(1);
    view.destroy();
  });
});
