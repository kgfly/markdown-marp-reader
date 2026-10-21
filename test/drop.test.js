import { describe, expect, it, vi } from 'vitest';

import { collectDroppedFiles } from '../src/ui/drop.js';
import { makeFile } from './helpers.js';

function fileEntry(name, content = 'x') {
  return {
    isFile: true,
    name,
    file: (resolve) => resolve(makeFile(content, name)),
  };
}

function directoryEntry(name, batches) {
  return {
    isDirectory: true,
    name,
    createReader() {
      let index = 0;
      return {
        readEntries(resolve) {
          resolve(batches[index] ?? []);
          index += 1;
        },
      };
    },
  };
}

describe('collectDroppedFiles', () => {
  it('returns nothing without a DataTransfer', async () => {
    await expect(collectDroppedFiles(null)).resolves.toEqual([]);
    await expect(collectDroppedFiles(undefined)).resolves.toEqual([]);
  });

  it('falls back to dataTransfer.files', async () => {
    const file = makeFile('# Hi', 'notes.md', 'folder/notes.md');
    const result = await collectDroppedFiles({ items: [], files: [file] });
    expect(result).toHaveLength(1);
    expect(result[0].file).toBe(file);
    expect(result[0].path).toBe('folder/notes.md');
  });

  it('walks file entries', async () => {
    const entry = fileEntry('deck.md', '# deck');
    const result = await collectDroppedFiles({
      items: [{ webkitGetAsEntry: () => entry }],
      files: [],
    });
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe('deck.md');
    expect(await result[0].file.text()).toBe('# deck');
  });

  it('walks nested directories across multiple reader batches', async () => {
    const entry = directoryEntry('docs', [
      [fileEntry('a.md'), directoryEntry('img', [[fileEntry('b.md')]])],
      [fileEntry('c.md')],
    ]);
    const result = await collectDroppedFiles({
      items: [{ webkitGetAsEntry: () => entry }],
      files: [],
    });
    expect(result.map((item) => item.path)).toEqual([
      'docs/a.md',
      'docs/img/b.md',
      'docs/c.md',
    ]);
  });

  it('ignores items that cannot produce an entry', async () => {
    const file = makeFile('x', 'fallback.md');
    const result = await collectDroppedFiles({
      items: [{ kind: 'string' }, { webkitGetAsEntry: () => null }],
      files: [file],
    });
    expect(result.map((item) => item.path)).toEqual(['fallback.md']);
  });

  it('propagates entry errors', async () => {
    const failing = {
      isFile: true,
      name: 'broken.md',
      file: (_resolve, reject) => reject(new Error('unreadable')),
    };
    await expect(
      collectDroppedFiles({
        items: [{ webkitGetAsEntry: () => failing }],
        files: [],
      }),
    ).rejects.toThrow('unreadable');
  });

  it('handles a missing entry at the top level', async () => {
    const spy = vi.fn();
    await collectDroppedFiles({ items: [{ webkitGetAsEntry: spy }], files: [] });
    expect(spy).toHaveBeenCalled();
  });
});
