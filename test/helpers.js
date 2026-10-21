/**
 * Creates a File whose bundle-relative path can be controlled, mirroring what
 * Chrome provides for `<input webkitdirectory>` and drag-and-drop.
 */
export function makeFile(content, name, relativePath = '') {
  const file = new File([content], name, { type: 'text/markdown' });
  if (relativePath) {
    Object.defineProperty(file, 'webkitRelativePath', {
      value: relativePath,
      configurable: true,
    });
  }
  return file;
}

export function makeBundleLike(entries) {
  const map = new Map(Object.entries(entries));
  return {
    has: (path) => map.has(path),
    objectUrl: (path) => (map.has(path) ? `blob:test/${path}` : null),
    get: (path) => map.get(path),
  };
}
