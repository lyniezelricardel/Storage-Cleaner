import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { api, type Library, type Photo, type Stats } from '../lib/api';
import { DEMO_FOLDER_NAME, demoRequested, ensureDemoLibrary, exitDemo } from '../lib/demo';
import {
  clearHandle,
  filesystemSupported,
  loadHandle,
  permissionState,
  pickDirectory,
  requestPermission,
  saveHandle,
} from '../lib/fs';
import { scanFolder, type ScanProgress } from '../lib/scan';

export type ThemeMode = 'light' | 'dark' | 'system';

export interface Toast {
  id: number;
  message: string;
  kind: 'info' | 'success' | 'error';
}

interface AppContextValue {
  booted: boolean;
  library: Library | null;
  stats: Stats | null;
  photos: Photo[];
  handle: FileSystemDirectoryHandle | null;
  connected: boolean;
  demo: boolean;
  supported: boolean;
  scanning: boolean;
  scanProgress: ScanProgress | null;
  theme: ThemeMode;
  resolvedTheme: 'light' | 'dark';
  toasts: Toast[];
  setTheme: (mode: ThemeMode) => void;
  connect: () => Promise<void>;
  reconnect: () => Promise<boolean>;
  startDemo: () => Promise<void>;
  refresh: () => Promise<void>;
  scan: () => Promise<void>;
  cancelScan: () => void;
  forgetFolder: () => Promise<void>;
  clearIndex: () => Promise<void>;
  toast: (message: string, kind?: Toast['kind']) => void;
  dismissToast: (id: number) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong';
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [booted, setBooted] = useState(false);
  const [library, setLibrary] = useState<Library | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [handle, setHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [connected, setConnected] = useState(false);
  const [demo, setDemo] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const supported = useMemo(() => filesystemSupported(), []);

  const [theme, setThemeState] = useState<ThemeMode>(() => {
    const stored = localStorage.getItem('msc.theme');
    return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
  });
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  );
  const resolvedTheme: 'light' | 'dark' =
    theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolvedTheme === 'dark');
  }, [resolvedTheme]);

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    query.addEventListener('change', handler);
    return () => query.removeEventListener('change', handler);
  }, []);

  const setTheme = useCallback((mode: ThemeMode) => {
    localStorage.setItem('msc.theme', mode);
    setThemeState(mode);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback((message: string, kind: Toast['kind'] = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, message, kind }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, 6000);
  }, []);

  const refresh = useCallback(async () => {
    const [libraryResponse, statsResponse, photoResponse] = await Promise.all([
      api.getLibrary(),
      api.getStats(),
      api.getPhotos(),
    ]);
    setLibrary(libraryResponse.library);
    setStats(statsResponse);
    setPhotos(photoResponse.photos);
  }, []);

  // Boot: reconnect a stored handle, or open the demo library when requested.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        if (demoRequested()) {
          const dir = await ensureDemoLibrary();
          if (cancelled) return;
          setHandle(dir);
          setDemo(true);
          setConnected(true);
          await api.connect(DEMO_FOLDER_NAME);
        } else {
          const saved = await loadHandle();
          if (saved && !cancelled) {
            setHandle(saved);
            setConnected((await permissionState(saved)) === 'granted');
          }
        }
      } catch (error) {
        if (!cancelled) toast(describe(error), 'error');
      }

      try {
        if (!cancelled) await refresh();
      } catch (error) {
        if (!cancelled) toast(`Could not load the library index: ${describe(error)}`, 'error');
      } finally {
        if (!cancelled) setBooted(true);
      }
    })();

    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, [refresh, toast]);

  const connect = useCallback(async () => {
    try {
      const dir = await pickDirectory();
      if (!dir) return;
      exitDemo();
      setDemo(false);
      await saveHandle(dir);
      await api.connect(dir.name);
      setHandle(dir);
      setConnected(true);
      await refresh();
      toast(`Connected “${dir.name}”. Run a scan to index it.`, 'success');
    } catch (error) {
      toast(describe(error), 'error');
    }
  }, [refresh, toast]);

  const reconnect = useCallback(async () => {
    if (!handle) return false;
    const granted = await requestPermission(handle);
    setConnected(granted);
    if (granted) {
      toast('Folder reconnected.', 'success');
    } else {
      toast('Permission was not granted. The index is still browsable.', 'error');
    }
    return granted;
  }, [handle, toast]);

  const startDemo = useCallback(async () => {
    try {
      const dir = await ensureDemoLibrary();
      setHandle(dir);
      setDemo(true);
      setConnected(true);
      await saveHandle(dir);
      await api.connect(DEMO_FOLDER_NAME);
      await refresh();
      const url = new URL(window.location.href);
      url.searchParams.set('demo', '1');
      window.history.replaceState({}, '', url);
      toast('Demo library ready. Nothing outside the app is touched.', 'success');
    } catch (error) {
      toast(describe(error), 'error');
    }
  }, [refresh, toast]);

  const scan = useCallback(async () => {
    if (!handle) {
      toast('Connect a folder first.', 'error');
      return;
    }
    if (!connected) {
      const granted = await reconnect();
      if (!granted) return;
    }
    if (scanning) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setScanning(true);
    setScanProgress({ done: 0, total: 0, name: 'Reading folder' });

    try {
      const summary = await scanFolder(handle, {
        signal: controller.signal,
        onProgress: setScanProgress,
      });
      await refresh();

      if (summary.aborted) {
        toast('Scan cancelled. Nothing was removed from the index.', 'info');
      } else {
        const notes = [`Indexed ${summary.scanned} photos`];
        if (summary.unsupported > 0) notes.push(`${summary.unsupported} unreadable`);
        if (summary.skipped > 0) notes.push(`${summary.skipped} skipped`);
        toast(`${notes.join(' · ')}.`, 'success');
      }
    } catch (error) {
      toast(`Scan failed: ${describe(error)}`, 'error');
    } finally {
      setScanning(false);
      setScanProgress(null);
      abortRef.current = null;
    }
  }, [connected, handle, reconnect, refresh, scanning, toast]);

  const cancelScan = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const forgetFolder = useCallback(async () => {
    try {
      await api.disconnect();
      await clearHandle();
      exitDemo();
    } catch (error) {
      toast(describe(error), 'error');
    } finally {
      setHandle(null);
      setConnected(false);
      setDemo(false);
      setLibrary(null);
      setStats(null);
      setPhotos([]);
      const url = new URL(window.location.href);
      url.searchParams.delete('demo');
      window.history.replaceState({}, '', url);
      toast('Folder forgotten. Your photos were not touched.', 'success');
    }
  }, [toast]);

  const clearIndex = useCallback(async () => {
    try {
      await api.clearActiveIndex();
      await refresh();
      toast('Index cleared. Recently Deleted is unchanged.', 'success');
    } catch (error) {
      toast(describe(error), 'error');
    }
  }, [refresh, toast]);

  const value = useMemo<AppContextValue>(
    () => ({
      booted,
      library,
      stats,
      photos,
      handle,
      connected,
      demo,
      supported,
      scanning,
      scanProgress,
      theme,
      resolvedTheme,
      toasts,
      setTheme,
      connect,
      reconnect,
      startDemo,
      refresh,
      scan,
      cancelScan,
      forgetFolder,
      clearIndex,
      toast,
      dismissToast,
    }),
    [
      booted,
      library,
      stats,
      photos,
      handle,
      connected,
      demo,
      supported,
      scanning,
      scanProgress,
      theme,
      resolvedTheme,
      toasts,
      setTheme,
      connect,
      reconnect,
      startDemo,
      refresh,
      scan,
      cancelScan,
      forgetFolder,
      clearIndex,
      toast,
      dismissToast,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used inside AppProvider');
  return context;
}
