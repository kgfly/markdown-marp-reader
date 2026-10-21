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

Marp Core pulls in further MIT/BSD-licensed transitive dependencies
(`@marp-team/marpit-svg-polyfill`, PostCSS, `js-yaml`, `linkify-it`, and
others). They are used unmodified, bundled for the browser.

No third-party code is fetched at runtime: Manifest V3 forbids remote code, so
the extension works fully offline.
