import { useState, type ReactNode } from 'react';

import { Icon } from '../components/icons';
import { Badge, Button, Card, Modal, PageHeader } from '../components/ui';
import { useApp, type ThemeMode } from '../context/AppContext';
import { formatBytes, formatDate, plural, relativeTime } from '../lib/format';

const THEMES: Array<{ value: ThemeMode; label: string; icon: 'sun' | 'moon' | 'monitor' }> = [
  { value: 'light', label: 'Light', icon: 'sun' },
  { value: 'dark', label: 'Dark', icon: 'moon' },
  { value: 'system', label: 'System', icon: 'monitor' },
];

function Row({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}): ReactNode {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line py-2.5 last:border-0 last:pb-0 first:pt-0">
      <div>
        <p className="text-[12px] font-medium text-ink">{label}</p>
        {hint ? <p className="text-[10.5px] text-ink3">{hint}</p> : null}
      </div>
      <div className="text-[12px] font-semibold tabular-nums text-ink2">{value}</div>
    </div>
  );
}

export default function Settings(): ReactNode {
  const {
    library,
    stats,
    handle,
    connected,
    demo,
    supported,
    theme,
    setTheme,
    scanning,
    scan,
    connect,
    reconnect,
    forgetFolder,
    clearIndex,
    toast,
  } = useApp();

  const [confirmForget, setConfirmForget] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<void>, close: () => void) => {
    setBusy(true);
    try {
      await action();
      close();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Settings"
        description="Appearance, the connected folder, and the fixed thresholds the local analysis uses."
        actions={
          <Button variant="outline" icon="refresh" disabled={scanning} onClick={() => void scan()}>
            {scanning ? 'Scanning…' : 'Scan now'}
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-[13.5px] font-bold text-ink">Appearance</h2>
          <p className="mt-0.5 text-[11.5px] text-ink2">
            Stored in this browser. System follows your OS preference.
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {THEMES.map((entry) => (
              <button
                key={entry.value}
                type="button"
                aria-pressed={theme === entry.value}
                onClick={() => setTheme(entry.value)}
                className={`focus-ring flex flex-col items-center gap-2 rounded-xl border px-2 py-3.5 text-[11.5px] font-semibold transition ${
                  theme === entry.value
                    ? 'border-brand/50 bg-brand/10 text-brand'
                    : 'border-line text-ink2 hover:bg-alt hover:text-ink'
                }`}
              >
                <Icon name={entry.icon} size={19} />
                {entry.label}
              </button>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-[13.5px] font-bold text-ink">Connected folder</h2>
              <p className="mt-0.5 text-[11.5px] text-ink2">
                The only place originals are read from or written to.
              </p>
            </div>
            {demo ? <Badge tone="pink">Demo</Badge> : null}
          </div>

          <div className="mt-3">
            <Row
              label="Folder"
              value={<span className="max-w-[220px] truncate">{library?.folderName ?? '—'}</span>}
              hint={handle ? 'Browser handle stored in this profile' : 'Handle not available'}
            />
            <Row label="Photos indexed" value={plural(stats?.totalPhotos ?? 0, 'photo')} />
            <Row label="Managed size" value={formatBytes(stats?.totalBytes ?? 0)} />
            <Row
              label="Last scan"
              value={stats?.lastScanAt ? relativeTime(stats.lastScanAt) : 'Never'}
              hint={stats?.lastScanAt ? formatDate(stats.lastScanAt) : undefined}
            />
            <Row
              label="Permission"
              value={
                connected ? (
                  <span className="text-green">Granted</span>
                ) : (
                  <span className="text-amber">Needs renewing</span>
                )
              }
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" icon="folder" onClick={() => void connect()}>
              Connect different folder
            </Button>
            {!connected && handle ? (
              <Button size="sm" variant="outline" icon="refresh" onClick={() => void reconnect()}>
                Renew permission
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="dangerGhost"
              icon="trash"
              onClick={() => setConfirmForget(true)}
            >
              Forget folder
            </Button>
          </div>

          <p className="mt-2.5 text-[10.5px] leading-snug text-ink3">
            Connecting a different folder clears the local index first: the old index no longer
            describes the new folder. Your files are never moved or deleted by that step.
          </p>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-[13.5px] font-bold text-ink">Detection thresholds</h2>
          <p className="mt-0.5 text-[11.5px] text-ink2">
            Fixed to match the Android implementation. They are not exposed as preferences so
            results stay comparable.
          </p>
          <div className="mt-3">
            <Row
              label="Blur cutoff"
              value="100"
              hint="Laplacian variance on a 300 px grayscale copy; below this is soft"
            />
            <Row label="Perceptual hash" value="256 bits" hint="dHash from a 17×16 grayscale image" />
            <Row
              label="Duplicate distance"
              value="≤ 24 bits"
              hint="Hamming distance; grouped through chunked bucket comparisons"
            />
            <Row label="Thumbnail" value="400 px JPEG" hint="Uploaded to the local API index" />
            <Row label="Analysis decode" value="1200 px" hint="Capped before scoring, for speed" />
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-[13.5px] font-bold text-ink">Enhancement and storage</h2>
          <p className="mt-0.5 text-[11.5px] text-ink2">
            Smart and Manual only. There is no cloud upscaler and no API key anywhere in this app.
          </p>
          <div className="mt-3">
            <Row label="Preview" value="800 px" hint="480 px while a slider is held; 800 px on release" />
            <Row label="Saved copy" value="2880 px" hint="JPEG quality 0.94, longest side capped" />
            <Row
              label="Output folder"
              value="Mobile Storage Cleaner/"
              hint="Created inside the connected folder"
            />
            <Row
              label="Trash folder"
              value="Mobile Storage Cleaner/trash/"
              hint="Restorable until Delete forever"
            />
            <Row label="Worker" value="Off main thread" hint="Pixel loops run in a module Worker" />
          </div>
        </Card>
      </div>

      <Card className="mt-4 p-5">
        <h2 className="text-[13.5px] font-bold text-ink">Browser and privacy</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 text-[11.5px] leading-relaxed text-ink2">
            <p className="flex items-start gap-2">
              <Icon
                name={supported ? 'check' : 'alert'}
                size={15}
                className={`mt-0.5 shrink-0 ${supported ? 'text-green' : 'text-amber'}`}
              />
              {supported
                ? 'The File System Access API is available. Folder access works.'
                : 'No folder picker in this browser. Use Chrome or Edge. The demo may still work.'}
            </p>
            <p className="flex items-start gap-2">
              <Icon name="shield" size={15} className="mt-0.5 shrink-0 text-brand" />
              Originals never leave this machine. The local API on port 8787 stores metadata and
              thumbnails in SQLite and api/data/thumbs.
            </p>
            <p className="flex items-start gap-2">
              <Icon name="info" size={15} className="mt-0.5 shrink-0 text-ink3" />
              HEIC/HEIF is not decoded by browsers, so those files are counted as unreadable during
              a scan instead of being indexed.
            </p>
          </div>

          <div className="rounded-xl border border-line bg-alt/50 p-3.5 text-[11.5px] leading-relaxed text-ink2">
            <p className="font-semibold text-ink">Why a local server?</p>
            <p className="mt-1">
              Browsers cannot persist a large photo index or generate repeatable thumbnails on
              their own. The small Fastify API owns the index, duplicate grouping, and static
              thumbnail files. It binds to 127.0.0.1 only.
            </p>
            <p className="mt-2">
              The Android source is kept in <span className="font-mono text-[10.5px]">reference/</span>{' '}
              so the ported math can be compared line by line.
            </p>
          </div>
        </div>
      </Card>

      <Card className="mt-4 border-red/25 p-5">
        <h2 className="text-[13.5px] font-bold text-ink">Index maintenance</h2>
        <p className="mt-0.5 text-[11.5px] text-ink2">
          Clearing the index removes cached thumbnails and indexed photo rows. Files in the
          folder are untouched, and Recently Deleted stays available. The next scan rebuilds
          the index.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" icon="refresh" onClick={() => setConfirmClear(true)}>
            Clear index
          </Button>
          <Button size="sm" variant="dangerGhost" icon="trash" onClick={() => setConfirmForget(true)}>
            Forget folder and index
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon="info"
            onClick={() =>
              toast('Removing api/data/app.db also resets the index. Stop the API first.', 'info')
            }
          >
            Reset database
          </Button>
        </div>
      </Card>

      <p className="mt-5 text-center text-[10.5px] text-ink3">
        Mobile Storage Cleaner · web port · Smart + Manual enhance, no cloud calls
      </p>

      <Modal
        open={confirmForget}
        onClose={() => setConfirmForget(false)}
        title="Forget this folder?"
        description="The index and cached thumbnails are removed, and this browser stops remembering the folder handle. Nothing inside the folder is deleted."
        footer={
          <>
            <Button variant="ghost" disabled={busy} onClick={() => setConfirmForget(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              icon="trash"
              disabled={busy}
              onClick={() => void run(forgetFolder, () => setConfirmForget(false))}
            >
              {busy ? 'Forgetting…' : 'Forget folder'}
            </Button>
          </>
        }
      >
        <p>
          Enhanced copies and the trash folder stay on disk. To re-index, connect the folder again
          and run a scan.
        </p>
      </Modal>

      <Modal
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="Clear the index?"
        description="Deletes every indexed photo and cached thumbnail for this library. The folder handle stays connected, and items already in Recently Deleted remain available."
        footer={
          <>
            <Button variant="ghost" disabled={busy} onClick={() => setConfirmClear(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              icon="refresh"
              disabled={busy}
              onClick={() => void run(clearIndex, () => setConfirmClear(false))}
            >
              {busy ? 'Clearing…' : 'Clear index'}
            </Button>
          </>
        }
      >
        <p>Run a scan afterwards to rebuild it. No photo files are touched.</p>
      </Modal>
    </>
  );
}
