import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildDeckHtml,
  buildDocumentHtml,
  buildSlidePageHtml,
  bytesToBase64,
  computePageBreaks,
  escapeHtml,
  exportFileName,
  fileStem,
  inlineCssUrls,
  mimeFromPath,
  pdfLayout,
  preferWoff2,
} from '../src/core/export.js';
import {
  buildKatexExportCss,
  bundleDataUrl,
  extractDeckSize,
  extractSlideSize,
  inlineBundleResources,
  inlineDeckCss,
  prepareDeckExport,
  prepareDocumentExport,
} from '../src/core/export-assets.js';

function fakeBundle(entries) {
  const map = new Map(Object.entries(entries));
  return { get: (path) => map.get(path) };
}

function fakeFile(type, bytes) {
  return {
    type,
    arrayBuffer: async () => new Uint8Array(bytes).buffer,
  };
}

const PNG_BYTES = [0x89, 0x50, 0x4e, 0x47];

describe('export helpers', () => {
  it('escapes HTML for titles and file names', () => {
    expect(escapeHtml('<a & "b">')).toBe('&lt;a &amp; &quot;b&quot;&gt;');
    expect(escapeHtml(null)).toBe('');
  });

  it('derives safe file stems', () => {
    expect(fileStem('docs/notes/intro.md')).toBe('intro');
    expect(fileStem('a/b.report.markdown')).toBe('b.report');
    expect(fileStem('weird: name?.MD')).toBe('weird- name-');
    expect(fileStem('')).toBe('document');
    expect(exportFileName('docs/talk.md', 'slides.pdf')).toBe('talk.slides.pdf');
  });

  it('maps extensions to MIME types', () => {
    expect(mimeFromPath('a/b.png')).toBe('image/png');
    expect(mimeFromPath('fonts/x.woff2')).toBe('font/woff2');
    expect(mimeFromPath('archive.bin')).toBe('application/octet-stream');
  });

  it('base64-encodes byte arrays larger than one chunk', () => {
    const bytes = new Uint8Array(0x8000 + 3);
    bytes[0] = 65;
    bytes[bytes.length - 2] = 66;
    bytes[bytes.length - 1] = 67;
    const encoded = bytesToBase64(bytes);
    const decoded = atob(encoded);
    expect(decoded).toHaveLength(bytes.length);
    expect(decoded.charCodeAt(0)).toBe(65);
    expect(decoded.charCodeAt(decoded.length - 1)).toBe(67);
  });

  it('drops non-woff2 font sources only when woff2 is available', () => {
    const css = `@font-face { font-family: X; src: url(a.woff2) format('woff2'), url(a.woff) format('woff'); }`;
    expect(preferWoff2(css)).toBe(
      `@font-face { font-family: X; src:url(a.woff2) format('woff2'); }`,
    );
    const legacy = `@font-face { src: url(a.woff) format('woff'); }`;
    expect(preferWoff2(legacy)).toBe(legacy);
  });
});

describe('inlineCssUrls', () => {
  it('replaces local references and keeps external ones', async () => {
    const loadDataUrl = vi.fn(async (key) => `data:font/woff2;base64,${key}`);
    const css = `
      @font-face { src: url("fonts/a.woff2?v=1") format('woff2'); }
      .x { background: url(https://example.com/a.png); }
      .y { background: url('data:image/svg+xml;base64,AAA'); }
    `;
    const output = await inlineCssUrls(css, {
      resolveUrl: (reference) => reference.split('?')[0],
      loadDataUrl,
    });

    expect(output).toContain('url("data:font/woff2;base64,fonts/a.woff2")');
    expect(output).toContain('url(https://example.com/a.png)');
    expect(output).toContain("url('data:image/svg+xml;base64,AAA')");
    expect(loadDataUrl).toHaveBeenCalledTimes(1);
  });

  it('leaves references alone when the asset is unavailable or unresolvable', async () => {
    const css = `.a { background: url(missing.png); } .b { background: url(skip.png); }`;
    const output = await inlineCssUrls(css, {
      resolveUrl: (reference) => (reference === 'skip.png' ? null : reference),
      loadDataUrl: async () => null,
    });
    expect(output).toBe(css);
  });

  it('returns source unchanged without loaders', async () => {
    expect(await inlineCssUrls('a{b:url(c)}')).toBe('a{b:url(c)}');
  });
});

