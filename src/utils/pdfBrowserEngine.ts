import JSZip from 'jszip';
import mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { PDFDocument } from 'pdf-lib';
import * as XLSX from 'xlsx';
import type { PageItem, ToolId } from '../types/pdf';
import {
  clampPreviewPage,
  computePreviewViewportScale,
} from './pdfPreviewHelpers';
import {
  buildSamplePdfBytes,
  createPdfFromTableRows,
  createPdfFromTextDocument,
  extractPagesFromPdf,
  sanitizeFilename,
} from './pdfHelpers';
import { encryptPdfBytes, type PdfEncryptOptions } from './pdfCrypto';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

function cloneBuffer(data: Uint8Array): Uint8Array {
  return new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
}

export async function getPdfPageCount(data: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(data, { ignoreEncryption: true });
  return doc.getPageCount();
}

export async function isPdfPasswordProtected(data: Uint8Array): Promise<boolean> {
  const loadingTask = pdfjsLib.getDocument({ data: cloneBuffer(data) });
  try {
    await loadingTask.promise;
    return false;
  } catch (err) {
    if (err instanceof Error && err.name === 'PasswordException') {
      return true;
    }
    return false;
  } finally {
    await loadingTask.destroy().catch(() => {});
  }
}

/**
 * Encrypts a PDF with standard ISO 32000-1 RC4-128 password protection.
 */
export async function lockPdfWithPassword(
  data: Uint8Array,
  options: PdfEncryptOptions
): Promise<{ bytes: Uint8Array; pageCount: number }> {
  const doc = await PDFDocument.load(data, { ignoreEncryption: true });
  const pageCount = doc.getPageCount();
  const classicBytes = await doc.save({ useObjectStreams: false });
  const encryptedBytes = encryptPdfBytes(classicBytes, options);
  return { bytes: encryptedBytes, pageCount };
}

/**
 * Verifies the password on an encrypted PDF via pdf.js and rebuilds a clean, unlocked PDF.
 */
export async function unlockPdfWithPassword(
  data: Uint8Array,
  password: string
): Promise<{ bytes: Uint8Array; pageCount: number }> {
  const loadingTask = pdfjsLib.getDocument({
    data: cloneBuffer(data),
    password,
  });

  let pdf: pdfjsLib.PDFDocumentProxy;
  try {
    pdf = await loadingTask.promise;
  } catch (err) {
    await loadingTask.destroy().catch(() => {});
    if (err instanceof Error && err.name === 'PasswordException') {
      throw new Error(
        password.trim()
          ? 'Kata sandi salah. Periksa kembali huruf besar/kecil kata sandi PDF Anda.'
          : 'Dokumen ini dilindungi kata sandi. Masukkan kata sandi untuk membukanya.'
      );
    }
    throw new Error('Gagal membuka PDF. Pastikan berkas PDF valid dan tidak rusak.');
  }

  try {
    const outPdf = await PDFDocument.create();
    const renderScale = 2.0;

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const baseViewport = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: renderScale });

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      }

      const jpegUrl = canvas.toDataURL('image/jpeg', 0.94);
      const bin = atob(jpegUrl.split(',')[1] || '');
      const imgBytes = new Uint8Array(bin.length);
      for (let j = 0; j < bin.length; j++) imgBytes[j] = bin.charCodeAt(j);

      const embedded = await outPdf.embedJpg(imgBytes);
      const newPage = outPdf.addPage([baseViewport.width, baseViewport.height]);
      newPage.drawImage(embedded, {
        x: 0,
        y: 0,
        width: baseViewport.width,
        height: baseViewport.height,
      });
    }

    const bytes = await outPdf.save({ useObjectStreams: true });
    return { bytes, pageCount: pdf.numPages };
  } finally {
    await loadingTask.destroy().catch(() => {});
  }
}

export interface RenderedPdfPagePreview {
  dataUrl: string;
  pageNumber: number;
  totalPages: number;
  widthPt: number;
  heightPt: number;
}

