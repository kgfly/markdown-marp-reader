import { describe, expect, it } from 'vitest';

import {
  clampIndex,
  fitSlideSize,
  formatSlideCounter,
  stepIndex,
} from '../src/ui/slide-state.js';

describe('clampIndex', () => {
  it('clamps into range and normalizes bad values', () => {
    expect(clampIndex(0, 3)).toBe(0);
    expect(clampIndex(2, 3)).toBe(2);
    expect(clampIndex(9, 3)).toBe(2);
    expect(clampIndex(-1, 3)).toBe(0);
    expect(clampIndex(1.7, 3)).toBe(1);
    expect(clampIndex(Number.NaN, 3)).toBe(0);
    expect(clampIndex(1, 0)).toBe(0);
    expect(clampIndex(1, Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('stepIndex', () => {
  it('wraps by default', () => {
    expect(stepIndex(0, 1, 3)).toBe(1);
    expect(stepIndex(2, 1, 3)).toBe(0);
    expect(stepIndex(0, -1, 3)).toBe(2);
    expect(stepIndex(5, 0, 3)).toBe(2);
  });

  it('can stop at the ends', () => {
    expect(stepIndex(0, -1, 3, { wrap: false })).toBe(0);
    expect(stepIndex(2, 1, 3, { wrap: false })).toBe(2);
    expect(stepIndex(0, 1, 3, { wrap: false })).toBe(1);
    expect(stepIndex(0, 9, 3, { wrap: false })).toBe(2);
  });

  it('returns zero without slides', () => {
    expect(stepIndex(0, 1, 0)).toBe(0);
    expect(stepIndex(0, 1, Number.NaN)).toBe(0);
  });
});

describe('formatSlideCounter', () => {
  it('uses one-based numbering', () => {
    expect(formatSlideCounter(0, 3)).toBe('1 / 3');
    expect(formatSlideCounter(2, 3)).toBe('3 / 3');
    expect(formatSlideCounter(9, 3)).toBe('3 / 3');
    expect(formatSlideCounter(0, 0)).toBe('0 / 0');
  });
});

describe('fitSlideSize', () => {
  it('fits a 16:9 rectangle by width when the box is wide', () => {
    expect(fitSlideSize(1000, 1000, { padding: 20 })).toEqual({
      width: 960,
      height: 540,
    });
  });

  it('fits by height when the box is tall', () => {
    expect(fitSlideSize(400, 1000, { padding: 0 })).toEqual({ width: 400, height: 225 });
  });

  it('honours a custom aspect ratio and never goes negative', () => {
    expect(fitSlideSize(800, 800, { aspect: 4 / 3 })).toEqual({
      width: 800,
      height: 600,
    });
    expect(fitSlideSize(10, 10, { padding: 20 })).toEqual({ width: 0, height: 0 });
  });
});
