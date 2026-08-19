/**
 * Minimal inline-Markdown renderer used inside block widgets (table cells).
 *
 * It builds DOM nodes directly and never touches innerHTML, so document
 * content can never become executable markup — the security property the
 * architecture relies on (ARCHITECTURE §6).
 */

type Token =
  | { type: 'text'; value: string }
  | { type: 'code'; value: string }
  | { type: 'bold'; value: string }
  | { type: 'italic'; value: string }
  | { type: 'strike'; value: string }
  | { type: 'link'; value: string; href: string };

const PATTERNS: { re: RegExp; make: (m: RegExpExecArray) => Token }[] = [
  { re: /^`([^`]+)`/, make: (m) => ({ type: 'code', value: m[1]! }) },
  { re: /^\*\*([^*]+)\*\*/, make: (m) => ({ type: 'bold', value: m[1]! }) },
  { re: /^__([^_]+)__/, make: (m) => ({ type: 'bold', value: m[1]! }) },
  { re: /^~~([^~]+)~~/, make: (m) => ({ type: 'strike', value: m[1]! }) },
  { re: /^\*([^*]+)\*/, make: (m) => ({ type: 'italic', value: m[1]! }) },
  { re: /^_([^_]+)_/, make: (m) => ({ type: 'italic', value: m[1]! }) },
  {
    re: /^\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/,
    make: (m) => ({ type: 'link', value: m[1]!, href: m[2]! })
  }
];

export function tokenizeInline(source: string): Token[] {
  const tokens: Token[] = [];
  let buffer = '';
  let i = 0;

  while (i < source.length) {
    const rest = source.slice(i);

    // An escaped marker is literal text.
    if (rest.startsWith('\\') && rest.length > 1) {
      buffer += rest[1];
      i += 2;
      continue;
    }

    let matched = false;
    for (const { re, make } of PATTERNS) {
      const m = re.exec(rest);
      if (m) {
        if (buffer) {
          tokens.push({ type: 'text', value: buffer });
          buffer = '';
        }
        tokens.push(make(m));
        i += m[0].length;
        matched = true;
        break;
      }
    }

    if (!matched) {
      buffer += source[i];
      i += 1;
    }
  }

  if (buffer) tokens.push({ type: 'text', value: buffer });
  return tokens;
}

/** Render inline Markdown into `target` as safe DOM nodes. */
export function renderInline(target: HTMLElement, source: string): void {
  for (const token of tokenizeInline(source)) {
    switch (token.type) {
      case 'text':
        target.appendChild(document.createTextNode(token.value));
        break;
      case 'code': {
        const el = document.createElement('code');
        el.className = 'md-code';
        el.textContent = token.value;
        target.appendChild(el);
        break;
      }
      case 'bold': {
        const el = document.createElement('strong');
        el.className = 'md-bold';
        el.textContent = token.value;
        target.appendChild(el);
        break;
      }
      case 'italic': {
        const el = document.createElement('em');
        el.className = 'md-italic';
        el.textContent = token.value;
        target.appendChild(el);
        break;
      }
      case 'strike': {
        const el = document.createElement('s');
        el.className = 'md-strike';
        el.textContent = token.value;
        target.appendChild(el);
        break;
      }
      case 'link': {
        const el = document.createElement('span');
        el.className = 'md-link';
        el.textContent = token.value || token.href;
        el.dataset.href = token.href;
        target.appendChild(el);
        break;
      }
    }
  }
}
