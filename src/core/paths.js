/**
 * Path and URL helpers shared by the renderer, the resource rewriter and the
 * file bundle. All paths are POSIX-style and relative to the bundle root,
 * which keeps behaviour identical on Windows and macOS.
 */

export function toPosix(path) {
  return String(path ?? '').replace(/\\/g, '/');
}

export function normalizePath(path) {
  const posix = toPosix(path);
  const absolute = posix.startsWith('/');
  const parts = [];

  for (const part of posix.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (parts.length > 0 && parts[parts.length - 1] !== '..') {
        parts.pop();
      } else if (!absolute) {
        parts.push('..');
      }
      continue;
    }
    parts.push(part);
  }

  return `${absolute ? '/' : ''}${parts.join('/')}`;
}

export function dirname(path) {
  const posix = normalizePath(path);
  const index = posix.lastIndexOf('/');
  if (index < 0) return '';
  if (index === 0) return '/';
  return posix.slice(0, index);
}

export function basename(path) {
  const posix = toPosix(path).replace(/\/+$/, '');
  const index = posix.lastIndexOf('/');
  return index < 0 ? posix : posix.slice(index + 1);
}

export function extname(path) {
  const name = basename(path);
  const index = name.lastIndexOf('.');
  return index <= 0 ? '' : name.slice(index).toLowerCase();
}

export function joinPath(base, child) {
  if (!base) return normalizePath(child);
  if (!child) return normalizePath(base);
  return normalizePath(`${base}/${child}`);
}

export function isMarkdownPath(path) {
  return ['.md', '.markdown', '.mdown'].includes(extname(path));
}

const EXTERNAL_URL_RE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

export function isExternalUrl(url) {
  return EXTERNAL_URL_RE.test(String(url ?? '').trim());
}

/**
 * Split a Markdown URL into its decoded path and the query/hash suffix.
 * Markdown permits angle brackets around URLs (`![x](<my image.png>)`).
 */
export function splitResourceUrl(url) {
  let value = String(url ?? '').trim();
  if (value.startsWith('<') && value.endsWith('>')) {
    value = value.slice(1, -1).trim();
  }

  let suffix = '';
  const hashIndex = value.indexOf('#');
  if (hashIndex >= 0) {
    suffix = value.slice(hashIndex) + suffix;
    value = value.slice(0, hashIndex);
  }

  const queryIndex = value.indexOf('?');
  if (queryIndex >= 0) {
    suffix = value.slice(queryIndex) + suffix;
    value = value.slice(0, queryIndex);
  }

  return { path: safeDecode(value), suffix };
}

export function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Resolve a relative resource reference against the document that contains
 * it. Returns null for absolute/external URLs (http, data, mailto, #anchor)
 * because the browser can load those itself.
 */
export function resolveResourcePath(markdownPath, reference) {
  const raw = String(reference ?? '').trim();
  if (!raw || raw.startsWith('#')) return null;
  if (isExternalUrl(raw)) return null;

  const { path, suffix } = splitResourceUrl(raw);
  if (!path) return null;

  // A leading slash means "from the selected folder's root".
  const resolved = path.startsWith('/')
    ? normalizePath(path).replace(/^\/+/, '')
    : joinPath(dirname(markdownPath), path);

  return { path: resolved, suffix };
}

export function isRelativeReference(reference) {
  const raw = String(reference ?? '').trim();
  return Boolean(raw) && !raw.startsWith('#') && !isExternalUrl(raw);
}
