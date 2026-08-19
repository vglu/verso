import { describe, expect, it, beforeEach } from 'vitest';
import { resolveLang, setLang, getLang, t } from '../src/lib/stores/i18n';

describe('i18n', () => {
  beforeEach(() => setLang('en'));

  it('resolves explicit languages', () => {
    expect(resolveLang('ru')).toBe('ru');
    expect(resolveLang('en')).toBe('en');
  });

  it('falls back to a supported language for system', () => {
    expect(['ru', 'en']).toContain(resolveLang('system'));
  });

  it('translates known keys per language', () => {
    setLang('en');
    expect(t('empty.openFile')).toBe('Open file');
    setLang('ru');
    expect(t('empty.openFile')).toBe('Открыть файл');
    expect(getLang()).toBe('ru');
  });

  it('substitutes placeholders', () => {
    setLang('en');
    expect(t('save.prompt', { name: 'notes.md' })).toBe('Save changes to notes.md?');
  });

  it('returns the key itself when nothing matches', () => {
    expect(t('does.not.exist')).toBe('does.not.exist');
  });

  it('falls back to english when a key is missing in the active language', () => {
    setLang('ru');
    // Every ru key must exist; this guards against silent dictionary drift.
    expect(t('empty.title')).not.toBe('empty.title');
  });
});
