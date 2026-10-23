import { basename, extname, isExternalUrl } from './paths.js';

const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

/** File name without the Markdown extension, safe for downloads. */
export function fileStem(path) {
  return (
    basename(path)
      .replace(/\.(md|markdown|mdown)$/i, '')
      .replace(/[\\/:*?"<>|]+/g, '-')
      .trim() || 'document'
  );
}

export function exportFileName(path, extension) {
  return `${fileStem(path)}.${extension}`;
}

export function bytesToBase64(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const chunks = [];
  const size = 0x8000;
  for (let index = 0; index < view.length; index += size) {
    chunks.push(String.fromCharCode(...view.subarray(index, index + size)));
  }
  return btoa(chunks.join(''));
}

const MIME_TYPES = {
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.css': 'text/css',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.m4a': 'audio/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.ogg': 'audio/ogg',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.wav': 'audio/wav',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

export function mimeFromPath(path) {
  return MIME_TYPES[extname(path)] ?? 'application/octet-stream';
}

const CSS_URL_RE = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;

/**
 * Inline local `url(...)` references in a stylesheet as data URLs. This is
 * what makes exported decks and documents work when they are opened from
 * disk: KaTeX web fonts and theme assets travel with the file.
 *
 * `resolveUrl` maps a reference to a loadable key, and `loadDataUrl` returns
 * a `data:` URL for that key (or null when the asset is unavailable).
 */
export async function inlineCssUrls(css, { resolveUrl, loadDataUrl } = {}) {
  const source = String(css ?? '');
  if (typeof resolveUrl !== 'function' || typeof loadDataUrl !== 'function') {
    return source;
  }

  const parts = [];
  const jobs = [];
  let lastIndex = 0;

  for (const match of source.matchAll(CSS_URL_RE)) {
    const reference = match[2].trim();
    parts.push(source.slice(lastIndex, match.index));
    lastIndex = match.index + match[0].length;

    if (!reference || isExternalUrl(reference)) {
      parts.push(match[0]);
      continue;
    }

    const position = parts.length;
    parts.push(match[0]);
    jobs.push({ position, reference, original: match[0] });
  }
  parts.push(source.slice(lastIndex));

  const cache = new Map();
  await Promise.all(
    jobs.map(async (job) => {
      try {
        const key = resolveUrl(job.reference);
        if (!key) return;
        if (!cache.has(key)) cache.set(key, await loadDataUrl(key));
        const dataUrl = cache.get(key);
        if (dataUrl) parts[job.position] = `url("${dataUrl}")`;
      } catch {
        // Leave the original reference in place; the export still works.
      }
    }),
  );

  return parts.join('');
}

const FONT_SOURCE_RE = /src\s*:\s*([^;}]+);/gi;

/**
 * Drop legacy woff/ttf fallback sources from `@font-face` blocks when a woff2
 * source exists. Chrome always supports woff2, so exported files stay small.
 */
export function preferWoff2(css) {
  return String(css ?? '').replace(FONT_SOURCE_RE, (match, body) => {
    const sources = body.split(',').map((source) => source.trim());
    const woff2 = sources.filter((source) => /\.woff2(?:[?#"')]|$)/i.test(source));
    if (woff2.length === 0 || woff2.length === sources.length) return match;
    return `src:${woff2.join(',')};`;
  });
}

export const DOCUMENT_EXPORT_CSS = `
:root { color-scheme: light; }
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #ffffff; }
body {
  color: #1c2333;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue',
    Arial, 'Noto Sans', sans-serif;
  font-size: 16px;
  line-height: 1.7;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.markdown-body {
  width: min(920px, 100%);
  margin: 0 auto;
  padding: 48px 40px 96px;
  overflow-wrap: break-word;
}
.markdown-body > :first-child { margin-top: 0; }
.markdown-body h1, .markdown-body h2, .markdown-body h3,
.markdown-body h4, .markdown-body h5, .markdown-body h6 {
  margin: 1.6em 0 0.6em;
  line-height: 1.25;
  letter-spacing: -0.015em;
}
.markdown-body h1 {
  font-size: 2em;
  padding-bottom: 0.3em;
  border-bottom: 1px solid #e4e7ec;
}
.markdown-body h2 {
  font-size: 1.5em;
  padding-bottom: 0.25em;
  border-bottom: 1px solid #e4e7ec;
}
.markdown-body h3 { font-size: 1.25em; }
.markdown-body h4 { font-size: 1.05em; }
.markdown-body p, .markdown-body ul, .markdown-body ol, .markdown-body table,
.markdown-body blockquote, .markdown-body pre { margin: 0 0 1em; }
.markdown-body ul, .markdown-body ol { padding-left: 1.7em; }
.markdown-body li + li { margin-top: 0.2em; }
.markdown-body li > input[type='checkbox'] { margin-right: 0.45em; }
.markdown-body a { color: #4f46e5; text-decoration: none; }
.markdown-body a:hover { text-decoration: underline; }
.markdown-body blockquote {
  margin-left: 0;
  padding: 0.4em 1em;
  border-left: 4px solid #d0d5dd;
  color: #667085;
  background: #f9fafb;
  border-radius: 0 8px 8px 0;
}
.markdown-body code {
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas,
    'Liberation Mono', monospace;
  font-size: 0.88em;
  background: #f3f4f6;
  padding: 0.15em 0.4em;
  border-radius: 5px;
}
.markdown-body pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  padding: 16px;
  border-radius: 10px;
  background: #f3f4f6;
  border: 1px solid #e4e7ec;
}
.markdown-body pre code {
  padding: 0;
  background: none;
  font-size: 13.5px;
  line-height: 1.55;
}
.markdown-body img {
  max-width: 100%;
  height: auto;
  border-radius: 8px;
}
.markdown-body table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.94em;
}
.markdown-body th, .markdown-body td {
  padding: 7px 12px;
  border: 1px solid #e4e7ec;
  text-align: left;
  vertical-align: top;
}
.markdown-body th { background: #f9fafb; font-weight: 650; }
.markdown-body tr:nth-child(2n) td { background: #fafbfc; }
.markdown-body hr {
  height: 1px;
  margin: 2em 0;
  border: 0;
  background: #e4e7ec;
}
.markdown-body .katex-display {
  margin: 1em 0;
  padding: 4px 0;
  overflow-x: auto;
  overflow-y: hidden;
}
.markdown-body mjx-container { max-width: 100%; overflow-x: auto; overflow-y: hidden; }
`;

export function buildDocumentHtml({
  title = 'Document',
  bodyHtml = '',
  css = '',
  pdf = false,
  pageWidthPx = 0,
} = {}) {
  const pdfCss =
    pdf && pageWidthPx > 0
      ? `<style>
html, body { margin: 0; padding: 0; }
.markdown-body { width: ${pageWidthPx}px; max-width: none; margin: 0; padding: 0; }
</style>`
      : '';
  const extraCss = css ? `<style>${css}</style>` : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${DOCUMENT_EXPORT_CSS}</style>
${extraCss}
${pdfCss}
</head>
<body>
<main class="markdown-body">${bodyHtml}</main>
</body>
</html>
`;
}

export function deckExportCss(width = 1280, height = 720) {
  return `
html, body { margin: 0; padding: 0; height: 100%; background: #111; }
body { overflow: hidden; }
.deck-stage {
  position: fixed;
  inset: 0 0 54px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.marpit {
  width: ${width}px;
  height: ${height}px;
  transform-origin: center center;
}
.marpit > section { display: none !important; }
.marpit > section.is-active { display: block !important; }
.deck-nav {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  height: 54px;
  color: #e6e9ef;
  font: 13px/1.4 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #111;
}
.deck-nav button {
  padding: 5px 12px;
  color: inherit;
  font: inherit;
  background: #222;
  border: 1px solid #3a3f4a;
  border-radius: 7px;
  cursor: pointer;
}
.deck-nav button:hover { background: #2c313b; }
@media print {
  @page { size: ${width / 96}in ${height / 96}in; margin: 0; }
  html, body { height: auto; background: #fff; overflow: visible; }
  .deck-nav { display: none !important; }
  .deck-stage { position: static; display: block; height: auto; overflow: visible; }
  .marpit { width: auto; height: auto; transform: none !important; }
  .marpit > section {
    display: block !important;
    width: ${width}px !important;
    height: ${height}px !important;
    break-after: page;
    page-break-after: always;
  }
  .marpit > section:last-child {
    break-after: auto;
    page-break-after: auto;
  }
}
`;
}

export const DECK_SCRIPT = `
(function () {
  var deck = document.querySelector('.marpit');
  var stage = document.getElementById('deck-stage');
  var slides = Array.prototype.slice.call(
    document.querySelectorAll('.marpit > section')
  );
  if (!slides.length || !deck || !stage) return;

  var index = 0;
  var counter = document.getElementById('deck-counter');

  function fit() {
    var width = deck.offsetWidth;
    var height = deck.offsetHeight;
    if (!width || !height) return;
    var scale = Math.min(
      (stage.clientWidth - 24) / width,
      (stage.clientHeight - 24) / height
    );
    deck.style.transform = 'scale(' + Math.max(0.1, scale) + ')';
  }

  function show(next) {
    index = (next + slides.length) % slides.length;
    slides.forEach(function (slide, position) {
      slide.classList.toggle('is-active', position === index);
    });
    if (counter) counter.textContent = (index + 1) + ' / ' + slides.length;
  }

  document.getElementById('deck-prev').addEventListener('click', function () {
    show(index - 1);
  });
  document.getElementById('deck-next').addEventListener('click', function () {
    show(index + 1);
  });
  stage.addEventListener('click', function (event) {
    if (event.target.closest('a, button')) return;
    show(index + 1);
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') {
      event.preventDefault();
      show(index + 1);
    } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
      event.preventDefault();
      show(index - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      show(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      show(slides.length - 1);
    } else if (event.key === 'f' || event.key === 'F') {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen?.();
    }
  });

  window.addEventListener('resize', fit);
  window.addEventListener('beforeprint', function () {
    deck.style.transform = 'none';
  });
  window.addEventListener('afterprint', fit);
  show(0);
  fit();
})();
`;

export function buildDeckHtml({
  title = 'Slides',
  slidesHtml = '',
  css = '',
  width = 1280,
  height = 720,
} = {}) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${css}</style>
<style>${deckExportCss(width, height)}</style>
</head>
<body>
<div class="deck-stage" id="deck-stage">
<div class="marpit">${slidesHtml}</div>
</div>
<div class="deck-nav">
<button type="button" id="deck-prev" aria-label="Previous slide">‹ Prev</button>
<span id="deck-counter" aria-live="polite">1 / 1</span>
<button type="button" id="deck-next" aria-label="Next slide">Next ›</button>
</div>
<script>${DECK_SCRIPT}</script>
</body>
</html>
`;
}

/** Minimal page used for rasterising one slide into a canvas. */
export function buildSlidePageHtml({
  slideHtml = '',
  css = '',
  width = 1280,
  height = 720,
} = {}) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>${css}</style>
<style>
html, body { margin: 0; padding: 0; width: ${width}px; height: ${height}px; background: #fff; overflow: hidden; }
.marpit { width: ${width}px; height: ${height}px; }
.marpit > section {
  display: block !important;
  width: ${width}px !important;
  height: ${height}px !important;
}
</style>
</head>
<body><div class="marpit">${slideHtml}</div></body>
</html>
`;
}

/**
 * Split a tall document into page-sized slices, preferring block boundaries
 * so paragraphs and headings are not cut in half.
 */
export function computePageBreaks(rects, totalHeight, pageHeight, minFill = 0.55) {
  const height = Math.max(0, Number(totalHeight) || 0);
  const page = Math.max(1, Number(pageHeight) || 1);
  if (height <= 0) return [];

  const boundaries = (Array.isArray(rects) ? rects : [])
    .map((rect) => Number(rect?.bottom))
    .filter((bottom) => Number.isFinite(bottom) && bottom > 0 && bottom <= height)
    .sort((a, b) => a - b);

  const breaks = [];
  let start = 0;

  while (height - start > page) {
    const limit = start + page;
    const floor = start + page * minFill;
    let best = 0;

    for (const bottom of boundaries) {
      if (bottom > floor && bottom <= limit && bottom > start + 1) {
        best = Math.max(best, bottom);
      }
    }

    const end = best > start + 1 ? best : limit;
    breaks.push({ start, end });
    start = end;
  }

  breaks.push({ start, end: height });
  return breaks;
}

/** A4 at 96 dpi minus the printable margins used by the PDF renderer. */
export function pdfLayout({ marginPt = 40, scale = 2 } = {}) {
  const PAGE_WIDTH_PT = 595.28;
  const PAGE_HEIGHT_PT = 841.89;
  const ptToPx = 96 / 72;
  const contentWidthPt = PAGE_WIDTH_PT - marginPt * 2;
  const contentHeightPt = PAGE_HEIGHT_PT - marginPt * 2;
  return {
    marginPt,
    scale,
    pageWidthPt: PAGE_WIDTH_PT,
    pageHeightPt: PAGE_HEIGHT_PT,
    contentWidthPt,
    contentHeightPt,
    contentWidthPx: Math.floor(contentWidthPt * ptToPx),
    contentHeightPx: Math.floor(contentHeightPt * ptToPx),
  };
}