/**
 * Renders a single page (defaults to page 1) of a PDF client-side via pdf.js
 * at an aspect-safe resolution for thumbnail or full-page inspection before processing.
 */
export async function renderPdfPagePreview(
  data: Uint8Array,
  oneBasedPageNumber = 1,
  targetWidthPx = 680
): Promise<RenderedPdfPagePreview> {
  const loadingTask = pdfjsLib.getDocument({ data: cloneBuffer(data) });
  const pdf = await loadingTask.promise;
  try {
    const safePage = clampPreviewPage(oneBasedPageNumber, pdf.numPages);
    const page = await pdf.getPage(safePage);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = computePreviewViewportScale(
      baseViewport.width,
      baseViewport.height,
      targetWidthPx
    );
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    }

    const mime = targetWidthPx <= 240 ? 'image/jpeg' : 'image/png';
    const quality = targetWidthPx <= 240 ? 0.82 : undefined;

    return {
      dataUrl: canvas.toDataURL(mime, quality),
      pageNumber: safePage,
      totalPages: pdf.numPages,
      widthPt: baseViewport.width,
      heightPt: baseViewport.height,
    };
  } finally {
    await loadingTask.destroy();
  }
}

export async function renderPdfThumbnails(
  data: Uint8Array,
  scale = 0.45
): Promise<PageItem[]> {
  const loadingTask = pdfjsLib.getDocument({ data: cloneBuffer(data) });
  const pdf = await loadingTask.promise;
  const items: PageItem[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    }
    const baseViewport = page.getViewport({ scale: 1 });
    items.push({
      id: `page-${i}-${Math.random().toString(36).slice(2, 7)}`,
      originalIndex: i - 1,
      pageNumber: i,
      rotation: 0,
      selected: false,
      thumbnailUrl: canvas.toDataURL('image/jpeg', 0.82),
      width: baseViewport.width,
      height: baseViewport.height,
    });
  }

  return items;
}

export async function renderSinglePdfPageHighRes(
  data: Uint8Array,
  oneBasedPageNumber: number,
  scale = 1.4
): Promise<{ dataUrl: string; width: number; height: number }> {
  const loadingTask = pdfjsLib.getDocument({ data: cloneBuffer(data) });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(Math.min(Math.max(1, oneBasedPageNumber), pdf.numPages));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  }
  return {
    dataUrl: canvas.toDataURL('image/png'),
    width: canvas.width,
    height: canvas.height,
  };
}

export async function extractPdfTextPages(data: Uint8Array): Promise<string[]> {
  const loadingTask = pdfjsLib.getDocument({ data: cloneBuffer(data) });
  const pdf = await loadingTask.promise;
  const pageTexts: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const linesByY = new Map<number, Array<{ x: number; str: string }>>();

    for (const item of content.items) {
      if ('str' in item && item.str.trim()) {
        const transform = item.transform as number[];
        const yKey = Math.round(transform[5] / 6) * 6;
        const xVal = transform[4];
        const bucket = linesByY.get(yKey) || [];
        bucket.push({ x: xVal, str: item.str });
        linesByY.set(yKey, bucket);
      }
    }

    const sortedYs = Array.from(linesByY.keys()).sort((a, b) => b - a);
    const lines = sortedYs.map((y) =>
      (linesByY.get(y) || [])
        .sort((a, b) => a.x - b.x)
        .map((chunk) => chunk.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
    );
    pageTexts.push(lines.join('\n'));
  }

  return pageTexts;
}

