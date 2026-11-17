/**
 * Image enhancement worker.
 *
 * Runs the pixel loops off the main thread so slider drags stay responsive.
 * The source bitmap is bounded to 2880 px on its longest side, matching the
 * Android export limit.
 */

import {
  applyManual,
  applySmart,
  blurRadiusFor,
  blurRgba,
  buildMask,
  NEUTRAL_ADJUSTMENTS,
  type ManualAdjustments,
  type Stroke,
} from './imaging';

const MAX_SOURCE_SIDE = 2880;

type InitRequest = { id: number; type: 'init'; bitmap: ImageBitmap };

type RenderRequest = {
  id: number;
  type: 'render';
  mode: 'manual' | 'smart';
  maxSize: number;
  quality?: number;
  adjustments?: ManualAdjustments;
  strokes?: Stroke[];
  strength?: number;
  wholePhoto?: boolean;
};

type Request = InitRequest | RenderRequest;

const scope = self as unknown as {
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
  onmessage: ((event: MessageEvent) => void) | null;
};

let base: ImageBitmap | null = null;
let baseWidth = 0;
let baseHeight = 0;

const scaledCache = new Map<string, ImageData>();

interface BlurEntry {
  key: string;
  fine: Uint8ClampedArray | null;
  wide: Uint8ClampedArray | null;
}

let blurCache: BlurEntry | null = null;

function remember<K, V>(map: Map<K, V>, key: K, value: V, limit: number): V {
  map.set(key, value);
  if (map.size > limit) {
    const oldest = map.keys().next();
    if (!oldest.done) map.delete(oldest.value);
  }
  return value;
}

function scaledSource(width: number, height: number): ImageData {
  const key = `${width}x${height}`;
  const cached = scaledCache.get(key);
  if (cached) return cached;

  if (!base) throw new Error('No photo is loaded.');
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is unavailable.');

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(base, 0, 0, width, height);

  return remember(scaledCache, key, context.getImageData(0, 0, width, height), 3);
}

/** Wide-radius local contrast: shrink, then scale back up (same idea as Flutter). */
function wideBuffer(width: number, height: number): Uint8ClampedArray {
  if (!base) throw new Error('No photo is loaded.');
  const target = Math.max(1, Math.round(Math.min(width, height) / 12));
  const smallHeight = Math.max(1, Math.round((height / width) * target));

  const small = new OffscreenCanvas(target, smallHeight);
  const smallContext = small.getContext('2d');
  if (!smallContext) throw new Error('Canvas is unavailable.');
  smallContext.imageSmoothingQuality = 'high';
  smallContext.drawImage(base, 0, 0, target, smallHeight);

  const large = new OffscreenCanvas(width, height);
  const largeContext = large.getContext('2d');
  if (!largeContext) throw new Error('Canvas is unavailable.');
  largeContext.imageSmoothingQuality = 'high';
  largeContext.drawImage(small, 0, 0, width, height);

  return largeContext.getImageData(0, 0, width, height).data;
}

function blurBuffers(
  width: number,
  height: number,
  needFine: boolean,
  needWide: boolean,
): BlurEntry {
  const key = `${width}x${height}`;
  if (!blurCache || blurCache.key !== key) {
    blurCache = { key, fine: null, wide: null };
  }
  const entry = blurCache;

  if (needFine && !entry.fine) {
    entry.fine = blurRgba(scaledSource(width, height).data, width, height, blurRadiusFor(width, height));
  }
  if (needWide && !entry.wide) {
    entry.wide = wideBuffer(width, height);
  }

  return entry;
}

async function render(request: RenderRequest) {
  if (!base) throw new Error('No photo is loaded.');

  const longest = Math.max(baseWidth, baseHeight);
  const scale = Math.min(1, request.maxSize / longest);
  const width = Math.max(1, Math.round(baseWidth * scale));
  const height = Math.max(1, Math.round(baseHeight * scale));

  const source = scaledSource(width, height).data;
  let output: Uint8ClampedArray;

  if (request.mode === 'manual') {
    const adjustments = request.adjustments ?? NEUTRAL_ADJUSTMENTS;
    const buffers = blurBuffers(width, height, adjustments.sharpness > 0, adjustments.clarity > 0);
    output = applyManual(source, width, height, adjustments, buffers.fine, buffers.wide);
  } else {
    const buffers = blurBuffers(width, height, true, true);
    const mask = buildMask(width, height, request.strokes ?? [], request.wholePhoto ?? false);
    output = applySmart(
      source,
      width,
      height,
      mask,
      request.strength ?? 0.75,
      buffers.fine!,
      buffers.wide!,
    );
  }

  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is unavailable.');
  context.putImageData(new ImageData(output as Uint8ClampedArray<ArrayBuffer>, width, height), 0, 0);

  const blob = await canvas.convertToBlob({
    type: 'image/jpeg',
    quality: request.quality ?? 0.86,
  });

  return { blob, width, height };
}

async function handleInit(request: InitRequest) {
  const bitmap = request.bitmap;
  const longest = Math.max(bitmap.width, bitmap.height);
  const scale = Math.min(1, MAX_SOURCE_SIDE / longest);

  baseWidth = Math.max(1, Math.round(bitmap.width * scale));
  baseHeight = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = new OffscreenCanvas(baseWidth, baseHeight);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is unavailable.');
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, baseWidth, baseHeight);

  base?.close();
  base = canvas.transferToImageBitmap();
  bitmap.close();

  scaledCache.clear();
  blurCache = null;

  return { width: baseWidth, height: baseHeight };
}

scope.onmessage = (event: MessageEvent) => {
  const request = event.data as Request;

  void (async () => {
    try {
      if (request.type === 'init') {
        const result = await handleInit(request);
        scope.postMessage({ id: request.id, ok: true, ...result });
      } else {
        const result = await render(request);
        scope.postMessage({ id: request.id, ok: true, ...result });
      }
    } catch (error) {
      scope.postMessage({
        id: request.id,
        ok: false,
        error: error instanceof Error ? error.message : 'Render failed',
      });
    }
  })();
};
