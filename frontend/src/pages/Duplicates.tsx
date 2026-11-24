import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

import { Icon } from '../components/icons';
import { Lightbox } from '../components/Lightbox';
import { Badge, Button, Card, EmptyState, Modal, PageHeader, PhotoTile, SelectionBar } from '../components/ui';
import { useApp } from '../context/AppContext';
import { moveToTrash } from '../lib/actions';
import { api, type DuplicateGroup, type Photo } from '../lib/api';
import { formatBytes, plural } from '../lib/format';

export default function Duplicates(): ReactNode {
  const {
    photos,
    handle,
    connected,
    reconnect,
    refresh,
    toast,
    scanning,
    scan,
  } = useApp();
  const navigate = useNavigate();

  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<Photo | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await api.getDuplicates();
      setGroups(response.groups);
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not group duplicates.', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load, photos]);

  const photoById = useMemo(() => {
    const map = new Map<string, Photo>();
    for (const group of groups) for (const photo of group.photos) map.set(photo.id, photo);
    return map;
  }, [groups]);

  const selectedPhotos = useMemo(
    () => [...selected].map((id) => photoById.get(id)).filter((photo): photo is Photo => Boolean(photo)),
    [photoById, selected],
  );
  const selectedBytes = selectedPhotos.reduce((sum, photo) => sum + photo.sizeBytes, 0);

  const groupSavable = groups.reduce((sum, group) => sum + group.savableSize, 0);
  const photosInGroups = new Set(groups.flatMap((group) => group.photoIds)).size;
  const allCopiesSelected =
    photosInGroups > 0 && selected.size === photosInGroups;

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectRejects = (group: DuplicateGroup) => {
    const rejects = group.photoIds.filter((id) => id !== group.bestId);
    setSelected((current) => {
      const next = new Set(current);
      const alreadyChosen = rejects.every((id) => next.has(id));
      for (const id of rejects) {
        if (alreadyChosen) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  };

  const selectAllRejects = () => {
    setSelected((current) => {
      if (allCopiesSelected) return new Set();
      const next = new Set(current);
      for (const group of groups) {
        for (const id of group.photoIds) if (id !== group.bestId) next.add(id);
      }
      return next;
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
      await load();
      setSelected(new Set());
      setConfirming(false);

      if (result.failed.length > 0) {
        toast(
          `Moved ${result.completed}. ${result.failed.length} could not be moved: ${result.failed[0].reason}`,
          'error',
        );
      } else {
        toast(
          `Moved ${plural(result.completed, 'copy', 'copies')} to Recently Deleted.`,
          'success',
        );
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not move those photos.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Duplicates"
        description="A 256-bit difference hash fingerprints each photo. Copies within 24 differing bits are grouped; the BEST copy is never preselected."
        actions={
          <>
            <Button
              variant="outline"
              icon="check"
              onClick={selectAllRejects}
              disabled={groups.length === 0}
            >
              {allCopiesSelected ? 'Clear selection' : 'Select every copy'}
            </Button>
            <Button variant="outline" icon="refresh" onClick={() => void load()} disabled={loading}>
              Refresh groups
            </Button>
            <Button variant="outline" icon="refresh" disabled={scanning} onClick={() => void scan()}>
              {scanning ? 'Scanning…' : 'Rescan folder'}
            </Button>
          </>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Card className="flex items-center gap-3 p-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-pink/12 text-pink">
            <Icon name="copy" size={18} />
          </span>
          <div>
            <p className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink3">Groups</p>
            <p className="text-[18px] font-bold leading-tight text-ink">{groups.length}</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3 p-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand/12 text-brand">
            <Icon name="image" size={18} />
          </span>
          <div>
            <p className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink3">Photos involved</p>
            <p className="text-[18px] font-bold leading-tight text-ink">{photosInGroups}</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3 p-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-green/12 text-green">
            <Icon name="download" size={18} />
          </span>
          <div>
            <p className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink3">Reclaimable</p>
            <p className="text-[18px] font-bold leading-tight text-ink">{formatBytes(groupSavable)}</p>
          </div>
        </Card>
      </div>

      {loading && groups.length === 0 ? (
        <div className="grid gap-3">
          {[0, 1, 2].map((key) => (
            <Card key={key} className="h-40 animate-pulse bg-alt/40" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <EmptyState
          icon="copy"
          title="No duplicate groups"
          description={
            photos.length === 0
              ? 'Scan the folder first. Once photos are indexed, the API can compare their perceptual hashes.'
              : 'Nothing in the index is within 24 bits of another photo. Re-saved or lightly edited copies usually still land inside that range.'
          }
          action={
            <Button icon="refresh" disabled={scanning} onClick={() => void scan()}>
              {scanning ? 'Scanning…' : 'Scan folder'}
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {groups.map((group, index) => {
            const rejects = group.photoIds.filter((id) => id !== group.bestId);
            const rejectsChosen = rejects.length > 0 && rejects.every((id) => selected.has(id));

            return (
              <Card key={group.groupId} className="overflow-hidden">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-4 py-3">
                  <div className="flex min-w-0 flex-1 items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-pink/12 text-pink">
                      <Icon name="copy" size={16} />
                    </span>
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-[12.5px] font-bold text-ink">
                        Group {index + 1}
                        <Badge tone={group.isExact ? 'green' : 'pink'}>
                          {group.isExact ? 'Exact copies' : `${Math.round(group.similarity * 100)}% match`}
                        </Badge>
                      </p>
                      <p className="text-[11px] text-ink2">
                        {plural(group.photos.length, 'photo')} ·{' '}
                        {formatBytes(group.savableSize)} recoverable
                      </p>
                    </div>
                  </div>

                  <Button
                    size="sm"
                    variant={rejectsChosen ? 'secondary' : 'outline'}
                    icon={rejectsChosen ? 'check' : 'plus'}
                    onClick={() => selectRejects(group)}
                  >
                    {rejectsChosen ? 'Copies selected' : 'Keep best, select rest'}
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-3 lg:grid-cols-4">
                  {group.photos.map((photo) => {
                    const isBest = photo.id === group.bestId;
                    return (
                      <PhotoTile
                        key={photo.id}
                        photo={photo}
                        selected={selected.has(photo.id)}
                        onToggle={() => toggle(photo.id)}
                        onView={() => setViewing(photo)}
                        onOpen={() => navigate(`/enhance?photo=${encodeURIComponent(photo.id)}`)}
                        badge={
                          isBest ? (
                            <Badge tone="green">Best</Badge>
                          ) : photo.isBlurry ? (
                            <Badge tone="amber">Soft</Badge>
                          ) : undefined
                        }
                        caption={
                          isBest
                            ? `Kept · ${formatBytes(photo.sizeBytes)}`
                            : `${formatBytes(photo.sizeBytes)} · ${photo.width}×${photo.height}`
                        }
                      />
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <SelectionBar
        count={selected.size}
        detail={`${formatBytes(selectedBytes)} selected`}
        onClear={() => setSelected(new Set())}
      >
        <Button variant="danger" size="sm" icon="trash" onClick={() => setConfirming(true)}>
          Move to trash
        </Button>
      </SelectionBar>

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title={`Move ${plural(selected.size, 'copy', 'copies')} to Recently Deleted?`}
        description="Files are moved into Mobile Storage Cleaner/trash inside the connected folder. Restore them from Recently Deleted at any time."
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
          {formatBytes(selectedBytes)} will leave the active library. The BEST copy of each group
          stays put unless you selected it yourself.
        </p>
      </Modal>

      {viewing ? (
        <Lightbox
          photo={viewing}
          onClose={() => setViewing(null)}
          actions={
            <Button
              size="sm"
              variant="secondary"
              icon="sparkles"
              onClick={() => navigate(`/enhance?photo=${encodeURIComponent(viewing.id)}`)}
            >
              Enhance
            </Button>
          }
        />
      ) : null}
    </>
  );
}
