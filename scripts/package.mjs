#!/usr/bin/env node
/**
 * Builds dist/ and packs it into release/markdown-marp-reader-<version>.zip,
 * which is the file to upload to the Chrome Web Store.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildExtension } from './build.mjs';
import { formatBytes, listFiles } from './lib/files.mjs';
import { createZip } from './lib/zip.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const RELEASE = path.join(ROOT, 'release');

export async function packageExtension({ skipBuild = false } = {}) {
  if (!skipBuild) await buildExtension();

  const pkg = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
  const files = await listFiles(DIST);
  if (!files.some((file) => file.path === 'manifest.json')) {
    throw new Error('dist/manifest.json is missing — run `npm run build` first');
  }

  const entries = [];
  for (const file of files) {
    entries.push({ name: file.path, data: await readFile(file.absolute) });
  }

  const zip = createZip(entries);
  await mkdir(RELEASE, { recursive: true });
  const target = path.join(RELEASE, `markdown-marp-reader-${pkg.version}.zip`);
  await writeFile(target, zip);

  const sourceBytes = files.reduce((sum, file) => sum + file.size, 0);
  console.log(
    `\nPacked ${files.length} files (${formatBytes(sourceBytes)}) into ${path.relative(ROOT, target)} (${formatBytes(zip.length)}).`,
  );
  return { target, files: files.length, bytes: zip.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  packageExtension({ skipBuild: process.argv.includes('--skip-build') }).catch(
    (error) => {
      console.error(error);
      process.exitCode = 1;
    },
  );
}
