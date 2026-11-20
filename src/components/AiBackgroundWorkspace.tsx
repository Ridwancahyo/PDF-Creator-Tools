import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileDown,
  ImagePlus,
  Loader2,
  RotateCcw,
  SlidersHorizontal,
  SplitSquareHorizontal,
  Upload,
} from 'lucide-react';
import type { PdfToolDefinition } from '../types/pdf';
import {
  fetchSamplePortraitFile,
  removeBackgroundWithAI,
  renderStudioComposite,
  SAMPLE_PORTRAIT_URL,
  STUDIO_BACKDROP_PRESETS,
  type RemoveBackgroundOutput,
  type SegmentationEngineMode,
  type StudioBackdropPreset,
  type StudioCompositeOptions,
} from '../utils/aiBackgroundEngine';
import { clampStudioSettings } from '../utils/bgMath';
import { createPdfFromImageBuffers, formatFileSize, sanitizeFilename } from '../utils/pdfHelpers';
import { ToolIcon } from './ToolIcon';

interface AiBackgroundWorkspaceProps {
  tool: PdfToolDefinition;
  onBack: () => void;
}

const CHECKERBOARD_STYLE: React.CSSProperties = {
  backgroundImage:
    'linear-gradient(45deg, #e2e8f0 25%, transparent 25%), linear-gradient(-45deg, #e2e8f0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e2e8f0 75%), linear-gradient(-45deg, transparent 75%, #e2e8f0 75%)',
  backgroundSize: '20px 20px',
  backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
  backgroundColor: '#f8fafc',
};

