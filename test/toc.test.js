import { describe, expect, it } from 'vitest';

import { collectTocEntries, layoutToc, pickActiveTocIndex } from '../src/ui/toc.js';

function container(html) {
  const root = document.createElement('div');
  root.innerHTML = html;
  return root;
}

describe('collectTocEntries', () => {
  it('collects headings in document order with their levels', () => {
    const root = container(`
      <h1 id="intro">Intro</h1>
      <h2 id="setup">Getting <em>set</em> up</h2>
      <h3 id="deep">Deep   dive</h3>
    `);

    expect(collectTocEntries(root)).toEqual([
      { id: 'intro', text: 'Intro', level: 1 },
      { id: 'setup', text: 'Getting set up', level: 2 },
      { id: 'deep', text: 'Deep dive', level: 3 },
    ]);
  });

  it('skips headings without an id or text', () => {
    const root = container(`
      <h2>No id</h2>
      <h3 id="empty">   </h3>
      <h4 id="kept">Kept</h4>
    `);

    expect(collectTocEntries(root)).toEqual([{ id: 'kept', text: 'Kept', level: 4 }]);
  });

  it('returns an empty list for a missing container', () => {
    expect(collectTocEntries(null)).toEqual([]);
  });
});

describe('layoutToc', () => {
  it('indents relative to the shallowest heading', () => {
    const entries = [
      { id: 'a', text: 'A', level: 3 },
      { id: 'b', text: 'B', level: 3 },
      { id: 'c', text: 'C', level: 5 },
      { id: 'd', text: 'D', level: 1 },
    ];

    expect(layoutToc(entries).map(({ id, depth }) => ({ id, depth }))).toEqual([
      { id: 'a', depth: 2 },
      { id: 'b', depth: 2 },
      { id: 'c', depth: 4 },
      { id: 'd', depth: 0 },
    ]);
  });

  it('handles an empty outline', () => {
    expect(layoutToc([])).toEqual([]);
  });
});

describe('pickActiveTocIndex', () => {
  it('returns the last heading at or above the activation line', () => {
    expect(pickActiveTocIndex([-120, 20, 140, 300], 80)).toBe(1);
  });

  it('keeps the first heading active while the page is above it', () => {
    expect(pickActiveTocIndex([200, 340], 80)).toBe(0);
  });

  it('handles missing headings and empty outlines', () => {
    expect(pickActiveTocIndex([-10, Infinity, -30], 80)).toBe(0);
    expect(pickActiveTocIndex([], 80)).toBe(-1);
    expect(pickActiveTocIndex(undefined, 80)).toBe(-1);
  });
});
