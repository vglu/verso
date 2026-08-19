import {
  SearchQuery,
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  replaceAll,
  replaceNext,
  selectMatches,
  setSearchQuery
} from '@codemirror/search';
import type { EditorState } from '@codemirror/state';
import type { EditorView, Panel, ViewUpdate } from '@codemirror/view';
import { t } from '../stores/i18n';

/**
 * Our own search panel, in place of the one CodeMirror ships.
 *
 * Two things the built-in panel cannot say, and both matter here:
 *
 * - **How many.** In a long document "is it there at all" and "is it there
 *   forty times" are different answers, and pressing Enter until the search
 *   wraps is a poor way to find out.
 * - **What is being searched.** The document on screen is rendered; the search
 *   reads the file's text. Looking for `very bold word` will not find
 *   `very **bold** word`, and without a word about it that reads as the search
 *   being broken rather than as the markup being in the way.
 */

/** Matches beyond this are counted as "many": scanning has to stay cheap. */
const COUNT_LIMIT = 5000;

interface Counts {
  total: number;
  /** 1-based index of the match the selection is on, or 0 for none. */
  current: number;
  capped: boolean;
}

export function countMatches(state: EditorState, query: SearchQuery): Counts {
  if (!query.valid) return { total: 0, current: 0, capped: false };

  const cursor = query.getCursor(state);
  const selection = state.selection.main;
  let total = 0;
  let current = 0;

  for (;;) {
    const next = cursor.next();
    if (next.done) break;
    total += 1;
    if (next.value.from === selection.from && next.value.to === selection.to) current = total;
    if (total >= COUNT_LIMIT) return { total, current, capped: true };
  }

  return { total, current, capped: false };
}

function button(label: string, title: string, onClick: () => void): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'md-search-btn';
  el.textContent = label;
  el.title = title;
  el.setAttribute('aria-label', title);
  el.addEventListener('click', onClick);
  return el;
}

function toggle(label: string, title: string, onChange: () => void): HTMLLabelElement {
  const wrap = document.createElement('label');
  wrap.className = 'md-search-toggle';
  wrap.title = title;

  const box = document.createElement('input');
  box.type = 'checkbox';
  box.addEventListener('change', onChange);

  const text = document.createElement('span');
  text.textContent = label;

  wrap.append(box, text);
  return wrap;
}

export function createSearchPanel(view: EditorView): Panel {
  const dom = document.createElement('div');
  dom.className = 'cm-search md-search';
  dom.setAttribute('role', 'search');

  const findRow = document.createElement('div');
  findRow.className = 'md-search-row';

  const field = document.createElement('input');
  field.type = 'text';
  field.className = 'md-search-field';
  field.placeholder = t('search.find');
  field.setAttribute('aria-label', t('search.find'));
  field.autocomplete = 'off';
  field.spellcheck = false;

  const count = document.createElement('span');
  count.className = 'md-search-count';
  count.setAttribute('aria-live', 'polite');

  const replaceRow = document.createElement('div');
  replaceRow.className = 'md-search-row';

  const replaceField = document.createElement('input');
  replaceField.type = 'text';
  replaceField.className = 'md-search-field';
  replaceField.placeholder = t('search.replace');
  replaceField.setAttribute('aria-label', t('search.replace'));
  replaceField.autocomplete = 'off';
  replaceField.spellcheck = false;

  const commit = (): void => {
    view.dispatch({
      effects: setSearchQuery.of(
        new SearchQuery({
          search: field.value,
          replace: replaceField.value,
          caseSensitive: caseBox.checked,
          regexp: regexpBox.checked,
          wholeWord: wordBox.checked
        })
      )
    });
  };

  const caseToggle = toggle(t('search.case'), t('search.caseTitle'), commit);
  const regexpToggle = toggle(t('search.regexp'), t('search.regexpTitle'), commit);
  const wordToggle = toggle(t('search.word'), t('search.wordTitle'), commit);
  const caseBox = caseToggle.querySelector('input')!;
  const regexpBox = regexpToggle.querySelector('input')!;
  const wordBox = wordToggle.querySelector('input')!;

  field.addEventListener('input', commit);
  field.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (event.shiftKey) findPrevious(view);
      else findNext(view);
    }
  });
  replaceField.addEventListener('input', commit);
  replaceField.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      replaceNext(view);
    }
  });

  findRow.append(
    field,
    count,
    button('↑', t('search.previous'), () => findPrevious(view)),
    button('↓', t('search.next'), () => findNext(view)),
    button(t('search.all'), t('search.allTitle'), () => selectMatches(view)),
    button('✕', t('search.close'), () => {
      closeSearchPanel(view);
      view.focus();
    })
  );

  replaceRow.append(
    replaceField,
    button(t('search.replaceOne'), t('search.replaceOne'), () => replaceNext(view)),
    button(t('search.replaceAll'), t('search.replaceAll'), () => replaceAll(view))
  );

  const flags = document.createElement('div');
  flags.className = 'md-search-flags';
  flags.append(caseToggle, regexpToggle, wordToggle);

  const hint = document.createElement('div');
  hint.className = 'md-search-hint';
  hint.textContent = t('search.sourceHint');

  dom.append(findRow, replaceRow, flags, hint);

  const refresh = (): void => {
    const query = getSearchQuery(view.state);
    if (!field.value && query.search) field.value = query.search;

    if (!query.search) {
      count.textContent = '';
      count.classList.remove('none');
      return;
    }

    const { total, current, capped } = countMatches(view.state, query);
    count.classList.toggle('none', total === 0);
    if (total === 0) count.textContent = t('search.none');
    else if (capped) count.textContent = t('search.manyMatches', { count: String(total) });
    else if (current > 0)
      count.textContent = t('search.position', { at: String(current), total: String(total) });
    else count.textContent = t('search.matches', { count: String(total) });
  };

  return {
    dom,
    top: true,
    mount: () => {
      const query = getSearchQuery(view.state);
      field.value = query.search;
      replaceField.value = query.replace;
      caseBox.checked = query.caseSensitive;
      regexpBox.checked = query.regexp;
      wordBox.checked = query.wholeWord;
      // The selected word is what people usually meant to search for.
      const selection = view.state.selection.main;
      if (!field.value && !selection.empty && selection.to - selection.from < 100) {
        field.value = view.state.sliceDoc(selection.from, selection.to);
        commit();
      }
      field.focus();
      field.select();
      refresh();
    },
    update: (update: ViewUpdate) => {
      if (update.docChanged || update.selectionSet || update.transactions.length > 0) refresh();
    }
  };
}
