import { describe, expect, it } from 'vitest';
import { renderInline, tokenizeInline } from '../src/lib/editor/livePreview/inline';

describe('tokenizeInline', () => {
  it('splits emphasis, code and links', () => {
    expect(tokenizeInline('a **b** c')).toEqual([
      { type: 'text', value: 'a ' },
      { type: 'bold', value: 'b' },
      { type: 'text', value: ' c' }
    ]);
    expect(tokenizeInline('`x`')).toEqual([{ type: 'code', value: 'x' }]);
    expect(tokenizeInline('[label](https://x.dev)')).toEqual([
      { type: 'link', value: 'label', href: 'https://x.dev' }
    ]);
  });

  it('treats an escaped marker as literal text', () => {
    expect(tokenizeInline('\\*not italic\\*')).toEqual([{ type: 'text', value: '*not italic*' }]);
  });

  it('leaves unmatched markers alone', () => {
    expect(tokenizeInline('2 * 3 * 4')).toEqual([
      { type: 'text', value: '2 ' },
      { type: 'italic', value: ' 3 ' },
      { type: 'text', value: ' 4' }
    ]);
  });
});

describe('renderInline', () => {
  it('builds elements, never markup', () => {
    const host = document.createElement('div');
    renderInline(host, 'a **b** and `c`');
    expect(host.querySelector('strong')?.textContent).toBe('b');
    expect(host.querySelector('code')?.textContent).toBe('c');
  });

  it('never turns document text into live markup', () => {
    const host = document.createElement('div');
    renderInline(host, '<img src=x onerror=alert(1)>');
    expect(host.querySelector('img')).toBeNull();
    expect(host.textContent).toBe('<img src=x onerror=alert(1)>');
  });

  it('keeps a link target in a data attribute, not an href', () => {
    const host = document.createElement('div');
    renderInline(host, '[go](javascript:alert(1))');
    const link = host.querySelector('.md-link') as HTMLElement;
    expect(link.tagName).toBe('SPAN');
    expect(link.getAttribute('href')).toBeNull();
  });
});
