#!/usr/bin/env node
/**
 * Generates the extension icons (PNG, with a matching SVG source) without any
 * image dependency. Run with `npm run icons`; the build does this automatically.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(HERE, '..', 'assets', 'icons');
const SIZES = [16, 32, 48, 128];

const INDIGO = [79, 70, 229];
const VIOLET = [124, 58, 237];

const M_SEGMENTS = [
  [0.25, 0.71, 0.25, 0.31],
  [0.25, 0.31, 0.4, 0.53],
  [0.4, 0.53, 0.55, 0.31],
  [0.55, 0.31, 0.55, 0.71],
];
const ARROW_TRIANGLE = [
  [0.63, 0.54],
  [0.89, 0.54],
  [0.76, 0.76],
];
const ARROW_STEM = [0.76, 0.27, 0.76, 0.62];

export async function generateIcons() {
  await mkdir(OUT_DIR, { recursive: true });
  for (const size of SIZES) {
    await writeFile(path.join(OUT_DIR, `icon${size}.png`), renderPng(size));
  }
  await writeFile(path.join(OUT_DIR, 'icon.svg'), SVG_SOURCE);
}

const SVG_SOURCE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-label="Markdown and Marp Reader">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#4f46e5"/>
      <stop offset="1" stop-color="#7c3aed"/>
    </linearGradient>
  </defs>
  <rect x="4" y="4" width="120" height="120" rx="28" fill="url(#g)"/>
  <path d="M32 91V40l19 28 19-28v51" fill="none" stroke="#fff" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M97 35v45" fill="none" stroke="#fff" stroke-width="11" stroke-linecap="round"/>
  <path d="M79 70h36l-18 27z" fill="#fff"/>
</svg>
`;

function renderPng(size) {
  const scale = 4;
  const width = size * scale;
  const height = size * scale;
  const pixels = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const px = (x + 0.5) / width;
      const py = (y + 0.5) / height;
      const offset = (y * width + x) * 4;

      if (!insideRoundedRect(px, py)) continue;

      const gradient = Math.min(1, (px + py) / 2);
      let [r, g, b] = INDIGO.map((channel, index) =>
        Math.round(channel + (VIOLET[index] - channel) * gradient),
      );

      if (insideGlyph(px, py)) {
        r = 255;
        g = 255;
        b = 255;
      }

      pixels[offset] = r;
      pixels[offset + 1] = g;
      pixels[offset + 2] = b;
      pixels[offset + 3] = 255;
    }
  }

  return encodePng(width, height, pixels, scale);
}

function insideRoundedRect(x, y) {
  const left = 0.035;
  const radius = 0.22;
  const qx = Math.abs(x - 0.5) - (0.5 - left - radius);
  const qy = Math.abs(y - 0.5) - (0.5 - left - radius);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  const inside = Math.min(Math.max(qx, qy), 0);
  return outside + inside - radius <= 0;
}

function insideGlyph(x, y) {
  if (pointInTriangle(x, y, ARROW_TRIANGLE)) return true;
  if (distanceToSegment(x, y, ...ARROW_STEM) <= 0.055) return true;
  return M_SEGMENTS.some((segment) => distanceToSegment(x, y, ...segment) <= 0.058);
}

function distanceToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSquared));
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function pointInTriangle(px, py, [a, b, c]) {
  const sign = (p1, p2, p3) =>
    (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1]);
  const d1 = sign([px, py], a, b);
  const d2 = sign([px, py], b, c);
  const d3 = sign([px, py], c, a);
  const hasNegative = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPositive = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNegative && hasPositive);
}

function encodePng(width, height, rgba, scale) {
  const outWidth = width / scale;
  const outHeight = height / scale;
  const data = Buffer.alloc((outWidth * 4 + 1) * outHeight);

  for (let y = 0; y < outHeight; y += 1) {
    const rowStart = y * (outWidth * 4 + 1);
    data[rowStart] = 0; // filter: none
    for (let x = 0; x < outWidth; x += 1) {
      const sums = [0, 0, 0, 0];
      for (let sy = 0; sy < scale; sy += 1) {
        for (let sx = 0; sx < scale; sx += 1) {
          const source = ((y * scale + sy) * width + (x * scale + sx)) * 4;
          for (let channel = 0; channel < 4; channel += 1) {
            sums[channel] += rgba[source + channel];
          }
        }
      }
      const target = rowStart + 1 + x * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        data[target + channel] = Math.round(sums[channel] / (scale * scale));
      }
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(outWidth, 0);
  ihdr.writeUInt32BE(outHeight, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(data, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'ascii');
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  generateIcons()
    .then(() => console.log(`Icons written to ${OUT_DIR}`))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
