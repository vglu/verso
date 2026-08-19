import { describe, expect, it } from 'vitest';
import { createEditor } from '../src/lib/editor/createEditor';

/**
 * Spell checking is the webview's own, so what the application controls is one
 * attribute on one element. That is what is tested here: whether Chromium then
 * draws a red line under "sentance" is Chromium's business, and not something
 * a test in jsdom could honestly claim to have checked.
 */
function editorWith(spellcheck: boolean) {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  return createEditor({ parent, doc: 'a sentance with a mispelling\n', dir: '/docs', spellcheck });
}

describe('spell checking', () => {
  it('is off unless it is asked for', () => {
    const handle = editorWith(false);
    expect(handle.view.contentDOM.getAttribute('spellcheck')).toBe('false');
    handle.destroy();
  });

  it('is on when it is', () => {
    const handle = editorWith(true);
    expect(handle.view.contentDOM.getAttribute('spellcheck')).toBe('true');
    handle.destroy();
  });

  it('changes on an editor that is already open', () => {
    // A setting that only takes effect in new tabs is a setting people report
    // as broken.
    const handle = editorWith(false);
    handle.setSpellcheck(true);
    expect(handle.view.contentDOM.getAttribute('spellcheck')).toBe('true');
    handle.setSpellcheck(false);
    expect(handle.view.contentDOM.getAttribute('spellcheck')).toBe('false');
    handle.destroy();
  });

  it('never turns on the corrections that would rewrite the text', () => {
    // Underlining a word is help; changing it is the program editing someone's
    // document behind their back, which this one does not do.
    const handle = editorWith(true);
    expect(handle.view.contentDOM.getAttribute('autocorrect')).toBe('off');
    expect(handle.view.contentDOM.getAttribute('autocapitalize')).toBe('off');
    handle.destroy();
  });
});
