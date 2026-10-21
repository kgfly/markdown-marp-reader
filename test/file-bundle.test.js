import { beforeEach, describe, expect, it } from 'vitest';

import { FileBundle, pathForFile, pickInitialMarkdown } from '../src/core/file-bundle.js';
import { makeFile } from './helpers.js';

describe('FileBundle', () => {
  let docs;

  beforeEach(() => {
    docs = makeFile('# Docs', 'docs.md', 'guide/docs.md');
  });

  it('indexes files by their bundle path and is case-insensitive', () => {
    const bundle = new FileBundle([docs]);
    expect(bundle.size).toBe(1);
    expect(bundle.paths()).toEqual(['guide/docs.md']);
    expect(bundle.get('guide/docs.md')).toBe(docs);
    expect(bundle.get('GUIDE/DOCS.MD')).toBe(docs);
    expect(bundle.has('guide/docs.md')).toBe(true);
    expect(bundle.has('missing.md')).toBe(false);
  });

  it('accepts { path, file } entries and ignores invalid ones', () => {
    const bundle = new FileBundle([
      { path: 'a/b.md', file: makeFile('x', 'b.md') },
      { path: '', file: makeFile('x', 'blank.md') },
      { path: 'nope.md', file: 'not a file' },
      null,
    ]);
    expect(bundle.paths()).toEqual(['a/b.md']);
    bundle.add('bad.md', 'nope');
    expect(bundle.has('bad.md')).toBe(false);
  });

  it('lists Markdown files only', () => {
    const bundle = new FileBundle([
      makeFile('a', 'a.md', 'a.md'),
      makeFile('b', 'b.txt', 'b.txt'),
      makeFile('c', 'c.markdown', 'nested/c.markdown'),
    ]);
    expect(bundle.markdownFiles().map((entry) => entry.path)).toEqual([
      'a.md',
      'nested/c.markdown',
    ]);
  });

  it('reads text and reports missing files', async () => {
    const bundle = new FileBundle([docs]);
    await expect(bundle.readText('guide/docs.md')).resolves.toBe('# Docs');
    await expect(bundle.readText('missing.md')).rejects.toThrow(
      'File not found in selection: missing.md',
    );
  });

  it('caches object URLs and revokes them once', () => {
    const bundle = new FileBundle([docs]);
    const first = bundle.objectUrl('guide/docs.md');
    const second = bundle.objectUrl('GUIDE/DOCS.MD');
    expect(first).toBe(second);
    expect(URL.createObjectURL).toHaveBeenCalledWith(docs);
    expect(bundle.objectUrl('missing.md')).toBeNull();

    const created = first;
    bundle.release();
    bundle.release();
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(created);
  });
});

describe('pathForFile', () => {
  it('prefers webkitRelativePath and falls back to the name', () => {
    expect(pathForFile(makeFile('x', 'a.md', 'folder/a.md'))).toBe('folder/a.md');
    expect(pathForFile(makeFile('x', 'a.md'))).toBe('a.md');
    const custom = makeFile('x', 'a.md');
    custom.__path = 'custom\\a.md';
    expect(pathForFile(custom)).toBe('custom/a.md');
  });
});

describe('pickInitialMarkdown', () => {
  it('prefers README or index files', () => {
    const bundle = new FileBundle([
      makeFile('x', 'aaa.md', 'aaa.md'),
      makeFile('x', 'README.md', 'README.md'),
      makeFile('x', 'index.md', 'nested/index.md'),
    ]);
    expect(pickInitialMarkdown(bundle)).toBe('README.md');
  });

  it('falls back to the shallowest, then alphabetical file', () => {
    const bundle = new FileBundle([
      makeFile('x', 'z.md', 'deep/z.md'),
      makeFile('x', 'b.md', 'b.md'),
      makeFile('x', 'a.md', 'a.md'),
    ]);
    expect(pickInitialMarkdown(bundle)).toBe('a.md');
  });

  it('returns null when there is no Markdown', () => {
    expect(pickInitialMarkdown(new FileBundle([]))).toBeNull();
    expect(pickInitialMarkdown(new FileBundle([makeFile('x', 'a.txt')]))).toBeNull();
  });
});
