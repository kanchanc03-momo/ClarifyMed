import { parentPort, workerData } from 'node:worker_threads';
import { createRequire } from 'node:module';
import path from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const require = createRequire(import.meta.url);
const assets = path.dirname(require.resolve('pdfjs-dist/package.json'));
let task;
try {
  task = getDocument({
    data: workerData.data,
    isEvalSupported: false,
    useSystemFonts: false,
    standardFontDataUrl: path.join(assets, 'standard_fonts') + '/',
    cMapUrl: path.join(assets, 'cmaps') + '/',
    cMapPacked: true,
    wasmUrl: path.join(assets, 'wasm') + '/',
    verbosity: 0,
  });
  const document = await task.promise;
  if (!document.numPages || document.numPages > workerData.maxPages) {
    throw new Error(`PDF_PAGE_LIMIT:${workerData.maxPages}`);
  }
  if (workerData.preferText) {
    const texts = [];
    for (let number = 1; number <= document.numPages; number++) {
      const page = await document.getPage(number);
      const content = await page.getTextContent();
      texts.push(content.items.map(item => item.str + (item.hasEOL ? '\n' : ' ')).join('').trim());
      page.cleanup();
    }
    // Require substantial text on EVERY page; scanned/mixed PDFs use all page images.
    if (texts.every(text => text.length >= workerData.minimumTextLength && !text.includes('\uFFFD')) && texts.join('').length <= workerData.maximumTextLength) {
      parentPort.postMessage({ text: texts.map((text, index) => `Page ${index + 1} of ${texts.length}\n${text}`).join('\n\n'), pageCount: document.numPages });
      await task.destroy();
      process.exit(0);
    }
  }
  const pages = [];
  let encodedBytes = 0;
  for (let number = 1; number <= document.numPages; number++) {
    const page = await document.getPage(number);
    const original = page.getViewport({ scale: 1 });
    const scale = Math.min(2, 2200 / Math.max(original.width, original.height));
    const viewport = page.getViewport({ scale });
    const surface = document.canvasFactory.create(Math.ceil(viewport.width), Math.ceil(viewport.height));
    try {
      await page.render({ canvasContext: surface.context, viewport, background: 'rgb(255,255,255)' }).promise;
      const image = `data:image/jpeg;base64,${surface.canvas.toBuffer('image/jpeg', 90).toString('base64')}`;
      encodedBytes += image.length;
      // Leave room for instructions and JSON framing in the provider request.
      if (encodedBytes > 3500000) throw new Error('PDF_IMAGE_LIMIT');
      pages.push(image);
    } finally {
      document.canvasFactory.destroy(surface);
      page.cleanup();
    }
  }
  parentPort.postMessage({ pages, pageCount: document.numPages });
} catch (error) {
  let message = 'This PDF is damaged or unreadable. Try exporting it again or upload clear page images.';
  if (error.name === 'PasswordException') message = 'This PDF is password-protected. Upload a copy without password protection.';
  if (error.message?.startsWith('PDF_PAGE_LIMIT:')) message = `PDF reports can contain up to ${workerData.maxPages} pages. Split a longer report into smaller PDFs and upload each separately.`;
  if (error.message === 'PDF_IMAGE_LIMIT') message = 'The PDF page images are too large to analyze together. Split the report into smaller PDFs.';
  parentPort.postMessage({ error: message });
} finally {
  await task?.destroy();
}
