import { parseFrontmatter } from './frontmatter.js';
import { basename } from './paths.js';

/**
 * Inspect a Markdown document without rendering it.
 */
export function analyzeMarkdown(text, filename = '') {
  const { attributes, body, hasFrontmatter } = parseFrontmatter(String(text ?? ''));

  const marpFlag = attributes.marp;
  const isMarp = marpFlag === true || marpFlag === 'true';

  return {
    attributes,
    body,
    hasFrontmatter,
    isMarp,
    title: extractTitle(body) || prettyName(basename(filename)),
    theme: typeof attributes.theme === 'string' ? attributes.theme : '',
  };
}

export function extractTitle(markdown) {
  const withoutFences = stripCodeFences(String(markdown ?? ''));
  const heading = /^#[ \t]+(.+?)[ \t]*#*[ \t]*$/m.exec(withoutFences);
  if (!heading) return '';
  return stripInlineMarkup(heading[1]).trim();
}

export function stripCodeFences(markdown) {
  return markdown.replace(/^[ \t]*(```|~~~)[\s\S]*?^[ \t]*\1[ \t]*$/gm, '');
}

export function stripInlineMarkup(text) {
  return String(text)
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_~`]+/g, '')
    .replace(/<[^>]+>/g, '')
    .trim();
}

export function prettyName(filename) {
  return String(filename || 'Untitled')
    .replace(/\.(md|markdown|mdown)$/i, '')
    .replace(/[-_]+/g, ' ')
    .trim();
}
