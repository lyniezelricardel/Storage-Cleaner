import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

import { Icon } from '../components/icons';
import { Badge, Button, Card, EmptyState, Modal, PageHeader, PhotoTile, SelectionBar } from '../components/ui';
import { useApp } from '../context/AppContext';
import { moveToTrash } from '../lib/actions';
import { formatBytes, plural } from '../lib/format';

type SortKey = 'softest' | 'newest' | 'largest';

const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: 'softest', label: 'Softest first' },
  { key: 'newest', label: 'Newest first' },
  { key: 'largest', label: 'Largest first' },
];

export default function Blurry(): ReactNode {
  const {
    photos,
    handle,
    connected,
    reconnect,
    scanning,
    scan,
    refresh,
    toast,
  } = useApp();
  const navigate = useNavigate();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<SortKey>('softest');
  const [cutoff, setCutoff] = useState(100);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const blurry = useMemo(() => {
    const list = photos.filter((photo) => photo.blurScore < cutoff);
    const sorted = [...list];
    if (sort === 'softest') sorted.sort((a, b) => a.blurScore - b.blurScore);
    else if (sort === 'newest') sorted.sort((a, b) => b.dateTaken - a.dateTaken);
    else sorted.sort((a, b) => b.sizeBytes - a.sizeBytes);
    return sorted;
  }, [photos, cutoff, sort]);

  const selectedPhotos = useMemo(
    () => blurry.filter((photo) => selected.has(photo.id)),
    [blurry, selected],
  );
  const selectedBytes = selectedPhotos.reduce((sum, photo) => sum + photo.sizeBytes, 0);
  const visibleIds = blurry.map((photo) => photo.id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((current) => {
      if (allSelected) {
        const next = new Set(current);
        for (const id of visibleIds) next.delete(id);
        return next;
      }
      return new Set([...current, ...visibleIds]);
    });
  };

  const confirmTrash = async () => {
    if (!handle) {
      toast('Connect the folder before moving files.', 'error');
      return;
    }
    if (!connected) {
      const granted = await reconnect();
      if (!granted) return;
    }

    setBusy(true);
    try {
      const result = await moveToTrash(handle, selectedPhotos);
      await refresh();
      setSelected(new Set());
      setConfirming(false);

      if (result.failed.length > 0) {
        toast(
          `Moved ${result.completed}. ${result.failed.length} could not be moved: ${result.failed[0].reason}`,
          'error',
        );
      } else {
        toast(
          `Moved ${plural(result.completed, 'photo')} to Recently Deleted. Restorable anytime.`,
          'success',
        );
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not move those photos.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const averageScore = blurry.length
    ? Math.round(blurry.reduce((sum, photo) => sum + photo.blurScore, 0) / blurry.length)
    : 0;
  const totalBytes = blurry.reduce((sum, photo) => sum + photo.sizeBytes, 0);

  return (
    <>
      <PageHeader
        title="Blurry photos"
        description="Sharpness is measured from the variance of a Laplacian edge filter on a 300 px copy. Lower scores mean softer photos."
        actions={
          <>
            <Button
              variant="outline"
              icon="check"
              onClick={toggleAll}
              disabled={blurry.length === 0}
            >
              {allSelected ? 'Deselect all' : 'Select all'}
            </Button>
            <Button variant="outline" icon="refresh" disabled={scanning} onClick={() => void scan()}>
              {scanning ? 'Scanning…' : 'Rescan folder'}
            </Button>
          </>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Card className="flex items-center gap-3 p-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber/12 text-amber">
            <Icon name="search" size={18} />
          </span>
          <div>
            <p className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink3">Below cutoff</p>
            <p className="text-[18px] font-bold leading-tight text-ink">{blurry.length}</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3 p-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand/12 text-brand">
            <Icon name="image" size={18} />
          </span>
          <div>
            <p className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink3">Total size</p>
            <p className="text-[18px] font-bold leading-tight text-ink">{formatBytes(totalBytes)}</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3 p-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-pink/12 text-pink">
            <Icon name="alert" size={18} />
          </span>
          <div>
            <p className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink3">Average score</p>
            <p className="text-[18px] font-bold leading-tight text-ink">{averageScore}</p>
          </div>
        </Card>
      </div>

      <Card className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3.5">
        <label className="flex min-w-[240px] flex-1 flex-col gap-1">
          <span className="flex items-baseline justify-between text-[11.5px] font-semibold text-ink2">
            <span>Sharpness cutoff</span>
            <span className="tabular-nums text-ink">{cutoff}</span>
          </span>
          <input
            aria-label="Sharpness cutoff"
            type="range"
            min={30}
            max={200}
            step={5}
            value={cutoff}
            onChange={(event) => setCutoff(Number(event.target.value))}
          />
        </label>
        <p className="order-3 w-full text-[10.5px] leading-snug text-ink3 sm:order-none sm:w-auto sm:max-w-[280px]">
          The app's default threshold is 100. Raising it surfaces borderline shots; it does not
          rescan the folder.
        </p>
        <div className="flex items-center gap-1 rounded-xl bg-alt p-1">
          {SORTS.map((entry) => (
            <button
              key={entry.key}
              type="button"
              onClick={() => setSort(entry.key)}
              className={`focus-ring rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold transition ${
                sort === entry.key ? 'bg-card text-ink shadow-soft' : 'text-ink2 hover:text-ink'
              }`}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </Card>

      {blurry.length === 0 ? (
        <EmptyState
          icon="sparkles"
          title={photos.length === 0 ? 'Nothing indexed yet' : 'No soft photos at this cutoff'}
          description={
            photos.length === 0
              ? 'Run a scan to read the folder, score sharpness, and build the library index.'
              : 'Every photo scores above the cutoff. Lower the cutoff to see borderline shots, or rescan after adding new photos.'
          }
          action={
            <Button icon="refresh" disabled={scanning} onClick={() => void scan()}>
              {scanning ? 'Scanning…' : 'Scan folder'}
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {blurry.map((photo) => (
            <PhotoTile
              key={photo.id}
              photo={photo}
              selected={selected.has(photo.id)}
              onToggle={() => toggle(photo.id)}
              onOpen={() => navigate(`/enhance?photo=${encodeURIComponent(photo.id)}`)}
              badge={
                <Badge tone={photo.blurScore < 50 ? 'red' : 'amber'}>
                  {Math.round(photo.blurScore)}
                </Badge>
              }
              caption={`${formatBytes(photo.sizeBytes)} · ${photo.width}×${photo.height}`}
            />
          ))}
        </div>
      )}

      <SelectionBar
        count={selected.size}
        detail={formatBytes(selectedBytes)}
        onClear={() => setSelected(new Set())}
      >
        <Button
          variant="outline"
          size="sm"
          icon="sparkles"
          onClick={() => {
            const first = selectedPhotos[0];
            if (first) navigate(`/enhance?photo=${encodeURIComponent(first.id)}`);
          }}
        >
          Enhance one
        </Button>
        <Button variant="danger" size="sm" icon="trash" onClick={() => setConfirming(true)}>
          Move to trash
        </Button>
      </SelectionBar>

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title={`Move ${plural(selected.size, 'photo')} to Recently Deleted?`}
        description="The files are moved into Mobile Storage Cleaner/trash inside your folder. You can restore them from Recently Deleted."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" icon="trash" onClick={() => void confirmTrash()} disabled={busy}>
              {busy ? 'Moving…' : 'Move to trash'}
            </Button>
          </>
        }
      >
        <p>
          This frees <span className="font-semibold text-ink">{formatBytes(selectedBytes)}</span> in
          the folder. Nothing is erased permanently.
        </p>
      </Modal>
    </>
  );
}
