import type { ManualAdjustments, Stroke } from './imaging';

export interface RenderedImage {
  blob: Blob;
  width: number;
  height: number;
}

interface PendingEntry {
  resolve: (value: RenderedImage) => void;
  reject: (error: Error) => void;
}

type WorkerReply =
  | { id: number; ok: true; blob: Blob; width: number; height: number }
  | { id: number; ok: true; width: number; height: number }
  | { id: number; ok: false; error: string };

/** Thin promise wrapper around the enhancement worker. */
export class EnhanceSession {
  private readonly worker: Worker;
  private sequence = 0;
  private pending = new Map<number, PendingEntry>();
  private ready = false;

  constructor() {
    this.worker = new Worker(new URL('./enhance.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (event: MessageEvent<WorkerReply>) => {
      const reply = event.data;
      const entry = this.pending.get(reply.id);
      if (!entry) return;
      this.pending.delete(reply.id);

      if (!reply.ok) {
        entry.reject(new Error(reply.error));
        return;
      }

      entry.resolve({
        blob: 'blob' in reply ? reply.blob : new Blob(),
        width: reply.width,
        height: reply.height,
      });
    };

    this.worker.onerror = (event) => {
      const error = new Error(event.message || 'The enhancement worker stopped.');
      for (const entry of this.pending.values()) entry.reject(error);
      this.pending.clear();
    };
  }

  private send(message: Record<string, unknown>, transfer: Transferable[] = []): Promise<RenderedImage> {
    const id = ++this.sequence;
    return new Promise<RenderedImage>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try {
        this.worker.postMessage({ ...message, id }, transfer);
      } catch (error) {
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error('Could not contact the worker.'));
      }
    });
  }

  async open(blob: Blob): Promise<{ width: number; height: number }> {
    const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    const result = await this.send({ type: 'init', bitmap }, [bitmap]);
    this.ready = true;
    return { width: result.width, height: result.height };
  }

  renderManual(
    adjustments: ManualAdjustments,
    maxSize: number,
    quality?: number,
  ): Promise<RenderedImage> {
    if (!this.ready) return Promise.reject(new Error('No photo is loaded.'));
    return this.send({ type: 'render', mode: 'manual', adjustments, maxSize, quality });
  }

  renderSmart(
    strokes: Stroke[],
    strength: number,
    wholePhoto: boolean,
    maxSize: number,
    quality?: number,
  ): Promise<RenderedImage> {
    if (!this.ready) return Promise.reject(new Error('No photo is loaded.'));
    return this.send({
      type: 'render',
      mode: 'smart',
      strokes,
      strength,
      wholePhoto,
      maxSize,
      quality,
    });
  }

  dispose(): void {
    this.worker.terminate();
    for (const entry of this.pending.values()) entry.reject(new Error('The editor was closed.'));
    this.pending.clear();
    this.ready = false;
  }
}

export const LIVE_SIZE = 800;
export const DRAG_SIZE = 480;
export const SAVE_SIZE = 2880;
