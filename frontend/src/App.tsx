import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';

import { Icon, type IconName } from './components/icons';
import { Button, IconButton, Progress, Spinner } from './components/ui';
import { useApp } from './context/AppContext';
import { plural } from './lib/format';
import Blurry from './pages/Blurry';
import Dashboard from './pages/Dashboard';
import Duplicates from './pages/Duplicates';
import Enhance from './pages/Enhance';
import Settings from './pages/Settings';
import Trash from './pages/Trash';

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  end?: boolean;
}

const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: 'grid', end: true },
  { to: '/blurry', label: 'Blurry photos', icon: 'search' },
  { to: '/duplicates', label: 'Duplicates', icon: 'copy' },
  { to: '/enhance', label: 'Enhance', icon: 'sparkles' },
  { to: '/trash', label: 'Recently deleted', icon: 'trash' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
];

const TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/blurry': 'Blurry photos',
  '/duplicates': 'Duplicates',
  '/enhance': 'Enhance',
  '/trash': 'Recently deleted',
  '/settings': 'Settings',
};

function Brand(): ReactNode {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand via-violet-500 to-pink text-white shadow-soft">
        <Icon name="sparkles" size={18} />
      </span>
      <div className="leading-tight">
        <p className="text-[13.5px] font-bold tracking-tight text-ink">Storage Cleaner</p>
        <p className="text-[10.5px] text-ink3">Your photos stay in place</p>
      </div>
    </div>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }): ReactNode {
  const { library, stats, scanning, scan } = useApp();
  const trashCount = stats?.trashedCount ?? 0;

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pb-5 pt-5">
        <Brand />
      </div>

      <nav className="flex-1 space-y-1 px-2.5" aria-label="Main">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              `focus-ring group flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-semibold transition ${
                isActive
                  ? 'bg-brand/12 text-brand'
                  : 'text-ink2 hover:bg-alt hover:text-ink'
              }`
            }
          >
            <Icon name={item.icon} size={18} className="shrink-0" />
            <span className="flex-1 truncate">{item.label}</span>
            {item.to === '/trash' && trashCount > 0 ? (
              <span className="rounded-full bg-amber/15 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-amber">
                {trashCount}
              </span>
            ) : null}
          </NavLink>
        ))}
      </nav>

      <div className="space-y-3 p-3">
        <div className="rounded-xl border border-line bg-alt/60 p-3">
          <p className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink3">
            <Icon name="folder" size={13} />
            Library folder
          </p>
          <p className="mt-1 truncate text-[12.5px] font-semibold text-ink" title={library?.folderName}>
            {library?.folderName ?? 'Not connected'}
          </p>
          <p className="mt-0.5 text-[10.5px] text-ink3">
            {plural(stats?.totalPhotos ?? 0, 'photo')} indexed
          </p>
          <Button
            size="sm"
            variant="outline"
            icon="refresh"
            className="mt-2.5 w-full"
            disabled={scanning}
            onClick={() => void scan()}
          >
            {scanning ? 'Scanning…' : 'Scan folder'}
          </Button>
        </div>

        <div className="flex items-start gap-1.5 px-1 text-[10.5px] leading-snug text-ink3">
          <Icon name="shield" size={13} className="mt-0.5 shrink-0" />
          <p>No uploads. Analysis and enhancement run on this device.</p>
        </div>
      </div>
    </div>
  );
}

