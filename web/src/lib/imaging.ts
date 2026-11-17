/**
 * Pixel math ported from the Android app so the web version scores, groups and
 * enhances photos the same way.
 *
 * Sources of truth:
 *   reference/flutter/lib/services/blur_detector.dart
 *   reference/flutter/lib/services/duplicate_detector.dart
 *   reference/flutter/lib/services/enhance_service.dart
 *
 * Everything here is pure: no canvas, no DOM, no globals. That keeps it testable
 * in Node and reusable inside the enhancement worker.
 */

export const BLUR_THRESHOLD = 100;
export const HASH_SIZE = 16;
export const HASH_LENGTH = HASH_SIZE * HASH_SIZE;
export const SIMILARITY_THRESHOLD = 24;

export interface ManualAdjustments {
  lighting: number;
  sharpness: number;
  contrast: number;
  clarity: number;
  saturation: number;
  hue: number;
  highlights: number;
  temperature: number;
}

export const NEUTRAL_ADJUSTMENTS: ManualAdjustments = {
  lighting: 0,
  sharpness: 0,
  contrast: 0,
  clarity: 0,
  saturation: 0,
  hue: 0,
  highlights: 0,
  temperature: 0,
};

export interface Stroke {
  /** 0..1 across the image width. */
  x: number;
  /** 0..1 across the image height. */
  y: number;
  /** Fraction of the shorter image side. */
  radius: number;
  erase: boolean;
}

export function isNeutral(adjustments: ManualAdjustments): boolean {
  return (
    adjustments.lighting === 0 &&
    adjustments.sharpness === 0 &&
    adjustments.contrast === 0 &&
    adjustments.clarity === 0 &&
    adjustments.saturation === 0 &&
    adjustments.hue === 0 &&
    adjustments.highlights === 0 &&
    adjustments.temperature === 0
  );
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function clamp255(value: number): number {
  return value <= 0 ? 0 : value >= 255 ? 255 : Math.round(value);
}

function luma(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

// ------------------------------------------------------------- analysis

/** Rec.601 luma of every pixel, matching `img.grayscale` + the app's average. */
export function grayscale(rgba: Uint8ClampedArray): Float32Array {
  const out = new Float32Array(rgba.length / 4);
  for (let i = 0, p = 0; i < rgba.length; i += 4, p++) {
    out[p] = luma(rgba[i], rgba[i + 1], rgba[i + 2]);
  }
  return out;
}

/**
 * Laplacian-variance focus measure. Identical kernel to the Flutter version:
 * [[0,1,0],[1,-4,1],[0,1,0]] with variance across the interior pixels.
 */
export function laplacianVariance(gray: Float32Array, width: number, height: number): number {
  let sum = 0;
  let sumSq = 0;
  let count = 0;

  for (let y = 1; y < height - 1; y++) {
    const row = y * width;
    for (let x = 1; x < width - 1; x++) {
      const index = row + x;
      const value =
        gray[index - width] + gray[index + width] + gray[index - 1] + gray[index + 1] - 4 * gray[index];
      sum += value;
      sumSq += value * value;
      count++;
    }
  }

  if (count === 0) return 0;
  const mean = sum / count;
  return Math.max(0, sumSq / count - mean * mean);
}

/** Score for an image already drawn at ~300 px wide, as the Android app does. */
export function blurScoreFromImageData(image: ImageData): number {
  return laplacianVariance(grayscale(image.data), image.width, image.height);
}

/**
 * 256-bit difference hash from a 17x16 grayscale buffer. One bit per horizontal
 * neighbour pair, exactly like `DuplicateDetector.computeHashFromImage`.
 */
export function dhashFromGray(gray: Float32Array, width = HASH_SIZE + 1, height = HASH_SIZE): string {
  let bits = '';
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width - 1; x++) {
      const index = y * width + x;
      bits += gray[index] > gray[index + 1] ? '1' : '0';
    }
  }
  return bits;
}