export async function compressPdfInBrowser(
  data: Uint8Array,
  level: 'low' | 'recommended' | 'extreme'
): Promise<{ bytes: Uint8Array; pageCount: number }> {
  // First try lossless structure optimization
  const losslessDoc = await PDFDocument.load(data, { ignoreEncryption: true });
  const losslessBytes = await losslessDoc.save({ useObjectStreams: true });
  const pageCount = losslessDoc.getPageCount();

  if (level === 'low') {
    return {
      bytes: losslessBytes.length <= data.length ? losslessBytes : data,
      pageCount,
    };
  }

  // Rasterize with balanced JPEG quality for recommended / extreme compression
  const scale = level === 'extreme' ? 0.95 : 1.25;
  const quality = level === 'extreme' ? 0.45 : 0.68;

  const loadingTask = pdfjsLib.getDocument({ data: cloneBuffer(data) });
  const pdf = await loadingTask.promise;
  const outPdf = await PDFDocument.create();

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const baseViewport = page.getViewport({ scale: 1 });
    const renderViewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(renderViewport.width));
    canvas.height = Math.max(1, Math.floor(renderViewport.height));
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: renderViewport, canvas }).promise;
    }

    const jpegDataUrl = canvas.toDataURL('image/jpeg', quality);
    const base64 = jpegDataUrl.split(',')[1] || '';
    const bin = atob(base64);
    const imgBytes = new Uint8Array(bin.length);
    for (let j = 0; j < bin.length; j++) imgBytes[j] = bin.charCodeAt(j);

    const embedded = await outPdf.embedJpg(imgBytes);
    const newPage = outPdf.addPage([baseViewport.width, baseViewport.height]);
    newPage.drawImage(embedded, {
      x: 0,
      y: 0,
      width: baseViewport.width,
      height: baseViewport.height,
    });
  }

  const rasterBytes = await outPdf.save({ useObjectStreams: true });
  // Choose whichever is genuinely smaller while keeping extreme compression honored if smaller than original
  const bestBytes =
    rasterBytes.length < losslessBytes.length ? rasterBytes : losslessBytes;

  return { bytes: bestBytes, pageCount };
}

export async function splitPdfIntoZip(
  data: Uint8Array,
  originalName: string,
  groups: number[][]
): Promise<{ blob: Blob; filename: string; fileCount: number }> {
  if (groups.length === 1) {
    const { bytes } = await extractPagesFromPdf(data, groups[0]);
    const pdfBlob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
    return {
      blob: pdfBlob,
      filename: sanitizeFilename(originalName, 'pisah', 'pdf'),
      fileCount: 1,
    };
  }

  const zip = new JSZip();
  for (let i = 0; i < groups.length; i++) {
    const pages = groups[i];
    const { bytes } = await extractPagesFromPdf(data, pages);
    const label =
      pages.length === 1
        ? `halaman_${pages[0]}`
        : `bagian_${i + 1}_hal_${pages[0]}-${pages[pages.length - 1]}`;
    zip.file(sanitizeFilename(originalName, label, 'pdf'), bytes);
  }
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  return {
    blob: zipBlob,
    filename: sanitizeFilename(originalName, 'terpisah', 'zip'),
    fileCount: groups.length,
  };
}

export async function convertPdfToImages(
  data: Uint8Array,
  originalName: string,
  format: 'jpeg' | 'png',
  dpiScale: number
): Promise<{ blob: Blob; filename: string; pageCount: number; previewUrl?: string; mimeType: string }> {
  const loadingTask = pdfjsLib.getDocument({ data: cloneBuffer(data) });
  const pdf = await loadingTask.promise;
  const mime = format === 'png' ? 'image/png' : 'image/jpeg';
  const ext = format === 'png' ? 'png' : 'jpg';

  const rendered: Array<{ blob: Blob; dataUrl: string; page: number }> = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: dpiScale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    }
    const dataUrl = canvas.toDataURL(mime, 0.92);
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    rendered.push({ blob, dataUrl, page: i });
  }

  if (rendered.length === 1) {
    return {
      blob: rendered[0].blob,
      filename: sanitizeFilename(originalName, 'halaman_1', ext),
      pageCount: 1,
      previewUrl: rendered[0].dataUrl,
      mimeType: mime,
    };
  }

  const zip = new JSZip();
  for (const item of rendered) {
    zip.file(sanitizeFilename(originalName, `halaman_${item.page}`, ext), item.blob);
  }
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  return {
    blob: zipBlob,
    filename: sanitizeFilename(originalName, `gambar_${ext}`, 'zip'),
    pageCount: rendered.length,
    previewUrl: rendered[0]?.dataUrl,
    mimeType: 'application/zip',
  };
}

