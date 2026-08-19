import { EditorSelection } from '@codemirror/state';
import { EditorView, WidgetType } from '@codemirror/view';
import { setEditing } from './editing';

/**
 * Clicking a rendered block puts the caret into its source.
 *
 * Without this a widget is a dead end: the block looks finished, and there is
 * no way to get at the text behind it — which is how a Mermaid diagram or a
 * display formula becomes uneditable.
 */
function editOnClick(host: HTMLElement, view: EditorView, from: number): void {
  host.addEventListener('mousedown', (event) => {
    event.preventDefault();
    const pos = Math.min(from + 1, view.state.doc.length);
    view.dispatch({
      selection: EditorSelection.cursor(pos),
      // Clicking a rendered block to get at its source is unambiguously an
      // intent to edit; without saying so the caret arrives and the document
      // stays frozen, which reads as the click not having worked.
      effects: setEditing.of(true),
      scrollIntoView: false
    });
    view.focus();
  });
}

/**
 * Widgets whose renderers are heavy (KaTeX, Mermaid). Both are imported
 * lazily: a document without formulas or diagrams never pays for them, which
 * is what keeps cold start inside its budget (ARCHITECTURE §7).
 */

let katexLoader: Promise<typeof import('katex')> | null = null;
let mermaidLoader: Promise<typeof import('mermaid')> | null = null;
let mermaidCounter = 0;

function loadKatex(): Promise<typeof import('katex')> {
  if (!katexLoader) {
    katexLoader = Promise.all([import('katex'), import('katex/dist/katex.min.css')]).then(
      ([mod]) => mod
    );
  }
  return katexLoader;
}

function loadMermaid(): Promise<typeof import('mermaid')> {
  if (!mermaidLoader) {
    mermaidLoader = import('mermaid').then((mod) => {
      mod.default.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: currentThemeIsDark() ? 'dark' : 'default',
        fontFamily: 'var(--font-text)'
      });
      return mod;
    });
  }
  return mermaidLoader;
}

function currentThemeIsDark(): boolean {
  return document.documentElement.getAttribute('data-theme') === 'dark';
}

/** Rendered TeX, inline (`$x$`) or display (`$$x$$`). */
export class MathWidget extends WidgetType {
  constructor(
    readonly formula: string,
    readonly display: boolean,
    readonly from = -1
  ) {
    super();
  }

  eq(other: MathWidget): boolean {
    return other.formula === this.formula && other.display === this.display;
  }

  get estimatedHeight(): number {
    return this.display ? 48 : -1;
  }

  toDOM(view: EditorView): HTMLElement {
    const host = document.createElement(this.display ? 'div' : 'span');
    if (this.display && this.from >= 0) editOnClick(host, view, this.from);
    host.className = this.display ? 'md-math md-math-display' : 'md-math';
    // Until KaTeX arrives, show the source: never a blank gap.
    host.textContent = this.formula;

    void loadKatex()
      .then((katex) => {
        katex.default.render(this.formula, host, {
          displayMode: this.display,
          throwOnError: false,
          output: 'html',
          strict: 'ignore'
        });
      })
      .catch(() => {
        host.classList.add('md-math-error');
      });

    return host;
  }
}

/**
 * Rendered Mermaid diagram from a ```mermaid fence.
 *
 * The active theme is part of the widget's identity: Mermaid bakes colors
 * into the SVG it produces, so a diagram rendered for the light theme has to
 * be rebuilt when the user switches to dark.
 */
export class MermaidWidget extends WidgetType {
  readonly theme: string;

  constructor(
    readonly source: string,
    readonly from = -1
  ) {
    super();
    this.theme = currentThemeIsDark() ? 'dark' : 'light';
  }

  eq(other: MermaidWidget): boolean {
    return other.source === this.source && other.theme === this.theme;
  }

  get estimatedHeight(): number {
    return Math.max(120, this.source.split('\n').length * 26);
  }

  toDOM(view: EditorView): HTMLElement {
    const host = document.createElement('div');
    host.className = 'md-mermaid';
    if (this.from >= 0) editOnClick(host, view, this.from);

    const placeholder = document.createElement('pre');
    placeholder.className = 'md-mermaid-loading';
    placeholder.textContent = this.source;
    host.appendChild(placeholder);

    mermaidCounter += 1;
    const id = `mdviewer-mermaid-${mermaidCounter}`;

    void loadMermaid()
      .then((mod) => mod.default.render(id, this.source))
      .then(({ svg }) => {
        // Mermaid returns an SVG string; parse it rather than assigning
        // innerHTML so nothing from the document can execute.
        const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
        const node = doc.documentElement;
        if (node.nodeName.toLowerCase() !== 'svg') throw new Error('not an svg');
        node.querySelectorAll('script').forEach((s) => s.remove());
        host.replaceChildren(document.importNode(node, true));
      })
      .catch((error) => {
        placeholder.classList.add('md-mermaid-error');
        placeholder.textContent = `${this.source}\n\n${String(error)}`;
      });

    return host;
  }

  /** Let clicks through, so the diagram can be opened for editing. */
  ignoreEvent(): boolean {
    return false;
  }
}

/** Drop the configured renderer so the next diagram picks up the new theme. */
export function resetMermaid(): void {
  mermaidLoader = null;
}

/** Event the app fires after switching themes. */
export const THEME_CHANGED_EVENT = 'mdviewer:theme-changed';
