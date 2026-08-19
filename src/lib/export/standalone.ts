import type { EditorState } from '@codemirror/state';
import { EXPORT_CSS } from './exportCss';
import { escapeHtml, renderDocumentHtml } from './renderHtml';
import { readImageDataUri } from '../ipc/commands';
import { isRemoteUrl, joinPath, decodeUrlPath, stripUrlSuffix } from '../editor/pathUtil';

/**
 * A whole HTML page, carrying everything it needs.
 *
 * "Standalone" is the entire promise: the file has to survive being mailed,
 * moved to a stick, or opened on a machine that has never heard of this
 * application. So the stylesheet is inlined, the reader's own theme colours
 * are written into it, pictures are embedded, diagrams are SVG, and formulas
 * are MathML — which browsers draw themselves, with no stylesheet and no
 * fonts to go missing.
 */

/** The design tokens an exported page needs, read from the live application. */
const TOKENS = [
  '--bg',
  '--bg-app',
  '--bg-panel',
  '--bg-code',
  '--fg',
  '--fg-ui',
  '--fg-muted',
  '--fg-faint',
  '--heading',
  '--accent',
  '--border',
  '--quote-border',
  '--font-text',
  '--font-mono'
];

function themeTokens(): string {
  if (typeof getComputedStyle !== 'function') return '';
  const style = getComputedStyle(document.documentElement);
  const lines = TOKENS.map((name) => `  ${name}: ${style.getPropertyValue(name).trim()};`);
  return `:root {\n${lines.join('\n')}\n}`;
}

export interface ExportOptions {
  /** Title for the page, usually the file name without its extension. */
  title: string;
  /** Folder of the document, for resolving relative image paths. */
  dir: string;
  /** Width of the text column, matching the reader's own setting. */
  pageWidth?: number;
}

/** Formulas as MathML: no stylesheet, no fonts, drawn by the browser itself. */
async function mathRenderer(): Promise<(formula: string, display: boolean) => string> {
  const katex = await import('katex');
  return (formula, display) => {
    try {
      return katex.default.renderToString(formula, {
        displayMode: display,
        output: 'mathml',
        throwOnError: false,
        strict: 'ignore'
      });
    } catch {
      return escapeHtml(formula);
    }
  };
}

/**
 * Diagrams as SVG, drawn once here rather than by whoever opens the file.
 *
 * Mermaid renders asynchronously, and the document walk is synchronous — so
 * the diagrams are drawn first, in document order, and handed to the walk as
 * a finished list.
 */
async function renderDiagrams(state: EditorState): Promise<string[]> {
  const sources = [...state.doc.toString().matchAll(/```mermaid\n([\s\S]*?)```/g)].map(
    (m) => m[1] ?? ''
  );
  if (sources.length === 0) return [];

  const mermaid = await import('mermaid');
  mermaid.default.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'neutral' });

  const out: string[] = [];
  for (let i = 0; i < sources.length; i++) {
    try {
      const { svg } = await mermaid.default.render(`verso-export-${i}`, sources[i]!);
      out.push(svg);
    } catch {
      out.push(''); // falls back to the fence as code
    }
  }
  return out;
}

/** Local pictures become data URIs; remote ones are left as they are. */
async function embedImages(state: EditorState, dir: string): Promise<Map<string, string>> {
  const urls = new Set<string>();
  for (const match of state.doc.toString().matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) {
    const url = (match[1] ?? '').trim().split(/\s+/)[0] ?? '';
    if (url && !isRemoteUrl(url) && !url.startsWith('data:')) urls.add(url);
  }

  const embedded = new Map<string, string>();
  for (const url of urls) {
    try {
      const path = joinPath(dir, decodeUrlPath(stripUrlSuffix(url)));
      embedded.set(url, await readImageDataUri(path));
    } catch {
      // A picture that cannot be read stays a link: better a broken image in
      // the export than no export at all.
    }
  }
  return embedded;
}

export async function buildStandaloneHtml(
  state: EditorState,
  options: ExportOptions
): Promise<string> {
  const [math, diagrams, images] = await Promise.all([
    mathRenderer(),
    renderDiagrams(state),
    embedImages(state, options.dir)
  ]);

  const body = renderDocumentHtml(state, {
    math,
    diagram: (_source, index) => diagrams[index] || null,
    image: (url) => images.get(url) ?? url
  });

  const width = options.pageWidth ? `  --page-width: ${options.pageWidth}px;\n` : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Verso">
<title>${escapeHtml(options.title)}</title>
<style>
${themeTokens()}
:root {
${width}}
${EXPORT_CSS}
</style>
</head>
<body>
<main class="page">
${body}
</main>
</body>
</html>
`;
}