export async function convertPdfToWordDoc(
  data: Uint8Array,
  originalName: string
): Promise<{ blob: Blob; filename: string; pageCount: number }> {
  const pages = await extractPdfTextPages(data);
  const escapeHtml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const bodyHtml = pages
    .map((text, idx) => {
      const paragraphs = text
        .split('\n')
        .filter(Boolean)
        .map((line) => `<p style="margin:0 0 8pt 0;line-height:1.5;">${escapeHtml(line)}</p>`)
        .join('');
      const pageBreak = idx < pages.length - 1 ? '<br clear="all" style="page-break-before:always" />' : '';
      return `<section><p style="color:#1d4ed8;font-size:9pt;margin-bottom:10pt;">Halaman ${idx + 1}</p>${paragraphs || '<p>(Halaman tanpa teks yang dapat diekstrak)</p>'}</section>${pageBreak}`;
    })
    .join('\n');

  const wordDocument = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${escapeHtml(originalName)}</title></head>
<body style="font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#0f172a;">
${bodyHtml}
</body></html>`;

  const blob = new Blob(['\ufeff', wordDocument], { type: 'application/msword' });
  return {
    blob,
    filename: sanitizeFilename(originalName, 'word', 'doc'),
    pageCount: pages.length,
  };
}

export async function convertPdfToExcelXlsx(
  data: Uint8Array,
  originalName: string
): Promise<{ blob: Blob; filename: string; pageCount: number }> {
  const pages = await extractPdfTextPages(data);
  const wb = XLSX.utils.book_new();

  pages.forEach((pageText, index) => {
    const rows = pageText
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        if (line.includes('\t')) return line.split('\t');
        if (line.includes('  ')) return line.split(/\s{2,}/);
        return [line];
      });
    const sheetData = rows.length > 0 ? rows : [['(Tidak ada data teks terdeteksi pada halaman ini)']];
    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    XLSX.utils.book_append_sheet(wb, ws, `Halaman_${index + 1}`);
  });

  const arrayBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([arrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  return {
    blob,
    filename: sanitizeFilename(originalName, 'excel', 'xlsx'),
    pageCount: pages.length,
  };
}

/**
 * Generate a real OOXML PowerPoint (.pptx) presentation where each PDF page becomes a slide.
 */
export async function convertPdfToPptx(
  data: Uint8Array,
  originalName: string
): Promise<{ blob: Blob; filename: string; pageCount: number }> {
  const loadingTask = pdfjsLib.getDocument({ data: cloneBuffer(data) });
  const pdf = await loadingTask.promise;
  const zip = new JSZip();

  const slideCount = pdf.numPages;

  // Render pages to JPEG bytes
  const slideImages: Uint8Array[] = [];
  for (let i = 1; i <= slideCount; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    }
    const jpegUrl = canvas.toDataURL('image/jpeg', 0.88);
    const bin = atob(jpegUrl.split(',')[1] || '');
    const bytes = new Uint8Array(bin.length);
    for (let j = 0; j < bin.length; j++) bytes[j] = bin.charCodeAt(j);
    slideImages.push(bytes);
  }

  const slideOverrides = slideImages
    .map(
      (_, i) =>
        `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`
    )
    .join('');

  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="jpeg" ContentType="image/jpeg"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  ${slideOverrides}
</Types>`
  );

  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`
  );

  const sldIdList = slideImages
    .map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 1}"/>`)
    .join('');

  zip.file(
    'ppt/presentation.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldIdLst>${sldIdList}</p:sldIdLst>
  <p:sldSz cx="9144000" cy="6858000" type="screen4x3"/>
  <p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`
  );

  const presRels = slideImages
    .map(
      (_, i) =>
        `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`
    )
    .join('');

  zip.file(
    'ppt/_rels/presentation.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${presRels}
</Relationships>`
  );

  slideImages.forEach((imgBytes, idx) => {
    const n = idx + 1;
    zip.file(`ppt/media/image${n}.jpeg`, imgBytes);
    zip.file(
      `ppt/slides/_rels/slide${n}.xml.rels`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image${n}.jpeg"/>
</Relationships>`
    );
    zip.file(
      `ppt/slides/slide${n}.xml`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      <p:pic>
        <p:nvPicPr><p:cNvPr id="2" name="Slide ${n}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>
        <p:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>
        <p:spPr><a:xfrm><a:off x="457200" y="228600"/><a:ext cx="8229600" cy="6400800"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
      </p:pic>
    </p:spTree>
  </p:cSld>
</p:sld>`
    );
  });

  const blob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  });
  return {
    blob,
    filename: sanitizeFilename(originalName, 'presentasi', 'pptx'),
    pageCount: slideCount,
  };
}

