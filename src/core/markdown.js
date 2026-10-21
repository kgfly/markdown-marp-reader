import { marked } from 'marked';
import markedKatex from 'marked-katex-extension';
import DOMPurify from 'dompurify';

import { analyzeMarkdown } from './detect.js';

let configured = false;

function configureMarked() {
  if (configured) return;
  marked.use(
    markedKatex({
      throwOnError: false,
      output: 'htmlAndMathml',
    }),
  );
  // Keep external links safe without asking readers to trust the document.
  marked.use({
    renderer: {
      link({ href, title, tokens }) {
        const text = this.parser.parseInline(tokens);
        const safeHref = escapeAttribute(href ?? '');
        const safeTitle = title ? ` title="${escapeAttribute(title)}"` : '';
        const external = /^(?:https?:)?\/\//i.test(href ?? '');
        const target = external ? ' target="_blank" rel="noopener noreferrer"' : '';
        return `<a href="${safeHref}"${safeTitle}${target}>${text}</a>`;
      },
    },
  });
  configured = true;
}

/**
 * Render Markdown (including `$...$` / `$$...$$` math) to sanitized HTML.
 * Relative resources are left alone here; rewriteResourceUrls() needs File
 * handles, which this pure render step intentionally does not have.
 */
export function renderMarkdown(text, { filename = '', sanitize = true } = {}) {
  configureMarked();

  const analyzed = analyzeMarkdown(text, filename);
  const rawHtml = marked.parse(analyzed.body, { async: false, gfm: true });

  const html = sanitize ? sanitizeHtml(rawHtml) : rawHtml;

  return {
    html,
    title: analyzed.title,
    isMarp: analyzed.isMarp,
    attributes: analyzed.attributes,
    body: analyzed.body,
    hasFrontmatter: analyzed.hasFrontmatter,
  };
}

export function sanitizeHtml(html) {
  if (!DOMPurify || typeof DOMPurify.sanitize !== 'function') return html;
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true, svg: true, svgFilters: true, mathMl: true },
    ADD_ATTR: ['target'],
    ADD_TAGS: ['marp-auto-scaling'],
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick'],
  });
}

export function slugifyHeading(text) {
  return (
    String(text)
      .toLowerCase()
      .trim()
      .replace(/<[^>]+>/g, '')
      .replace(/[`*_~]/g, '')
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'section'
  );
}

/**
 * Give headings stable ids so `#anchor` links inside local documents work.
 * Runs on an already-rendered container, after sanitization.
 */
export function addHeadingIds(container) {
  if (!container || typeof container.querySelectorAll !== 'function') return;
  const used = new Set();
  for (const heading of container.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
    if (heading.id) {
      used.add(heading.id);
      continue;
    }
    const base = slugifyHeading(heading.textContent ?? '');
    let id = base;
    let suffix = 2;
    while (used.has(id)) {
      id = `${base}-${suffix}`;
      suffix += 1;
    }
    used.add(id);
    heading.id = id;
  }
}

function escapeAttribute(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
