import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { PDF_TOOLS } from '../data/tools';
import {
  addPageNumbersToPdf,
  addWatermarkToPdf,
  applySecurityAndMetadataToPdf,
  buildSamplePdfBytes,
  calculateSavings,
  computeLineDiff,
  createPdfFromTableRows,
  createPdfFromTextDocument,
  cropPdfBuffer,
  extractPagesFromPdf,
  filterTools,
  formatFileSize,
  mergePdfBuffers,
  organizePdfPages,
  parsePageRange,
  removePagesFromPdf,
  repairPdfBuffer,
  rotatePdfBuffer,
  sanitizeFilename,
} from './pdfHelpers';

test('parsePageRange parses single pages, ranges, and rejects invalid ranges', () => {
  const valid = parsePageRange('1-3, 5, 2', 6);
  assert.equal(valid.error, null);
  assert.deepEqual(valid.pages, [1, 2, 3, 5]);

  const outOfBounds = parsePageRange('1-8', 5);
  assert.ok(outOfBounds.error !== null);
  assert.deepEqual(outOfBounds.pages, []);

  const reversed = parsePageRange('4-2', 5);
  assert.ok(reversed.error !== null);

  const empty = parsePageRange('   ', 5);
  assert.ok(empty.error !== null);
});

test('formatFileSize and calculateSavings format values accurately', () => {
  assert.equal(formatFileSize(512), '512 B');
  assert.equal(formatFileSize(2048), '2.0 KB');
  assert.equal(formatFileSize(1024 * 1024 * 2.5), '2.50 MB');

  const savings = calculateSavings(1000, 650);
  assert.equal(savings.savedBytes, 350);
  assert.equal(savings.percentSaved, 35);
  assert.equal(savings.isSmaller, true);
});

test('filterTools filters by category and Indonesian/English search query', () => {
  const all = filterTools(PDF_TOOLS, 'all', '');
  assert.equal(all.length, PDF_TOOLS.length);

  const convertToPdf = filterTools(PDF_TOOLS, 'convert-to-pdf', '');
  assert.ok(convertToPdf.length >= 5);
  assert.ok(convertToPdf.every((t) => t.category === 'convert-to-pdf'));

  const searchKompres = filterTools(PDF_TOOLS, 'all', 'kompres');
  assert.equal(searchKompres.length, 1);
  assert.equal(searchKompres[0].id, 'compress');

  const searchEnglish = filterTools(PDF_TOOLS, 'all', 'watermark');
  assert.equal(searchEnglish[0].id, 'watermark');
});

test('computeLineDiff detects unchanged, removed, and added lines', () => {
  const diff = computeLineDiff('Baris 1\nBaris 2 lama\nBaris 3', 'Baris 1\nBaris 2 baru\nBaris 3\nBaris 4');
  assert.equal(diff.some((d) => d.type === 'same' && d.text === 'Baris 1'), true);
  assert.equal(diff.some((d) => d.type === 'removed' && d.text === 'Baris 2 lama'), true);
  assert.equal(diff.some((d) => d.type === 'added' && d.text === 'Baris 2 baru'), true);
  assert.equal(diff.some((d) => d.type === 'added' && d.text === 'Baris 4'), true);
});

test('sanitizeFilename produces safe downloadable file names', () => {
  assert.equal(sanitizeFilename('Laporan Akhir (2026).pdf', 'kompres', 'pdf'), 'Laporan_Akhir_2026_kompres.pdf');
});

test('real pdf-lib operations: merge, extract, remove, organize, rotate, watermark, page numbers, crop, repair, protect', async () => {
  const pdfA = await buildSamplePdfBytes('Dokumen A', [
    { heading: 'Bab 1', body: ['Isi bab satu untuk pengujian PDF Creator Tools.'] },
    { heading: 'Bab 2', body: ['Isi bab dua untuk pengujian PDF Creator Tools.'] },
  ]);
  const pdfB = await buildSamplePdfBytes('Dokumen B', [
    { heading: 'Lampiran', body: ['Isi lampiran dokumen kedua.'] },
  ]);

  // Merge
  const merged = await mergePdfBuffers([pdfA, pdfB]);
  assert.equal(merged.pageCount, 3);

  // Extract
  const extracted = await extractPagesFromPdf(merged.bytes, [1, 3]);
  assert.equal(extracted.pageCount, 2);

  // Remove
  const removed = await removePagesFromPdf(merged.bytes, [2]);
  assert.equal(removed.pageCount, 2);

  // Organize (reverse + rotate)
  const organized = await organizePdfPages(merged.bytes, [
    { originalIndex: 2, rotation: 90 },
    { originalIndex: 0, rotation: 0 },
  ]);
  assert.equal(organized.pageCount, 2);
  const orgDoc = await PDFDocument.load(organized.bytes);
  assert.equal(orgDoc.getPage(0).getRotation().angle, 90);

  // Rotate
  const rotated = await rotatePdfBuffer(pdfA, 180, [1]);
  const rotDoc = await PDFDocument.load(rotated.bytes);
  assert.equal(rotDoc.getPage(0).getRotation().angle, 180);
  assert.equal(rotDoc.getPage(1).getRotation().angle, 0);

  // Page Numbers & Watermark & Crop & Repair & Protect
  const numbered = await addPageNumbersToPdf(pdfA, {
    position: 'bottom-center',
    format: 'page-of-total',
    startNumber: 1,
    fontSize: 10,
    marginPt: 24,
  });
  assert.equal(numbered.pageCount, 2);

  const watermarked = await addWatermarkToPdf(pdfA, {
    text: 'RAHASIA RIDWAN',
    opacity: 0.25,
    fontSize: 42,
    rotation: 45,
    colorHex: '#1d4ed8',
    position: 'center',
  });
  assert.equal(watermarked.pageCount, 2);

  const cropped = await cropPdfBuffer(pdfA, { top: 10, right: 10, bottom: 10, left: 10 });
  const cropDoc = await PDFDocument.load(cropped.bytes);
  assert.ok(cropDoc.getPage(0).getWidth() < 595);

  const repaired = await repairPdfBuffer(pdfA);
  assert.equal(repaired.pageCount, 2);

  const protectedPdf = await applySecurityAndMetadataToPdf(pdfA, {
    mode: 'protect',
    title: 'Dokumen Resmi',
    author: 'Ridwan',
    classificationBanner: 'INTERNAL PERUSAHAAN',
  });
  const protDoc = await PDFDocument.load(protectedPdf.bytes);
  assert.equal(protDoc.getTitle(), 'Dokumen Resmi');
  assert.equal(protDoc.getAuthor(), 'Ridwan');

  // Text & Table to PDF
  const textPdf = await createPdfFromTextDocument('Ringkasan', 'Paragraf contoh konversi dokumen ke PDF.');
  assert.equal(textPdf.pageCount, 1);

  const tablePdf = await createPdfFromTableRows('Laporan Bulanan', [
    ['Bulan', 'Pendapatan', 'Status'],
    ['Januari', 'Rp 24.500.000', 'Selesai'],
    ['Februari', 'Rp 28.900.000', 'Selesai'],
  ]);
  assert.equal(tablePdf.pageCount, 1);
});
