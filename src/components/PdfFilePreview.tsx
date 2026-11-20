import { useEffect, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  Maximize2,
  X,
} from 'lucide-react';
import type { UploadedFileItem } from '../types/pdf';
import {
  renderPdfPagePreview,
  type RenderedPdfPagePreview,
} from '../utils/pdfBrowserEngine';
import { formatFileSize } from '../utils/pdfHelpers';
import {
  clampPreviewPage,
  formatPageDimensionsMm,
} from '../utils/pdfPreviewHelpers';

export interface PreviewWatermarkOverlay {
  text: string;
  opacity: number;
  rotation: number;
  fontSize: number;
  colorHex: string;
  position: 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'tile';
}

interface PdfFilePreviewProps {
  file: UploadedFileItem;
  variant: 'thumbnail' | 'card';
  initialPage?: number;
  orderBadge?: number;
  rotationDeg?: number;
  watermark?: PreviewWatermarkOverlay;
  onInspect?: (pageNumber: number) => void;
}

/**
 * Client-side PDF preview component rendered directly in the browser via pdf.js.
 * - `variant="thumbnail"`: Compact page-1 thumbnail for multi-file staging lists (e.g. Merge PDF).
 * - `variant="card"`: Full-width first-page preview with page navigation & paper size metadata.
 */