describe('HTML builders', () => {
  it('builds a standalone document and escapes its title', () => {
    const html = buildDocumentHtml({
      title: 'A & B',
      bodyHtml: '<p>Hello</p>',
      css: '.katex { color: red; }',
    });
    expect(html).toContain('<title>A &amp; B</title>');
    expect(html).toContain('<p>Hello</p>');
    expect(html).toContain('.katex { color: red; }');
    expect(html).not.toContain('max-width: none');
  });

  it('pins the document width for PDF rendering', () => {
    const html = buildDocumentHtml({
      title: 'Doc',
      bodyHtml: '',
      pdf: true,
      pageWidthPx: 687,
    });
    expect(html).toContain('.markdown-body { width: 687px;');
  });

  it('builds a navigable deck', () => {
    const html = buildDeckHtml({
      title: 'Deck',
      slidesHtml: '<section id="1">one</section><section id="2">two</section>',
      css: 'section { color: red; }',
      width: 1280,
      height: 720,
    });
    expect(html).toContain('<title>Deck</title>');
    expect(html).toContain('id="deck-stage"');
    expect(html).toContain('id="deck-prev"');
    expect(html).toContain('13.333333333333334in 7.5in');
    expect(html).toContain('<section id="1">one</section>');
    expect(html).toContain('scale(');
  });

  it('builds a fixed-size page for rasterising one slide', () => {
    const html = buildSlidePageHtml({
      slideHtml: '<section id="1">slide</section>',
      css: '',
      width: 1280,
      height: 720,
    });
    expect(html).toContain('width: 1280px; height: 720px');
    expect(html).toContain('<section id="1">slide</section>');
  });
});

describe('computePageBreaks', () => {
  it('returns no pages for empty content', () => {
    expect(computePageBreaks([], 0, 1000)).toEqual([]);
  });

  it('keeps short documents on a single page', () => {
    expect(computePageBreaks([{ top: 0, bottom: 400 }], 400, 1000)).toEqual([
      { start: 0, end: 400 },
    ]);
  });

  it('breaks at the last block boundary that fills the page', () => {
    const pages = computePageBreaks(
      [{ bottom: 900 }, { bottom: 950 }, { bottom: 1200 }, { bottom: 1800 }],
      2000,
      1000,
    );
    expect(pages[0]).toEqual({ start: 0, end: 950 });
    expect(pages[1].start).toBe(950);
    expect(pages.at(-1).end).toBe(2000);
  });

  it('falls back to a hard break when no block fills the page', () => {
    const pages = computePageBreaks([{ bottom: 100 }], 2500, 1000);
    expect(pages).toEqual([
      { start: 0, end: 1000 },
      { start: 1000, end: 2000 },
      { start: 2000, end: 2500 },
    ]);
  });
});

describe('pdfLayout', () => {
  it('converts A4 points to CSS pixels', () => {
    const layout = pdfLayout();
    expect(layout.contentWidthPt).toBeCloseTo(515.28, 2);
    expect(layout.contentWidthPx).toBe(Math.floor(515.28 * (96 / 72)));
    expect(layout.contentHeightPx).toBeGreaterThan(1000);
  });
});