export function dhashFromImageData(image: ImageData): string {
  return dhashFromGray(grayscale(image.data), image.width, image.height);
}

export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) return a.length + b.length;
  let distance = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) distance++;
  }
  return distance;
}

// ----------------------------------------------------------------- blur

function boxHorizontal(
  src: Uint8ClampedArray,
  dst: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
): void {
  const divisor = radius * 2 + 1;

  for (let y = 0; y < height; y++) {
    const row = y * width * 4;
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;

    for (let k = -radius; k <= radius; k++) {
      const x = k < 0 ? 0 : k >= width ? width - 1 : k;
      const i = row + x * 4;
      r += src[i];
      g += src[i + 1];
      b += src[i + 2];
      a += src[i + 3];
    }

    for (let x = 0; x < width; x++) {
      const o = row + x * 4;
      dst[o] = r / divisor;
      dst[o + 1] = g / divisor;
      dst[o + 2] = b / divisor;
      dst[o + 3] = a / divisor;

      const addX = x + radius + 1 < width ? x + radius + 1 : width - 1;
      const subX = x - radius > 0 ? x - radius : 0;
      const ai = row + addX * 4;
      const si = row + subX * 4;
      r += src[ai] - src[si];
      g += src[ai + 1] - src[si + 1];
      b += src[ai + 2] - src[si + 2];
      a += src[ai + 3] - src[si + 3];
    }
  }
}

function boxVertical(
  src: Uint8ClampedArray,
  dst: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
): void {
  const divisor = radius * 2 + 1;
  const stride = width * 4;

  for (let x = 0; x < width; x++) {
    const column = x * 4;
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;

    for (let k = -radius; k <= radius; k++) {
      const y = k < 0 ? 0 : k >= height ? height - 1 : k;
      const i = column + y * stride;
      r += src[i];
      g += src[i + 1];
      b += src[i + 2];
      a += src[i + 3];
    }

    for (let y = 0; y < height; y++) {
      const o = column + y * stride;
      dst[o] = r / divisor;
      dst[o + 1] = g / divisor;
      dst[o + 2] = b / divisor;
      dst[o + 3] = a / divisor;

      const addY = y + radius + 1 < height ? y + radius + 1 : height - 1;
      const subY = y - radius > 0 ? y - radius : 0;
      const ai = column + addY * stride;
      const si = column + subY * stride;
      r += src[ai] - src[si];
      g += src[ai + 1] - src[si + 1];
      b += src[ai + 2] - src[si + 2];
      a += src[ai + 3] - src[si + 3];
    }
  }
}

/**
 * Approximates a gaussian blur with three box passes. The Flutter version uses
 * `img.gaussianBlur`; the visual result and the sharpening that follows are
 * close enough that the strengths were kept identical.
 */
export function blurRgba(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
  passes = 3,
): Uint8ClampedArray {
  const r = Math.max(1, Math.round(radius));
  let a = new Uint8ClampedArray(source);
  let b = new Uint8ClampedArray(source.length);

  for (let pass = 0; pass < passes; pass++) {
    boxHorizontal(a, b, width, height, r);
    boxVertical(b, a, width, height, r);
  }

  return a;
}

export function blurRadiusFor(width: number, height: number): number {
  return Math.max(1, Math.round(Math.max(width, height) / 800));
}

// ----------------------------------------------------------------- mask

