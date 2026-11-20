import { segmentForegroundMaskRgba } from './bgMath';

export const SAMPLE_PORTRAIT_URL = '/src/assets/images/sample_portrait_studio_1795195158608.jpg';

export interface StudioBackdropPreset {
  id: string;
  label: string;
  category: 'photo' | 'solid' | 'gradient';
  imageUrl?: string;
  color?: string;
  gradient?: [string, string];
  ambientTint?: string;
}

export const STUDIO_BACKDROP_PRESETS: StudioBackdropPreset[] = [
  // Photorealistic HD Studio Backdrops (bundled locally)
  {
    id: 'photo-studio-minimal',
    label: 'Studio Putih Biru',
    category: 'photo',
    imageUrl: '/src/assets/images/bg_studio_minimal_1795195159412.jpg',
    ambientTint: '#e0f2fe',
  },
  {
    id: 'photo-office-modern',
    label: 'Kantor Modern Bokeh',
    category: 'photo',
    imageUrl: '/src/assets/images/bg_office_modern_1795195159379.jpg',
    ambientTint: '#dbeafe',
  },
  {
    id: 'photo-outdoor-bokeh',
    label: 'Taman Cerah Bokeh',
    category: 'photo',
    imageUrl: '/src/assets/images/bg_outdoor_bokeh_1795195158547.jpg',
    ambientTint: '#fef9c3',
  },
  {
    id: 'photo-podium-blue',
    label: 'Arsitektur Travertine',
    category: 'photo',
    imageUrl: '/src/assets/images/bg_podium_blue_1795195159346.jpg',
    ambientTint: '#e2e8f0',
  },

  // Solid & Official ID Photo Backdrops
  {
    id: 'solid-transparent',
    label: 'Transparan',
    category: 'solid',
    color: 'transparent',
  },
  {
    id: 'solid-pasfoto-blue',
    label: 'Pas Foto Biru',
    category: 'solid',
    color: '#1d4ed8',
    ambientTint: '#3b82f6',
  },
  {
    id: 'solid-pasfoto-red',
    label: 'Pas Foto Merah',
    category: 'solid',
    color: '#c81e1e',
    ambientTint: '#ef4444',
  },
  {
    id: 'solid-studio-white',
    label: 'Putih Bersih',
    category: 'solid',
    color: '#ffffff',
    ambientTint: '#f8fafc',
  },
  {
    id: 'solid-cool-slate',
    label: 'Abu Studio',
    category: 'solid',
    color: '#e2e8f0',
    ambientTint: '#cbd5e1',
  },
  {
    id: 'solid-deep-navy',
    label: 'Navy Elegan',
    category: 'solid',
    color: '#0f172a',
    ambientTint: '#1e3a8a',
  },

  // Curated Elegant Gradients
  {
    id: 'grad-sky-mist',
    label: 'Biru Langit Lembut',
    category: 'gradient',
    gradient: ['#eff6ff', '#bfdbfe'],
    ambientTint: '#dbeafe',
  },
  {
    id: 'grad-royal-blue',
    label: 'Safir Profesional',
    category: 'gradient',
    gradient: ['#1e3a8a', '#2563eb'],
    ambientTint: '#3b82f6',
  },
  {
    id: 'grad-silver-mist',
    label: 'Kabut Perak',
    category: 'gradient',
    gradient: ['#f8fafc', '#cbd5e1'],
    ambientTint: '#e2e8f0',
  },
  {
    id: 'grad-ocean-calm',
    label: 'Biru Samudra',
    category: 'gradient',
    gradient: ['#0c4a6e', '#0284c7'],
    ambientTint: '#38bdf8',
  },
];

export type SegmentationEngineMode = 'neural-ai' | 'precision-fast';

export interface RemoveBackgroundOutput {
  cutoutBlob: Blob;
  cutoutUrl: string;
  width: number;
  height: number;
  engineUsed: 'neural-ai' | 'precision-fast';
  usedFallback: boolean;
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Gagal memuat gambar.'));
    img.src = src;
  });
}

/**
 * Fast high-precision CIE-Lab border-seeded alpha matting engine (runs in ~100ms locally).
 */
