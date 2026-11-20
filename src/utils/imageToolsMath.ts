export type ImageTargetFormat = 'jpg' | 'jpeg' | 'png';
export type ResizeMode = 'pixels' | 'percent' | 'preset';
export type UpscaleFactor = 2 | 3 | 4;
export type SharpenStrength = 'natural' | 'crisp' | 'ultra';

export interface ImageFormatMeta {
  format: ImageTargetFormat;
  mimeType: 'image/jpeg' | 'image/png';
  extension: 'jpg' | 'jpeg' | 'png';
  label: string;
  supportsQuality: boolean;
  supportsAlpha: boolean;
}

export interface ResizePreset {
  id: string;
  label: string;
  width: number;
  height: number;
  category: string;
}

export const IMAGE_RESIZE_PRESETS: ResizePreset[] = [
  { id: 'fhd', label: 'Full HD 16:9 (1920 × 1080)', width: 1920, height: 1080, category: 'Layar' },
  { id: 'hd', label: 'HD 16:9 (1280 × 720)', width: 1280, height: 720, category: 'Layar' },
  { id: 'ig-square', label: 'Persegi / Feed (1080 × 1080)', width: 1080, height: 1080, category: 'Sosial' },
  { id: 'ig-portrait', label: 'Potret 4:5 (1080 × 1350)', width: 1080, height: 1350, category: 'Sosial' },
  { id: 'pasfoto-3x4', label: 'Pas Foto 3×4 cm (354 × 472)', width: 354, height: 472, category: 'Dokumen' },
  { id: 'pasfoto-4x6', label: 'Pas Foto 4×6 cm (472 × 709)', width: 472, height: 709, category: 'Dokumen' },
];

export function resolveImageFormatMeta(format: ImageTargetFormat): ImageFormatMeta {
  switch (format) {
    case 'png':
      return {
        format: 'png',
        mimeType: 'image/png',
        extension: 'png',
        label: 'PNG',
        supportsQuality: false,
        supportsAlpha: true,
      };
    case 'jpeg':
      return {
        format: 'jpeg',
        mimeType: 'image/jpeg',
        extension: 'jpeg',
        label: 'JPEG',
        supportsQuality: true,
        supportsAlpha: false,
      };
    case 'jpg':
    default:
      return {
        format: 'jpg',
        mimeType: 'image/jpeg',
        extension: 'jpg',
        label: 'JPG',
        supportsQuality: true,
        supportsAlpha: false,
      };
  }
}

export function isHeicFile(file: { name: string; type?: string }): boolean {
  const lower = file.name.toLowerCase();
  const mime = (file.type || '').toLowerCase();
  return (
    lower.endsWith('.heic') ||
    lower.endsWith('.heif') ||
    mime === 'image/heic' ||
    mime === 'image/heif' ||
    mime === 'image/heic-sequence' ||
    mime === 'image/heif-sequence'
  );
}

export interface ResizeDimensionsInput {
  origW: number;
  origH: number;
  mode: ResizeMode;
  width?: number;
  height?: number;
  percent?: number;
  lockAspect?: boolean;
  changedAxis?: 'width' | 'height';
  presetId?: string;
  maxDim?: number;
}

export interface ResizeDimensionsResult {
  width: number;
  height: number;
}

/**
 * Pure, clamped calculation for target resized dimensions across pixels, percentage, and preset modes.
 */
export function computeResizedDimensions(input: ResizeDimensionsInput): ResizeDimensionsResult {
  const origW = Math.max(1, Math.round(input.origW));
  const origH = Math.max(1, Math.round(input.origH));
  const maxDim = Math.max(64, Math.round(input.maxDim ?? 8192));
  const clamp = (val: number) => Math.max(1, Math.min(maxDim, Math.round(val)));

  if (input.mode === 'preset') {
    const preset =
      IMAGE_RESIZE_PRESETS.find((p) => p.id === input.presetId) || IMAGE_RESIZE_PRESETS[0];
    return {
      width: clamp(preset.width),
      height: clamp(preset.height),
    };
  }

  if (input.mode === 'percent') {
    const pct = Math.max(5, Math.min(400, Number(input.percent ?? 100)));
    return {
      width: clamp((origW * pct) / 100),
      height: clamp((origH * pct) / 100),
    };
  }

  // Pixel mode
  const ratio = origW / origH;
  const reqW = input.width && input.width > 0 ? input.width : origW;
  const reqH = input.height && input.height > 0 ? input.height : origH;

  if (input.lockAspect) {
    if (input.changedAxis === 'height') {
      const h = clamp(reqH);
      return { width: clamp(h * ratio), height: h };
    }
    const w = clamp(reqW);
    return { width: w, height: clamp(w / ratio) };
  }

  return {
    width: clamp(reqW),
    height: clamp(reqH),
  };
}

