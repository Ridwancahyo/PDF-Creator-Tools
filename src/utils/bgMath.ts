/**
 * Pure, deterministic CIE-Lab color math and edge-aware foreground matting utilities.
 * Decoupled from browser DOM/Canvas APIs so they can be unit tested directly via node:test.
 */

export interface LabColor {
  l: number;
  a: number;
  b: number;
}

export function rgbToLab(r: number, g: number, b: number): LabColor {
  let sr = r / 255;
  let sg = g / 255;
  let sb = b / 255;

  sr = sr > 0.04045 ? Math.pow((sr + 0.055) / 1.055, 2.4) : sr / 12.92;
  sg = sg > 0.04045 ? Math.pow((sg + 0.055) / 1.055, 2.4) : sg / 12.92;
  sb = sb > 0.04045 ? Math.pow((sb + 0.055) / 1.055, 2.4) : sb / 12.92;

  const x = (sr * 0.4124564 + sg * 0.3575761 + sb * 0.1804375) / 0.95047;
  const y = sr * 0.2126729 + sg * 0.7151522 + sb * 0.072175;
  const z = (sr * 0.0193339 + sg * 0.119192 + sb * 0.9503041) / 1.08883;

  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);

  return {
    l: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

export function labDistance(c1: LabColor, c2: LabColor): number {
  const dl = c1.l - c2.l;
  const da = c1.a - c2.a;
  const db = c1.b - c2.b;
  return Math.sqrt(dl * dl + da * da + db * db);
}

/**
 * Sample dominant background colors from the upper perimeter (top edge and upper left/right edges)
 * of an RGBA image buffer. Intentionally excludes the bottom border where portraits and standing
 * subjects exit the frame, and filters out distant foreground clusters.
 */
export function sampleBorderLabColors(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  step = 6
): LabColor[] {
  const samples: LabColor[] = [];
  const pushPixel = (x: number, y: number) => {
    const idx = (y * width + x) * 4;
    if (rgba[idx + 3] < 20) return;
    samples.push(rgbToLab(rgba[idx], rgba[idx + 1], rgba[idx + 2]));
  };

  // Sample top border (full width)
  const topInset = Math.min(height - 1, 2);
  for (let x = 0; x < width; x += step) {
    pushPixel(x, 0);
    pushPixel(x, topInset);
  }

  // Sample upper 55% of left and right borders (above typical portrait shoulders/torso)
  const upperHeightLimit = Math.max(1, Math.floor(height * 0.55));
  const leftInset = Math.min(width - 1, 2);
  const rightInset = Math.max(0, width - 3);
  for (let y = 0; y < upperHeightLimit; y += step) {
    pushPixel(0, y);
    pushPixel(leftInset, y);
    pushPixel(width - 1, y);
    pushPixel(rightInset, y);
  }

  if (samples.length === 0) {
    return [];
  }

  // Cluster upper-perimeter samples into candidate swatches
  const palette: Array<{ color: LabColor; count: number }> = [];
  for (const s of samples) {
    let matched = false;
    for (const bucket of palette) {
      if (labDistance(s, bucket.color) < 8) {
        const n = bucket.count + 1;
        bucket.color = {
          l: (bucket.color.l * bucket.count + s.l) / n,
          a: (bucket.color.a * bucket.count + s.a) / n,
          b: (bucket.color.b * bucket.count + s.b) / n,
        };
        bucket.count = n;
        matched = true;
        break;
      }
    }
    if (!matched && palette.length < 10) {
      palette.push({ color: s, count: 1 });
    }
  }

  palette.sort((a, b) => b.count - a.count);
  const primary = palette[0];
  const minClusterCount = Math.max(2, Math.floor(samples.length * 0.08));

  // Keep primary dominant backdrop color plus gentle lighting-gradient neighbors only
  const kept = [primary.color];
  for (let i = 1; i < palette.length && kept.length < 3; i++) {
    const candidate = palette[i];
    if (
      candidate.count >= minClusterCount &&
      labDistance(candidate.color, primary.color) <= 22
    ) {
      kept.push(candidate.color);
    }
  }

  return kept;
}

/**
 * High-precision border-seeded CIE-Lab flood-fill segmentation with soft alpha matting.
 * Preserves interior subject colors even when similar to the background (because flood-fill
 * only propagates through connected background regions from the image borders).
 */
export function segmentForegroundMaskRgba(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  tolerance = 22
): Uint8ClampedArray {
  const total = width * height;
  const out = new Uint8ClampedArray(rgba);
  const bgPalette = sampleBorderLabColors(
    rgba,
    width,
    height,
    Math.max(2, Math.floor(Math.min(width, height) / 60))
  );

  if (bgPalette.length === 0) {
    return out;
  }

  const labL = new Float32Array(total);
  const labA = new Float32Array(total);
  const labB = new Float32Array(total);
  const minDist = new Float32Array(total);

  for (let i = 0; i < total; i++) {
    const idx = i * 4;
    if (rgba[idx + 3] < 10) {
      minDist[i] = 0;
      continue;
    }
    const lab = rgbToLab(rgba[idx], rgba[idx + 1], rgba[idx + 2]);
    labL[i] = lab.l;
    labA[i] = lab.a;
    labB[i] = lab.b;

    let best = Infinity;
    for (let k = 0; k < bgPalette.length; k++) {
      const d = labDistance(lab, bgPalette[k]);
      if (d < best) best = d;
    }
    minDist[i] = best;
  }

  // BFS flood-fill starting from outer borders matching the upper-border background palette
  const visited = new Uint8Array(total);
  const bgState = new Uint8Array(total); // 0 = foreground, 1 = definite bg, 2 = soft edge
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;

  const hardThreshold = Math.max(5, tolerance);
  const softThreshold = hardThreshold + 9;
  const maxLocalJump = Math.max(8, hardThreshold * 0.65);

  const trySeed = (x: number, y: number) => {
    const pos = y * width + x;
    if (visited[pos]) return;
    if (minDist[pos] <= hardThreshold) {
      visited[pos] = 1;
      queue[tail++] = pos;
    }
  };

  for (let x = 0; x < width; x++) {
    trySeed(x, 0);
    trySeed(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    trySeed(0, y);
    trySeed(width - 1, y);
  }

  while (head < tail) {
    const pos = queue[head++];
    const dist = minDist[pos];
    if (dist <= hardThreshold) {
      bgState[pos] = 1;
    } else {
      bgState[pos] = 2;
      continue; // stop expanding deep into foreground through soft edges
    }

    const x = pos % width;
    const y = (pos - x) / width;
    const pL = labL[pos];
    const pA = labA[pos];
    const pB = labB[pos];

    const neighbors = [
      x > 0 ? pos - 1 : -1,
      x + 1 < width ? pos + 1 : -1,
      y > 0 ? pos - width : -1,
      y + 1 < height ? pos + width : -1,
    ];

    for (let n = 0; n < 4; n++) {
      const next = neighbors[n];
      if (next < 0 || visited[next]) continue;
      const nextDist = minDist[next];
      if (nextDist > softThreshold) continue;

      // Edge-aware local gradient check prevents leaking across skin/collar seams
      const dl = labL[next] - pL;
      const da = labA[next] - pA;
      const db = labB[next] - pB;
      const localJump = Math.sqrt(dl * dl + da * da + db * db);

      if (localJump <= maxLocalJump || nextDist <= hardThreshold * 0.6) {
        visited[next] = 1;
        queue[tail++] = next;
      }
    }
  }

  // Exact O(N) Chebyshev morphological opening on definite background to sever narrow interior leaks
  // (e.g. a narrow gray collar shadow touching the backdrop) while preserving exact exterior contours.
  const pinchRadius = Math.min(12, Math.floor(Math.min(width, height) / 75));
  if (pinchRadius >= 2) {
    const INF = 65535;
    const distFg = new Uint16Array(total);
    for (let i = 0; i < total; i++) {
      distFg[i] = bgState[i] === 1 ? INF : 0;
    }

    // Forward pass (Chebyshev distance to nearest foreground pixel; outer frame edges do NOT count as fg)
    for (let y = 0; y < height; y++) {
      const row = y * width;
      for (let x = 0; x < width; x++) {
        const p = row + x;
        let d = distFg[p];
        if (d === 0) continue;
        if (x > 0 && distFg[p - 1] + 1 < d) d = distFg[p - 1] + 1;
        if (y > 0) {
          const up = p - width;
          if (distFg[up] + 1 < d) d = distFg[up] + 1;
          if (x > 0 && distFg[up - 1] + 1 < d) d = distFg[up - 1] + 1;
          if (x + 1 < width && distFg[up + 1] + 1 < d) d = distFg[up + 1] + 1;
        }
        distFg[p] = d;
      }
    }
    // Backward pass
    for (let y = height - 1; y >= 0; y--) {
      const row = y * width;
      for (let x = width - 1; x >= 0; x--) {
        const p = row + x;
        let d = distFg[p];
        if (d === 0) continue;
        if (x + 1 < width && distFg[p + 1] + 1 < d) d = distFg[p + 1] + 1;
        if (y + 1 < height) {
          const dn = p + width;
          if (distFg[dn] + 1 < d) d = distFg[dn] + 1;
          if (x > 0 && distFg[dn - 1] + 1 < d) d = distFg[dn - 1] + 1;
          if (x + 1 < width && distFg[dn + 1] + 1 < d) d = distFg[dn + 1] + 1;
        }
        distFg[p] = d;
      }
    }

    // Keep only eroded core background pixels connected to the image perimeter
    const coreVisited = new Uint8Array(total);
    let cHead = 0;
    let cTail = 0;
    const tryCoreSeed = (x: number, y: number) => {
      const p = y * width + x;
      if (!coreVisited[p] && distFg[p] > pinchRadius) {
        coreVisited[p] = 1;
        queue[cTail++] = p;
      }
    };
    for (let x = 0; x < width; x++) {
      tryCoreSeed(x, 0);
      tryCoreSeed(x, height - 1);
    }
    for (let y = 0; y < height; y++) {
      tryCoreSeed(0, y);
      tryCoreSeed(width - 1, y);
    }
    while (cHead < cTail) {
      const p = queue[cHead++];
      const x = p % width;
      const y = (p - x) / width;
      if (x > 0 && !coreVisited[p - 1] && distFg[p - 1] > pinchRadius) {
        coreVisited[p - 1] = 1;
        queue[cTail++] = p - 1;
      }
      if (x + 1 < width && !coreVisited[p + 1] && distFg[p + 1] > pinchRadius) {
        coreVisited[p + 1] = 1;
        queue[cTail++] = p + 1;
      }
      if (y > 0 && !coreVisited[p - width] && distFg[p - width] > pinchRadius) {
        coreVisited[p - width] = 1;
        queue[cTail++] = p - width;
      }
      if (y + 1 < height && !coreVisited[p + width] && distFg[p + width] > pinchRadius) {
        coreVisited[p + width] = 1;
        queue[cTail++] = p + width;
      }
    }

    // Bounded Chebyshev dilation of coreBg back into bgState===1 by exactly pinchRadius steps
    const dilDepth = new Int16Array(total).fill(-1);
    let dHead = 0;
    let dTail = 0;
    for (let i = 0; i < total; i++) {
      if (coreVisited[i]) {
        dilDepth[i] = 0;
        queue[dTail++] = i;
      }
    }
    if (dTail > 0) {
      while (dHead < dTail) {
        const p = queue[dHead++];
        const depth = dilDepth[p];
        if (depth >= pinchRadius) continue;
        const x = p % width;
        const y = (p - x) / width;
        for (let dy = -1; dy <= 1; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= height) continue;
          const nRow = ny * width;
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            if (nx < 0 || nx >= width) continue;
            const np = nRow + nx;
            if (dilDepth[np] === -1 && bgState[np] === 1) {
              dilDepth[np] = depth + 1;
              queue[dTail++] = np;
            }
          }
        }
      }

      // Drop unreached narrow-pinch interior bg pixels back to foreground
      for (let i = 0; i < total; i++) {
        if (bgState[i] === 1 && dilDepth[i] === -1) {
          bgState[i] = 0;
        }
      }
      // Drop orphaned soft-edge pixels no longer adjacent to any true exterior bg pixel
      for (let y = 1; y < height - 1; y++) {
        const row = y * width;
        for (let x = 1; x < width - 1; x++) {
          const p = row + x;
          if (bgState[p] === 2) {
            if (
              bgState[p - 1] !== 1 &&
              bgState[p + 1] !== 1 &&
              bgState[p - width] !== 1 &&
              bgState[p + width] !== 1
            ) {
              bgState[p] = 0;
            }
          }
        }
      }
    }
  }

  // Compute clean alpha channel + gentle edge smoothing
  const alpha = new Float32Array(total);
  for (let i = 0; i < total; i++) {
    if (bgState[i] === 1) {
      alpha[i] = 0;
    } else if (bgState[i] === 2) {
      const ratio = Math.max(0, Math.min(1, (minDist[i] - hardThreshold) / (softThreshold - hardThreshold)));
      // Smoothstep curve for natural anti-aliased edge
      alpha[i] = ratio * ratio * (3 - 2 * ratio);
    } else {
      alpha[i] = 1;
    }
  }

  // 1-pass 3x3 edge-only alpha feather to remove stair-stepping artifacts
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const p = y * width + x;
      const a = alpha[p];
      if (a > 0 && a < 1) {
        const avg =
          (alpha[p - width - 1] +
            alpha[p - width] * 2 +
            alpha[p - width + 1] +
            alpha[p - 1] * 2 +
            a * 4 +
            alpha[p + 1] * 2 +
            alpha[p + width - 1] +
            alpha[p + width] * 2 +
            alpha[p + width + 1]) /
          16;
        out[p * 4 + 3] = Math.round(avg * 255);
      } else {
        out[p * 4 + 3] = Math.round(a * 255);
      }
    }
  }

  // Border rows/cols
  for (let x = 0; x < width; x++) {
    out[x * 4 + 3] = Math.round(alpha[x] * 255);
    const bot = (height - 1) * width + x;
    out[bot * 4 + 3] = Math.round(alpha[bot] * 255);
  }
  for (let y = 0; y < height; y++) {
    const left = y * width;
    const right = y * width + (width - 1);
    out[left * 4 + 3] = Math.round(alpha[left] * 255);
    out[right * 4 + 3] = Math.round(alpha[right] * 255);
  }

  return out;
}

/**
 * Clamp and normalize studio compositor settings.
 */
export function clampStudioSettings(input: {
  blurPx: number;
  featherPx: number;
  subjectScale: number;
  verticalOffsetPct: number;
  ambientMatchPct: number;
}) {
  return {
    blurPx: Math.min(24, Math.max(0, Math.round(input.blurPx))),
    featherPx: Math.min(8, Math.max(0, Number(input.featherPx.toFixed(1)))),
    subjectScale: Math.min(1.3, Math.max(0.6, Number(input.subjectScale.toFixed(2)))),
    verticalOffsetPct: Math.min(25, Math.max(-25, Math.round(input.verticalOffsetPct))),
    ambientMatchPct: Math.min(40, Math.max(0, Math.round(input.ambientMatchPct))),
  };
}
