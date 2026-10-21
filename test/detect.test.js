import { describe, expect, it } from 'vitest';

import {
  analyzeMarkdown,
  extractTitle,
  prettyName,
  stripCodeFences,
  stripInlineMarkup,
} from '../src/core/detect.js';

describe('analyzeMarkdown', () => {
  it('detects Marp via boolean and string front matter flags', () => {
    expect(analyzeMarkdown('---\nmarp: true\n---\n# A', 'deck.md').isMarp).toBe(true);
    expect(analyzeMarkdown('---\nmarp: "true"\n---\n# A', 'deck.md').isMarp).toBe(true);
    expect(analyzeMarkdown('---\nmarp: false\n---\n# A', 'doc.md').isMarp).toBe(false);
    expect(analyzeMarkdown('# A', 'doc.md').isMarp).toBe(false);
  });

  it('collects title, theme and body', () => {
    const analysis = analyzeMarkdown(
      '---\nmarp: true\ntheme: uncover\n---\n# My **deck**\n\nBody',
      'slides/deck.md',
    );
    expect(analysis.title).toBe('My deck');
    expect(analysis.theme).toBe('uncover');
    expect(analysis.body).toBe('# My **deck**\n\nBody');
    expect(analysis.hasFrontmatter).toBe(true);
  });

  it('falls back to a readable file name', () => {
    expect(analyzeMarkdown('No heading here', 'my-first_deck.md').title).toBe(
      'my first deck',
    );
    expect(analyzeMarkdown('', '').title).toBe('Untitled');
  });

  it('ignores non-string theme values', () => {
    expect(analyzeMarkdown('---\ntheme: true\n---\n', 'x.md').theme).toBe('');
  });
});

describe('title helpers', () => {
  it('ignores headings inside fenced code', () => {
    expect(extractTitle('# Real\n\n```\n# Fake\n```')).toBe('Real');
    expect(extractTitle('```\n# Fake\n```')).toBe('');
  });

  it('strips links, images, emphasis and HTML from headings', () => {
    expect(
      stripInlineMarkup('**Bold** _and_ `code` [link](x) ![alt](y) <b>tag</b>'),
    ).toBe('Bold and code link alt tag');
  });

  it('strips fenced blocks with tildes as well as backticks', () => {
    expect(stripCodeFences('a\n~~~\n# hidden\n~~~\nb')).toBe('a\n\nb');
  });

  it('prettifies file names', () => {
    expect(prettyName('release-notes_v2.markdown')).toBe('release notes v2');
    expect(prettyName('')).toBe('Untitled');
    expect(prettyName('README.MD')).toBe('README');
  });
});
