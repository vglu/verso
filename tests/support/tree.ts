import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

/**
 * Give back a state whose whole document has been parsed.
 *
 * CodeMirror parses in time slices. When a state is created the language field
 * gets 20ms to work and then keeps whatever tree it has — enough for a short
 * document on a quiet machine, and not enough for the same document while
 * thirty other test files compile beside it. Everything downstream then reads
 * a tree that stops halfway: an empty outline, a fold that runs past the next
 * heading, a table the caret guard cannot see. Different failures each run,
 * none of them about the code under test.
 *
 * Waiting is not quite enough either, and this is the part that is easy to get
 * wrong: `ensureSyntaxTree` advances the parse and hands back the finished
 * tree, but `syntaxTree(state)` reads `field.tree` — a snapshot taken when the
 * field was built. The work only reaches the field on the next state update.
 * So this ensures the parse, then applies an empty transaction to let the
 * field pick the finished tree up, and returns that state.
 *
 * The budget is deliberately far larger than the parse needs. It is not a
 * performance assertion — those live in tests/perf.test.ts, which runs on its
 * own — it is the line past which something is genuinely wrong.
 */
const BUDGET_MS = 30_000;

export function parseFully(state: EditorState, budgetMs = BUDGET_MS): EditorState {
  if (!ensureSyntaxTree(state, state.doc.length, budgetMs)) {
    throw new Error(
      `the parse did not finish within ${budgetMs}ms (${state.doc.length} characters) — ` +
        `the assertions that follow would be about a partial tree`
    );
  }

  const advanced = state.update({}).state;
  const parsedTo = syntaxTree(advanced).length;
  if (parsedTo < state.doc.length) {
    throw new Error(
      `the parse finished but the state still carries a tree covering only ` +
        `${parsedTo} of ${state.doc.length} characters`
    );
  }
  return advanced;
}

/**
 * The same for a mounted view: the empty transaction goes through `dispatch`
 * so the view's plugins see the finished tree too.
 */
export function parseViewFully(view: EditorView, budgetMs = BUDGET_MS): EditorView {
  if (!ensureSyntaxTree(view.state, view.state.doc.length, budgetMs)) {
    throw new Error(`the parse did not finish within ${budgetMs}ms`);
  }
  view.dispatch({});
  return view;
}
