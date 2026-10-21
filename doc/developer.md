# Developer Guide

Practical "how do I build, run, test and publish this" documentation for the
Markdown & Marp Reader Chrome extension.

## 1. Prerequisites

- **Node.js 20 or newer** (CI pins Node 22) — <https://nodejs.org/>
- **npm** — the lockfile was produced with npm 11. Very old npm versions
  (notably npm 10.9.x) can crash on this dependency tree with an `edgesOut`
  arborist error; upgrade with `npm install -g npm@latest` if that happens.
- **Chrome 116+** for manual testing.
- For the end-to-end test: **Chrome for Testing** (downloaded by
  `npm run e2e:chrome`) or a Chrome/Chromium binary via `CHROME_PATH`.

There is no compiler, native module or platform SDK to install: the whole
build is Node + esbuild.

## 2. Repository layout

```
src/
  background/background.js   MV3 service worker: opens/reuses the viewer tab
  core/                      pure ES modules, no DOM globals needed for most logic
    frontmatter.js           small YAML front-matter parser
    detect.js                title/Marp detection
    paths.js                 POSIX-normalized path + resource resolution helpers
    file-bundle.js           in-memory file set, markdown picking, blob URLs
    resources.js             rewrites relative src/href/CSS url() to blob: URLs
    markdown.js              marked + KaTeX + DOMPurify rendering
    marp.js                  Marp Core rendering, slide document + navigation
  ui/drop.js                 drag-and-drop / directory-entry walking
  ui/slide-state.js          slide index stepping
  viewer/main.js             viewer controller (DOM, keyboard, modes, theme)
  extension/                 static files copied verbatim into dist/
    manifest.json            Manifest V3, zero permissions
    viewer.html, viewer.css  full-page viewer UI
scripts/
  build.mjs                  esbuild bundles + vendor/icon copying, --watch
  validate.mjs               structural/CSP/size checks for the built extension
  package.mjs                deterministic zip in release/
  make-icons.mjs             regenerates assets/icons/*.png from code
  e2e.mjs                    Puppeteer smoke test against the unpacked dist/
  lib/{files,zip}.mjs        file listing and ZIP writer/reader used by scripts
test/                        Vitest + jsdom unit/integration tests
dist/                        build output (gitignored) — load this in Chrome
release/                     packaged zip (gitignored)
```

`src/core` is intentionally DOM-light so it can be unit tested quickly; the
viewer wires it to the page.

## 3. Install, build, watch

```sh
npm ci
npm run build     # one-off production build -> dist/
npm run dev       # esbuild watch + static-file watcher
```

`npm run build` prints the file count and size. The build:

1. bundles `src/viewer/main.js` → `dist/viewer.js` (IIFE, target Chrome 116);
2. bundles `src/background/background.js` → `dist/background.js`;
3. copies `manifest.json`, `viewer.html`, `viewer.css`, icons and
   `THIRD_PARTY_NOTICES.md`;
4. copies `katex.min.css` and the KaTeX fonts to `dist/vendor/katex/`.

Two esbuild plugins keep the bundle from ballooning:

- `stub-mathjax` replaces `mathjax-full/*` with an inert stub. Marp Core
  imports MathJax at module scope even when `math.lib` is `'katex'`; the stub
  removes ~1.7 MB of unused code.
- `single-katex` resolves the bare `katex` import to the ESM build so the
  viewer and Marp's CommonJS `require('katex')` share one copy instead of
  bundling KaTeX twice.

If you change math handling, check `viewer.js` size and re-run
`npm run validate` — the bundle should stay around 2 MB, not 4 MB.

### Load the extension

1. `chrome://extensions` → enable **Developer mode**.
2. **Load unpacked** → select `dist/`.
3. After rebuilding, press the reload button on the extension card (the viewer
   tab needs a refresh too).

The toolbar action opens `viewer.html`. The service worker reuses an existing
viewer tab when one is open.

## 4. Tests

