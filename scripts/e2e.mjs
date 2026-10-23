#!/usr/bin/env node
/**
 * End-to-end smoke test: loads the unpacked extension in Chrome, opens a
 * Markdown document and a Marp deck through the real file input, and asserts
 * that math, images and slide navigation work without page errors.
 *
 * Chrome does not allow extensions in old headless mode, so this uses the
 * current headless implementation (Chrome >= 112). Set CHROME_PATH to point at
 * a specific binary; otherwise common install locations are probed.
 */
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import puppeteer from 'puppeteer-core';

import { buildExtension } from './build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const DOC = `# End-to-end

Inline math $e^{i\\pi}+1=0$ and a display block:

$$\\int_0^1 x^2\\,dx = \\frac{1}{3}$$

![pixel](${PNG})

\`\`\`mermaid
graph TD
  A[Start] --> B[Done]
\`\`\`

| Feature | Works |
| --- | --- |
| math | yes |
`;

const DECK = `---
marp: true
theme: default
---

# Slide one

$e^{i\\pi}$

---

# Slide two

- second
`;

async function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;

  const bundled = await findBundledChrome(path.join(ROOT, '.chrome'));
  if (bundled) return bundled;

  const candidates = [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ];
  for (const candidate of candidates) {
    try {
      execFileSync(candidate, ['--version'], { stdio: 'ignore' });
      return candidate;
    } catch {
      // Try the next location.
    }
  }
  throw new Error(
    'Chrome for Testing was not found. Run `npm run e2e:chrome` or set CHROME_PATH. ' +
      'Google Chrome branded builds newer than 137 no longer support --load-extension.',
  );
}

