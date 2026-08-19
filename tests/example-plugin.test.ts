import { describe, expect, it } from 'vitest';
// The example plugin is tested as what it is — a plain module with one
// exported function — because that is exactly how the worker will load it.
// If this import ever needs a build step, the plugin contract has grown
// something it should not have.
// @ts-expect-error — a plugin is plain JavaScript with no types, exactly as
// someone writing one would have it. Typing it here would test a fiction.
import { format } from '../examples/plugins/tidy-markdown/index.js';

const ctx = { fileName: 'notes.md', ext: 'md', selection: null, indent: 2 };

const run = (text: string) => {
  const result = format(text, ctx);
  return typeof result === 'string' ? result : (result?.text ?? null);
};

describe('the example plugin', () => {
  it('makes list markers consistent', () => {
    expect(run('* one\n+ two\n- three\n')).toBe('- one\n- two\n- three\n');
  });

  it('renumbers an ordered list in the order it is actually in', () => {
    expect(run('1. one\n1. two\n5. three\n')).toBe('1. one\n2. two\n3. three\n');
  });

  it('starts counting again after the list ends', () => {
    const text = '1. one\n1. two\n\nprose\n\n1. fresh\n1. list\n';
    expect(run(text)).toBe('1. one\n2. two\n\nprose\n\n1. fresh\n2. list\n');
  });

  it('normalises a hard line break to two spaces, and removes the rest', () => {
    // Two or more trailing spaces are a line break in CommonMark, so three of
    // them carry meaning and become two; a single one is noise and goes.
    expect(run('a   \nb  \nc \nd\n')).toBe('a  \nb  \nc\nd\n');
  });

  it('leaves the inside of a fenced block completely alone', () => {
    // Trailing spaces matter in code, and renumbering someone's shell script
    // would be vandalism dressed as tidying. The messy line after the fence is
    // there to prove the plugin ran and simply refused to touch the code.
    const text = '```sh\n1) first   \n*  not a bullet\n```\n\n*  outside\n';
    expect(run(text)).toBe('```sh\n1) first   \n*  not a bullet\n```\n\n- outside\n');
  });

  it('collapses runs of blank lines and ends the file with one newline', () => {
    expect(run('a\n\n\n\nb\n\n\n')).toBe('a\n\nb\n');
  });

  it('says nothing when there is nothing to say', () => {
    // The contract's most important case: a document that is already tidy
    // must not be "formatted" into a dirty tab and a lost undo step.
    expect(format('- one\n- two\n', ctx)).toBeNull();
  });

  it('reports what it did', () => {
    const result = format('* one   \n', ctx);
    expect(typeof result === 'object' && result?.note).toMatch(/tidied \d+ line/);
  });
});
