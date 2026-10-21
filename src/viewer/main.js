import { analyzeMarkdown } from '../core/detect.js';
import { FileBundle, pathForFile, pickInitialMarkdown } from '../core/file-bundle.js';
import { addHeadingIds, renderMarkdown } from '../core/markdown.js';
import { buildSlideDocument, renderMarp } from '../core/marp.js';
import { isMarkdownPath, resolveResourcePath } from '../core/paths.js';
import { rewriteResourceUrls } from '../core/resources.js';
import { collectDroppedFiles } from '../ui/drop.js';
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
  toastTimer: 0,
};

const el = {};

document.addEventListener('DOMContentLoaded', init);

function init() {
  cacheElements();
  applyTheme();
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
  el.openFolder.addEventListener('click', () => el.folderInput.click());
  el.dropOpenFile?.addEventListener('click', () => el.fileInput.click());
  el.dropOpenFolder?.addEventListener('click', () => el.folderInput.click());
  el.noticeAction?.addEventListener('click', () => el.folderInput.click());

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
  el.sidebarToggle.addEventListener('click', () => {
    el.sidebar.classList.toggle('is-hidden');
    el.sidebarToggle.setAttribute(
      'aria-expanded',
      String(!el.sidebar.classList.contains('is-hidden')),
    );
  });

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

  window.addEventListener('resize', resizeSlideFrame);
  window.addEventListener('keydown', handleKeydown);
  window.addEventListener('beforeunload', () => state.bundle?.release());
  window.addEventListener('dragover', handleDragOver);
  window.addEventListener('dragenter', handleDragEnter);
  window.addEventListener('dragleave', handleDragLeave);
  window.addEventListener('drop', handleDrop);

  el.slidesFrame.addEventListener('load', () => syncSlideFrame(false));
}

function openFiles(files) {
  const entries = files.map((file) => ({ file, path: pathForFile(file) }));
  openEntries(entries);
}

function openEntries(entries) {
  const usable = entries.filter((entry) => entry && entry.file);
  const nextBundle = new FileBundle(usable);
  const markdownFiles = nextBundle.markdownFiles();

  if (markdownFiles.length === 0) {
    nextBundle.release();
    showToast(
      'No Markdown files found. Choose a .md/.markdown file or a folder that contains one.',
      'error',
    );
    return;
  }

  state.bundle?.release();
  state.bundle = nextBundle;
  state.marp = null;
  state.slideIndex = 0;
  renderFileList();

  const initial = pickInitialMarkdown(nextBundle);
  openDocument(initial);
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
  const filter = (el.fileFilter?.value ?? '').trim().toLowerCase();
  const files = state.bundle?.markdownFiles() ?? [];
  el.fileList.replaceChildren();

  for (const { path } of files) {
    if (filter && !path.toLowerCase().includes(filter)) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'file-item';
    button.classList.toggle('is-active', path === state.markdownPath);
    button.title = path;
    button.setAttribute('aria-current', String(path === state.markdownPath));

    const name = document.createElement('span');
    name.className = 'file-name';
    name.textContent = path.split('/').pop();

    const directory = document.createElement('span');
    directory.className = 'file-dir';
    directory.textContent = path.includes('/')
      ? path.slice(0, path.lastIndexOf('/'))
      : '';

    button.append(name, directory);
    button.addEventListener('click', () => openDocument(path));
    el.fileList.append(button);
  }

  el.fileCount.textContent = String(files.length);
  el.sidebar.hidden = files.length === 0;
  el.fileFilter.hidden = files.length < 6;
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
