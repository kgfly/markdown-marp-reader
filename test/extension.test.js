import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => readFile(path.join(ROOT, relative), 'utf8');

async function readJson(relative) {
  return JSON.parse(await read(relative));
}

describe('extension manifest', () => {
  it('is a minimal Manifest V3 extension without host permissions', async () => {
    const manifest = await readJson('src/extension/manifest.json');
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(manifest.permissions ?? []).toEqual([]);
    expect(manifest.host_permissions ?? []).toEqual([]);
    expect(manifest.background.service_worker).toBe('background.js');
    expect(manifest.content_security_policy.extension_pages).toContain(
      "script-src 'self'",
    );
    expect(manifest.minimum_chrome_version).toBe('116');
  });

  it('declares icons that exist in assets/', async () => {
    const manifest = await readJson('src/extension/manifest.json');
    for (const size of [16, 32, 48, 128]) {
      const file = `assets/icons/icon${size}.png`;
      expect(manifest.icons[String(size)]).toBe(`icons/icon${size}.png`);
      const data = await readFile(path.join(ROOT, file));
      expect(data.subarray(1, 4).toString()).toBe('PNG');
    }
    expect(manifest.action.default_icon).toEqual(manifest.icons);
  });
});

describe('viewer page', () => {
  it('loads only bundled scripts and never runs them in the slide frame', async () => {
    const html = await read('src/extension/viewer.html');
    expect(html).toContain('<script src="viewer.js"></script>');
    expect(html).not.toMatch(/<script\b(?![^>]*\bsrc=)/i);

    const iframe = /<iframe[^>]*id="slides-frame"[^>]*>/i.exec(html)?.[0] ?? '';
    expect(iframe).toContain('sandbox="allow-same-origin"');
    expect(iframe).not.toContain('allow-scripts');
  });

  it('offers file, folder and keyboard-accessible controls', async () => {
    const html = await read('src/extension/viewer.html');
    expect(html).toContain('webkitdirectory');
    expect(html).toContain('accept=".md,.markdown,.mdown,text/markdown"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('id="drop-open-folder"');
    expect(html).toContain('id="present"');
  });

  it('has a toggleable file browser with an empty state', async () => {
    const html = await read('src/extension/viewer.html');
    expect(html).toContain('id="sidebar-toggle"');
    expect(html).toContain('aria-controls="sidebar"');
    expect(html).toContain('id="sidebar-close"');
    expect(html).toContain('id="browser-empty"');
    expect(html).toContain('id="browser-open-folder"');
    expect(html).toContain('aria-label="Files in the opened folder"');
    expect(html).not.toMatch(/<aside[^>]*id="sidebar"[^>]*\bhidden\b/);
  });

  it('has an element for every id the viewer controller caches', async () => {
    const [main, html] = await Promise.all([
      read('src/viewer/main.js'),
      read('src/extension/viewer.html'),
    ]);
    const block = /const ids = \[([\s\S]*?)\];/.exec(main)?.[1] ?? '';
    const ids = [...block.matchAll(/'([^']+)'/g)].map((match) => match[1]);
    expect(ids.length).toBeGreaterThan(20);
    for (const id of ids) {
      expect(html, `missing #${id}`).toContain(`id="${id}"`);
    }
  });
});

describe('background service worker', () => {
  it('reuses the existing viewer tab and opens one on install', async () => {
    const script = await read('src/background/background.js');
    expect(script).toContain("getURL('viewer.html')");
    expect(script).toContain('getContexts');
    expect(script).toContain('chrome.action.onClicked');
    expect(script).toContain('onInstalled');
    expect(script).toContain("reason === 'install'");
  });
});
