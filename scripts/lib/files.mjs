import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

export async function listFiles(directory, base = directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(absolute, base)));
    } else if (entry.isFile()) {
      const info = await stat(absolute);
      files.push({
        absolute,
        path: path.relative(base, absolute).split(path.sep).join('/'),
        size: info.size,
      });
    }
  }

  return files;
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}
