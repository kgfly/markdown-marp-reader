import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import PptxGenJS from 'pptxgenjs';

import { buildSlidePageHtml, computePageBreaks, pdfLayout } from './export.js';

const PPTX_MIME =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';

const BLOCK_SELECTOR =
  'p, h1, h2, h3, h4, h5, h6, ul, ol, li, pre, table, tr, blockquote, hr, figure, img, div';

function createHiddenIframe(html, width, height) {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('sandbox', 'allow-same-origin');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = [
    'position: fixed',
    'top: 0',
    'left: -20000px',
    `width: ${width}px`,
    `height: ${height}px`,
    'border: 0',
    'pointer-events: none',
    'opacity: 0',
  ].join(';');
  iframe.srcdoc = html;
  document.body.append(iframe);
  return iframe;
}

function nextFrames(window, count = 2) {
  return new Promise((resolve) => {
    let remaining = count;
    const finish = () => {
      remaining -= 1;
      if (remaining <= 0) {
        resolve();
        return;
      }
      schedule();
    };
    const schedule = () => {
      const raf = window?.requestAnimationFrame;
      // rAF can be throttled inside off-screen frames, so always fall back.
      let done = false;
      const once = () => {
        if (done) return;
        done = true;
        finish();
      };
      if (typeof raf === 'function') raf.call(window, once);
      setTimeout(once, 32);
    };
    schedule();
  });
}

async function waitForIframe(iframe) {
  const loaded = new Promise((resolve) => {
    iframe.addEventListener('load', resolve, { once: true });
  });
  await Promise.race([loaded, new Promise((resolve) => setTimeout(resolve, 10_000))]);

  const doc = iframe.contentDocument;
  if (!doc) throw new Error('Could not render the export document.');

  // Font loading can stall in an off-screen frame, so never wait forever.
  await Promise.race([
    doc.fonts?.ready?.catch?.(() => {}) ?? Promise.resolve(),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
  await Promise.all(
    [...doc.images].map((image) =>
      image.complete
        ? Promise.resolve()
        : new Promise((resolve) => {
            image.addEventListener('load', resolve, { once: true });
            image.addEventListener('error', resolve, { once: true });
          }),
    ),
  );
  await nextFrames(iframe.contentWindow);
  return doc;
}

/** Block edges in CSS pixels, relative to the body, for smarter page breaks. */
export function collectBlockRects(root) {
  const rects = [];
  const base = root.getBoundingClientRect().top;

  for (const element of root.querySelectorAll(BLOCK_SELECTOR)) {
    const rect = element.getBoundingClientRect();
    if (rect.height <= 0.5) continue;
    rects.push({ top: rect.top - base, bottom: rect.bottom - base });
  }
  return rects;
}

/**
 * Render a standalone document HTML file to a paginated A4 PDF. The document
 * is rasterised at 2x, then sliced at block boundaries wherever possible.
 */
export async function documentHtmlToPdfBlob({ html, title = 'Document', scale = 2 }) {
  const layout = pdfLayout({ scale });
  const iframe = createHiddenIframe(html, layout.contentWidthPx, 900);

  try {
    const doc = await waitForIframe(iframe);
    const body = doc.body;
    body.style.width = `${layout.contentWidthPx}px`;
    await nextFrames(iframe.contentWindow);

    // documentElement.scrollHeight never drops below the viewport, so prefer
    // the body's own content height for short documents.
    const totalHeight = Math.max(
      1,
      Math.ceil(body.scrollHeight),
      Math.ceil(body.getBoundingClientRect().height),
    );
    iframe.style.height = `${totalHeight}px`;
    await nextFrames(iframe.contentWindow);

    // Chrome caps canvas dimensions; very long documents fall back to 1x.
    const renderScale = Math.min(scale, Math.max(1, 32000 / totalHeight));
    const canvas = await html2canvas(body, {
      backgroundColor: '#ffffff',
      scale: renderScale,
      width: layout.contentWidthPx,
      height: totalHeight,
      windowWidth: layout.contentWidthPx,
      windowHeight: totalHeight,
      logging: false,
      useCORS: false,
    });

    const pages = computePageBreaks(
      collectBlockRects(body),
      totalHeight,
      layout.contentHeightPx,
    );
    if (pages.length === 0) pages.push({ start: 0, end: totalHeight });

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'pt',
      format: 'a4',
      compress: true,
    });
    pdf.setProperties({ title, creator: 'Markdown & Marp Reader' });

    pages.forEach((page, index) => {
      if (index > 0) pdf.addPage('a4', 'portrait');

      const sourceY = Math.max(0, Math.round(page.start * renderScale));
      const sourceHeight = Math.max(1, Math.round((page.end - page.start) * renderScale));
      const slice = document.createElement('canvas');
      slice.width = canvas.width;
      slice.height = sourceHeight;

      const context = slice.getContext('2d');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, slice.width, slice.height);
      context.drawImage(
        canvas,
        0,
        sourceY,
        canvas.width,
        sourceHeight,
        0,
        0,
        canvas.width,
        sourceHeight,
      );

      const targetHeight =
        (page.end - page.start) * (layout.contentWidthPt / layout.contentWidthPx);

      pdf.addImage(
        slice.toDataURL('image/jpeg', 0.92),
        'JPEG',
        layout.marginPt,
        layout.marginPt,
        layout.contentWidthPt,
        targetHeight,
        undefined,
        'FAST',
      );
    });

    return pdf.output('blob');
  } finally {
    iframe.remove();
  }
}

