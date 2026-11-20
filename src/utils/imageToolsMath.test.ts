import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyUnsharpMaskRgba,
  computeResizedDimensions,
  computeUpscaleDimensions,
  isHeicFile,
  resolveImageFormatMeta,
} from './imageToolsMath';

test('resolveImageFormatMeta maps jpg, jpeg, and png accurately', () => {
  const jpg = resolveImageFormatMeta('jpg');
  assert.equal(jpg.mimeType, 'image/jpeg');
  assert.equal(jpg.extension, 'jpg');
  assert.equal(jpg.supportsAlpha, false);

  const jpeg = resolveImageFormatMeta('jpeg');
  assert.equal(jpeg.mimeType, 'image/jpeg');
  assert.equal(jpeg.extension, 'jpeg');

  const png = resolveImageFormatMeta('png');
  assert.equal(png.mimeType, 'image/png');
  assert.equal(png.extension, 'png');
  assert.equal(png.supportsAlpha, true);
});

test('isHeicFile detects .heic, .heif extensions and MIME types', () => {
  assert.equal(isHeicFile({ name: 'IMG_1024.HEIC', type: '' }), true);
  assert.equal(isHeicFile({ name: 'photo.heif', type: 'image/heif' }), true);
  assert.equal(isHeicFile({ name: 'photo.jpg', type: 'image/jpeg' }), false);
  assert.equal(isHeicFile({ name: 'scan.png', type: 'image/png' }), false);
});

test('computeResizedDimensions preserves aspect ratio when locked', () => {
  const byWidth = computeResizedDimensions({
    origW: 1600,
    origH: 800,
    mode: 'pixels',
    width: 800,
    height: 800,
    lockAspect: true,
    changedAxis: 'width',
  });
  assert.deepEqual(byWidth, { width: 800, height: 400 });

  const byHeight = computeResizedDimensions({
    origW: 1600,
    origH: 800,
    mode: 'pixels',
    width: 1600,
    height: 250,
    lockAspect: true,
    changedAxis: 'height',
  });
  assert.deepEqual(byHeight, { width: 500, height: 250 });
});

test('computeResizedDimensions handles percentage and preset modes', () => {
  const pct = computeResizedDimensions({
    origW: 1000,
    origH: 500,
    mode: 'percent',
    percent: 50,
  });
  assert.deepEqual(pct, { width: 500, height: 250 });

  const preset = computeResizedDimensions({
    origW: 1000,
    origH: 500,
    mode: 'preset',
    presetId: 'pasfoto-3x4',
  });
  assert.deepEqual(preset, { width: 354, height: 472 });
});

test('computeUpscaleDimensions multiplies cleanly and clamps huge inputs safely', () => {
  const normal = computeUpscaleDimensions(800, 600, 3);
  assert.equal(normal.width, 2400);
  assert.equal(normal.height, 1800);
  assert.equal(normal.clamped, false);

  const clamped = computeUpscaleDimensions(3000, 2000, 4, 6144);
  assert.equal(clamped.width, 6144);
  assert.equal(clamped.height, 4096);
  assert.equal(clamped.clamped, true);
});

test('applyUnsharpMaskRgba sharpens high-contrast edges while preserving flat areas and alpha', () => {
  // 5x5 image with a bright vertical stripe in the middle
  const width = 5;
  const height = 5;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const val = x === 2 ? 200 : 80;
      rgba[idx] = val;
      rgba[idx + 1] = val;
      rgba[idx + 2] = val;
      rgba[idx + 3] = 255;
    }
  }

  const out = applyUnsharpMaskRgba(rgba, width, height, 0.8, 3);
  const centerIdx = (2 * width + 2) * 4;
  // Center bright pixel should become even crisper (> 200)
  assert.ok(out[centerIdx] > 200, `Expected sharpened center > 200, got ${out[centerIdx]}`);
  // Alpha channel must remain untouched
  assert.equal(out[centerIdx + 3], 255);
});