function ScanStrip(): ReactNode {
  const { scanning, scanProgress, cancelScan } = useApp();
  if (!scanning) return null;

  const percent =
    scanProgress && scanProgress.total > 0 ? scanProgress.done / scanProgress.total : 0;

  return (
    <div className="border-t border-line bg-card/70">
      <div className="flex items-center gap-3 px-4 py-2 lg:px-6">
        <Spinner size={13} className="shrink-0 text-brand" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="truncate text-[11.5px] font-semibold text-ink">
              {scanProgress?.name ?? 'Reading folder'}
            </p>
            <p className="shrink-0 tabular-nums text-[10.5px] text-ink3">
              {scanProgress ? `${scanProgress.done} / ${scanProgress.total}` : ''}
            </p>
          </div>
          <Progress value={percent} className="mt-1 h-1.5" />
        </div>
        <Button size="sm" variant="ghost" onClick={cancelScan}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function Toasts(): ReactNode {
  const { toasts, dismissToast } = useApp();

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-3 sm:items-end sm:px-5">
      {toasts.map((toast) => {
        const tone =
          toast.kind === 'success'
            ? 'border-green/35 text-green'
            : toast.kind === 'error'
              ? 'border-red/35 text-red'
              : 'border-brand/35 text-brand';
        const icon: IconName =
          toast.kind === 'success' ? 'check' : toast.kind === 'error' ? 'alert' : 'info';

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-xl border bg-card px-3.5 py-3 shadow-lift ${tone}`}
            role="status"
          >
            <Icon name={icon} size={16} className="mt-0.5 shrink-0" />
            <p className="flex-1 text-[12.5px] font-medium leading-snug text-ink">{toast.message}</p>
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              aria-label="Dismiss"
              className="focus-ring -mr-1 -mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-ink3 hover:bg-alt hover:text-ink"
            >
              <Icon name="x" size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function ConnectionBanner(): ReactNode {
  const { library, connected, demo, reconnect, connect } = useApp();
  if (!library || connected) return null;

  return (
    <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-amber/35 bg-amber/10 px-4 py-3">
      <Icon name="alert" size={17} className="shrink-0 text-amber" />
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] font-semibold text-ink">Folder access needs renewing</p>
        <p className="text-[11.5px] leading-snug text-ink2">
          The index is browsable, but moving, enhancing or restoring files needs permission
          again. Chrome asks each time the page reloads.
        </p>
      </div>
      <Button
        size="sm"
        variant="outline"
        icon="folder"
        onClick={() => void (demo ? connect() : reconnect())}
      >
        {demo ? 'Reconnect demo' : 'Reconnect folder'}
      </Button>
    </div>
  );
}

function AppShell(): ReactNode {
  const { library, theme, setTheme, scanning, scan } = useApp();
  const location = useLocation();
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    setDrawer(false);
  }, [location.pathname]);

  const title = TITLES[location.pathname] ?? 'Dashboard';
  const themeIcon: IconName = theme === 'light' ? 'sun' : theme === 'dark' ? 'moon' : 'monitor';

  const cycleTheme = () => {
    setTheme(theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system');
  };

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-[236px] shrink-0 border-r border-line bg-card lg:block">
        <SidebarContent />
      </aside>

      {drawer ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 w-[266px] border-r border-line bg-card shadow-lift">
            <SidebarContent onNavigate={() => setDrawer(false)} />
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-line bg-canvas/85 backdrop-blur">
          <div className="flex h-14 items-center gap-2 px-3 lg:px-6">
            <IconButton
              icon="menu"
              label="Open navigation"
              className="lg:hidden"
              onClick={() => setDrawer(true)}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-ink">{title}</p>
              <p className="truncate text-[10.5px] text-ink3">
                {library?.folderName ?? 'No folder connected'}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              icon="refresh"
              disabled={scanning}
              onClick={() => void scan()}
              className="hidden sm:inline-flex"
            >
              {scanning ? 'Scanning…' : 'Scan'}
            </Button>
            <IconButton
              icon={themeIcon}
              label={`Theme: ${theme}. Click to change.`}
              onClick={cycleTheme}
            />
          </div>
          <ScanStrip />
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1180px]">
            <ConnectionBanner />
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/blurry" element={<Blurry />} />
              <Route path="/duplicates" element={<Duplicates />} />
              <Route path="/enhance" element={<Enhance />} />
              <Route path="/trash" element={<Trash />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </main>
      </div>
    </div>
  );
}

function Onboarding(): ReactNode {
  const { connect, startDemo, supported, toast } = useApp();

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-[980px] overflow-hidden rounded-3xl border border-line bg-card shadow-lift">
        <div className="grid gap-0 md:grid-cols-[1.05fr_1fr]">
          <div className="relative overflow-hidden bg-gradient-to-br from-[#6366F1] via-[#8B5CF6] to-[#EC4899] p-8 text-white sm:p-10">
            <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/10" />
            <div className="absolute -bottom-24 -left-10 h-64 w-64 rounded-full bg-black/10" />
            <div className="relative">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold">
                <Icon name="shield" size={13} /> Local only
              </span>
              <h1 className="mt-5 text-[30px] font-bold leading-tight tracking-tight">
                Clean up your photos without uploading them.
              </h1>
              <p className="mt-3 max-w-sm text-[13px] leading-relaxed text-white/85">
                Point the app at a folder. It finds soft shots, groups look-alike copies, and
                rewrites detail into the ones worth keeping — all on this machine.
              </p>

              <ul className="mt-6 space-y-2.5 text-[12.5px]">
                {[
                  'Blur scoring on a 300 px grayscale copy',
                  'Perceptual hashing for duplicate groups',
                  'Smart brush and manual tonal controls',
                  'Recently deleted stays restorable',
                ].map((line) => (
                  <li key={line} className="flex items-start gap-2">
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-white/20">
                      <Icon name="check" size={10} />
                    </span>
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="flex flex-col justify-center gap-4 p-8 sm:p-10">
            <div>
              <h2 className="text-[18px] font-bold tracking-tight text-ink">Choose your folder</h2>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink2">
                The browser asks for permission once. Originals are read in place; only
                400&nbsp;px thumbnails are stored for the library grid.
              </p>
            </div>

            <Button size="lg" icon="folder" onClick={() => void connect()}>
              Open a folder
            </Button>

            <button
              type="button"
              onClick={() => void startDemo()}
              className="focus-ring rounded-xl border border-line px-4 py-2.5 text-[12.5px] font-semibold text-ink2 transition hover:bg-alt hover:text-ink"
            >
              Or explore the demo library
            </button>

            {!supported ? (
              <p className="flex items-start gap-2 rounded-xl border border-amber/30 bg-amber/10 px-3 py-2.5 text-[11.5px] leading-snug text-ink2">
                <Icon name="alert" size={15} className="mt-0.5 shrink-0 text-amber" />
                This browser has no folder picker. Chrome or Edge is required. The demo still
                runs where origin private storage is available.
              </p>
            ) : null}

            <p className="text-[11px] leading-relaxed text-ink3">
              Nothing leaves your computer. There is no account, no cloud service, and no API
              key. Use the demo to try every screen with generated sample photos.
            </p>
            <button
              type="button"
              onClick={() =>
                toast('Pick a folder that only contains photos you are happy to edit.', 'info')
              }
              className="focus-ring self-start text-[11px] font-semibold text-brand hover:underline"
            >
              Which folder should I pick?
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Splash(): ReactNode {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand via-violet-500 to-pink text-white shadow-soft">
          <Icon name="sparkles" size={22} />
        </span>
        <div className="flex items-center gap-2 text-[12px] text-ink2">
          <Spinner size={13} className="text-brand" />
          Opening your library…
        </div>
      </div>
    </div>
  );
}

export default function App(): ReactNode {
  const { booted, library } = useApp();

  return (
    <>
      {!booted ? <Splash /> : library ? <AppShell /> : <Onboarding />}
      <Toasts />
    </>
  );
}
