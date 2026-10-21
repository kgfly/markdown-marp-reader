# Markdown & Marp Reader

A Chrome extension that previews Markdown files straight from disk — including
relative images and KaTeX math — and presents [Marp](https://marp.app/) slide
decks. Everything is rendered locally in the browser: no server, no upload, no
account.

[![PR gate](https://github.com/kgfly/markdown-marp-reader/actions/workflows/pr.yml/badge.svg)](https://github.com/kgfly/markdown-marp-reader/actions/workflows/pr.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## Features

- **Local Markdown** — GitHub-Flavored Markdown (tables, task lists, code
  fences) rendered with `marked` and sanitized with DOMPurify before it reaches
  the page.
- **Math** — inline `$e^{i\pi}+1=0$` and display `$$\int_0^1 x^2\,dx$$` math
  via KaTeX, with fonts bundled in the extension so it works offline.
- **Images and other local assets** — `![](diagram.png)` resolves next to the
  document. Open (or drop) the **whole folder** and the reader maps every
  relative path — images, SVG, video, audio, CSS `url()` references — to the
  file on disk.
- **Marp decks** — a document with `marp: true` front matter opens as slides,
  with Marp themes, per-slide math, and a distraction-free **Present** mode
  (fullscreen, click/arrow navigation).
- **Comfort features** — file sidebar with filter for multi-file folders,
  Document / Slides / Source views, auto/light/dark theme, and a notice when a
  referenced asset is missing from the opened folder.
- **Private by construction** — Manifest V3 with **zero permissions** (not even
  host permissions), no telemetry, no remote code. The extension itself makes
  no network requests; external links and remote images in a document behave
  like any other page you open in Chrome.

## Install

Requires Chrome 116 or newer (or any Chromium-based browser that supports
Manifest V3 extensions).

### From source

```sh
npm ci
npm run build
```

Then open `chrome://extensions`, enable **Developer mode**, click **Load
unpacked**, and select the generated `dist/` directory.

### From a release zip

Download a `markdown-marp-reader-<version>.zip` from the
[releases page](https://github.com/kgfly/markdown-marp-reader/releases), extract
it, and load the extracted folder with **Load unpacked**. (Chrome does not
install a zip directly as an unpacked extension.)

### From the Chrome Web Store

Not published yet. See [developer.md](developer.md#publishing) for the release
process.

## Usage

1. Click the toolbar icon (or press `Ctrl`/`Cmd`+`O` in the reader) to open the
   viewer.
2. **Open file** for a single Markdown file. **Open folder** when the document
   references relative images or other files — the folder becomes the document
   root, and the sidebar lists every Markdown file inside it.
3. Or drag a file/folder anywhere onto the window.
4. For a Marp deck, add front matter and switch to the **Slides** view. Use
   **Present** (`F`) for fullscreen.

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

Relative resources are resolved against the Markdown file's own directory, so
`docs/guide.md` referring to `img/flow.png` looks for `docs/img/flow.png` inside
the opened folder.

### Keyboard shortcuts

| Action                   | Keys                     |
| ------------------------ | ------------------------ |
| Next slide               | `→`, `PageDown`, `Space` |
| Previous slide           | `←`, `PageUp`            |
| First / last slide       | `Home` / `End`           |
| Start or stop presenting | `F`                      |
| Exit presenting          | `Esc`                    |
| Advance while presenting | click the slide          |
| Open a file              | `Ctrl`/`Cmd`+`O`         |

Shortcuts are ignored while typing in the file filter.

## How files are read

Files are picked with standard `<input type="file">` controls or drag-and-drop.
The extension stores them in memory only, creates short-lived `blob:` URLs for
referenced assets, and revokes those URLs when another document is opened. It
never writes to the filesystem and never sends file contents anywhere.

Marp output is rendered inside a sandboxed iframe without script execution;
regular Markdown is sanitized with DOMPurify before insertion.

## Development

```sh
npm ci          # install dependencies (Node >= 20)
npm run build   # -> dist/, the unpacked extension
npm run dev     # rebuild on change
npm run check   # lint + format + coverage tests + build + validate
npm test        # unit tests
npm run e2e     # real-Chrome end-to-end test (Linux/macOS; see developer.md)
```

[developer.md](developer.md) covers the architecture, test tiers, packaging,
publishing to the Chrome Web Store, the PR gate, and troubleshooting.

Third-party licenses are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## License

[MIT](LICENSE)