/** Rasterise every Marp slide to a PNG data URL at the requested scale. */
export async function renderDeckSlideImages({
  slides = [],
  css = '',
  width = 1280,
  height = 720,
  scale = 2,
  onProgress,
} = {}) {
  const images = [];

  for (let index = 0; index < slides.length; index += 1) {
    const html = buildSlidePageHtml({
      slideHtml: slides[index],
      css,
      width,
      height,
    });
    const iframe = createHiddenIframe(html, width, height);

    try {
      const doc = await waitForIframe(iframe);
      const canvas = await html2canvas(doc.body, {
        backgroundColor: '#ffffff',
        scale,
        width,
        height,
        windowWidth: width,
        windowHeight: height,
        logging: false,
        useCORS: false,
      });
      images.push(canvas.toDataURL('image/png'));
    } finally {
      iframe.remove();
    }

    if (typeof onProgress === 'function') onProgress(index + 1, slides.length);
  }

  return images;
}

export function deckImagesToPdfBlob({
  images = [],
  width = 1280,
  height = 720,
  title = 'Slides',
}) {
  const orientation = width >= height ? 'landscape' : 'portrait';
  const pdf = new jsPDF({
    orientation,
    unit: 'px',
    format: [width, height],
    compress: true,
  });
  pdf.setProperties({ title, creator: 'Markdown & Marp Reader' });

  images.forEach((image, index) => {
    if (index > 0) pdf.addPage([width, height], orientation);
    pdf.addImage(image, 'PNG', 0, 0, width, height, undefined, 'FAST');
  });

  return pdf.output('blob');
}

export async function deckImagesToPptxBlob({
  images = [],
  width = 1280,
  height = 720,
  title = 'Slides',
}) {
  const pptx = new PptxGenJS();
  const slideWidth = 10;
  const slideHeight = (slideWidth * height) / width;

  pptx.defineLayout({ name: 'MARP', width: slideWidth, height: slideHeight });
  pptx.layout = 'MARP';
  pptx.title = title;
  pptx.author = 'Markdown & Marp Reader';

  for (const image of images) {
    const slide = pptx.addSlide();
    slide.addImage({ data: image, x: 0, y: 0, w: slideWidth, h: slideHeight });
  }

  const output = await pptx.write({ outputType: 'blob' });
  return output instanceof Blob ? output : new Blob([output], { type: PPTX_MIME });
}
