import { describe, expect, it } from 'vitest';
import { shadowCss, SHADOW_BODY_CLASS } from '../src/lib/export/shadowCss';
import { EXPORT_CSS } from '../src/lib/export/exportCss';

/**
 * The page beside the text is dressed by the export stylesheet, and a shadow
 * root has neither an `html` element nor a `body`. A rule that names one does
 * not fail loudly; it stops applying, and the preview quietly loses the
 * measure, the margins and the background that the exported file keeps.
 */
describe('the export stylesheet inside a shadow root', () => {
  it('gives the document itself to the host', () => {
    expect(shadowCss('html { background: white; }')).toBe(':host { background: white; }');
  });

  it('gives the body to the wrapper the pane provides', () => {
    expect(shadowCss('body { max-width: 40rem; }')).toBe(
      `.${SHADOW_BODY_CLASS} { max-width: 40rem; }`
    );
  });

  it('rewrites a selector wherever the element is named in it', () => {
    expect(shadowCss('html, body { margin: 0; }')).toBe(
      `:host, .${SHADOW_BODY_CLASS} { margin: 0; }`
    );
    expect(shadowCss('body > .page { padding: 1rem; }')).toBe(
      `.${SHADOW_BODY_CLASS} > .page { padding: 1rem; }`
    );
    expect(shadowCss('@media print { body { color: black; } }')).toContain(
      `{ .${SHADOW_BODY_CLASS} {`
    );
  });

  it('leaves a word that merely starts the same alone', () => {
    expect(shadowCss('.htmlish { color: red; }')).toBe('.htmlish { color: red; }');
    expect(shadowCss('pre.raw-html { color: red; }')).toBe('pre.raw-html { color: red; }');
    expect(shadowCss('.bodycopy { color: red; }')).toBe('.bodycopy { color: red; }');
  });

  it('leaves the rest of the sheet untouched', () => {
    const out = shadowCss(EXPORT_CSS);
    expect(out).not.toMatch(/(^|[\s,{}])html\b/);
    expect(out).not.toMatch(/(^|[\s,{}])body\b/);
    expect(out.length).toBeGreaterThan(EXPORT_CSS.length - 100);
    // Every colour still comes from a token: the theme has to reach in.
    expect(out).toContain('var(--');
  });
});
