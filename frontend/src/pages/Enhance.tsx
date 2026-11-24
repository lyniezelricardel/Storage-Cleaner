import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { useSearchParams } from 'react-router-dom';

import { Icon } from '../components/icons';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Modal,
  PageHeader,
  PhotoTile,
  Slider,
  Spinner,
  Tabs,
} from '../components/ui';
import { useApp } from '../context/AppContext';
import { moveToTrash, saveEnhancedCopy } from '../lib/actions';
import type { Photo } from '../lib/api';
import { DRAG_SIZE, EnhanceSession, LIVE_SIZE, SAVE_SIZE } from '../lib/enhance';
import { formatBytes } from '../lib/format';
import { readFile } from '../lib/fs';
import {
  clamp,
  isNeutral,
  NEUTRAL_ADJUSTMENTS,
  type ManualAdjustments,
  type Stroke,
} from '../lib/imaging';

type Mode = 'smart' | 'manual';
type Tool = 'brush' | 'eraser';

const MANUAL_CONTROLS: Array<{
  key: keyof ManualAdjustments;
  label: string;
  min: number;
  max: number;
  signed?: boolean;
  suffix?: string;
}> = [
  { key: 'lighting', label: 'Lighting', min: -100, max: 100, signed: true },
  { key: 'sharpness', label: 'Sharpness', min: 0, max: 100 },
  { key: 'contrast', label: 'Contrast', min: -100, max: 100, signed: true },
  { key: 'clarity', label: 'Clarity', min: 0, max: 100 },
  { key: 'saturation', label: 'Saturation', min: -100, max: 100, signed: true },
  { key: 'hue', label: 'Hue', min: -180, max: 180, signed: true, suffix: '°' },
  { key: 'highlights', label: 'Highlights', min: -100, max: 100, signed: true },
  { key: 'temperature', label: 'Temperature', min: -100, max: 100, signed: true },
];

function signed(value: number, suffix = ''): string {
  const rounded = Math.round(value);
  return `${rounded > 0 ? `+${rounded}` : rounded}${suffix}`;
}

export default function Enhance(): ReactNode {
  const { photos, scanning, scan } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();

  const selectedId = searchParams.get('photo');
  const photo = photos.find((entry) => entry.id === selectedId) ?? null;

  const ordered = useMemo(() => {
    return [...photos].sort((a, b) => {
      if (a.isBlurry !== b.isBlurry) return a.isBlurry ? -1 : 1;
      return b.dateTaken - a.dateTaken;
    });
  }, [photos]);

  if (photo) {
    return (
      <Editor
        key={photo.id}
        photo={photo}
        onChangePhoto={() => setSearchParams({}, { replace: true })}
      />
    );
  }

  return (
    <Picker
      photos={ordered}
      totalPhotos={photos.length}
      scanning={scanning}
      onScan={() => void scan()}
      onSelect={(id) => setSearchParams({ photo: id })}
    />
  );
}

