import { describe, expect, it } from 'vitest';

import {
  applyManual,
  applySmart,
  blurRadiusFor,
  blurRgba,
  buildMask,
  clamp,
  dhashFromGray,
  grayscale,
  hammingDistance,
  laplacianVariance,
  NEUTRAL_ADJUSTMENTS,
  type ManualAdjustments,
  type Stroke,
} from './imaging';

function adjustments(overrides: Partial<ManualAdjustments> = {}): ManualAdjustments {
  return { ...NEUTRAL_ADJUSTMENTS, ...overrides };
}

function solid(width: number, height: number, r: number, g: number, b: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  }
  return data;
}

describe('sharpness', () => {
  it('scores a flat image at zero', () => {
    const gray = new Float32Array(16).fill(128);
    expect(laplacianVariance(gray, 4, 4)).toBe(0);
  });

  it('scores a high-contrast checkerboard far above the blur threshold', () => {
    const gray = new Float32Array(16);
    for (let index = 0; index < gray.length; index++) {
      const x = index % 4;
      const y = Math.floor(index / 4);
      gray[index] = (x + y) % 2 === 0 ? 0 : 255;
    }
    expect(laplacianVariance(gray, 4, 4)).toBeGreaterThan(100_000);
  });

  it('converts RGBA using Rec.601 luma', () => {
    const gray = grayscale(new Uint8ClampedArray([255, 0, 0, 255]));
    expect(gray[0]).toBeCloseTo(76.245, 2);
  });
});

describe('difference hash', () => {
  it('produces one bit per horizontal neighbour pair', () => {
    const width = 17;
    const height = 16;
    const gray = new Float32Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) gray[y * width + x] = 255 - x * 10;
    }

    const hash = dhashFromGray(gray);
    expect(hash).toHaveLength(256);
    expect(hash).toBe('1'.repeat(256));
  });

  it('counts hamming distance', () => {
    expect(hammingDistance('1010', '1000')).toBe(1);
    expect(hammingDistance('0000', '0000')).toBe(0);
    expect(hammingDistance('00', '000')).toBe(5);
  });
});

describe('mask', () => {
  const stroke: Stroke = { x: 0.5, y: 0.5, radius: 0.1, erase: false };

  it('fills the whole photo when asked', () => {
    const mask = buildMask(20, 20, [], true);
    expect(mask.every((value) => value === 255)).toBe(true);
  });

  it('paints a soft circle at the stroke position', () => {
    const mask = buildMask(100, 100, [stroke], false);
    expect(mask[50 * 100 + 50]).toBe(255);
    expect(mask[0]).toBe(0);
  });

  it('erases coverage back out', () => {
    const painted = buildMask(100, 100, [stroke], false);
    const erased = buildMask(
      100,
      100,
      [stroke, { x: 0.5, y: 0.5, radius: 0.1, erase: true }],
      false,
    );
    expect(painted[50 * 100 + 50]).toBe(255);
    expect(erased[50 * 100 + 50]).toBe(0);
  });
});

describe('manual pipeline', () => {
  it('returns an exact copy for neutral controls', () => {
    const source = solid(4, 4, 12, 34, 56);
    const output = applyManual(source, 4, 4, NEUTRAL_ADJUSTMENTS, null, null);
    expect(Array.from(output)).toEqual(Array.from(source));
  });

  it('brightens with positive lighting and keeps alpha', () => {
    const source = solid(4, 4, 10, 10, 10);
    const output = applyManual(source, 4, 4, adjustments({ lighting: 100 }), null, null);
    expect(output[0]).toBeGreaterThan(10);
    expect(output[3]).toBe(255);
  });

  it('darkens with negative lighting', () => {
    const source = solid(4, 4, 200, 200, 200);
    const output = applyManual(source, 4, 4, adjustments({ lighting: -100 }), null, null);
    expect(output[0]).toBeLessThan(200);
  });

  it('raises saturation around the pixel luma', () => {
    const source = solid(2, 2, 200, 100, 100);
    const output = applyManual(source, 2, 2, adjustments({ saturation: 100 }), null, null);
    expect(output[0]).toBeGreaterThanOrEqual(200);
    expect(output[1]).toBeLessThan(100);
  });

  it('clamps hue to the wrap-around range', () => {
    const source = solid(2, 2, 120, 60, 30);
    const output = applyManual(source, 2, 2, adjustments({ hue: 180 }), null, null);
    expect(output[0]).toBeLessThanOrEqual(255);
    expect(output[0]).not.toBe(120);
  });
});

describe('smart pipeline', () => {
  const fine = solid(4, 4, 60, 60, 60);
  const wide = solid(4, 4, 70, 70, 70);

  it('leaves the image untouched where the mask is empty', () => {
    const source = solid(4, 4, 120, 90, 60);
    const mask = new Uint8Array(16);
    const output = applySmart(source, 4, 4, mask, 1, fine, wide);
    expect(Array.from(output)).toEqual(Array.from(source));
  });

  it('does nothing at zero strength', () => {
    const source = solid(4, 4, 120, 90, 60);
    const mask = new Uint8Array(16).fill(255);
    const output = applySmart(source, 4, 4, mask, 0, fine, wide);
    expect(Array.from(output)).toEqual(Array.from(source));
  });

  it('adds contrast and keeps alpha inside the mask', () => {
    const source = solid(4, 4, 100, 100, 100);
    const mask = new Uint8Array(16).fill(255);
    const output = applySmart(source, 4, 4, mask, 1, fine, wide);
    expect(output[0]).not.toBe(100);
    expect(output[3]).toBe(255);
  });

  it('recovers edges when the blurred copy is darker than the source', () => {
    const source = solid(4, 4, 150, 150, 150);
    const mask = new Uint8Array(16).fill(255);
    const output = applySmart(source, 4, 4, mask, 1, fine, wide);
    expect(output[0]).toBeGreaterThan(150);
  });
});

describe('blur', () => {
  it('spreads an impulse and preserves dimensions', () => {
    const width = 9;
    const height = 9;
    const source = solid(width, height, 0, 0, 0);
    const center = (4 * width + 4) * 4;
    source[center] = 255;
    source[center + 1] = 255;
    source[center + 2] = 255;

    const blurred = blurRgba(source, width, height, 1);
    expect(blurred).toHaveLength(source.length);
    expect(blurred[center]).toBeLessThan(255);
    expect(blurred[center - 4]).toBeGreaterThan(0);
    expect(blurred[3]).toBe(255);
  });

  it('scales the radius with the working copy like the app', () => {
    expect(blurRadiusFor(800, 600)).toBe(1);
    expect(blurRadiusFor(2880, 1920)).toBe(4);
  });

  it('clamps helper values', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-3, 0, 1)).toBe(0);
  });
});
