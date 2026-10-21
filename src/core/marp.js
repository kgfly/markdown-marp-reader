import { Marp } from '@marp-team/marp-core';

let engine = null;

/**
 * Marp Core is configured once. `script: false` keeps generated HTML free of
 * scripts, and KaTeX is used instead of MathJax so the extension stays small
 * and can load fonts from the packaged copy rather than a CDN.
 */
export function getMarp() {
  if (!engine) {
    engine = new Marp({
      html: true,
      emoji: false,
      script: false,
      math: {
        lib: 'katex',
        katexFontPath: 'vendor/katex/fonts/',
      },
    });
  }
  return engine;
}

export function renderMarp(text) {
  const rendered = getMarp().render(String(text ?? ''));
  const slideCount = countSlides(rendered.html);
  return {
    html: rendered.html,
    css: rendered.css ?? '',
    slideCount,
  };
}

export function countSlides(html) {
  return (String(html ?? '').match(/<svg\b[^>]*\bdata-marpit-svg\b/gi) ?? []).length;
}

/**
 * Build the sandboxed document used by the slide iframe. The preview HTML is
 * parsed in an inert document by the caller; the iframe sandbox prevents any
 * event-handler or script embedded in the Markdown from running.
 */
export function buildSlideDocument({ html, css, activeIndex = 0, baseUri = '' }) {
  const base = baseUri ? `<base href="${escapeAttribute(baseUri)}">` : '';
  const index = Math.max(0, Number(activeIndex) || 0);

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
${base}
<style>${css}</style>
<style>
  html, body { margin: 0; padding: 0; height: 100%; background: #111; overflow: hidden; }
  .marpit { width: 100%; height: 100%; }
  .marpit > svg[data-marpit-svg] {
    display: none;
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    background: #fff;
  }
  .marpit > svg[data-marpit-svg].is-active { display: block; }
</style>
</head>
<body>${markActiveSlide(html, index)}</body>
</html>`;
}

/**
 * Add `is-active` to the Nth Marp slide (and remove it from the others).
 * Exported so slide navigation can update an existing iframe without a reload.
 */
export function markActiveSlide(html, activeIndex) {
  let index = 0;
  return String(html).replace(/<svg\b[^>]*\bdata-marpit-svg\b[^>]*>/gi, (tag) => {
    const active = index === activeIndex;
    index += 1;
    return setActiveClass(tag, active);
  });
}

function setActiveClass(tag, active) {
  const classPattern = /\bclass\s*=\s*(["'])(.*?)\1/i;
  if (classPattern.test(tag)) {
    return tag.replace(classPattern, (_, quote, classes) => {
      const values = new Set(classes.split(/\s+/).filter(Boolean));
      if (active) values.add('is-active');
      else values.delete('is-active');
      const rendered = [...values].join(' ');
      return rendered ? `class=${quote}${rendered}${quote}` : '';
    });
  }
  return active ? tag.replace(/(\s*\/?>)$/, ' class="is-active"$1') : tag;
}

function escapeAttribute(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
