# Markdown & Marp Reader

**The 2-in-1 Chrome extension for everything Markdown and Marp.**

One extension is all you need to read, render, and present: preview Markdown
files straight from disk — including relative images and KaTeX math — and put
[Marp](https://marp.app/) slide decks on screen. No preview server, no plugins,
no context switching. Everything is rendered locally in the browser: no server,
no upload, no account.

[![PR gate](https://github.com/kgfly/markdown-marp-reader/actions/workflows/pr.yml/badge.svg)](https://github.com/kgfly/markdown-marp-reader/actions/workflows/pr.yml)
[![Nightly](https://github.com/kgfly/markdown-marp-reader/actions/workflows/nightly.yml/badge.svg)](https://github.com/kgfly/markdown-marp-reader/actions/workflows/nightly.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## Features

- **Local Markdown** — GitHub-Flavored Markdown (tables, task lists, code
  fences) rendered with `marked` and sanitized with DOMPurify before it reaches
  the page.
- **Math** — inline `$e^{i\pi}+1=0$` and display `$$\int_0^1 x^2\,dx$$` math
  via KaTeX, with fonts bundled in the extension so it works offline.
- **Mermaid diagrams** — fenced `mermaid` blocks render as flowcharts,
  sequence diagrams and the other Mermaid diagram types, following the
  light/dark theme.
- **Images and other local assets** — `![](diagram.png)` resolves next to the
  document. Open (or drop) the **whole folder** and the reader maps every
  relative path — images, SVG, video, audio, CSS `url()` references — to the
  file on disk.
- **Marp decks** — a document with `marp: true` front matter opens as slides,
  with Marp themes, per-slide math, and a distraction-free **Present** mode
  (fullscreen, click/arrow navigation).
- **File browser** — a collapsible folder tree on the left lists every file in
  the opened folder. Click a Markdown file to read it, or click an image, PDF or
  other asset to open it in a new tab. Toggle the browser with the **Files**
  button or `Ctrl`/`Cmd`+`B`; the choice is remembered.
- **Export** — turn a Markdown document into a standalone `.html` file or a
  `.pdf`, and a Marp deck into navigable HTML slides, a PDF, or a PowerPoint
  `.pptx`. Images, styles and KaTeX fonts are embedded in the exported HTML, so
  the file keeps working when it is opened elsewhere.
- **Comfort features** — file browser with filter, an outline of the current
  document's headings, Document / Source views (plus Slides for Marp decks),
  auto/light/dark theme, and a notice when a referenced asset is missing from
  the opened folder.
- **Private by construction** — Manifest V3 with **zero permissions** (not even
  host permissions), no telemetry, no remote code. The extension itself makes
  no network requests; external links and remote images in a document behave
  like any other page you open in Chrome.

## Install

Requires Chrome 116 or newer, or any Chromium-based browser that supports
Manifest V3 extensions (Edge, Brave, Arc, …).

### From the Chrome Web Store

> **Not published yet.** This section will link to the listing as soon as it is
> live. Until then, install from GitHub below.

The store is the easiest option and the only one that updates automatically.
Open the listing, click **Add to Chrome**, then confirm with **Add extension**.

### From GitHub

1. Open the [latest release](https://github.com/kgfly/markdown-marp-reader/releases/latest)
   and download `markdown-marp-reader-<version>.zip`.
2. Extract the zip into a folder you will keep. Chrome loads the extension from
   that folder, so don't delete or move it afterwards.
3. Open `chrome://extensions` (or **Extensions → Manage extensions**).
4. Turn on **Developer mode** in the top-right corner.
5. Click **Load unpacked** and select the extracted folder — the one that
   directly contains `manifest.json`.
6. Pin **Markdown & Marp Reader** to the toolbar via the puzzle-piece icon.

**To update:** download the new release, extract it over the old folder (or
replace the folder at the same path), then click the refresh icon on the
extension card in `chrome://extensions` and reload any open reader tab.

> **Bleeding edge:** [nightly pre-releases](https://github.com/kgfly/markdown-marp-reader/releases?q=nightly)
> are built from `main` once a day whenever it changes. Install them the same
> way (extract, then **Load unpacked**); they carry no Chrome Web Store review.

> Chrome needs a folder, not a zip, for **Load unpacked**. To get started
> quickly, extracting to `~/markdown-marp-reader/` is fine.

### From source

If you prefer to build it yourself, follow the
[developer guide](doc/developer.md#2-set-up-the-development-environment). The
short version:

```sh
git clone https://github.com/kgfly/markdown-marp-reader.git
cd markdown-marp-reader
npm ci
npm run build
```

Then load the generated `dist/` folder with **Load unpacked** as described
above. Do not load the repository root or `release/` — only `dist/` contains
`manifest.json` at its top level.

## Usage

### Open a document

- Click the toolbar icon to open the reader.
- **Open file** (`Ctrl`/`Cmd`+`O`) reads a single Markdown file.
- **Open folder** is the best choice when the document references images or
  other local files: the folder becomes the document root and its whole tree
  appears in the file browser. Chrome asks **"Upload N files to this site?"** —
  that wording is the browser's; nothing is uploaded or copied. The files are
  read locally and stay in the tab.
- You can also drag a file or a folder anywhere onto the reader window.

### Read Markdown

- **Document** view renders GitHub-Flavored Markdown: tables, task lists and
  fenced code blocks.
- Inline math like `$e^{i\pi}+1=0$` and display math like
  `$$\int_0^1 x^2\,dx$$` are rendered with KaTeX. The fonts are bundled, so
  math works offline.
- Relative images and assets resolve against the Markdown file's own directory.
  Open the folder and `![](diagram.png)`, SVG, video, audio and CSS `url()`
  references all keep working. If something referenced is missing, a notice
  tells you which file could not be found.
- **Source** view shows the raw Markdown.
- **Theme: auto/light/dark** switches the color scheme.

### Browse a folder

Open a folder to get a collapsible file tree on the left:

- Click a Markdown file to read it.
- Click an image, PDF or other asset to open it in a new tab.
- Use the filter box to narrow long lists.
- Toggle the browser with the **Files** button or `Ctrl`/`Cmd`+`B`. The choice
  is remembered.

### Present a Marp deck

Add Marp front matter to the top of the document and switch to the **Slides**
view:

```markdown
---
marp: true
theme: default
---

# Slide one

$e^{i\pi}+1=0$

---

# Slide two
```

- Move between slides with `→`/`←`, `PageDown`/`PageUp`, or `Space`.
- Press **Present** (`F`) for a fullscreen, distraction-free view. Click the
  slide or use the arrow keys to advance, and press `Esc` to leave.
- Marp themes and per-slide math are supported.

If a document has `marp: true` front matter, the viewer opens it in **Slides**
view automatically.

### Export

The **Export** button in the toolbar opens a menu with the formats that fit the
current document. The file is written to your normal download folder; nothing
leaves the browser.

| Output               | Menu entry              | File name            |
| -------------------- | ----------------------- | -------------------- |
| Rendered document    | **HTML (.html)**        | `<name>.html`        |
| Document as PDF      | **PDF (.pdf)**          | `<name>.pdf`         |
| Slides, clickable    | **HTML slides (.html)** | `<name>.slides.html` |
| Slides as PDF        | **PDF slides (.pdf)**   | `<name>.slides.pdf`  |
| Slides as PowerPoint | **PowerPoint (.pptx)**  | `<name>.pptx`        |

- The HTML exports are standalone: images, video, audio, stylesheets and the
  KaTeX fonts are embedded as data URLs, so the file opens on any machine —
  double-click it, no extension or server needed. The slides HTML keeps the
  arrow-key / click navigation and keyboard `Home` / `End` / `F` / `Esc`
  shortcuts, so it doubles as a shareable deck.
- The PDF is produced directly (no print dialog): the document is laid out on
  A4 pages with page breaks kept between blocks, and each deck slide becomes
  one PDF page at its native 16:9 size.
- The PowerPoint export writes one full-bleed image per slide into a standard
  16:9 deck, so the deck looks exactly like the preview. Text inside a slide is
  not editable in PowerPoint.
- Large documents take a few seconds; a toast reports progress per slide and
  errors if an export fails.

### Keyboard shortcuts

| Action                   | Keys                     |
| ------------------------ | ------------------------ |
| Next slide               | `→`, `PageDown`, `Space` |
| Previous slide           | `←`, `PageUp`            |
| First / last slide       | `Home` / `End`           |
| Start or stop presenting | `F`                      |
| Exit presenting          | `Esc`                    |
| Advance while presenting | click the slide          |
| Toggle file browser      | `Ctrl`/`Cmd`+`B`         |
| Open a file              | `Ctrl`/`Cmd`+`O`         |

Shortcuts are ignored while typing in the file filter.

## Troubleshooting

| Problem                                              | Fix                                                                                                 |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| The extension doesn't appear in the toolbar          | Open `chrome://extensions`, make sure it is enabled, then pin it via the puzzle-piece icon.         |
| **Load unpacked** complains about a missing manifest | Select the folder that directly contains `manifest.json`, not its parent or the zip.                |
| Images are broken and a notice appears               | Open the **folder** instead of the single file, so sibling assets can be resolved.                  |
| A Marp deck opens as plain Markdown                  | Add `marp: true` front matter at the very top and separate slides with `---`.                       |
| Chrome refuses to install the extension              | Chrome 116 or newer is required.                                                                    |
| An updated version still shows old behavior          | Click the refresh icon on the extension card in `chrome://extensions`, then refresh the reader tab. |
| Math shows raw `$…$` text                            | Rebuild or reinstall; the KaTeX font and style files must ship with the extension.                  |

## Privacy

Files are picked with standard `<input type="file">` controls, the File System
Access API, or drag-and-drop. They are kept in memory only, referenced through
short-lived `blob:` URLs, and never written back to disk or sent anywhere — an
export is the one exception, and it only happens when you pick a format from the
**Export** menu, which saves a new file through Chrome's normal download. The
extension requests **zero permissions** and makes no network requests of its
own.

Markdown is sanitized with DOMPurify before it is displayed, and Marp output is
rendered in a sandboxed iframe without script execution.

## Development

See [doc/developer.md](doc/developer.md) for setting up a development
environment, the architecture, test tiers, packaging, and publishing.

```sh
npm ci          # install dependencies (Node >= 20)
npm run build   # -> dist/, the unpacked extension
npm run dev     # rebuild on change
npm run check   # lint + format + coverage tests + build + validate
npm test        # unit tests
npm run e2e     # real-Chrome end-to-end test (needs Chrome for Testing)
```

Third-party licenses are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Maintainer

Maintainers are welcome. If you want to be a maintainer, please let me know by raising a github issue.

## License

[MIT](LICENSE)