describe('export assets', () => {
  it('builds data URLs from bundle files with a MIME fallback', async () => {
    const bundle = fakeBundle({
      'img/a.png': fakeFile('image/png', PNG_BYTES),
      'img/b.svg': fakeFile('', [1, 2]),
    });
    await expect(bundleDataUrl('img/a.png', bundle)).resolves.toBe(
      'data:image/png;base64,iVBORw==',
    );
    await expect(bundleDataUrl('img/b.svg', bundle)).resolves.toBe(
      'data:image/svg+xml;base64,AQI=',
    );
    await expect(bundleDataUrl('missing.png', bundle)).resolves.toBeNull();
  });

  it('inlines media, links and inline styles, and reports missing files', async () => {
    document.body.innerHTML = `
      <img id="ok" src="img/a.png">
      <img id="gone" src="img/gone.png" data-missing-resource="x">
      <a id="md" href="other.md">doc</a>
      <a id="file" href="files/report.pdf">pdf</a>
      <div id="styled" style="background: url(bg.gif)"></div>
    `;
    const bundle = fakeBundle({
      'docs/img/a.png': fakeFile('image/png', PNG_BYTES),
      'docs/files/report.pdf': fakeFile('application/pdf', [1]),
      'docs/bg.gif': fakeFile('image/gif', [2]),
    });

    const result = await inlineBundleResources(document.body, {
      markdownPath: 'docs/page.md',
      bundle,
    });

    expect(result.missing).toEqual(['docs/img/gone.png']);
    expect(document.getElementById('ok').getAttribute('src')).toMatch(
      /^data:image\/png;base64,/,
    );
    expect(document.getElementById('md').getAttribute('href')).toBe('other.md');
    expect(document.getElementById('file').getAttribute('href')).toMatch(
      /^data:application\/pdf;base64,/,
    );
    expect(document.getElementById('styled').getAttribute('style')).toMatch(
      /^background: url\("data:image\/gif;base64,/,
    );
    expect(document.getElementById('gone').hasAttribute('data-missing-resource')).toBe(
      false,
    );
  });

  it('does nothing without a bundle', async () => {
    document.body.innerHTML = '<img src="a.png">';
    await expect(inlineBundleResources(document.body, {})).resolves.toEqual({
      inlined: 0,
      missing: [],
    });
  });

  it('reads slide dimensions from Marp CSS', () => {
    expect(
      extractDeckSize(
        'div.marpit > section{width:1600px;height:900px;box-sizing:border-box}',
      ),
    ).toEqual({ width: 1600, height: 900 });
    expect(extractDeckSize('', { width: 800, height: 600 })).toEqual({
      width: 800,
      height: 600,
    });
  });

  it('reads slide dimensions from the Marp viewBox', () => {
    expect(
      extractSlideSize([
        '<svg data-marpit-svg="" viewBox="0 0 1600 900"></svg>',
        '<svg viewBox="0 0 1280 720"></svg>',
      ]),
    ).toEqual({ width: 1600, height: 900 });
    expect(extractSlideSize([], { width: 800, height: 600 })).toEqual({
      width: 800,
      height: 600,
    });
  });

  it('inlines KaTeX fonts relative to the vendor directory', async () => {
    const loadDataUrl = vi.fn(async (path) => `data:;base64,${path}`);
    const css = await buildKatexExportCss(
      async () =>
        `@font-face { src: url("fonts/KaTeX.woff2") format('woff2'), url("fonts/KaTeX.woff") format('woff'); }`,
      loadDataUrl,
    );
    expect(loadDataUrl).toHaveBeenCalledWith('vendor/katex/fonts/KaTeX.woff2');
    expect(css).toContain('vendor/katex/fonts/KaTeX.woff2');
    expect(css).not.toContain('KaTeX.woff"');
  });

  it('inlines deck CSS from the extension root', async () => {
    const loadDataUrl = vi.fn(async (path) => `data:;base64,${path}`);
    const css = await inlineDeckCss(
      `@font-face { src: url(vendor/katex/fonts/x.woff2); }`,
      loadDataUrl,
    );
    expect(loadDataUrl).toHaveBeenCalledWith('vendor/katex/fonts/x.woff2');
    expect(css).toContain('data:;base64,vendor/katex/fonts/x.woff2');
  });
});

describe('prepared exports', () => {
  beforeEach(() => {
    vi.stubGlobal('chrome', {
      runtime: { getURL: (path) => `chrome-extension://test/${path}` },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        const path = String(url);
        if (path.endsWith('.css')) {
          return {
            ok: true,
            status: 200,
            text: async () => '@font-face { src: url("fonts/x.woff2"); }',
          };
        }
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => new Uint8Array([1]).buffer,
        };
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('prepares a document with an inlined image and KaTeX CSS', async () => {
    const bundle = fakeBundle({
      'docs/img/a.png': fakeFile('image/png', PNG_BYTES),
    });
    const prepared = await prepareDocumentExport({
      text: '# Title\n\n![logo](img/a.png)',
      markdownPath: 'docs/page.md',
      bundle,
    });

    expect(prepared.title).toBe('Title');
    expect(prepared.bodyHtml).toContain('id="title"');
    expect(prepared.bodyHtml).toContain('data:image/png;base64,');
    expect(prepared.missing).toEqual([]);
    expect(prepared.css).toContain('data:font/woff2;base64,');
  });

  it('prepares a deck with inlined slides and dimensions', async () => {
    const prepared = await prepareDeckExport({
      text: '---\nmarp: true\n---\n\n# One $x^2$\n\n---\n\n# Two',
      markdownPath: 'docs/deck.md',
      bundle: fakeBundle({}),
    });

    expect(prepared.slides).toHaveLength(2);
    expect(prepared.slides[0]).toContain('<section');
    expect(prepared.width).toBe(1280);
    expect(prepared.height).toBe(720);
    expect(prepared.css).toContain('data:font/woff2;base64,');
  });
});
