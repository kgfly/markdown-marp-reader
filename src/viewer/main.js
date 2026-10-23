import { analyzeMarkdown } from '../core/detect.js';
import {
  buildDeckHtml,
  buildDocumentHtml,
  exportFileName,
  pdfLayout,
} from '../core/export.js';
import { prepareDeckExport, prepareDocumentExport } from '../core/export-assets.js';
import {
  deckImagesToPdfBlob,
  deckImagesToPptxBlob,
  documentHtmlToPdfBlob,
  renderDeckSlideImages,
} from '../core/export-render.js';
import { FileBundle, pathForFile, pickInitialMarkdown } from '../core/file-bundle.js';
import { addHeadingIds, renderMarkdown } from '../core/markdown.js';
import { buildSlideDocument, renderMarp } from '../core/marp.js';
import { isMarkdownPath, resolveResourcePath } from '../core/paths.js';
import { rewriteResourceUrls } from '../core/resources.js';
import { collectDroppedFiles } from '../ui/drop.js';
import { pickDirectory } from '../ui/folder-picker.js';
import { ancestorPaths, buildFileTree, fileKind, fileLabel } from '../ui/file-tree.js';
import {
  clampIndex,
  fitSlideSize,
  formatSlideCounter,
  stepIndex,
} from '../ui/slide-state.js';

const THEME_CYCLE = ['auto', 'light', 'dark'];
const THEME_LABEL = { auto: 'Theme: auto', light: 'Theme: light', dark: 'Theme: dark' };

const state = {
  bundle: null,
  markdownPath: '',
  text: '',
  analysis: null,
  marp: null,
  mode: 'doc',
  slideIndex: 0,
  theme: readTheme(),
  missing: [],
  exporting: false,
  toastTimer: 0,
  sidebarOpen: readSidebarOpen(),
  expandedDirs: new Set(),
};

const el = {};

document.addEventListener('DOMContentLoaded', init);

function init() {
  cacheElements();
  applyTheme();
  applySidebarState();
  bindEvents();
  renderFileList();
  updateModeButtons();
  showView('empty');
}

function cacheElements() {
  const ids = [
    'open-file',
    'open-folder',
    'file-input',
    'folder-input',
    'file-list',
    'file-count',
    'file-filter',
    'sidebar',
    'sidebar-toggle',
    'sidebar-close',
    'browser-empty',
    'browser-open-folder',
    'doc-title',
    'doc-path',
    'mode-doc',
    'mode-slides',
    'mode-source',
    'doc-view',
    'slides-view',
    'slides-frame',
    'slide-shield',
    'prev-slide',
    'next-slide',
    'slide-counter',
    'present',
    'present-prev',
    'present-next',
    'present-exit',
    'present-counter',
    'theme-toggle',
    'export-wrap',
    'export-button',
    'export-menu',
    'source-view',
    'source-code',
    'dropzone',
    'drop-open-file',
    'drop-open-folder',
    'notice',
    'notice-text',
    'notice-action',
    'toast',
    'stage',
    'app',
  ];
  for (const id of ids) {
    el[toCamel(id)] = document.getElementById(id);
  }
}

