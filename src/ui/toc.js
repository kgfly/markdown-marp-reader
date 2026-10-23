const HEADING_SELECTOR = 'h1, h2, h3, h4, h5, h6';
const MAX_DEPTH = 5;

/**
 * Read the headings of a rendered document for a table of contents.
 * Entries without an id cannot be linked to and are skipped.
 */
export function collectTocEntries(root) {
  if (!root || typeof root.querySelectorAll !== 'function') return [];

  const entries = [];
  for (const heading of root.querySelectorAll(HEADING_SELECTOR)) {
    const id = heading.id;
    const text = (heading.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!id || !text) continue;
    entries.push({ id, text, level: Number(heading.tagName.slice(1)) });
  }
  return entries;
}

/**
 * Indent headings relative to the shallowest one in the document, so an
 * outline starting at h2 does not waste space on an empty h1 level.
 */
export function layoutToc(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return [];

  const baseLevel = Math.min(...entries.map((entry) => entry.level));
  return entries.map((entry) => ({
    ...entry,
    depth: Math.max(0, Math.min(entry.level - baseLevel, MAX_DEPTH)),
  }));
}

/**
 * Pick the heading that is currently at or above the activation line.
 * `tops` are viewport-relative offsets in document order; non-finite values
 * (for example a missing heading) stop the scan.
 */
export function pickActiveTocIndex(tops, threshold = 0) {
  if (!Array.isArray(tops) || tops.length === 0) return -1;

  let index = 0;
  for (let i = 0; i < tops.length; i += 1) {
    if (!Number.isFinite(tops[i])) break;
    if (tops[i] > threshold) break;
    index = i;
  }
  return index;
}
