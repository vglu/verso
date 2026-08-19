import { describe, expect, it } from 'vitest';
import { extensionOf, isMarkdownFile, languageLabel } from '../src/lib/editor/language';

describe('what a file is', () => {
  it('recognises the Markdown extensions', () => {
    for (const name of ['a.md', 'A.MARKDOWN', 'notes.mdown', 'x.mkd', 'doc.mdx']) {
      expect(isMarkdownFile(name)).toBe(true);
    }
  });

  it('treats a file with no extension as Markdown', () => {
    // An untitled buffer is what someone writing here is writing; a document
    // that lost its Markdown support the moment it was created would be a
    // strange way to start.
    expect(isMarkdownFile('Untitled')).toBe(true);
    expect(isMarkdownFile('README')).toBe(true);
  });

  it('does not claim data files', () => {
    for (const name of ['data.csv', 'package.json', 'config.yaml', 'page.html']) {
      expect(isMarkdownFile(name)).toBe(false);
    }
  });

  it('reads the extension off a path, not off a folder name', () => {
    expect(extensionOf('C:/my.folder/file')).toBe('');
    expect(extensionOf('/home/user/data.csv')).toBe('csv');
    expect(extensionOf('.gitignore')).toBe('');
  });

  it('names the language for the status strip', () => {
    expect(languageLabel('a.md')).toBe('Markdown');
    expect(languageLabel('package.json')).toBe('JSON');
    expect(languageLabel('weird.zzz')).toBe('ZZZ');
  });
});
