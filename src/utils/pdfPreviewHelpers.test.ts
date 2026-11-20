import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampPreviewPage,
  computePreviewViewportScale,
  formatPageDimensionsMm,
  isPdfFile,
} from './pdfPreviewHelpers';

test('isPdfFile detects PDF by MIME type or extension case-insensitively', () => {
  assert.equal(isPdfFile({ name: 'laporan.pdf', type: 'application/pdf' }), true);
  assert.equal(isPdfFile({ name: 'DOKUMEN.PDF', type: '' }), true);
  assert.equal(isPdfFile({ name: 'foto.png', type: 'image/png' }), false);
  assert.equal(isPdfFile({ name: 'dokumen.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), false);
});

test('clampPreviewPage bounds requested page numbers cleanly', () => {
  assert.equal(clampPreviewPage(0, 5), 1);
  assert.equal(clampPreviewPage(-3, 5), 1);
  assert.equal(clampPreviewPage(3, 5), 3);
  assert.equal(clampPreviewPage(99, 5), 5);
  assert.equal(clampPreviewPage(2, 0), 1);
  assert.equal(clampPreviewPage(Number.NaN, 4), 1);
});

test('computePreviewViewportScale calculates crisp bounded render scales', () => {
  // Standard A4 portrait (595 x 842 pt) targeted to 720 px wide
  const scaleA4 = computePreviewViewportScale(595, 842, 720);
  assert.ok(scaleA4 > 1.1 && scaleA4 <= 1.25);

  // Thumbnail target (140 px wide)
  const thumbScale = computePreviewViewportScale(595, 842, 140);
  assert.ok(thumbScale >= 0.2 && thumbScale <= 0.3);

  // Respects maxScale cap for tiny PDFs
  const capped = computePreviewViewportScale(100, 100, 800, 2.0);
  assert.equal(capped, 2.0);
});

test('formatPageDimensionsMm identifies standard paper sizes and custom dimensions', () => {
  // A4 portrait (595.28 x 841.89 pt)
  assert.equal(formatPageDimensionsMm(595.28, 841.89), 'A4 · 210 × 297 mm');
  // A4 landscape
  assert.equal(formatPageDimensionsMm(841.89, 595.28), 'A4 · 297 × 210 mm');
  // US Letter (612 x 792 pt)
  assert.equal(formatPageDimensionsMm(612, 792), 'Letter · 216 × 279 mm');
  // Custom square
  assert.equal(formatPageDimensionsMm(283.5, 283.5), '100 × 100 mm');
});
