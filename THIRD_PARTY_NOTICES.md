# Third-party notices

Markdown & Marp Reader bundles the following packages into `viewer.js` and
ships KaTeX's stylesheet and web fonts in `vendor/katex`. All of them are
distributed under permissive licenses; the full texts live in each package's
repository and in `node_modules/<package>/LICENSE` after `npm install`.

| Package                                                                     | Version | License               |
| --------------------------------------------------------------------------- | ------- | --------------------- |
| [marked](https://github.com/markedjs/marked)                                | 17.0.6  | MIT                   |
| [marked-katex-extension](https://github.com/UziTech/marked-katex-extension) | 5.1.13  | MIT                   |
| [KaTeX](https://katex.org/)                                                 | 0.17.0  | MIT                   |
| [DOMPurify](https://github.com/cure53/DOMPurify)                            | 3.4.17  | MPL-2.0 OR Apache-2.0 |
| [Marp Core](https://github.com/marp-team/marp-core)                         | 4.4.0   | MIT                   |
| [Marpit](https://github.com/marp-team/marpit)                               | 3.2.3   | MIT                   |
| [markdown-it](https://github.com/markdown-it/markdown-it)                   | 14.3.3  | MIT                   |
| [highlight.js](https://highlightjs.org/)                                    | 11.12.0 | BSD-3-Clause          |
| [jsPDF](https://github.com/parallax/jsPDF)                                  | 3.0.4   | MIT                   |
| [html2canvas](https://github.com/niklasvh/html2canvas)                      | 1.4.1   | MIT                   |
| [PptxGenJS](https://github.com/gitbrent/PptxGenJS)                          | 4.0.1   | MIT                   |

The export libraries pull in further permissive transitive dependencies —
JSZip (MIT OR GPL-3.0-or-later, used by PptxGenJS under the MIT option),
`core-js`, `fflate`, `fast-png`, `@babel/runtime`, and html2canvas's helpers
(`canvg`, `rgbcolor`, `css-line-break`, `text-segmentation`,
`base64-arraybuffer`). They are used unmodified, bundled for the browser.

Marp Core pulls in further MIT/BSD-licensed transitive dependencies
(`@marp-team/marpit-svg-polyfill`, PostCSS, `js-yaml`, `linkify-it`, and
others). They are used unmodified, bundled for the browser.

No third-party code is fetched at runtime: Manifest V3 forbids remote code, so
the extension works fully offline.