function bindEvents() {
  el.openFile.addEventListener('click', () => el.fileInput.click());
  el.openFolder.addEventListener('click', chooseFolder);
  el.dropOpenFile?.addEventListener('click', () => el.fileInput.click());
  el.dropOpenFolder?.addEventListener('click', chooseFolder);
  el.browserOpenFolder?.addEventListener('click', chooseFolder);
  el.noticeAction?.addEventListener('click', chooseFolder);

  el.fileInput.addEventListener('change', () => {
    const files = Array.from(el.fileInput.files ?? []);
    el.fileInput.value = '';
    if (files.length) openFiles(files);
  });

  el.folderInput.addEventListener('change', () => {
    const files = Array.from(el.folderInput.files ?? []);
    el.folderInput.value = '';
    if (files.length) openFiles(files);
  });

  el.modeDoc.addEventListener('click', () => setMode('doc'));
  el.modeSlides.addEventListener('click', () => setMode('slides'));
  el.modeSource.addEventListener('click', () => setMode('source'));

  el.prevSlide.addEventListener('click', () =>
    goToSlide(stepIndex(state.slideIndex, -1, slideCount())),
  );
  el.nextSlide.addEventListener('click', () =>
    goToSlide(stepIndex(state.slideIndex, 1, slideCount())),
  );
  el.presentPrev?.addEventListener('click', () =>
    goToSlide(stepIndex(state.slideIndex, -1, slideCount())),
  );
  el.presentNext?.addEventListener('click', () =>
    goToSlide(stepIndex(state.slideIndex, 1, slideCount())),
  );
  el.presentExit?.addEventListener('click', exitPresent);
  el.present.addEventListener('click', togglePresent);
  el.themeToggle.addEventListener('click', cycleTheme);
  el.sidebarToggle.addEventListener('click', toggleSidebar);
  el.sidebarClose?.addEventListener('click', () => setSidebarOpen(false));
  el.fileList.addEventListener('click', handleFileListClick);

  el.fileFilter.addEventListener('input', renderFileList);
  el.slideShield.addEventListener('click', () => {
    if (!slidesViewIsPresenting()) return;
    goToSlide(stepIndex(state.slideIndex, 1, slideCount()));
  });

  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement !== el.slidesView) {
      el.slidesView.classList.remove('present');
      el.present.setAttribute('aria-pressed', 'false');
      resizeSlideFrame();
    }
  });

  el.exportButton?.addEventListener('click', toggleExportMenu);
  el.exportMenu?.addEventListener('click', handleExportMenuClick);
  document.addEventListener('click', (event) => {
    if (!el.exportWrap?.contains(event.target)) closeExportMenu();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeExportMenu();
  });

  window.addEventListener('resize', resizeSlideFrame);
  window.addEventListener('keydown', handleKeydown);
  window.addEventListener('beforeunload', () => state.bundle?.release());
  window.addEventListener('dragover', handleDragOver);
  window.addEventListener('dragenter', handleDragEnter);
  window.addEventListener('dragleave', handleDragLeave);
  window.addEventListener('drop', handleDrop);

  el.slidesFrame.addEventListener('load', () => syncSlideFrame(false));
}

let folderPickerBusy = false;

async function chooseFolder() {
  if (folderPickerBusy) return;
  folderPickerBusy = true;
  try {
    const result = await pickDirectory();

    if (!result.supported) {
      // Older browsers: the hidden <input webkitdirectory> still works.
      el.folderInput.click();
      return;
    }
    if (result.cancelled) return;

    if (result.error?.name === 'SecurityError') {
      // The context blocks the directory picker; use the input instead.
      el.folderInput.click();
      return;
    }

    if (result.entries.length === 0) {
      showToast(
        result.error
          ? `Could not read that folder: ${result.error.message}. Try dragging it onto the window instead.`
          : 'That folder contains no readable files.',
        'error',
      );
      return;
    }

    openEntries(result.entries);
  } finally {
    folderPickerBusy = false;
  }
}

function openFiles(files) {
  const entries = files.map((file) => ({ file, path: pathForFile(file) }));
  openEntries(entries);
}

function openEntries(entries) {
  const usable = entries.filter((entry) => entry && entry.file);
  const nextBundle = new FileBundle(usable);

  if (nextBundle.size === 0) {
    nextBundle.release();
    showToast('No readable files found. Choose a file or a folder to browse.', 'error');
    return;
  }

  state.bundle?.release();
  state.bundle = nextBundle;
  state.expandedDirs.clear();

  const initial = pickInitialMarkdown(nextBundle);
  if (initial) {
    openDocument(initial);
    return;
  }

  resetDocument();
  renderFileList();
  showToast(
    'No Markdown files in this selection. Use the file browser on the left to open other files.',
  );
}

/**
 * Clear the current document while keeping the opened file bundle, so a folder
 * without Markdown can still be browsed.
 */
function resetDocument() {
  state.markdownPath = '';
  state.text = '';
  state.analysis = null;
  state.marp = null;
  state.mode = 'doc';
  state.slideIndex = 0;
  state.missing = [];

  el.docTitle.textContent = 'Markdown & Marp Reader';
  el.docPath.textContent = '';
  el.docPath.title = '';
  document.title = 'Markdown & Marp Reader';
  document.body.classList.remove('has-document');
  el.docView.replaceChildren();
  el.sourceCode.textContent = '';
  el.slidesFrame.removeAttribute('srcdoc');

  showView('empty');
  updateModeButtons();
  updateSlideCounter();
  updateNotice();
}

