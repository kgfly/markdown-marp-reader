import { bytesToBase64, inlineCssUrls, mimeFromPath, preferWoff2 } from './export.js';
import { addHeadingIds, renderMarkdown } from './markdown.js';
import { renderMarp } from './marp.js';
import { renderMermaidBlocks } from './mermaid.js';
import { isMarkdownPath, joinPath, normalizePath, resolveResourcePath } from './paths.js';
import { MEDIA_ATTRIBUTES } from './resources.js';

/**
 * Build a data URL for a bundled file. Files picked from disk often have an
 * empty `type`, so fall back to the extension-based MIME map.
 */
export async function bundleDataUrl(path, bundle, readFile) {
  const file = bundle?.get?.(path);
  if (!file) return null;
  const buffer = await (readFile ? readFile(file) : file.arrayBuffer());
  const mime = file.type || mimeFromPath(path);
  return `data:${mime};base64,${bytesToBase64(new Uint8Array(buffer))}`;
}

/**
 * Replace relative media, link and CSS `url()` references in an inert DOM
 * with data URLs. Export artefacts opened from disk then carry their images
 * with them instead of pointing at files that are no longer nearby.
 */
export async function inlineBundleResources(
  root,
  { markdownPath = '', bundle = null, readFile = null } = {},
) {
  const result = { inlined: 0, missing: [] };
  if (!root || typeof root.querySelectorAll !== 'function' || !bundle) {
    return result;
  }

  const cache = new Map();
  const missingSeen = new Set();

  const dataUrlFor = async (path) => {
    if (cache.has(path)) return cache.get(path);
    let dataUrl = null;
    try {
      dataUrl = await bundleDataUrl(path, bundle, readFile);
    } catch {
      dataUrl = null;
    }
    cache.set(path, dataUrl);
    return dataUrl;
  };

  const noteMissing = (path) => {
    if (missingSeen.has(path)) return;
    missingSeen.add(path);
    result.missing.push(path);
  };

  const inlineReference = async (element, attribute, resolve) => {
    const current = element.getAttribute(attribute);
    if (!current) return;
    const resolved = resolve(current);
    if (!resolved) return;
    if (isMarkdownPath(resolved.path)) return;

    const dataUrl = await dataUrlFor(resolved.path);
    if (!dataUrl) {
      noteMissing(resolved.path);
      return;
    }
    element.setAttribute(attribute, dataUrl);
    element.removeAttribute('data-missing-resource');
    result.inlined += 1;
  };

  for (const [selector, attribute] of MEDIA_ATTRIBUTES) {
    for (const element of root.querySelectorAll(selector)) {
      await inlineReference(element, attribute, (reference) =>
        resolveResourcePath(markdownPath, reference),
      );
    }
  }

  for (const element of root.querySelectorAll('a[href]')) {
    await inlineReference(element, 'href', (reference) =>
      resolveResourcePath(markdownPath, reference),
    );
  }

  for (const element of root.querySelectorAll('[style]')) {
    const style = element.getAttribute('style');
    if (!style || !style.includes('url(')) continue;
    const rewritten = await inlineCssUrls(style, {
      resolveUrl: (reference) => resolveResourcePath(markdownPath, reference)?.path,
      loadDataUrl: dataUrlFor,
    });
    if (rewritten !== style) {
      element.setAttribute('style', rewritten);
      result.inlined += 1;
    }
  }

  for (const element of root.querySelectorAll('[data-missing-resource]')) {
    element.removeAttribute('data-missing-resource');
  }

  return result;
}

function extensionUrl(path) {
  const runtime = globalThis.chrome?.runtime;
  if (!runtime?.getURL) {
    throw new Error('Extension runtime is unavailable.');
  }
  return runtime.getURL(path);
}

export async function loadExtensionText(path) {
  const response = await fetch(extensionUrl(path));
  if (!response.ok) {
    throw new Error(`Could not read ${path} (${response.status}).`);
  }
  return response.text();
}

