import { describe, expect, it, beforeEach } from 'vitest';
import { resolveLang, setLang, getLang, t } from '../src/lib/stores/i18n';

describe('i18n', () => {
  beforeEach(() => setLang('en'));

  it('resolves explicit languages', () => {
    expect(resolveLang('uk')).toBe('uk');
    expect(resolveLang('en')).toBe('en');
  });

  it('falls back to a supported language for system', () => {
    expect(['uk', 'en']).toContain(resolveLang('system'));
  });

  it('translates known keys per language', () => {
    setLang('en');
    expect(t('empty.openFile')).toBe('Open file');
    setLang('uk');
    expect(t('empty.openFile')).toBe('Відкрити файл');
    expect(getLang()).toBe('uk');
  });

  it('substitutes placeholders', () => {
    setLang('en');
    expect(t('save.prompt', { name: 'notes.md' })).toBe('Save changes to notes.md?');
  });

  it('returns the key itself when nothing matches', () => {
    expect(t('does.not.exist')).toBe('does.not.exist');
  });

  it('falls back to english when a key is missing in the active language', () => {
    setLang('uk');
    // Every uk key must exist; this guards against silent dictionary drift.
    expect(t('empty.title')).not.toBe('empty.title');
  });
});

describe('the two dictionaries stay in step', () => {
  it('has a Ukrainian string for every English one', async () => {
    // A missing key falls back to English silently, so half a translated
    // interface looks like a finished one until someone reads it.
    const source = await import('node:fs').then((fs) =>
      fs.readFileSync('src/lib/stores/i18n.ts', 'utf8')
    );

    const keysOf = (name: string): string[] => {
      const start = source.indexOf(`const ${name}: Dict = {`);
      const end = source.indexOf('\n};', start);
      return [...source.slice(start, end).matchAll(/^ {2}'([^']+)':/gm)].map((m) => m[1]!);
    };

    const en = keysOf('en');
    const uk = keysOf('uk');

    expect(en.length).toBeGreaterThan(100);
    expect(uk.filter((k) => !en.includes(k))).toEqual([]);
    expect(en.filter((k) => !uk.includes(k))).toEqual([]);
  });
});
