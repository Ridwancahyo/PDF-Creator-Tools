import JSZip from 'jszip';
import {
  applyUnsharpMaskRgba,
  computeResizedDimensions,
  computeUpscaleDimensions,
  getSharpenParams,
  isHeicFile,
  resolveImageFormatMeta,
  type ImageTargetFormat,
  type ResizeMode,
  type SharpenStrength,
  type UpscaleFactor,
} from './imageToolsMath';
import { createPdfFromImageBuffers, sanitizeFilename } from './pdfHelpers';

export interface DecodedImageSource {
  source: HTMLImageElement;
  width: number;
  height: number;
  cleanup: () => void;
}

function loadImageElementFromBlob(blob: Blob): Promise<DecodedImageSource> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      resolve({
        source: img,
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height,
        cleanup: () => URL.revokeObjectURL(url),
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Gagal memuat gambar. Pastikan berkas gambar tidak rusak.'));
    };
    img.src = url;
  });
}

/**
 * Decodes a standard image file or HEIC/HEIF file (via heic2any) into a drawable HTMLImageElement.
 */
async function decodeFileToImageSource(file: File): Promise<DecodedImageSource> {
  if (isHeicFile(file)) {
    const heicMod = await import('heic2any');
    const heic2anyFn = heicMod.default;
    const converted = await heic2anyFn({
      blob: file,
      toType: 'image/png',
      quality: 0.95,
    });
    const outBlob = Array.isArray(converted) ? converted[0] : converted;
    return loadImageElementFromBlob(outBlob);
  }
  return loadImageElementFromBlob(file);
}

export async function readImageDimensions(
  file: File
): Promise<{ width: number; height: number } | undefined> {
  if (isHeicFile(file)) {
    return undefined;
  }
  try {
    const decoded = await loadImageElementFromBlob(file);
    const dims = { width: decoded.width, height: decoded.height };
    decoded.cleanup();
    return dims;
  } catch {
    return undefined;
  }
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality?: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Gagal mengekspor gambar dari kanvas browser.'));
          return;
        }
        resolve(blob);
      },
      mimeType,
      quality
    );
  });
}

