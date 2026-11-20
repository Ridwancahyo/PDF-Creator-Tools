import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import type { AnnotationOverlay, DiffLine, PdfToolDefinition, ToolCategory } from '../types/pdf';

export interface ParsedPageRangeResult {
  pages: number[]; // 1-based page numbers
  error: string | null;
}

/**
 * Parse a human-friendly page range string such as "1-3, 5, 7-9".
 * Preserves user-specified order and validates against totalPages.
 */
export function parsePageRange(input: string, totalPages: number): ParsedPageRangeResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return { pages: [], error: 'Masukkan rentang halaman, contoh: 1-3, 5.' };
  }
  if (totalPages < 1) {
    return { pages: [], error: 'Dokumen tidak memiliki halaman.' };
  }

  const parts = trimmed.split(',').map((p) => p.trim()).filter(Boolean);
  const pages: number[] = [];
  const seen = new Set<number>();

  for (const part of parts) {
    if (/^\d+$/.test(part)) {
      const page = Number(part);
      if (page < 1 || page > totalPages) {
        return {
          pages: [],
          error: `Halaman ${page} di luar batas dokumen (1–${totalPages}).`,
        };
      }
      if (!seen.has(page)) {
        seen.add(page);
        pages.push(page);
      }
    } else if (/^\d+\s*-\s*\d+$/.test(part)) {
      const [startStr, endStr] = part.split('-').map((s) => s.trim());
      const start = Number(startStr);
      const end = Number(endStr);
      if (start < 1 || end < 1 || start > totalPages || end > totalPages) {
        return {
          pages: [],
          error: `Rentang ${start}-${end} melebihi jumlah halaman (1–${totalPages}).`,
        };
      }
      if (start > end) {
        return {
          pages: [],
          error: `Rentang ${start}-${end} tidak valid (awal lebih besar dari akhir).`,
        };
      }
      for (let p = start; p <= end; p++) {
        if (!seen.has(p)) {
          seen.add(p);
          pages.push(p);
        }
      }
    } else {
      return {
        pages: [],
        error: `Format "${part}" tidak dikenali. Gunakan angka atau rentang seperti 1-3, 5.`,
      };
    }
  }

  return { pages, error: null };
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

export function calculateSavings(originalBytes: number, outputBytes: number): {
  savedBytes: number;
  percentSaved: number;
  isSmaller: boolean;
} {
  if (originalBytes <= 0) {
    return { savedBytes: 0, percentSaved: 0, isSmaller: false };
  }
  const savedBytes = originalBytes - outputBytes;
  const percentSaved = Math.round((savedBytes / originalBytes) * 100);
  return {
    savedBytes,
    percentSaved,
    isSmaller: savedBytes > 0,
  };
}

