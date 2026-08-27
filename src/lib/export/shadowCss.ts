/**
 * The export stylesheet, readdressed to a shadow root.
 *
 * `renderDocumentHtml` produces a whole page, and the stylesheet that dresses
 * it names the page itself — `html` for the ground colour, `body` for the
 * measure and the margins. Inside a shadow root neither element exists, and a
 * rule that names one is not an error: it simply never matches, and the page
 * loses its width and its background without a word.
 *
 * The document becomes `:host`, and the wrapper the pane puts around the page
 * stands in for the body. Everything else in the sheet is written against
 * ordinary elements — `h1`, `table`, `pre` — and needs no changing at all.
 */

/** The class the pane must put on the element wrapping the rendered page. */
export const SHADOW_BODY_CLASS = 'page-body';

export function shadowCss(css: string): string {
  return css
    .replace(/(^|[\s,{}])html\b/g, `$1:host`)
    .replace(/(^|[\s,{}])body\b/g, `$1.${SHADOW_BODY_CLASS}`);
}
