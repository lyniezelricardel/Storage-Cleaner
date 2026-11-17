/**
 * Everything that touches the user's filesystem.
 *
 * The app only ever holds a `FileSystemDirectoryHandle`; it is persisted in
 * IndexedDB so a reload can reconnect without re-picking the folder. Originals
 * are read and moved, never uploaded to the server.
 */

export const OUTPUT_FOLDER = 'Mobile Storage Cleaner';
export const TRASH_FOLDER = 'trash';

const DB_NAME = 'msc-web';
const STORE_NAME = 'handles';
const HANDLE_KEY = 'library-handle';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB unavailable'));
  });
}

export async function saveHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(handle, HANDLE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Could not save folder handle'));
  });
  db.close();
}

export async function loadHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openDb();
    const value = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).get(HANDLE_KEY);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return (value as FileSystemDirectoryHandle) ?? null;
  } catch {
    return null;
  }
}

export async function clearHandle(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(HANDLE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    db.close();
  } catch {
    // Nothing to clear.
  }
}

export function filesystemSupported(): boolean {
  return typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function';
}

export async function pickDirectory(): Promise<FileSystemDirectoryHandle | null> {
  const picker = (
    window as unknown as {
      showDirectoryPicker?: (options?: {
        id?: string;
        mode?: 'read' | 'readwrite';
        startIn?: string;
      }) => Promise<FileSystemDirectoryHandle>;
    }
  ).showDirectoryPicker;

  if (!picker) {
    throw new Error(
      'This browser cannot open folders. Use Chrome or Edge for the full experience.',
    );
  }

  try {
    return await picker({ id: 'msc-library', mode: 'readwrite' });
  } catch (error) {
    if ((error as DOMException)?.name === 'AbortError') return null;
    throw error;
  }
}

type PermissionCapable = FileSystemHandle & {
  queryPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>;
  requestPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>;
};

export async function permissionState(
  handle: FileSystemHandle,
  mode: 'read' | 'readwrite' = 'readwrite',
): Promise<PermissionState> {
  const capable = handle as PermissionCapable;
  if (typeof capable.queryPermission !== 'function') return 'granted';
  try {
    return await capable.queryPermission({ mode });
  } catch {
    return 'prompt';
  }
}

export async function requestPermission(
  handle: FileSystemHandle,
  mode: 'read' | 'readwrite' = 'readwrite',
): Promise<boolean> {
  const capable = handle as PermissionCapable;
  if (typeof capable.requestPermission !== 'function') return true;
  try {
    return (await capable.requestPermission({ mode })) === 'granted';
  } catch {
    return false;
  }
}

// ------------------------------------------------------------------ walking

const IMAGE_RE = /\.(jpe?g|png|webp|gif|bmp|avif)$/i;

const SKIPPED_DIRS = new Set([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  '$recycle.bin',
  'system volume information',
  'lost+found',
  '.cache',
  '.thumbnails',
  '.trash',
]);

/** Enhanced copies are indexed, but the app's own trash must never be. */
const TRASH_PATH = `${OUTPUT_FOLDER}/${TRASH_FOLDER}`.toLowerCase();

export interface ImageEntry {
  relPath: string;
  name: string;
  handle: FileSystemFileHandle;
  dir: FileSystemDirectoryHandle;
}

async function* entries(
  dir: FileSystemDirectoryHandle,
): AsyncGenerator<[string, FileSystemHandle]> {
  const iterator = (
    dir as unknown as { entries: () => AsyncIterableIterator<[string, FileSystemHandle]> }
  ).entries();
  for await (const entry of iterator) yield entry;
}

export async function collectImages(
  root: FileSystemDirectoryHandle,
  signal?: AbortSignal,
): Promise<ImageEntry[]> {
  const found: ImageEntry[] = [];

  async function walk(dir: FileSystemDirectoryHandle, prefix: string, depth: number): Promise<void> {
    if (depth > 12) return;
    for await (const [name, handle] of entries(dir)) {
      signal?.throwIfAborted();
      if (name.startsWith('.')) continue;

      if (handle.kind === 'directory') {
        if (SKIPPED_DIRS.has(name.toLowerCase())) continue;
        const childPrefix = prefix ? `${prefix}/${name}` : name;
        if (childPrefix.toLowerCase() === TRASH_PATH) continue;
        await walk(handle as FileSystemDirectoryHandle, childPrefix, depth + 1);
      } else if (IMAGE_RE.test(name)) {
        found.push({
          relPath: prefix ? `${prefix}/${name}` : name,
          name,
          handle: handle as FileSystemFileHandle,
          dir,
        });
      }
    }
  }

  await walk(root, '', 0);
  return found;
}

// ---------------------------------------------------------------- file ops

export async function resolveDir(
  root: FileSystemDirectoryHandle,
  segments: string[],
  create = false,
): Promise<FileSystemDirectoryHandle> {
  let dir = root;
  for (const segment of segments) {
    dir = await dir.getDirectoryHandle(segment, { create });
  }
  return dir;
}

export async function writeBlob(
  root: FileSystemDirectoryHandle,
  segments: string[],
  name: string,
  blob: Blob,
): Promise<FileSystemFileHandle> {
  const dir = await resolveDir(root, segments, true);
  const handle = await dir.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
  return handle;
}

export async function readFile(
  root: FileSystemDirectoryHandle,
  relPath: string,
): Promise<File> {
  const segments = relPath.split('/');
  const name = segments.pop();
  if (!name) throw new Error('Invalid path');
  const dir = await resolveDir(root, segments);
  const handle = await dir.getFileHandle(name);
  return handle.getFile();
}

/** True when a file already occupies this relative path inside the folder. */
export async function fileExists(
  root: FileSystemDirectoryHandle,
  relPath: string,
): Promise<boolean> {
  const segments = relPath.split('/');
  const name = segments.pop();
  if (!name) return false;
  try {
    const dir = await resolveDir(root, segments);
    await dir.getFileHandle(name);
    return true;
  } catch {
    return false;
  }
}

export async function deleteFile(
  root: FileSystemDirectoryHandle,
  relPath: string,
): Promise<void> {
  const segments = relPath.split('/');
  const name = segments.pop();
  if (!name) throw new Error('Invalid path');
  const dir = await resolveDir(root, segments);
  await dir.removeEntry(name);
}

export async function deleteTrashEntry(
  root: FileSystemDirectoryHandle,
  trashName: string,
): Promise<void> {
  const dir = await resolveDir(root, [OUTPUT_FOLDER, TRASH_FOLDER]);
  await dir.removeEntry(trashName);
}

export function splitPath(relPath: string): { segments: string[]; name: string } {
  const parts = relPath.split('/');
  const name = parts.pop() ?? relPath;
  return { segments: parts, name };
}

export function uniqueName(original: string, id: string): string {
  return `${id}__${original}`;
}
