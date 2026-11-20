import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import type { AnnotationOverlay, ToolId } from '../types/pdf';
import { renderSinglePdfPageHighRes } from '../utils/pdfBrowserEngine';

interface InteractivePageCanvasProps {
  pdfData: Uint8Array;
  pageCount: number;
  toolId: ToolId;
  annotations: AnnotationOverlay[];
  onAddAnnotation: (annotation: AnnotationOverlay) => void;
  onRemoveAnnotation: (id: string) => void;
  // Tool-specific active brush params
  activeEditMode?: 'text' | 'highlight';
  noteText?: string;
  noteColor?: string;
  noteFontSize?: number;
  signatureDataUrl?: string | null;
}

export function InteractivePageCanvas({
  pdfData,
  pageCount,
  toolId,
  annotations,
  onAddAnnotation,
  onRemoveAnnotation,
  activeEditMode = 'text',
  noteText = 'Catatan Penting',
  noteColor = '#1d4ed8',
  noteFontSize = 14,
  signatureDataUrl,
}: InteractivePageCanvasProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageImage, setPageImage] = useState<{ dataUrl: string; width: number; height: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragCurrent, setDragCurrent] = useState<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    renderSinglePdfPageHighRes(pdfData, currentPage, 1.35)
      .then((res) => {
        if (!cancelled) {
          setPageImage(res);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pdfData, currentPage]);

  const getNormalizedCoords = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = containerRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    return { x, y };
  };

  const isBoxDragTool =
    toolId === 'redact-pdf' || (toolId === 'edit-pdf' && activeEditMode === 'highlight');

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    const coords = getNormalizedCoords(e);

    if (isBoxDragTool) {
      setDragStart(coords);
      setDragCurrent(coords);
      return;
    }

    if (toolId === 'sign-pdf') {
      if (!signatureDataUrl) return;
      const w = 0.28;
      const h = 0.095;
      onAddAnnotation({
        id: `sig-${Date.now()}`,
        type: 'signature',
        pageIndex: currentPage - 1,
        x: Math.min(1 - w, Math.max(0, coords.x - w / 2)),
        y: Math.min(1 - h, Math.max(0, coords.y - h / 2)),
        width: w,
        height: h,
        imageDataUrl: signatureDataUrl,
      });
      return;
    }

    if (toolId === 'edit-pdf' && activeEditMode === 'text') {
      const textValue = noteText.trim() || 'Catatan';
      onAddAnnotation({
        id: `txt-${Date.now()}`,
        type: 'text',
        pageIndex: currentPage - 1,
        x: Math.min(0.85, coords.x),
        y: Math.min(0.95, coords.y),
        width: 0.3,
        height: 0.05,
        text: textValue,
        color: noteColor,
        fontSize: noteFontSize,
      });
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStart) return;
    setDragCurrent(getNormalizedCoords(e));
  };

  const handlePointerUp = () => {
    if (!dragStart || !dragCurrent) return;
    const x = Math.min(dragStart.x, dragCurrent.x);
    const y = Math.min(dragStart.y, dragCurrent.y);
    const width = Math.abs(dragCurrent.x - dragStart.x);
    const height = Math.abs(dragCurrent.y - dragStart.y);
    setDragStart(null);
    setDragCurrent(null);

    if (width < 0.015 || height < 0.01) {
      // Quick click creates a convenient default-sized bar
      onAddAnnotation({
        id: `box-${Date.now()}`,
        type: toolId === 'redact-pdf' ? 'redact' : 'highlight',
        pageIndex: currentPage - 1,
        x: Math.min(0.75, x),
        y: Math.min(0.95, y),
        width: 0.24,
        height: 0.032,
        color: toolId === 'redact-pdf' ? '#0f172a' : '#93c5fd',
      });
      return;
    }

    onAddAnnotation({
      id: `box-${Date.now()}`,
      type: toolId === 'redact-pdf' ? 'redact' : 'highlight',
      pageIndex: currentPage - 1,
      x,
      y,
      width,
      height,
      color: toolId === 'redact-pdf' ? '#0f172a' : '#93c5fd',
    });
  };

  const pageAnnotations = annotations.filter((a) => a.pageIndex === currentPage - 1);

  const instructionText =
    toolId === 'redact-pdf'
      ? 'Seret (atau klik) area teks sensitif pada halaman untuk menutupinya dengan blok sensor permanen.'
      : toolId === 'sign-pdf'
        ? signatureDataUrl
          ? 'Klik area mana saja pada halaman PDF untuk menempatkan tanda tangan Anda.'
          : 'Buat tanda tangan terlebih dahulu di panel sebelah kanan sebelum menempelkannya.'
        : activeEditMode === 'highlight'
          ? 'Seret area teks pada halaman untuk memberikan sorotan warna biru.'
          : 'Klik area mana saja pada halaman untuk menempatkan teks anotasi Anda.';

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3">
        <p className="text-xs text-slate-600">{instructionText}</p>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            aria-label="Halaman sebelumnya"
            className="w-8 h-8 rounded-lg border border-slate-200 inline-flex items-center justify-center text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs font-mono tabular-nums text-slate-700 px-1">
            Hal {currentPage} / {pageCount}
          </span>
          <button
            type="button"
            disabled={currentPage >= pageCount}
            onClick={() => setCurrentPage((p) => Math.min(pageCount, p + 1))}
            aria-label="Halaman berikutnya"
            className="w-8 h-8 rounded-lg border border-slate-200 inline-flex items-center justify-center text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Interactive Page Surface */}
      <div className="bg-slate-100/80 border border-slate-200 rounded-xl p-4 sm:p-6 flex justify-center overflow-auto">
        {loading || !pageImage ? (
          <div className="w-full max-w-[540px] aspect-[595/842] bg-white rounded-lg border border-slate-200 flex items-center justify-center text-sm text-slate-500">
            Memuat pratinjau halaman...
          </div>
        ) : (
          <div
            ref={containerRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            className="relative w-full max-w-[560px] select-none shadow-sm border border-slate-300 bg-white cursor-crosshair"
            style={{ aspectRatio: `${pageImage.width} / ${pageImage.height}` }}
          >
            <img
              src={pageImage.dataUrl}
              alt={`Pratinjau halaman ${currentPage}`}
              draggable={false}
              className="w-full h-full block pointer-events-none"
            />

            {/* Live drag selection preview */}
            {dragStart && dragCurrent && (
              <div
                className={`absolute pointer-events-none border-2 ${
                  toolId === 'redact-pdf'
                    ? 'bg-slate-950/75 border-blue-500'
                    : 'bg-blue-400/35 border-blue-600'
                }`}
                style={{
                  left: `${Math.min(dragStart.x, dragCurrent.x) * 100}%`,
                  top: `${Math.min(dragStart.y, dragCurrent.y) * 100}%`,
                  width: `${Math.abs(dragCurrent.x - dragStart.x) * 100}%`,
                  height: `${Math.abs(dragCurrent.y - dragStart.y) * 100}%`,
                }}
              />
            )}

            {/* Placed overlays */}
            {pageAnnotations.map((item) => (
              <div
                key={item.id}
                className="group absolute"
                style={{
                  left: `${item.x * 100}%`,
                  top: `${item.y * 100}%`,
                  width: item.type === 'text' ? 'auto' : `${item.width * 100}%`,
                  height: item.type === 'text' ? 'auto' : `${item.height * 100}%`,
                }}
              >
                {item.type === 'redact' && (
                  <div className="w-full h-full bg-slate-950 rounded-[1px]" />
                )}
                {item.type === 'highlight' && (
                  <div className="w-full h-full bg-blue-400/40 rounded-[2px]" />
                )}
                {item.type === 'text' && (
                  <span
                    className="font-bold whitespace-nowrap leading-none px-1 py-0.5 bg-white/80 rounded"
                    style={{
                      color: item.color || '#1d4ed8',
                      fontSize: `${Math.max(11, (item.fontSize || 14) * 0.9)}px`,
                    }}
                  >
                    {item.text}
                  </span>
                )}
                {item.type === 'signature' && item.imageDataUrl && (
                  <img
                    src={item.imageDataUrl}
                    alt="Tanda tangan"
                    className="w-full h-full object-contain pointer-events-none"
                  />
                )}

                <button
                  type="button"
                  onClick={() => onRemoveAnnotation(item.id)}
                  aria-label="Hapus elemen ini"
                  className="absolute -top-2.5 -right-2.5 w-5 h-5 rounded-full bg-red-600 text-white opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity inline-flex items-center justify-center shadow-xs"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