async function findBundledChrome(directory) {
  let entries;
  try {
    entries = await readdir(directory, { recursive: true, withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (!entry.isFile() || !/^chrome(?:\.exe)?$/.test(entry.name)) continue;
    const candidate = path.join(entry.parentPath ?? entry.path, entry.name);
    if (/(chrome-linux64|chrome-mac|chrome-win)/i.test(candidate)) return candidate;
  }
  return null;
}

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function main() {
  if (!process.argv.includes('--skip-build')) await buildExtension({ dev: false });

  const chromePath = await findChrome();
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'mmr-e2e-'));
  const downloads = path.join(tempDir, 'downloads');
  await mkdir(downloads);
  const docPath = path.join(tempDir, 'doc.md');
  const deckPath = path.join(tempDir, 'deck.md');
  await writeFile(docPath, DOC);
  await writeFile(deckPath, DECK);

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: [
      `--disable-extensions-except=${DIST}`,
      `--load-extension=${DIST}`,
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
    ],
  });

  const errors = [];
  try {
    const worker = await browser.waitForTarget(
      (target) =>
        target.type() === 'service_worker' &&
        target.url().startsWith('chrome-extension://'),
      { timeout: 15_000 },
    );
    const extensionId = new URL(worker.url()).host;

    const cdp = await browser.target().createCDPSession();
    await cdp.send('Browser.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: downloads,
      eventsEnabled: true,
    });

    async function waitForDownload(pattern, timeout = 120_000) {
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        const files = await readdir(downloads);
        const match = files.find(
          (file) => pattern.test(file) && !file.endsWith('.crdownload'),
        );
        if (match) {
          const file = path.join(downloads, match);
          const info = await stat(file);
          if (info.size > 500) return { name: match, path: file, size: info.size };
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      throw new Error(
        `export download ${pattern} timed out (files: ${(await readdir(downloads)).join(', ') || 'none'})`,
      );
    }

    async function exportAs(kind, pattern) {
      await page.waitForFunction(
        () => !document.querySelector('#export-button').disabled,
        { timeout: 15_000 },
      );
      // Puppeteer's click waits on layout in extension pages; dispatch in-page.
      await page.evaluate(() => document.querySelector('#export-button').click());
      await page.evaluate(
        (value) => document.querySelector(`[data-export="${value}"]`).click(),
        kind,
      );
      return waitForDownload(pattern);
    }

    const page = await browser.newPage();
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`console: ${message.text()}`);
    });

    await page.goto(`chrome-extension://${extensionId}/viewer.html`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForSelector('#dropzone');
    assert((await page.title()).includes('Markdown & Marp Reader'), 'viewer title');

    await (await page.$('#file-input')).uploadFile(docPath);
    await page.waitForFunction(
      () => document.querySelector('#doc-view h1')?.textContent?.trim() === 'End-to-end',
      { timeout: 15_000 },
    );
    await page.waitForFunction(
      () => document.querySelector('#doc-view .mermaid-diagram svg'),
      { timeout: 15_000 },
    );

    const docState = await page.evaluate(() => ({
      katex: document.querySelectorAll('#doc-view .katex').length,
      display: document.querySelectorAll('#doc-view .katex-display').length,
      image: document.querySelector('#doc-view img')?.getAttribute('src') ?? '',
      table: Boolean(document.querySelector('#doc-view table')),
      docHidden: document.querySelector('#doc-view').hidden,
      fileCount: document.querySelector('#file-count').textContent,
      mermaid: Boolean(document.querySelector('#doc-view .mermaid-diagram svg')),
      slidesHidden: document.querySelector('#mode-slides').hidden,
    }));
    assert(docState.katex >= 2, 'inline and display math rendered with KaTeX');
    assert(docState.display >= 1, 'display math keeps its block layout');
    assert(docState.image.startsWith('data:image/png'), 'data image kept');
    assert(docState.table, 'GFM table rendered');
    assert(docState.mermaid, 'Mermaid fence rendered as a diagram');
    assert(docState.slidesHidden, 'Slides button hidden for plain Markdown');
    assert(!docState.docHidden, 'document view visible');
    assert(docState.fileCount === '1', 'file counter updated');

    const toc = await page.evaluate(() => ({
      hidden: document.querySelector('#toc').hidden,
      count: document.querySelector('#toc-count').textContent,
      links: [...document.querySelectorAll('#toc-list .toc-link')].map((link) => ({
        text: link.textContent,
        href: link.getAttribute('href'),
      })),
    }));
    assert(!toc.hidden, 'table of contents shown for the document');
    assert(toc.count === '1', 'table of contents counts headings');
    assert(
      toc.links.length === 1 &&
        toc.links[0].text === 'End-to-end' &&
        toc.links[0].href === '#end-to-end',
      'table of contents links to the heading',
    );

    const menu = await page.evaluate(() => ({
      docHidden: document
        .querySelector('[data-export-group="doc"]')
        .hasAttribute('hidden'),
      marpHidden: document
        .querySelector('[data-export-group="marp"]')
        .hasAttribute('hidden'),
    }));
    assert(!menu.docHidden && menu.marpHidden, 'document export options shown');

    const docHtmlFile = await exportAs('html', /\.html$/);
    const docHtml = await readFile(docHtmlFile.path, 'utf8');
    assert(docHtml.startsWith('<!doctype html>'), 'document HTML is standalone');
    assert(docHtml.includes('data:image/png;base64'), 'document image inlined');
    assert(docHtml.includes('data:font/woff2;base64'), 'KaTeX fonts inlined');
    assert(docHtml.includes('mermaid-diagram'), 'Mermaid diagram exported');

    const docPdfFile = await exportAs('pdf', /\.pdf$/);
    const docPdf = await readFile(docPdfFile.path);
    assert(docPdf.subarray(0, 5).toString() === '%PDF-', 'document PDF header');

    await (await page.$('#file-input')).uploadFile(deckPath);
    await page.waitForFunction(
      () => document.querySelector('#slide-counter')?.textContent === '1 / 2',
      { timeout: 15_000 },
    );
    assert(
      await page.evaluate(() => document.querySelector('#toc').hidden),
      'table of contents hidden in slide mode',
    );
    assert(
      await page.evaluate(() => !document.querySelector('#mode-slides').hidden),
      'Slides button shown for a Marp deck',
    );

    const frame = page.frames().find((candidate) => candidate.url() === 'about:srcdoc');
    assert(frame, 'slide iframe document is reachable');
    assert(
      (await frame.$$eval('svg[data-marpit-svg]', (nodes) => nodes.length)) === 2,
      'two Marp slides in the iframe',
    );
    assert(
      (await frame.$$eval('.katex', (nodes) => nodes.length)) >= 1,
      'KaTeX math inside Marp slides',
    );

    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(
      () => document.querySelector('#slide-counter')?.textContent === '2 / 2',
      { timeout: 5_000 },
    );
    const active = await frame.$$eval(
      'svg[data-marpit-svg]',
      (nodes) => nodes.filter((node) => node.classList.contains('is-active')).length,
    );
    assert(active === 1, 'exactly one active slide after navigating');

    await page.keyboard.press('Home');
    await page.waitForFunction(
      () => document.querySelector('#slide-counter')?.textContent === '1 / 2',
      { timeout: 5_000 },
    );

    const deckMenu = await page.evaluate(() => ({
      docHidden: document
        .querySelector('[data-export-group="doc"]')
        .hasAttribute('hidden'),
      marpHidden: document
        .querySelector('[data-export-group="marp"]')
        .hasAttribute('hidden'),
    }));
    assert(deckMenu.docHidden && !deckMenu.marpHidden, 'slide export options shown');

    const deckHtmlFile = await exportAs('slides-html', /\.slides\.html$/);
    const deckHtml = await readFile(deckHtmlFile.path, 'utf8');
    assert(
      (deckHtml.match(/<section id="/g) ?? []).length === 2,
      'exported deck keeps both slides',
    );
    assert(deckHtml.includes('id="deck-next"'), 'exported deck navigates');

    const deckPdfFile = await exportAs('slides-pdf', /\.slides\.pdf$/);
    const deckPdf = await readFile(deckPdfFile.path);
    assert(deckPdf.subarray(0, 5).toString() === '%PDF-', 'slides PDF header');

    const pptxFile = await exportAs('pptx', /\.pptx$/);
    const pptx = await readFile(pptxFile.path);
    assert(
      pptx.includes('ppt/presentation.xml') && pptx.includes('ppt/slides/slide2.xml'),
      'PowerPoint contains both slides',
    );

    // Drop a folder: two files, with a relative image next to the Markdown.
    await page.evaluate(() => {
      const pngBytes = Uint8Array.from(
        atob(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        ),
        (char) => char.charCodeAt(0),
      );
      const markdown = new File(['# Folder doc\n\n![local](pixel.png)\n'], 'README.md', {
        type: 'text/markdown',
      });
      const image = new File([pngBytes], 'pixel.png', { type: 'image/png' });
      const entryFor = (file) => ({
        isFile: true,
        name: file.name,
        file: (resolve) => resolve(file),
      });
      const transfer = {
        types: ['Files'],
        files: [markdown, image],
        items: [markdown, image].map((file) => ({
          webkitGetAsEntry: () => entryFor(file),
        })),
      };
      const event = new Event('drop', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'dataTransfer', { value: transfer });
      window.dispatchEvent(event);
    });

    // Timer polling: rAF polling can stall once the slide iframe is replaced.
    try {
      await page.waitForFunction(
        () =>
          document.querySelector('#doc-view h1')?.textContent?.trim() === 'Folder doc',
        { timeout: 15_000, polling: 100 },
      );
    } catch (error) {
      const state = await page.evaluate(() => ({
        path: document.querySelector('#doc-path')?.textContent,
        toast: document.querySelector('#toast')?.textContent,
        body: document.body.className,
        noticeHidden: document.querySelector('#notice')?.hidden,
        doc: document.querySelector('#doc-view')?.innerHTML.slice(0, 200),
      }));
      throw new Error(`Folder drop did not render: ${JSON.stringify(state)}`, {
        cause: error,
      });
    }
    const dropped = await page.evaluate(() => ({
      image: document.querySelector('#doc-view img')?.getAttribute('src') ?? '',
      path: document.querySelector('#doc-path').textContent,
      missingNotice: !document.querySelector('#notice').hidden,
      toc: document.querySelector('#toc-list .toc-link')?.textContent ?? '',
    }));
    assert(dropped.image.startsWith('blob:'), 'relative image resolved to a blob URL');
    assert(dropped.path === 'README.md', 'dropped folder opened its README');
    assert(!dropped.missingNotice, 'no missing-resource notice for a complete folder');
    assert(dropped.toc === 'Folder doc', 'table of contents follows the opened document');

    assert(errors.length === 0, `no page errors (${errors.join('; ')})`);
    console.log(
      `E2E passed in Chrome: Markdown + KaTeX + images, Marp 2-slide navigation, ` +
        `folder drop, 5 exports (document + deck HTML/PDF/PPTX) (extension ${extensionId}).`,
    );
  } finally {
    await browser.close();
    await rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