export function filterTools(
  tools: PdfToolDefinition[],
  category: ToolCategory,
  query: string
): PdfToolDefinition[] {
  const normalizedQuery = query.trim().toLowerCase();
  return tools.filter((tool) => {
    const matchesCategory = category === 'all' || tool.category === category;
    if (!matchesCategory) return false;
    if (!normalizedQuery) return true;
    const haystack = [
      tool.name,
      tool.shortName,
      tool.description,
      tool.categoryLabel,
      ...tool.keywords,
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(normalizedQuery);
  });
}

export function sanitizeFilename(originalName: string, suffix: string, extension: string): string {
  const base = originalName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
  const cleanBase = base || 'dokumen';
  const cleanExt = extension.startsWith('.') ? extension.slice(1) : extension;
  return `${cleanBase}_${suffix}.${cleanExt}`;
}

export function wrapTextLines(text: string, maxChars: number): string[] {
  const paragraphs = text.replace(/\r\n/g, '\n').split('\n');
  const lines: string[] = [];

  for (const para of paragraphs) {
    if (!para.trim()) {
      lines.push('');
      continue;
    }
    const words = para.split(/\s+/);
    let current = '';
    for (const word of words) {
      if (!current) {
        current = word;
      } else if (current.length + 1 + word.length <= maxChars) {
        current += ` ${word}`;
      } else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
  }

  return lines;
}

/**
 * Compute clean line-by-line LCS diff for Compare PDF.
 */
export function computeLineDiff(textA: string, textB: string): DiffLine[] {
  const linesA = textA.replace(/\r\n/g, '\n').split('\n').map((l) => l.trim()).filter(Boolean);
  const linesB = textB.replace(/\r\n/g, '\n').split('\n').map((l) => l.trim()).filter(Boolean);

  const m = linesA.length;
  const n = linesB.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (linesA[i] === linesB[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (linesA[i] === linesB[j]) {
      result.push({ type: 'same', text: linesA[i], lineNumberA: i + 1, lineNumberB: j + 1 });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      result.push({ type: 'removed', text: linesA[i], lineNumberA: i + 1 });
      i++;
    } else {
      result.push({ type: 'added', text: linesB[j], lineNumberB: j + 1 });
      j++;
    }
  }
  while (i < m) {
    result.push({ type: 'removed', text: linesA[i], lineNumberA: i + 1 });
    i++;
  }
  while (j < n) {
    result.push({ type: 'added', text: linesB[j], lineNumberB: j + 1 });
    j++;
  }

  return result;
}

/**
 * Strip unsupported non-WinAnsi characters safely for pdf-lib StandardFonts.
 */
export function toWinAnsiSafe(text: string): string {
  return text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2022/g, '-')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, ' ');
}

/**
 * Generate a crisp, multi-page sample PDF document in memory (for demo testing & unit tests).
 */
export async function buildSamplePdfBytes(
  documentTitle: string,
  sections: Array<{ heading: string; body: string[] }>
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(documentTitle);
  pdfDoc.setAuthor('Ridwan');
  pdfDoc.setCreator('PDF Creator Tools');

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  sections.forEach((section, index) => {
    const page = pdfDoc.addPage([595.28, 841.89]); // A4
    const { width, height } = page.getSize();

    // Subtle header accent bar
    page.drawRectangle({
      x: 48,
      y: height - 56,
      width: width - 96,
      height: 2,
      color: rgb(0.11, 0.31, 0.85),
    });

    page.drawText(toWinAnsiSafe(documentTitle), {
      x: 48,
      y: height - 46,
      size: 10,
      font: fontBold,
      color: rgb(0.11, 0.31, 0.85),
    });

    page.drawText(`Halaman ${index + 1} dari ${sections.length}`, {
      x: width - 145,
      y: height - 46,
      size: 9,
      font: fontRegular,
      color: rgb(0.39, 0.45, 0.55),
    });

    page.drawText(toWinAnsiSafe(section.heading), {
      x: 48,
      y: height - 104,
      size: 20,
      font: fontBold,
      color: rgb(0.06, 0.09, 0.16),
    });

    let cursorY = height - 140;
    for (const para of section.body) {
      const wrapped = wrapTextLines(toWinAnsiSafe(para), 74);
      for (const line of wrapped) {
        if (cursorY < 80) break;
        page.drawText(line, {
          x: 48,
          y: cursorY,
          size: 11.5,
          font: fontRegular,
          color: rgb(0.2, 0.25, 0.33),
        });
        cursorY -= 18;
      }
      cursorY -= 10;
    }

    // Subtle footer line
    page.drawRectangle({
      x: 48,
      y: 52,
      width: width - 96,
      height: 0.75,
      color: rgb(0.88, 0.91, 0.94),
    });
    page.drawText('Dokumen Contoh PDF Creator Tools - Dibuat oleh Ridwan', {
      x: 48,
      y: 36,
      size: 9,
      font: fontRegular,
      color: rgb(0.45, 0.51, 0.6),
    });
  });

  return pdfDoc.save();
}

export async function mergePdfBuffers(buffers: Uint8Array[]): Promise<{
  bytes: Uint8Array;
  pageCount: number;
}> {
  if (buffers.length < 2) {
    throw new Error('Pilih minimal 2 file PDF untuk digabungkan.');
  }
  const merged = await PDFDocument.create();
  for (const buf of buffers) {
    const src = await PDFDocument.load(buf, { ignoreEncryption: true });
    const indices = src.getPageIndices();
    const copied = await merged.copyPages(src, indices);
    copied.forEach((page) => merged.addPage(page));
  }
  const bytes = await merged.save();
  return { bytes, pageCount: merged.getPageCount() };
}

export async function extractPagesFromPdf(
  buffer: Uint8Array,
  oneBasedPages: number[]
): Promise<{ bytes: Uint8Array; pageCount: number }> {
  const src = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const total = src.getPageCount();
  const validIndices = oneBasedPages
    .map((p) => p - 1)
    .filter((idx) => idx >= 0 && idx < total);

  if (validIndices.length === 0) {
    throw new Error('Tidak ada halaman valid yang dipilih.');
  }

  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, validIndices);
  copied.forEach((page) => out.addPage(page));
  return { bytes: await out.save(), pageCount: out.getPageCount() };
}

