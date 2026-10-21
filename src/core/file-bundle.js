import { isMarkdownPath, normalizePath } from './paths.js';

/**
 * A set of files selected or dropped by the user, indexed by bundle-relative
 * path. Files are never copied: the File handles are kept and object URLs are
 * minted on demand for images and other referenced resources.
 */
export class FileBundle {
  #files = new Map();
  #lowerCaseIndex = new Map();
  #objectUrls = new Map();
  #revoked = false;

  constructor(files = []) {
    for (const entry of files) {
      if (entry instanceof File) {
        this.add(pathForFile(entry), entry);
      } else if (entry && entry.file instanceof File) {
        this.add(entry.path ?? pathForFile(entry.file), entry.file);
      }
    }
  }

  get size() {
    return this.#files.size;
  }

  add(path, file) {
    const normalized = normalizePath(path);
    if (!normalized || !(file instanceof File)) return;
    this.#files.set(normalized, file);
    this.#lowerCaseIndex.set(normalized.toLowerCase(), normalized);
  }

  paths() {
    return [...this.#files.keys()].sort((a, b) => a.localeCompare(b));
  }

  files() {
    return this.paths().map((path) => ({ path, file: this.#files.get(path) }));
  }

  has(path) {
    return Boolean(this.get(path));
  }

  get(path) {
    const normalized = normalizePath(path);
    if (this.#files.has(normalized)) return this.#files.get(normalized);
    const actual = this.#lowerCaseIndex.get(normalized.toLowerCase());
    return actual ? this.#files.get(actual) : undefined;
  }

  markdownFiles() {
    return this.files().filter(({ path }) => isMarkdownPath(path));
  }

  async readText(path) {
    const file = this.get(path);
    if (!file) throw new Error(`File not found in selection: ${path}`);
    return file.text();
  }

  /**
   * Return a blob URL for a bundled file, reusing it for repeat references.
   * The URL lives until release() is called (when another bundle is opened).
   */
  objectUrl(path) {
    const file = this.get(path);
    if (!file) return null;
    const actualPath = this.#lowerCaseIndex.get(normalizePath(path).toLowerCase());
    if (this.#objectUrls.has(actualPath)) {
      return this.#objectUrls.get(actualPath);
    }
    const url = URL.createObjectURL(file);
    this.#objectUrls.set(actualPath, url);
    return url;
  }

  release() {
    if (this.#revoked) return;
    for (const url of this.#objectUrls.values()) {
      URL.revokeObjectURL(url);
    }
    this.#objectUrls.clear();
    this.#revoked = true;
  }
}

export function pathForFile(file) {
  return normalizePath(
    file.webkitRelativePath || file.__path || file.relativePath || file.name,
  );
}

/**
 * Prefer a conventional entry point in a folder, otherwise the shallowest
 * and alphabetically first Markdown file.
 */
export function pickInitialMarkdown(bundle) {
  const files = bundle.markdownFiles();
  if (files.length === 0) return null;

  const conventional = files
    .filter(({ path }) => /(^|\/)(readme|index)\.(md|markdown|mdown)$/i.test(path))
    .sort((a, b) => {
      const depthDelta = a.path.split('/').length - b.path.split('/').length;
      return depthDelta !== 0 ? depthDelta : a.path.localeCompare(b.path);
    });
  if (conventional.length > 0) return conventional[0].path;

  return [...files].sort((a, b) => {
    const depthDelta = a.path.split('/').length - b.path.split('/').length;
    return depthDelta !== 0 ? depthDelta : a.path.localeCompare(b.path);
  })[0].path;
}