/**
 * Computes safe HD upscaled target dimensions, capping at maxDim so browser canvases never OOM.
 */
export function computeUpscaleDimensions(
  origW: number,
  origH: number,
  factor: UpscaleFactor,
  maxDim = 6144
): { width: number; height: number; effectiveScale: number; clamped: boolean } {
  const safeW = Math.max(1, Math.round(origW));
  const safeH = Math.max(1, Math.round(origH));
  const rawW = safeW * factor;
  const rawH = safeH * factor;
  const largest = Math.max(rawW, rawH);

  if (largest <= maxDim) {
    return {
      width: rawW,
      height: rawH,
      effectiveScale: factor,
      clamped: false,
    };
  }

  const down = maxDim / largest;
  return {
    width: Math.max(1, Math.round(rawW * down)),
    height: Math.max(1, Math.round(rawH * down)),
    effectiveScale: Number((factor * down).toFixed(2)),
    clamped: true,
  };
}

export function getSharpenParams(strength: SharpenStrength): {
  amount: number;
  threshold: number;
} {
  switch (strength) {
    case 'natural':
      return { amount: 0.45, threshold: 4 };
    case 'ultra':
      return { amount: 1.15, threshold: 2 };
    case 'crisp':
    default:
      return { amount: 0.78, threshold: 3 };
  }
}

/**
 * Applies a 3x3 Gaussian-kernel Unsharp Mask (USM) to RGBA pixel data in-place-compatible form,
 * returning a new Uint8ClampedArray with crisper edges while ignoring subtle flat-area noise via threshold.
 */
export function applyUnsharpMaskRgba(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  amount = 0.75,
  threshold = 3
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba.length);
  if (width < 3 || height < 3 || amount <= 0) {
    out.set(rgba);
    return out;
  }

  out.set(rgba);

  for (let y = 1; y < height - 1; y++) {
    const rowPrev = (y - 1) * width;
    const rowCurr = y * width;
    const rowNext = (y + 1) * width;

    for (let x = 1; x < width - 1; x++) {
      const idx = (rowCurr + x) * 4;
      const idxTL = (rowPrev + x - 1) * 4;
      const idxTC = (rowPrev + x) * 4;
      const idxTR = (rowPrev + x + 1) * 4;
      const idxML = (rowCurr + x - 1) * 4;
      const idxMR = (rowCurr + x + 1) * 4;
      const idxBL = (rowNext + x - 1) * 4;
      const idxBC = (rowNext + x) * 4;
      const idxBR = (rowNext + x + 1) * 4;

      for (let c = 0; c < 3; c++) {
        const orig = rgba[idx + c];
        // 3x3 Gaussian blur weights: [1,2,1; 2,4,2; 1,2,1] / 16
        const blurred =
          (rgba[idxTL + c] +
            2 * rgba[idxTC + c] +
            rgba[idxTR + c] +
            2 * rgba[idxML + c] +
            4 * orig +
            2 * rgba[idxMR + c] +
            rgba[idxBL + c] +
            2 * rgba[idxBC + c] +
            rgba[idxBR + c]) /
          16;

        const diff = orig - blurred;
        if (Math.abs(diff) >= threshold) {
          const sharpened = orig + diff * amount;
          out[idx + c] = sharpened < 0 ? 0 : sharpened > 255 ? 255 : Math.round(sharpened);
        } else {
          out[idx + c] = orig;
        }
      }
      out[idx + 3] = rgba[idx + 3];
    }
  }

  return out;
}