export async function removePagesFromPdf(
  buffer: Uint8Array,
  oneBasedPagesToRemove: number[]
): Promise<{ bytes: Uint8Array; pageCount: number }> {
  const src = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const total = src.getPageCount();
  const removeSet = new Set(oneBasedPagesToRemove);
  const keepPages: number[] = [];
  for (let p = 1; p <= total; p++) {
    if (!removeSet.has(p)) keepPages.push(p);
  }
  if (keepPages.length === 0) {
    throw new Error('Minimal satu halaman harus dipertahankan dalam dokumen.');
  }
  return extractPagesFromPdf(buffer, keepPages);
}

export async function organizePdfPages(
  buffer: Uint8Array,
  plan: Array<{ originalIndex: number; rotation: number }>
): Promise<{ bytes: Uint8Array; pageCount: number }> {
  if (plan.length === 0) {
    throw new Error('Minimal satu halaman harus tersisa untuk disimpan.');
  }
  const src = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const out = await PDFDocument.create();
  for (const item of plan) {
    const [copied] = await out.copyPages(src, [item.originalIndex]);
    if (item.rotation) {
      const current = copied.getRotation().angle;
      copied.setRotation(degrees((current + item.rotation) % 360));
    }
    out.addPage(copied);
  }
  return { bytes: await out.save(), pageCount: out.getPageCount() };
}

export async function rotatePdfBuffer(
  buffer: Uint8Array,
  angleDegrees: number,
  targetOneBasedPages?: number[]
): Promise<{ bytes: Uint8Array; pageCount: number }> {
  const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const pages = doc.getPages();
  const targetSet =
    targetOneBasedPages && targetOneBasedPages.length > 0
      ? new Set(targetOneBasedPages)
      : null;

  pages.forEach((page, idx) => {
    if (!targetSet || targetSet.has(idx + 1)) {
      const current = page.getRotation().angle;
      page.setRotation(degrees((current + angleDegrees) % 360));
    }
  });

  return { bytes: await doc.save(), pageCount: pages.length };
}

export interface PageNumberOptions {
  position:
    | 'bottom-center'
    | 'bottom-right'
    | 'bottom-left'
    | 'top-center'
    | 'top-right'
    | 'top-left';
  format: 'number' | 'page-of-total' | 'dash-number';
  startNumber: number;
  fontSize: number;
  marginPt: number;
}

export async function addPageNumbersToPdf(
  buffer: Uint8Array,
  options: PageNumberOptions
): Promise<{ bytes: Uint8Array; pageCount: number }> {
  const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  const total = pages.length;

  pages.forEach((page, index) => {
    const { width, height } = page.getSize();
    const num = options.startNumber + index;
    const label =
      options.format === 'page-of-total'
        ? `Halaman ${num} dari ${options.startNumber + total - 1}`
        : options.format === 'dash-number'
          ? `- ${num} -`
          : `${num}`;

    const textWidth = font.widthOfTextAtSize(label, options.fontSize);
    const margin = Math.max(16, options.marginPt);

    let x = (width - textWidth) / 2;
    if (options.position.endsWith('left')) x = margin;
    if (options.position.endsWith('right')) x = width - textWidth - margin;

    const y = options.position.startsWith('top')
      ? height - margin - options.fontSize
      : margin;

    page.drawText(label, {
      x,
      y,
      size: options.fontSize,
      font,
      color: rgb(0.15, 0.23, 0.36),
    });
  });

  return { bytes: await doc.save(), pageCount: total };
}

export interface WatermarkOptions {
  text: string;
  opacity: number; // 0.05..1
  fontSize: number;
  rotation: number; // -90..90
  colorHex: string;
  position: 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'tile';
}

function hexToRgbNormalized(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean.padEnd(6, '0');
  const num = parseInt(full.slice(0, 6), 16);
  return {
    r: ((num >> 16) & 255) / 255,
    g: ((num >> 8) & 255) / 255,
    b: (num & 255) / 255,
  };
}

