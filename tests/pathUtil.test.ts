import { describe, expect, it } from 'vitest';
import {
  baseName,
  decodeUrlPath,
  dirName,
  isAbsolutePath,
  isRemoteUrl,
  joinPath,
  stripUrlSuffix
} from '../src/lib/editor/pathUtil';

describe('path classification', () => {
  it('detects absolute paths on both platforms', () => {
    expect(isAbsolutePath('/home/user/a.md')).toBe(true);
    expect(isAbsolutePath('D:\\Projects\\a.md')).toBe(true);
    expect(isAbsolutePath('images/a.png')).toBe(false);
  });

  it('detects remote and inline urls', () => {
    expect(isRemoteUrl('https://x.dev/a.png')).toBe(true);
    expect(isRemoteUrl('data:image/png;base64,AAA')).toBe(true);
    expect(isRemoteUrl('./a.png')).toBe(false);
  });
});

describe('joinPath', () => {
  it('joins relative paths using the base separator', () => {
    expect(joinPath('D:\\Projects\\docs', 'img/a.png')).toBe('D:\\Projects\\docs\\img\\a.png');
    expect(joinPath('/home/user/docs', 'img/a.png')).toBe('/home/user/docs/img/a.png');
  });

  it('resolves . and ..', () => {
    expect(joinPath('/home/user/docs', '../assets/a.png')).toBe('/home/user/assets/a.png');
    expect(joinPath('/home/user/docs', './a.png')).toBe('/home/user/docs/a.png');
  });

  it('never climbs above a windows drive root', () => {
    expect(joinPath('D:\\', '../../a.png')).toBe('D:\\a.png');
  });

  it('passes absolute targets through', () => {
    expect(joinPath('/home/user', '/etc/a.png')).toBe('/etc/a.png');
  });
});

describe('url helpers', () => {
  it('strips fragments and queries', () => {
    expect(stripUrlSuffix('a.png#frag')).toBe('a.png');
    expect(stripUrlSuffix('a.png?v=2')).toBe('a.png');
    expect(stripUrlSuffix('a.png')).toBe('a.png');
  });

  it('decodes percent escapes and survives broken input', () => {
    expect(decodeUrlPath('my%20file.png')).toBe('my file.png');
    expect(decodeUrlPath('100%')).toBe('100%');
  });
});

describe('name helpers', () => {
  it('extracts base and directory names', () => {
    expect(baseName('D:\\Projects\\docs\\a.md')).toBe('a.md');
    expect(baseName('/home/user/a.md')).toBe('a.md');
    expect(dirName('D:\\Projects\\docs\\a.md')).toBe('D:\\Projects\\docs');
    expect(dirName('/home/user/a.md')).toBe('/home/user');
  });
});