async function openDocument(path) {
  if (!state.bundle || !path) return;

  try {
    const text = await state.bundle.readText(path);
    state.markdownPath = path;
    state.text = text;
    state.analysis = analyzeMarkdown(text, path);
    state.marp = null;
    state.slideIndex = 0;
    state.missing = [];
    for (const dir of ancestorPaths(path)) state.expandedDirs.add(dir);

    el.docTitle.textContent = state.analysis.title;
    el.docPath.textContent = path;
    el.docPath.title = path;
    document.title = `${state.analysis.title} · Markdown & Marp Reader`;
    document.body.classList.add('has-document');

    renderSource();
    renderDocument();
    renderFileList();

    setMode(state.analysis.isMarp ? 'slides' : 'doc', { render: false });
    if (state.analysis.isMarp) renderSlides();
    if (state.mode === 'slides') updateSlideCounter();

    el.app.classList.remove('dragging');
    showView(state.mode);
    updateNotice();
  } catch (error) {
    console.error(error);
    showToast(`Could not open ${path}: ${error.message}`, 'error');
  }
}

function renderDocument() {
  const rendered = renderMarkdown(state.text, { filename: state.markdownPath });
  el.docView.innerHTML = rendered.html;
  addHeadingIds(el.docView);

  const result = rewriteResourceUrls(el.docView, {
    markdownPath: state.markdownPath,
    bundle: state.bundle,
  });

  decorateLinks(el.docView);
  mergeMissing(result.missing);
}

function renderSlides() {
  if (!state.bundle) return;
  if (!state.marp) {
    try {
      const rendered = renderMarp(state.text);
      // Parse into an inert document: no scripts run and no images load while
      // we rewrite relative references to blob URLs.
      const inert = new DOMParser().parseFromString(rendered.html, 'text/html');
      const result = rewriteResourceUrls(inert.body, {
        markdownPath: state.markdownPath,
        bundle: state.bundle,
      });
      mergeMissing(result.missing);
      state.marp = {
        html: inert.body.innerHTML,
        css: rendered.css,
        slideCount: rendered.slideCount,
      };
    } catch (error) {
      console.error(error);
      showToast(`Could not render slides: ${error.message}`, 'error');
      state.marp = { html: '', css: '', slideCount: 0 };
    }
  }

  state.slideIndex = clampIndex(state.slideIndex, state.marp.slideCount);
  el.slidesFrame.srcdoc = buildSlideDocument({
    html: state.marp.html,
    css: state.marp.css,
    activeIndex: state.slideIndex,
    baseUri: document.baseURI,
  });
  updateSlideCounter();
  resizeSlideFrame();
  updateNotice();
}

function renderSource() {
  if (el.sourceCode) el.sourceCode.textContent = state.text;
}

function setMode(mode, { render = true } = {}) {
  state.mode = mode;
  updateModeButtons();
  showView(mode);

  if (!state.text) return;

  if (mode === 'slides') {
    if (render) renderSlides();
  } else if (mode === 'doc') {
    resizeSlideFrame();
  }
  updateSlideCounter();
}

function showView(mode) {
  const hasDocument = Boolean(state.text);
  el.dropzone.hidden = hasDocument;
  el.docView.hidden = !hasDocument || mode !== 'doc';
  el.slidesView.hidden = !hasDocument || mode !== 'slides';
  el.sourceView.hidden = !hasDocument || mode !== 'source';
  el.slidesView.classList.toggle('is-visible', hasDocument && mode === 'slides');
  document.body.dataset.mode = mode;
  resizeSlideFrame();
  updateExportState();
}

function updateModeButtons() {
  setPressed(el.modeDoc, state.mode === 'doc');
  setPressed(el.modeSlides, state.mode === 'slides');
  setPressed(el.modeSource, state.mode === 'source');
  for (const element of [el.prevSlide, el.nextSlide, el.present, el.slideCounter]) {
    element.hidden = state.mode !== 'slides';
  }
}

function setPressed(element, pressed) {
  if (!element) return;
  element.classList.toggle('is-active', pressed);
  element.setAttribute('aria-pressed', String(pressed));
}

function goToSlide(index) {
  const count = slideCount();
  if (count <= 0) return;
  state.slideIndex = clampIndex(index, count);
  updateSlideCounter();
  syncSlideFrame(true);
}

function slideCount() {
  return state.marp?.slideCount ?? 0;
}

function updateSlideCounter() {
  const label = formatSlideCounter(state.slideIndex, slideCount());
  if (el.slideCounter) el.slideCounter.textContent = label;
  if (el.presentCounter) el.presentCounter.textContent = label;
}