function Picker({
  photos,
  totalPhotos,
  scanning,
  onScan,
  onSelect,
}: {
  photos: Photo[];
  totalPhotos: number;
  scanning: boolean;
  onScan: () => void;
  onSelect: (id: string) => void;
}): ReactNode {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return photos;
    return photos.filter(
      (photo) =>
        photo.name.toLowerCase().includes(needle) ||
        photo.relPath.toLowerCase().includes(needle),
    );
  }, [photos, query]);

  return (
    <>
      <PageHeader
        title="Enhance"
        description="Pick a photo, then recover detail with the Smart brush or reshape tone with Manual controls. The original is never modified — saving writes a new JPEG."
        actions={
          <Button variant="outline" icon="refresh" disabled={scanning} onClick={onScan}>
            {scanning ? 'Scanning…' : 'Rescan folder'}
          </Button>
        }
      />

      {totalPhotos === 0 ? (
        <EmptyState
          icon="sparkles"
          title="No photos to enhance yet"
          description="Scan the connected folder first. Enhance works from the original file, so it needs the photo index and folder permission."
          action={
            <Button icon="refresh" disabled={scanning} onClick={onScan}>
              {scanning ? 'Scanning…' : 'Scan folder'}
            </Button>
          }
        />
      ) : (
        <>
          <Card className="mb-4 flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="relative min-w-[200px] flex-1">
              <Icon
                name="search"
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink3"
              />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by name or folder"
                aria-label="Search photos"
                className="focus-ring h-9 w-full rounded-xl border border-line bg-alt/60 pl-9 pr-3 text-[12.5px] text-ink placeholder:text-ink3"
              />
            </div>
            <p className="text-[11.5px] text-ink2">
              {filtered.length} of {totalPhotos} photos · soft shots first
            </p>
          </Card>

          {filtered.length === 0 ? (
            <Card className="px-5 py-10 text-center text-[12.5px] text-ink2">
              Nothing matches “{query}”.
            </Card>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {filtered.map((photo) => (
                <PhotoTile
                  key={photo.id}
                  photo={photo}
                  selected={false}
                  mode="open"
                  onToggle={() => onSelect(photo.id)}
                  badge={
                    photo.isBlurry ? (
                      <Badge tone="amber">{Math.round(photo.blurScore)}</Badge>
                    ) : undefined
                  }
                  caption={formatBytes(photo.sizeBytes)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}

function Editor({ photo, onChangePhoto }: { photo: Photo; onChangePhoto: () => void }): ReactNode {
  const { handle, connected, reconnect, refresh, toast } = useApp();

  const [mode, setMode] = useState<Mode>('smart');
  const [adjustments, setAdjustments] = useState<ManualAdjustments>(NEUTRAL_ADJUSTMENTS);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [strength, setStrength] = useState(75);
  const [wholePhoto, setWholePhoto] = useState(false);
  const [brushSize, setBrushSize] = useState(7);
  const [tool, setTool] = useState<Tool>('brush');

  const [preview, setPreview] = useState<string | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [saving, setSaving] = useState(false);
  const [compare, setCompare] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [trashConfirm, setTrashConfirm] = useState(false);
  const [trashing, setTrashing] = useState(false);
  const [savedName, setSavedName] = useState<string | null>(null);
  const [natural, setNatural] = useState({ width: 0, height: 0 });

  const sessionRef = useRef<EnhanceSession | null>(null);
  const mountedRef = useRef(true);
  const inflightRef = useRef(false);
  const queuedRef = useRef<number | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const originalUrlRef = useRef<string | null>(null);
  const refineTimerRef = useRef<number | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const paintingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  const paramsRef = useRef({ mode, adjustments, strokes, strength, wholePhoto });
  paramsRef.current = { mode, adjustments, strokes, strength, wholePhoto };

  /**
   * Renders through the worker. While a render is in flight, only the largest
   * queued size is kept, so a fast slider drag cannot backlog the worker.
   */
  const requestRender = useCallback(
    async (maxSize: number) => {
      if (!sessionRef.current) return;
      if (inflightRef.current) {
        queuedRef.current = Math.max(queuedRef.current ?? 0, maxSize);
        return;
      }

      let size: number | null = maxSize;
      while (size !== null) {
        const session = sessionRef.current;
        if (!session) break;

        inflightRef.current = true;
        setRendering(true);

        try {
          const current = paramsRef.current;
          const quality = size >= LIVE_SIZE ? 0.9 : 0.8;
          const result =
            current.mode === 'manual'
              ? await session.renderManual(current.adjustments, size, quality)
              : await session.renderSmart(
                  current.strokes,
                  current.strength / 100,
                  current.wholePhoto,
                  size,
                  quality,
                );

          if (!mountedRef.current) return;

          const url = URL.createObjectURL(result.blob);
          const previous = previewUrlRef.current;
          previewUrlRef.current = url;
          setPreview(url);
          if (previous) URL.revokeObjectURL(previous);
        } catch (error) {
          if (mountedRef.current) {
            toast(
              error instanceof Error ? error.message : 'Could not render the preview.',
              'error',
            );
          }
        } finally {
          inflightRef.current = false;
        }

        size = queuedRef.current;
        queuedRef.current = null;
      }

      if (mountedRef.current) setRendering(false);
    },
    [toast],
  );

  const refineNow = useCallback(() => {
    if (refineTimerRef.current !== null) {
      window.clearTimeout(refineTimerRef.current);
      refineTimerRef.current = null;
    }
    void requestRender(LIVE_SIZE);
  }, [requestRender]);

  /** Keyboard changes never fire pointer-up, so refine after a quiet moment. */
  const scheduleRefine = useCallback(() => {
    if (refineTimerRef.current !== null) window.clearTimeout(refineTimerRef.current);
    refineTimerRef.current = window.setTimeout(() => {
      refineTimerRef.current = null;
      void requestRender(LIVE_SIZE);
    }, 260);
  }, [requestRender]);

  // Load the original into the worker once per photo / folder handle.
  useEffect(() => {
    mountedRef.current = true;
    const session = new EnhanceSession();
    sessionRef.current = session;
    let cancelled = false;

    void (async () => {
      try {
        if (!handle) throw new Error('Connect your folder before opening a photo.');
        const file = await readFile(handle, photo.relPath);
        if (cancelled) return;

        const url = URL.createObjectURL(file);
        originalUrlRef.current = url;
        setOriginalUrl(url);

        const size = await session.open(file);
        if (cancelled) return;

        setNatural(size);
        setLoading(false);
        await requestRender(LIVE_SIZE);
      } catch (error) {
        if (cancelled) return;
        setLoadError(
          error instanceof Error
            ? error.message
            : 'This photo could not be opened. The folder may need permission again.',
        );
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      mountedRef.current = false;
      if (refineTimerRef.current !== null) {
        window.clearTimeout(refineTimerRef.current);
        refineTimerRef.current = null;
      }
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
      if (originalUrlRef.current) {
        URL.revokeObjectURL(originalUrlRef.current);
        originalUrlRef.current = null;
      }
      session.dispose();
      sessionRef.current = null;
    };
  }, [attempt, handle, photo.id, photo.relPath, requestRender]);

  // Keep the painted mask visible over the rendered preview.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const paint = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(rect.width * ratio));
      canvas.height = Math.max(1, Math.round(rect.height * ratio));

      const context = canvas.getContext('2d');
      if (!context) return;
      context.clearRect(0, 0, canvas.width, canvas.height);

      if (wholePhoto) {
        context.fillStyle = 'rgba(129, 140, 248, 0.2)';
        context.fillRect(0, 0, canvas.width, canvas.height);
        return;
      }

      const shortest = Math.min(rect.width, rect.height);
      for (const stroke of strokes) {
        const x = stroke.x * rect.width * ratio;
        const y = stroke.y * rect.height * ratio;
        const radius = Math.max(1, stroke.radius * shortest * ratio);

        if (stroke.erase) {
          context.globalCompositeOperation = 'destination-out';
          context.fillStyle = 'rgba(0, 0, 0, 1)';
        } else {
          context.globalCompositeOperation = 'source-over';
          context.fillStyle = 'rgba(129, 140, 248, 0.34)';
        }

        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fill();
      }
      context.globalCompositeOperation = 'source-over';
    };

    paint();
    const observer = new ResizeObserver(paint);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [compare, mode, preview, strokes, wholePhoto]);

  const changeMode = (next: string) => {
    const value = next as Mode;
    if (value === mode) return;
    setMode(value);
    paramsRef.current = { ...paramsRef.current, mode: value };
    void requestRender(DRAG_SIZE);
    scheduleRefine();
  };

  const updateAdjustment = (key: keyof ManualAdjustments, value: number) => {
    const next = { ...adjustments, [key]: value };
    setAdjustments(next);
    paramsRef.current = { ...paramsRef.current, adjustments: next };
    void requestRender(DRAG_SIZE);
    scheduleRefine();
  };

  const updateStrength = (value: number) => {
    setStrength(value);
    paramsRef.current = { ...paramsRef.current, strength: value };
    void requestRender(DRAG_SIZE);
    scheduleRefine();
  };

  const toggleWholePhoto = () => {
    const next = !wholePhoto;
    setWholePhoto(next);
    paramsRef.current = { ...paramsRef.current, wholePhoto: next };
    void requestRender(DRAG_SIZE);
    scheduleRefine();
  };

  const resetAdjustments = () => {
    setAdjustments(NEUTRAL_ADJUSTMENTS);
    paramsRef.current = { ...paramsRef.current, adjustments: NEUTRAL_ADJUSTMENTS };
    void requestRender(DRAG_SIZE);
    scheduleRefine();
  };

  const clearMask = () => {
    strokesRef.current = [];
    setStrokes([]);
    paramsRef.current = { ...paramsRef.current, strokes: [] };
    void requestRender(DRAG_SIZE);
    scheduleRefine();
  };

  const addPoint = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (wholePhoto) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const y = clamp((event.clientY - rect.top) / rect.height, 0, 1);

    const last = lastPointRef.current;
    if (last) {
      const spacing = tool === 'eraser' ? 0.004 : Math.max(0.004, (brushSize / 100) * 0.3);
      if (Math.hypot(x - last.x, y - last.y) < spacing) return;
    }

    const stroke: Stroke = {
      x,
      y,
      radius: brushSize / 100,
      erase: tool === 'eraser',
    };

    const next = [...strokesRef.current, stroke];
    strokesRef.current = next;
    lastPointRef.current = { x, y };
    setStrokes(next);
    paramsRef.current = { ...paramsRef.current, strokes: next };
    void requestRender(DRAG_SIZE);
  };

  const startStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0 || wholePhoto || compare) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    paintingRef.current = true;
    lastPointRef.current = null;
    addPoint(event);
  };

  const moveStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!paintingRef.current) return;
    addPoint(event);
  };

  const endStroke = () => {
    if (!paintingRef.current) return;
    paintingRef.current = false;
    lastPointRef.current = null;
    refineNow();
  };

  const save = async () => {
    const session = sessionRef.current;
    if (!session || !handle) {
      toast('The folder is not connected. Reconnect before saving.', 'error');
      return;
    }

    setSaving(true);
    try {
      const current = paramsRef.current;
      const result =
        current.mode === 'manual'
          ? await session.renderManual(current.adjustments, SAVE_SIZE, 0.94)
          : await session.renderSmart(
              current.strokes,
              current.strength / 100,
              current.wholePhoto,
              SAVE_SIZE,
              0.94,
            );

      if (result.blob.size === 0) throw new Error('The renderer returned an empty image.');

      const saved = await saveEnhancedCopy(handle, result.blob, photo.name);
      await refresh();
      setSavedName(saved.name);
      toast(`Saved ${saved.name}.`, 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not save the enhanced copy.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const trashOriginal = async () => {
    if (!handle) return;
    setTrashing(true);
    try {
      const result = await moveToTrash(handle, [photo]);
      await refresh();
      setTrashConfirm(false);
      if (result.failed.length > 0) {
        toast(result.failed[0].reason, 'error');
      } else {
        toast('Original moved to Recently Deleted. The saved copy stays in the folder.', 'success');
        onChangePhoto();
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not move the original.', 'error');
    } finally {
      setTrashing(false);
    }
  };

  const neutral = isNeutral(adjustments);
  const canSave = Boolean(preview) && !loading && !saving && !loadError;

  return (
    <>
      <PageHeader
        title={photo.name}
        description={`${photo.width} × ${photo.height} · ${formatBytes(photo.sizeBytes)} · ${
          photo.isBlurry ? `blur score ${Math.round(photo.blurScore)}` : 'in focus'
        }`}
        actions={
          <>
            <Button variant="ghost" icon="arrowLeft" onClick={onChangePhoto}>
              Change photo
            </Button>
            <Button icon="download" disabled={!canSave} onClick={() => void save()}>
              {saving ? 'Saving…' : 'Save copy'}
            </Button>
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_336px]">
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2.5">
            <Tabs
              tabs={[
                { value: 'smart', label: 'Smart', icon: 'sparkles' },
                { value: 'manual', label: 'Manual', icon: 'sun' },
              ]}
              value={mode}
              onChange={changeMode}
            />

            <div className="flex items-center gap-2">
              {rendering ? (
                <span className="flex items-center gap-1.5 text-[10.5px] font-semibold text-ink3">
                  <Spinner size={12} />
                  Rendering
                </span>
              ) : null}
              <button
                type="button"
                disabled={!originalUrl}
                onPointerDown={() => setCompare(true)}
                onPointerUp={() => setCompare(false)}
                onPointerLeave={() => setCompare(false)}
                onPointerCancel={() => setCompare(false)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') setCompare(true);
                }}
                onKeyUp={() => setCompare(false)}
                className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 text-[11.5px] font-semibold text-ink2 transition hover:bg-alt hover:text-ink disabled:opacity-40"
              >
                <Icon name="compare" size={14} />
                Hold for original
              </button>
            </div>
          </div>

          <div className="relative flex min-h-[340px] items-center justify-center overflow-hidden bg-[#0b1020] p-3 sm:p-5">
            {loading ? (
              <div className="flex flex-col items-center gap-3 py-16 text-white/70">
                <Spinner size={22} />
                <p className="text-[11.5px]">Decoding the original…</p>
              </div>
            ) : loadError ? (
              <div className="max-w-sm px-4 py-10 text-center text-white/80">
                <Icon name="alert" size={26} className="mx-auto text-amber" />
                <p className="mt-3 text-[13px] font-semibold text-white">Photo unavailable</p>
                <p className="mt-1.5 text-[11.5px] leading-relaxed text-white/60">{loadError}</p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    icon="folder"
                    onClick={async () => {
                      const granted = await reconnect();
                      if (granted) {
                        setLoadError(null);
                        setLoading(true);
                        setAttempt((value) => value + 1);
                      }
                    }}
                  >
                    Reconnect
                  </Button>
                  <Button size="sm" variant="ghost" className="text-white/70" onClick={onChangePhoto}>
                    Pick another
                  </Button>
                </div>
              </div>
            ) : (
              <div className="relative inline-block max-w-full select-none">
                <img
                  src={compare ? (originalUrl ?? photo.thumbUrl) : (preview ?? originalUrl ?? photo.thumbUrl)}
                  alt={photo.name}
                  draggable={false}
                  className="block max-h-[58vh] w-auto max-w-full rounded-lg shadow-2xl"
                />
                {mode === 'smart' && !compare ? (
                  <canvas
                    ref={canvasRef}
                    onPointerDown={startStroke}
                    onPointerMove={moveStroke}
                    onPointerUp={endStroke}
                    onPointerCancel={endStroke}
                    className={`absolute inset-0 h-full w-full touch-none rounded-lg ${
                      wholePhoto ? 'cursor-default' : 'cursor-crosshair'
                    }`}
                    aria-label="Smart enhance brush overlay"
                  />
                ) : null}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-3 py-2 text-[10.5px] text-ink3">
            <span>
              {natural.width > 0
                ? `${natural.width} × ${natural.height} working copy`
                : 'Working copy'}
            </span>
            <span>
              {mode === 'smart'
                ? wholePhoto
                  ? 'Whole photo selected'
                  : `${strokes.length} brush points · paint where detail should return`
                : neutral
                  ? 'Neutral — move a slider to update the preview'
                  : 'Preview updates while you drag'}
            </span>
          </div>

          {mode === 'smart' && !wholePhoto ? (
            <div className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2.5">
              <div className="flex items-center gap-1 rounded-lg bg-alt p-1">
                {(
                  [
                    { value: 'brush', label: 'Brush', icon: 'brush' },
                    { value: 'eraser', label: 'Eraser', icon: 'eraser' },
                  ] as const
                ).map((entry) => (
                  <button
                    key={entry.value}
                    type="button"
                    onClick={() => setTool(entry.value)}
                    className={`focus-ring inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11.5px] font-semibold transition ${
                      tool === entry.value
                        ? 'bg-card text-ink shadow-soft'
                        : 'text-ink2 hover:text-ink'
                    }`}
                  >
                    <Icon name={entry.icon} size={14} />
                    {entry.label}
                  </button>
                ))}
              </div>
              <div className="min-w-[160px] flex-1">
                <Slider
                  label="Brush size"
                  value={brushSize}
                  min={1}
                  max={20}
                  display={`${brushSize}%`}
                  onChange={setBrushSize}
                />
              </div>
              <Button size="sm" variant="ghost" icon="eraser" onClick={clearMask} disabled={strokes.length === 0}>
                Clear mask
              </Button>
            </div>
          ) : null}
        </Card>

        <div className="space-y-3">
          {mode === 'smart' ? (
            <Card className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-[13.5px] font-bold text-ink">Smart enhance</h2>
                  <p className="mt-0.5 text-[11px] leading-snug text-ink2">
                    Multi-scale unsharp masking inside the painted area. It recovers detail that
                    is already there; it cannot invent content.
                  </p>
                </div>
                <Badge tone="brand">Local</Badge>
              </div>

              <div className="mt-4 space-y-3">
                <Slider
                  label="Strength"
                  value={strength}
                  min={0}
                  max={100}
                  display={`${strength}%`}
                  onChange={updateStrength}
                  onDragStateChange={(dragging) => {
                    if (!dragging) refineNow();
                  }}
                />

                <button
                  type="button"
                  onClick={toggleWholePhoto}
                  aria-pressed={wholePhoto}
                  className={`focus-ring flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                    wholePhoto ? 'border-brand/40 bg-brand/10' : 'border-line hover:bg-alt'
                  }`}
                >
                  <span>
                    <span className="block text-[12px] font-semibold text-ink">Whole photo</span>
                    <span className="block text-[10.5px] text-ink2">
                      Skip the brush and apply everywhere
                    </span>
                  </span>
                  <span
                    className={`relative h-5 w-9 shrink-0 rounded-full transition ${
                      wholePhoto ? 'bg-brand' : 'bg-line'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${
                        wholePhoto ? 'left-[18px]' : 'left-0.5'
                      }`}
                    />
                  </span>
                </button>

                <div className="rounded-xl border border-line bg-alt/50 px-3 py-2.5">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold text-ink">
                    <Icon name="brush" size={13} className="text-brand" />
                    How to paint
                  </p>
                  <p className="mt-1 text-[10.5px] leading-relaxed text-ink2">
                    Drag across faces, text or edges that look soft. Use the eraser to pull the
                    effect back out. Switching photos discards the mask.
                  </p>
                </div>
              </div>
            </Card>
          ) : (
            <Card className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-[13.5px] font-bold text-ink">Manual adjustments</h2>
                  <p className="mt-0.5 text-[11px] leading-snug text-ink2">
                    Same pipeline order as the Android version: light, highlights, warmth,
                    contrast, hue, saturation, then detail.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  icon="refresh"
                  onClick={resetAdjustments}
                  disabled={neutral}
                >
                  Reset
                </Button>
              </div>

              <div className="mt-3 space-y-2.5">
                {MANUAL_CONTROLS.map((control) => (
                  <Slider
                    key={control.key}
                    label={control.label}
                    value={adjustments[control.key]}
                    min={control.min}
                    max={control.max}
                    display={
                      control.signed
                        ? signed(adjustments[control.key], control.suffix ?? '')
                        : String(Math.round(adjustments[control.key]))
                    }
                    onChange={(value) => updateAdjustment(control.key, value)}
                    onDragStateChange={(dragging) => {
                      if (!dragging) refineNow();
                    }}
                  />
                ))}
              </div>

              <p className="mt-2 text-[10.5px] leading-snug text-ink3">
                The preview redraws while the slider is held. Releasing it refines to the full
                preview size.
              </p>
            </Card>
          )}

          <Card className="p-4">
            <h2 className="text-[12.5px] font-bold text-ink">Saving</h2>
            <p className="mt-1 text-[11px] leading-relaxed text-ink2">
              Writes a new JPEG at up to 2880 px into{' '}
              <span className="font-semibold text-ink">Mobile Storage Cleaner/</span>. The
              original stays untouched unless you choose otherwise.
            </p>

            <Button className="mt-3 w-full" icon="download" disabled={!canSave} onClick={() => void save()}>
              {saving ? 'Saving copy…' : 'Save copy'}
            </Button>
            <Button
              className="mt-2 w-full"
              variant="dangerGhost"
              icon="trash"
              disabled={trashing || !connected}
              onClick={() => setTrashConfirm(true)}
            >
              Move original to trash
            </Button>
            <p className="mt-2 text-[10px] leading-snug text-ink3">
              Moving the original is restorable from Recently Deleted.
            </p>
          </Card>
        </div>
      </div>

      <Modal
        open={trashConfirm}
        onClose={() => setTrashConfirm(false)}
        title="Move the original to trash?"
        description="The enhanced copy you save is a separate file. The original goes to Mobile Storage Cleaner/trash and stays restorable."
        footer={
          <>
            <Button variant="ghost" onClick={() => setTrashConfirm(false)} disabled={trashing}>
              Keep original
            </Button>
            <Button variant="danger" icon="trash" onClick={() => void trashOriginal()} disabled={trashing}>
              {trashing ? 'Moving…' : 'Move to trash'}
            </Button>
          </>
        }
      >
        <p className="truncate font-medium text-ink">{photo.name}</p>
      </Modal>

      <Modal
        open={savedName !== null}
        onClose={() => setSavedName(null)}
        title="Enhanced copy saved"
        description="It is already indexed, so it appears in the library and duplicate checks straight away."
        footer={
          <>
            <Button variant="ghost" onClick={() => setSavedName(null)}>
              Keep editing
            </Button>
            <Button icon="plus" onClick={onChangePhoto}>
              Enhance another
            </Button>
          </>
        }
      >
        <p className="break-all rounded-xl border border-line bg-alt/60 px-3 py-2.5 font-mono text-[11.5px] text-ink">
          Mobile Storage Cleaner/{savedName}
        </p>
      </Modal>
    </>
  );
}
