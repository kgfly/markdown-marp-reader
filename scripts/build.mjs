#!/usr/bin/env node
/**
 * Builds the unpacked extension into dist/.
 *
 * Everything the extension executes is bundled locally: MV3 forbids remote
 * code, so marked, KaTeX, Marp Core and DOMPurify are compiled into viewer.js
 * and KaTeX fonts/CSS are copied alongside it.
 */
import { build, context } from 'esbuild';
import { cp, mkdir, readFile, rm, watch } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateIcons } from './make-icons.mjs';
import { formatBytes, listFiles } from './lib/files.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const SRC = path.join(ROOT, 'src');
const NODE_MODULES = path.join(ROOT, 'node_modules');

// Marp Core requires the CommonJS build of KaTeX while the viewer imports the
// ESM build, which would bundle both. Resolve every bare `katex` import to the
// ESM file; `katex/package.json` stays untouched.
const singleKatex = {
  name: 'single-katex',
  setup(build) {
    build.onResolve({ filter: /^katex$/ }, () => ({
      path: path.join(NODE_MODULES, 'katex', 'dist', 'katex.mjs'),
    }));
  },
};

/**
 * Marp Core ships both KaTeX and MathJax. We render math with KaTeX only, but
 * Marp requires MathJax at module scope, which would add ~3 MB to the bundle.
 * Every MathJax entry point is redirected to an inert stub; the only code that
 * would touch it is Marp's MathJax renderer, which is unreachable because the
 * viewer constructs Marp with `math.lib: 'katex'`.
 */
const stubMathjax = {
  name: 'stub-mathjax',
  setup(build) {
    build.onResolve({ filter: /^mathjax-full\// }, (args) => ({
      path: args.path,
      namespace: 'mathjax-stub',
    }));
    build.onLoad({ filter: /.*/, namespace: 'mathjax-stub' }, () => ({
      loader: 'js',
      contents: `
        const unavailable = () => {
          throw new Error('MathJax is not bundled with Markdown & Marp Reader; math is rendered with KaTeX.');
        };
        export const liteAdaptor = unavailable;
        export const RegisterHTMLHandler = unavailable;
        export const AllPackages = [];
        export const mathjax = { document: unavailable };
        export class TeX {}
        export class SVG {}
        export default { liteAdaptor, RegisterHTMLHandler, AllPackages, mathjax, TeX, SVG };
      `,
    }));
  },
};

export async function buildExtension({ dev = false } = {}) {
  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });

  await generateIcons();
  await copyStaticFiles();

  const common = {
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['chrome116'],
    logLevel: 'info',
    legalComments: 'none',
    minify: !dev,
    sourcemap: dev ? 'inline' : false,
    define: {
      'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production'),
    },

    plugins: [stubMathjax, singleKatex],
  };

  const viewerOptions = {
    ...common,
    entryPoints: [path.join(SRC, 'viewer', 'main.js')],
    outfile: path.join(DIST, 'viewer.js'),
  };
  const backgroundOptions = {
    ...common,
    entryPoints: [path.join(SRC, 'background', 'background.js')],
    outfile: path.join(DIST, 'background.js'),
  };

  if (dev) {
    const contexts = await Promise.all([
      context(viewerOptions),
      context(backgroundOptions),
    ]);
    await Promise.all(contexts.map((ctx) => ctx.watch()));
    await watchStaticFiles();
    console.log(
      '\nWatching src/ — reload the extension at chrome://extensions after changes.',
    );
    return { dist: DIST, watching: true };
  }

  await Promise.all([build(viewerOptions), build(backgroundOptions)]);
  await report();
  return { dist: DIST, watching: false };
}

async function copyStaticFiles() {
  await cp(
    path.join(SRC, 'extension', 'manifest.json'),
    path.join(DIST, 'manifest.json'),
  );
  await cp(path.join(SRC, 'extension', 'viewer.html'), path.join(DIST, 'viewer.html'));
  await cp(path.join(SRC, 'extension', 'viewer.css'), path.join(DIST, 'viewer.css'));
  await cp(path.join(ROOT, 'assets', 'icons'), path.join(DIST, 'icons'), {
    recursive: true,
  });
  await cp(
    path.join(ROOT, 'THIRD_PARTY_NOTICES.md'),
    path.join(DIST, 'THIRD_PARTY_NOTICES.md'),
  );

  const katexDist = path.join(NODE_MODULES, 'katex', 'dist');
  await mkdir(path.join(DIST, 'vendor', 'katex'), { recursive: true });
  await cp(
    path.join(katexDist, 'katex.min.css'),
    path.join(DIST, 'vendor', 'katex', 'katex.min.css'),
  );
  await cp(path.join(katexDist, 'fonts'), path.join(DIST, 'vendor', 'katex', 'fonts'), {
    recursive: true,
  });
}

async function watchStaticFiles() {
  const files = [
    path.join(SRC, 'extension', 'manifest.json'),
    path.join(SRC, 'extension', 'viewer.html'),
    path.join(SRC, 'extension', 'viewer.css'),
  ];

  for (const file of files) {
    let timer = 0;
    watch(file)
      .then(async (watcher) => {
        for await (const event of watcher) {
          if (event.eventType !== 'change') continue;
          clearTimeout(timer);
          timer = setTimeout(async () => {
            await cp(file, path.join(DIST, path.basename(file)));
            console.log(`copied ${path.basename(file)}`);
          }, 60);
        }
      })
      .catch(() => {
        // Watching is a convenience; a missing file must not kill the build.
      });
  }
}

async function report() {
  const files = await listFiles(DIST);
  const total = files.reduce((sum, file) => sum + file.size, 0);
  const manifest = JSON.parse(await readFile(path.join(DIST, 'manifest.json'), 'utf8'));
  const viewer = files.find((file) => file.path === 'viewer.js');
  console.log(
    `\nBuilt Markdown & Marp Reader v${manifest.version} → dist/  ` +
      `(${files.length} files, ${formatBytes(total)}; viewer.js ${formatBytes(viewer?.size ?? 0)})`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dev = process.argv.includes('--watch') || process.argv.includes('--dev');
  buildExtension({ dev }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