/**
 * Update the active slide inside the sandboxed iframe. If its document is not
 * ready yet (or is inaccessible), rebuild the srcdoc with the right index.
 */
function syncSlideFrame(allowReload) {
  if (state.mode !== 'slides' || !state.marp) return;

  try {
    const doc = el.slidesFrame.contentDocument;
    const slides = doc?.querySelectorAll('svg[data-marpit-svg]');
    if (slides && slides.length === state.marp.slideCount) {
      slides.forEach((slide, index) => {
        slide.classList.toggle('is-active', index === state.slideIndex);
      });
      return;
    }
  } catch {
    // Sandboxed document not reachable yet; fall through to a rebuild.
  }

  if (allowReload) {
    el.slidesFrame.srcdoc = buildSlideDocument({
      html: state.marp.html,
      css: state.marp.css,
      activeIndex: state.slideIndex,
      baseUri: document.baseURI,
    });
  }
}

function resizeSlideFrame() {
  if (!el.stage || !el.slidesView || el.slidesView.hidden) return;

  if (slidesViewIsPresenting()) {
    el.slidesFrame.style.width = '100%';
    el.slidesFrame.style.height = '100%';
    return;
  }

  const bounds = el.stage.getBoundingClientRect();
  const chrome = 56;
  const size = fitSlideSize(bounds.width, bounds.height - chrome, {
    padding: 24,
  });
  if (size.width > 0 && size.height > 0) {
    el.slidesFrame.style.width = `${size.width}px`;
    el.slidesFrame.style.height = `${size.height}px`;
  }
}

async function togglePresent() {
  if (slidesViewIsPresenting()) {
    await exitPresent();
    return;
  }

  el.slidesView.classList.add('present');
  el.present.setAttribute('aria-pressed', 'true');
  resizeSlideFrame();
  try {
    await el.slidesView.requestFullscreen?.();
  } catch {
    showToast('Fullscreen is not available in this window.', 'error');
  }
}

async function exitPresent() {
  el.slidesView.classList.remove('present');
  el.present.setAttribute('aria-pressed', 'false');
  resizeSlideFrame();
  if (document.fullscreenElement) {
    try {
      await document.exitFullscreen?.();
    } catch {
      // Leaving the class above is enough of a fallback.
    }
  }
}

function slidesViewIsPresenting() {
  return Boolean(
    el.slidesView?.classList.contains('present') ||
    document.fullscreenElement === el.slidesView,
  );
}

function handleKeydown(event) {
  if (event.defaultPrevented) return;
  const target = event.target;
  if (
    target instanceof HTMLElement &&
    (target.matches('input, textarea, select') || target.isContentEditable)
  ) {
    return;
  }

  if (state.mode === 'slides') {
    if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') {
      event.preventDefault();
      goToSlide(stepIndex(state.slideIndex, 1, slideCount()));
      return;
    }
    if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
      event.preventDefault();
      goToSlide(stepIndex(state.slideIndex, -1, slideCount()));
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      goToSlide(0);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      goToSlide(slideCount() - 1);
      return;
    }
    if (event.key === 'f' || event.key === 'F') {
      event.preventDefault();
      togglePresent();
      return;
    }
    if (event.key === 'Escape' && slidesViewIsPresenting()) {
      exitPresent();
    }
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b') {
    event.preventDefault();
    toggleSidebar();
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'o') {
    event.preventDefault();
    el.fileInput.click();
  }
}

function handleDragOver(event) {
  if (!hasFiles(event)) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
  document.body.classList.add('dragging');
}

function handleDragEnter(event) {
  if (!hasFiles(event)) return;
  event.preventDefault();
  document.body.classList.add('dragging');
}

function handleDragLeave(event) {
  if (event.relatedTarget) return;
  document.body.classList.remove('dragging');
}

async function handleDrop(event) {
  if (!hasFiles(event)) return;
  event.preventDefault();
  document.body.classList.remove('dragging');
  try {
    const entries = await collectDroppedFiles(event.dataTransfer);
    if (entries.length === 0) {
      showToast('The dropped item did not contain any readable files.', 'error');
      return;
    }
    openEntries(entries);
  } catch (error) {
    console.error(error);
    showToast(`Could not read the dropped files: ${error.message}`, 'error');
  }
}

function hasFiles(event) {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files');
}

