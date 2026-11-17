import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { Icon, type IconName } from '../components/icons';
import { Badge, Button, Card, PageHeader, StatCard } from '../components/ui';
import { useApp } from '../context/AppContext';
import { formatBytes, formatDate, plural, relativeTime } from '../lib/format';

function Hero(): ReactNode {
  const { stats, library, scanning, scan } = useApp();
  const totalPhotos = stats?.totalPhotos ?? 0;
  const totalBytes = stats?.totalBytes ?? 0;
  const savable = stats?.duplicateSavable ?? 0;
  const blurryBytes = stats?.blurryBytes ?? 0;

  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#6366F1] via-[#8B5CF6] to-[#EC4899] p-6 text-white shadow-lift sm:p-7">
      <div className="pointer-events-none absolute -right-14 -top-20 h-56 w-56 rounded-full bg-white/10" />
      <div className="pointer-events-none absolute -bottom-24 left-1/3 h-52 w-52 rounded-full bg-black/10" />

      <div className="relative flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.16em] text-white/75">
            <Icon name="folder" size={13} />
            Managed library
          </p>
          <p className="mt-2 text-[38px] font-bold leading-none tracking-tight sm:text-[44px]">
            {formatBytes(totalBytes)}
          </p>
          <p className="mt-2.5 max-w-md truncate text-[12.5px] text-white/85">
            {plural(totalPhotos, 'photo')} in {library?.folderName ?? 'your folder'}
          </p>
          <p className="mt-1 text-[11px] text-white/60">
            {stats?.lastScanAt ? `Last scan ${relativeTime(stats.lastScanAt)}` : 'No scan yet'}
            {stats?.lastScanAt ? ` · ${formatDate(stats.lastScanAt)}` : ''}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void scan()}
              disabled={scanning}
              className="focus-ring inline-flex h-9 items-center gap-2 rounded-xl bg-white px-3.5 text-[12.5px] font-bold text-[#4F46E5] transition hover:brightness-105 disabled:opacity-60"
            >
              <Icon name={scanning ? 'refresh' : 'refresh'} size={15} />
              {scanning ? 'Scanning…' : 'Scan folder'}
            </button>
            <Link
              to="/enhance"
              className="focus-ring inline-flex h-9 items-center gap-2 rounded-xl bg-white/15 px-3.5 text-[12.5px] font-semibold text-white transition hover:bg-white/25"
            >
              <Icon name="sparkles" size={15} />
              Enhance a photo
            </Link>
          </div>
        </div>

        <div className="grid w-full grid-cols-3 gap-2 sm:w-auto sm:min-w-[230px]">
          {[
            { label: 'Blurry', value: stats?.blurryCount ?? 0, note: formatBytes(blurryBytes) },
            {
              label: 'Duplicate groups',
              value: stats?.duplicateGroups ?? 0,
              note: formatBytes(savable),
            },
            { label: 'In trash', value: stats?.trashedCount ?? 0, note: 'restorable' },
          ].map((item) => (
            <div key={item.label} className="rounded-xl bg-white/12 px-3 py-2.5 backdrop-blur-sm">
              <p className="text-[9.5px] font-bold uppercase tracking-[0.07em] text-white/65">
                {item.label}
              </p>
              <p className="mt-0.5 text-[20px] font-bold leading-none tabular-nums">{item.value}</p>
              <p className="mt-1 truncate text-[9.5px] text-white/60">{item.note}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function QuickAction({
  to,
  icon,
  tone,
  title,
  subtitle,
  badge,
}: {
  to: string;
  icon: IconName;
  tone: 'brand' | 'pink' | 'green' | 'amber';
  title: string;
  subtitle: string;
  badge?: string;
}): ReactNode {
  const surfaces: Record<string, string> = {
    brand: 'bg-brand/12 text-brand',
    pink: 'bg-pink/12 text-pink',
    green: 'bg-green/12 text-green',
    amber: 'bg-amber/15 text-amber',
  };

  return (
    <Link
      to={to}
      className="focus-ring group flex items-start gap-3 rounded-2xl border border-line bg-card p-4 transition hover:border-brand/40 hover:shadow-soft"
    >
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${surfaces[tone]}`}>
        <Icon name={icon} size={19} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-[13px] font-bold text-ink">{title}</p>
          {badge ? <Badge tone={tone}>{badge}</Badge> : null}
        </div>
        <p className="mt-0.5 text-[11.5px] leading-snug text-ink2">{subtitle}</p>
      </div>
      <Icon
        name="chevronRight"
        size={16}
        className="mt-2 shrink-0 text-ink3 transition group-hover:translate-x-0.5 group-hover:text-brand"
      />
    </Link>
  );
}

function Breakdown(): ReactNode {
  const { stats } = useApp();
  const entries = stats?.byExt ?? [];
  const total = entries.reduce((sum, entry) => sum + entry.bytes, 0);

  const colors = ['bg-brand', 'bg-pink', 'bg-green', 'bg-amber', 'bg-ink3', 'bg-red'];

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-[14px] font-bold tracking-tight text-ink">Library breakdown</h2>
          <p className="mt-0.5 text-[11.5px] text-ink2">By file type, inside the connected folder.</p>
        </div>
        <p className="text-[12px] font-semibold tabular-nums text-ink2">{formatBytes(total)}</p>
      </div>

      {entries.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-[12px] text-ink3">
          Run a scan to see what fills the folder.
        </p>
      ) : (
        <div className="space-y-3.5">
          {entries.slice(0, 6).map((entry, index) => (
            <div key={entry.ext}>
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <p className="text-[12px] font-semibold text-ink">
                  {entry.ext}
                  <span className="ml-1.5 font-normal text-ink3">
                    {plural(entry.count, 'file')}
                  </span>
                </p>
                <p className="text-[11.5px] tabular-nums text-ink2">{formatBytes(entry.bytes)}</p>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-alt">
                <div
                  className={`h-full rounded-full ${colors[index % colors.length]}`}
                  style={{ width: `${total > 0 ? (entry.bytes / total) * 100 : 0}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function Attention(): ReactNode {
  const { stats } = useApp();

  const rows = [
    {
      to: '/blurry',
      icon: 'search' as IconName,
      tone: 'text-amber',
      surface: 'bg-amber/12',
      title: 'Soft or out-of-focus shots',
      detail:
        (stats?.blurryCount ?? 0) > 0
          ? `${plural(stats?.blurryCount ?? 0, 'photo')} scored below the sharpness threshold`
          : 'Nothing below the threshold right now',
      value: stats?.blurryCount ?? 0,
    },
    {
      to: '/duplicates',
      icon: 'copy' as IconName,
      tone: 'text-pink',
      surface: 'bg-pink/12',
      title: 'Look-alike copies',
      detail:
        (stats?.duplicateGroups ?? 0) > 0
          ? `${formatBytes(stats?.duplicateSavable ?? 0)} recoverable by keeping the best copy`
          : 'No groups within the similarity threshold',
      value: stats?.duplicateGroups ?? 0,
    },
    {
      to: '/trash',
      icon: 'trash' as IconName,
      tone: 'text-brand',
      surface: 'bg-brand/12',
      title: 'Waiting in Recently Deleted',
      detail:
        (stats?.trashedCount ?? 0) > 0
          ? `${formatBytes(stats?.trashedBytes ?? 0)} restorable, or delete forever`
          : 'Trash is empty',
      value: stats?.trashedCount ?? 0,
    },
  ];

  return (
    <Card className="p-5">
      <h2 className="text-[14px] font-bold tracking-tight text-ink">Needs attention</h2>
      <p className="mt-0.5 text-[11.5px] text-ink2">Sorted by what reclaims the most space.</p>

      <div className="mt-3 divide-y divide-line">
        {rows.map((row) => (
          <Link
            key={row.to}
            to={row.to}
            className="focus-ring group flex items-center gap-3 rounded-lg py-3 first:pt-1"
          >
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${row.surface} ${row.tone}`}>
              <Icon name={row.icon} size={17} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12.5px] font-semibold text-ink">{row.title}</p>
              <p className="truncate text-[11px] text-ink2">{row.detail}</p>
            </div>
            <span className="text-[17px] font-bold tabular-nums text-ink">{row.value}</span>
            <Icon
              name="chevronRight"
              size={15}
              className="shrink-0 text-ink3 transition group-hover:translate-x-0.5 group-hover:text-brand"
            />
          </Link>
        ))}
      </div>
    </Card>
  );
}

export default function Dashboard(): ReactNode {
  const { stats, library, scanning, scan } = useApp();
  const totalPhotos = stats?.totalPhotos ?? 0;
  const trashCount = stats?.trashedCount ?? 0;

  return (
    <>
      <PageHeader
        title={`Hello${library ? `, ${library.folderName}` : ''}`}
        description="A local view of what is taking up room, what looks soft, and what can safely go."
        actions={
          <>
            <Link to="/duplicates">
              <Button variant="outline" icon="copy">
                Review duplicates
              </Button>
            </Link>
            <Link to="/blurry">
              <Button icon="search">Find blurry photos</Button>
            </Link>
          </>
        }
      />

      <Hero />

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Photos"
          value={String(totalPhotos)}
          hint={formatBytes(stats?.totalBytes ?? 0)}
          icon="image"
          tone="brand"
        />
        <StatCard
          label="Blurry"
          value={String(stats?.blurryCount ?? 0)}
          hint={formatBytes(stats?.blurryBytes ?? 0)}
          icon="alert"
          tone="amber"
        />
        <StatCard
          label="Reclaimable"
          value={formatBytes(stats?.duplicateSavable ?? 0)}
          hint={`${plural(stats?.duplicateGroups ?? 0, 'duplicate group')}`}
          icon="copy"
          tone="pink"
        />
        <StatCard
          label="In trash"
          value={String(trashCount)}
          hint={formatBytes(stats?.trashedBytes ?? 0)}
          icon="trash"
          tone="green"
        />
      </div>

      {totalPhotos === 0 && !scanning ? (
        <Card className="mt-4 flex flex-wrap items-center gap-4 p-5">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand/12 text-brand">
            <Icon name="camera" size={21} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-bold text-ink">This folder is not indexed yet</p>
            <p className="text-[11.5px] text-ink2">
              A scan reads every image, scores sharpness, and fingerprints copies. It only
              uploads 400 px thumbnails to the local API.
            </p>
          </div>
          <Button variant="outline" icon="refresh" disabled={scanning} onClick={() => void scan()}>
            {scanning ? 'Scanning…' : 'Scan now'}
          </Button>
        </Card>
      ) : null}

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <QuickAction
          to="/blurry"
          icon="search"
          tone="amber"
          title="Blurry photos"
          subtitle="Review soft shots and recover detail."
          badge={String(stats?.blurryCount ?? 0)}
        />
        <QuickAction
          to="/duplicates"
          icon="copy"
          tone="pink"
          title="Duplicates"
          subtitle="Keep the best copy, select the rest."
          badge={String(stats?.duplicateGroups ?? 0)}
        />
        <QuickAction
          to="/enhance"
          icon="sparkles"
          tone="brand"
          title="Enhance"
          subtitle="Smart brush or manual tonal controls."
        />
        <QuickAction
          to="/trash"
          icon="trash"
          tone="green"
          title="Recently deleted"
          subtitle="Restore, or remove permanently."
          badge={trashCount > 0 ? String(trashCount) : undefined}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Breakdown />
        <Attention />
      </div>

      {trashCount > 0 ? (
        <Link
          to="/trash"
          className="focus-ring mt-4 flex items-center gap-3 rounded-2xl border border-amber/30 bg-amber/10 p-4 transition hover:border-amber/50"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber/15 text-amber">
            <Icon name="restore" size={19} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] font-bold text-ink">Recently Deleted</p>
            <p className="text-[11.5px] text-ink2">
              {plural(trashCount, 'photo')} · {formatBytes(stats?.trashedBytes ?? 0)} · restorable
              until you remove them
            </p>
          </div>
          <Icon name="chevronRight" size={17} className="shrink-0 text-ink3" />
        </Link>
      ) : null}

      <div className="mt-5 flex items-start gap-2 px-1 text-[11px] leading-relaxed text-ink3">
        <Icon name="shield" size={14} className="mt-0.5 shrink-0" />
        <p>
          Scanning, scoring and Smart Enhance run in this browser tab. The local API stores only
          metadata and thumbnails. Enhanced copies are written to{' '}
          <span className="font-semibold text-ink2">Mobile Storage Cleaner/</span> inside your
          folder.
        </p>
      </div>
    </>
  );
}