export async function addWatermarkToPdf(
  buffer: Uint8Array,
  options: WatermarkOptions
): Promise<{ bytes: Uint8Array; pageCount: number }> {
  const safeText = toWinAnsiSafe(options.text.trim());
  if (!safeText) {
    throw new Error('Teks watermark tidak boleh kosong.');
  }
  const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const { r, g, b } = hexToRgbNormalized(options.colorHex || '#1d4ed8');
  const pages = doc.getPages();

  pages.forEach((page) => {
    const { width, height } = page.getSize();
    const textWidth = font.widthOfTextAtSize(safeText, options.fontSize);

    if (options.position === 'tile') {
      const stepX = Math.max(textWidth + 70, 200);
      const stepY = Math.max(options.fontSize * 3.5, 140);
      for (let y = 60; y < height; y += stepY) {
        for (let x = 30; x < width; x += stepX) {
          page.drawText(safeText, {
            x,
            y,
            size: options.fontSize,
            font,
            color: rgb(r, g, b),
            opacity: options.opacity,
            rotate: degrees(options.rotation),
          });
        }
      }
      return;
    }

    let x = width / 2 - textWidth / 2;
    let y = height / 2 - options.fontSize / 2;
    if (options.position === 'top-left') {
      x = 48;
      y = height - 72;
    } else if (options.position === 'top-right') {
      x = Math.max(48, width - textWidth - 48);
      y = height - 72;
    } else if (options.position === 'bottom-left') {
      x = 48;
      y = 56;
    } else if (options.position === 'bottom-right') {
      x = Math.max(48, width - textWidth - 48);
      y = 56;
    }

    page.drawText(safeText, {
      x,
      y,
      size: options.fontSize,
      font,
      color: rgb(r, g, b),
      opacity: options.opacity,
      rotate: degrees(options.rotation),
    });
  });

  return { bytes: await doc.save(), pageCount: pages.length };
}

export interface CropMarginsMm {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export async function cropPdfBuffer(
  buffer: Uint8Array,
  marginsMm: CropMarginsMm
): Promise<{ bytes: Uint8Array; pageCount: number }> {
  const MM_TO_PT = 2.83465;
  const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const pages = doc.getPages();

  pages.forEach((page) => {
    const { width, height } = page.getSize();
    const left = Math.max(0, marginsMm.left * MM_TO_PT);
    const right = Math.max(0, marginsMm.right * MM_TO_PT);
    const top = Math.max(0, marginsMm.top * MM_TO_PT);
    const bottom = Math.max(0, marginsMm.bottom * MM_TO_PT);

    const newWidth = Math.max(72, width - left - right);
    const newHeight = Math.max(72, height - top - bottom);
    page.setCropBox(left, bottom, newWidth, newHeight);
    page.setMediaBox(left, bottom, newWidth, newHeight);
  });

  return { bytes: await doc.save(), pageCount: pages.length };
}

export async function repairPdfBuffer(
  buffer: Uint8Array
): Promise<{ bytes: Uint8Array; pageCount: number }> {
  const src = await PDFDocument.load(buffer, {
    ignoreEncryption: true,
    updateMetadata: false,
  });
  const rebuilt = await PDFDocument.create();
  const copied = await rebuilt.copyPages(src, src.getPageIndices());
  copied.forEach((p) => rebuilt.addPage(p));
  rebuilt.setProducer('PDF Creator Tools Repair Engine');
  const bytes = await rebuilt.save({ useObjectStreams: true });
  return { bytes, pageCount: rebuilt.getPageCount() };
}

export interface ProtectMetadataOptions {
  mode: 'protect' | 'clean-metadata';
  title?: string;
  author?: string;
  subject?: string;
  classificationBanner?: string;
  passwordNote?: string;
}

export async function applySecurityAndMetadataToPdf(
  buffer: Uint8Array,
  options: ProtectMetadataOptions
): Promise<{ bytes: Uint8Array; pageCount: number }> {
  const src = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, src.getPageIndices());
  copied.forEach((p) => out.addPage(p));