export function buildMask(
  width: number,
  height: number,
  strokes: Stroke[],
  wholePhoto: boolean,
): Uint8Array {
  const mask = new Uint8Array(width * height);
  if (wholePhoto) {
    mask.fill(255);
    return mask;
  }

  const shortest = Math.min(width, height);

  for (const stroke of strokes) {
    const cx = stroke.x * width;
    const cy = stroke.y * height;
    const radius = Math.max(1, stroke.radius * shortest);
    const x0 = Math.max(0, Math.floor(cx - radius));
    const x1 = Math.min(width - 1, Math.ceil(cx + radius));
    const y0 = Math.max(0, Math.floor(cy - radius));
    const y1 = Math.min(height - 1, Math.ceil(cy + radius));

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const distance = Math.sqrt(dx * dx + dy * dy);
        let coverage = 1 - distance / radius;
        if (coverage <= 0) continue;
        coverage = Math.min(1, coverage);

        const index = y * width + x;
        if (stroke.erase) {
          mask[index] = Math.round(mask[index] * (1 - coverage));
        } else {
          const value = Math.round(coverage * 255);
          if (value > mask[index]) mask[index] = value;
        }
      }
    }
  }

  return mask;
}

// ------------------------------------------------------------- manual

/**
 * Manual tonal controls, in the same order as the Flutter pipeline:
 * lighting -> highlights -> temperature -> contrast -> hue -> saturation ->
 * sharpness/clarity detail.
 */
export function applyManual(
  source: Uint8ClampedArray,
  _width: number,
  _height: number,
  adjustments: ManualAdjustments,
  fine: Uint8ClampedArray | null,
  wide: Uint8ClampedArray | null,
): Uint8ClampedArray {
  const output = new Uint8ClampedArray(source.length);
  if (isNeutral(adjustments)) {
    output.set(source);
    return output;
  }

  const lighting = clamp(adjustments.lighting, -100, 100);
  const sharpness = clamp(adjustments.sharpness, 0, 100) / 100;
  const contrast = clamp(adjustments.contrast, -100, 100) / 100;
  const clarity = clamp(adjustments.clarity, 0, 100) / 100;
  const saturation = clamp(adjustments.saturation, -100, 100) / 100;
  const hue = clamp(adjustments.hue, -180, 180);
  const highlights = clamp(adjustments.highlights, -100, 100) / 100;
  const temperature = clamp(adjustments.temperature, -100, 100) / 100;

  let lut: Uint8ClampedArray | null = null;
  if (lighting !== 0) {
    const gamma = 2 ** (-(lighting / 100) * 0.6);
    lut = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; i++) {
      lut[i] = clamp255(255 * (i / 255) ** gamma);
    }
  }

  let hueMatrix: number[] | null = null;
  if (hue !== 0) {
    const radians = (hue * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    hueMatrix = [
      0.213 + cos * 0.787 - sin * 0.213,
      0.715 - cos * 0.715 - sin * 0.715,
      0.072 - cos * 0.072 + sin * 0.928,
      0.213 - cos * 0.213 + sin * 0.143,
      0.715 + cos * 0.285 + sin * 0.14,
      0.072 - cos * 0.072 - sin * 0.283,
      0.213 - cos * 0.213 - sin * 0.787,
      0.715 - cos * 0.715 + sin * 0.715,
      0.072 + cos * 0.928 + sin * 0.072,
    ];
  }

  const contrastFactor = 1 + contrast * 0.6;
  const saturationFactor = 1 + saturation;
  const highlightAmount = highlights * 0.5;
  const temperatureShift = temperature * 28;
  const sharpnessAmount = sharpness * 1.5;
  const clarityAmount = clarity * 1.2;

  for (let i = 0; i < source.length; i += 4) {
    let r = source[i];
    let g = source[i + 1];
    let b = source[i + 2];
    const sourceLuma = luma(r, g, b);

    if (lut) {
      r = lut[clamp255(r)];
      g = lut[clamp255(g)];
      b = lut[clamp255(b)];
    }

    if (highlightAmount !== 0) {
      const luminance = luma(r, g, b);
      const t = clamp((luminance - 140) / 115, 0, 1);
      const weight = t * t * (3 - 2 * t);
      const factor = 1 + highlightAmount * weight;
      r *= factor;
      g *= factor;
      b *= factor;
    }

    if (temperatureShift !== 0) {
      r += temperatureShift;
      b -= temperatureShift;
    }

    if (contrastFactor !== 1) {
      r = (r - 127.5) * contrastFactor + 127.5;
      g = (g - 127.5) * contrastFactor + 127.5;
      b = (b - 127.5) * contrastFactor + 127.5;
    }

    if (hueMatrix) {
      const hr = hueMatrix[0] * r + hueMatrix[1] * g + hueMatrix[2] * b;
      const hg = hueMatrix[3] * r + hueMatrix[4] * g + hueMatrix[5] * b;
      const hb = hueMatrix[6] * r + hueMatrix[7] * g + hueMatrix[8] * b;
      r = hr;
      g = hg;
      b = hb;
    }

    if (saturationFactor !== 1) {
      const luminance = luma(r, g, b);
      r = luminance + (r - luminance) * saturationFactor;
      g = luminance + (g - luminance) * saturationFactor;
      b = luminance + (b - luminance) * saturationFactor;
    }

    if (fine || wide) {
      let detail = 0;
      if (fine) {
        const fineLuma = luma(fine[i], fine[i + 1], fine[i + 2]);
        detail += clamp(sharpnessAmount * (sourceLuma - fineLuma), -70, 70);
      }
      if (wide) {
        const wideLuma = luma(wide[i], wide[i + 1], wide[i + 2]);
        detail += clamp(clarityAmount * (sourceLuma - wideLuma), -75, 75);
      }
      r += detail;
      g += detail;
      b += detail;
    }

    output[i] = r;
    output[i + 1] = g;
    output[i + 2] = b;
    output[i + 3] = source[i + 3];
  }

  return output;
}