export async function runPrecisionFastCutout(
  imageFileOrUrl: File | Blob | string,
  tolerance = 22
): Promise<RemoveBackgroundOutput> {
  const objectUrl =
    typeof imageFileOrUrl === 'string'
      ? imageFileOrUrl
      : URL.createObjectURL(imageFileOrUrl);

  try {
    const img = await loadImageElement(objectUrl);
    const maxDim = 1400;
    const ratio = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.max(1, Math.round(img.naturalWidth * ratio));
    const height = Math.max(1, Math.round(img.naturalHeight * ratio));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Kanvas browser tidak tersedia.');

    ctx.drawImage(img, 0, 0, width, height);
    const imgData = ctx.getImageData(0, 0, width, height);
    const masked = segmentForegroundMaskRgba(imgData.data, width, height, tolerance);
    const outData = new ImageData(new Uint8ClampedArray(masked), width, height);
    ctx.putImageData(outData, 0, 0);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Gagal membuat PNG transparan.'))), 'image/png');
    });

    return {
      cutoutBlob: blob,
      cutoutUrl: URL.createObjectURL(blob),
      width,
      height,
      engineUsed: 'precision-fast',
      usedFallback: false,
    };
  } finally {
    if (typeof imageFileOrUrl !== 'string') {
      URL.revokeObjectURL(objectUrl);
    }
  }
}

/**
 * Runs real neural network ISNet AI background removal (@imgly/background-removal) in-browser
 * with automatic timeout protection and seamless fallback to precision Lab matting if model CDN is offline.
 */
export async function removeBackgroundWithAI(
  imageBlob: Blob,
  options: {
    mode: SegmentationEngineMode;
    tolerance?: number;
    onProgress?: (percent: number, stageLabel: string) => void;
  }
): Promise<RemoveBackgroundOutput> {
  const tolerance = options.tolerance ?? 22;

  if (options.mode === 'precision-fast') {
    options.onProgress?.(35, 'Menganalisis tepi subjek presisi tinggi...');
    const res = await runPrecisionFastCutout(imageBlob, tolerance);
    options.onProgress?.(100, 'Selesai');
    return res;
  }

  // Neural AI mode via @imgly/background-removal (ONNX ISNet quantized for rapid browser inference)
  try {
    options.onProgress?.(10, 'Memuat model AI segmentasi subjek...');
    const { removeBackground } = await import('@imgly/background-removal');

    const neuralPromise = removeBackground(imageBlob, {
      model: 'isnet_quint8',
      output: { format: 'image/png', quality: 1 },
      progress: (key: string, current: number, total: number) => {
        if (total > 0) {
          const pct = Math.min(95, Math.max(12, Math.round((current / total) * 85) + 10));
          const label = key.includes('fetch')
            ? 'Menyiapkan model AI neural...'
            : 'AI sedang memisahkan subjek dari latar belakang...';
          options.onProgress?.(pct, label);
        }
      },
    });

    // Guard against blocked external model CDN in restricted offline environments
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('AI_CDN_TIMEOUT')), 22000)
    );

    const cutoutBlob = await Promise.race([neuralPromise, timeoutPromise]);
    const cutoutUrl = URL.createObjectURL(cutoutBlob);
    const img = await loadImageElement(cutoutUrl);

    options.onProgress?.(100, 'Selesai');
    return {
      cutoutBlob,
      cutoutUrl,
      width: img.naturalWidth,
      height: img.naturalHeight,
      engineUsed: 'neural-ai',
      usedFallback: false,
    };
  } catch {
    // Seamless resilient local precision segmentation fallback
    options.onProgress?.(65, 'Mengalihkan ke mesin pemotong lokal presisi...');
    const fallbackRes = await runPrecisionFastCutout(imageBlob, tolerance);
    options.onProgress?.(100, 'Selesai');
    return {
      ...fallbackRes,
      usedFallback: true,
    };
  }
}

export interface StudioCompositeOptions {
  backgroundType: 'transparent' | 'solid' | 'gradient' | 'photo' | 'custom-photo';
  solidColor: string;
  gradientColors: [string, string];
  photoUrl?: string;
  customPhotoUrl?: string;
  ambientTint?: string;
  blurPx: number;
  featherPx: number;
  dropShadow: boolean;
  subjectScale: number;
  verticalOffsetPct: number;
  ambientMatchPct: number;
}