  if (options.mode === 'clean-metadata') {
    out.setTitle('');
    out.setAuthor('');
    out.setSubject('');
    out.setKeywords([]);
    out.setProducer('PDF Creator Tools');
    out.setCreator('');
  } else {
    if (options.title) out.setTitle(options.title);
    if (options.author) out.setAuthor(options.author);
    if (options.subject) out.setSubject(options.subject);
    out.setProducer('PDF Creator Tools Security');
    if (options.classificationBanner?.trim()) {
      const font = await out.embedFont(StandardFonts.HelveticaBold);
      const text = toWinAnsiSafe(options.classificationBanner.trim().toUpperCase());
      out.getPages().forEach((page) => {
        const { width, height } = page.getSize();
        const textWidth = font.widthOfTextAtSize(text, 9);
        page.drawRectangle({
          x: 0,
          y: height - 24,
          width,
          height: 24,
          color: rgb(0.93, 0.95, 1),
        });
        page.drawText(text, {
          x: (width - textWidth) / 2,
          y: height - 15,
          size: 9,
          font,
          color: rgb(0.11, 0.31, 0.85),
        });
      });
    }
  }

  return { bytes: await out.save({ useObjectStreams: true }), pageCount: out.getPageCount() };
}

export async function createPdfFromTextDocument(
  title: string,
  rawText: string,
  options?: { landscape?: boolean; subtitle?: string }
): Promise<{ bytes: Uint8Array; pageCount: number }> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(title);
  pdfDoc.setCreator('PDF Creator Tools');

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = options?.landscape ? 841.89 : 595.28;
  const pageHeight = options?.landscape ? 595.28 : 841.89;
  const margin = 52;
  const maxChars = options?.landscape ? 105 : 74;

  const lines = wrapTextLines(toWinAnsiSafe(rawText || 'Dokumen kosong'), maxChars);

  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let cursorY = pageHeight - margin;

  page.drawText(toWinAnsiSafe(title), {
    x: margin,
    y: cursorY,
    size: 18,
    font: fontBold,
    color: rgb(0.06, 0.09, 0.16),
  });
  cursorY -= 24;

  if (options?.subtitle) {
    page.drawText(toWinAnsiSafe(options.subtitle), {
      x: margin,
      y: cursorY,
      size: 10,
      font: fontRegular,
      color: rgb(0.39, 0.45, 0.55),
    });
    cursorY -= 20;
  }

  page.drawRectangle({
    x: margin,
    y: cursorY + 6,
    width: pageWidth - margin * 2,
    height: 1,
    color: rgb(0.84, 0.89, 0.96),
  });
  cursorY -= 18;

  for (const line of lines) {
    if (cursorY < margin + 16) {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      cursorY = pageHeight - margin;
    }
    if (line.length > 0) {
      page.drawText(line, {
        x: margin,
        y: cursorY,
        size: 11,
        font: fontRegular,
        color: rgb(0.15, 0.2, 0.28),
      });
    }
    cursorY -= 16;
  }

  return { bytes: await pdfDoc.save(), pageCount: pdfDoc.getPageCount() };
}

export async function createPdfFromTableRows(
  title: string,
  rows: string[][]
): Promise<{ bytes: Uint8Array; pageCount: number }> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(title);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 841.89; // A4 landscape
  const pageHeight = 595.28;
  const margin = 42;
  const usableWidth = pageWidth - margin * 2;
  const maxCols = Math.max(1, Math.min(8, ...rows.map((r) => Math.max(1, r.length))));
  const colWidth = usableWidth / maxCols;
  const rowHeight = 22;

  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let cursorY = pageHeight - margin;

  page.drawText(toWinAnsiSafe(title), {
    x: margin,
    y: cursorY,
    size: 15,
    font: fontBold,
    color: rgb(0.06, 0.09, 0.16),
  });
  cursorY -= 26;

  rows.forEach((row, rowIndex) => {
    if (cursorY < margin + rowHeight) {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      cursorY = pageHeight - margin;
    }

    const isHeader = rowIndex === 0;
    if (isHeader || rowIndex % 2 === 0) {
      page.drawRectangle({
        x: margin,
        y: cursorY - 5,
        width: usableWidth,
        height: rowHeight,
        color: isHeader ? rgb(0.93, 0.96, 1) : rgb(0.97, 0.98, 0.99),
      });
    }

    for (let c = 0; c < maxCols; c++) {
      const cell = toWinAnsiSafe(String(row[c] ?? '')).slice(0, Math.floor(colWidth / 5.5));
      page.drawText(cell, {
        x: margin + c * colWidth + 6,
        y: cursorY + 2,
        size: isHeader ? 9.5 : 9,
        font: isHeader ? fontBold : fontRegular,
        color: isHeader ? rgb(0.11, 0.31, 0.85) : rgb(0.15, 0.2, 0.28),
      });
    }

    page.drawRectangle({
      x: margin,
      y: cursorY - 5,
      width: usableWidth,
      height: 0.5,
      color: rgb(0.87, 0.9, 0.94),
    });

    cursorY -= rowHeight;
  });

  return { bytes: await pdfDoc.save(), pageCount: pdfDoc.getPageCount() };
}