function renderFileList() {
  if (!el.fileList) return;

  const scrollTop = el.fileList.scrollTop;
  const paths = state.bundle?.paths() ?? [];
  const filter = (el.fileFilter?.value ?? '').trim().toLowerCase();

  const visibleFiles = new Set(
    paths.filter((path) => !filter || path.toLowerCase().includes(filter)),
  );
  const visibleDirs = new Set();
  for (const path of visibleFiles) {
    for (const dir of ancestorPaths(path)) visibleDirs.add(dir);
  }

  el.fileList.replaceChildren();
  el.fileFilter.hidden = paths.length < 6;

  if (paths.length === 0) {
    el.fileCount.textContent = '0';
    el.fileCount.title = '0 files';
    el.fileList.hidden = true;
    if (el.browserEmpty) el.browserEmpty.hidden = false;
    return;
  }

  el.fileList.hidden = false;
  if (el.browserEmpty) el.browserEmpty.hidden = true;
  el.fileCount.textContent = filter
    ? `${visibleFiles.size}/${paths.length}`
    : String(paths.length);
  el.fileCount.title = `${paths.length} file${paths.length === 1 ? '' : 's'}`;

  if (filter && visibleFiles.size === 0) {
    const empty = document.createElement('p');
    empty.className = 'file-list__empty';
    empty.textContent = 'No files match this filter.';
    el.fileList.append(empty);
    return;
  }

  const context = { filter, visibleFiles, visibleDirs };
  renderTree(buildFileTree(paths), el.fileList, 0, context);
  el.fileList.scrollTop = scrollTop;
}

function renderTree(node, container, depth, context) {
  const { filter, visibleFiles, visibleDirs } = context;

  for (const dir of node.dirs.values()) {
    if (filter && !visibleDirs.has(dir.path)) continue;

    const expanded = filter ? true : state.expandedDirs.has(dir.path);
    const row = document.createElement(filter ? 'div' : 'button');
    row.className = 'tree-item tree-dir';
    row.title = dir.path;
    row.style.setProperty('--indent', `${depth * 14}px`);

    if (filter) {
      row.classList.add('is-static');
    } else {
      row.type = 'button';
      row.dataset.dirPath = dir.path;
      row.setAttribute('aria-expanded', String(expanded));
    }

    const twisty = document.createElement('span');
    twisty.className = 'tree-twisty';
    twisty.setAttribute('aria-hidden', 'true');
    twisty.textContent = '▸';

    const name = document.createElement('span');
    name.className = 'tree-name';
    name.textContent = dir.name;

    row.append(twisty, name);
    container.append(row);

    if (expanded) {
      const group = document.createElement('div');
      group.className = 'tree-group';
      renderTree(dir, group, depth + 1, context);
      container.append(group);
    }
  }

  for (const file of node.files) {
    if (filter && !visibleFiles.has(file.path)) continue;

    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'tree-item tree-file';
    row.dataset.filePath = file.path;
    row.title = file.path;
    row.style.setProperty('--indent', `${depth * 14}px`);
    row.classList.toggle('is-active', file.path === state.markdownPath);
    if (file.path === state.markdownPath) row.setAttribute('aria-current', 'true');

    const icon = document.createElement('span');
    icon.className = 'tree-icon';
    icon.dataset.kind = fileKind(file.path);
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = fileLabel(file.path);

    const name = document.createElement('span');
    name.className = 'tree-name';
    name.textContent = file.name;

    row.append(icon, name);
    container.append(row);
  }
}

function handleFileListClick(event) {
  const target = event.target instanceof Element ? event.target : null;
  const row = target?.closest('[data-dir-path], [data-file-path]');
  if (!row) return;

  const dirPath = row.dataset.dirPath;
  if (dirPath) {
    toggleDirectory(dirPath);
    return;
  }

  const filePath = row.dataset.filePath;
  if (!filePath) return;

  if (isMarkdownPath(filePath)) {
    openDocument(filePath);
    return;
  }

  const objectUrl = state.bundle?.objectUrl(filePath);
  if (!objectUrl) {
    showToast(`Could not open ${filePath}.`, 'error');
    return;
  }

  const link = document.createElement('a');
  link.href = objectUrl;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.click();
}

function toggleDirectory(path) {
  if ((el.fileFilter?.value ?? '').trim()) return;

  if (state.expandedDirs.has(path)) {
    state.expandedDirs.delete(path);
  } else {
    state.expandedDirs.add(path);
  }

  renderFileList();
  const row = [...el.fileList.querySelectorAll('[data-dir-path]')].find(
    (candidate) => candidate.dataset.dirPath === path,
  );
  row?.focus();
}

