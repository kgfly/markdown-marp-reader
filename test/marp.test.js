import { describe, expect, it } from 'vitest';

import {
  buildSlideDocument,
  countSlides,
  getMarp,
  markActiveSlide,
  renderMarp,
} from '../src/core/marp.js';

const DECK = `---
marp: true
theme: default
---

# One

---

# Two

---

# Three
`;

describe('renderMarp', () => {
  it('renders one SVG per slide and keeps Marp CSS', () => {
    const { html, css, slideCount } = renderMarp(DECK);
    expect(slideCount).toBe(3);
    expect(html.match(/data-marpit-svg/g)).toHaveLength(3);
    expect(css).toContain('section');
    expect(html).toContain('<h1 id="one">One</h1>');
    expect(html).toContain('<h1 id="three">Three</h1>');
  });

  it('renders KaTeX math with packages font paths instead of a CDN', () => {
    const { html, css } = renderMarp('---\nmarp: true\n---\n\n$e^{i\\pi}+1=0$');
    expect(html).toContain('class="katex"');
    expect(css).not.toContain('cdn.jsdelivr.net');
  });

  it('reuses a single engine instance', () => {
    expect(getMarp()).toBe(getMarp());
  });

  it('counts only Marp slide SVGs', () => {
    expect(
      countSlides(
        '<svg data-marpit-svg="true"></svg><svg viewBox="0 0 1 1"></svg><svg class="x" data-marpit-svg></svg>',
      ),
    ).toBe(2);
    expect(countSlides('')).toBe(0);
    expect(countSlides(null)).toBe(0);
  });
});

describe('markActiveSlide', () => {
  it('moves the is-active class between slides', () => {
    const html =
      '<svg data-marpit-svg="true" class="first"></svg><svg data-marpit-svg="true"></svg><svg data-marpit-svg="true" class="is-active third"></svg>';

    const first = markActiveSlide(html, 0);
    expect(first).toContain('class="first is-active"');
    expect(first.match(/is-active/g)).toHaveLength(1);

    const second = markActiveSlide(html, 1);
    expect(second.match(/is-active/g)).toHaveLength(1);
    expect(second).toContain('<svg data-marpit-svg="true" class="is-active">');
    expect(second).not.toContain('third is-active');
  });

  it('handles single quotes and self-closing tags', () => {
    expect(
      markActiveSlide("<svg data-marpit-svg='true' class='a b'></svg>", 0),
    ).toContain("class='a b is-active'");
    expect(markActiveSlide('<svg data-marpit-svg="true"/>', 0)).toContain(
      ' class="is-active"/>',
    );
    expect(markActiveSlide('<svg data-marpit-svg="true"></svg>', 5)).not.toContain(
      'is-active',
    );
  });

  it('removes an empty class attribute when deactivating', () => {
    expect(
      markActiveSlide('<svg data-marpit-svg="true" class="is-active"></svg>', 3),
    ).toBe('<svg data-marpit-svg="true" ></svg>');
  });
});

describe('buildSlideDocument', () => {
  it('includes CSS, the base URL and only the active slide', () => {
    const html = markActiveSlide(
      '<svg data-marpit-svg="true"><foreignObject><section>A</section></foreignObject></svg>',
      0,
    );
    const doc = buildSlideDocument({
      html,
      css: 'section { color: red; }',
      activeIndex: 0,
      baseUri: 'chrome-extension://abc/',
    });

    expect(doc).toContain('<!doctype html>');
    expect(doc).toContain('<base href="chrome-extension://abc/">');
    expect(doc).toContain('section { color: red; }');
    expect(doc).toContain('.is-active { display: block; }');
    expect(doc).toContain('is-active');
  });

  it('omits the base tag and clamps negative indexes', () => {
    const doc = buildSlideDocument({
      html: '<svg data-marpit-svg="true"></svg>',
      css: '',
      activeIndex: -4,
    });
    expect(doc).not.toContain('<base');
    expect(doc).toContain('is-active');
  });

  it('escapes the base URL', () => {
    const doc = buildSlideDocument({
      html: '',
      css: '',
      baseUri: 'chrome-extension://a/"b"',
    });
    expect(doc).toContain('&quot;b&quot;');
  });
});
