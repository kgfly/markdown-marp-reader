import { vi } from 'vitest';

let counter = 0;

// jsdom does not implement object URLs; the viewer relies on them for local
// images, so tests get deterministic values instead of "not implemented".
URL.createObjectURL = vi.fn(() => `blob:mock/${(counter += 1)}`);
URL.revokeObjectURL = vi.fn();