function decorateLinks(container) {
  for (const anchor of container.querySelectorAll('a[href]')) {
    const href = anchor.getAttribute('href') ?? '';
    if (/^(?:https?:)?\/\//i.test(href)) {
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      continue;
    }
    if (href.startsWith('#')) continue;

    const resolved = resolveResourcePath(state.markdownPath, href);
    if (!resolved) continue;

    if (!state.bundle?.has(resolved.path)) {
      anchor.classList.add('is-missing-link');
      anchor.title = `Not in the opened selection: ${resolved.path}`;
      continue;
    }

    if (isMarkdownPath(resolved.path)) {
      anchor.classList.add('internal-link');
      anchor.title = `Open ${resolved.path}`;
      anchor.addEventListener('click', (event) => {
        event.preventDefault();
        openDocument(resolved.path);
      });
      continue;
    }

    const objectUrl = state.bundle.objectUrl(resolved.path);
    if (objectUrl) {
      anchor.href = `${objectUrl}${resolved.suffix}`;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
    }
  }
}

function mergeMissing(paths) {
  for (const path of paths) {
    if (!state.missing.includes(path)) state.missing.push(path);
  }
  updateNotice();
}

function updateNotice() {
  if (!el.notice) return;
  const count = state.missing.length;
  el.notice.hidden = count === 0;
  if (count === 0) return;

  const noun = count === 1 ? 'file' : 'files';
  el.noticeText.textContent =
    `${count} referenced ${noun} could not be found in the opened selection. ` +
    'If you opened a single file, open its folder instead so sibling images and styles can be resolved.';
  el.noticeAction.hidden = !(state.bundle && state.bundle.size <= 1);
}

const EXPORT_LABELS = {
  html: 'Exporting HTML…',
  pdf: 'Building PDF…',
  'slides-html': 'Exporting slides…',
  'slides-pdf': 'Rendering slides to PDF…',
  pptx: 'Building PowerPoint…',
};

function updateExportState() {
  if (!el.exportButton) return;

  const ready = Boolean(state.text && state.bundle) && !state.exporting;
  el.exportButton.disabled = !ready;
  el.exportButton.title = state.exporting
    ? 'Export in progress…'
    : ready
      ? 'Export this document'
      : 'Open a document to export';

  const isMarp = Boolean(state.analysis?.isMarp);
  const groups = el.exportMenu?.querySelectorAll('[data-export-group]') ?? [];
  for (const group of groups) {
    group.hidden = group.dataset.exportGroup === 'marp' ? !isMarp : isMarp;
  }
}

function toggleExportMenu() {
  if (!el.exportMenu || el.exportButton?.disabled) return;
  const open = el.exportMenu.hidden;
  el.exportMenu.hidden = !open;
  el.exportButton.setAttribute('aria-expanded', String(open));
}

function closeExportMenu() {
  if (!el.exportMenu || el.exportMenu.hidden) return;
  el.exportMenu.hidden = true;
  el.exportButton?.setAttribute('aria-expanded', 'false');
}

async function handleExportMenuClick(event) {
  const button = event.target.closest?.('button[data-export]');
  if (!button) return;
  closeExportMenu();
  await runExport(button.dataset.export);
}

