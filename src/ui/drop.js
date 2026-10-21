import { joinPath, normalizePath } from '../core/paths.js';

/**
 * Collect a drop as a flat list of `{ file, path }` entries. Dropping a folder
 * yields every file inside it, which is what makes relative images work.
 * Falls back to `dataTransfer.files` when the entries API is unavailable
 * (some older browsers and test environments).
 */
export async function collectDroppedFiles(dataTransfer) {
  if (!dataTransfer) return [];

  const items = Array.from(dataTransfer.items ?? []);
  const entries = items
    .map((item) =>
      typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null,
    )
    .filter(Boolean);

  if (entries.length === 0) {
    return Array.from(dataTransfer.files ?? []).map((file) => ({
      file,
      path: normalizePath(file.webkitRelativePath || file.name),
    }));
  }

  const collected = [];
  for (const entry of entries) {
    await walkEntry(entry, '', collected);
  }
  return collected;
}

export async function walkEntry(entry, basePath, collected) {
  if (!entry) return;

  if (entry.isFile) {
    const file = await fileFromEntry(entry);
    collected.push({
      file,
      path: normalizePath(joinPath(basePath, entry.name || file.name)),
    });
    return;
  }

  if (entry.isDirectory) {
    const directoryPath = normalizePath(joinPath(basePath, entry.name));
    const reader = entry.createReader();
    for (;;) {
      const batch = await readEntries(reader);
      if (batch.length === 0) break;
      for (const child of batch) {
        await walkEntry(child, directoryPath, collected);
      }
    }
  }
}

function fileFromEntry(entry) {
  return new Promise((resolve, reject) => {
    entry.file(resolve, reject);
  });
}

function readEntries(reader) {
  return new Promise((resolve, reject) => {
    reader.readEntries(resolve, reject);
  });
}
