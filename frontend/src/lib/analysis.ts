import {
  BLUR_THRESHOLD,
  blurScoreFromImageData,
  dhashFromImageData,
} from './imaging';

export interface Analysis {
  thumb: string;
  width: number;
  height: number;
  blurScore: number;
  isBlurry: boolean;
  dhash: string;
}

/** Decoded size used for analysis. Bounded so a 50 MP camera file stays cheap. */
const ANALYSIS_WIDTH = 1200;
const THUMB_SIDE = 400;
/** The Android app always resizes to 300 px wide before scoring. */
const BLUR_WIDTH = 300;
const HASH_WIDTH = 17;
const HASH_HEIGHT = 16;

function context2d(canvas: OffscreenCanvas): OffscreenCanvasRenderingContext2D {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas is unavailable.');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  return context;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...(bytes.subarray(i, i + chunk) as unknown as number[]));
  }
  return `data:${blob.type || 'image/jpeg'};base64,${btoa(binary)}`;
}

export function guessMime(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'bmp':
      return 'image/bmp';
    case 'avif':
      return 'image/avif';
    default:
      return 'image/jpeg';
  }
}

/**
 * Produces the thumbnail, blur score and perceptual hash for one photo.
 * Mirrors what the Android scan computes from a decoded thumbnail.
 */
export async function analyzeImage(blob: Blob): Promise<Analysis> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob, {
      resizeWidth: ANALYSIS_WIDTH,
      resizeQuality: 'high',
      imageOrientation: 'from-image',
    });
  } catch {
    throw new Error('This file could not be decoded (unsupported format).');
  }

  try {
    const width = bitmap.width;
    const height = bitmap.height;

    // Thumbnail: longest side 400, encoded as JPEG for the library grid.
    const thumbScale = Math.min(1, THUMB_SIDE / Math.max(width, height));
    const thumbWidth = Math.max(1, Math.round(width * thumbScale));
    const thumbHeight = Math.max(1, Math.round(height * thumbScale));
    const thumbCanvas = new OffscreenCanvas(thumbWidth, thumbHeight);
    const thumbContext = context2d(thumbCanvas);
    thumbContext.fillStyle = '#000';
    thumbContext.fillRect(0, 0, thumbWidth, thumbHeight);
    thumbContext.drawImage(bitmap, 0, 0, thumbWidth, thumbHeight);
    const thumbBlob = await thumbCanvas.convertToBlob({ type: 'image/jpeg', quality: 0.82 });

    // Blur score at 300 px wide, exactly like BlurDetector.computeBlurScore.
    const blurWidth = BLUR_WIDTH;
    const blurHeight = Math.max(1, Math.round((height / width) * BLUR_WIDTH));
    const blurCanvas = new OffscreenCanvas(blurWidth, blurHeight);
    const blurContext = context2d(blurCanvas);
    blurContext.drawImage(bitmap, 0, 0, blurWidth, blurHeight);
    const blurScore = blurScoreFromImageData(blurContext.getImageData(0, 0, blurWidth, blurHeight));

    // 17x16 dHash, one bit per horizontal neighbour pair.
    const hashCanvas = new OffscreenCanvas(HASH_WIDTH, HASH_HEIGHT);
    const hashContext = context2d(hashCanvas);
    hashContext.drawImage(bitmap, 0, 0, HASH_WIDTH, HASH_HEIGHT);
    const dhash = dhashFromImageData(hashContext.getImageData(0, 0, HASH_WIDTH, HASH_HEIGHT));

    return {
      thumb: await blobToDataUrl(thumbBlob),
      width,
      height,
      blurScore,
      isBlurry: blurScore < BLUR_THRESHOLD,
      dhash,
    };
  } finally {
    bitmap.close();
  }
}
