import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  FilePlus2,
  FileText,
  LayoutGrid,
  Loader2,
  Lock,
  Maximize2,
  RotateCcw,
  RotateCw,
  Trash2,
  Upload,
} from 'lucide-react';
import type {
  AnnotationOverlay,
  DiffLine,
  PageItem,
  PdfToolDefinition,
  ProcessingResult,
  UploadedFileItem,
} from '../types/pdf';
import {
  compressPdfInBrowser,
  convertExcelFileToPdf,
  convertHtmlContentToPdf,
  convertPdfToExcelXlsx,
  convertPdfToImages,
  convertPdfToPptx,
  convertPdfToWordDoc,
  convertPptxFileToPdf,
  convertWordFileToPdf,
  generateSampleFilesForTool,
  getPdfPageCount,
  isPdfPasswordProtected,
  lockPdfWithPassword,
  normalizeImageFileToBuffer,
  renderPdfThumbnails,
  splitPdfIntoZip,
  unlockPdfWithPassword,
} from '../utils/pdfBrowserEngine';
import {
  convertHeicFiles,
  convertImageFiles,
  readImageDimensions,
  resizeImageFiles,
  upscaleImageFile,
} from '../utils/imageBrowserEngine';
import { isHeicFile } from '../utils/imageToolsMath';
import {
  addPageNumbersToPdf,
  addWatermarkToPdf,
  applyAnnotationsToPdf,
  applySecurityAndMetadataToPdf,
  calculateSavings,
  createPdfFromImageBuffers,
  cropPdfBuffer,
  extractPagesFromPdf,
  formatFileSize,
  mergePdfBuffers,
  organizePdfPages,
  parsePageRange,
  removePagesFromPdf,
  repairPdfBuffer,
  rotatePdfBuffer,
  sanitizeFilename,
} from '../utils/pdfHelpers';
import { isPdfFile } from '../utils/pdfPreviewHelpers';
import { CompareView } from './CompareView';
import { InteractivePageCanvas } from './InteractivePageCanvas';
import { PdfFilePreview, PdfPreviewModal } from './PdfFilePreview';
import { ToolIcon } from './ToolIcon';
import {
  DEFAULT_WORKSPACE_OPTIONS,
  ToolOptionsPanel,
  type WorkspaceOptionsState,
} from './ToolOptionsPanel';

interface ToolWorkspaceProps {
  tool: PdfToolDefinition;
  onBack: () => void;
}

const VISUAL_PAGE_TOOLS = new Set([
  'split',
  'remove-pages',
  'extract-pages',
  'organize',
  'rotate',
  'compress',
  'repair',
  'pdf-to-jpg',
  'pdf-to-word',
  'pdf-to-excel',
  'pdf-to-ppt',
  'page-numbers',
  'watermark',
  'crop',
  'lock-pdf',
  'protect-pdf',
]);

const INTERACTIVE_CANVAS_TOOLS = new Set(['edit-pdf', 'sign-pdf', 'redact-pdf']);

const FIRST_PAGE_DEFAULT_TOOLS = new Set([
  'compress',
  'repair',
  'pdf-to-jpg',
  'pdf-to-word',
  'pdf-to-excel',
  'pdf-to-ppt',
  'page-numbers',
  'crop',
  'lock-pdf',
  'protect-pdf',
]);

const IMAGE_TOOLS = new Set([
  'image-convert',
  'heic-convert',
  'image-upscale',
  'image-resize',
]);

