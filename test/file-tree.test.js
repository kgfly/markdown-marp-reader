import { describe, expect, it } from 'vitest';

import {
  ancestorPaths,
  buildFileTree,
  fileKind,
  fileLabel,
} from '../src/ui/file-tree.js';

describe('buildFileTree', () => {
  it('nests directories, sorts them, and lists files after folders', () => {
    const tree = buildFileTree([
      'readme.md',
      'guide/z.md',
      'guide/b.md',
      'guide/deep/pixel.png',
      'note.txt',
    ]);

    expect([...tree.dirs.keys()]).toEqual(['guide']);
    expect(tree.files.map((file) => file.name)).toEqual(['note.txt', 'readme.md']);

    const guide = tree.dirs.get('guide');
    expect(guide.path).toBe('guide');
    expect(guide.files.map((file) => file.path)).toEqual(['guide/b.md', 'guide/z.md']);
    expect([...guide.dirs.keys()]).toEqual(['deep']);
    expect(guide.dirs.get('deep').files[0].path).toBe('guide/deep/pixel.png');
  });

  it('normalizes separators and drops empty paths', () => {
    const tree = buildFileTree(['', 'docs\\a.md', '/images/pic.svg']);

    expect([...tree.dirs.keys()]).toEqual(['docs', 'images']);
    expect(tree.dirs.get('docs').files.map((file) => file.path)).toEqual(['docs/a.md']);
    expect(tree.dirs.get('images').files.map((file) => file.path)).toEqual([
      'images/pic.svg',
    ]);
  });

  it('supports an empty selection', () => {
    const tree = buildFileTree();
    expect(tree.dirs.size).toBe(0);
    expect(tree.files).toEqual([]);
  });
});

describe('ancestorPaths', () => {
  it('returns every containing directory, outermost first', () => {
    expect(ancestorPaths('a/b/c/file.md')).toEqual(['a', 'a/b', 'a/b/c']);
    expect(ancestorPaths('file.md')).toEqual([]);
    expect(ancestorPaths('a\\b\\file.md')).toEqual(['a', 'a/b']);
  });
});

describe('file labels and kinds', () => {
  it('maps common extensions to short badges', () => {
    expect(fileLabel('README.md')).toBe('MD');
    expect(fileLabel('notes.markdown')).toBe('MD');
    expect(fileLabel('photo.jpeg')).toBe('JPEG');
    expect(fileLabel('archive.tar.gz')).toBe('GZ');
    expect(fileLabel('LICENSE')).toBe('FILE');
  });

  it('classifies files for the sidebar badge', () => {
    expect(fileKind('a.md')).toBe('markdown');
    expect(fileKind('a.PNG')).toBe('image');
    expect(fileKind('a.svg')).toBe('image');
    expect(fileKind('a.pdf')).toBe('pdf');
    expect(fileKind('a.mp4')).toBe('video');
    expect(fileKind('a.mp3')).toBe('audio');
    expect(fileKind('a.json')).toBe('text');
    expect(fileKind('a.bin')).toBe('file');
  });
});
