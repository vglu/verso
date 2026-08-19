import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';
import { frontmatterRange } from '../editor/frontmatter';
import { displayMathOnLine, findInlineMath } from '../editor/mathScan';

/**
 * Markdown to HTML.
 *
 * The editor never does this: it decorates the source in place, which is what
 * makes the file the only source of truth. Exporting is the one moment a
 * document has to become something else, and this is the only place that
 * happens.
 *
 * Written against the same syntax tree the editor renders from, rather than
 * bringing in a second Markdown implementation. Two parsers means a document
 * that looks one way on screen and another in the file you sent someone, and
 * the difference is found by the person you sent it to.
 */

export interface RenderOptions {
  /** Turns a formula into HTML. Absent: the source is shown as written. */
  math?: (formula: string, display: boolean) => string;
  /** Turns a Mermaid source into an SVG. Absent: the source is shown as code. */
  diagram?: (source: string, index: number) => string | null;
  /** Resolves a relative image path — usually to a data URI. */
  image?: (url: string) => string;
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
}

/** A URL safe to put in an attribute: no javascript:, no data: scripts. */
function safeUrl(url: string): string {
  const trimmed = url.trim().replace(/^<|>$/g, '');
  if (/^\s*javascript:/i.test(trimmed) || /^\s*vbscript:/i.test(trimmed)) return '';
  return escapeHtml(trimmed);
}

class Renderer {
  private out: string[] = [];
  private diagrams = 0;

  constructor(
    private state: EditorState,
    private options: RenderOptions
  ) {}

  render(): string {
    const tree = syntaxTree(this.state);
    const matter = frontmatterRange(this.state);
    const skipTo = matter ? matter.to : -1;

    let node = tree.topNode.firstChild;
    while (node) {
      // Front matter is metadata about the document, not part of it.
      if (node.from < skipTo) {
        node = node.nextSibling;
        continue;
      }
      this.block(node);
      node = node.nextSibling;
    }

    return this.out.join('\n');
  }

  private text(from: number, to: number): string {
    return this.state.doc.sliceString(from, to);
  }

  private block(node: SyntaxNode): void {
    const name = node.name;

    const atx = /^ATXHeading([1-6])$/.exec(name);
    const setext = /^SetextHeading([12])$/.exec(name);
    if (atx || setext) {
      const level = Number((atx ?? setext)![1]);
      const content = this.inlineOf(node, this.headingBody(node));
      this.out.push(`<h${level}>${content}</h${level}>`);
      return;
    }

    switch (name) {
      case 'Paragraph':
        this.paragraph(node);
        return;
      case 'Blockquote':
        this.out.push('<blockquote>');
        this.children(node, (child) => this.block(child));
        this.out.push('</blockquote>');
        return;
      case 'BulletList':
      case 'OrderedList':
        this.list(node, name === 'OrderedList');
        return;
      case 'FencedCode':
      case 'CodeBlock':
        this.code(node);
        return;
      case 'Table':
        this.table(node);
        return;
      case 'HorizontalRule':
        this.out.push('<hr>');
        return;
      case 'HTMLBlock':
        // Raw HTML is shown as text, never executed — the same rule the
        // editor holds to (DATA-SAFETY §7).
        this.out.push(`<pre class="raw-html">${escapeHtml(this.text(node.from, node.to))}</pre>`);
        return;
      case 'LinkReference':
        return; // a definition, not content
      default:
        return;
    }
  }

  /** The text of a heading, without its `#`s or its underline. */
  private headingBody(node: SyntaxNode): { from: number; to: number } {
    const mark = node.getChild('HeaderMark');
    const line = this.state.doc.lineAt(node.from);
    const from = mark && mark.from === node.from ? mark.to : node.from;
    return { from, to: Math.min(node.to, line.to) };
  }

  private paragraph(node: SyntaxNode): void {
    // `$$ … $$` written as its own paragraph is a formula, not prose.
    const raw = this.text(node.from, node.to).trim();
    const oneLiner = displayMathOnLine(raw);
    if (oneLiner !== null) {
      this.out.push(this.displayMath(oneLiner));
      return;
    }
    if (raw.startsWith('$$') && raw.endsWith('$$') && raw.length > 4) {
      this.out.push(this.displayMath(raw.slice(2, -2).trim()));
      return;
    }

    this.out.push(`<p>${this.inlineOf(node, { from: node.from, to: node.to })}</p>`);
  }

  private displayMath(formula: string): string {
    const rendered = this.options.math?.(formula, true);
    if (rendered) return `<div class="math-display">${rendered}</div>`;
    return `<pre class="math-source">${escapeHtml(formula)}</pre>`;
  }