export async function convertWordFileToPdf(
  file: File
): Promise<{ bytes: Uint8Array; pageCount: number }> {
  const lower = file.name.toLowerCase();
  let text = '';
  if (lower.endsWith('.docx')) {
    const arrayBuffer = await file.arrayBuffer();
    const res = await mammoth.extractRawText({ arrayBuffer });
    text = res.value || 'Dokumen Word tidak memiliki teks.';
  } else {
    text = await file.text();
  }
  const title = file.name.replace(/\.[^/.]+$/, '');
  return createPdfFromTextDocument(title, text, {
    subtitle: `Dikonversi dari ${file.name} melalui PDF Creator Tools`,
  });
}

export async function convertExcelFileToPdf(
  file: File
): Promise<{ bytes: Uint8Array; pageCount: number }> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const firstSheet = wb.SheetNames[0];
  const sheet = wb.Sheets[firstSheet];
  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
  const rows = rawRows
    .filter((r) => Array.isArray(r) && r.length > 0)
    .map((r) => r.map((cell) => String(cell ?? '')));
  const title = `${file.name.replace(/\.[^/.]+$/, '')} — ${firstSheet || 'Sheet1'}`;
  return createPdfFromTableRows(title, rows.length > 0 ? rows : [['Lembar kerja kosong']]);
}

export async function convertPptxFileToPdf(
  file: File
): Promise<{ bytes: Uint8Array; pageCount: number }> {
  const buf = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);
  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => {
      const na = Number(a.match(/slide(\d+)\.xml/i)?.[1] || 0);
      const nb = Number(b.match(/slide(\d+)\.xml/i)?.[1] || 0);
      return na - nb;
    });

  const slideTexts: string[] = [];
  for (let i = 0; i < slideFiles.length; i++) {
    const xml = await zip.files[slideFiles[i]].async('string');
    const matches = Array.from(xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)).map((m) =>
      m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    );
    slideTexts.push(`Slide ${i + 1}\n${matches.join(' ').trim() || '(Slide visual)'}`);
  }

  const combined =
    slideTexts.length > 0
      ? slideTexts.join('\n\n----------------------------------------\n\n')
      : 'Tidak ada teks slide yang terdeteksi pada file PowerPoint ini.';

  return createPdfFromTextDocument(file.name.replace(/\.[^/.]+$/, ''), combined, {
    landscape: true,
    subtitle: `${slideFiles.length || 1} Slide Presentasi — Dikonversi oleh PDF Creator Tools`,
  });
}

export async function convertHtmlContentToPdf(
  htmlString: string,
  title: string
): Promise<{ bytes: Uint8Array; pageCount: number }> {
  const parser = new DOMParser();
  const parsed = parser.parseFromString(htmlString, 'text/html');
  parsed.querySelectorAll('script, style').forEach((el) => el.remove());
  const extractedText = (parsed.body?.innerText || parsed.body?.textContent || htmlString)
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return createPdfFromTextDocument(title || 'Dokumen HTML', extractedText, {
    subtitle: 'Dikonversi dari HTML melalui PDF Creator Tools',
  });
}

