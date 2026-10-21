import { describe, expect, it } from 'vitest';

import { parseFrontmatter, parseYamlLite } from '../src/core/frontmatter.js';

describe('parseFrontmatter', () => {
  it('returns the text unchanged when there is no front matter', () => {
    const text = '# Hello\n\nBody';
    expect(parseFrontmatter(text)).toEqual({
      attributes: {},
      raw: '',
      body: text,
      hasFrontmatter: false,
    });
  });

  it('parses top-level scalars and strips the block from the body', () => {
    const parsed = parseFrontmatter(
      '---\nmarp: true\ntheme: gaia\npaginate: 12\n---\n# Slide',
    );
    expect(parsed.hasFrontmatter).toBe(true);
    expect(parsed.attributes).toEqual({ marp: true, theme: 'gaia', paginate: 12 });
    expect(parsed.body).toBe('# Slide');
    expect(parsed.raw).toBe('marp: true\ntheme: gaia\npaginate: 12');
  });

  it('supports CRLF, a BOM, the ... terminator and empty blocks', () => {
    expect(parseFrontmatter('\uFEFF---\r\nmarp: true\r\n...\r\nBody').attributes).toEqual(
      {
        marp: true,
      },
    );
    expect(parseFrontmatter('---\n---\nBody').attributes).toEqual({});
  });

  it('handles quoted scalars, escapes, comments and flow arrays', () => {
    const attributes = parseYamlLite(
      [
        'title: "A # not a comment"',
        "author: 'O''Brien'",
        'escaped: "line\\nnext"',
        'plain: value # trailing comment',
        'tags: [one, "two", three]',
        'empty:',
        'literal: |',
        'nested:',
        '  ignored: true',
      ].join('\n'),
    );

    expect(attributes.title).toBe('A # not a comment');
    expect(attributes.author).toBe("O'Brien");
    expect(attributes.escaped).toBe('line\nnext');
    expect(attributes.plain).toBe('value');
    expect(attributes.tags).toEqual(['one', 'two', 'three']);
    expect(attributes.empty).toBe('');
    expect(attributes.literal).toBe('');
    expect(attributes.nested).toBe('');
    expect(attributes).not.toHaveProperty('  ignored');
  });

  it('parses booleans, null, numbers and unquoted values', () => {
    expect(
      parseYamlLite(
        [
          'yes: true',
          'no: FALSE',
          'nil: null',
          'tilde: ~',
          'int: -12',
          'float: 3.5',
          'leading: .25',
          'version: 1.2.3',
          'class: lead',
        ].join('\n'),
      ),
    ).toEqual({
      yes: true,
      no: false,
      nil: null,
      tilde: null,
      int: -12,
      float: 3.5,
      leading: 0.25,
      version: '1.2.3',
      class: 'lead',
    });
  });

  it('ignores blank lines, comments and prototype-polluting keys', () => {
    const attributes = parseYamlLite(
      '# comment\n\n__proto__: bad\nconstructor: bad\nprototype: bad\nsafe: ok\n: no-key\n',
    );
    expect(attributes).toEqual({ safe: 'ok' });
    expect(Object.getPrototypeOf(attributes)).toBe(Object.prototype);
  });

  it('does not treat an unterminated block as front matter', () => {
    const text = '---\nmarp: true\n# not closed';
    expect(parseFrontmatter(text)).toMatchObject({
      hasFrontmatter: false,
      body: text,
      attributes: {},
    });
  });

  it('rejects non-string input', () => {
    expect(() => parseFrontmatter(null)).toThrow(TypeError);
    expect(() => parseFrontmatter(undefined)).toThrow(TypeError);
  });
});
