/**
 * Pure, deterministic helpers for client-side PDF preview rendering and metadata display.
 * Decoupled from browser DOM/pdf.js so they can be unit tested directly via node:test.
 */

export function isPdfFile(file: { name: string; type?: string }): boolean {
  if (file.type === 'application/pdf') return true;
  return file.name.trim().toLowerCase().endsWith('.pdf');
}

export function clampPreviewPage(page: number, totalPages: number): number {
  const safeTotal = Math.max(1, Math.floor(Number.isFinite(totalPages) ? totalPages : 1));
  const safePage = Math.floor(Number.isFinite(page) ? page : 1);
  return Math.min(safeTotal, Math.max(1, safePage));
}

export function computePreviewViewportScale(
  naturalWidthPt: number,
  naturalHeightPt: number,
  targetWidthPx: number,
  maxScale = 2.2
): number {
  const safeW = Math.max(1, naturalWidthPt);
  const safeH = Math.max(1, naturalHeightPt);
  const safeTarget = Math.max(40, targetWidthPx);
  const rawScale = safeTarget / safeW;

  // Guard extreme tall/narrow pages from creating oversized canvas buffers
  const maxHeightPx = safeTarget * 2.2;
  const heightBoundedScale = maxHeightPx / safeH;

  const chosen = Math.min(rawScale, heightBoundedScale, maxScale);
  return Math.max(0.2, Number(chosen.toFixed(3)));
}

const PT_TO_MM = 25.4 / 72;

export function formatPageDimensionsMm(widthPt: number, heightPt: number): string {
  const wMm = Math.round(Math.max(1, widthPt) * PT_TO_MM);
  const hMm = Math.round(Math.max(1, heightPt) * PT_TO_MM);

  const minSide = Math.min(wMm, hMm);
  const maxSide = Math.max(wMm, hMm);

  let paperName = '';
  if (Math.abs(minSide - 210) <= 3 && Math.abs(maxSide - 297) <= 3) {
    paperName = 'A4';
  } else if (Math.abs(minSide - 216) <= 3 && Math.abs(maxSide - 279) <= 3) {
    paperName = 'Letter';
  } else if (Math.abs(minSide - 216) <= 3 && Math.abs(maxSide - 356) <= 3) {
    paperName = 'Legal';
  } else if (Math.abs(minSide - 148) <= 3 && Math.abs(maxSide - 210) <= 3) {
    paperName = 'A5';
  } else if (Math.abs(minSide - 297) <= 3 && Math.abs(maxSide - 420) <= 3) {
    paperName = 'A3';
  }

  return paperName ? `${paperName} · ${wMm} × ${hMm} mm` : `${wMm} × ${hMm} mm`;
}