/**
 * Composites a transparent cutout subject onto any studio background with DSLR bokeh blur,
 * natural drop shadow, edge feathering, and ambient lighting harmonization.
 */
export async function renderStudioComposite(
  cutoutUrl: string,
  options: StudioCompositeOptions
): Promise<HTMLCanvasElement> {
  const subjectImg = await loadImageElement(cutoutUrl);
  const width = subjectImg.naturalWidth;
  const height = subjectImg.naturalHeight;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Kanvas browser tidak tersedia.');

  // 1. Render Background Layer
  if (options.backgroundType === 'solid' && options.solidColor !== 'transparent') {
    ctx.fillStyle = options.solidColor;
    ctx.fillRect(0, 0, width, height);
  } else if (options.backgroundType === 'gradient') {
    const grad = ctx.createLinearGradient(0, 0, width * 0.35, height);
    grad.addColorStop(0, options.gradientColors[0]);
    grad.addColorStop(1, options.gradientColors[1]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  } else if (
    (options.backgroundType === 'photo' && options.photoUrl) ||
    (options.backgroundType === 'custom-photo' && options.customPhotoUrl)
  ) {
    const bgSrc =
      options.backgroundType === 'custom-photo' ? options.customPhotoUrl! : options.photoUrl!;
    const bgImg = await loadImageElement(bgSrc);

    // Cover-fit crop so backdrop never stretches or distorts
    const scale = Math.max(width / bgImg.naturalWidth, height / bgImg.naturalHeight);
    const drawW = bgImg.naturalWidth * scale;
    const drawH = bgImg.naturalHeight * scale;
    const dx = (width - drawW) / 2;
    const dy = (height - drawH) / 2;

    ctx.save();
    if (options.blurPx > 0) {
      // Expand slightly to avoid dark blurred edge vignette
      const pad = options.blurPx * 2;
      ctx.filter = `blur(${options.blurPx}px)`;
      ctx.drawImage(bgImg, dx - pad, dy - pad, drawW + pad * 2, drawH + pad * 2);
    } else {
      ctx.drawImage(bgImg, dx, dy, drawW, drawH);
    }
    ctx.restore();
  }

  // 2. Prepare Subject Layer (with optional subtle edge feathering & ambient lighting tint)
  const subCanvas = document.createElement('canvas');
  subCanvas.width = width;
  subCanvas.height = height;
  const subCtx = subCanvas.getContext('2d');
  if (subCtx) {
    if (options.featherPx > 0) {
      subCtx.filter = `blur(${Math.min(1.8, options.featherPx * 0.25)}px)`;
    }
    subCtx.drawImage(subjectImg, 0, 0, width, height);
    subCtx.filter = 'none';

    // Subtle ambient lighting tint harmonization inside subject alpha mask
    if (
      options.backgroundType !== 'transparent' &&
      options.ambientMatchPct > 0 &&
      options.ambientTint
    ) {
      subCtx.save();
      subCtx.globalCompositeOperation = 'source-atop';
      subCtx.globalAlpha = Math.min(0.28, options.ambientMatchPct / 100);
      subCtx.fillStyle = options.ambientTint;
      subCtx.fillRect(0, 0, width, height);
      subCtx.restore();
    }
  }

  // 3. Draw Subject onto Final Canvas (with scale, vertical offset & natural studio shadow)
  const s = options.subjectScale;
  const targetW = width * s;
  const targetH = height * s;
  const offsetX = (width - targetW) / 2;
  const offsetY = (height - targetH) + (options.verticalOffsetPct / 100) * height;

  ctx.save();
  if (options.dropShadow && options.backgroundType !== 'transparent') {
    ctx.shadowColor = 'rgba(15, 23, 42, 0.28)';
    ctx.shadowBlur = Math.max(14, Math.round(width * 0.028));
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = Math.max(6, Math.round(height * 0.012));
  }
  ctx.drawImage(subCanvas, offsetX, offsetY, targetW, targetH);
  ctx.restore();

  return canvas;
}

export async function fetchSamplePortraitFile(): Promise<File> {
  const res = await fetch(SAMPLE_PORTRAIT_URL);
  if (!res.ok) throw new Error('Gagal memuat foto contoh studio.');
  const blob = await res.blob();
  return new File([blob], 'Foto_Studio_Profesional.jpg', { type: 'image/jpeg' });
}
