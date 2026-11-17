import { api, type ScanItem } from './api';
import { analyzeImage, guessMime } from './analysis';
import { collectImages } from './fs';

export interface ScanProgress {
  done: number;
  total: number;
  name: string;
}

export interface ScanSummary {
  scanned: number;
  unsupported: number;
  skipped: number;
  bytes: number;
  durationMs: number;
  aborted: boolean;
}

export interface ScanOptions {
  onProgress?: (progress: ScanProgress) => void;
  signal?: AbortSignal;
  concurrency?: number;
}

const BATCH_SIZE = 8;
const MAX_FILE_BYTES = 80 * 1024 * 1024;
const MIN_FILE_BYTES = 2 * 1024;

function isAbort(error: unknown): boolean {
  return (
    error instanceof DOMException && (error.name === 'AbortError' || error.name === 'NotFoundError')
  );
}

/**
 * Walks the folder, analyzes every image on the main thread, and streams the
 * results to the API in small batches. Only thumbnails are uploaded; originals
 * stay where they are.
 */
export async function scanFolder(
  root: FileSystemDirectoryHandle,
  options: ScanOptions = {},
): Promise<ScanSummary> {
  const startedAt = Date.now();
  const signal = options.signal;
  const onProgress = options.onProgress;
  const concurrency = Math.max(1, options.concurrency ?? 4);

  const entries = await collectImages(root, signal);
  onProgress?.({ done: 0, total: entries.length, name: 'Reading folder' });

  const { scanId } = await api.startScan();

  let cursor = 0;
  let done = 0;
  let scanned = 0;
  let unsupported = 0;
  let skipped = 0;
  let bytes = 0;
  let uploads: Promise<unknown>[] = [];
  let buffer: ScanItem[] = [];

  const flush = () => {
    if (buffer.length === 0) return;
    const items = buffer;
    buffer = [];
    uploads.push(api.uploadBatch(scanId, items));
  };

  async function process(index: number): Promise<void> {
    const entry = entries[index];
    try {
      const file = await entry.handle.getFile();
      if (file.size > MAX_FILE_BYTES || file.size < MIN_FILE_BYTES) {
        skipped++;
        return;
      }

      const analysis = await analyzeImage(file);
      bytes += file.size;
      scanned++;
      buffer.push({
        relPath: entry.relPath,
        name: entry.name,
        mime: file.type || guessMime(entry.name),
        sizeBytes: file.size,
        width: analysis.width,
        height: analysis.height,
        dateTaken: file.lastModified,
        modifiedAt: file.lastModified,
        blurScore: analysis.blurScore,
        isBlurry: analysis.isBlurry,
        dhash: analysis.dhash,
        thumb: analysis.thumb,
      });

      if (buffer.length >= BATCH_SIZE) flush();
    } catch (error) {
      if (isAbort(error)) throw error;
      unsupported++;
    } finally {
      done++;
      onProgress?.({ done, total: entries.length, name: entry.name });
      // Let the browser paint the progress bar between photos.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  async function worker(): Promise<void> {
    while (true) {
      const index = cursor++;
      if (index >= entries.length) return;
      if (signal?.aborted) return;
      await process(index);
    }
  }

  let aborted = false;
  try {
    await Promise.all(Array.from({ length: concurrency }, () => worker()));
  } catch (error) {
    if (!isAbort(error) && !signal?.aborted) throw error;
    aborted = true;
  }

  flush();
  await Promise.all(uploads);

  if (!aborted) {
    await api.completeScan(scanId);
  }

  return {
    scanned,
    unsupported,
    skipped,
    bytes,
    durationMs: Date.now() - startedAt,
    aborted,
  };
}