// -------------------------------------------------------------- smart

/**
 * Multi-scale unsharp masking inside a painted mask. Recovered detail only; the
 * filter never invents content.
 */
export function applySmart(
  source: Uint8ClampedArray,
  _width: number,
  _height: number,
  mask: Uint8Array,
  strength: number,
  fine: Uint8ClampedArray,
  wide: Uint8ClampedArray,
): Uint8ClampedArray {
  const output = new Uint8ClampedArray(source.length);
  const amount = clamp(strength, 0, 1) ** 1.3;

  if (amount <= 0) {
    output.set(source);
    return output;
  }

  const saturation = 1 + 0.16 * amount;
  const contrast = 1 + 0.14 * amount;

  for (let i = 0, pixel = 0; i < source.length; i += 4, pixel++) {
    const maskValue = mask[pixel];
    if (maskValue === 0) {
      output[i] = source[i];
      output[i + 1] = source[i + 1];
      output[i + 2] = source[i + 2];
      output[i + 3] = source[i + 3];
      continue;
    }

    const r = source[i];
    const g = source[i + 1];
    const b = source[i + 2];

    const sourceLuma = luma(r, g, b);
    const fineLuma = luma(fine[i], fine[i + 1], fine[i + 2]);
    const wideLuma = luma(wide[i], wide[i + 1], wide[i + 2]);

    const detail = clamp((sourceLuma - fineLuma) * 4.2 + (sourceLuma - wideLuma) * 1.6, -110, 110);

    let enhancedR = r + amount * detail;
    let enhancedG = g + amount * detail;
    let enhancedB = b + amount * detail;

    const luminance = luma(enhancedR, enhancedG, enhancedB);
    enhancedR = luminance + (enhancedR - luminance) * saturation;
    enhancedG = luminance + (enhancedG - luminance) * saturation;
    enhancedB = luminance + (enhancedB - luminance) * saturation;

    enhancedR = (enhancedR - 127.5) * contrast + 127.5;
    enhancedG = (enhancedG - 127.5) * contrast + 127.5;
    enhancedB = (enhancedB - 127.5) * contrast + 127.5;

    const blend = maskValue / 255;
    output[i] = r + (enhancedR - r) * blend;
    output[i + 1] = g + (enhancedG - g) * blend;
    output[i + 2] = b + (enhancedB - b) * blend;
    output[i + 3] = source[i + 3];
  }

  return output;
}
