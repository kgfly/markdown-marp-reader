import { describe, expect, it, vi } from 'vitest';

import {
  collectMermaidTargets,
  mermaidTheme,
  renderMermaidBlocks,
} from '../src/core/mermaid.js';

function root(html) {
  const element = document.createElement('div');
  element.innerHTML = html;
  return element;
}

function fakeMermaid(overrides = {}) {
  return {
    initialize: vi.fn(),
    render: vi.fn().mockResolvedValue({ svg: '<svg data-test="diagram"></svg>' }),
    ...overrides,
  };
}

describe('mermaidTheme', () => {
  it('maps explicit and automatic themes', () => {
    expect(mermaidTheme('light')).toBe('default');
    expect(mermaidTheme('dark')).toBe('dark');
    expect(mermaidTheme('auto', true)).toBe('dark');
    expect(mermaidTheme('auto', false)).toBe('default');
  });
});

describe('collectMermaidTargets', () => {
  it('collects code fences and rendered diagrams with their sources', () => {
    const element = root(`
      <pre><code class="language-mermaid">graph TD; A-->B</code></pre>
      <pre><code class="language-mermaid">   </code></pre>
      <div class="mermaid-diagram" data-mermaid-source="sequenceDiagram"></div>
    `);

    expect(collectMermaidTargets(element).map((target) => target.source)).toEqual([
      'graph TD; A-->B',
      'sequenceDiagram',
    ]);
    expect(collectMermaidTargets(null)).toEqual([]);
  });
});

describe('renderMermaidBlocks', () => {
  it('replaces a code fence with the rendered SVG', async () => {
    const element = root(
      '<pre><code class="language-mermaid">graph TD; A-->B</code></pre>',
    );
    const mermaid = fakeMermaid();

    const result = await renderMermaidBlocks(element, {
      theme: 'dark',
      loadMermaid: async () => mermaid,
    });

    expect(result).toEqual({ rendered: 1, failed: 0, cancelled: false });
    expect(mermaid.initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'dark',
      }),
    );
    expect(mermaid.render).toHaveBeenCalledWith(
      expect.stringMatching(/^mmr-mermaid-\d+$/),
      'graph TD; A-->B',
    );
    const diagram = element.querySelector('.mermaid-diagram');
    expect(diagram.dataset.mermaidSource).toBe('graph TD; A-->B');
    expect(diagram.querySelector('svg')).not.toBeNull();
    expect(element.querySelector('pre')).toBeNull();
  });

  it('re-renders an existing diagram from its stored source', async () => {
    const element = root(
      '<div class="mermaid-diagram" data-mermaid-source="graph LR; A-->B"><svg></svg></div>',
    );
    const mermaid = fakeMermaid();

    await renderMermaidBlocks(element, {
      keepSource: false,
      loadMermaid: async () => mermaid,
    });

    expect(mermaid.render).toHaveBeenCalledWith(expect.any(String), 'graph LR; A-->B');
    expect(element.querySelector('.mermaid-diagram').dataset.mermaidSource).toBe(
      undefined,
    );
  });

  it('leaves the code fence in place when rendering fails', async () => {
    const element = root(
      '<pre><code class="language-mermaid">not a diagram</code></pre>',
    );
    const onError = vi.fn();
    const mermaid = fakeMermaid({
      render: vi.fn().mockRejectedValue(new Error('bad syntax')),
    });

    const result = await renderMermaidBlocks(element, {
      loadMermaid: async () => mermaid,
      onError,
    });

    expect(result).toEqual({ rendered: 0, failed: 1, cancelled: false });
    expect(onError).toHaveBeenCalledWith(expect.any(Error), expect.any(Object));
    expect(element.querySelector('pre code.language-mermaid')).not.toBeNull();
  });

  it('stops without rendering when cancelled', async () => {
    const element = root(
      '<pre><code class="language-mermaid">graph TD; A-->B</code></pre>',
    );
    const mermaid = fakeMermaid();

    const result = await renderMermaidBlocks(element, {
      loadMermaid: async () => mermaid,
      isCancelled: () => true,
    });

    expect(result).toEqual({ rendered: 0, failed: 0, cancelled: true });
    expect(mermaid.render).not.toHaveBeenCalled();
  });

  it('does nothing when there are no diagrams', async () => {
    const loadMermaid = vi.fn();
    const result = await renderMermaidBlocks(root('<p>text</p>'), { loadMermaid });

    expect(result).toEqual({ rendered: 0, failed: 0, cancelled: false });
    expect(loadMermaid).not.toHaveBeenCalled();
  });
});
