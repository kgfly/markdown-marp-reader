import { joinPath, normalizePath } from '../core/paths.js';

const MAX_DEPTH = 64;

/**
 * Open a folder through the File System Access API. Compared with
 * `<input webkitdirectory>`, Chrome asks for permission to *view* the folder
 * instead of warning that the files will be uploaded, and only the selected
 * directory is exposed to the page.
 *
 * Returns `{ supported: false }` when the API is unavailable so the caller can
 * fall back to the hidden directory input.
 */
export async function pickDirectory(scope = globalThis) {
  if (!supportsDirectoryPicker(scope)) return { supported: false, entries: [] };

  let handle;
  try {
    handle = await scope.showDirectoryPicker({ mode: 'read' });
  } catch (error) {
    if (error?.name === 'AbortError') {
      return { supported: true, cancelled: true, entries: [] };
    }
    return { supported: true, cancelled: false, entries: [], error };
  }

  const entries = [];
  try {
    await walkDirectoryHandle(handle, '', entries);
  } catch (error) {
    return { supported: true, cancelled: false, entries, error };
  }
  return { supported: true, cancelled: false, entries };
}

export function supportsDirectoryPicker(scope = globalThis) {
  return typeof scope?.showDirectoryPicker === 'function';
}

/**
 * Flatten a `FileSystemDirectoryHandle` tree into `{ file, path }` entries.
 * Individual files that disappear or fail to read are skipped; a failure to
 * list a directory keeps whatever was collected so far.
 */
export async function walkDirectoryHandle(directory, basePath, collected, depth = 0) {
  if (!directory || depth > MAX_DEPTH) return;

  for await (const [name, child] of directory.entries()) {
    const childPath = normalizePath(joinPath(basePath, name));
    if (!childPath) continue;

    if (child.kind === 'file') {
      try {
        collected.push({ file: await child.getFile(), path: childPath });
      } catch {
        // The file may have been removed or become unreadable mid-walk.
      }
    } else if (child.kind === 'directory') {
      await walkDirectoryHandle(child, childPath, collected, depth + 1);
    }
  }
}