export async function createPdfFromImageBuffers(
  images: Array<{ bytes: Uint8Array; mimeType: string }>,
  options: {
    pageSize: 'a4' | 'letter' | 'fit';
    orientation: 'portrait' | 'landscape';
    marginMm: number;
  }
): Promise<{ bytes: Uint8Array; pageCount: number }> {
  if (images.length === 0) {
    throw new Error('Pilih minimal satu gambar untuk dikonversi ke PDF.');
  }
  const pdfDoc = await PDFDocument.create();
  const MM_TO_PT = 2.83465;
  const marginPt = Math.max(0, options.marginMm * MM_TO_PT);

  for (const img of images) {
    const embedded =
      img.mimeType === 'image/png'
        ? await pdfDoc.embedPng(img.bytes)
        : await pdfDoc.embedJpg(img.bytes);

    let pageW = embedded.width + marginPt * 2;
    let pageH = embedded.height + marginPt * 2;

    if (options.pageSize === 'a4') {
      pageW = options.orientation === 'landscape' ? 841.89 : 595.28;
      pageH = options.orientation === 'landscape' ? 595.28 : 841.89;
    } else if (options.pageSize === 'letter') {
      pageW = options.orientation === 'landscape' ? 792 : 612;
      pageH = options.orientation === 'landscape' ? 612 : 792;
    }

    const page = pdfDoc.addPage([pageW, pageH]);
    const maxW = Math.max(10, pageW - marginPt * 2);
    const maxH = Math.max(10, pageH - marginPt * 2);
    const scale = Math.min(maxW / embedded.width, maxH / embedded.height);
    const drawW = embedded.width * scale;
    const drawH = embedded.height * scale;

    page.drawImage(embedded, {
      x: (pageW - drawW) / 2,
      y: (pageH - drawH) / 2,
      width: drawW,
      height: drawH,
    });
  }

  return { bytes: await pdfDoc.save(), pageCount: pdfDoc.getPageCount() };
}

function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1] || '';
  const binary = atob(base64);
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    arr[i] = binary.charCodeAt(i);
  }
  return arr;
}

export async function applyAnnotationsToPdf(
  buffer: Uint8Array,
  annotations: AnnotationOverlay[]
): Promise<{ bytes: Uint8Array; pageCount: number }> {
  const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const pages = doc.getPages();

  for (const item of annotations) {
    const page = pages[item.pageIndex];
    if (!page) continue;
    const { width, height } = page.getSize();

    const rectX = item.x * width;
    const rectW = item.width * width;
    const rectH = item.height * height;
    // Convert top-left screen Y to bottom-left PDF Y
    const rectY = height - (item.y + item.height) * height;

    if (item.type === 'redact') {
      page.drawRectangle({
        x: rectX,
        y: rectY,
        width: rectW,
        height: rectH,
        color: rgb(0.04, 0.06, 0.1),
      });
    } else if (item.type === 'highlight') {
      const { r, g, b } = hexToRgbNormalized(item.color || '#93c5fd');
      page.drawRectangle({
        x: rectX,
        y: rectY,
        width: rectW,
        height: rectH,
        color: rgb(r, g, b),
        opacity: 0.38,
      });
    } else if (item.type === 'text' && item.text?.trim()) {
      const { r, g, b } = hexToRgbNormalized(item.color || '#1d4ed8');
      const size = item.fontSize || 14;
      page.drawText(toWinAnsiSafe(item.text.trim()), {
        x: rectX,
        y: height - item.y * height - size,
        size,
        font: fontBold,
        color: rgb(r, g, b),
      });
    } else if (item.type === 'signature' && item.imageDataUrl) {
      const pngBytes = dataUrlToUint8Array(item.imageDataUrl);
      const embedded = await doc.embedPng(pngBytes);
      page.drawImage(embedded, {
        x: rectX,
        y: rectY,
        width: rectW,
        height: rectH,
      });
    }
  }

  return { bytes: await doc.save(), pageCount: pages.length };
}