export async function loadExtensionDataUrl(path) {
  const response = await fetch(extensionUrl(path));
  if (!response.ok) {
    throw new Error(`Could not read ${path} (${response.status}).`);
  }
  const buffer = await response.arrayBuffer();
  return `data:${mimeFromPath(path)};base64,${bytesToBase64(new Uint8Array(buffer))}`;
}

/**
 * Inline KaTeX's stylesheet, including its web fonts. Kept as a separate
 * function so tests can supply fake loaders.
 */
export async function buildKatexExportCss(loadText, loadDataUrl) {
  const css = await loadText('vendor/katex/katex.min.css');
  return inlineCssUrls(preferWoff2(css), {
    resolveUrl: (reference) => {
      const path = reference.split(/[?#]/)[0];
      return path ? joinPath('vendor/katex', path) : null;
    },
    loadDataUrl,
  });
}

let katexExportCssPromise = null;

export function getKatexExportCss() {
  if (!katexExportCssPromise) {
    katexExportCssPromise = buildKatexExportCss(
      loadExtensionText,
      loadExtensionDataUrl,
    ).catch((error) => {
      katexExportCssPromise = null;
      throw error;
    });
  }
  return katexExportCssPromise;
}

/**
 * Marp emits its KaTeX `@font-face` URLs relative to the extension root
 * (`vendor/katex/fonts/...`). Inline them for standalone files.
 */
export async function inlineDeckCss(css, loadDataUrl = loadExtensionDataUrl) {
  return inlineCssUrls(preferWoff2(css), {
    resolveUrl: (reference) => {
      const path = reference.split(/[?#]/)[0];
      return path ? normalizePath(path) : null;
    },
    loadDataUrl,
  });
}

/**
 * Read the deck's slide size from Marp's generated CSS, which pins
 * `div.marpit > section` to the theme's pixel dimensions.
 */
export function extractDeckSize(css, fallback = { width: 1280, height: 720 }) {
  const match =
    /div\.marpit\s*>\s*section\s*\{[^}]*?width\s*:\s*([\d.]+)px[^}]*?height\s*:\s*([\d.]+)px/i.exec(
      String(css ?? ''),
    );
  if (match) {
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (width > 0 && height > 0) return { width, height };
  }
  return { ...fallback };
}

export function extractSlideSize(slides, fallback = { width: 1280, height: 720 }) {
  for (const slide of slides ?? []) {
    const match =
      /viewBox\s*=\s*["']\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)\s*["']/i.exec(
        String(slide),
      );
    if (match) {
      const width = Number(match[1]);
      const height = Number(match[2]);
      if (width > 0 && height > 0) return { width, height };
    }
  }
  return { ...fallback };
}

export async function prepareDocumentExport({
  text,
  markdownPath = '',
  bundle,
  title = '',
}) {
  const rendered = renderMarkdown(text, { filename: markdownPath });
  const doc = new DOMParser().parseFromString(
    '<!doctype html><html><body></body></html>',
    'text/html',
  );
  doc.body.innerHTML = rendered.html;
  addHeadingIds(doc.body);

  // Mermaid labels are rendered as SVG text so rasterised PDFs stay faithful.
  await renderMermaidBlocks(doc.body, { htmlLabels: false, keepSource: false });

  const inlined = await inlineBundleResources(doc.body, { markdownPath, bundle });
  const css = await getKatexExportCss();

  return {
    title: title || rendered.title,
    bodyHtml: doc.body.innerHTML,
    css,
    missing: inlined.missing,
  };
}

export async function prepareDeckExport({ text, markdownPath = '', bundle, title = '' }) {
  const rendered = renderMarp(text, { inlineSVG: false });
  const doc = new DOMParser().parseFromString(
    '<!doctype html><html><body></body></html>',
    'text/html',
  );
  doc.body.innerHTML = rendered.html;

  const inlined = await inlineBundleResources(doc.body, { markdownPath, bundle });
  const css = await inlineDeckCss(rendered.css);
  const slides = [...doc.body.querySelectorAll('.marpit > section')].map(
    (slide) => slide.outerHTML,
  );
  const { width, height } = extractDeckSize(rendered.css);

  return {
    title: title || 'Slides',
    slides,
    css,
    width,
    height,
    missing: inlined.missing,
  };
}