export async function normalizeImageFileToBuffer(
  file: File
): Promise<{ bytes: Uint8Array; mimeType: 'image/jpeg' | 'image/png' }> {
  if (file.type === 'image/png' || file.type === 'image/jpeg') {
    const buf = new Uint8Array(await file.arrayBuffer());
    return { bytes: buf, mimeType: file.type };
  }
  // Convert WebP or other browser-supported image formats to PNG via canvas
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  ctx?.drawImage(bitmap, 0, 0);
  const dataUrl = canvas.toDataURL('image/png');
  const bin = atob(dataUrl.split(',')[1] || '');
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, mimeType: 'image/png' };
}

function createCanvasSampleImage(title: string, subtitle: string, accent: string): Promise<File> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = 960;
    canvas.height = 640;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, 960, 640);
      ctx.fillStyle = accent;
      ctx.fillRect(64, 64, 832, 12);
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 42px sans-serif';
      ctx.fillText(title, 64, 170);
      ctx.fillStyle = '#475569';
      ctx.font = '24px sans-serif';
      ctx.fillText(subtitle, 64, 224);

      // Minimal architectural blue bars graphic
      ctx.fillStyle = '#dbeafe';
      ctx.fillRect(64, 300, 240, 220);
      ctx.fillStyle = '#93c5fd';
      ctx.fillRect(340, 350, 240, 170);
      ctx.fillStyle = '#2563eb';
      ctx.fillRect(616, 280, 280, 240);
    }
    canvas.toBlob((blob) => {
      resolve(
        new File([blob || new Uint8Array()], `${title.toLowerCase().replace(/\s+/g, '_')}.png`, {
          type: 'image/png',
        })
      );
    }, 'image/png');
  });
}

/**
 * Generates real, deterministic sample files for ANY of the 25 tools so users can try any tool with one click.
 */