async function runExport(kind) {
  if (state.exporting || !state.text || !state.bundle) return;

  state.exporting = true;
  updateExportState();
  showToast(EXPORT_LABELS[kind] ?? 'Preparing export…');

  try {
    if (kind === 'html' || kind === 'pdf') {
      const prepared = await prepareDocumentExport({
        text: state.text,
        markdownPath: state.markdownPath,
        bundle: state.bundle,
      });
      if (prepared.missing.length) mergeMissing(prepared.missing);

      const html = buildDocumentHtml({
        title: prepared.title,
        bodyHtml: prepared.bodyHtml,
        css: prepared.css,
        pdf: kind === 'pdf',
        pageWidthPx: pdfLayout().contentWidthPx,
      });

      if (kind === 'html') {
        downloadBlob(
          new Blob([html], { type: 'text/html;charset=utf-8' }),
          exportFileName(state.markdownPath, 'html'),
        );
        showToast('HTML exported.');
      } else {
        const blob = await documentHtmlToPdfBlob({ html, title: prepared.title });
        downloadBlob(blob, exportFileName(state.markdownPath, 'pdf'));
        showToast('PDF exported.');
      }
      return;
    }

    const deck = await prepareDeckExport({
      text: state.text,
      markdownPath: state.markdownPath,
      bundle: state.bundle,
    });
    if (deck.missing.length) mergeMissing(deck.missing);
    if (deck.slides.length === 0) throw new Error('this deck has no slides');

    if (kind === 'slides-html') {
      const html = buildDeckHtml({
        title: deck.title,
        slidesHtml: deck.slides.join('\n'),
        css: deck.css,
        width: deck.width,
        height: deck.height,
      });
      downloadBlob(
        new Blob([html], { type: 'text/html;charset=utf-8' }),
        exportFileName(state.markdownPath, 'slides.html'),
      );
      showToast('HTML slides exported.');
      return;
    }

    const images = await renderDeckSlideImages({
      slides: deck.slides,
      css: deck.css,
      width: deck.width,
      height: deck.height,
      onProgress: (done, total) => showToast(`Rendering slide ${done}/${total}…`),
    });

    if (kind === 'slides-pdf') {
      downloadBlob(
        deckImagesToPdfBlob({
          images,
          width: deck.width,
          height: deck.height,
          title: deck.title,
        }),
        exportFileName(state.markdownPath, 'slides.pdf'),
      );
      showToast('PDF slides exported.');
    } else {
      downloadBlob(
        await deckImagesToPptxBlob({
          images,
          width: deck.width,
          height: deck.height,
          title: deck.title,
        }),
        exportFileName(state.markdownPath, 'pptx'),
      );
      showToast('PowerPoint exported.');
    }
  } catch (error) {
    console.error(error);
    showToast(`Export failed: ${error.message}`, 'error');
  } finally {
    state.exporting = false;
    updateExportState();
  }
}

function downloadBlob(blob, filename) {
  if (!(blob instanceof Blob)) throw new Error('the export produced no data');
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function showToast(message, type = 'info') {
  if (!el.toast) return;
  window.clearTimeout(state.toastTimer);
  el.toast.textContent = message;
  el.toast.className = `toast is-visible ${type === 'error' ? 'is-error' : ''}`;
  state.toastTimer = window.setTimeout(
    () => {
      el.toast.className = 'toast';
    },
    type === 'error' ? 8000 : 4000,
  );
}

function readSidebarOpen() {
  try {
    const stored = localStorage.getItem('mmr-sidebar');
    if (stored === 'open') return true;
    if (stored === 'closed') return false;
  } catch {
    // Storage can be unavailable; fall back to the viewport default.
  }
  return window.matchMedia?.('(min-width: 901px)').matches ?? true;
}

function applySidebarState() {
  if (el.sidebar) el.sidebar.classList.toggle('is-hidden', !state.sidebarOpen);
  if (!el.sidebarToggle) return;
  el.sidebarToggle.classList.toggle('is-active', state.sidebarOpen);
  el.sidebarToggle.setAttribute('aria-expanded', String(state.sidebarOpen));
}

function setSidebarOpen(open, { persist = true } = {}) {
  state.sidebarOpen = Boolean(open);
  applySidebarState();
  if (!persist) return;
  try {
    localStorage.setItem('mmr-sidebar', state.sidebarOpen ? 'open' : 'closed');
  } catch {
    // Ignoring is fine: the toggle still works for this session.
  }
}

function toggleSidebar() {
  setSidebarOpen(!state.sidebarOpen);
}

function readTheme() {
  try {
    const value = localStorage.getItem('mmr-theme');
    return THEME_CYCLE.includes(value) ? value : 'auto';
  } catch {
    return 'auto';
  }
}

function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
  document.documentElement.style.colorScheme =
    state.theme === 'auto' ? 'light dark' : state.theme;
  if (el.themeToggle) {
    el.themeToggle.textContent = THEME_LABEL[state.theme];
    el.themeToggle.title = 'Switch colour theme';
  }
}

function cycleTheme() {
  const index = THEME_CYCLE.indexOf(state.theme);
  state.theme = THEME_CYCLE[(index + 1) % THEME_CYCLE.length];
  applyTheme();
  try {
    localStorage.setItem('mmr-theme', state.theme);
  } catch {
    // Storage can be unavailable in private/edge contexts; ignoring is fine.
  }
}

function toCamel(id) {
  return id.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}
