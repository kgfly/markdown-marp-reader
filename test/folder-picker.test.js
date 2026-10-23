import { describe, expect, it, vi } from 'vitest';

import {
  pickDirectory,
  supportsDirectoryPicker,
  walkDirectoryHandle,
} from '../src/ui/folder-picker.js';
import { makeFile } from './helpers.js';

function fileHandle(name, content = 'x') {
  return {
    kind: 'file',
    name,
    getFile: async () => makeFile(content, name),
  };
}

function directoryHandle(name, children = []) {
  return {
    kind: 'directory',
    name,
    async *entries() {
      for (const child of children) yield [child.name, child];
    },
  };
}

describe('supportsDirectoryPicker', () => {
  it('detects the API on a scope', () => {
    expect(supportsDirectoryPicker({ showDirectoryPicker: () => {} })).toBe(true);
    expect(supportsDirectoryPicker({})).toBe(false);
    expect(supportsDirectoryPicker(undefined)).toBe(false);
  });
});

describe('pickDirectory', () => {
  it('reports an unsupported scope so the caller can fall back', async () => {
    await expect(pickDirectory({})).resolves.toEqual({ supported: false, entries: [] });
  });

  it('asks for read access and walks the chosen folder', async () => {
    const handle = directoryHandle('project', [
      fileHandle('README.md', '# Hi'),
      directoryHandle('docs', [fileHandle('guide.md', '# Guide')]),
      directoryHandle('img', [fileHandle('logo.svg', '<svg/>')]),
    ]);
    const showDirectoryPicker = vi.fn().mockResolvedValue(handle);

    const result = await pickDirectory({ showDirectoryPicker });

    expect(showDirectoryPicker).toHaveBeenCalledWith({ mode: 'read' });
    expect(result).toMatchObject({ supported: true, cancelled: false });
    expect(result.entries.map((entry) => entry.path)).toEqual([
      'README.md',
      'docs/guide.md',
      'img/logo.svg',
    ]);
  });

  it('treats a cancelled picker as a no-op', async () => {
    const abort = Object.assign(new Error('cancelled'), { name: 'AbortError' });
    const result = await pickDirectory({
      showDirectoryPicker: vi.fn().mockRejectedValue(abort),
    });
    expect(result).toEqual({ supported: true, cancelled: true, entries: [] });
  });

  it('surfaces picker errors without triggering a second dialog', async () => {
    const denied = Object.assign(new Error('denied'), { name: 'NotAllowedError' });
    const result = await pickDirectory({
      showDirectoryPicker: vi.fn().mockRejectedValue(denied),
    });
    expect(result).toMatchObject({ supported: true, cancelled: false, entries: [] });
    expect(result.error).toBe(denied);
  });
});

describe('walkDirectoryHandle', () => {
  it('skips files that cannot be read', async () => {
    const broken = {
      kind: 'file',
      name: 'broken.md',
      getFile: async () => {
        throw new Error('unreadable');
      },
    };
    const entries = [];
    await walkDirectoryHandle(
      directoryHandle('folder', [broken, fileHandle('ok.md')]),
      '',
      entries,
    );
    expect(entries.map((entry) => entry.path)).toEqual(['ok.md']);
  });

  it('ignores missing directories', async () => {
    const entries = [];
    await walkDirectoryHandle(null, '', entries);
    expect(entries).toEqual([]);
  });
});
