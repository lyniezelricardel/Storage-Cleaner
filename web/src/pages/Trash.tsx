import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { Icon } from '../components/icons';
import { Lightbox } from '../components/Lightbox';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Modal,
  PageHeader,
  PhotoTile,
  SelectionBar,
} from '../components/ui';
import { useApp } from '../context/AppContext';
import { deleteForever, restoreFromTrash } from '../lib/actions';
import { api, type Photo } from '../lib/api';
import { formatBytes, formatDateTime, plural } from '../lib/format';

export default function Trash(): ReactNode {
  const { handle, connected, reconnect, refresh, toast, stats } = useApp();

  const [trashed, setTrashed] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState<'restore' | 'delete' | null>(null);
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<Photo | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await api.getTrashed();
      setTrashed(response.photos);
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not load Recently Deleted.', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load, stats?.trashedCount]);

  const selectedPhotos = useMemo(
    () => trashed.filter((photo) => selected.has(photo.id)),
    [selected, trashed],
  );
  const selectedBytes = selectedPhotos.reduce((sum, photo) => sum + photo.sizeBytes, 0);
  const totalBytes = trashed.reduce((sum, photo) => sum + photo.sizeBytes, 0);
  const allSelected = trashed.length > 0 && selected.size === trashed.length;

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(trashed.map((photo) => photo.id)));
  };

  const run = async (action: 'restore' | 'delete') => {
    if (!handle) {
      toast('Connect the folder before changing trash.', 'error');
      return;
    }
    if (!connected) {
      const granted = await reconnect();
      if (!granted) return;
    }

    setBusy(true);
    try {
      const result =
        action === 'restore'
          ? await restoreFromTrash(handle, selectedPhotos)
          : await deleteForever(handle, selectedPhotos);

      await refresh();
      await load();
      setSelected(new Set());
      setConfirming(null);

      if (result.failed.length > 0) {
        toast(
          `${result.completed} done. ${result.failed.length} failed: ${result.failed[0].reason}`,
          'error',
        );
      } else {
        toast(
          action === 'restore'
            ? `Restored ${plural(result.completed, 'photo')} to the folder.`
            : `Permanently removed ${plural(result.completed, 'photo')}.`,
          action === 'restore' ? 'success' : 'info',
        );
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : 'That action could not be completed.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Recently deleted"
        description="Ordinary deletes land here first. Restoring puts the file back at its original path; deleting forever removes it from the trash folder on disk."
        actions={
          <>
            <Button variant="outline" icon="check" onClick={toggleAll} disabled={trashed.length === 0}>
              {allSelected ? 'Deselect all' : 'Select all'}
            </Button>
            <Button
              variant="outline"
              icon="restore"
              disabled={selected.size === 0}
              onClick={() => setConfirming('restore')}
            >
              Restore
            </Button>
            <Button
              variant="danger"
              icon="trash"
              disabled={selected.size === 0}
              onClick={() => setConfirming('delete')}
            >
              Delete forever
            </Button>
          </>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Card className="flex items-center gap-3 p-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber/12 text-amber">
            <Icon name="trash" size={18} />
          </span>
          <div>
            <p className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink3">In trash</p>
            <p className="text-[18px] font-bold leading-tight text-ink">{trashed.length}</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3 p-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand/12 text-brand">
            <Icon name="download" size={18} />
          </span>
          <div>
            <p className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink3">Reclaimable</p>
            <p className="text-[18px] font-bold leading-tight text-ink">{formatBytes(totalBytes)}</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3 p-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-green/12 text-green">
            <Icon name="shield" size={18} />
          </span>
          <div>
            <p className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink3">Restorable</p>
            <p className="text-[13px] font-bold leading-tight text-ink">Until you delete forever</p>
          </div>
        </Card>
      </div>

      {loading && trashed.length === 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {[0, 1, 2, 3].map((key) => (
            <Card key={key} className="h-48 animate-pulse bg-alt/40" />
          ))}
        </div>
      ) : trashed.length === 0 ? (
        <EmptyState
          icon="restore"
          title="Nothing in Recently Deleted"
          description="Photos you move to trash from Blurry, Duplicates or the editor show up here. They stay restorable until you choose Delete forever."
          action={
            <Link to="/blurry">
              <Button variant="outline" icon="search">
                Review blurry photos
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {trashed.map((photo) => (
            <PhotoTile
              key={photo.id}
              photo={photo}
              selected={selected.has(photo.id)}
              onToggle={() => toggle(photo.id)}
              onView={() => setViewing(photo)}
              badge={<Badge tone="neutral">Trashed</Badge>}
              caption={formatDateTime(photo.trashedAt)}
            />
          ))}
        </div>
      )}

      <SelectionBar
        count={selected.size}
        detail={`${formatBytes(selectedBytes)} selected`}
        onClear={() => setSelected(new Set())}
      >
        <Button
          variant="outline"
          size="sm"
          icon="restore"
          onClick={() => setConfirming('restore')}
        >
          Restore
        </Button>
        <Button variant="danger" size="sm" icon="trash" onClick={() => setConfirming('delete')}>
          Delete forever
        </Button>
      </SelectionBar>

      <Modal
        open={confirming === 'restore'}
        onClose={() => setConfirming(null)}
        title={`Restore ${plural(selected.size, 'photo')}?`}
        description="Each file goes back to the path it came from. If a newer file already uses that path, the restore fails for that photo and the trash copy is kept."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(null)} disabled={busy}>
              Cancel
            </Button>
            <Button icon="restore" onClick={() => void run('restore')} disabled={busy}>
              {busy ? 'Restoring…' : 'Restore'}
            </Button>
          </>
        }
      >
        <p>
          {formatBytes(selectedBytes)} returns to the folder.
        </p>
      </Modal>

      <Modal
        open={confirming === 'delete'}
        onClose={() => setConfirming(null)}
        title={`Permanently delete ${plural(selected.size, 'photo')}?`}
        description="This removes the files from Mobile Storage Cleaner/trash on disk. There is no undo and no copy left in the app."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(null)} disabled={busy}>
              Keep them
            </Button>
            <Button variant="danger" icon="trash" onClick={() => void run('delete')} disabled={busy}>
              {busy ? 'Deleting…' : 'Delete forever'}
            </Button>
          </>
        }
      >
        <div className="rounded-xl border border-red/30 bg-red/8 px-3.5 py-3 text-[12px] text-ink2">
          <p className="flex items-start gap-2">
            <Icon name="alert" size={16} className="mt-0.5 shrink-0 text-red" />
            <span>
              {formatBytes(selectedBytes)} will be released. Make sure the restorable originals
              are not the only copies you have.
            </span>
          </p>
        </div>
      </Modal>

      {viewing ? <Lightbox photo={viewing} onClose={() => setViewing(null)} /> : null}
    </>
  );
}