export function ToolWorkspace({ tool, onBack }: ToolWorkspaceProps) {
  const [files, setFiles] = useState<UploadedFileItem[]>([]);
  const [pages, setPages] = useState<PageItem[]>([]);
  const [loadingThumbnails, setLoadingThumbnails] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [options, setOptions] = useState<WorkspaceOptionsState>(DEFAULT_WORKSPACE_OPTIONS);
  const [annotations, setAnnotations] = useState<AnnotationOverlay[]>([]);
  const [processing, setProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<ProcessingResult | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [loadingSample, setLoadingSample] = useState(false);
  const [compareDiffLines, setCompareDiffLines] = useState<DiffLine[]>([]);
  const [previewViewMode, setPreviewViewMode] = useState<'first-page' | 'grid'>(() =>
    FIRST_PAGE_DEFAULT_TOOLS.has(tool.id) ? 'first-page' : 'grid'
  );
  const [inspectedFile, setInspectedFile] = useState<{
    file: UploadedFileItem;
    initialPage?: number;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Reset workspace cleanly whenever switching tools
  useEffect(() => {
    setFiles([]);
    setPages([]);
    setAnnotations([]);
    setResult(null);
    setErrorMsg(null);
    setShowPreviewModal(false);
    setInspectedFile(null);
    setCompareDiffLines([]);
    setOptions(DEFAULT_WORKSPACE_OPTIONS);
    setPreviewViewMode(FIRST_PAGE_DEFAULT_TOOLS.has(tool.id) ? 'first-page' : 'grid');
  }, [tool.id]);

  // Clean up object URLs
  useEffect(() => {
    return () => {
      if (result?.previewUrl && result.previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(result.previewUrl);
      }
    };
  }, [result]);

  const updateOptions = useCallback((patch: Partial<WorkspaceOptionsState>) => {
    setOptions((prev) => ({ ...prev, ...patch }));
  }, []);

  const ingestFiles = useCallback(
    async (incoming: File[]) => {
      if (incoming.length === 0) return;
      setErrorMsg(null);
      setResult(null);

      const newItems: UploadedFileItem[] = [];
      for (const file of incoming) {
        try {
          const data = new Uint8Array(await file.arrayBuffer());
          let pageCount: number | undefined;
          let previewUrl: string | undefined;
          let width: number | undefined;
          let height: number | undefined;
          let isEncrypted: boolean | undefined;

          if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
            if (tool.id === 'unlock-pdf') {
              isEncrypted = await isPdfPasswordProtected(data);
              try {
                pageCount = await getPdfPageCount(data);
              } catch {
                pageCount = undefined;
              }
            } else {
              pageCount = await getPdfPageCount(data);
            }
          } else if (file.type.startsWith('image/') && !isHeicFile(file)) {
            previewUrl = URL.createObjectURL(file);
            const dims = await readImageDimensions(file);
            if (dims) {
              width = dims.width;
              height = dims.height;
            }
          } else if (tool.id === 'html-to-pdf') {
            const text = await file.text();
            setOptions((prev) => ({ ...prev, htmlDirectCode: text }));
          }

          newItems.push({
            id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            file,
            name: file.name,
            size: file.size,
            data,
            pageCount,
            previewUrl,
            width,
            height,
            isEncrypted,
          });
        } catch {
          setErrorMsg(`Berkas "${file.name}" tidak dapat dibaca atau formatnya tidak valid.`);
        }
      }

      if (newItems.length === 0) return;

      const nextFiles = tool.multiple
        ? [...files, ...newItems].slice(0, tool.maxFiles || 50)
        : [newItems[0]];

      setFiles(nextFiles);

      // Sync initial resize dimensions from first loaded image
      if (tool.id === 'image-resize' && nextFiles[0]?.width && nextFiles[0]?.height) {
        setOptions((prev) => ({
          ...prev,
          resizeWidth: nextFiles[0].width!,
          resizeHeight: nextFiles[0].height!,
        }));
      }

      // Render visual page thumbnails for single-PDF tools
      const firstPdf = nextFiles[0];
      if (
        firstPdf &&
        (VISUAL_PAGE_TOOLS.has(tool.id) || INTERACTIVE_CANVAS_TOOLS.has(tool.id)) &&
        firstPdf.pageCount
      ) {
        setLoadingThumbnails(true);
        try {
          const thumbs = await renderPdfThumbnails(firstPdf.data, 0.42);
          setPages(thumbs);
          if (tool.id === 'split' && thumbs.length >= 2) {
            setOptions((prev) => ({
              ...prev,
              splitRange: `1-${Math.ceil(thumbs.length / 2)}`,
            }));
          }
          if (tool.id === 'protect-pdf') {
            setOptions((prev) => ({
              ...prev,
              metaTitle: firstPdf.name.replace(/\.pdf$/i, ''),
            }));
          }
        } catch {
          setPages([]);
        } finally {
          setLoadingThumbnails(false);
        }
      } else {
        setPages([]);
      }
    },
    [files, tool.id, tool.maxFiles, tool.multiple]
  );

  const handleLoadSample = async () => {
    setLoadingSample(true);
    setErrorMsg(null);
    try {
      const sampleFiles = await generateSampleFilesForTool(tool.id);
      await ingestFiles(sampleFiles);
    } catch {
      setErrorMsg('Gagal menyiapkan berkas contoh. Silakan coba unggah berkas dari perangkat Anda.');
    } finally {
      setLoadingSample(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = Array.from(e.dataTransfer.files);
    void ingestFiles(dropped);
  };

  const moveFile = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= files.length) return;
    const copy = [...files];
    const [removed] = copy.splice(index, 1);
    copy.splice(target, 0, removed);
    setFiles(copy);
  };

  const removeFile = (id: string) => {
    const next = files.filter((f) => f.id !== id);
    setFiles(next);
    if (next.length === 0) {
      setPages([]);
      setAnnotations([]);
      setResult(null);
    }
  };

  const togglePageSelection = (pageId: string) => {
    setPages((prev) =>
      prev.map((p) => (p.id === pageId ? { ...p, selected: !p.selected } : p))
    );
  };

  const movePage = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= pages.length) return;
    const next = [...pages];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    setPages(next);
  };

  const rotateSinglePage = (pageId: string) => {
    setPages((prev) =>
      prev.map((p) => (p.id === pageId ? { ...p, rotation: (p.rotation + 90) % 360 } : p))
    );
  };

  const duplicateSinglePage = (index: number) => {
    const target = pages[index];
    if (!target) return;
    const clone: PageItem = {
      ...target,
      id: `dup-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    };
    const next = [...pages];
    next.splice(index + 1, 0, clone);
    setPages(next);
  };

  const deleteSinglePage = (pageId: string) => {
    if (pages.length <= 1) {
      setErrorMsg('Minimal satu halaman harus tetap dipertahankan.');
      return;
    }
    setPages((prev) => prev.filter((p) => p.id !== pageId));
  };

  const triggerDownload = (res: ProcessingResult) => {
    const url = URL.createObjectURL(res.blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = res.filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleProcess = async () => {
    setErrorMsg(null);
    setProcessing(true);

    try {
      const totalOriginalSize = files.reduce((acc, f) => acc + f.size, 0);
      const first = files[0];

      if (tool.id === 'html-to-pdf') {
        const htmlSource = options.htmlDirectCode.trim();
        if (!htmlSource) {
          throw new Error('Masukkan kode HTML atau unggah file HTML terlebih dahulu.');
        }
        const title = first?.name.replace(/\.[^/.]+$/, '') || 'Dokumen_HTML';
        const { bytes, pageCount } = await convertHtmlContentToPdf(htmlSource, title);
        const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
        setResult({
          blob,
          filename: sanitizeFilename(title, 'pdf', 'pdf'),
          mimeType: 'application/pdf',
          originalSize: totalOriginalSize || new Blob([htmlSource]).size,
          outputSize: blob.size,
          pageCount,
          summary: `Berhasil mengonversi HTML menjadi ${pageCount} halaman PDF.`,
          previewUrl: URL.createObjectURL(blob),
        });
        return;
      }

      if (!first) {
        throw new Error('Unggah berkas terlebih dahulu sebelum memproses.');
      }

      switch (tool.id) {
        case 'merge': {
          if (files.length < 2) {
            throw new Error('Tambahkan minimal 2 file PDF untuk digabungkan.');
          }
          const { bytes, pageCount } = await mergePdfBuffers(files.map((f) => f.data));
          const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
          setResult({
            blob,
            filename: sanitizeFilename(first.name, 'gabungan', 'pdf'),
            mimeType: 'application/pdf',
            originalSize: totalOriginalSize,
            outputSize: blob.size,
            pageCount,
            summary: `${files.length} berkas PDF berhasil digabungkan menjadi ${pageCount} halaman.`,
            previewUrl: URL.createObjectURL(blob),
          });
          break;
        }

        case 'split': {
          const total = first.pageCount || pages.length;
          let groups: number[][] = [];
          if (options.splitMode === 'range') {
            const parsed = parsePageRange(options.splitRange, total);
            if (parsed.error) throw new Error(parsed.error);
            groups = [parsed.pages];
          } else if (options.splitMode === 'all') {
            groups = Array.from({ length: total }, (_, idx) => [idx + 1]);
          } else {
            const step = Math.max(1, options.splitFixedSize);
            for (let p = 1; p <= total; p += step) {
              const chunk: number[] = [];
              for (let k = p; k < p + step && k <= total; k++) chunk.push(k);
              groups.push(chunk);
            }
          }
          const splitRes = await splitPdfIntoZip(first.data, first.name, groups);
          setResult({
            blob: splitRes.blob,
            filename: splitRes.filename,
            mimeType: splitRes.blob.type,
            originalSize: first.size,
            outputSize: splitRes.blob.size,
            pageCount: splitRes.fileCount === 1 ? groups[0].length : total,
            summary:
              splitRes.fileCount === 1
                ? `Berhasil memisahkan ${groups[0].length} halaman menjadi dokumen PDF baru.`
                : `Berhasil memecah dokumen menjadi ${splitRes.fileCount} file PDF dalam arsip ZIP.`,
            previewUrl:
              splitRes.blob.type === 'application/pdf'
                ? URL.createObjectURL(splitRes.blob)
                : undefined,
          });
          break;
        }

        case 'remove-pages': {
          const toRemove = pages.filter((p) => p.selected).map((p) => p.pageNumber);
          if (toRemove.length === 0) {
            throw new Error('Pilih minimal satu halaman pada pratinjau untuk dihapus.');
          }
          const { bytes, pageCount } = await removePagesFromPdf(first.data, toRemove);
          const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
          setResult({
            blob,
            filename: sanitizeFilename(first.name, 'tersaring', 'pdf'),
            mimeType: 'application/pdf',
            originalSize: first.size,
            outputSize: blob.size,
            pageCount,
            summary: `${toRemove.length} halaman berhasil dihapus. Dokumen kini memiliki ${pageCount} halaman.`,
            previewUrl: URL.createObjectURL(blob),
          });
          break;
        }

        case 'extract-pages': {
          const selected = pages.filter((p) => p.selected).map((p) => p.pageNumber);
          if (selected.length === 0) {
            throw new Error('Pilih minimal satu halaman pada pratinjau untuk diekstrak.');
          }
          if (options.extractAsZip && selected.length > 1) {
            const zipRes = await splitPdfIntoZip(
              first.data,
              first.name,
              selected.map((p) => [p])
            );
            setResult({
              blob: zipRes.blob,
              filename: sanitizeFilename(first.name, 'ekstrak', 'zip'),
              mimeType: 'application/zip',
              originalSize: first.size,
              outputSize: zipRes.blob.size,
              pageCount: selected.length,
              summary: `${selected.length} halaman terpilih berhasil diekstrak ke dalam arsip ZIP.`,
            });
          } else {
            const { bytes, pageCount } = await extractPagesFromPdf(first.data, selected);
            const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
            setResult({
              blob,
              filename: sanitizeFilename(first.name, 'ekstrak', 'pdf'),
              mimeType: 'application/pdf',
              originalSize: first.size,
              outputSize: blob.size,
              pageCount,
              summary: `${pageCount} halaman terpilih berhasil diekstrak menjadi dokumen PDF baru.`,
              previewUrl: URL.createObjectURL(blob),
            });
          }
          break;
        }

        case 'organize': {
          const plan = pages.map((p) => ({
            originalIndex: p.originalIndex,
            rotation: p.rotation,
          }));
          const { bytes, pageCount } = await organizePdfPages(first.data, plan);
          const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
          setResult({
            blob,
            filename: sanitizeFilename(first.name, 'tersusun', 'pdf'),
            mimeType: 'application/pdf',
            originalSize: first.size,
            outputSize: blob.size,
            pageCount,
            summary: `Susunan baru dengan ${pageCount} halaman berhasil disimpan.`,
            previewUrl: URL.createObjectURL(blob),
          });
          break;
        }

        case 'rotate': {
          const targetPages =
            options.rotateScope === 'selected'
              ? pages.filter((p) => p.selected).map((p) => p.pageNumber)
              : undefined;
          if (options.rotateScope === 'selected' && (!targetPages || targetPages.length === 0)) {
            throw new Error('Pilih minimal satu halaman atau ubah cakupan ke Semua Halaman.');
          }
          const { bytes, pageCount } = await rotatePdfBuffer(
            first.data,
            options.rotateAngle,
            targetPages
          );
          const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
          setResult({
            blob,
            filename: sanitizeFilename(first.name, `putar_${options.rotateAngle}`, 'pdf'),
            mimeType: 'application/pdf',
            originalSize: first.size,
            outputSize: blob.size,
            pageCount,
            summary: `Rotasi ${options.rotateAngle}° berhasil diterapkan pada dokumen PDF.`,
            previewUrl: URL.createObjectURL(blob),
          });
          break;
        }

        case 'compress': {
          const { bytes, pageCount } = await compressPdfInBrowser(
            first.data,
            options.compressLevel
          );
          const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
          const stats = calculateSavings(first.size, blob.size);
          setResult({
            blob,
            filename: sanitizeFilename(first.name, 'kompres', 'pdf'),
            mimeType: 'application/pdf',
            originalSize: first.size,
            outputSize: blob.size,
            pageCount,
            summary: stats.isSmaller
              ? `Ukuran berkas berhasil diperkecil sebesar ${stats.percentSaved}% (${formatFileSize(stats.savedBytes)} lebih hemat).`
              : 'Struktur dokumen telah dioptimalkan (dokumen asal sudah sangat ringkas).',
            previewUrl: URL.createObjectURL(blob),
          });
          break;
        }

        case 'repair': {
          const { bytes, pageCount } = await repairPdfBuffer(first.data);
          const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
          setResult({
            blob,
            filename: sanitizeFilename(first.name, 'diperbaiki', 'pdf'),
            mimeType: 'application/pdf',
            originalSize: first.size,
            outputSize: blob.size,
            pageCount,
            summary: `Struktur objek dan ${pageCount} halaman PDF berhasil direkonstruksi.`,
            previewUrl: URL.createObjectURL(blob),
          });
          break;
        }

        case 'jpg-to-pdf': {
          const normalized = await Promise.all(
            files.map((item) => normalizeImageFileToBuffer(item.file))
          );
          const { bytes, pageCount } = await createPdfFromImageBuffers(normalized, {
            pageSize: options.jpgPageSize,
            orientation: options.jpgOrientation,
            marginMm: options.jpgMarginMm,
          });
          const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
          setResult({
            blob,
            filename: sanitizeFilename(first.name, 'gambar_ke_pdf', 'pdf'),
            mimeType: 'application/pdf',
            originalSize: totalOriginalSize,
            outputSize: blob.size,
            pageCount,
            summary: `${files.length} gambar berhasil dikonversi menjadi ${pageCount} halaman PDF.`,
            previewUrl: URL.createObjectURL(blob),
          });
          break;
        }

        case 'word-to-pdf': {
          const { bytes, pageCount } = await convertWordFileToPdf(first.file);
          const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
          setResult({
            blob,
            filename: sanitizeFilename(first.name, 'pdf', 'pdf'),
            mimeType: 'application/pdf',
            originalSize: first.size,
            outputSize: blob.size,
            pageCount,
            summary: `Dokumen Word berhasil dikonversi menjadi ${pageCount} halaman PDF.`,
            previewUrl: URL.createObjectURL(blob),
          });
          break;
        }

        case 'excel-to-pdf': {
          const { bytes, pageCount } = await convertExcelFileToPdf(first.file);
          const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
          setResult({
            blob,
            filename: sanitizeFilename(first.name, 'tabel', 'pdf'),
            mimeType: 'application/pdf',
            originalSize: first.size,
            outputSize: blob.size,
            pageCount,
            summary: `Spreadsheet berhasil dikonversi menjadi ${pageCount} halaman tabel PDF lanskap.`,
            previewUrl: URL.createObjectURL(blob),
          });
          break;
        }

        case 'ppt-to-pdf': {
          const { bytes, pageCount } = await convertPptxFileToPdf(first.file);
          const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
          setResult({
            blob,
            filename: sanitizeFilename(first.name, 'slide', 'pdf'),
            mimeType: 'application/pdf',
            originalSize: first.size,
            outputSize: blob.size,
            pageCount,
            summary: `Presentasi PowerPoint berhasil dikonversi menjadi ${pageCount} halaman PDF.`,
            previewUrl: URL.createObjectURL(blob),
          });
          break;
        }

        case 'pdf-to-jpg': {
          const imgRes = await convertPdfToImages(
            first.data,
            first.name,
            options.pdfToImageFormat,
            options.pdfToImageDpi
          );
          setResult({
            blob: imgRes.blob,
            filename: imgRes.filename,
            mimeType: imgRes.mimeType,
            originalSize: first.size,
            outputSize: imgRes.blob.size,
            pageCount: imgRes.pageCount,
            summary:
              imgRes.pageCount === 1
                ? `Halaman PDF berhasil diekspor menjadi gambar ${options.pdfToImageFormat.toUpperCase()}.`
                : `${imgRes.pageCount} halaman PDF berhasil diekspor ke gambar ${options.pdfToImageFormat.toUpperCase()} dalam arsip ZIP.`,
            previewUrl: imgRes.previewUrl,
          });
          break;
        }

        case 'pdf-to-word': {
          const wordRes = await convertPdfToWordDoc(first.data, first.name);
          setResult({
            blob: wordRes.blob,
            filename: wordRes.filename,
            mimeType: 'application/msword',
            originalSize: first.size,
            outputSize: wordRes.blob.size,
            pageCount: wordRes.pageCount,
            summary: `Teks dari ${wordRes.pageCount} halaman PDF berhasil dikonversi ke dokumen Word (.doc).`,
          });
          break;
        }

        case 'pdf-to-excel': {
          const xlsxRes = await convertPdfToExcelXlsx(first.data, first.name);
          setResult({
            blob: xlsxRes.blob,
            filename: xlsxRes.filename,
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            originalSize: first.size,
            outputSize: xlsxRes.blob.size,
            pageCount: xlsxRes.pageCount,
            summary: `Data dari ${xlsxRes.pageCount} halaman PDF berhasil diekstrak ke workbook Excel (.xlsx).`,
          });
          break;
        }

        case 'pdf-to-ppt': {
          const pptRes = await convertPdfToPptx(first.data, first.name);
          setResult({
            blob: pptRes.blob,
            filename: pptRes.filename,
            mimeType:
              'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            originalSize: first.size,
            outputSize: pptRes.blob.size,
            pageCount: pptRes.pageCount,
            summary: `${pptRes.pageCount} halaman PDF berhasil dikemas menjadi slide presentasi PowerPoint (.pptx).`,
          });
          break;
        }

        case 'page-numbers': {
          const { bytes, pageCount } = await addPageNumbersToPdf(
            first.data,
            options.pageNumber
          );
          const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
          setResult({
            blob,
            filename: sanitizeFilename(first.name, 'bernomor', 'pdf'),
            mimeType: 'application/pdf',
            originalSize: first.size,
            outputSize: blob.size,
            pageCount,
            summary: `Nomor halaman berhasil ditambahkan pada seluruh ${pageCount} halaman.`,
            previewUrl: URL.createObjectURL(blob),
          });
          break;
        }

        case 'watermark': {
          const { bytes, pageCount } = await addWatermarkToPdf(first.data, options.watermark);
          const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
          setResult({
            blob,
            filename: sanitizeFilename(first.name, 'watermark', 'pdf'),
            mimeType: 'application/pdf',
            originalSize: first.size,
            outputSize: blob.size,
            pageCount,
            summary: `Watermark "${options.watermark.text.trim()}" berhasil diterapkan pada ${pageCount} halaman.`,
            previewUrl: URL.createObjectURL(blob),
          });
          break;
        }

        case 'crop': {
          const { bytes, pageCount } = await cropPdfBuffer(first.data, options.crop);
          const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
          setResult({
            blob,
            filename: sanitizeFilename(first.name, 'dipotong', 'pdf'),
            mimeType: 'application/pdf',
            originalSize: first.size,
            outputSize: blob.size,
            pageCount,
            summary: `Margin halaman berhasil dipangkas pada ${pageCount} halaman PDF.`,
            previewUrl: URL.createObjectURL(blob),
          });
          break;
        }

        case 'edit-pdf':
        case 'sign-pdf':
        case 'redact-pdf': {
          if (annotations.length === 0) {
            throw new Error(
              tool.id === 'sign-pdf'
                ? 'Tempatkan minimal satu tanda tangan pada pratinjau halaman PDF terlebih dahulu.'
                : tool.id === 'redact-pdf'
                  ? 'Buat minimal satu blok sensor pada halaman PDF terlebih dahulu.'
                  : 'Tambahkan minimal satu teks atau sorotan pada halaman PDF terlebih dahulu.'
            );
          }
          const { bytes, pageCount } = await applyAnnotationsToPdf(first.data, annotations);
          const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
          const suffix =
            tool.id === 'sign-pdf'
              ? 'bertandatangan'
              : tool.id === 'redact-pdf'
                ? 'tersensor'
                : 'diedit';
          setResult({
            blob,
            filename: sanitizeFilename(first.name, suffix, 'pdf'),
            mimeType: 'application/pdf',
            originalSize: first.size,
            outputSize: blob.size,
            pageCount,
            summary: `${annotations.length} elemen berhasil ditanamkan secara permanen ke dalam dokumen PDF.`,
            previewUrl: URL.createObjectURL(blob),
          });
          break;
        }

        case 'image-convert': {
          const convRes = await convertImageFiles(
            files.map((f) => f.file),
            {
              targetFormat: options.imageTargetFormat,
              quality: options.imageQuality,
              bgFillHex: options.imageBgFillHex,
            }
          );
          setResult({
            blob: convRes.blob,
            filename: convRes.filename,
            mimeType: convRes.mimeType,
            originalSize: totalOriginalSize,
            outputSize: convRes.blob.size,
            summary: convRes.summary,
            previewUrl: convRes.previewUrl,
            secondaryDetail: convRes.secondaryDetail,
          });
          break;
        }

        case 'heic-convert': {
          const heicRes = await convertHeicFiles(
            files.map((f) => f.file),
            {
              outputFormat: options.heicOutputFormat,
              quality: options.heicQuality,
              pageSize: options.heicPdfPageSize,
              orientation: 'portrait',
              marginMm: 8,
            }
          );
          setResult({
            blob: heicRes.blob,
            filename: heicRes.filename,
            mimeType: heicRes.mimeType,
            originalSize: totalOriginalSize,
            outputSize: heicRes.blob.size,
            pageCount: heicRes.pageCount,
            summary: heicRes.summary,
            previewUrl: heicRes.previewUrl,
            secondaryDetail: heicRes.secondaryDetail,
          });
          break;
        }

        case 'image-upscale': {
          const upRes = await upscaleImageFile(first.file, {
            scaleFactor: options.upscaleFactor,
            sharpenStrength: options.upscaleSharpen,
            outputFormat: options.upscaleFormat,
            quality: 0.94,
          });
          setResult({
            blob: upRes.blob,
            filename: upRes.filename,
            mimeType: upRes.mimeType,
            originalSize: first.size,
            outputSize: upRes.blob.size,
            summary: upRes.summary,
            previewUrl: upRes.previewUrl,
            secondaryDetail: upRes.secondaryDetail,
          });
          break;
        }

        case 'image-resize': {
          const resRes = await resizeImageFiles(
            files.map((f) => f.file),
            {
              mode: options.resizeMode,
              width: options.resizeWidth,
              height: options.resizeHeight,
              percent: options.resizePercent,
              lockAspect: options.resizeLockAspect,
              presetId: options.resizePresetId,
              outputFormat: options.resizeFormat,
              quality: 0.92,
            }
          );
          setResult({
            blob: resRes.blob,
            filename: resRes.filename,
            mimeType: resRes.mimeType,
            originalSize: totalOriginalSize,
            outputSize: resRes.blob.size,
            summary: resRes.summary,
            previewUrl: resRes.previewUrl,
            secondaryDetail: resRes.secondaryDetail,
          });
          break;
        }

        case 'lock-pdf': {
          const pw = options.lockUserPassword;
          if (!pw.trim()) {
            throw new Error('Masukkan kata sandi terlebih dahulu untuk mengunci dokumen PDF.');
          }
          if (pw !== options.lockConfirmPassword) {
            throw new Error('Konfirmasi kata sandi tidak cocok. Periksa kembali ketikan Anda.');
          }
          const { bytes, pageCount } = await lockPdfWithPassword(first.data, {
            userPassword: pw,
            ownerPassword: options.lockOwnerPassword.trim() || pw,
            allowPrint: options.lockAllowPrint,
            allowCopy: options.lockAllowCopy,
          });
          const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
          setResult({
            blob,
            filename: sanitizeFilename(first.name, 'terkunci', 'pdf'),
            mimeType: 'application/pdf',
            originalSize: first.size,
            outputSize: blob.size,
            pageCount,
            summary: `Dokumen PDF (${pageCount} halaman) berhasil dikunci dengan enkripsi standar RC4-128 bit.`,
            secondaryDetail: 'Terenkripsi 128-bit',
          });
          break;
        }

        case 'unlock-pdf': {
          const { bytes, pageCount } = await unlockPdfWithPassword(
            first.data,
            options.unlockPassword
          );
          const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
          setResult({
            blob,
            filename: sanitizeFilename(first.name, 'terbuka', 'pdf'),
            mimeType: 'application/pdf',
            originalSize: first.size,
            outputSize: blob.size,
            pageCount,
            summary: `Proteksi kata sandi berhasil dihapus. Seluruh ${pageCount} halaman kini dapat dibuka tanpa kata sandi.`,
            previewUrl: URL.createObjectURL(blob),
          });
          break;
        }

        case 'protect-pdf': {
          const { bytes, pageCount } = await applySecurityAndMetadataToPdf(first.data, {
            mode: options.protectMode,
            title: options.metaTitle,
            author: options.metaAuthor,
            subject: options.metaSubject,
            classificationBanner: options.classificationBanner,
          });
          const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
          setResult({
            blob,
            filename: sanitizeFilename(
              first.name,
              options.protectMode === 'clean-metadata' ? 'bersih' : 'terlindungi',
              'pdf'
            ),
            mimeType: 'application/pdf',
            originalSize: first.size,
            outputSize: blob.size,
            pageCount,
            summary:
              options.protectMode === 'clean-metadata'
                ? 'Seluruh metadata tersembunyi telah dibersihkan dari dokumen PDF.'
                : 'Metadata resmi dan cap klasifikasi keamanan berhasil diterapkan.',
            previewUrl: URL.createObjectURL(blob),
          });
          break;
        }

        default:
          break;
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Terjadi kesalahan saat memproses berkas.'
      );
    } finally {
      setProcessing(false);
    }
  };

  const resetAll = () => {
    setFiles([]);
    setPages([]);
    setAnnotations([]);
    setResult(null);
    setErrorMsg(null);
    setShowPreviewModal(false);
    setInspectedFile(null);
  };

  const selectedPagesCount = pages.filter((p) => p.selected).length;
  const hasWorkspaceContent = files.length > 0 || tool.id === 'html-to-pdf';
  const showInteractiveCanvas = INTERACTIVE_CANVAS_TOOLS.has(tool.id) && files.length > 0;
  const showCompareView = tool.id === 'compare-pdf' && files.length === 2;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-12">
      {/* Breadcrumb & Tool Title */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-200/80">
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
            <span>{tool.categoryLabel}</span>
            <span aria-hidden="true">/</span>
            <span className="text-slate-800 font-medium">{tool.name}</span>
          </nav>

          <div className="flex items-center gap-3.5">
            <span className="w-11 h-11 rounded-xl bg-blue-700 text-white inline-flex items-center justify-center shrink-0">
              <ToolIcon toolId={tool.id} className="w-5 h-5" />
            </span>
            <div>
              <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                {tool.name}
              </h1>
              <p className="text-sm text-slate-600 mt-0.5">{tool.description}</p>
            </div>
          </div>
        </div>

        {files.length > 0 && !result && (
          <button
            type="button"
            onClick={resetAll}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-lg transition-colors self-start sm:self-center whitespace-nowrap shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            Ganti Berkas
          </button>
        )}
      </div>

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={tool.accept}
        multiple={tool.multiple}
        onChange={(e) => {
          const selected = Array.from(e.target.files || []);
          void ingestFiles(selected);
          e.target.value = '';
        }}
        className="sr-only"
        aria-label={`Unggah ${tool.acceptLabel}`}
      />

      {/* Error Alert Banner (Explicit icon + text) */}
      {errorMsg && (
        <div
          role="alert"
          className="mb-6 flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-900 text-sm"
        >
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="flex-1">
            <p className="font-medium">Perhatian</p>
            <p className="text-red-800 mt-0.5">{errorMsg}</p>
          </div>
        </div>
      )}

      {/* RESULT SCREEN */}
      {result ? (
        <section
          aria-label="Hasil pemrosesan"
          className="max-w-2xl mx-auto bg-white border border-slate-200 rounded-2xl p-8 sm:p-10 text-center space-y-6"
        >
          <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-700 inline-flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-7 h-7" aria-hidden="true" />
          </div>

          <div className="space-y-2">
            <h2 className="font-display text-2xl font-bold text-slate-900">
              Dokumen Anda Siap Diunduh
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed max-w-lg mx-auto">
              {result.summary}
            </p>
          </div>

          {/* Tabular Metrics Strip */}
          <div className="grid grid-cols-3 gap-4 py-4 px-5 bg-slate-50 border border-slate-200/80 rounded-xl text-left">
            <div>
              <p className="text-xs text-slate-500">Nama Berkas</p>
              <p className="text-sm font-medium text-slate-900 truncate mt-0.5" title={result.filename}>
                {result.filename}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Ukuran Hasil</p>
              <p className="text-sm font-mono tabular-nums font-semibold text-blue-700 mt-0.5">
                {formatFileSize(result.outputSize)}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">
                {result.secondaryDetail
                  ? 'Detail Hasil'
                  : result.pageCount
                    ? 'Jumlah Halaman'
                    : 'Ukuran Awal'}
              </p>
              <p className="text-sm font-mono tabular-nums font-semibold text-slate-900 mt-0.5 truncate" title={result.secondaryDetail}>
                {result.secondaryDetail
                  ? result.secondaryDetail
                  : result.pageCount
                    ? `${result.pageCount} halaman`
                    : formatFileSize(result.originalSize)}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => triggerDownload(result)}
              className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-xl transition-colors whitespace-nowrap"
            >
              <Download className="w-4 h-4" aria-hidden="true" />
              Unduh Hasil
            </button>

            {result.previewUrl && (
              <button
                type="button"
                onClick={() => setShowPreviewModal((v) => !v)}
                className="inline-flex items-center gap-2 px-5 py-3 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors whitespace-nowrap"
              >
                <Eye className="w-4 h-4" aria-hidden="true" />
                {showPreviewModal ? 'Tutup Pratinjau' : 'Lihat Pratinjau'}
              </button>
            )}

            <button
              type="button"
              onClick={resetAll}
              className="inline-flex items-center gap-2 px-5 py-3 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-colors whitespace-nowrap"
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
              Proses Berkas Lain
            </button>
          </div>

          {showPreviewModal && result.previewUrl && (
            <div className="pt-4 border-t border-slate-100 text-left">
              {result.mimeType === 'application/pdf' ? (
                <iframe
                  src={result.previewUrl}
                  title="Pratinjau Dokumen PDF Hasil"
                  className="w-full h-[520px] rounded-xl border border-slate-200 bg-slate-50"
                />
              ) : (
                <img
                  src={result.previewUrl}
                  alt="Pratinjau gambar hasil"
                  className="max-h-[460px] mx-auto rounded-xl border border-slate-200"
                />
              )}
            </div>
          )}
        </section>
      ) : !hasWorkspaceContent ? (
        /* EMPTY / UPLOAD DROPZONE STATE */
        <section
          aria-label="Area unggah berkas"
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`max-w-3xl mx-auto rounded-2xl border-2 border-dashed p-10 sm:p-14 text-center transition-all duration-150 ${
            isDragging
              ? 'border-blue-600 bg-blue-50/70'
              : 'border-blue-200 bg-white hover:border-blue-400'
          }`}
        >
          <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-700 inline-flex items-center justify-center mx-auto mb-5">
            <Upload className="w-6 h-6" aria-hidden="true" />
          </div>

          <h2 className="font-display text-xl font-semibold text-slate-900">
            Pilih atau jatuhkan {tool.acceptLabel} di sini
          </h2>
          <p className="mt-2 text-sm text-slate-600 max-w-md mx-auto">
            {tool.multiple
              ? 'Anda dapat memilih beberapa berkas sekaligus. Semua berkas diproses lokal langsung di browser Anda.'
              : 'Berkas Anda diolah secara lokal di perangkat ini tanpa diunggah ke server eksternal.'}
          </p>

          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-xl transition-colors whitespace-nowrap"
            >
              <Upload className="w-4 h-4" aria-hidden="true" />
              Pilih {tool.acceptLabel}
            </button>

            <button
              type="button"
              onClick={handleLoadSample}
              disabled={loadingSample}
              className="inline-flex items-center gap-2 px-5 py-3 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors whitespace-nowrap disabled:opacity-60"
            >
              {loadingSample ? (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              ) : (
                <FilePlus2 className="w-4 h-4" aria-hidden="true" />
              )}
              Coba dengan File Contoh
            </button>
          </div>
        </section>
      ) : (
        /* ACTIVE WORKSPACE SPLIT LAYOUT (Staging + Right Options Sidebar) */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT STAGING / PREVIEW AREA */}
          <div className="lg:col-span-8 space-y-5">
            {/* HTML Direct Editor Mode */}
            {tool.id === 'html-to-pdf' ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label
                    htmlFor="html-source-input"
                    className="font-display text-sm font-semibold text-slate-900"
                  >
                    Kode HTML atau Unggah Berkas HTML
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                    >
                      Unggah .html
                    </button>
                    <button
                      type="button"
                      onClick={handleLoadSample}
                      className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                    >
                      Muat Contoh
                    </button>
                  </div>
                </div>
                <textarea
                  id="html-source-input"
                  rows={14}
                  value={options.htmlDirectCode}
                  onChange={(e) => updateOptions({ htmlDirectCode: e.target.value })}
                  className="w-full p-4 font-mono text-xs leading-relaxed rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white focus:border-blue-600 focus:outline-none"
                />
              </div>
            ) : showCompareView ? (
              <CompareView
                fileA={files[0]}
                fileB={files[1]}
                onDiffReady={setCompareDiffLines}
              />
            ) : showInteractiveCanvas && files[0] ? (
              <InteractivePageCanvas
                pdfData={files[0].data}
                pageCount={files[0].pageCount || 1}
                toolId={tool.id}
                annotations={annotations}
                onAddAnnotation={(ann) => setAnnotations((prev) => [...prev, ann])}
                onRemoveAnnotation={(id) =>
                  setAnnotations((prev) => prev.filter((a) => a.id !== id))
                }
                activeEditMode={options.editMode}
                noteText={options.editNoteText}
                noteColor={options.editNoteColor}
                noteFontSize={options.editFontSize}
                signatureDataUrl={options.signatureDataUrl}
              />
            ) : tool.id === 'unlock-pdf' && files[0] ? (
              /* Dedicated Locked PDF Staging Card */
              <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 flex flex-col items-center text-center space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-700 inline-flex items-center justify-center">
                  <Lock className="w-8 h-8" aria-hidden="true" />
                </div>
                <div className="space-y-1 max-w-md">
                  <p className="text-xs font-medium text-blue-700">
                    {files[0].isEncrypted
                      ? 'Dokumen Terlindungi Kata Sandi'
                      : 'Berkas PDF Siap Diperiksa'}
                  </p>
                  <h2 className="font-display text-lg font-semibold text-slate-900 break-all">
                    {files[0].name}
                  </h2>
                  <p className="text-xs font-mono tabular-nums text-slate-500">
                    {formatFileSize(files[0].size)}
                    {files[0].pageCount ? ` · ${files[0].pageCount} halaman` : ''}
                  </p>
                </div>
                <p className="text-sm text-slate-600 max-w-md leading-relaxed">
                  Masukkan kata sandi dokumen pada panel sebelah kanan, lalu klik{' '}
                  <strong>Buka Kunci PDF</strong> untuk membuat salinan PDF baru bebas kata sandi.
                </p>
              </div>
            ) : IMAGE_TOOLS.has(tool.id) && files.length === 1 && files[0].previewUrl ? (
              /* Single-Image High-Clarity Staging Card */
              <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
                  <div className="min-w-0">
                    <h2 className="font-display text-sm font-semibold text-slate-900 truncate max-w-md">
                      {files[0].name}
                    </h2>
                    <p className="text-xs font-mono tabular-nums text-slate-500 mt-0.5">
                      {formatFileSize(files[0].size)}
                      {files[0].width && files[0].height
                        ? ` · ${files[0].width} × ${files[0].height} px`
                        : ''}
                    </p>
                  </div>
                  {tool.multiple && (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                    >
                      <FilePlus2 className="w-3.5 h-3.5" aria-hidden="true" />
                      Tambah Gambar
                    </button>
                  )}
                </div>
                <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-4 flex items-center justify-center min-h-[280px]">
                  <img
                    src={files[0].previewUrl}
                    alt={files[0].name}
                    className="max-h-[400px] max-w-full object-contain rounded-lg shadow-xs"
                  />
                </div>
              </div>
            ) : VISUAL_PAGE_TOOLS.has(tool.id) && files.length === 1 ? (
              /* Client-Side First-Page Preview & Visual Page Thumbnail Grid */
              <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
                  <div className="min-w-0">
                    <h2 className="font-display text-sm font-semibold text-slate-900 truncate max-w-md">
                      {files[0].name}
                    </h2>
                    <p className="text-xs font-mono tabular-nums text-slate-500 mt-0.5">
                      {formatFileSize(files[0].size)} &middot; {pages.length || files[0].pageCount || 1} halaman
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* First-Page vs Grid Preview Mode Switcher */}
                    <div
                      role="group"
                      aria-label="Mode pratinjau PDF"
                      className="inline-flex p-0.5 bg-slate-100 border border-slate-200/80 rounded-lg"
                    >
                      <button
                        type="button"
                        onClick={() => setPreviewViewMode('first-page')}
                        aria-pressed={previewViewMode === 'first-page'}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                          previewViewMode === 'first-page'
                            ? 'bg-white text-blue-700 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                        Halaman Pertama
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewViewMode('grid')}
                        aria-pressed={previewViewMode === 'grid'}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                          previewViewMode === 'grid'
                            ? 'bg-white text-blue-700 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <LayoutGrid className="w-3.5 h-3.5" aria-hidden="true" />
                        Grid Halaman
                      </button>
                    </div>

                    {previewViewMode === 'grid' &&
                      (tool.id === 'remove-pages' ||
                        tool.id === 'extract-pages' ||
                        tool.id === 'rotate') && (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              setPages((prev) => prev.map((p) => ({ ...p, selected: true })))
                            }
                            className="px-2.5 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg"
                          >
                            Pilih Semua
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setPages((prev) => prev.map((p) => ({ ...p, selected: false })))
                            }
                            className="px-2.5 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg"
                          >
                            Batal Pilih
                          </button>
                        </div>
                      )}
                  </div>
                </div>

                {previewViewMode === 'first-page' ? (
                  <PdfFilePreview
                    file={files[0]}
                    variant="card"
                    rotationDeg={
                      tool.id === 'rotate' && options.rotateScope === 'all'
                        ? options.rotateAngle
                        : 0
                    }
                    watermark={tool.id === 'watermark' ? options.watermark : undefined}
                    onInspect={(pageNum) =>
                      setInspectedFile({ file: files[0], initialPage: pageNum })
                    }
                  />
                ) : loadingThumbnails ? (
                  <div className="py-16 flex flex-col items-center justify-center gap-2 text-sm text-slate-500">
                    <Loader2 className="w-5 h-5 text-blue-700 animate-spin" aria-hidden="true" />
                    <span>Merender pratinjau halaman PDF...</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {pages.map((page, index) => {
                      const isSelectable =
                        tool.id === 'remove-pages' ||
                        tool.id === 'extract-pages' ||
                        (tool.id === 'rotate' && options.rotateScope === 'selected');
                      const isRemoveMode = tool.id === 'remove-pages';

                      return (
                        <div
                          key={page.id}
                          className={`rounded-xl border p-2.5 transition-all bg-slate-50/60 ${
                            page.selected
                              ? isRemoveMode
                                ? 'border-red-500 bg-red-50/40 ring-2 ring-red-500/20'
                                : 'border-blue-600 bg-blue-50/50 ring-2 ring-blue-600/20'
                              : isSelectable
                                ? 'border-slate-200 hover:border-blue-300'
                                : 'border-slate-200'
                          }`}
                        >
                          <button
                            type="button"
                            disabled={!isSelectable}
                            onClick={() => isSelectable && togglePageSelection(page.id)}
                            aria-label={`Halaman ${page.pageNumber}${page.selected ? ' (terpilih)' : ''}`}
                            className={`w-full block text-left ${isSelectable ? 'cursor-pointer' : 'cursor-default'}`}
                          >
                            <div className="relative aspect-[3/4] bg-white rounded-lg border border-slate-200/80 overflow-hidden flex items-center justify-center p-1">
                              <img
                                src={page.thumbnailUrl}
                                alt={`Pratinjau halaman ${page.pageNumber}`}
                                style={{
                                  transform: `rotate(${
                                    page.rotation +
                                    (tool.id === 'rotate' &&
                                    (options.rotateScope === 'all' || page.selected)
                                      ? options.rotateAngle
                                      : 0)
                                  }deg)`,
                                }}
                                className="max-w-full max-h-full object-contain transition-transform duration-150"
                              />
                              {tool.id === 'watermark' && options.watermark.text.trim() && (
                                <div
                                  aria-hidden="true"
                                  className={`pointer-events-none absolute inset-0 flex p-2 overflow-hidden ${
                                    options.watermark.position === 'top-left'
                                      ? 'items-start justify-start'
                                      : options.watermark.position === 'top-right'
                                        ? 'items-start justify-end'
                                        : options.watermark.position === 'bottom-left'
                                          ? 'items-end justify-start'
                                          : options.watermark.position === 'bottom-right'
                                            ? 'items-end justify-end'
                                            : 'items-center justify-center'
                                  }`}
                                >
                                  <span
                                    className="font-bold uppercase tracking-wider text-center select-none whitespace-nowrap"
                                    style={{
                                      color: options.watermark.colorHex,
                                      opacity: options.watermark.opacity,
                                      fontSize: `${Math.max(8, Math.round(options.watermark.fontSize * 0.28))}px`,
                                      transform: `rotate(${-options.watermark.rotation}deg)`,
                                    }}
                                  >
                                    {options.watermark.text.trim()}
                                  </span>
                                </div>
                              )}
                            </div>
                          </button>

                          <div className="mt-2 flex items-center justify-between gap-1 text-xs">
                            <span className="font-mono tabular-nums text-slate-600">
                              Hal {index + 1}
                            </span>
                            <div className="flex items-center gap-1.5">
                              {page.selected && (
                                <span
                                  className={`font-medium ${
                                    isRemoveMode ? 'text-red-700' : 'text-blue-700'
                                  }`}
                                >
                                  {isRemoveMode ? 'Hapus' : 'Dipilih'}
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() =>
                                  setInspectedFile({
                                    file: files[0],
                                    initialPage: page.pageNumber,
                                  })
                                }
                                aria-label={`Perbesar pratinjau halaman ${page.pageNumber}`}
                                className="p-1 text-slate-400 hover:text-blue-700 rounded transition-colors"
                              >
                                <Maximize2 className="w-3.5 h-3.5" aria-hidden="true" />
                              </button>
                            </div>
                          </div>

                          {tool.id === 'organize' && (
                            <div className="mt-2 pt-2 border-t border-slate-200/70 flex items-center justify-between gap-1">
                              <button
                                type="button"
                                onClick={() => movePage(index, -1)}
                                disabled={index === 0}
                                aria-label={`Geser halaman ${index + 1} ke kiri`}
                                className="p-1 text-slate-600 hover:text-blue-700 disabled:opacity-30 rounded"
                              >
                                <ArrowUp className="w-3.5 h-3.5 -rotate-90" />
                              </button>
                              <button
                                type="button"
                                onClick={() => movePage(index, 1)}
                                disabled={index === pages.length - 1}
                                aria-label={`Geser halaman ${index + 1} ke kanan`}
                                className="p-1 text-slate-600 hover:text-blue-700 disabled:opacity-30 rounded"
                              >
                                <ArrowDown className="w-3.5 h-3.5 -rotate-90" />
                              </button>
                              <button
                                type="button"
                                onClick={() => rotateSinglePage(page.id)}
                                aria-label={`Putar halaman ${index + 1}`}
                                className="p-1 text-slate-600 hover:text-blue-700 rounded"
                              >
                                <RotateCw className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => duplicateSinglePage(index)}
                                aria-label={`Duplikasi halaman ${index + 1}`}
                                className="p-1 text-slate-600 hover:text-blue-700 rounded"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteSinglePage(page.id)}
                                aria-label={`Hapus halaman ${index + 1}`}
                                className="p-1 text-slate-600 hover:text-red-600 rounded"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              /* Multi-file or Office File Staging List with Client-Side PDF Thumbnails */
              <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4">
                <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100">
                  <p className="font-display text-sm font-semibold text-slate-900 tabular-nums">
                    Daftar Berkas ({files.length})
                  </p>
                  {tool.multiple && (!tool.maxFiles || files.length < tool.maxFiles) && (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                    >
                      <FilePlus2 className="w-3.5 h-3.5" aria-hidden="true" />
                      Tambah Berkas
                    </button>
                  )}
                </div>

                <ul className="divide-y divide-slate-100">
                  {files.map((item, idx) => {
                    const itemIsPdf = isPdfFile(item.file);
                    return (
                      <li
                        key={item.id}
                        className="py-3.5 flex items-center justify-between gap-4"
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          {itemIsPdf ? (
                            <PdfFilePreview
                              file={item}
                              variant="thumbnail"
                              orderBadge={idx + 1}
                              onInspect={() =>
                                setInspectedFile({ file: item, initialPage: 1 })
                              }
                            />
                          ) : item.previewUrl ? (
                            <img
                              src={item.previewUrl}
                              alt={item.name}
                              className="w-12 h-12 rounded-lg object-cover border border-slate-200 shrink-0"
                            />
                          ) : (
                            <span className="w-10 h-10 rounded-lg bg-blue-50 text-blue-700 font-mono text-xs font-semibold inline-flex items-center justify-center shrink-0">
                              {idx + 1}
                            </span>
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-900 truncate">
                              {item.name}
                            </p>
                            <p className="text-xs font-mono tabular-nums text-slate-500 mt-0.5">
                              {formatFileSize(item.size)}
                              {item.pageCount ? ` · ${item.pageCount} halaman` : ''}
                              {item.width && item.height ? ` · ${item.width} × ${item.height} px` : ''}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {itemIsPdf && (
                            <button
                              type="button"
                              onClick={() =>
                                setInspectedFile({ file: item, initialPage: 1 })
                              }
                              aria-label={`Pratinjau ${item.name}`}
                              className="w-8 h-8 rounded-lg text-slate-500 hover:text-blue-700 hover:bg-blue-50 inline-flex items-center justify-center transition-colors"
                            >
                              <Eye className="w-4 h-4" aria-hidden="true" />
                            </button>
                          )}
                          {tool.multiple && files.length > 1 && (
                            <>
                              <button
                                type="button"
                                onClick={() => moveFile(idx, -1)}
                                disabled={idx === 0}
                                aria-label={`Pindahkan ${item.name} ke atas`}
                                className="w-8 h-8 rounded-lg text-slate-500 hover:text-blue-700 hover:bg-blue-50 disabled:opacity-30 inline-flex items-center justify-center"
                              >
                                <ArrowUp className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => moveFile(idx, 1)}
                                disabled={idx === files.length - 1}
                                aria-label={`Pindahkan ${item.name} ke bawah`}
                                className="w-8 h-8 rounded-lg text-slate-500 hover:text-blue-700 hover:bg-blue-50 disabled:opacity-30 inline-flex items-center justify-center"
                              >
                                <ArrowDown className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => removeFile(item.id)}
                            aria-label={`Hapus ${item.name}`}
                            className="w-8 h-8 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 inline-flex items-center justify-center"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>

                {tool.id === 'compare-pdf' && files.length < 2 && (
                  <p className="text-xs text-blue-700 bg-blue-50 border border-blue-200/70 rounded-xl px-4 py-3">
                    Tambahkan 1 berkas PDF lagi untuk mulai membandingkan perbedaan teks dan
                    tampilan secara berdampingan.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* RIGHT OPTIONS & PRIMARY CTA PANEL */}
          <aside className="lg:col-span-4 lg:sticky lg:top-24 bg-white border border-slate-200 rounded-2xl p-6 space-y-6">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900">
                Pengaturan {tool.shortName}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Sesuaikan opsi sebelum memproses berkas.
              </p>
            </div>

            {tool.id !== 'compare-pdf' ? (
              <>
                <ToolOptionsPanel
                  toolId={tool.id}
                  options={options}
                  onChange={updateOptions}
                  totalPages={pages.length || files[0]?.pageCount || 1}
                  selectedPagesCount={selectedPagesCount}
                  annotationCount={annotations.length}
                  onClearAnnotations={() => setAnnotations([])}
                  sourceImageDimensions={
                    files[0]?.width && files[0]?.height
                      ? { width: files[0].width, height: files[0].height }
                      : undefined
                  }
                  firstFileName={files[0]?.name}
                />

                <div className="pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={handleProcess}
                    disabled={processing}
                    className="w-full py-3 px-4 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-60 whitespace-nowrap"
                  >
                    {processing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                        Memproses Dokumen...
                      </>
                    ) : (
                      tool.actionLabel
                    )}
                  </button>
                </div>
              </>
            ) : (
              <div className="space-y-4 text-sm text-slate-600">
                <div className="space-y-2">
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                    <p className="text-xs text-slate-500">Dokumen A (Asal)</p>
                    <p className="text-xs font-medium text-slate-900 truncate mt-0.5">
                      {files[0]?.name || 'Belum dipilih'}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                    <p className="text-xs text-slate-500">Dokumen B (Pembanding)</p>
                    <p className="text-xs font-medium text-slate-900 truncate mt-0.5">
                      {files[1]?.name || 'Belum dipilih'}
                    </p>
                  </div>
                </div>

                {files.length < 2 ? (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-2.5 px-4 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold transition-colors"
                  >
                    Pilih File PDF Kedua
                  </button>
                ) : (
                  <div className="space-y-2.5 pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setFiles([files[1], files[0]])}
                      className="w-full py-2.5 px-4 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold transition-colors"
                    >
                      Tukar Posisi Dokumen A &harr; B
                    </button>
                    <button
                      type="button"
                      disabled={compareDiffLines.length === 0}
                      onClick={() => {
                        const report = [
                          `Laporan Perbandingan PDF Creator Tools`,
                          `Dokumen A: ${files[0].name}`,
                          `Dokumen B: ${files[1].name}`,
                          `----------------------------------------`,
                          ...compareDiffLines.map(
                            (l) => `${l.type === 'added' ? '+' : l.type === 'removed' ? '-' : ' '} ${l.text}`
                          ),
                        ].join('\n');
                        const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = sanitizeFilename(files[0].name, 'perbandingan', 'txt');
                        a.click();
                        setTimeout(() => URL.revokeObjectURL(url), 1000);
                      }}
                      className="w-full py-2.5 px-4 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      <Download className="w-3.5 h-3.5" aria-hidden="true" />
                      Unduh Laporan Perbedaan (.txt)
                    </button>
                  </div>
                )}
              </div>
            )}
          </aside>
        </div>
      )}

      {/* High-Resolution Pre-Processing PDF Inspection Modal */}
      {inspectedFile && (
        <PdfPreviewModal
          file={inspectedFile.file}
          initialPage={inspectedFile.initialPage}
          onClose={() => setInspectedFile(null)}
        />
      )}
    </div>
  );
}