### Unit / integration (Vitest + jsdom)

```sh
npm test              # run once
npm run test:watch    # watch mode
npm run test:coverage # text + JSON coverage; enforces thresholds
```

Coverage thresholds live in `vitest.config.js` (80% lines/functions/statements,
70% branches, V8 provider) and apply to `src/**` excluding the thin viewer
controller, the page shell, the service worker and build scripts. The report is
written to `coverage/` (`coverage-summary.json` is what CI reads).

The suite covers front matter, detection, path/resource resolution, Markdown +
KaTeX + sanitization, Marp rendering, slide stepping, the file bundle, drop
walking, and static assertions about `manifest.json` / `viewer.html` (for
example, that every element id `main.js` looks up exists in the HTML).

### End-to-end (real Chrome + Puppeteer)

```sh
npm run e2e:chrome            # download Chrome for Testing into .chrome/
npm run e2e                   # build, then drive the unpacked extension
npm run e2e -- --skip-build   # reuse the current dist/
```

The test loads `dist/` with `--load-extension`, opens a Markdown document and a
Marp deck through the real file input, and asserts:

- inline and display math become KaTeX nodes, the data-URI image survives, and
  a GFM table renders;
- the Marp deck shows two `svg[data-marpit-svg]` slides, KaTeX inside the
  iframe, `→` advances to `2 / 2` with exactly one active slide, `Home`
  returns to `1 / 2`;
- dropping a two-file folder renders its `README.md` and resolves
  `pixel.png` to a `blob:` URL with no missing-resource notice;
- there are no page errors or console errors.

Chrome selection order is `CHROME_PATH`, then the bundled `.chrome/` download,
then common install paths. **Branded Google Chrome 137+ refuses
`--load-extension`**, which is why the script downloads Chrome for Testing;
if you see a 15-second service-worker timeout, point `CHROME_PATH` at a
Chrome for Testing binary.

The e2e test is not run on Windows CI; Linux and macOS work locally.

### Lint, format, validate

```sh
npm run lint          # ESLint flat config
npm run format:check  # Prettier
npm run format        # rewrite files
npm run validate      # checks dist/: MV3 manifest, version match, icons,
                      # required files, CSP, no remote/inline scripts, size
npm run check         # lint + format:check + test:coverage + build + validate
```

`npm run validate` must run after `npm run build`; it fails if `dist/` is stale
or missing. `THIRD_PARTY_NOTICES.md` is shipped inside the extension, so update
it whenever a dependency with a new license is added.

## 5. Packaging

```sh
npm run package                 # build + pack
npm run package -- --skip-build # pack the current dist/
```

Output: `release/markdown-marp-reader-<version>.zip`. The ZIP writer is
deterministic (sorted entries, fixed timestamps, deflate), so rebuilding the
same sources produces a byte-identical archive — useful for verifying a store
upload.

The zip is an **unpacked-extension** archive: to install manually, extract it
and use **Load unpacked**. To publish, upload the zip itself.

## 6. Publishing

### Version bump

`package.json` and `src/extension/manifest.json` must carry the same version;
`npm run validate` enforces this. Update both, regenerate the lockfile if npm
asks, then:

```sh
npm run check
npm run package -- --skip-build
```

### GitHub Release

`.github/workflows/release.yml` runs when a `vX.Y.Z` tag is pushed (or manually
via `workflow_dispatch`). It verifies the tag matches `package.json`, runs the
full `npm run check`, packs the zip and attaches it to a GitHub Release:

```sh
git tag v1.0.0
git push origin v1.0.0
```

### Chrome Web Store

