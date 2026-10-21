/**
 * Minimal front-matter reader.
 *
 * Marp only needs a handful of scalar keys (`marp`, `theme`, `paginate`,
 * `class`, ...), so pulling in a full YAML parser would add weight for little
 * benefit. This parser intentionally understands top-level `key: value`
 * pairs, quoted/plain scalars, flow arrays, booleans and numbers. Nested maps
 * and block scalars are ignored rather than mis-parsed.
 */

const FRONTMATTER_RE =
  /^(?:\uFEFF)?---[ \t]*\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/;

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function parseFrontmatter(text) {
  if (typeof text !== 'string') {
    throw new TypeError('parseFrontmatter expects a string');
  }

  const match = FRONTMATTER_RE.exec(text);
  if (!match) {
    return { attributes: {}, raw: '', body: text, hasFrontmatter: false };
  }

  return {
    attributes: parseYamlLite(match[1]),
    raw: match[1],
    body: text.slice(match[0].length),
    hasFrontmatter: true,
  };
}

export function parseYamlLite(source) {
  const result = Object.create(null);

  for (const rawLine of String(source).split(/\r?\n/)) {
    if (!rawLine.trim() || rawLine.trimStart().startsWith('#')) continue;
    // Only top-level keys: indented lines belong to a nested value.
    if (/^\s/.test(rawLine)) continue;

    const match = /^([A-Za-z0-9_.-]+)\s*:\s*(.*)$/.exec(rawLine);
    if (!match) continue;

    const key = match[1];
    if (UNSAFE_KEYS.has(key)) continue;
    result[key] = parseScalar(match[2]);
  }

  // Return a normal object for ergonomic property access / deep equality.
  return { ...result };
}

function parseScalar(rawValue) {
  const value = stripInlineComment(String(rawValue)).trim();

  if (value === '') return '';
  if (value === '|' || value === '>') return '';

  if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
    return unquote(value.slice(1, -1), '"');
  }
  if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) {
    return unquote(value.slice(1, -1), "'");
  }

  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1).trim();
    if (!inner) return [];
    return inner
      .split(',')
      .map((part) => parseScalar(part))
      .filter((part) => part !== '');
  }

  if (value === 'true' || value === 'TRUE') return true;
  if (value === 'false' || value === 'FALSE') return false;
  if (value === 'null' || value === '~') return null;
  if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(value)) return Number(value);

  return value;
}

function stripInlineComment(value) {
  let quote = null;
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (quote) {
      if (char === quote && value[i - 1] !== '\\') quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '#' && (i === 0 || /\s/.test(value[i - 1]))) {
      return value.slice(0, i);
    }
  }
  return value;
}

function unquote(value, quote) {
  if (quote === "'") return value.replace(/''/g, "'");
  return value.replace(/\\(["\\nrt])/g, (_, char) => {
    if (char === 'n') return '\n';
    if (char === 'r') return '\r';
    if (char === 't') return '\t';
    return char;
  });
}
