import { useEffect, useState } from 'react';
import { extractPdfTextPages, renderSinglePdfPageHighRes } from '../utils/pdfBrowserEngine';
import { computeLineDiff } from '../utils/pdfHelpers';
import type { DiffLine, UploadedFileItem } from '../types/pdf';

interface CompareViewProps {
  fileA: UploadedFileItem;
  fileB: UploadedFileItem;
  onDiffReady?: (lines: DiffLine[]) => void;
}

export function CompareView({ fileA, fileB, onDiffReady }: CompareViewProps) {
  const [loading, setLoading] = useState(true);
  const [diffLines, setDiffLines] = useState<DiffLine[]>([]);
  const [previewA, setPreviewA] = useState<string | null>(null);
  const [previewB, setPreviewB] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'diff' | 'visual'>('diff');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      extractPdfTextPages(fileA.data),
      extractPdfTextPages(fileB.data),
      renderSinglePdfPageHighRes(fileA.data, 1, 0.9),
      renderSinglePdfPageHighRes(fileB.data, 1, 0.9),
    ])
      .then(([pagesA, pagesB, imgA, imgB]) => {
        if (cancelled) return;
        const diff = computeLineDiff(pagesA.join('\n'), pagesB.join('\n'));
        setDiffLines(diff);
        onDiffReady?.(diff);
        setPreviewA(imgA.dataUrl);
        setPreviewB(imgB.dataUrl);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fileA, fileB, onDiffReady]);

  const addedCount = diffLines.filter((d) => d.type === 'added').length;
  const removedCount = diffLines.filter((d) => d.type === 'removed').length;
  const sameCount = diffLines.filter((d) => d.type === 'same').length;

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4 text-xs font-mono tabular-nums text-slate-600">
          <span>
            Sama: <strong className="text-slate-900">{sameCount}</strong>
          </span>
          <span aria-hidden="true">&middot;</span>
          <span className="text-emerald-700">
            Ditambahkan: <strong>+{addedCount}</strong>
          </span>
          <span aria-hidden="true">&middot;</span>
          <span className="text-red-700">
            Dihapus: <strong>-{removedCount}</strong>
          </span>
        </div>

        <div className="inline-flex p-0.5 bg-slate-100 rounded-lg border border-slate-200/80">
          <button
            type="button"
            onClick={() => setActiveTab('diff')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'diff'
                ? 'bg-blue-700 text-white'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Perbandingan Teks
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('visual')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'visual'
                ? 'bg-blue-700 text-white'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Berdampingan Visual
          </button>
        </div>
      </div>

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-sm text-slate-500">
          Menganalisis perbedaan isi kedua dokumen PDF...
        </div>
      ) : activeTab === 'diff' ? (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between text-xs text-slate-600">
            <span className="truncate font-medium">A: {fileA.name}</span>
            <span className="truncate font-medium">B: {fileB.name}</span>
          </div>
          <div className="divide-y divide-slate-100 max-h-[520px] overflow-y-auto font-mono text-xs">
            {diffLines.length === 0 ? (
              <p className="p-6 text-center text-slate-500 font-sans">
                Tidak ada konten teks yang terdeteksi untuk dibandingkan.
              </p>
            ) : (
              diffLines.map((line, index) => (
                <div
                  key={index}
                  className={`px-4 py-2 flex items-start gap-3 ${
                    line.type === 'added'
                      ? 'bg-emerald-50/80 text-emerald-950'
                      : line.type === 'removed'
                        ? 'bg-red-50/80 text-red-950'
                        : 'bg-white text-slate-700'
                  }`}
                >
                  <span className="w-5 shrink-0 font-bold select-none">
                    {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                  </span>
                  <span className="leading-relaxed break-words">{line.text}</span>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <p className="text-xs font-medium text-slate-700 truncate">
              Dokumen A &middot; {fileA.name}
            </p>
            {previewA && (
              <img
                src={previewA}
                alt={`Pratinjau ${fileA.name}`}
                className="w-full rounded-lg border border-slate-200"
              />
            )}
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <p className="text-xs font-medium text-slate-700 truncate">
              Dokumen B &middot; {fileB.name}
            </p>
            {previewB && (
              <img
                src={previewB}
                alt={`Pratinjau ${fileB.name}`}
                className="w-full rounded-lg border border-slate-200"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
