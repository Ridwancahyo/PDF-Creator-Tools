import { useState } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';
import type { ToolId } from '../types/pdf';
import {
  computeResizedDimensions,
  computeUpscaleDimensions,
  IMAGE_RESIZE_PRESETS,
  type ImageTargetFormat,
  type ResizeMode,
  type SharpenStrength,
  type UpscaleFactor,
} from '../utils/imageToolsMath';
import type { CropMarginsMm, PageNumberOptions, WatermarkOptions } from '../utils/pdfHelpers';
import { SignaturePad } from './SignaturePad';

export interface WorkspaceOptionsState {
  // Split
  splitMode: 'range' | 'all' | 'fixed';
  splitRange: string;
  splitFixedSize: number;
  // Extract
  extractAsZip: boolean;
  // Rotate
  rotateAngle: 90 | 180 | 270;
  rotateScope: 'all' | 'selected';
  // Compress
  compressLevel: 'low' | 'recommended' | 'extreme';
  // JPG to PDF
  jpgPageSize: 'a4' | 'letter' | 'fit';
  jpgOrientation: 'portrait' | 'landscape';
  jpgMarginMm: number;
  // PDF to JPG
  pdfToImageFormat: 'jpeg' | 'png';
  pdfToImageDpi: number;
  // Page numbers
  pageNumber: PageNumberOptions;
  // Watermark
  watermark: WatermarkOptions;
  // Crop
  crop: CropMarginsMm;
  // Edit PDF
  editMode: 'text' | 'highlight';
  editNoteText: string;
  editNoteColor: string;
  editFontSize: number;
  // Sign PDF
  signatureDataUrl: string | null;
  // Protect / Metadata
  protectMode: 'protect' | 'clean-metadata';
  metaTitle: string;
  metaAuthor: string;
  metaSubject: string;
  classificationBanner: string;
  // HTML direct input
  htmlDirectCode: string;
  // Image Format Convert (JPG/PNG/JPEG)
  imageTargetFormat: ImageTargetFormat;
  imageQuality: number;
  imageBgFillHex: string;
  // HEIC to JPG / PNG / PDF
  heicOutputFormat: 'jpg' | 'png' | 'pdf';
  heicQuality: number;
  heicPdfPageSize: 'a4' | 'letter' | 'fit';
  // Image Upscale HD
  upscaleFactor: UpscaleFactor;
  upscaleSharpen: SharpenStrength;
  upscaleFormat: ImageTargetFormat;
  // Image Resize
  resizeMode: ResizeMode;
  resizeWidth: number;
  resizeHeight: number;
  resizePercent: number;
  resizeLockAspect: boolean;
  resizePresetId: string;
  resizeFormat: ImageTargetFormat;
  // Lock PDF (RC4-128 Password)
  lockUserPassword: string;
  lockConfirmPassword: string;
  lockOwnerPassword: string;
  lockAllowPrint: boolean;
  lockAllowCopy: boolean;
  // Unlock PDF
  unlockPassword: string;
}

export const DEFAULT_WORKSPACE_OPTIONS: WorkspaceOptionsState = {
  splitMode: 'range',
  splitRange: '1-2',
  splitFixedSize: 2,
  extractAsZip: false,
  rotateAngle: 90,
  rotateScope: 'all',
  compressLevel: 'recommended',
  jpgPageSize: 'a4',
  jpgOrientation: 'portrait',
  jpgMarginMm: 10,
  pdfToImageFormat: 'jpeg',
  pdfToImageDpi: 1.5,
  pageNumber: {
    position: 'bottom-center',
    format: 'page-of-total',
    startNumber: 1,
    fontSize: 10,
    marginPt: 24,
  },
  watermark: {
    text: 'RAHASIA',
    opacity: 0.25,
    fontSize: 44,
    rotation: 45,
    colorHex: '#1d4ed8',
    position: 'center',
  },
  crop: {
    top: 10,
    right: 10,
    bottom: 10,
    left: 10,
  },
  editMode: 'text',
  editNoteText: 'Disetujui oleh Ridwan',
  editNoteColor: '#1d4ed8',
  editFontSize: 14,
  signatureDataUrl: null,
  protectMode: 'protect',
  metaTitle: '',
  metaAuthor: 'Ridwan',
  metaSubject: '',
  classificationBanner: 'DOKUMEN INTERNAL TERBATAS',
  htmlDirectCode:
    '<h1>Laporan Ringkas PDF Creator Tools</h1>\n<p>Tempelkan kode HTML atau teks Anda di sini untuk langsung dikonversi menjadi dokumen PDF yang rapi.</p>',
  imageTargetFormat: 'jpg',
  imageQuality: 0.92,
  imageBgFillHex: '#ffffff',
  heicOutputFormat: 'jpg',
  heicQuality: 0.92,
  heicPdfPageSize: 'a4',
  upscaleFactor: 2,
  upscaleSharpen: 'crisp',
  upscaleFormat: 'png',
  resizeMode: 'pixels',
  resizeWidth: 1280,
  resizeHeight: 720,
  resizePercent: 50,
  resizeLockAspect: true,
  resizePresetId: 'fhd',
  resizeFormat: 'jpg',
  lockUserPassword: '',
  lockConfirmPassword: '',
  lockOwnerPassword: '',
  lockAllowPrint: true,
  lockAllowCopy: false,
  unlockPassword: '',
};

interface ToolOptionsPanelProps {
  toolId: ToolId;
  options: WorkspaceOptionsState;
  onChange: (patch: Partial<WorkspaceOptionsState>) => void;
  totalPages: number;
  selectedPagesCount: number;
  annotationCount: number;
  onClearAnnotations: () => void;
  sourceImageDimensions?: { width: number; height: number };
  firstFileName?: string;
}

