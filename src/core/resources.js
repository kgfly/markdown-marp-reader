import { resolveResourcePath } from './paths.js';

const MEDIA_ATTRIBUTES = [
  ['img[src]', 'src'],
  ['source[src]', 'src'],
  ['video[src]', 'src'],
  ['video[poster]', 'poster'],
  ['audio[src]', 'src'],
  ['iframe[src]', 'src'],
  ['embed[src]', 'src'],
  ['object[data]', 'data'],
  ['image[href]', 'href'],
];

const CSS_URL_RE = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;

/**
 * Replace relative media references with blob URLs backed by the selected
 * files. External URLs are left untouched; references that cannot be found
 * are flagged with `data-missing-resource` so the UI can explain the problem.
 */
export function rewriteResourceUrls(root, { markdownPath, bundle, onMissing } = {}) {
  const result = { rewritten: 0, missing: [] };
  if (!root || typeof root.querySelectorAll !== 'function' || !bundle) {
    return result;
  }

  const missingSeen = new Set();

  const noteMissing = (element, path) => {
    if (!missingSeen.has(path)) {
      missingSeen.add(path);
      result.missing.push(path);
      if (typeof onMissing === 'function') onMissing(path);
    }
    if (element && element.setAttribute) {
      element.setAttribute('data-missing-resource', path);
    }
  };

  const rewriteReference = (reference) => {
    const resolved = resolveResourcePath(markdownPath, reference);
    if (!resolved) return null;
    if (!bundle.has(resolved.path)) return { missing: resolved.path };
    const objectUrl = bundle.objectUrl(resolved.path);
    if (!objectUrl) return { missing: resolved.path };
    return { url: `${objectUrl}${resolved.suffix}` };
  };

  for (const [selector, attribute] of MEDIA_ATTRIBUTES) {
    for (const element of root.querySelectorAll(selector)) {
      const current = element.getAttribute(attribute);
      const outcome = rewriteReference(current);
      if (!outcome) continue;
      if (outcome.missing) {
        noteMissing(element, outcome.missing);
        continue;
      }
      element.setAttribute(attribute, outcome.url);
      element.removeAttribute('data-missing-resource');
      result.rewritten += 1;
    }
  }

  const styleElements = [
    ...(root.matches?.('[style]') ? [root] : []),
    ...root.querySelectorAll('[style]'),
  ];
  for (const element of styleElements) {
    const style = element.getAttribute('style');
    if (!style || !style.includes('url(')) continue;
    const rewritten = rewriteCssUrls(style, rewriteReference, (path) =>
      noteMissing(element, path),
    );
    if (rewritten !== style) {
      element.setAttribute('style', rewritten);
      result.rewritten += 1;
    }
  }

  return result;
}

export function rewriteCssUrls(css, rewriteReference, onMissing) {
  return String(css).replace(CSS_URL_RE, (match, quote, reference) => {
    const outcome = rewriteReference(reference);
    if (!outcome) return match;
    if (outcome.missing) {
      if (typeof onMissing === 'function') onMissing(outcome.missing);
      return match;
    }
    const target = outcome.url.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
    return `url("${target}")`;
  });
}