export async function generateSampleFilesForTool(toolId: ToolId): Promise<File[]> {
  if (toolId === 'merge') {
    const bytesA = await buildSamplePdfBytes('Proposal Proyek PDF Creator Tools - Bagian 1', [
      {
        heading: 'Ringkasan Eksekutif',
        body: [
          'Dokumen ini menyajikan rencana implementasi sistem manajemen arsip digital yang aman, ringan, dan nyaman digunakan oleh seluruh tim operasional.',
          'Seluruh pemrosesan dilakukan secara lokal di perangkat pengguna sehingga data sensitif tetap berada di bawah kendali penuh.',
        ],
      },
      {
        heading: 'Ruang Lingkup Pekerjaan',
        body: [
          'Tahap pertama mencakup penggabungan dokumen laporan bulanan, penomoran otomatis, serta standardisasi ukuran kertas A4.',
        ],
      },
    ]);
    const bytesB = await buildSamplePdfBytes('Lampiran Keuangan - Bagian 2', [
      {
        heading: 'Lampiran Anggaran & Jadwal',
        body: [
          'Estimasi waktu penyelesaian proyek adalah 4 minggu kerja dengan peninjauan mutu setiap akhir pekan.',
          'Dokumen ini disiapkan sebagai lampiran resmi untuk digabungkan dengan proposal utama.',
        ],
      },
    ]);
    return [
      new File([bytesA as BlobPart], 'Proposal_Proyek_Bagian_1.pdf', { type: 'application/pdf' }),
      new File([bytesB as BlobPart], 'Lampiran_Keuangan_Bagian_2.pdf', { type: 'application/pdf' }),
    ];
  }

  if (toolId === 'compare-pdf') {
    const bytesV1 = await buildSamplePdfBytes('Perjanjian Kerja Sama - Versi 1', [
      {
        heading: 'Pasal 1: Ketentuan Umum',
        body: [
          'Pihak Pertama dan Pihak Kedua sepakat melaksanakan kerja sama pengelolaan dokumen digital selama 12 bulan.',
          'Biaya layanan bulanan ditetapkan sebesar Rp 4.500.000 dibayarkan setiap tanggal 5.',
          'Seluruh hak cipta antarmuka dimiliki oleh Ridwan.',
        ],
      },
    ]);
    const bytesV2 = await buildSamplePdfBytes('Perjanjian Kerja Sama - Versi 2 (Revisi)', [
      {
        heading: 'Pasal 1: Ketentuan Umum',
        body: [
          'Pihak Pertama dan Pihak Kedua sepakat melaksanakan kerja sama pengelolaan dokumen digital selama 24 bulan.',
          'Biaya layanan bulanan ditetapkan sebesar Rp 4.250.000 dibayarkan setiap tanggal 10.',
          'Seluruh hak cipta antarmuka dimiliki oleh Ridwan.',
          'Tambahan klausul: Pembaruan keamanan berkala disertakan tanpa biaya tambahan.',
        ],
      },
    ]);
    return [
      new File([bytesV1 as BlobPart], 'Perjanjian_Versi_1.pdf', { type: 'application/pdf' }),
      new File([bytesV2 as BlobPart], 'Perjanjian_Versi_2_Revisi.pdf', { type: 'application/pdf' }),
    ];
  }

  if (toolId === 'jpg-to-pdf' || toolId === 'image-convert') {
    const img1 = await createCanvasSampleImage(
      'Laporan Visual Q1',
      'Ringkasan Kinerja Operasional - PDF Creator Tools',
      '#1d4ed8'
    );
    const img2 = await createCanvasSampleImage(
      'Ringkasan Desain Q2',
      'Evaluasi Kualitas & Efisiensi Dokumen',
      '#2563eb'
    );
    return [img1, img2];
  }

  if (toolId === 'image-upscale' || toolId === 'image-resize') {
    const sample = await createCanvasSampleImage(
      'Poster Produk HD',
      'Contoh Gambar 960 x 640 px — PDF Creator Tools',
      '#1d4ed8'
    );
    return [sample];
  }

  if (toolId === 'heic-convert') {
    const sample = await createCanvasSampleImage(
      'Foto Mobile iOS',
      'Contoh Simulasi Konversi Foto ke JPG / PNG / PDF',
      '#2563eb'
    );
    return [sample];
  }

  if (toolId === 'unlock-pdf') {
    const rawBytes = await buildSamplePdfBytes('Dokumen Terkunci Contoh — PDF Creator Tools', [
      {
        heading: '1. Dokumen Rahasia Terenkripsi',
        body: [
          'Dokumen contoh ini telah dienkripsi dengan standar keamanan PDF RC4-128 bit.',
          'Setelah Anda memasukkan kata sandi contoh "ridwan123", PDF Creator Tools akan membuka kunci dan menghasilkan versi bebas sandi.',
        ],
      },
      {
        heading: '2. Verifikasi Dekripsi Berhasil',
        body: [
          'Jika Anda dapat membaca halaman kedua ini pada hasil unduhan, maka proses buka kunci PDF telah berjalan sempurna 100 persen lokal di browser.',
        ],
      },
    ]);
    const { bytes } = await lockPdfWithPassword(rawBytes, {
      userPassword: 'ridwan123',
      ownerPassword: 'ridwan123',
      allowPrint: true,
      allowCopy: true,
    });
    return [
      new File([bytes as BlobPart], 'Dokumen_Terkunci_Contoh.pdf', {
        type: 'application/pdf',
      }),
    ];
  }

  if (toolId === 'word-to-pdf') {
    const textContent = `LAPORAN SINGKAT PROYEK DIGITALISASI ARSIP\nDisusun oleh: Ridwan\n\n1. Latar Belakang\nTransformasi pengelolaan berkas ke format PDF memudahkan distribusi lintas perangkat tanpa mengubah tata letak dokumen.\n\n2. Tujuan Utama\nMenyediakan alat olah dokumen yang cepat, tenang secara visual, dan menjaga kerahasiaan data pengguna secara penuh di sisi browser.\n\n3. Kesimpulan\nDengan antarmuka bernuansa biru yang minimalis, pengguna dapat menyelesaikan penggabungan, pemisahan, dan konversi berkas dalam hitungan detik.`;
    return [new File([textContent], 'Laporan_Proyek_Ridwan.txt', { type: 'text/plain' })];
  }

  if (toolId === 'excel-to-pdf') {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ['Kode', 'Divisi', 'Jumlah Dokumen', 'Ukuran Rata-rata', 'Status'],
      ['DOC-01', 'Keuangan', '128 Berkas', '1.4 MB', 'Terverifikasi'],
      ['DOC-02', 'Operasional', '214 Berkas', '2.1 MB', 'Terverifikasi'],
      ['DOC-03', 'Sumber Daya Manusia', '86 Berkas', '0.9 MB', 'Dalam Tinjauan'],
      ['DOC-04', 'Pemasaran', '152 Berkas', '3.6 MB', 'Terverifikasi'],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, 'Rekap_Arsip');
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    return [
      new File([out], 'Rekap_Arsip_2026.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    ];
  }

  if (toolId === 'ppt-to-pdf') {
    const zip = new JSZip();
    zip.file(
      'ppt/slides/slide1.xml',
      `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Strategi Arsip Digital 2026 - Disusun oleh Ridwan</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`
    );
    zip.file(
      'ppt/slides/slide2.xml',
      `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Target Utama: Efisiensi alur kerja PDF 100 persen lokal di browser dengan desain minimalis biru.</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`
    );
    const blob = await zip.generateAsync({ type: 'blob' });
    return [
      new File([blob], 'Presentasi_Strategi_2026.pptx', {
        type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      }),
    ];
  }

  if (toolId === 'html-to-pdf') {
    const html = `<!doctype html><html><body><h1>Panduan Standar Dokumen PDF Creator Tools</h1><p>Dokumen ini adalah contoh berkas HTML yang siap dikonversi menjadi PDF secara langsung.</p><h2>Prinsip Utama</h2><p>1. Tata letak bersih dan mudah dibaca di seluruh perangkat.</p><p>2. Pemrosesan dilakukan penuh di sisi klien tanpa mengunggah file ke server luar.</p><p>Hak Cipta: Dibuat oleh Ridwan.</p></body></html>`;
    return [new File([html], 'Panduan_Dokumen.html', { type: 'text/html' })];
  }

  // Default 4-page sample PDF for all other single-PDF tools
  const bytes = await buildSamplePdfBytes('Laporan Tahunan PDF Creator Tools 2026', [
    {
      heading: '1. Pengantar & Ringkasan',
      body: [
        'Selamat datang di dokumen contoh PDF Creator Tools. Dokumen empat halaman ini dirancang untuk menguji fitur pemisahan, penghapusan, rotasi, kompresi, watermark, nomor halaman, tanda tangan, serta sensor teks.',
        'Semua perubahan diterapkan secara nyata pada struktur berkas PDF dan dapat langsung Anda unduh hasilnya.',
      ],
    },
    {
      heading: '2. Rekapitulasi Data Operasional',
      body: [
        'Divisi Keuangan: 128 berkas terverifikasi pada kuartal pertama dengan penghematan ruang penyimpanan sebesar 38 persen.',
        'Divisi Operasional: 214 berkas kontrak telah ditandatangani secara digital dan diarsipkan dengan standar penamaan baku.',
      ],
    },
    {
      heading: '3. Catatan Keamanan & Informasi Rahasia',
      body: [
        'Nomor Referensi Internal: ID-2026-884910-RDW.',
        'Kontak Penanggung Jawab: Ridwan — Tim Pengelolaan Dokumen Digital.',
        'Gunakan alat Sensor PDF atau Watermark untuk melindungi bagian sensitif sebelum dibagikan ke pihak eksternal.',
      ],
    },
    {
      heading: '4. Lembar Pengesahan',
      body: [
        'Dengan menandatangani halaman ini, seluruh isi laporan dinyatakan sah dan siap didistribusikan.',
        'Ruang tanda tangan resmi tersedia di bagian bawah halaman ini untuk pengujian alat Tanda Tangan PDF.',
      ],
    },
  ]);

  return [new File([bytes as BlobPart], 'Laporan_Tahunan_2026.pdf', { type: 'application/pdf' })];
}
