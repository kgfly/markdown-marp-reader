import { extname, isMarkdownPath, normalizePath } from '../core/paths.js';

/**
 * Build a sorted directory tree from the flat, bundle-relative paths that a
 * folder selection or drop produces. Directories come before files at every
 * level so the sidebar reads like a normal file browser.
 */
export function buildFileTree(paths = []) {
  const root = createNode('');

  for (const rawPath of paths) {
    const path = normalizePath(rawPath).replace(/^\/+/, '');
    if (!path) continue;

    const parts = path.split('/');
    let node = root;
    let prefix = '';

    for (let index = 0; index < parts.length; index += 1) {
      const name = parts[index];
      prefix = prefix ? `${prefix}/${name}` : name;

      if (index === parts.length - 1) {
        node.files.push({ name, path: prefix });
        continue;
      }

      let child = node.dirs.get(name);
      if (!child) {
        child = createNode(prefix, name);
        node.dirs.set(name, child);
      }
      node = child;
    }
  }

  sortNode(root);
  return root;
}

/**
 * Every directory that contains `path`, outermost first. Used to reveal the
 * active document and to keep matching folders open while filtering.
 */
export function ancestorPaths(path) {
  const parts = normalizePath(path).replace(/^\/+/, '').split('/');
  parts.pop();

  const ancestors = [];
  let prefix = '';
  for (const part of parts) {
    if (!part) continue;
    prefix = prefix ? `${prefix}/${part}` : part;
    ancestors.push(prefix);
  }
  return ancestors;
}

const IMAGE_EXTENSIONS = new Set([
  '.avif',
  '.bmp',
  '.gif',
  '.ico',
  '.jpeg',
  '.jpg',
  '.png',
  '.svg',
  '.webp',
]);

const AUDIO_EXTENSIONS = new Set(['.aac', '.flac', '.m4a', '.mp3', '.ogg', '.wav']);

const VIDEO_EXTENSIONS = new Set(['.avi', '.m4v', '.mkv', '.mov', '.mp4', '.webm']);

const TEXT_EXTENSIONS = new Set([
  '.css',
  '.csv',
  '.html',
  '.ini',
  '.js',
  '.json',
  '.log',
  '.mjs',
  '.txt',
  '.xml',
  '.yaml',
  '.yml',
]);

/** Coarse file category, used for the sidebar badge colour. */
export function fileKind(path) {
  if (isMarkdownPath(path)) return 'markdown';
  const extension = extname(path);
  if (IMAGE_EXTENSIONS.has(extension)) return 'image';
  if (AUDIO_EXTENSIONS.has(extension)) return 'audio';
  if (VIDEO_EXTENSIONS.has(extension)) return 'video';
  if (TEXT_EXTENSIONS.has(extension)) return 'text';
  if (extension === '.pdf') return 'pdf';
  return 'file';
}

/** Short badge text for a file, e.g. `MD`, `PNG`, `PDF`, `FILE`. */
export function fileLabel(path) {
  const extension = extname(path).slice(1);
  if (!extension) return 'FILE';
  if (extension === 'markdown' || extension === 'mdown') return 'MD';
  return extension.slice(0, 4).toUpperCase();
}

function createNode(path, name = '') {
  return { path, name, dirs: new Map(), files: [] };
}

function sortNode(node) {
  node.files.sort((a, b) => a.name.localeCompare(b.name));

  const dirs = [...node.dirs.values()].sort((a, b) => a.name.localeCompare(b.name));
  node.dirs = new Map(dirs.map((dir) => [dir.name, dir]));

  for (const dir of dirs) sortNode(dir);
}
