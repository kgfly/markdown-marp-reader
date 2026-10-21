import { describe, expect, it } from 'vitest';

import {
  addHeadingIds,
  renderMarkdown,
  sanitizeHtml,
  slugifyHeading,
} from '../src/core/markdown.js';

describe('renderMarkdown', () => {
  it('renders GFM, tables and code blocks', () => {
    const { html } = renderMarkdown(
      '# Title\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n```js\nconst x = 1;\n```',
    );
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<table>');
    expect(html).toContain('<code class="language-js">');
  });

  it('renders inline and display math with KaTeX', () => {
    const { html } = renderMarkdown('Euler: $e^{i\\pi} + 1 = 0$\n\n$$\\int_0^1 x^2 dx$$');
    expect(html).toContain('class="katex"');
    expect(html).toContain('katex-display');
    expect(html).toContain('<math');
    expect(html).not.toContain('$e^{i');
  });

  it('strips front matter and reports Marp metadata', () => {
    const result = renderMarkdown(
      '---\nmarp: true\ntheme: gaia\n---\n# Slide one',
      'deck.md',
    );
    expect(result.isMarp).toBe(true);
    expect(result.attributes).toEqual({ marp: true, theme: 'gaia' });
    expect(result.title).toBe('Slide one');
    expect(result.html).not.toContain('marp: true');
    expect(result.body).toBe('# Slide one');
  });

  it('removes scripts, event handlers and javascript: URLs', () => {
    const { html } = renderMarkdown(
      '<script>alert(1)</script>\n\n<img src="x" onerror="alert(2)">\n\n[click](javascript:alert(3))',
    );
    expect(html).not.toContain('<script');
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('javascript:');
  });

  it('marks external links as safe new-tab links', () => {
    const { html } = renderMarkdown(
      '[external](https://example.com/docs) [internal](other.md)',
    );
    expect(html).toContain('href="https://example.com/docs"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toMatch(/<a href="other\.md">internal<\/a>/);
  });

  it('can skip sanitization for trusted content', () => {
    const { html } = renderMarkdown('<div class="raw">x</div>', { sanitize: false });
    expect(html).toContain('<div class="raw">x</div>');
  });
});

describe('sanitizeHtml', () => {
  it('keeps MathML and SVG produced by KaTeX', () => {
    const html = sanitizeHtml(
      '<span class="katex"><svg><path d="M0 0"></path></svg><math><mi>x</mi></math></span>',
    );
    expect(html).toContain('<svg>');
    expect(html).toContain('<math>');
  });
});

describe('heading ids', () => {
  it('slugifies headings', () => {
    expect(slugifyHeading('Hello, World!')).toBe('hello-world');
    expect(slugifyHeading('  Ünïcode **bold** `code` ')).toBe('ünïcode-bold-code');
    expect(slugifyHeading('<span>tag</span>')).toBe('tag');
    expect(slugifyHeading('***')).toBe('section');
  });

  it('adds unique ids and preserves existing ones', () => {
    document.body.innerHTML =
      '<h1>Same</h1><h2>Same</h2><h3 id="keep">Same</h3><h4>Other</h4>';
    addHeadingIds(document.body);
    const ids = [...document.querySelectorAll('h1,h2,h3,h4')].map((h) => h.id);
    expect(ids).toEqual(['same', 'same-2', 'keep', 'other']);
  });

  it('ignores non-elements', () => {
    expect(() => addHeadingIds(null)).not.toThrow();
    expect(() => addHeadingIds({})).not.toThrow();
  });
});