1. Register as a developer in the
   [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
   (one-time fee).
2. Create a new item and upload `release/markdown-marp-reader-<version>.zip`.
3. Store listing: name, short description, detailed description, screenshots
   (1280×800 or 640×400), 128×128 icon (already in the package).
4. Privacy practices: this extension collects no user data and requests no
   permissions. Declare that clearly; the common rejection is an unexplained
   permission, and there are none here.
5. Visibility: **Unlisted** is a good default for a personal tool; **Public**
   requires review (usually hours to a few days).
6. After approval, future versions use the same item → **Upload new package** →
   submit for review.

Store credentials are not in this repository, and the release workflow does not
upload to the store — that remains a manual step.

## 7. CI / PR gate

`.github/workflows/pr.yml` runs on every pull request targeting `main` and on
pushes to `main`, with `permissions: contents: read` and per-ref concurrency
that cancels superseded runs.

Matrix: `ubuntu-latest`, `macos-latest`, `windows-latest`, `fail-fast: false`.
On each OS: `npm ci` → `npm run build` → `npm run lint` → `npm run validate` →
`npm run test:coverage`. Linux additionally runs the Prettier check, the
coverage floor, the Chrome e2e test, packaging, and uploads the coverage report
and extension zip as artifacts.

The coverage floor is enforced on Linux only (the unit suite is identical
everywhere): `MIN_COVERAGE=80` is compared against
`coverage/coverage-summary.json` and written to the job summary.

### Requiring the gate

Checks are only blocking once branch protection requires them. In the GitHub UI:
**Settings → Branches → Add branch protection rule** for `main` → **Require
status checks to pass** → select `Test (ubuntu-latest)`,
`Test (macos-latest)`, and `Test (windows-latest)`.

Or with `gh` (after the checks have run at least once):

```sh
gh api -X PUT repos/kgfly/markdown-marp-reader/branches/main/protection \
  -F 'required_status_checks[strict]=true' \
  -F 'required_status_checks[contexts][]=Test (ubuntu-latest)' \
  -F 'required_status_checks[contexts][]=Test (macos-latest)' \
  -F 'required_status_checks[contexts][]=Test (windows-latest)' \
  -F 'enforce_admins=true' \
  -F 'required_pull_request_reviews[required_approving_review_count]=0'
```

Tweak the review/admin options to taste; the status-check names must match the
job names exactly.

## 8. Troubleshooting

| Symptom                                         | Cause / fix                                                                                                          |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Service-worker timeout in `npm run e2e`         | Branded Chrome ≥ 137 cannot `--load-extension`. Run `npm run e2e:chrome` or set `CHROME_PATH` to Chrome for Testing. |
| `npm ci` crashes with `edgesOut`                | Old npm (10.9.x) arborist bug. `npm install -g npm@latest`.                                                          |
| Images show as broken, notice appears           | You opened a single file instead of its folder. Use **Open folder** so sibling assets are readable.                  |
| `validate` complains the version does not match | Bump both `package.json` and `src/extension/manifest.json`.                                                          |
| `viewer.js` ~4 MB                               | The `stub-mathjax` / `single-katex` esbuild plugins are not active; check `scripts/build.mjs`.                       |
| Math renders but fonts look wrong               | `dist/vendor/katex/` is missing; rebuild instead of copying `viewer.js` alone.                                       |
| Viewer tab shows stale code after a build       | Reload the extension card in `chrome://extensions`, then refresh the viewer tab.                                     |
| Prettier fails on Windows line endings          | `format:check` runs on Linux CI only; keep files LF locally (`git config core.autocrlf false`).                      |

## 9. Security model (why there are no permissions)

- The manifest requests **no** permissions and no host permissions: files come
  from user gestures (`<input type="file">`, drag-and-drop), not from the
  filesystem API.
- Markdown HTML is sanitized with DOMPurify (scripts, iframes, event handlers
  and inline styles' dangerous URLs are stripped).
- Marp output is isolated in `<iframe sandbox="allow-same-origin">` **without**
  `allow-scripts`; its HTML is never passed through the parent DOM.
- The extension CSP is `script-src 'self'; object-src 'self'`, and
  `npm run validate` fails if it is relaxed or if remote scripts/styles appear.
- No telemetry, analytics or remote code. Rendering is fully offline.
