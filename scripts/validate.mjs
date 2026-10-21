#!/usr/bin/env node
/**
 * Sanity-checks the built extension before it is loaded, published or zipped.
 * The checks mirror Chrome Web Store rejections we care about: missing icons,
 * remote code, a broken manifest, or a viewer that references files that the
 * build did not copy.
 */
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { formatBytes, listFiles } from './lib/files.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const ICON_SIZES = [16, 32, 48, 128];

export async function validateExtension() {
  const errors = [];
  const warnings = [];

  const exists = async (relative) => {
    try {
      await stat(path.join(DIST, relative));
      return true;
    } catch {
      return false;
    }
  };

  const pkg = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
  const manifestPath = path.join(DIST, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

  if (manifest.manifest_version !== 3) {
    errors.push('manifest.json must use manifest_version 3');
  }
  if (manifest.version !== pkg.version) {
    errors.push(
      `manifest version (${manifest.version}) does not match package.json (${pkg.version})`,
    );
  }
  if (!/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(manifest.version ?? '')) {
    errors.push('manifest version must be 1-4 dot-separated numbers');
  }
  if (manifest.background?.service_worker !== 'background.js') {
    errors.push('manifest.background.service_worker must be background.js');
  }
  if ('content_security_policy' in manifest) {
    const policy = manifest.content_security_policy?.extension_pages ?? '';
    if (/unsafe-eval|unsafe-inline|https?:/.test(policy)) {
      errors.push(`extension CSP is too permissive: ${policy}`);
    }
  }

  const required = [
    'manifest.json',
    'background.js',
    'viewer.html',
    'viewer.css',
    'viewer.js',
    'THIRD_PARTY_NOTICES.md',
    'vendor/katex/katex.min.css',
    ...ICON_SIZES.map((size) => `icons/icon${size}.png`),
  ];
  for (const file of required) {
    if (!(await exists(file))) errors.push(`missing dist/${file}`);
  }

  for (const size of ICON_SIZES) {
    const icon = path.join(DIST, 'icons', `icon${size}.png`);
    if (!(await exists(`icons/icon${size}.png`))) continue;
    const data = await readFile(icon);
    if (!data.subarray(1, 4).equals(Buffer.from('PNG'))) {
      errors.push(`icons/icon${size}.png is not a PNG`);
    }
  }

  const actionIcons = manifest.action?.default_icon ?? {};
  for (const [size, file] of Object.entries(actionIcons)) {
    if (!(await exists(file)))
      errors.push(`manifest action icon ${size} -> ${file} is missing`);
  }
  for (const [size, file] of Object.entries(manifest.icons ?? {})) {
    if (!(await exists(file))) errors.push(`manifest icon ${size} -> ${file} is missing`);
  }

  if (await exists('viewer.html')) {
    const html = await readFile(path.join(DIST, 'viewer.html'), 'utf8');
    for (const match of html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)) {
      const src = match[1];
      if (/^(?:https?:)?\/\//i.test(src)) {
        errors.push(`viewer.html loads remote script ${src}`);
      } else if (!(await exists(src))) {
        errors.push(`viewer.html references missing script ${src}`);
      }
    }
    for (const match of html.matchAll(/<link\b[^>]*\bhref=["']([^"']+)["']/gi)) {
      const href = match[1];
      if (/^(?:https?:)?\/\//i.test(href)) continue;
      if (!(await exists(href))) {
        errors.push(`viewer.html references missing stylesheet ${href}`);
      }
    }
    if (/<script\b(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/i.test(html)) {
      errors.push('viewer.html must not contain inline scripts (MV3 CSP)');
    }
  }

  if (await exists('viewer.css')) {
    const css = await readFile(path.join(DIST, 'viewer.css'), 'utf8');
    for (const match of css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
      const url = match[1];
      if (/^(?:data:|https?:|\/\/)/i.test(url)) {
        if (/^https?:|^\/\//i.test(url))
          errors.push(`viewer.css loads remote asset ${url}`);
        continue;
      }
      if (url.startsWith('#') || url.includes('$')) continue;
      const local = url.split(/[?#]/)[0];
      if (!(await exists(local))) {
        warnings.push(`viewer.css references missing asset ${local}`);
      }
    }
  }

  for (const size of ICON_SIZES) {
    if (manifest.icons?.[size] !== `icons/icon${size}.png`) {
      warnings.push(`manifest.icons["${size}"] is not icons/icon${size}.png`);
    }
  }
  if (!manifest.description)
    errors.push('manifest.description is required for the store');

  const files = await listFiles(DIST);
  const total = files.reduce((sum, file) => sum + file.size, 0);
  const viewer = files.find((file) => file.path === 'viewer.js');
  if (!viewer || viewer.size < 100_000) {
    errors.push('viewer.js looks too small — did the bundle build?');
  }
  if (total > 40 * 1024 * 1024) {
    errors.push(`dist/ is ${formatBytes(total)}; the store limit is much lower`);
  }
  if (files.length < 10) errors.push('dist/ contains too few files');

  return { errors, warnings, files, total, manifest };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  validateExtension()
    .then(({ errors, warnings, files, total, manifest }) => {
      for (const warning of warnings) console.warn(`warning: ${warning}`);
      if (errors.length) {
        for (const error of errors) console.error(`error: ${error}`);
        console.error(`\nValidation failed with ${errors.length} error(s).`);
        process.exitCode = 1;
        return;
      }
      console.log(
        `Validated Markdown & Marp Reader v${manifest.version}: ${files.length} files, ${formatBytes(total)}.`,
      );
      if (warnings.length) console.log(`${warnings.length} warning(s).`);
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
