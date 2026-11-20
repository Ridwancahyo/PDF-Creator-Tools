import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampStudioSettings,
  labDistance,
  rgbToLab,
  sampleBorderLabColors,
  segmentForegroundMaskRgba,
} from './bgMath';

test('rgbToLab and labDistance measure perceptual color separation accurately', () => {
  const white = rgbToLab(255, 255, 255);
  const black = rgbToLab(0, 0, 0);
  const nearWhite = rgbToLab(248, 250, 252);

  assert.ok(labDistance(white, nearWhite) < 5);
  assert.ok(labDistance(white, black) > 95);
});

test('segmentForegroundMaskRgba removes uniform studio border while preserving subject interior', () => {
  const width = 20;
  const height = 20;
  const rgba = new Uint8ClampedArray(width * height * 4);

  // Fill entire image with light gray studio backdrop (#dce0e6)
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = 220;
    rgba[i * 4 + 1] = 224;
    rgba[i * 4 + 2] = 230;
    rgba[i * 4 + 3] = 255;
  }

  // Paint centered dark navy subject (x: 6..13, y: 6..13) with a white shirt pocket inside (9..10, 9..10)
  for (let y = 6; y <= 13; y++) {
    for (let x = 6; x <= 13; x++) {
      const idx = (y * width + x) * 4;
      const isWhiteShirt = x >= 9 && x <= 10 && y >= 9 && y <= 10;
      rgba[idx] = isWhiteShirt ? 225 : 24;
      rgba[idx + 1] = isWhiteShirt ? 228 : 42;
      rgba[idx + 2] = isWhiteShirt ? 232 : 88;
      rgba[idx + 3] = 255;
    }
  }

  const palette = sampleBorderLabColors(rgba, width, height, 2);
  assert.ok(palette.length >= 1);

  const result = segmentForegroundMaskRgba(rgba, width, height, 20);

  // Corner background pixel must become fully transparent
  assert.equal(result[3], 0);
  // Dark blazer pixel must stay fully opaque
  const blazerIdx = (7 * width + 7) * 4;
  assert.equal(result[blazerIdx + 3], 255);
  // Interior light shirt pixel enclosed by blazer must ALSO remain opaque (not punched out!)
  const shirtIdx = (9 * width + 9) * 4;
  assert.equal(result[shirtIdx + 3], 255);
});

test('segmentForegroundMaskRgba preserves dark portrait torso touching bottom border', () => {
  const width = 30;
  const height = 40;
  const rgba = new Uint8ClampedArray(width * height * 4);

  // Fill light gray studio backdrop (#e2e5ea)
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = 226;
    rgba[i * 4 + 1] = 229;
    rgba[i * 4 + 2] = 234;
    rgba[i * 4 + 3] = 255;
  }

  // Paint portrait head (y: 8..18, x: 10..19), white dress shirt (y: 19..34, x: 12..17), and wide dark navy blazer touching bottom edge (y: 19..39, x: 2..27)
  for (let y = 8; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const isHead = y <= 18 && x >= 10 && x <= 19;
      const isWhiteShirt = y >= 19 && y <= 34 && x >= 12 && x <= 17;
      const isBlazer = y >= 19 && x >= 2 && x <= 27 && !isWhiteShirt;
      if (!isHead && !isBlazer && !isWhiteShirt) continue;
      const idx = (y * width + x) * 4;
      if (isHead && y <= 11) {
        // Dark hair
        rgba[idx] = 26;
        rgba[idx + 1] = 24;
        rgba[idx + 2] = 28;
      } else if (isHead) {
        // Warm skin tone (with bright neck highlight at y=18)
        rgba[idx] = y === 18 ? 224 : 205;
        rgba[idx + 1] = y === 18 ? 196 : 158;
        rgba[idx + 2] = y === 18 ? 176 : 128;
      } else if (isWhiteShirt) {
        // Crisp white dress shirt
        rgba[idx] = 246;
        rgba[idx + 1] = 247;
        rgba[idx + 2] = 249;
      } else {
        // Dark navy blazer touching bottom edge
        rgba[idx] = 22;
        rgba[idx + 1] = 34;
        rgba[idx + 2] = 66;
      }
      rgba[idx + 3] = 255;
    }
  }

  const result = segmentForegroundMaskRgba(rgba, width, height, 14);

  // Top-left studio wall must be 100% transparent
  assert.equal(result[3], 0);
  // Dark hair must remain 100% opaque
  assert.equal(result[(9 * width + 14) * 4 + 3], 255);
  // Crisp white dress shirt inside blazer must remain 100% opaque
  assert.equal(result[(24 * width + 15) * 4 + 3], 255);
  // Dark navy blazer right on the bottom border (y = 39) must remain 100% opaque
  assert.equal(result[(39 * width + 15) * 4 + 3], 255);
  assert.equal(result[(30 * width + 6) * 4 + 3], 255);
  // Narrow studio wall sliver at bottom-left corner (x = 0, y = 39) must be transparent
  assert.equal(result[(39 * width + 0) * 4 + 3], 0);
});

test('segmentForegroundMaskRgba blocks narrow collar-pinch leaks into interior shirt folds', () => {
  const width = 180;
  const height = 240;
  const rgba = new Uint8ClampedArray(width * height * 4);

  // Light gray studio backdrop (#c8ccd0)
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = 200;
    rgba[i * 4 + 1] = 204;
    rgba[i * 4 + 2] = 208;
    rgba[i * 4 + 3] = 255;
  }

  // Dark blazer covering x: 35..145, y: 90..239, enclosing a shaded-gray shirt fold (x: 80..100, y: 95..180)
  // AND leaving a narrow 3px gray collar channel at x: 96..98, y: 88..96 touching the outer wall!
  for (let y = 90; y < height; y++) {
    for (let x = 35; x <= 145; x++) {
      const isNarrowChannel = y <= 96 && x >= 96 && x <= 98;
      const isShadedShirtFold = y >= 95 && y <= 180 && x >= 85 && x <= 98;
      const idx = (y * width + x) * 4;
      if (isNarrowChannel || isShadedShirtFold) {
        // Shaded collar fold with nearly identical gray as studio backdrop
        rgba[idx] = 205;
        rgba[idx + 1] = 208;
        rgba[idx + 2] = 212;
      } else {
        // Dark navy blazer
        rgba[idx] = 22;
        rgba[idx + 1] = 36;
        rgba[idx + 2] = 68;
      }
      rgba[idx + 3] = 255;
    }
  }

  const result = segmentForegroundMaskRgba(rgba, width, height, 18);

  // Outer studio wall must be 100% transparent
  assert.equal(result[(20 * width + 20) * 4 + 3], 0);
  assert.equal(result[(220 * width + 165) * 4 + 3], 0);
  // Shaded shirt fold deep inside blazer must remain 100% opaque despite narrow collar gap!
  assert.equal(result[(140 * width + 92) * 4 + 3], 255);
});

test('clampStudioSettings enforces valid studio compositing bounds', () => {
  const clamped = clampStudioSettings({
    blurPx: 99,
    featherPx: -3,
    subjectScale: 2.5,
    verticalOffsetPct: -50,
    ambientMatchPct: 80,
  });
  assert.deepEqual(clamped, {
    blurPx: 24,
    featherPx: 0,
    subjectScale: 1.3,
    verticalOffsetPct: -25,
    ambientMatchPct: 40,
  });
});
