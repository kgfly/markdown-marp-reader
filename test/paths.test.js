import { describe, expect, it } from 'vitest';

import {
  basename,
  dirname,
  extname,
  isExternalUrl,
  isMarkdownPath,
  isRelativeReference,
  joinPath,
  normalizePath,
  resolveResourcePath,
  safeDecode,
  splitResourceUrl,
  toPosix,
} from '../src/core/paths.js';

describe('path normalization', () => {
  it('converts backslashes and collapses segments', () => {
    expect(toPosix('docs\\img\\a.png')).toBe('docs/img/a.png');
    expect(normalizePath('docs\\img\\..\\a.png')).toBe('docs/a.png');
    expect(normalizePath('./docs//./a.md')).toBe('docs/a.md');
    expect(normalizePath('/docs/../a.md')).toBe('/a.md');
    expect(normalizePath('../../a.md')).toBe('../../a.md');
    expect(normalizePath('')).toBe('');
    expect(normalizePath(null)).toBe('');
  });

  it('computes dirname, basename, extension and joins', () => {
    expect(dirname('docs/a/b.md')).toBe('docs/a');
    expect(dirname('a.md')).toBe('');
    expect(dirname('/a.md')).toBe('/');
    expect(basename('docs/a/b.md')).toBe('b.md');
    expect(basename('docs/a/')).toBe('a');
    expect(basename('')).toBe('');
    expect(extname('a.MARKDOWN')).toBe('.markdown');
    expect(extname('.hidden')).toBe('');
    expect(extname('archive.tar.gz')).toBe('.gz');
    expect(joinPath('docs', 'img/a.png')).toBe('docs/img/a.png');
    expect(joinPath('', 'a.md')).toBe('a.md');
    expect(joinPath('docs', '')).toBe('docs');
    expect(joinPath('docs', '../a.md')).toBe('a.md');
  });

  it('recognises Markdown files', () => {
    expect(isMarkdownPath('a.md')).toBe(true);
    expect(isMarkdownPath('a.MARKDOWN')).toBe(true);
    expect(isMarkdownPath('a.mdown')).toBe(true);
    expect(isMarkdownPath('a.txt')).toBe(false);
    expect(isMarkdownPath('md')).toBe(false);
  });
});

describe('URL handling', () => {
  it('classifies external URLs', () => {
    for (const url of [
      'https://x',
      'http://x',
      '//cdn/x',
      'data:image/png;base64,x',
      'mailto:a@b',
      'file:///x',
    ]) {
      expect(isExternalUrl(url)).toBe(true);
    }
    for (const url of ['img/a.png', '/img/a.png', '#anchor', '', null]) {
      expect(isExternalUrl(url)).toBe(false);
    }
    expect(isRelativeReference('img/a.png')).toBe(true);
    expect(isRelativeReference('#anchor')).toBe(false);
    expect(isRelativeReference('https://x')).toBe(false);
    expect(isRelativeReference('')).toBe(false);
  });

  it('splits query/hash suffixes and angle brackets', () => {
    expect(splitResourceUrl('img/a.png')).toEqual({ path: 'img/a.png', suffix: '' });
    expect(splitResourceUrl('<my image.png>')).toEqual({
      path: 'my image.png',
      suffix: '',
    });
    expect(splitResourceUrl('img/a.png?raw=1#frag')).toEqual({
      path: 'img/a.png',
      suffix: '?raw=1#frag',
    });
    expect(splitResourceUrl('img/a%20b.png#x')).toEqual({
      path: 'img/a b.png',
      suffix: '#x',
    });
    expect(splitResourceUrl('bad%E0%A4%A.png')).toEqual({
      path: 'bad%E0%A4%A.png',
      suffix: '',
    });
  });

  it('decodes safely', () => {
    expect(safeDecode('a%20b')).toBe('a b');
    expect(safeDecode('%E0%A4%A')).toBe('%E0%A4%A');
  });
});

describe('resolveResourcePath', () => {
  it('resolves relative references against the document', () => {
    expect(resolveResourcePath('slides/deck.md', 'img/a.png')).toEqual({
      path: 'slides/img/a.png',
      suffix: '',
    });
    expect(resolveResourcePath('docs/a.md', '../img/a.png')).toEqual({
      path: 'img/a.png',
      suffix: '',
    });
    expect(resolveResourcePath('docs/a.md', './img/a%20b.png?v=1')).toEqual({
      path: 'docs/img/a b.png',
      suffix: '?v=1',
    });
  });

  it('treats a leading slash as the selected folder root', () => {
    expect(resolveResourcePath('docs/a.md', '/assets/logo.svg')).toEqual({
      path: 'assets/logo.svg',
      suffix: '',
    });
  });

  it('returns null for external, anchor and empty references', () => {
    expect(resolveResourcePath('a.md', 'https://example.com/a.png')).toBeNull();
    expect(resolveResourcePath('a.md', 'data:image/png;base64,xx')).toBeNull();
    expect(resolveResourcePath('a.md', '#section')).toBeNull();
    expect(resolveResourcePath('a.md', '')).toBeNull();
    expect(resolveResourcePath('a.md', '   ')).toBeNull();
    expect(resolveResourcePath('a.md', '<>')).toBeNull();
  });
});