export function AiBackgroundWorkspace({ tool, onBack }: AiBackgroundWorkspaceProps) {
  const isInitialChangeMode = tool.id === 'ai-change-bg';
  const [studioMode, setStudioMode] = useState<'remove' | 'change'>(
    isInitialChangeMode ? 'change' : 'remove'
  );
  const [engineMode, setEngineMode] = useState<SegmentationEngineMode>('neural-ai');
  const [tolerance, setTolerance] = useState(22);

  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [cutout, setCutout] = useState<RemoveBackgroundOutput | null>(null);
  const [compositeUrl, setCompositeUrl] = useState<string | null>(null);

  const [processing, setProcessing] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Before / After comparison slider
  const [compareEnabled, setCompareEnabled] = useState(true);
  const [splitPct, setSplitPct] = useState(50);

  // Studio compositing state
  const [selectedPresetId, setSelectedPresetId] = useState<string>(
    isInitialChangeMode ? 'photo-office-modern' : 'solid-transparent'
  );
  const [customSolidColor, setCustomSolidColor] = useState('#1d4ed8');
  const [customBgUrl, setCustomBgUrl] = useState<string | null>(null);
  const [blurPx, setBlurPx] = useState(isInitialChangeMode ? 4 : 0);
  const [featherPx, setFeatherPx] = useState(1);
  const [dropShadow, setDropShadow] = useState(isInitialChangeMode);
  const [subjectScale, setSubjectScale] = useState(1);
  const [verticalOffsetPct, setVerticalOffsetPct] = useState(0);
  const [ambientMatchPct, setAmbientMatchPct] = useState(isInitialChangeMode ? 8 : 0);
  const [bgTab, setBgTab] = useState<'photo' | 'solid' | 'gradient'>('photo');

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const customBgInputRef = useRef<HTMLInputElement | null>(null);
  const lastCompositeCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Sync mode when switching directly between ai-remove-bg and ai-change-bg
  useEffect(() => {
    const isChange = tool.id === 'ai-change-bg';
    setStudioMode(isChange ? 'change' : 'remove');
    if (isChange) {
      setSelectedPresetId((prev) => (prev === 'solid-transparent' ? 'photo-office-modern' : prev));
      setDropShadow(true);
      setBlurPx(4);
      setAmbientMatchPct(8);
    } else {
      setSelectedPresetId('solid-transparent');
      setDropShadow(false);
    }
  }, [tool.id]);

  // Track active object URLs in a ref so cleanup only revokes on actual unmount
  const objectUrlsRef = useRef<{
    sourceUrl: string | null;
    cutoutUrl: string | null;
    customBgUrl: string | null;
  }>({ sourceUrl: null, cutoutUrl: null, customBgUrl: null });

  objectUrlsRef.current.sourceUrl = sourceUrl;
  objectUrlsRef.current.cutoutUrl = cutout?.cutoutUrl ?? null;
  objectUrlsRef.current.customBgUrl = customBgUrl;

  useEffect(() => {
    return () => {
      const urls = objectUrlsRef.current;
      if (urls.sourceUrl) URL.revokeObjectURL(urls.sourceUrl);
      if (urls.cutoutUrl) URL.revokeObjectURL(urls.cutoutUrl);
      if (urls.customBgUrl) URL.revokeObjectURL(urls.customBgUrl);
    };
  }, []);

  const runSegmentation = useCallback(
    async (file: File, modeToUse: SegmentationEngineMode, tol: number) => {
      setProcessing(true);
      setErrorMsg(null);
      setExportNotice(null);
      setProgressPct(8);
      setProgressLabel('Menyiapkan gambar...');

      try {
        const result = await removeBackgroundWithAI(file, {
          mode: modeToUse,
          tolerance: tol,
          onProgress: (pct, label) => {
            setProgressPct(pct);
            setProgressLabel(label);
          },
        });
        setCutout((prev) => {
          if (prev?.cutoutUrl) URL.revokeObjectURL(prev.cutoutUrl);
          return result;
        });
      } catch (err) {
        setErrorMsg(
          err instanceof Error ? err.message : 'Gagal memproses penghapusan latar belakang.'
        );
      } finally {
        setProcessing(false);
      }
    },
    []
  );

  const handleSelectPhoto = useCallback(
    async (file: File, preferredEngine?: SegmentationEngineMode) => {
      if (!file.type.startsWith('image/')) {
        setErrorMsg('Pilih berkas gambar dengan format JPG, PNG, atau WebP.');
        return;
      }
      setErrorMsg(null);
      setSourceFile(file);
      const nextUrl = URL.createObjectURL(file);
      setSourceUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return nextUrl;
      });
      await runSegmentation(file, preferredEngine ?? engineMode, tolerance);
    },
    [engineMode, runSegmentation, tolerance]
  );

  const handleLoadSample = async () => {
    setErrorMsg(null);
    setProcessing(true);
    setProgressPct(15);
    setProgressLabel('Memuat foto studio contoh...');
    try {
      const sampleFile = await fetchSamplePortraitFile();
      // Sample studio portrait has a crisp uniform studio wall — precision-fast runs in ~120ms locally with razor edges
      setEngineMode('precision-fast');
      await handleSelectPhoto(sampleFile, 'precision-fast');
    } catch {
      setProcessing(false);
      setErrorMsg('Gagal memuat foto contoh. Silakan unggah foto dari perangkat Anda.');
    }
  };

  // Build active composite options from UI state
  const activePreset: StudioBackdropPreset | undefined = STUDIO_BACKDROP_PRESETS.find(
    (p) => p.id === selectedPresetId
  );

  useEffect(() => {
    if (!cutout) {
      setCompositeUrl(null);
      return;
    }

    let cancelled = false;
    const clamped = clampStudioSettings({
      blurPx,
      featherPx,
      subjectScale,
      verticalOffsetPct,
      ambientMatchPct,
    });

    let compOptions: StudioCompositeOptions = {
      backgroundType: 'transparent',
      solidColor: 'transparent',
      gradientColors: ['#eff6ff', '#bfdbfe'],
      blurPx: clamped.blurPx,
      featherPx: clamped.featherPx,
      dropShadow,
      subjectScale: clamped.subjectScale,
      verticalOffsetPct: clamped.verticalOffsetPct,
      ambientMatchPct: clamped.ambientMatchPct,
    };

    if (studioMode === 'change') {
      if (selectedPresetId === 'custom-photo' && customBgUrl) {
        compOptions = {
          ...compOptions,
          backgroundType: 'custom-photo',
          customPhotoUrl: customBgUrl,
          ambientTint: '#e2e8f0',
        };
      } else if (selectedPresetId === 'custom-solid') {
        compOptions = {
          ...compOptions,
          backgroundType: 'solid',
          solidColor: customSolidColor,
          ambientTint: customSolidColor,
        };
      } else if (activePreset) {
        if (activePreset.category === 'photo') {
          compOptions = {
            ...compOptions,
            backgroundType: 'photo',
            photoUrl: activePreset.imageUrl,
            ambientTint: activePreset.ambientTint,
          };
        } else if (activePreset.category === 'gradient' && activePreset.gradient) {
          compOptions = {
            ...compOptions,
            backgroundType: 'gradient',
            gradientColors: activePreset.gradient,
            ambientTint: activePreset.ambientTint,
          };
        } else if (activePreset.color && activePreset.color !== 'transparent') {
          compOptions = {
            ...compOptions,
            backgroundType: 'solid',
            solidColor: activePreset.color,
            ambientTint: activePreset.ambientTint,
          };
        }
      }
    }

    renderStudioComposite(cutout.cutoutUrl, compOptions)
      .then((canvas) => {
        if (cancelled) return;
        lastCompositeCanvasRef.current = canvas;
        setCompositeUrl(canvas.toDataURL('image/png'));
      })
      .catch(() => {
        if (!cancelled) setCompositeUrl(cutout.cutoutUrl);
      });

    return () => {
      cancelled = true;
    };
  }, [
    cutout,
    studioMode,
    selectedPresetId,
    activePreset,
    customSolidColor,
    customBgUrl,
    blurPx,
    featherPx,
    dropShadow,
    subjectScale,
    verticalOffsetPct,
    ambientMatchPct,
  ]);

  const handleSwitchMode = (nextMode: 'remove' | 'change') => {
    setStudioMode(nextMode);
    if (nextMode === 'change') {
      if (selectedPresetId === 'solid-transparent') {
        setSelectedPresetId('photo-office-modern');
      }
      setDropShadow(true);
      setBlurPx((b) => (b === 0 ? 4 : b));
    } else {
      setSelectedPresetId('solid-transparent');
      setDropShadow(false);
    }
  };

  const handleExportImage = async (format: 'png' | 'jpeg') => {
    const canvas = lastCompositeCanvasRef.current;
    if (!canvas || !sourceFile) return;

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = canvas.width;
    exportCanvas.height = canvas.height;
    const ctx = exportCanvas.getContext('2d');
    if (!ctx) return;

    if (format === 'jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
    }
    ctx.drawImage(canvas, 0, 0);

    const mime = format === 'png' ? 'image/png' : 'image/jpeg';
    const blob = await new Promise<Blob | null>((resolve) =>
      exportCanvas.toBlob((b) => resolve(b), mime, 0.95)
    );
    if (!blob) return;

    const suffix = studioMode === 'remove' ? 'tanpa_bg' : 'ganti_bg';
    const ext = format === 'png' ? 'png' : 'jpg';
    const filename = sanitizeFilename(sourceFile.name, suffix, ext);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setExportNotice(`Berhasil mengunduh ${filename} (${formatFileSize(blob.size)})`);
  };

  const handleExportPdf = async () => {
    const canvas = lastCompositeCanvasRef.current;
    if (!canvas || !sourceFile) return;
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/png')
    );
    if (!blob) return;
    const imgBytes = new Uint8Array(await blob.arrayBuffer());
    const { bytes } = await createPdfFromImageBuffers(
      [{ bytes: imgBytes, mimeType: 'image/png' }],
      { pageSize: 'a4', orientation: 'portrait', marginMm: 12 }
    );
    const pdfBlob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
    const filename = sanitizeFilename(
      sourceFile.name,
      studioMode === 'remove' ? 'tanpa_bg' : 'studio_bg',
      'pdf'
    );
    const url = URL.createObjectURL(pdfBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setExportNotice(`Berhasil mengekspor ${filename} (${formatFileSize(pdfBlob.size)})`);
  };

  const handleReset = () => {
    setSourceFile(null);
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    setSourceUrl(null);
    if (cutout?.cutoutUrl) URL.revokeObjectURL(cutout.cutoutUrl);
    setCutout(null);
    setCompositeUrl(null);
    setErrorMsg(null);
    setExportNotice(null);
  };

  const photoPresets = STUDIO_BACKDROP_PRESETS.filter((p) => p.category === 'photo');
  const solidPresets = STUDIO_BACKDROP_PRESETS.filter(
    (p) => p.category === 'solid' && p.id !== 'solid-transparent'
  );
  const gradientPresets = STUDIO_BACKDROP_PRESETS.filter((p) => p.category === 'gradient');

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-12">
      {/* Header & Seamless Mode Switcher */}
      <div className="mb-8 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-6 border-b border-slate-200/80">
        <div className="space-y-2">
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-slate-500">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 text-blue-700 hover:text-blue-800 font-medium transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
              Semua Alat
            </button>
            <span aria-hidden="true">/</span>
            <span>AI Background</span>
            <span aria-hidden="true">/</span>
            <span className="text-slate-800 font-medium">
              {studioMode === 'remove' ? 'AI Hapus Background' : 'AI Ganti Background'}
            </span>
          </nav>

          <div className="flex items-center gap-3.5">
            <span className="w-11 h-11 rounded-xl bg-blue-700 text-white inline-flex items-center justify-center shrink-0">
              <ToolIcon toolId={studioMode === 'remove' ? 'ai-remove-bg' : 'ai-change-bg'} className="w-5 h-5" />
            </span>
            <div>
              <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                {studioMode === 'remove' ? 'AI Hapus Background' : 'AI Ganti Background'}
              </h1>
              <p className="text-sm text-slate-600 mt-0.5">
                {studioMode === 'remove'
                  ? 'Pemisahan subjek otomatis berbasis AI dengan tepi bersih dan hasil PNG transparan HD.'
                  : 'Ganti latar belakang foto ke studio profesional, pas foto biru/merah, atau gambar pilihan Anda.'}
              </p>
            </div>
          </div>
        </div>

        {/* Mode Segmented Control */}
        <div className="flex items-center gap-3 self-start lg:self-center">
          <div className="inline-flex p-1 bg-slate-100 border border-slate-200/80 rounded-xl">
            <button
              type="button"
              onClick={() => handleSwitchMode('remove')}
              aria-pressed={studioMode === 'remove'}
              className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                studioMode === 'remove'
                  ? 'bg-blue-700 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Hapus Background
            </button>
            <button
              type="button"
              onClick={() => handleSwitchMode('change')}
              aria-pressed={studioMode === 'change'}
              className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                studioMode === 'change'
                  ? 'bg-blue-700 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Ganti Background
            </button>
          </div>

          {sourceFile && (
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-lg transition-colors whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              Ganti Foto
            </button>
          )}
        </div>
      </div>

      {/* Hidden inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleSelectPhoto(f);
          e.target.value = '';
        }}
        className="sr-only"
        aria-label="Unggah foto untuk diproses AI Background"
      />
      <input
        ref={customBgInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) {
            const url = URL.createObjectURL(f);
            setCustomBgUrl((prev) => {
              if (prev) URL.revokeObjectURL(prev);
              return url;
            });
            setSelectedPresetId('custom-photo');
            setStudioMode('change');
          }
          e.target.value = '';
        }}
        className="sr-only"
        aria-label="Unggah gambar latar belakang kustom"
      />

      {errorMsg && (
        <div
          role="alert"
          className="mb-6 flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-900 text-sm"
        >
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <p className="font-medium">Terjadi Kendala</p>
            <p className="text-red-800 mt-0.5">{errorMsg}</p>
          </div>
        </div>
      )}

      {exportNotice && (
        <div
          role="status"
          className="mb-6 flex items-center gap-3 p-3.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-950 text-sm"
        >
          <CheckCircle2 className="w-5 h-5 text-blue-700 shrink-0" aria-hidden="true" />
          <span>{exportNotice}</span>
        </div>
      )}

      {!sourceFile ? (
        /* EMPTY UPLOAD STATE — Clean 2-Column Balanced Hero Dropzone */
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              const f = e.dataTransfer.files?.[0];
              if (f) void handleSelectPhoto(f);
            }}
            className={`lg:col-span-7 rounded-2xl border-2 border-dashed p-10 sm:p-12 flex flex-col items-center justify-center text-center transition-all ${
              isDragging
                ? 'border-blue-600 bg-blue-50/70'
                : 'border-blue-200 bg-white hover:border-blue-400'
            }`}
          >
            <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-700 inline-flex items-center justify-center mb-5">
              <Upload className="w-6 h-6" aria-hidden="true" />
            </div>

            <h2 className="font-display text-xl font-bold text-slate-900">
              Unggah atau jatuhkan foto Anda di sini
            </h2>
            <p className="mt-2 text-sm text-slate-600 max-w-md leading-relaxed">
              Mendukung foto potret, pas foto, produk, dan logo dalam format JPG, PNG, atau WebP.
              AI memisahkan latar belakang secara otomatis langsung di browser Anda.
            </p>

            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-xl transition-colors whitespace-nowrap"
              >
                <Upload className="w-4 h-4" aria-hidden="true" />
                Pilih Foto dari Perangkat
              </button>

              <button
                type="button"
                onClick={handleLoadSample}
                disabled={processing}
                className="inline-flex items-center gap-2 px-5 py-3 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors whitespace-nowrap disabled:opacity-60"
              >
                {processing ? (
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                ) : (
                  <ImagePlus className="w-4 h-4" aria-hidden="true" />
                )}
                Coba dengan Foto Studio Contoh
              </button>
            </div>

            <div className="mt-8 pt-6 border-t border-slate-100 w-full flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-slate-500">
              <span>Potongan tepi halus HD</span>
              <span aria-hidden="true">&middot;</span>
              <span>Pas Foto Biru &amp; Merah Instan</span>
              <span aria-hidden="true">&middot;</span>
              <span>Ekspor PNG, JPG &amp; PDF</span>
            </div>
          </div>

          {/* Right Preview Showcase of Sample + Studio Backdrops */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-6 flex flex-col justify-between gap-5">
            <div className="space-y-1">
              <h3 className="font-display text-sm font-semibold text-slate-900">
                Koleksi Latar Studio Siap Pakai
              </h3>
              <p className="text-xs text-slate-500">
                Ganti latar belakang ke suasana profesional lengkap dengan efek bokeh DSLR dan bayangan alami.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="relative rounded-xl overflow-hidden border border-slate-200 aspect-[4/3] bg-slate-100">
                <img
                  src={SAMPLE_PORTRAIT_URL}
                  alt="Contoh foto potret studio"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover object-top"
                />
                <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-slate-900/75 text-white text-[11px] font-medium">
                  Foto Contoh
                </span>
              </div>
              {photoPresets.slice(0, 3).map((preset) => (
                <div
                  key={preset.id}
                  className="relative rounded-xl overflow-hidden border border-slate-200 aspect-[4/3] bg-slate-100"
                >
                  {preset.imageUrl && (
                    <img
                      src={preset.imageUrl}
                      alt={preset.label}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  )}
                  <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-slate-900/70 text-white text-[11px] font-medium">
                    {preset.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : (
        /* ACTIVE AI STUDIO WORKSPACE */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT INTERACTIVE BEFORE/AFTER STUDIO VIEWPORT */}
          <div className="lg:col-span-7 space-y-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4">
              {/* Viewport Top Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate max-w-xs">
                    {sourceFile.name}
                  </p>
                  <p className="text-xs font-mono tabular-nums text-slate-500 mt-0.5">
                    {cutout
                      ? `${cutout.width} × ${cutout.height} px · ${
                          cutout.engineUsed === 'neural-ai'
                            ? 'AI Neural HD'
                            : 'Pemotong Presisi Cepat'
                        }`
                      : formatFileSize(sourceFile.size)}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setCompareEnabled((v) => !v)}
                  disabled={!compositeUrl}
                  aria-pressed={compareEnabled}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap disabled:opacity-50 ${
                    compareEnabled
                      ? 'border-blue-600 bg-blue-50 text-blue-800'
                      : 'border-slate-200 bg-white text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <SplitSquareHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
                  Bandingkan Sebelum / Sesudah
                </button>
              </div>

              {/* Main Stage */}
              <div
                style={CHECKERBOARD_STYLE}
                className="relative rounded-xl border border-slate-200 overflow-hidden min-h-[380px] sm:min-h-[480px] flex items-center justify-center"
              >
                {processing ? (
                  <div className="bg-white/95 backdrop-blur-xs border border-slate-200 rounded-2xl px-8 py-7 text-center max-w-sm w-full mx-4 space-y-3 shadow-xs">
                    <Loader2 className="w-7 h-7 text-blue-700 animate-spin mx-auto" aria-hidden="true" />
                    <p className="font-display text-sm font-semibold text-slate-900">
                      {progressLabel || 'AI sedang memproses gambar...'}
                    </p>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-700 transition-all duration-200"
                        style={{ width: `${Math.max(8, progressPct)}%` }}
                      />
                    </div>
                    <p className="text-xs font-mono tabular-nums text-slate-500">{progressPct}%</p>
                  </div>
                ) : compositeUrl && sourceUrl ? (
                  <div className="relative w-full max-w-[540px] mx-auto select-none">
                    {/* Processed Result Layer */}
                    <img
                      src={compositeUrl}
                      alt="Hasil AI Background"
                      data-testid="ai-bg-result-image"
                      className="w-full h-auto max-h-[540px] object-contain block mx-auto"
                    />

                    {/* Original Clipped Layer for Before/After Comparison */}
                    {compareEnabled && (
                      <>
                        <div
                          className="absolute inset-0 overflow-hidden pointer-events-none"
                          style={{ clipPath: `inset(0 ${100 - splitPct}% 0 0)` }}
                        >
                          <img
                            src={sourceUrl}
                            alt="Foto asli sebelum diproses"
                            className="w-full h-full object-contain block mx-auto"
                          />
                        </div>

                        {/* Vertical Divider Line */}
                        <div
                          aria-hidden="true"
                          className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-blue-600 shadow-xs"
                          style={{ left: `${splitPct}%` }}
                        >
                          <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-blue-700 text-white border-2 border-white shadow-sm flex items-center justify-center text-[10px] font-bold">
                            &harr;
                          </div>
                        </div>

                        {/* Labels */}
                        <span className="pointer-events-none absolute top-3 left-3 px-2.5 py-1 rounded-md bg-slate-900/75 text-white text-[11px] font-medium">
                          Asli
                        </span>
                        <span className="pointer-events-none absolute top-3 right-3 px-2.5 py-1 rounded-md bg-blue-700/90 text-white text-[11px] font-medium">
                          {studioMode === 'remove' ? 'Transparan' : 'Hasil AI'}
                        </span>
                      </>
                    )}
                  </div>
                ) : null}
              </div>

              {/* Comparison Slider Control */}
              {compareEnabled && compositeUrl && !processing && (
                <div className="flex items-center gap-3 pt-1">
                  <span className="text-xs text-slate-500 whitespace-nowrap">Asli</span>
                  <input
                    type="range"
                    aria-label="Geser perbandingan sebelum dan sesudah"
                    min={0}
                    max={100}
                    value={splitPct}
                    onChange={(e) => setSplitPct(Number(e.target.value))}
                    className="w-full accent-blue-700"
                  />
                  <span className="text-xs text-blue-700 font-medium whitespace-nowrap">Hasil</span>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT STUDIO CONTROLS & EXPORT PANEL */}
          <aside className="lg:col-span-5 lg:sticky lg:top-24 bg-white border border-slate-200 rounded-2xl p-6 space-y-6">
            {/* Engine Selector */}
            <div className="space-y-3 pb-5 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-sm font-semibold text-slate-900">
                  Mesin AI Pemisah Subjek
                </h2>
                <button
                  type="button"
                  disabled={processing || !sourceFile}
                  onClick={() => sourceFile && void runSegmentation(sourceFile, engineMode, tolerance)}
                  className="text-xs font-medium text-blue-700 hover:text-blue-800 disabled:opacity-50"
                >
                  Proses Ulang
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEngineMode('neural-ai');
                    if (sourceFile) void runSegmentation(sourceFile, 'neural-ai', tolerance);
                  }}
                  className={`p-2.5 rounded-xl border text-left transition-colors ${
                    engineMode === 'neural-ai'
                      ? 'border-blue-600 bg-blue-50/70 text-blue-950'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <p className="text-xs font-semibold">AI Neural HD</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Terbaik untuk latar ramai</p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEngineMode('precision-fast');
                    if (sourceFile) void runSegmentation(sourceFile, 'precision-fast', tolerance);
                  }}
                  className={`p-2.5 rounded-xl border text-left transition-colors ${
                    engineMode === 'precision-fast'
                      ? 'border-blue-600 bg-blue-50/70 text-blue-950'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <p className="text-xs font-semibold">Presisi Studio Cepat</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Instan untuk latar studio/polos</p>
                </button>
              </div>

              {engineMode === 'precision-fast' && (
                <div className="space-y-1 pt-1">
                  <div className="flex items-center justify-between text-xs">
                    <label htmlFor="ai-tol" className="text-slate-600 font-medium">
                      Sensitivitas Pemotongan Tepi
                    </label>
                    <span className="font-mono tabular-nums text-slate-700">{tolerance}</span>
                  </div>
                  <input
                    id="ai-tol"
                    type="range"
                    min={8}
                    max={48}
                    value={tolerance}
                    onChange={(e) => setTolerance(Number(e.target.value))}
                    onMouseUp={() => sourceFile && void runSegmentation(sourceFile, 'precision-fast', tolerance)}
                    onTouchEnd={() => sourceFile && void runSegmentation(sourceFile, 'precision-fast', tolerance)}
                    className="w-full accent-blue-700"
                  />
                </div>
              )}
            </div>

            {/* Background Picker (when Change Mode is active, or shortcut to enter Change Mode) */}
            {studioMode === 'change' ? (
              <div className="space-y-4 pb-5 border-b border-slate-100">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-display text-sm font-semibold text-slate-900">
                    Pilih Latar Belakang Baru
                  </h2>
                  <button
                    type="button"
                    onClick={() => customBgInputRef.current?.click()}
                    className="text-xs font-medium text-blue-700 hover:text-blue-800 whitespace-nowrap"
                  >
                    + Unggah Latar
                  </button>
                </div>

                {/* Sub-tabs */}
                <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg">
                  {(
                    [
                      ['photo', 'Foto Studio'],
                      ['solid', 'Warna / Pas Foto'],
                      ['gradient', 'Gradien'],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setBgTab(id)}
                      className={`py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                        bgTab === id ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {bgTab === 'photo' && (
                  <div className="grid grid-cols-2 gap-2.5">
                    {photoPresets.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setSelectedPresetId(preset.id)}
                        className={`relative rounded-xl overflow-hidden border-2 aspect-[16/10] text-left transition-all ${
                          selectedPresetId === preset.id
                            ? 'border-blue-600 ring-2 ring-blue-600/20'
                            : 'border-slate-200 hover:border-blue-300'
                        }`}
                      >
                        {preset.imageUrl && (
                          <img
                            src={preset.imageUrl}
                            alt={preset.label}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        )}
                        <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/80 via-slate-950/35 to-transparent px-2.5 py-1.5 text-[11px] font-medium text-white">
                          {preset.label}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {bgTab === 'solid' && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-2">
                      {solidPresets.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => setSelectedPresetId(preset.id)}
                          className={`p-2 rounded-xl border text-left transition-all flex items-center gap-2 ${
                            selectedPresetId === preset.id
                              ? 'border-blue-600 bg-blue-50/50'
                              : 'border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <span
                            className="w-5 h-5 rounded-md border border-slate-300 shrink-0"
                            style={{ backgroundColor: preset.color }}
                          />
                          <span className="text-[11px] font-medium text-slate-800 truncate">
                            {preset.label}
                          </span>
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center justify-between gap-3 pt-1">
                      <label htmlFor="custom-bg-color" className="text-xs text-slate-600 font-medium">
                        Warna Kustom
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          id="custom-bg-color"
                          type="color"
                          value={customSolidColor}
                          onChange={(e) => {
                            setCustomSolidColor(e.target.value);
                            setSelectedPresetId('custom-solid');
                          }}
                          className="w-8 h-8 rounded cursor-pointer border border-slate-200"
                        />
                        <span className="text-xs font-mono text-slate-600 uppercase">
                          {customSolidColor}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {bgTab === 'gradient' && (
                  <div className="grid grid-cols-2 gap-2.5">
                    {gradientPresets.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setSelectedPresetId(preset.id)}
                        className={`h-14 rounded-xl border-2 px-3 flex items-end pb-2 text-left transition-all ${
                          selectedPresetId === preset.id
                            ? 'border-blue-600 ring-2 ring-blue-600/20'
                            : 'border-slate-200 hover:border-blue-300'
                        }`}
                        style={{
                          backgroundImage: preset.gradient
                            ? `linear-gradient(135deg, ${preset.gradient[0]}, ${preset.gradient[1]})`
                            : undefined,
                        }}
                      >
                        <span className="px-2 py-0.5 rounded bg-white/85 text-slate-900 text-[11px] font-medium">
                          {preset.label}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Studio Realism Sliders */}
                <div className="pt-3 border-t border-slate-100 space-y-3">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-blue-700" aria-hidden="true" />
                    <span>Penyempurnaan Realisme Studio</span>
                  </div>

                  {(activePreset?.category === 'photo' || selectedPresetId === 'custom-photo') && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-slate-600">
                        <label htmlFor="bg-blur">Bokeh / Blur Latar</label>
                        <span className="font-mono tabular-nums">{blurPx}px</span>
                      </div>
                      <input
                        id="bg-blur"
                        type="range"
                        min={0}
                        max={20}
                        value={blurPx}
                        onChange={(e) => setBlurPx(Number(e.target.value))}
                        className="w-full accent-blue-700"
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-slate-600">
                        <label htmlFor="edge-feather">Halus Tepi</label>
                        <span className="font-mono tabular-nums">{featherPx}px</span>
                      </div>
                      <input
                        id="edge-feather"
                        type="range"
                        min={0}
                        max={6}
                        step={0.5}
                        value={featherPx}
                        onChange={(e) => setFeatherPx(Number(e.target.value))}
                        className="w-full accent-blue-700"
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-slate-600">
                        <label htmlFor="ambient-match">Cahaya Latar</label>
                        <span className="font-mono tabular-nums">{ambientMatchPct}%</span>
                      </div>
                      <input
                        id="ambient-match"
                        type="range"
                        min={0}
                        max={30}
                        value={ambientMatchPct}
                        onChange={(e) => setAmbientMatchPct(Number(e.target.value))}
                        className="w-full accent-blue-700"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-slate-600">
                        <label htmlFor="subj-scale">Skala Subjek</label>
                        <span className="font-mono tabular-nums">{Math.round(subjectScale * 100)}%</span>
                      </div>
                      <input
                        id="subj-scale"
                        type="range"
                        min={0.7}
                        max={1.2}
                        step={0.05}
                        value={subjectScale}
                        onChange={(e) => setSubjectScale(Number(e.target.value))}
                        className="w-full accent-blue-700"
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-slate-600">
                        <label htmlFor="subj-offset">Posisi Vertikal</label>
                        <span className="font-mono tabular-nums">{verticalOffsetPct}%</span>
                      </div>
                      <input
                        id="subj-offset"
                        type="range"
                        min={-15}
                        max={15}
                        value={verticalOffsetPct}
                        onChange={(e) => setVerticalOffsetPct(Number(e.target.value))}
                        className="w-full accent-blue-700"
                      />
                    </div>
                  </div>

                  <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={dropShadow}
                      onChange={(e) => setDropShadow(e.target.checked)}
                      className="rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                    />
                    <span>Aktifkan bayangan studio alami di belakang subjek</span>
                  </label>
                </div>
              </div>
            ) : (
              <div className="space-y-3 pb-5 border-b border-slate-100">
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-slate-600">
                    <label htmlFor="remove-feather">Kehalusan Tepi Transparan</label>
                    <span className="font-mono tabular-nums">{featherPx}px</span>
                  </div>
                  <input
                    id="remove-feather"
                    type="range"
                    min={0}
                    max={6}
                    step={0.5}
                    value={featherPx}
                    onChange={(e) => setFeatherPx(Number(e.target.value))}
                    className="w-full accent-blue-700"
                  />
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Ingin langsung mengganti latar belakang ke warna pas foto biru/merah atau ruang studio?{' '}
                  <button
                    type="button"
                    onClick={() => handleSwitchMode('change')}
                    className="text-blue-700 font-semibold hover:underline"
                  >
                    Buka Studio Ganti Background
                  </button>
                </p>
              </div>
            )}

            {/* Export Actions */}
            <div className="space-y-2.5">
              <button
                type="button"
                disabled={processing || !compositeUrl}
                onClick={() => void handleExportImage('png')}
                className="w-full py-3 px-4 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-50 whitespace-nowrap"
              >
                <Download className="w-4 h-4" aria-hidden="true" />
                {studioMode === 'remove' ? 'Unduh PNG Transparan HD' : 'Unduh PNG HD'}
              </button>

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  disabled={processing || !compositeUrl}
                  onClick={() => void handleExportImage('jpeg')}
                  className="py-2.5 px-3 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold transition-colors inline-flex items-center justify-center gap-1.5 disabled:opacity-50 whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" aria-hidden="true" />
                  Unduh JPG
                </button>
                <button
                  type="button"
                  disabled={processing || !compositeUrl}
                  onClick={() => void handleExportPdf()}
                  className="py-2.5 px-3 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors inline-flex items-center justify-center gap-1.5 disabled:opacity-50 whitespace-nowrap"
                >
                  <FileDown className="w-3.5 h-3.5" aria-hidden="true" />
                  Simpan PDF
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