export function ToolOptionsPanel({
  toolId,
  options,
  onChange,
  totalPages,
  selectedPagesCount,
  annotationCount,
  onClearAnnotations,
  sourceImageDimensions,
  firstFileName,
}: ToolOptionsPanelProps) {
  const [showPassword, setShowPassword] = useState(false);

  switch (toolId) {
    case 'merge':
      return (
        <div className="space-y-3 text-sm text-slate-600">
          <p className="leading-relaxed">
            Gunakan tombol panah naik/turun pada daftar berkas di sebelah kiri untuk mengatur
            urutan penggabungan halaman PDF.
          </p>
        </div>
      );

    case 'split':
      return (
        <div className="space-y-4">
          <div className="space-y-2">
            <span className="block text-xs font-medium text-slate-700">Mode Pemisahan</span>
            <div className="grid grid-cols-1 gap-2">
              {[
                { id: 'range', label: 'Berdasarkan rentang halaman', desc: 'Contoh: 1-2, 4' },
                { id: 'all', label: 'Pisahkan setiap halaman', desc: 'Tiap halaman jadi 1 PDF (ZIP)' },
                { id: 'fixed', label: 'Bagi per jumlah halaman tetap', desc: 'Kelompokkan per N halaman' },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() =>
                    onChange({ splitMode: item.id as WorkspaceOptionsState['splitMode'] })
                  }
                  className={`text-left p-3 rounded-xl border transition-colors ${
                    options.splitMode === item.id
                      ? 'border-blue-600 bg-blue-50/70 text-blue-950'
                      : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700'
                  }`}
                >
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{item.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {options.splitMode === 'range' && (
            <div className="space-y-1.5">
              <label htmlFor="split-range" className="block text-xs font-medium text-slate-700">
                Rentang Halaman (1–{Math.max(1, totalPages)})
              </label>
              <input
                id="split-range"
                type="text"
                value={options.splitRange}
                onChange={(e) => onChange({ splitRange: e.target.value })}
                placeholder="1-2, 4"
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 focus:border-blue-600 focus:outline-none"
              />
            </div>
          )}

          {options.splitMode === 'fixed' && (
            <div className="space-y-1.5">
              <label htmlFor="split-fixed" className="block text-xs font-medium text-slate-700">
                Jumlah Halaman per File
              </label>
              <input
                id="split-fixed"
                type="number"
                min={1}
                max={Math.max(1, totalPages)}
                value={options.splitFixedSize}
                onChange={(e) =>
                  onChange({ splitFixedSize: Math.max(1, Number(e.target.value) || 1) })
                }
                className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-lg border border-slate-200 focus:border-blue-600 focus:outline-none"
              />
            </div>
          )}
        </div>
      );

    case 'remove-pages':
      return (
        <div className="space-y-3 text-sm text-slate-600">
          <p className="leading-relaxed">
            Klik halaman pada pratinjau di sebelah kiri untuk menandainya agar dihapus dari dokumen.
          </p>
          <p className="text-xs font-mono tabular-nums text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
            Halaman ditandai untuk dihapus: <strong>{selectedPagesCount}</strong> dari {totalPages}
          </p>
        </div>
      );

    case 'extract-pages':
      return (
        <div className="space-y-4 text-sm text-slate-600">
          <p className="leading-relaxed">
            Klik halaman yang ingin Anda ekstrak dari dokumen PDF ini.
          </p>
          <p className="text-xs font-mono tabular-nums text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
            Halaman terpilih: <strong>{selectedPagesCount}</strong> dari {totalPages}
          </p>
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={options.extractAsZip}
              onChange={(e) => onChange({ extractAsZip: e.target.checked })}
              className="mt-0.5 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
            />
            <span className="text-xs text-slate-700 leading-relaxed">
              Simpan setiap halaman terpilih sebagai file PDF terpisah dalam satu arsip ZIP
            </span>
          </label>
        </div>
      );

    case 'organize':
      return (
        <div className="space-y-3 text-sm text-slate-600">
          <p className="leading-relaxed">
            Gunakan kontrol di setiap kartu halaman untuk menggeser urutan kiri/kanan, memutar
            orientasi 90°, menduplikasi, atau menghapus halaman sebelum menyimpan PDF baru.
          </p>
          <p className="text-xs font-mono tabular-nums text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
            Total halaman saat ini: <strong>{totalPages}</strong>
          </p>
        </div>
      );

    case 'rotate':
      return (
        <div className="space-y-4">
          <div className="space-y-2">
            <span className="block text-xs font-medium text-slate-700">Sudut Rotasi</span>
            <div className="grid grid-cols-3 gap-2">
              {([90, 180, 270] as const).map((deg) => (
                <button
                  key={deg}
                  type="button"
                  onClick={() => onChange({ rotateAngle: deg })}
                  className={`py-2.5 text-sm font-mono tabular-nums font-medium rounded-lg border transition-colors ${
                    options.rotateAngle === deg
                      ? 'border-blue-600 bg-blue-50 text-blue-800'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                  }`}
                >
                  {deg}&deg;
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <span className="block text-xs font-medium text-slate-700">Cakupan Halaman</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onChange({ rotateScope: 'all' })}
                className={`py-2 px-3 text-xs font-medium rounded-lg border transition-colors ${
                  options.rotateScope === 'all'
                    ? 'border-blue-600 bg-blue-50 text-blue-800'
                    : 'border-slate-200 bg-white text-slate-700'
                }`}
              >
                Semua Halaman
              </button>
              <button
                type="button"
                onClick={() => onChange({ rotateScope: 'selected' })}
                className={`py-2 px-3 text-xs font-medium rounded-lg border transition-colors ${
                  options.rotateScope === 'selected'
                    ? 'border-blue-600 bg-blue-50 text-blue-800'
                    : 'border-slate-200 bg-white text-slate-700'
                }`}
              >
                Terpilih ({selectedPagesCount})
              </button>
            </div>
          </div>
        </div>
      );

    case 'compress':
      return (
        <div className="space-y-3">
          <span className="block text-xs font-medium text-slate-700">Tingkat Kompresi</span>
          <div className="space-y-2">
            {[
              {
                id: 'low',
                title: 'Kompresi Ringan',
                desc: 'Optimasi struktur objek tanpa mengurangi ketajaman teks.',
              },
              {
                id: 'recommended',
                title: 'Direkomendasikan',
                desc: 'Keseimbangan ideal antara ukuran ringan dan kejernihan visual.',
              },
              {
                id: 'extreme',
                title: 'Kompresi Maksimal',
                desc: 'Ukuran berkas paling kecil untuk pengiriman cepat lewat email.',
              },
            ].map((lvl) => (
              <button
                key={lvl.id}
                type="button"
                onClick={() =>
                  onChange({
                    compressLevel: lvl.id as WorkspaceOptionsState['compressLevel'],
                  })
                }
                className={`w-full text-left p-3 rounded-xl border transition-colors ${
                  options.compressLevel === lvl.id
                    ? 'border-blue-600 bg-blue-50/70 text-blue-950'
                    : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700'
                }`}
              >
                <p className="text-sm font-medium">{lvl.title}</p>
                <p className="text-xs text-slate-500 mt-0.5">{lvl.desc}</p>
              </button>
            ))}
          </div>
        </div>
      );

    case 'jpg-to-pdf':
      return (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="jpg-page-size" className="block text-xs font-medium text-slate-700">
              Ukuran Kertas
            </label>
            <select
              id="jpg-page-size"
              value={options.jpgPageSize}
              onChange={(e) =>
                onChange({
                  jpgPageSize: e.target.value as WorkspaceOptionsState['jpgPageSize'],
                })
              }
              className="w-full pl-3 pr-8 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:border-blue-600 focus:outline-none"
            >
              <option value="a4">A4 (210 &times; 297 mm)</option>
              <option value="letter">US Letter</option>
              <option value="fit">Sesuai Ukuran Asli Gambar</option>
            </select>
          </div>

          {options.jpgPageSize !== 'fit' && (
            <div className="space-y-1.5">
              <span className="block text-xs font-medium text-slate-700">Orientasi</span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onChange({ jpgOrientation: 'portrait' })}
                  className={`py-2 text-xs font-medium rounded-lg border ${
                    options.jpgOrientation === 'portrait'
                      ? 'border-blue-600 bg-blue-50 text-blue-800'
                      : 'border-slate-200 bg-white text-slate-700'
                  }`}
                >
                  Potret (Tegak)
                </button>
                <button
                  type="button"
                  onClick={() => onChange({ jpgOrientation: 'landscape' })}
                  className={`py-2 text-xs font-medium rounded-lg border ${
                    options.jpgOrientation === 'landscape'
                      ? 'border-blue-600 bg-blue-50 text-blue-800'
                      : 'border-slate-200 bg-white text-slate-700'
                  }`}
                >
                  Lanskap (Mendatar)
                </button>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="jpg-margin" className="block text-xs font-medium text-slate-700">
              Margin Kertas ({options.jpgMarginMm} mm)
            </label>
            <input
              id="jpg-margin"
              type="range"
              min={0}
              max={30}
              step={2}
              value={options.jpgMarginMm}
              onChange={(e) => onChange({ jpgMarginMm: Number(e.target.value) })}
              className="w-full accent-blue-700"
            />
          </div>
        </div>
      );

    case 'pdf-to-jpg':
      return (
        <div className="space-y-4">
          <div className="space-y-2">
            <span className="block text-xs font-medium text-slate-700">Format Gambar</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onChange({ pdfToImageFormat: 'jpeg' })}
                className={`py-2 text-xs font-medium rounded-lg border ${
                  options.pdfToImageFormat === 'jpeg'
                    ? 'border-blue-600 bg-blue-50 text-blue-800'
                    : 'border-slate-200 bg-white text-slate-700'
                }`}
              >
                JPG (Ringan)
              </button>
              <button
                type="button"
                onClick={() => onChange({ pdfToImageFormat: 'png' })}
                className={`py-2 text-xs font-medium rounded-lg border ${
                  options.pdfToImageFormat === 'png'
                    ? 'border-blue-600 bg-blue-50 text-blue-800'
                    : 'border-slate-200 bg-white text-slate-700'
                }`}
              >
                PNG (Tajam)
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="pdf-dpi" className="block text-xs font-medium text-slate-700">
              Resolusi Ekspor
            </label>
            <select
              id="pdf-dpi"
              value={options.pdfToImageDpi}
              onChange={(e) => onChange({ pdfToImageDpi: Number(e.target.value) })}
              className="w-full pl-3 pr-8 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:border-blue-600 focus:outline-none"
            >
              <option value={1}>Standar (72 DPI)</option>
              <option value={1.5}>Tinggi (150 DPI — Direkomendasikan)</option>
              <option value={2.2}>Sangat Tajam (220 DPI)</option>
            </select>
          </div>
        </div>
      );

    case 'page-numbers':
      return (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="pn-pos" className="block text-xs font-medium text-slate-700">
              Posisi Nomor Halaman
            </label>
            <select
              id="pn-pos"
              value={options.pageNumber.position}
              onChange={(e) =>
                onChange({
                  pageNumber: {
                    ...options.pageNumber,
                    position: e.target.value as PageNumberOptions['position'],
                  },
                })
              }
              className="w-full pl-3 pr-8 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:border-blue-600 focus:outline-none"
            >
              <option value="bottom-center">Bawah Tengah</option>
              <option value="bottom-right">Bawah Kanan</option>
              <option value="bottom-left">Bawah Kiri</option>
              <option value="top-center">Atas Tengah</option>
              <option value="top-right">Atas Kanan</option>
              <option value="top-left">Atas Kiri</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="pn-format" className="block text-xs font-medium text-slate-700">
              Format Penomoran
            </label>
            <select
              id="pn-format"
              value={options.pageNumber.format}
              onChange={(e) =>
                onChange({
                  pageNumber: {
                    ...options.pageNumber,
                    format: e.target.value as PageNumberOptions['format'],
                  },
                })
              }
              className="w-full pl-3 pr-8 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:border-blue-600 focus:outline-none"
            >
              <option value="page-of-total">Halaman 1 dari {Math.max(1, totalPages)}</option>
              <option value="number">Angka saja (1, 2, 3)</option>
              <option value="dash-number">Dengan garis (- 1 -)</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="pn-start" className="block text-xs font-medium text-slate-700">
                Mulai Dari
              </label>
              <input
                id="pn-start"
                type="number"
                min={1}
                value={options.pageNumber.startNumber}
                onChange={(e) =>
                  onChange({
                    pageNumber: {
                      ...options.pageNumber,
                      startNumber: Math.max(1, Number(e.target.value) || 1),
                    },
                  })
                }
                className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-lg border border-slate-200 focus:border-blue-600 focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="pn-size" className="block text-xs font-medium text-slate-700">
                Ukuran Font
              </label>
              <input
                id="pn-size"
                type="number"
                min={8}
                max={24}
                value={options.pageNumber.fontSize}
                onChange={(e) =>
                  onChange({
                    pageNumber: {
                      ...options.pageNumber,
                      fontSize: Math.min(24, Math.max(8, Number(e.target.value) || 10)),
                    },
                  })
                }
                className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-lg border border-slate-200 focus:border-blue-600 focus:outline-none"
              />
            </div>
          </div>
        </div>
      );

    case 'watermark':
      return (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="wm-text" className="block text-xs font-medium text-slate-700">
              Teks Watermark
            </label>
            <input
              id="wm-text"
              type="text"
              value={options.watermark.text}
              onChange={(e) =>
                onChange({ watermark: { ...options.watermark, text: e.target.value } })
              }
              placeholder="Contoh: RAHASIA / SALINAN"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="wm-pos" className="block text-xs font-medium text-slate-700">
              Posisi Watermark
            </label>
            <select
              id="wm-pos"
              value={options.watermark.position}
              onChange={(e) =>
                onChange({
                  watermark: {
                    ...options.watermark,
                    position: e.target.value as WatermarkOptions['position'],
                  },
                })
              }
              className="w-full pl-3 pr-8 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:border-blue-600 focus:outline-none"
            >
              <option value="center">Tengah Halaman</option>
              <option value="tile">Pola Berulang (Ubin)</option>
              <option value="top-left">Atas Kiri</option>
              <option value="top-right">Atas Kanan</option>
              <option value="bottom-left">Bawah Kiri</option>
              <option value="bottom-right">Bawah Kanan</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="wm-opacity" className="block text-xs font-medium text-slate-700">
              Transparansi ({Math.round(options.watermark.opacity * 100)}%)
            </label>
            <input
              id="wm-opacity"
              type="range"
              min={0.1}
              max={0.85}
              step={0.05}
              value={options.watermark.opacity}
              onChange={(e) =>
                onChange({
                  watermark: { ...options.watermark, opacity: Number(e.target.value) },
                })
              }
              className="w-full accent-blue-700"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="wm-rot" className="block text-xs font-medium text-slate-700">
                Rotasi ({options.watermark.rotation}&deg;)
              </label>
              <input
                id="wm-rot"
                type="number"
                min={-90}
                max={90}
                step={15}
                value={options.watermark.rotation}
                onChange={(e) =>
                  onChange({
                    watermark: { ...options.watermark, rotation: Number(e.target.value) || 0 },
                  })
                }
                className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-lg border border-slate-200 focus:border-blue-600 focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="wm-size" className="block text-xs font-medium text-slate-700">
                Ukuran ({options.watermark.fontSize}pt)
              </label>
              <input
                id="wm-size"
                type="number"
                min={14}
                max={84}
                value={options.watermark.fontSize}
                onChange={(e) =>
                  onChange({
                    watermark: {
                      ...options.watermark,
                      fontSize: Math.min(84, Math.max(14, Number(e.target.value) || 36)),
                    },
                  })
                }
                className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-lg border border-slate-200 focus:border-blue-600 focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <span className="block text-xs font-medium text-slate-700">Warna Teks</span>
            <div className="flex items-center gap-2">
              {[
                { hex: '#1d4ed8', label: 'Biru' },
                { hex: '#334155', label: 'Abu Gelap' },
                { hex: '#dc2626', label: 'Merah' },
              ].map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  onClick={() =>
                    onChange({ watermark: { ...options.watermark, colorHex: c.hex } })
                  }
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                    options.watermark.colorHex === c.hex
                      ? 'border-blue-600 bg-blue-50 text-blue-900'
                      : 'border-slate-200 bg-white text-slate-600'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      );

    case 'crop':
      return (
        <div className="space-y-4">
          <p className="text-xs text-slate-600 leading-relaxed">
            Tentukan jumlah pemangkasan tepi (dalam milimeter) yang akan diterapkan pada setiap halaman PDF.
          </p>
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                ['top', 'Atas (mm)'],
                ['bottom', 'Bawah (mm)'],
                ['left', 'Kiri (mm)'],
                ['right', 'Kanan (mm)'],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="space-y-1">
                <label htmlFor={`crop-${key}`} className="block text-xs font-medium text-slate-700">
                  {label}
                </label>
                <input
                  id={`crop-${key}`}
                  type="number"
                  min={0}
                  max={80}
                  value={options.crop[key]}
                  onChange={(e) =>
                    onChange({
                      crop: {
                        ...options.crop,
                        [key]: Math.max(0, Math.min(80, Number(e.target.value) || 0)),
                      },
                    })
                  }
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-lg border border-slate-200 focus:border-blue-600 focus:outline-none"
                />
              </div>
            ))}
          </div>
        </div>
      );

    case 'edit-pdf':
      return (
        <div className="space-y-4">
          <div className="space-y-2">
            <span className="block text-xs font-medium text-slate-700">Alat Anotasi</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onChange({ editMode: 'text' })}
                className={`py-2 text-xs font-medium rounded-lg border ${
                  options.editMode === 'text'
                    ? 'border-blue-600 bg-blue-50 text-blue-800'
                    : 'border-slate-200 bg-white text-slate-700'
                }`}
              >
                Tambah Teks
              </button>
              <button
                type="button"
                onClick={() => onChange({ editMode: 'highlight' })}
                className={`py-2 text-xs font-medium rounded-lg border ${
                  options.editMode === 'highlight'
                    ? 'border-blue-600 bg-blue-50 text-blue-800'
                    : 'border-slate-200 bg-white text-slate-700'
                }`}
              >
                Sorot Area
              </button>
            </div>
          </div>

          {options.editMode === 'text' && (
            <>
              <div className="space-y-1.5">
                <label htmlFor="edit-note-text" className="block text-xs font-medium text-slate-700">
                  Isi Teks Anotasi
                </label>
                <input
                  id="edit-note-text"
                  type="text"
                  value={options.editNoteText}
                  onChange={(e) => onChange({ editNoteText: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="edit-note-size" className="block text-xs font-medium text-slate-700">
                  Ukuran Huruf ({options.editFontSize}pt)
                </label>
                <input
                  id="edit-note-size"
                  type="range"
                  min={10}
                  max={28}
                  value={options.editFontSize}
                  onChange={(e) => onChange({ editFontSize: Number(e.target.value) })}
                  className="w-full accent-blue-700"
                />
              </div>
            </>
          )}

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
            <span className="font-mono tabular-nums">Anotasi terpasang: {annotationCount}</span>
            {annotationCount > 0 && (
              <button
                type="button"
                onClick={onClearAnnotations}
                className="text-red-600 hover:text-red-700 font-medium"
              >
                Hapus semua
              </button>
            )}
          </div>
        </div>
      );

    case 'sign-pdf':
      return (
        <div className="space-y-4">
          <SignaturePad onChange={(dataUrl) => onChange({ signatureDataUrl: dataUrl })} />
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
            <span className="font-mono tabular-nums">Tanda tangan ditempatkan: {annotationCount}</span>
            {annotationCount > 0 && (
              <button
                type="button"
                onClick={onClearAnnotations}
                className="text-red-600 hover:text-red-700 font-medium"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      );

    case 'redact-pdf':
      return (
        <div className="space-y-4 text-sm text-slate-600">
          <p className="leading-relaxed">
            Blok hitam sensor akan ditanam secara permanen ke halaman PDF saat disimpan.
          </p>
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
            <span className="font-mono tabular-nums">Blok sensor aktif: {annotationCount}</span>
            {annotationCount > 0 && (
              <button
                type="button"
                onClick={onClearAnnotations}
                className="text-red-600 hover:text-red-700 font-medium"
              >
                Hapus semua
              </button>
            )}
          </div>
        </div>
      );

    case 'protect-pdf':
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onChange({ protectMode: 'protect' })}
              className={`py-2 text-xs font-medium rounded-lg border ${
                options.protectMode === 'protect'
                  ? 'border-blue-600 bg-blue-50 text-blue-800'
                  : 'border-slate-200 bg-white text-slate-700'
              }`}
            >
              Metadata &amp; Cap
            </button>
            <button
              type="button"
              onClick={() => onChange({ protectMode: 'clean-metadata' })}
              className={`py-2 text-xs font-medium rounded-lg border ${
                options.protectMode === 'clean-metadata'
                  ? 'border-blue-600 bg-blue-50 text-blue-800'
                  : 'border-slate-200 bg-white text-slate-700'
              }`}
            >
              Bersihkan Metadata
            </button>
          </div>

          {options.protectMode === 'protect' ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <label htmlFor="meta-title" className="block text-xs font-medium text-slate-700">
                  Judul Dokumen
                </label>
                <input
                  id="meta-title"
                  type="text"
                  value={options.metaTitle}
                  onChange={(e) => onChange({ metaTitle: e.target.value })}
                  placeholder="Laporan Resmi 2026"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="meta-author" className="block text-xs font-medium text-slate-700">
                  Penulis / Pemilik Hak Cipta
                </label>
                <input
                  id="meta-author"
                  type="text"
                  value={options.metaAuthor}
                  onChange={(e) => onChange({ metaAuthor: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="meta-banner" className="block text-xs font-medium text-slate-700">
                  Label Klasifikasi di Header (Opsional)
                </label>
                <input
                  id="meta-banner"
                  type="text"
                  value={options.classificationBanner}
                  onChange={(e) => onChange({ classificationBanner: e.target.value })}
                  placeholder="Contoh: RAHASIA PERUSAHAAN"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-blue-600 focus:outline-none"
                />
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-600 leading-relaxed">
              Mode ini menghapus judul, nama penulis, perangkat lunak pembuat, dan subjek tersembunyi
              sebelum dokumen dibagikan ke publik.
            </p>
          )}
        </div>
      );

    case 'image-convert':
      return (
        <div className="space-y-4">
          <div className="space-y-2">
            <span className="block text-xs font-medium text-slate-700">Format Tujuan</span>
            <div className="grid grid-cols-3 gap-2">
              {(['jpg', 'png', 'jpeg'] as const).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => onChange({ imageTargetFormat: fmt })}
                  aria-pressed={options.imageTargetFormat === fmt}
                  className={`py-2 text-xs font-semibold uppercase rounded-lg border transition-colors ${
                    options.imageTargetFormat === fmt
                      ? 'border-blue-600 bg-blue-50 text-blue-800'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                  }`}
                >
                  {fmt}
                </button>
              ))}
            </div>
          </div>

          {options.imageTargetFormat !== 'png' && (
            <>
              <div className="space-y-1.5">
                <label
                  htmlFor="img-conv-quality"
                  className="block text-xs font-medium text-slate-700"
                >
                  Kualitas {options.imageTargetFormat.toUpperCase()} ({Math.round(options.imageQuality * 100)}%)
                </label>
                <input
                  id="img-conv-quality"
                  type="range"
                  min={0.6}
                  max={1}
                  step={0.02}
                  value={options.imageQuality}
                  onChange={(e) => onChange({ imageQuality: Number(e.target.value) })}
                  className="w-full accent-blue-700"
                />
              </div>

              <div className="space-y-1.5">
                <span className="block text-xs font-medium text-slate-700">
                  Warna Latar (untuk PNG Transparan)
                </span>
                <div className="flex items-center gap-2">
                  {[
                    { hex: '#ffffff', label: 'Putih' },
                    { hex: '#0f172a', label: 'Gelap' },
                    { hex: '#eff6ff', label: 'Biru Lembut' },
                  ].map((bg) => (
                    <button
                      key={bg.hex}
                      type="button"
                      onClick={() => onChange({ imageBgFillHex: bg.hex })}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                        options.imageBgFillHex === bg.hex
                          ? 'border-blue-600 bg-blue-50 text-blue-900'
                          : 'border-slate-200 bg-white text-slate-600'
                      }`}
                    >
                      {bg.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      );

    case 'heic-convert':
      return (
        <div className="space-y-4">
          <div className="space-y-2">
            <span className="block text-xs font-medium text-slate-700">Format Keluaran</span>
            <div className="grid grid-cols-3 gap-2">
              {([
                { id: 'jpg', label: 'JPG' },
                { id: 'png', label: 'PNG' },
                { id: 'pdf', label: 'PDF' },
              ] as const).map((fmt) => (
                <button
                  key={fmt.id}
                  type="button"
                  onClick={() => onChange({ heicOutputFormat: fmt.id })}
                  aria-pressed={options.heicOutputFormat === fmt.id}
                  className={`py-2 text-xs font-semibold rounded-lg border transition-colors ${
                    options.heicOutputFormat === fmt.id
                      ? 'border-blue-600 bg-blue-50 text-blue-800'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                  }`}
                >
                  {fmt.label}
                </button>
              ))}
            </div>
          </div>

          {options.heicOutputFormat !== 'png' && (
            <div className="space-y-1.5">
              <label
                htmlFor="heic-quality"
                className="block text-xs font-medium text-slate-700"
              >
                Kualitas Gambar ({Math.round(options.heicQuality * 100)}%)
              </label>
              <input
                id="heic-quality"
                type="range"
                min={0.65}
                max={1}
                step={0.05}
                value={options.heicQuality}
                onChange={(e) => onChange({ heicQuality: Number(e.target.value) })}
                className="w-full accent-blue-700"
              />
            </div>
          )}

          {options.heicOutputFormat === 'pdf' && (
            <div className="space-y-1.5">
              <label
                htmlFor="heic-pdf-size"
                className="block text-xs font-medium text-slate-700"
              >
                Ukuran Halaman PDF
              </label>
              <select
                id="heic-pdf-size"
                value={options.heicPdfPageSize}
                onChange={(e) =>
                  onChange({
                    heicPdfPageSize: e.target.value as WorkspaceOptionsState['heicPdfPageSize'],
                  })
                }
                className="w-full pl-3 pr-8 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:border-blue-600 focus:outline-none"
              >
                <option value="a4">A4 (210 &times; 297 mm)</option>
                <option value="letter">US Letter</option>
                <option value="fit">Sesuai Ukuran Foto</option>
              </select>
            </div>
          )}
        </div>
      );

    case 'image-upscale': {
      const previewDims = sourceImageDimensions
        ? computeUpscaleDimensions(
            sourceImageDimensions.width,
            sourceImageDimensions.height,
            options.upscaleFactor
          )
        : null;

      return (
        <div className="space-y-4">
          <div className="space-y-2">
            <span className="block text-xs font-medium text-slate-700">Faktor Perbesaran</span>
            <div className="grid grid-cols-3 gap-2">
              {([2, 3, 4] as const).map((factor) => (
                <button
                  key={factor}
                  type="button"
                  onClick={() => onChange({ upscaleFactor: factor })}
                  aria-pressed={options.upscaleFactor === factor}
                  className={`py-2.5 text-sm font-mono tabular-nums font-semibold rounded-lg border transition-colors ${
                    options.upscaleFactor === factor
                      ? 'border-blue-600 bg-blue-50 text-blue-800'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                  }`}
                >
                  {factor}&times; HD
                </button>
              ))}
            </div>
          </div>

          {sourceImageDimensions && previewDims && (
            <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-200/80 text-xs space-y-1">
              <p className="text-slate-600">Estimasi Resolusi Hasil</p>
              <p className="font-mono tabular-nums font-semibold text-blue-900">
                {sourceImageDimensions.width}&times;{sourceImageDimensions.height} &rarr;{' '}
                {previewDims.width}&times;{previewDims.height} px
              </p>
            </div>
          )}

          <div className="space-y-2">
            <span className="block text-xs font-medium text-slate-700">Ketajaman Detail</span>
            <div className="grid grid-cols-3 gap-2">
              {([
                { id: 'natural', label: 'Natural' },
                { id: 'crisp', label: 'Tajam' },
                { id: 'ultra', label: 'Ultra' },
              ] as const).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onChange({ upscaleSharpen: s.id })}
                  aria-pressed={options.upscaleSharpen === s.id}
                  className={`py-2 text-xs font-medium rounded-lg border transition-colors ${
                    options.upscaleSharpen === s.id
                      ? 'border-blue-600 bg-blue-50 text-blue-800'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <span className="block text-xs font-medium text-slate-700">Format Ekspor</span>
            <div className="grid grid-cols-3 gap-2">
              {(['png', 'jpg', 'jpeg'] as const).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => onChange({ upscaleFormat: fmt })}
                  aria-pressed={options.upscaleFormat === fmt}
                  className={`py-2 text-xs font-semibold uppercase rounded-lg border transition-colors ${
                    options.upscaleFormat === fmt
                      ? 'border-blue-600 bg-blue-50 text-blue-800'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                  }`}
                >
                  {fmt}
                </button>
              ))}
            </div>
          </div>
        </div>
      );
    }

    case 'image-resize': {
      const targetPreview = sourceImageDimensions
        ? computeResizedDimensions({
            origW: sourceImageDimensions.width,
            origH: sourceImageDimensions.height,
            mode: options.resizeMode,
            width: options.resizeWidth,
            height: options.resizeHeight,
            percent: options.resizePercent,
            lockAspect: options.resizeLockAspect,
            presetId: options.resizePresetId,
          })
        : null;

      return (
        <div className="space-y-4">
          <div className="space-y-2">
            <span className="block text-xs font-medium text-slate-700">Mode Ubah Ukuran</span>
            <div className="grid grid-cols-3 gap-2">
              {([
                { id: 'pixels', label: 'Piksel' },
                { id: 'percent', label: 'Persen' },
                { id: 'preset', label: 'Preset' },
              ] as const).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onChange({ resizeMode: m.id })}
                  aria-pressed={options.resizeMode === m.id}
                  className={`py-2 text-xs font-medium rounded-lg border transition-colors ${
                    options.resizeMode === m.id
                      ? 'border-blue-600 bg-blue-50 text-blue-800'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {options.resizeMode === 'pixels' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label htmlFor="resize-w" className="block text-xs font-medium text-slate-700">
                    Lebar (px)
                  </label>
                  <input
                    id="resize-w"
                    type="number"
                    min={1}
                    max={8192}
                    value={options.resizeWidth}
                    onChange={(e) => {
                      const nextW = Math.max(1, Number(e.target.value) || 1);
                      if (options.resizeLockAspect && sourceImageDimensions) {
                        const calc = computeResizedDimensions({
                          origW: sourceImageDimensions.width,
                          origH: sourceImageDimensions.height,
                          mode: 'pixels',
                          width: nextW,
                          lockAspect: true,
                          changedAxis: 'width',
                        });
                        onChange({ resizeWidth: calc.width, resizeHeight: calc.height });
                      } else {
                        onChange({ resizeWidth: nextW });
                      }
                    }}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-lg border border-slate-200 focus:border-blue-600 focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="resize-h" className="block text-xs font-medium text-slate-700">
                    Tinggi (px)
                  </label>
                  <input
                    id="resize-h"
                    type="number"
                    min={1}
                    max={8192}
                    value={options.resizeHeight}
                    onChange={(e) => {
                      const nextH = Math.max(1, Number(e.target.value) || 1);
                      if (options.resizeLockAspect && sourceImageDimensions) {
                        const calc = computeResizedDimensions({
                          origW: sourceImageDimensions.width,
                          origH: sourceImageDimensions.height,
                          mode: 'pixels',
                          height: nextH,
                          lockAspect: true,
                          changedAxis: 'height',
                        });
                        onChange({ resizeWidth: calc.width, resizeHeight: calc.height });
                      } else {
                        onChange({ resizeHeight: nextH });
                      }
                    }}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-lg border border-slate-200 focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={options.resizeLockAspect}
                  onChange={(e) => onChange({ resizeLockAspect: e.target.checked })}
                  className="rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                />
                <span className="text-xs text-slate-700">Kunci rasio aspek proporsional</span>
              </label>
            </div>
          )}

          {options.resizeMode === 'percent' && (
            <div className="space-y-2">
              <label htmlFor="resize-pct" className="block text-xs font-medium text-slate-700">
                Skala Ukuran ({options.resizePercent}%)
              </label>
              <input
                id="resize-pct"
                type="range"
                min={10}
                max={200}
                step={5}
                value={options.resizePercent}
                onChange={(e) => onChange({ resizePercent: Number(e.target.value) })}
                className="w-full accent-blue-700"
              />
              <div className="grid grid-cols-4 gap-1.5">
                {[25, 50, 75, 150].map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => onChange({ resizePercent: p })}
                    className={`py-1.5 text-xs font-mono tabular-nums rounded-md border ${
                      options.resizePercent === p
                        ? 'border-blue-600 bg-blue-50 text-blue-800 font-semibold'
                        : 'border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    {p}%
                  </button>
                ))}
              </div>
            </div>
          )}

          {options.resizeMode === 'preset' && (
            <div className="space-y-1.5">
              <label htmlFor="resize-preset" className="block text-xs font-medium text-slate-700">
                Pilih Preset Ukuran
              </label>
              <select
                id="resize-preset"
                value={options.resizePresetId}
                onChange={(e) => onChange({ resizePresetId: e.target.value })}
                className="w-full pl-3 pr-8 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:border-blue-600 focus:outline-none"
              >
                {IMAGE_RESIZE_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {sourceImageDimensions && targetPreview && (
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-xs">
              <span className="text-slate-500">Dimensi baru: </span>
              <span className="font-mono tabular-nums font-semibold text-slate-900">
                {targetPreview.width} &times; {targetPreview.height} px
              </span>
            </div>
          )}

          <div className="space-y-2">
            <span className="block text-xs font-medium text-slate-700">Format Keluaran</span>
            <div className="grid grid-cols-3 gap-2">
              {(['jpg', 'png', 'jpeg'] as const).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => onChange({ resizeFormat: fmt })}
                  aria-pressed={options.resizeFormat === fmt}
                  className={`py-2 text-xs font-semibold uppercase rounded-lg border transition-colors ${
                    options.resizeFormat === fmt
                      ? 'border-blue-600 bg-blue-50 text-blue-800'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                  }`}
                >
                  {fmt}
                </button>
              ))}
            </div>
          </div>
        </div>
      );
    }

    case 'lock-pdf':
      return (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="lock-user-pw" className="block text-xs font-medium text-slate-700">
              Kata Sandi untuk Membuka PDF
            </label>
            <div className="relative">
              <input
                id="lock-user-pw"
                type={showPassword ? 'text' : 'password'}
                value={options.lockUserPassword}
                onChange={(e) => onChange({ lockUserPassword: e.target.value })}
                placeholder="Masukkan kata sandi baru"
                autoComplete="new-password"
                className="w-full pl-3 pr-10 py-2 text-sm rounded-lg border border-slate-200 focus:border-blue-600 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="lock-confirm-pw" className="block text-xs font-medium text-slate-700">
              Konfirmasi Kata Sandi
            </label>
            <input
              id="lock-confirm-pw"
              type={showPassword ? 'text' : 'password'}
              value={options.lockConfirmPassword}
              onChange={(e) => onChange({ lockConfirmPassword: e.target.value })}
              placeholder="Ketik ulang kata sandi"
              autoComplete="new-password"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="lock-owner-pw" className="block text-xs font-medium text-slate-700">
              Kata Sandi Pemilik (Opsional)
            </label>
            <input
              id="lock-owner-pw"
              type={showPassword ? 'text' : 'password'}
              value={options.lockOwnerPassword}
              onChange={(e) => onChange({ lockOwnerPassword: e.target.value })}
              placeholder="Kosongkan jika sama dengan sandi pembuka"
              autoComplete="new-password"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div className="pt-2 border-t border-slate-100 space-y-2.5">
            <span className="block text-xs font-medium text-slate-700">Izin Dokumen</span>
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={options.lockAllowPrint}
                onChange={(e) => onChange({ lockAllowPrint: e.target.checked })}
                className="rounded border-slate-300 text-blue-700 focus:ring-blue-600"
              />
              <span className="text-xs text-slate-700">Izinkan pencetakan dokumen</span>
            </label>
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={options.lockAllowCopy}
                onChange={(e) => onChange({ lockAllowCopy: e.target.checked })}
                className="rounded border-slate-300 text-blue-700 focus:ring-blue-600"
              />
              <span className="text-xs text-slate-700">Izinkan salin teks &amp; gambar</span>
            </label>
          </div>
        </div>
      );

    case 'unlock-pdf':
      return (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="unlock-pw" className="block text-xs font-medium text-slate-700">
              Kata Sandi PDF Saat Ini
            </label>
            <div className="relative">
              <input
                id="unlock-pw"
                type={showPassword ? 'text' : 'password'}
                value={options.unlockPassword}
                onChange={(e) => onChange({ unlockPassword: e.target.value })}
                placeholder="Masukkan kata sandi dokumen"
                autoComplete="current-password"
                className="w-full pl-3 pr-10 py-2 text-sm rounded-lg border border-slate-200 focus:border-blue-600 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {firstFileName === 'Dokumen_Terkunci_Contoh.pdf' && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-blue-50/80 border border-blue-200/80 text-xs text-blue-900">
              <Lock className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <p className="font-medium">File Contoh Terkunci</p>
                <p className="text-blue-800 mt-0.5">
                  Gunakan kata sandi contoh{' '}
                  <code className="font-mono font-semibold bg-white px-1.5 py-0.5 rounded border border-blue-200">
                    ridwan123
                  </code>{' '}
                  untuk menguji buka kunci.
                </p>
              </div>
            </div>
          )}

          <p className="text-xs text-slate-600 leading-relaxed">
            Dekripsi dilakukan sepenuhnya di browser Anda untuk menghasilkan salinan PDF baru tanpa
            proteksi kata sandi.
          </p>
        </div>
      );

    case 'html-to-pdf':
      return (
        <div className="space-y-2 text-xs text-slate-600">
          <p className="leading-relaxed">
            Anda dapat mengunggah file .html atau langsung menyunting kode HTML di area sebelah kiri,
            lalu klik tombol konversi.
          </p>
        </div>
      );

    default:
      return (
        <p className="text-sm text-slate-600 leading-relaxed">
          Berkas siap diproses secara langsung di browser Anda. Klik tombol di bawah untuk
          menjalankan konversi dan mengunduh hasilnya.
        </p>
      );
  }
}