export function PdfFilePreview({
  file,
  variant,
  initialPage = 1,
  orderBadge,
  rotationDeg = 0,
  watermark,
  onInspect,
}: PdfFilePreviewProps) {
  const totalPages = Math.max(1, file.pageCount || 1);
  const [currentPage, setCurrentPage] = useState<number>(() =>
    clampPreviewPage(initialPage, totalPages)
  );
  const [preview, setPreview] = useState<RenderedPdfPagePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  // Reset to initialPage whenever the source file changes
  useEffect(() => {
    setCurrentPage(clampPreviewPage(initialPage, Math.max(1, file.pageCount || 1)));
  }, [file.id, file.pageCount, initialPage]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);

    const targetWidth = variant === 'thumbnail' ? 140 : 680;
    const pageToRender = variant === 'thumbnail' ? 1 : currentPage;

    renderPdfPagePreview(file.data, pageToRender, targetWidth)
      .then((rendered) => {
        if (cancelled) return;
        setPreview(rendered);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setPreview(null);
        setFailed(true);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [file.id, file.data, variant, currentPage]);

  if (variant === 'thumbnail') {
    return (
      <button
        type="button"
        onClick={() => onInspect?.(1)}
        aria-label={`Lihat pratinjau halaman pertama ${file.name}`}
        className="group relative w-12 h-16 rounded-lg border border-slate-200 bg-slate-50 overflow-hidden flex items-center justify-center shrink-0 hover:border-blue-400 focus-visible:outline-2 focus-visible:outline-blue-600 transition-colors"
      >
        {loading ? (
          <Loader2
            className="w-4 h-4 text-blue-600 animate-spin"
            aria-label="Memuat pratinjau PDF"
          />
        ) : failed || !preview ? (
          <FileText className="w-5 h-5 text-blue-700" aria-hidden="true" />
        ) : (
          <img
            src={preview.dataUrl}
            alt={`Thumbnail halaman 1 ${file.name}`}
            data-testid="pdf-preview-thumb"
            className="w-full h-full object-contain bg-white"
          />
        )}

        {typeof orderBadge === 'number' && (
          <span className="absolute top-0.5 left-0.5 min-w-4 h-4 px-1 rounded bg-blue-700 text-white font-mono text-[10px] font-semibold inline-flex items-center justify-center leading-none">
            {orderBadge}
          </span>
        )}

        <span
          aria-hidden="true"
          className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/25 transition-colors flex items-center justify-center"
        >
          <Maximize2 className="w-3.5 h-3.5 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-xs" />
        </span>
      </button>
    );
  }

  const effectiveTotalPages = preview?.totalPages || totalPages;
  const paperDimensions = preview
    ? formatPageDimensionsMm(preview.widthPt, preview.heightPt)
    : null;

  return (
    <div
      data-testid="pdf-first-page-preview-card"
      className="space-y-3"
    >
      {/* Preview Metadata & Navigation Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono tabular-nums">
          <span className="text-slate-700 font-medium">
            Halaman {currentPage} / {effectiveTotalPages}
          </span>
          {paperDimensions && (
            <>
              <span aria-hidden="true">&middot;</span>
              <span>{paperDimensions}</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {effectiveTotalPages > 1 && (
            <div className="inline-flex items-center gap-1 mr-1">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => clampPreviewPage(p - 1, effectiveTotalPages))}
                disabled={currentPage <= 1 || loading}
                aria-label="Halaman sebelumnya"
                className="w-7 h-7 rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-blue-700 hover:border-blue-300 disabled:opacity-35 inline-flex items-center justify-center transition-colors"
              >
                <ChevronLeft className="w-4 h-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => clampPreviewPage(p + 1, effectiveTotalPages))}
                disabled={currentPage >= effectiveTotalPages || loading}
                aria-label="Halaman berikutnya"
                className="w-7 h-7 rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-blue-700 hover:border-blue-300 disabled:opacity-35 inline-flex items-center justify-center transition-colors"
              >
                <ChevronRight className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          )}

          {onInspect && (
            <button
              type="button"
              onClick={() => onInspect(currentPage)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:text-blue-700 hover:border-blue-300 font-medium transition-colors whitespace-nowrap"
            >
              <Maximize2 className="w-3.5 h-3.5" aria-hidden="true" />
              Perbesar
            </button>
          )}
        </div>
      </div>

      {/* Rendered PDF Page Canvas Surface */}
      <div
        aria-busy={loading}
        className="relative rounded-xl border border-slate-200 bg-slate-100/80 p-4 sm:p-6 min-h-[340px] flex items-center justify-center overflow-hidden"
      >
        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-2 text-sm text-slate-500">
            <Loader2 className="w-5 h-5 text-blue-700 animate-spin" aria-hidden="true" />
            <span>Merender pratinjau halaman {currentPage}...</span>
          </div>
        ) : failed || !preview ? (
          <div className="py-12 text-center space-y-2 text-slate-500">
            <FileText className="w-8 h-8 text-slate-400 mx-auto" aria-hidden="true" />
            <p className="text-sm font-medium text-slate-700">
              Pratinjau halaman tidak dapat ditampilkan
            </p>
            <p className="text-xs text-slate-500">
              Dokumen tetap siap diproses pada panel pengaturan di sebelah kanan.
            </p>
          </div>
        ) : (
          <div className="relative bg-white rounded-lg shadow-xs border border-slate-200/90 overflow-hidden max-w-full">
            <img
              src={preview.dataUrl}
              alt={`Pratinjau halaman ${currentPage} dari ${file.name}`}
              data-testid="pdf-first-page-preview"
              style={
                rotationDeg !== 0
                  ? { transform: `rotate(${rotationDeg}deg)` }
                  : undefined
              }
              className="block max-h-[480px] w-auto max-w-full object-contain transition-transform duration-150"
            />

            {watermark && watermark.text.trim() && (
              <div
                aria-hidden="true"
                className={`pointer-events-none absolute inset-0 flex p-6 overflow-hidden ${
                  watermark.position === 'top-left'
                    ? 'items-start justify-start'
                    : watermark.position === 'top-right'
                      ? 'items-start justify-end'
                      : watermark.position === 'bottom-left'
                        ? 'items-end justify-start'
                        : watermark.position === 'bottom-right'
                          ? 'items-end justify-end'
                          : 'items-center justify-center'
                }`}
              >
                <span
                  className="font-bold uppercase tracking-wider text-center select-none whitespace-nowrap"
                  style={{
                    color: watermark.colorHex,
                    opacity: watermark.opacity,
                    fontSize: `${Math.max(14, Math.round(watermark.fontSize * 0.65))}px`,
                    transform: `rotate(${-watermark.rotation}deg)`,
                  }}
                >
                  {watermark.text.trim()}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface PdfPreviewModalProps {
  file: UploadedFileItem;
  initialPage?: number;
  onClose: () => void;
}

/**
 * High-resolution client-side PDF inspection dialog for reviewing uploaded PDFs before processing.
 */
export function PdfPreviewModal({
  file,
  initialPage = 1,
  onClose,
}: PdfPreviewModalProps) {
  const totalPages = Math.max(1, file.pageCount || 1);
  const [pageNumber, setPageNumber] = useState<number>(() =>
    clampPreviewPage(initialPage, totalPages)
  );
  const [preview, setPreview] = useState<RenderedPdfPagePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft') {
        setPageNumber((p) => clampPreviewPage(p - 1, preview?.totalPages || totalPages));
      } else if (e.key === 'ArrowRight') {
        setPageNumber((p) => clampPreviewPage(p + 1, preview?.totalPages || totalPages));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, preview?.totalPages, totalPages]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);

    renderPdfPagePreview(file.data, pageNumber, 860)
      .then((rendered) => {
        if (cancelled) return;
        setPreview(rendered);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setPreview(null);
        setFailed(true);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [file.id, file.data, pageNumber]);

  const effectiveTotal = preview?.totalPages || totalPages;
  const paperDim = preview
    ? formatPageDimensionsMm(preview.widthPt, preview.heightPt)
    : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pdf-preview-modal-title"
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-[2px] flex items-center justify-center p-4 sm:p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[90vh] bg-white border border-slate-200 rounded-2xl shadow-xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h2
              id="pdf-preview-modal-title"
              className="font-display text-sm sm:text-base font-semibold text-slate-900 truncate"
            >
              {file.name}
            </h2>
            <p className="text-xs font-mono tabular-nums text-slate-500 mt-0.5">
              {formatFileSize(file.size)} &middot; {effectiveTotal} halaman
              {paperDim ? ` · ${paperDim}` : ''}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup pratinjau dokumen"
            className="w-8 h-8 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 inline-flex items-center justify-center shrink-0 transition-colors"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-auto bg-slate-100/80 p-5 flex items-center justify-center min-h-[320px]">
          {loading ? (
            <div className="py-16 flex flex-col items-center gap-2 text-sm text-slate-500">
              <Loader2 className="w-5 h-5 text-blue-700 animate-spin" aria-hidden="true" />
              <span>Memuat halaman {pageNumber}...</span>
            </div>
          ) : failed || !preview ? (
            <div className="py-16 text-center space-y-2 text-slate-500">
              <FileText className="w-8 h-8 text-slate-400 mx-auto" aria-hidden="true" />
              <p className="text-sm font-medium text-slate-700">
                Gagal memuat pratinjau halaman
              </p>
            </div>
          ) : (
            <img
              src={preview.dataUrl}
              alt={`Pratinjau penuh halaman ${pageNumber} dari ${file.name}`}
              data-testid="pdf-modal-preview-image"
              className="max-w-full max-h-[64vh] w-auto h-auto rounded-lg bg-white border border-slate-200 shadow-xs object-contain"
            />
          )}
        </div>

        {/* Modal Footer Navigation */}
        <div className="px-5 py-3.5 border-t border-slate-200 bg-white flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPageNumber((p) => clampPreviewPage(p - 1, effectiveTotal))}
              disabled={pageNumber <= 1 || loading}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
              Sebelumnya
            </button>
            <span className="text-xs font-mono tabular-nums text-slate-600 px-2">
              Hal {pageNumber} / {effectiveTotal}
            </span>
            <button
              type="button"
              onClick={() => setPageNumber((p) => clampPreviewPage(p + 1, effectiveTotal))}
              disabled={pageNumber >= effectiveTotal || loading}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors"
            >
              Berikutnya
              <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors"
          >
            Selesai
          </button>
        </div>
      </div>
    </div>
  );
}
