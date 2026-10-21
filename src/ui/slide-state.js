/**
 * Pure slide navigation helpers. Wrapping at both ends matches what
 * presentation software does, and keeps keyboard handling trivial.
 */
export function clampIndex(index, count) {
  if (!Number.isFinite(count) || count <= 0) return 0;
  const value = Number.isFinite(index) ? Math.trunc(index) : 0;
  return Math.min(Math.max(value, 0), count - 1);
}

export function stepIndex(index, delta, count, { wrap = true } = {}) {
  if (!Number.isFinite(count) || count <= 0) return 0;
  const current = clampIndex(index, count);
  const next = current + Math.trunc(Number(delta) || 0);
  if (wrap) return ((next % count) + count) % count;
  return clampIndex(next, count);
}

export function formatSlideCounter(index, count) {
  if (!Number.isFinite(count) || count <= 0) return '0 / 0';
  return `${clampIndex(index, count) + 1} / ${count}`;
}

/**
 * Size (in CSS pixels) of the largest 16:9 rectangle that fits in the given
 * box. Used to keep the sandboxed slide iframe from letterboxing twice.
 */
export function fitSlideSize(width, height, { aspect = 16 / 9, padding = 0 } = {}) {
  const availableWidth = Math.max(0, Number(width) - padding * 2);
  const availableHeight = Math.max(0, Number(height) - padding * 2);
  const byWidth = { width: availableWidth, height: availableWidth / aspect };
  const byHeight = { width: availableHeight * aspect, height: availableHeight };
  const size = byWidth.height <= availableHeight ? byWidth : byHeight;
  return {
    width: Math.floor(size.width),
    height: Math.floor(size.height),
  };
}
