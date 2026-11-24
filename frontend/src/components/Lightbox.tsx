import { useEffect, useState, type ReactNode } from 'react';

import { useApp } from '../context/AppContext';
import type { Photo } from '../lib/api';
import { readFile } from '../lib/fs';
import { formatBytes, formatDateTime } from '../lib/format';
import { Icon } from './icons';
import { Badge, Spinner } from './ui';

/**
 * Resolves a photo's original file to an object URL, so previews are full
 * quality instead of the 400 px library thumbnail. Returns null while loading
 * or when the folder is not connected.
 */
export function useOriginalUrl(relPath: string | null): { url: string | null; loading: boolean } {
  const { handle } = useApp();
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!handle || !relPath) {
      setUrl(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    let created: string | null = null;
    setLoading(true);

    void readFile(handle, relPath)
      .then((file) => {
        if (cancelled) return;
        created = URL.createObjectURL(file);
        setUrl(created);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [handle, relPath]);

  return { url, loading };
}

export function Lightbox({
  photo,
  onClose,
  actions,
}: {
  photo: Photo;
  onClose: () => void;
  actions?: ReactNode;
}): ReactNode {
  const { url, loading } = useOriginalUrl(photo.relPath);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-sm">
      <div className="flex items-start justify-between gap-3 px-4 py-3 text-white">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold">{photo.name}</p>
          <p className="truncate text-[11px] text-white/55">{photo.relPath}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {actions}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            className="focus-ring flex h-9 w-9 items-center justify-center rounded-xl text-white/80 transition hover:bg-white/10 hover:text-white"
          >
            <Icon name="x" size={19} />
          </button>
        </div>
      </div>

      <div
        className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-3"
        onClick={onClose}
      >
        {loading ? (
          <Spinner size={26} className="text-white/70" />
        ) : (
          <img
            src={url ?? photo.thumbUrl}
            alt={photo.name}
            onClick={(event) => event.stopPropagation()}
            className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
          />
        )}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 px-4 pb-5 text-[11.5px] text-white/60">
        <span>{formatBytes(photo.sizeBytes)}</span>
        <span>
          {photo.width} × {photo.height}
        </span>
        <span>Blur score {Math.round(photo.blurScore)}</span>
        <span>{formatDateTime(photo.dateTaken)}</span>
        {photo.isBlurry ? <Badge tone="amber">Soft focus</Badge> : null}
      </div>
    </div>
  );
}
