const BLOCK_SELECTOR = 'pre > code.language-mermaid';
const DIAGRAM_SELECTOR = '.mermaid-diagram[data-mermaid-source]';

let defaultMermaid = null;
let diagramCounter = 0;

function loadDefaultMermaid() {
  if (!defaultMermaid) {
    defaultMermaid = import('mermaid').then((module) => module.default);
  }
  return defaultMermaid;
}

/** Map the reader's theme setting to a Mermaid theme name. */
export function mermaidTheme(theme, prefersDark = false) {
  if (theme === 'dark') return 'dark';
  if (theme === 'light') return 'default';
  return prefersDark ? 'dark' : 'default';
}

/**
 * Every diagram that still needs rendering: unrendered `mermaid` code fences
 * and diagrams rendered earlier (which keep their source for theme changes).
 */
export function collectMermaidTargets(root) {
  if (!root || typeof root.querySelectorAll !== 'function') return [];

  const targets = [];
  for (const block of root.querySelectorAll(BLOCK_SELECTOR)) {
    const source = block.textContent ?? '';
    if (!source.trim()) continue;
    const fence = block.parentElement?.tagName === 'PRE' ? block.parentElement : block;
    targets.push({ block: fence, source });
  }
  for (const diagram of root.querySelectorAll(DIAGRAM_SELECTOR)) {
    const source = diagram.dataset.mermaidSource ?? '';
    if (source.trim()) targets.push({ diagram, source });
  }
  return targets;
}

/**
 * Render Mermaid code fences in an already-rendered Markdown tree. Rendering
 * happens after sanitization: Mermaid itself sanitizes its output, and its
 * strict security level disables scripts and click handlers from diagram text.
 *
 * `loadMermaid` and `isCancelled` are injectable so a newer document or theme
 * change can stop an in-flight batch and tests can avoid loading Mermaid.
 */
export async function renderMermaidBlocks(
  root,
  {
    theme = 'default',
    htmlLabels = false,
    keepSource = true,
    loadMermaid = loadDefaultMermaid,
    isCancelled = () => false,
    onError = null,
  } = {},
) {
  const targets = collectMermaidTargets(root);
  if (targets.length === 0) return { rendered: 0, failed: 0, cancelled: false };

  const mermaid = await loadMermaid();
  if (isCancelled()) return { rendered: 0, failed: 0, cancelled: true };

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme,
    flowchart: { htmlLabels, useMaxWidth: true },
    sequence: { useMaxWidth: true },
  });

  let rendered = 0;
  let failed = 0;
  for (const target of targets) {
    if (isCancelled()) return { rendered, failed, cancelled: true };

    diagramCounter += 1;
    try {
      const result = await mermaid.render(`mmr-mermaid-${diagramCounter}`, target.source);
      if (isCancelled()) return { rendered, failed, cancelled: true };

      const svg = typeof result === 'string' ? result : result?.svg;
      if (!svg) throw new Error('Mermaid returned no SVG.');

      const container = target.diagram ?? document.createElement('div');
      container.className = 'mermaid-diagram';
      if (keepSource) {
        container.dataset.mermaidSource = target.source;
      } else {
        delete container.dataset.mermaidSource;
      }
      container.innerHTML = svg;
      result?.bindFunctions?.(container);
      if (target.block) target.block.replaceWith(container);
      rendered += 1;
    } catch (error) {
      failed += 1;
      onError?.(error, target);
    }
  }
  return { rendered, failed, cancelled: false };
}