function renderSourceToCanvas(
  source: CanvasImageSource,
  targetW: number,
  targetH: number,
  bgFillHex: string | null
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(targetW));
  canvas.height = Math.max(1, Math.round(targetH));
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Kanvas 2D tidak tersedia pada browser ini.');
  }
  if (bgFillHex) {
    ctx.fillStyle = bgFillHex;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export interface ImageBatchResult {
  blob: Blob;
  filename: string;
  mimeType: string;
  previewUrl?: string;
  summary: string;
  secondaryDetail?: string;
  pageCount?: number;
}

/**
 * Converts one or more JPG / PNG / JPEG / WebP files into JPG, JPEG, or PNG.
 */
export async function convertImageFiles(
  files: File[],
  options: {
    targetFormat: ImageTargetFormat;
    quality: number;
    bgFillHex: string;
  }
): Promise<ImageBatchResult> {
  const meta = resolveImageFormatMeta(options.targetFormat);
  const convertedItems: Array<{
    blob: Blob;
    filename: string;
    width: number;
    height: number;
  }> = [];

  for (const file of files) {
    const decoded = await decodeFileToImageSource(file);
    try {
      const canvas = renderSourceToCanvas(
        decoded.source,
        decoded.width,
        decoded.height,
        meta.supportsAlpha ? null : options.bgFillHex || '#ffffff'
      );
      const blob = await canvasToBlob(
        canvas,
        meta.mimeType,
        meta.supportsQuality ? options.quality : undefined
      );
      convertedItems.push({
        blob,
        filename: sanitizeFilename(file.name, meta.extension, meta.extension),
        width: decoded.width,
        height: decoded.height,
      });
    } finally {
      decoded.cleanup();
    }
  }

  if (convertedItems.length === 1) {
    const item = convertedItems[0];
    return {
      blob: item.blob,
      filename: item.filename,
      mimeType: meta.mimeType,
      previewUrl: URL.createObjectURL(item.blob),
      summary: `Gambar berhasil dikonversi ke format ${meta.label} (${item.width} × ${item.height} px).`,
      secondaryDetail: `${item.width} × ${item.height} px · ${meta.label}`,
    };
  }

  const zip = new JSZip();
  for (const item of convertedItems) {
    zip.file(item.filename, item.blob);
  }
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  return {
    blob: zipBlob,
    filename: sanitizeFilename(files[0].name, `konversi_${meta.extension}`, 'zip'),
    mimeType: 'application/zip',
    previewUrl: URL.createObjectURL(convertedItems[0].blob),
    summary: `${convertedItems.length} gambar berhasil dikonversi ke format ${meta.label} dalam satu arsip ZIP.`,
    secondaryDetail: `${convertedItems.length} berkas · ${meta.label}`,
  };
}

/**
 * Converts HEIC / HEIF (or fallback images) into JPG, PNG, or a clean PDF document.
 */
export async function convertHeicFiles(
  files: File[],
  options: {
    outputFormat: 'jpg' | 'png' | 'pdf';
    quality: number;
    pageSize: 'a4' | 'letter' | 'fit';
    orientation: 'portrait' | 'landscape';
    marginMm: number;
  }
): Promise<ImageBatchResult> {
  if (options.outputFormat === 'pdf') {
    const imageBuffers: Array<{ bytes: Uint8Array; mimeType: 'image/jpeg' | 'image/png' }> = [];
    for (const file of files) {
      const decoded = await decodeFileToImageSource(file);
      try {
        const canvas = renderSourceToCanvas(decoded.source, decoded.width, decoded.height, '#ffffff');
        const jpegBlob = await canvasToBlob(canvas, 'image/jpeg', options.quality);
        const bytes = new Uint8Array(await jpegBlob.arrayBuffer());
        imageBuffers.push({ bytes, mimeType: 'image/jpeg' });
      } finally {
        decoded.cleanup();
      }
    }

    const { bytes, pageCount } = await createPdfFromImageBuffers(imageBuffers, {
      pageSize: options.pageSize,
      orientation: options.orientation,
      marginMm: options.marginMm,
    });
    const pdfBlob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
    return {
      blob: pdfBlob,
      filename: sanitizeFilename(files[0].name, 'heic_ke_pdf', 'pdf'),
      mimeType: 'application/pdf',
      previewUrl: URL.createObjectURL(pdfBlob),
      pageCount,
      summary: `${files.length} berkas foto berhasil dikonversi menjadi ${pageCount} halaman PDF.`,
    };
  }

  return convertImageFiles(files, {
    targetFormat: options.outputFormat,
    quality: options.quality,
    bgFillHex: '#ffffff',
  });
}

/**
 * Progressive multi-step HD image upscaling (2x / 3x / 4x) with adaptive Unsharp Mask edge clarity.
 */
export async function upscaleImageFile(
  file: File,
  options: {
    scaleFactor: UpscaleFactor;
    sharpenStrength: SharpenStrength;
    outputFormat: ImageTargetFormat;
    quality: number;
  }
): Promise<ImageBatchResult> {
  const meta = resolveImageFormatMeta(options.outputFormat);
  const decoded = await decodeFileToImageSource(file);

  try {
    const target = computeUpscaleDimensions(decoded.width, decoded.height, options.scaleFactor);

    // Progressive stepping (max ~1.6x per pass) avoids blurry halos compared to single-jump resize
    let currentCanvas = renderSourceToCanvas(
      decoded.source,
      decoded.width,
      decoded.height,
      meta.supportsAlpha ? null : '#ffffff'
    );

    let currW = decoded.width;
    let currH = decoded.height;
    while (currW < target.width || currH < target.height) {
      const nextW = Math.min(target.width, Math.ceil(currW * 1.6));
      const nextH = Math.min(target.height, Math.ceil(currH * 1.6));
      currentCanvas = renderSourceToCanvas(
        currentCanvas,
        nextW,
        nextH,
        meta.supportsAlpha ? null : '#ffffff'
      );
      currW = nextW;
      currH = nextH;
    }

    // Apply adaptive Unsharp Mask edge sharpening
    const ctx = currentCanvas.getContext('2d');
    if (ctx) {
      const imgData = ctx.getImageData(0, 0, currentCanvas.width, currentCanvas.height);
      const { amount, threshold } = getSharpenParams(options.sharpenStrength);
      const sharpened = applyUnsharpMaskRgba(
        imgData.data,
        currentCanvas.width,
        currentCanvas.height,
        amount,
        threshold
      );
      imgData.data.set(sharpened);
      ctx.putImageData(imgData, 0, 0);
    }

    const blob = await canvasToBlob(
      currentCanvas,
      meta.mimeType,
      meta.supportsQuality ? options.quality : undefined
    );

    const clampNote = target.clamped ? ' (disesuaikan ke batas aman HD)' : '';
    return {
      blob,
      filename: sanitizeFilename(
        file.name,
        `upscale_${options.scaleFactor}x`,
        meta.extension
      ),
      mimeType: meta.mimeType,
      previewUrl: URL.createObjectURL(blob),
      summary: `Resolusi gambar berhasil ditingkatkan ${options.scaleFactor}× dari ${decoded.width} × ${decoded.height} px menjadi ${target.width} × ${target.height} px${clampNote}.`,
      secondaryDetail: `${decoded.width}×${decoded.height} → ${target.width}×${target.height} px`,
    };
  } finally {
    decoded.cleanup();
  }
}

/**
 * Resizes one or more images by exact pixels, percentage, or common preset sizes.
 */
export async function resizeImageFiles(
  files: File[],
  options: {
    mode: ResizeMode;
    width: number;
    height: number;
    percent: number;
    lockAspect: boolean;
    presetId: string;
    outputFormat: ImageTargetFormat;
    quality: number;
  }
): Promise<ImageBatchResult> {
  const meta = resolveImageFormatMeta(options.outputFormat);
  const outputs: Array<{
    blob: Blob;
    filename: string;
    origW: number;
    origH: number;
    newW: number;
    newH: number;
  }> = [];

  for (const file of files) {
    const decoded = await decodeFileToImageSource(file);
    try {
      const target = computeResizedDimensions({
        origW: decoded.width,
        origH: decoded.height,
        mode: options.mode,
        width: options.width,
        height: options.height,
        percent: options.percent,
        lockAspect: options.lockAspect,
        changedAxis: 'width',
        presetId: options.presetId,
      });

      // Step down smoothly when shrinking more than 2x to prevent aliasing
      let working: CanvasImageSource = decoded.source;
      let currW = decoded.width;
      let currH = decoded.height;
      while (currW * 0.5 > target.width && currH * 0.5 > target.height) {
        currW = Math.max(target.width, Math.round(currW * 0.5));
        currH = Math.max(target.height, Math.round(currH * 0.5));
        working = renderSourceToCanvas(
          working,
          currW,
          currH,
          meta.supportsAlpha ? null : '#ffffff'
        );
      }

      const finalCanvas = renderSourceToCanvas(
        working,
        target.width,
        target.height,
        meta.supportsAlpha ? null : '#ffffff'
      );

      const blob = await canvasToBlob(
        finalCanvas,
        meta.mimeType,
        meta.supportsQuality ? options.quality : undefined
      );

      outputs.push({
        blob,
        filename: sanitizeFilename(
          file.name,
          `${target.width}x${target.height}`,
          meta.extension
        ),
        origW: decoded.width,
        origH: decoded.height,
        newW: target.width,
        newH: target.height,
      });
    } finally {
      decoded.cleanup();
    }
  }

  if (outputs.length === 1) {
    const item = outputs[0];
    return {
      blob: item.blob,
      filename: item.filename,
      mimeType: meta.mimeType,
      previewUrl: URL.createObjectURL(item.blob),
      summary: `Ukuran gambar berhasil diubah dari ${item.origW} × ${item.origH} px menjadi ${item.newW} × ${item.newH} px (${meta.label}).`,
      secondaryDetail: `${item.newW} × ${item.newH} px`,
    };
  }

  const zip = new JSZip();
  for (const item of outputs) {
    zip.file(item.filename, item.blob);
  }
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  return {
    blob: zipBlob,
    filename: sanitizeFilename(files[0].name, 'resize_batch', 'zip'),
    mimeType: 'application/zip',
    previewUrl: URL.createObjectURL(outputs[0].blob),
    summary: `${outputs.length} gambar berhasil diubah ukurannya dan dikemas dalam arsip ZIP.`,
    secondaryDetail: `${outputs.length} gambar · ${meta.label}`,
  };
}
