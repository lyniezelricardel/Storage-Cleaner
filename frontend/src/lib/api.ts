export interface Library {
  id: string;
  folderName: string;
  createdAt: number;
  lastScanAt: number | null;
}

export interface Photo {
  id: string;
  libraryId: string;
  relPath: string;
  name: string;
  mime: string;
  sizeBytes: number;
  width: number;
  height: number;
  dateTaken: number;
  modifiedAt: number;
  blurScore: number;
  isBlurry: boolean;
  dhash: string;
  status: 'active' | 'trashed';
  trashedAt: number | null;
  trashName: string | null;
  thumbUrl: string;
}

export interface Stats {
  totalPhotos: number;
  totalBytes: number;
  blurryCount: number;
  blurryBytes: number;
  duplicateGroups: number;
  duplicateCount: number;
  duplicateSavable: number;
  duplicateGroupBytes: number;
  trashedCount: number;
  trashedBytes: number;
  byExt: Array<{ ext: string; count: number; bytes: number }>;
  lastScanAt: number | null;
}

export interface DuplicateGroup {
  groupId: string;
  photoIds: string[];
  bestId: string;
  isExact: boolean;
  similarity: number;
  totalSize: number;
  savableSize: number;
  photos: Photo[];
}

export interface ScanItem {
  relPath: string;
  name: string;
  mime: string;
  sizeBytes: number;
  width: number;
  height: number;
  dateTaken: number;
  modifiedAt: number;
  blurScore: number;
  isBlurry: boolean;
  dhash: string;
  thumb: string | null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      // keep the status message
    }
    throw new Error(message);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  health: () => request<{ ok: boolean }>('/api/health'),

  getLibrary: () =>
    request<{ library: Library | null; counts: { photos: number; trashed: number; bytes: number } }>(
      '/api/library',
    ),

  connect: (folderName: string) =>
    request<{ library: Library }>('/api/library', {
      method: 'POST',
      body: JSON.stringify({ folderName }),
    }),

  disconnect: () => request<{ ok: boolean }>('/api/library', { method: 'DELETE' }),

  clearActiveIndex: () => request<{ ok: boolean }>('/api/library/clear', { method: 'POST' }),

  startScan: () => request<{ scanId: string }>('/api/scans', { method: 'POST' }),

  uploadBatch: (scanId: string, items: ScanItem[]) =>
    request<{ accepted: number; ids: string[] }>(`/api/scans/${scanId}/photos`, {
      method: 'POST',
      body: JSON.stringify({ items }),
    }),

  completeScan: (scanId: string) =>
    request<{ removed: number; total: number }>(`/api/scans/${scanId}/complete`, {
      method: 'POST',
    }),

  getPhotos: () => request<{ photos: Photo[] }>('/api/photos'),

  getTrashed: () => request<{ photos: Photo[] }>('/api/photos?status=trashed'),

  addPhoto: (item: ScanItem) =>
    request<{ photo: Photo }>('/api/photos', { method: 'POST', body: JSON.stringify(item) }),

  getStats: () => request<Stats>('/api/stats'),

  getDuplicates: () => request<{ groups: DuplicateGroup[] }>('/api/duplicates'),

  setPhotoStatus: (id: string, status: 'active' | 'trashed', trashName?: string | null) =>
    request<{ ok: boolean }>(`/api/photos/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status, trashName }),
    }),

  deletePhoto: (id: string) => request<{ ok: boolean }>(`/api/photos/${id}`, { method: 'DELETE' }),

  getSettings: () => request<{ settings: Record<string, string> }>('/api/settings'),

  putSetting: (key: string, value: string) =>
    request<{ ok: boolean }>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify({ key, value }),
    }),
};