  private list(node: SyntaxNode, ordered: boolean): void {
    const tag = ordered ? 'ol' : 'ul';
    const start = ordered ? this.listStart(node) : 1;
    this.out.push(start > 1 ? `<${tag} start="${start}">` : `<${tag}>`);

    this.children(node, (item) => {
      if (item.name !== 'ListItem') return;
      this.listItem(item);
    });

    this.out.push(`</${tag}>`);
  }

  private listStart(node: SyntaxNode): number {
    const first = node.firstChild?.getChild('ListMark');
    if (!first) return 1;
    const value = Number.parseInt(this.text(first.from, first.to), 10);
    return Number.isFinite(value) ? value : 1;
  }

  private listItem(item: SyntaxNode): void {
    const task = item.getChild('Task')?.getChild('TaskMarker') ?? item.getChild('TaskMarker');
    const checked = task ? /[xX]/.test(this.text(task.from, task.to)) : false;

    this.out.push(task ? `<li class="task">${this.checkbox(checked)}` : '<li>');

    let child = item.firstChild;
    let wroteBlock = false;
    while (child) {
      if (child.name === 'ListMark' || child.name === 'TaskMarker') {
        child = child.nextSibling;
        continue;
      }
      if (child.name === 'Paragraph' && !wroteBlock) {
        // The first paragraph of an item is the item's own text: no <p>, or
        // every list in the document gains a blank line between its markers
        // and its words.
        const body = this.inlineOf(child, this.afterTask(child, task));
        this.out.push(body);
        wroteBlock = true;
      } else {
        this.block(child);
      }
      child = child.nextSibling;
    }

    this.out.push('</li>');
  }

  private afterTask(node: SyntaxNode, task: SyntaxNode | null): { from: number; to: number } {
    const from = task && task.to > node.from && task.to < node.to ? task.to : node.from;
    return { from, to: node.to };
  }

  private checkbox(checked: boolean): string {
    return `<input type="checkbox" disabled${checked ? ' checked' : ''}> `;
  }

  private code(node: SyntaxNode): void {
    const info = node.getChild('CodeInfo');
    const language = info ? this.text(info.from, info.to).trim() : '';
    const body = node.getChild('CodeText');
    const source = body ? this.text(body.from, body.to) : '';

    if (language.toLowerCase() === 'mermaid') {
      const svg = this.options.diagram?.(source, this.diagrams++);
      if (svg) {
        this.out.push(`<figure class="diagram">${svg}</figure>`);
        return;
      }
    }

    const cls = language ? ` class="language-${escapeHtml(language)}"` : '';
    this.out.push(`<pre><code${cls}>${escapeHtml(source)}</code></pre>`);
  }

  private table(node: SyntaxNode): void {
    const aligns: (string | null)[] = [];
    const rows: { cells: string[]; header: boolean }[] = [];

    this.children(node, (row) => {
      if (row.name === 'TableDelimiter') {
        for (const part of this.text(row.from, row.to).split('|')) {
          const cell = part.trim();
          if (!cell) continue;
          const left = cell.startsWith(':');
          const right = cell.endsWith(':');
          aligns.push(left && right ? 'center' : right ? 'right' : left ? 'left' : null);
        }
        return;
      }
      if (row.name !== 'TableHeader' && row.name !== 'TableRow') return;

      const cells: string[] = [];
      this.children(row, (cell) => {
        if (cell.name !== 'TableCell') return;
        cells.push(this.inlineOf(cell, { from: cell.from, to: cell.to }));
      });
      rows.push({ cells, header: row.name === 'TableHeader' });
    });

    const cell = (html: string, index: number, header: boolean): string => {
      const align = aligns[index];
      const style = align ? ` style="text-align:${align}"` : '';
      const tag = header ? 'th' : 'td';
      return `<${tag}${style}>${html}</${tag}>`;
    };

    this.out.push('<table>');
    const header = rows.find((r) => r.header);
    if (header) {
      this.out.push('<thead><tr>');
      header.cells.forEach((html, i) => this.out.push(cell(html, i, true)));
      this.out.push('</tr></thead>');
    }
    this.out.push('<tbody>');
    for (const row of rows.filter((r) => !r.header)) {
      this.out.push('<tr>');
      row.cells.forEach((html, i) => this.out.push(cell(html, i, false)));
      this.out.push('</tr>');
    }
    this.out.push('</tbody></table>');
  }

  private children(node: SyntaxNode, visit: (child: SyntaxNode) => void): void {
    let child = node.firstChild;
    while (child) {
      visit(child);
      child = child.nextSibling;
    }
  }

  // ---- inline ----

