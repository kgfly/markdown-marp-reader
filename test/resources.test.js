import { beforeEach, describe, expect, it, vi } from 'vitest';

import { rewriteCssUrls, rewriteResourceUrls } from '../src/core/resources.js';
import { makeBundleLike } from './helpers.js';

describe('rewriteResourceUrls', () => {
  let bundle;

  beforeEach(() => {
    bundle = makeBundleLike({
      'docs/img/a.png': 'a',
      'docs/img/poster.jpg': 'poster',
      'docs/video.mp4': 'video',
    });
  });

  it('rewrites media attributes and returns how many changed', () => {
    document.body.innerHTML = `
      <img id="img" src="img/a.png">
      <video id="video" poster="img/poster.jpg"><source src="video.mp4"></video>
    `;
    const result = rewriteResourceUrls(document.body, {
      markdownPath: 'docs/deck.md',
      bundle,
    });

    expect(result).toEqual({ rewritten: 3, missing: [] });
    expect(document.getElementById('img').getAttribute('src')).toBe(
      'blob:test/docs/img/a.png',
    );
    expect(document.getElementById('video').getAttribute('poster')).toBe(
      'blob:test/docs/img/poster.jpg',
    );
    expect(document.querySelector('source').getAttribute('src')).toBe(
      'blob:test/docs/video.mp4',
    );
  });

  it('rewrites SVG image href attributes', () => {
    document.body.innerHTML = '<svg><image id="svg" href="img/a.png"></image></svg>';
    const result = rewriteResourceUrls(document.body, {
      markdownPath: 'docs/deck.md',
      bundle,
    });
    expect(result.rewritten).toBe(1);
    expect(document.getElementById('svg').getAttribute('href')).toBe(
      'blob:test/docs/img/a.png',
    );
  });

  it('preserves query and hash suffixes', () => {
    document.body.innerHTML = '<img src="img/a.png#frag" alt="">';
    rewriteResourceUrls(document.body, { markdownPath: 'docs/deck.md', bundle });
    expect(document.querySelector('img').getAttribute('src')).toBe(
      'blob:test/docs/img/a.png#frag',
    );
  });

  it('flags missing resources once and reports them to the caller', () => {
    document.body.innerHTML =
      '<img id="one" src="img/missing.png"><img id="two" src="img/missing.png">';
    const onMissing = vi.fn();
    const result = rewriteResourceUrls(document.body, {
      markdownPath: 'docs/deck.md',
      bundle,
      onMissing,
    });

    expect(result.missing).toEqual(['docs/img/missing.png']);
    expect(onMissing).toHaveBeenCalledTimes(1);
    expect(document.getElementById('one').hasAttribute('data-missing-resource')).toBe(
      true,
    );
    expect(document.getElementById('two').hasAttribute('data-missing-resource')).toBe(
      true,
    );
  });

  it('leaves external and data URLs alone', () => {
    document.body.innerHTML =
      '<img id="remote" src="https://example.com/a.png"><img id="data" src="data:image/gif;base64,R0lGOD">';
    const result = rewriteResourceUrls(document.body, {
      markdownPath: 'docs/deck.md',
      bundle,
    });
    expect(result.rewritten).toBe(0);
    expect(document.getElementById('remote').getAttribute('src')).toBe(
      'https://example.com/a.png',
    );
  });

  it('rewrites url() inside inline styles, including the root element', () => {
    document.body.innerHTML =
      '<div id="root" style="background: url( img/a.png )"></div>';
    const root = document.getElementById('root');
    const result = rewriteResourceUrls(root, {
      markdownPath: 'docs/deck.md',
      bundle,
    });
    expect(result.rewritten).toBe(1);
    expect(root.getAttribute('style')).toBe(
      'background: url("blob:test/docs/img/a.png")',
    );
  });

  it('reports missing inline-style resources without breaking the style', () => {
    document.body.innerHTML =
      '<div id="root" style="background: url(missing.png)"></div>';
    const root = document.getElementById('root');
    const result = rewriteResourceUrls(root, {
      markdownPath: 'docs/deck.md',
      bundle,
    });
    expect(result.missing).toEqual(['docs/missing.png']);
    expect(root.getAttribute('style')).toContain('url(missing.png)');
  });

  it('returns an empty result without a root or bundle', () => {
    expect(rewriteResourceUrls(null, { markdownPath: 'a.md', bundle })).toEqual({
      rewritten: 0,
      missing: [],
    });
    expect(
      rewriteResourceUrls(document.body, { markdownPath: 'a.md', bundle: null }),
    ).toEqual({ rewritten: 0, missing: [] });
  });
});

describe('rewriteCssUrls', () => {
  it('rewrites resolved URLs and escapes quotes', () => {
    const rewrite = (reference) =>
      reference === 'a.png' ? { url: 'blob:test/a"b.png' } : null;
    expect(rewriteCssUrls('background:url(a.png)', rewrite)).toBe(
      'background:url("blob:test/a\\"b.png")',
    );
  });

  it('keeps unresolved references and calls onMissing', () => {
    const onMissing = vi.fn();
    const result = rewriteCssUrls(
      'url(missing.png) url(https://x/y.png)',
      (reference) => (reference === 'missing.png' ? { missing: 'missing.png' } : null),
      onMissing,
    );
    expect(result).toBe('url(missing.png) url(https://x/y.png)');
    expect(onMissing).toHaveBeenCalledWith('missing.png');
  });
});