  /**
   * Inline content of a node, over an explicit range.
   *
   * The range matters: a heading's content starts after its `#`s, and a task
   * item's after its checkbox, and both are the same node as the marker.
   */
  private inlineOf(node: SyntaxNode, range: { from: number; to: number }): string {
    let html = '';
    let at = range.from;

    const child = (n: SyntaxNode | null): void => {
      let current = n;
      while (current) {
        if (current.to <= range.from || current.from >= range.to) {
          current = current.nextSibling;
          continue;
        }
        if (current.from > at) html += this.plain(at, current.from);
        html += this.inlineNode(current);
        at = Math.max(at, current.to);
        current = current.nextSibling;
      }
    };

    child(node.firstChild);
    if (at < range.to) html += this.plain(at, range.to);
    return html.trim();
  }

  private inlineNode(node: SyntaxNode): string {
    const inner = (): string => this.inlineOf(node, { from: node.from, to: node.to });
    const stripped = (marks: string[]): string => {
      const first = node.getChild(marks[0]!);
      const last = node.lastChild;
      const from = first ? first.to : node.from;
      const to = last && marks.includes(last.name) ? last.from : node.to;
      return this.inlineOf(node, { from, to });
    };

    switch (node.name) {
      case 'StrongEmphasis':
        return `<strong>${stripped(['EmphasisMark'])}</strong>`;
      case 'Emphasis':
        return `<em>${stripped(['EmphasisMark'])}</em>`;
      case 'Strikethrough':
        return `<del>${stripped(['StrikethroughMark'])}</del>`;
      case 'InlineCode': {
        const marks = node.getChildren('CodeMark');
        const from = marks[0]?.to ?? node.from;
        const to = marks[marks.length - 1]?.from ?? node.to;
        return `<code>${escapeHtml(this.text(from, to))}</code>`;
      }
      case 'Image':
        return this.image(node);
      case 'Link':
        return this.link(node);
      case 'Autolink':
      case 'URL': {
        const url = this.text(node.from, node.to).replace(/^<|>$/g, '');
        const href = safeUrl(url);
        return href ? `<a href="${href}">${escapeHtml(url)}</a>` : escapeHtml(url);
      }
      case 'HardBreak':
        return '<br>';
      case 'Escape':
        return escapeHtml(this.text(node.from + 1, node.to));
      case 'HTMLTag':
        return escapeHtml(this.text(node.from, node.to));
      case 'Entity':
        return this.text(node.from, node.to);
      default:
        return inner() || escapeHtml(this.text(node.from, node.to));
    }
  }

  private link(node: SyntaxNode): string {
    const url = node.getChild('URL');
    const marks = node.getChildren('LinkMark');
    const textFrom = marks[0]?.to ?? node.from + 1;
    const textTo = marks[1]?.from ?? textFrom;
    const label = this.inlineOf(node, { from: textFrom, to: textTo });

    if (!url) return label || escapeHtml(this.text(node.from, node.to));
    const href = safeUrl(this.text(url.from, url.to));
    if (!href) return label;
    return `<a href="${href}">${label}</a>`;
  }

  private image(node: SyntaxNode): string {
    const url = node.getChild('URL');
    if (!url) return escapeHtml(this.text(node.from, node.to));

    const marks = node.getChildren('LinkMark');
    const altFrom = marks[0]?.to ?? node.from + 2;
    const altTo = marks[1]?.from ?? altFrom;
    const alt = altTo > altFrom ? this.text(altFrom, altTo) : '';

    const raw = this.text(url.from, url.to).replace(/^<|>$/g, '');
    const src = this.options.image?.(raw) ?? raw;
    return `<img src="${safeUrl(src)}" alt="${escapeHtml(alt)}">`;
  }

  /** Literal text between nodes, with inline formulas resolved. */
  private plain(from: number, to: number): string {
    const text = this.text(from, to);
    const formulas = findInlineMath(text);
    if (formulas.length === 0) return escapeHtml(text);

    let html = '';
    let at = 0;
    for (const math of formulas) {
      html += escapeHtml(text.slice(at, math.from));
      const rendered = this.options.math?.(math.formula, false);
      html += rendered
        ? `<span class="math-inline">${rendered}</span>`
        : escapeHtml(text.slice(math.from, math.to));
      at = math.to;
    }
    return html + escapeHtml(text.slice(at));
  }
}

/**
 * Render a document to an HTML fragment — the body, without a page around it.
 *
 * The parse is forced first: the tree is built lazily as the reader scrolls,
 * and exporting half a document because the rest had not been looked at yet
 * would be the worst kind of bug — silent, and only in the copy you sent.
 */
export function renderDocumentHtml(state: EditorState, options: RenderOptions = {}): string {
  ensureSyntaxTree(state, state.doc.length, 10_000);
  return new Renderer(state, options).render();
}
