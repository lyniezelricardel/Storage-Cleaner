import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';

import { db, THUMB_DIR, WEB_DIST, type PhotoRow } from './db.ts';
import {
  bestPhoto,
  groupDuplicates,
  savableSize,
  type HashablePhoto,
} from './grouping.ts';

const LIBRARY_ID = 'default';
const PORT = Number(process.env.PORT ?? 8787);

type IncomingPhoto = {
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
  /** data:image/jpeg;base64,... */
  thumb?: string | null;
};

const app = Fastify({
  bodyLimit: 96 * 1024 * 1024,
  logger: false,
});

// The UI is served from the same origin or proxied by Vite, so only local
// origins need cross-origin access. Everything else is rejected: this API is
// unauthenticated and must not be reachable from arbitrary websites.
await app.register(cors, {
  origin: [/^http:\/\/localhost(:\d+)?$/, /^http:\/\/127\.0\.0\.1(:\d+)?$/],
});

function thumbName(id: string): string {
  return `${id}.jpg`;
}

async function writeThumb(id: string, dataUrl: string | null | undefined): Promise<void> {
  if (!dataUrl) return;
  const comma = dataUrl.indexOf(',');
  if (comma < 0) return;
  const buffer = Buffer.from(dataUrl.slice(comma + 1), 'base64');
  if (buffer.byteLength === 0) return;
  await writeFile(path.join(THUMB_DIR, thumbName(id)), buffer);
}

async function removeThumb(id: string): Promise<void> {
  const file = path.join(THUMB_DIR, thumbName(id));
  if (!existsSync(file)) return;
  await unlink(file).catch(() => undefined);
}

function library() {
  return db.prepare(`SELECT * FROM libraries WHERE id = ?`).get(LIBRARY_ID) as
    | {
        id: string;
        folder_name: string;
        created_at: number;
        last_scan_at: number | null;
      }
    | undefined;
}

function requireLibrary() {
  const row = library();
  if (!row) {
    const error = new Error('No folder is connected yet.');
    (error as Error & { statusCode: number }).statusCode = 409;
    throw error;
  }
  return row;
}

function serialize(row: PhotoRow) {
  return {
    id: row.id,
    libraryId: row.library_id,
    relPath: row.rel_path,
    name: row.name,
    mime: row.mime,
    sizeBytes: row.size_bytes,
    width: row.width,
    height: row.height,
    dateTaken: row.date_taken,
    modifiedAt: row.modified_at,
    blurScore: row.blur_score,
    isBlurry: row.is_blurry === 1,
    dhash: row.dhash,
    status: row.status,
    trashedAt: row.trashed_at,
    trashName: row.trash_name,
    thumbUrl: `/thumbs/${thumbName(row.id)}`,
  };
}

function activePhotos(): PhotoRow[] {
  return db
    .prepare(
      `SELECT * FROM photos WHERE library_id = ? AND status = 'active' ORDER BY date_taken DESC`,
    )
    .all(LIBRARY_ID) as unknown as PhotoRow[];
}

function trashedPhotos(): PhotoRow[] {
  return db
    .prepare(
      `SELECT * FROM photos WHERE library_id = ? AND status = 'trashed' ORDER BY trashed_at DESC`,
    )
    .all(LIBRARY_ID) as unknown as PhotoRow[];
}

function duplicates(libraryPhotos = activePhotos()) {
  const hashable: HashablePhoto[] = libraryPhotos
    .filter((row) => row.dhash.length === 256)
    .map((row) => ({
      id: row.id,
      fileSize: row.size_bytes,
      blurScore: row.blur_score,
      dateTaken: row.date_taken,
      dhash: row.dhash,
    }));
  return groupDuplicates(hashable);
}

// ---------------------------------------------------------------- health

app.get('/api/health', async () => ({ ok: true, service: 'mobile-storage-cleaner-api' }));

// --------------------------------------------------------------- library

app.get('/api/library', async () => {
  const row = library();
  const counts = db
    .prepare(
      `SELECT
         SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
         SUM(CASE WHEN status = 'trashed' THEN 1 ELSE 0 END) AS trashed,
         SUM(CASE WHEN status = 'active' THEN size_bytes ELSE 0 END) AS active_bytes
       FROM photos WHERE library_id = ?`,
    )
    .get(LIBRARY_ID) as { active: number | null; trashed: number | null; active_bytes: number | null };

  return {
    library: row
      ? {
          id: row.id,
          folderName: row.folder_name,
          createdAt: row.created_at,
          lastScanAt: row.last_scan_at,
        }
      : null,
    counts: {
      photos: counts?.active ?? 0,
      trashed: counts?.trashed ?? 0,
      bytes: counts?.active_bytes ?? 0,
    },
  };
});

app.post<{ Body: { folderName?: string } }>('/api/library', async (request) => {
  const folderName = (request.body?.folderName ?? '').trim() || 'Selected folder';
  const existing = library();

  if (existing && existing.folder_name !== folderName) {
    // A different folder was connected: the old index no longer describes it.
    const rows = db.prepare(`SELECT id FROM photos WHERE library_id = ?`).all(LIBRARY_ID) as unknown as Array<{
      id: string;
    }>;
    await Promise.all(rows.map((row) => removeThumb(row.id)));
    db.prepare(`DELETE FROM photos WHERE library_id = ?`).run(LIBRARY_ID);
    db.prepare(`UPDATE libraries SET folder_name = ?, last_scan_at = NULL WHERE id = ?`).run(
      folderName,
      LIBRARY_ID,
    );
  } else if (!existing) {
    db.prepare(`INSERT INTO libraries (id, folder_name, created_at) VALUES (?, ?, ?)`).run(
      LIBRARY_ID,
      folderName,
      Date.now(),
    );
  }

  return { library: library() };
});

app.delete('/api/library', async () => {
  const rows = db.prepare(`SELECT id FROM photos WHERE library_id = ?`).all(LIBRARY_ID) as unknown as Array<{
    id: string;
  }>;
  await Promise.all(rows.map((row) => removeThumb(row.id)));
  db.prepare(`DELETE FROM photos WHERE library_id = ?`).run(LIBRARY_ID);
  db.prepare(`DELETE FROM libraries WHERE id = ?`).run(LIBRARY_ID);
  return { ok: true };
});

/**
 * Clears the scanned index but keeps the folder connected. Photos already in
 * Recently Deleted stay in the database: a rescan cannot rediscover them, so
 * dropping those rows would strand their files in the trash folder.
 */
app.post('/api/library/clear', async () => {
  requireLibrary();
  const rows = db
    .prepare(`SELECT id FROM photos WHERE library_id = ? AND status = 'active'`)
    .all(LIBRARY_ID) as unknown as Array<{ id: string }>;
  await Promise.all(rows.map((row) => removeThumb(row.id)));
  db.prepare(`DELETE FROM photos WHERE library_id = ? AND status = 'active'`).run(LIBRARY_ID);
  db.prepare(`UPDATE libraries SET last_scan_at = NULL WHERE id = ?`).run(LIBRARY_ID);
  return { ok: true };
});

// ----------------------------------------------------------------- scans

app.post('/api/scans', async () => {
  requireLibrary();
  return { scanId: randomUUID() };
});

app.post<{ Params: { scanId: string }; Body: { items?: IncomingPhoto[] } }>(
  '/api/scans/:scanId/photos',
  async (request) => {
    requireLibrary();
    const scanId = request.params.scanId;
    const items = request.body?.items ?? [];
    const now = Date.now();

    const findByPath = db.prepare(
      `SELECT id FROM photos WHERE library_id = ? AND rel_path = ?`,
    );
    const insert = db.prepare(
      `INSERT INTO photos (
         id, library_id, rel_path, name, mime, size_bytes, width, height,
         date_taken, modified_at, blur_score, is_blurry, dhash, status,
         trashed_at, trash_name, scan_id, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', NULL, NULL, ?, ?)`,
    );
    const update = db.prepare(
      `UPDATE photos SET
         name = ?, mime = ?, size_bytes = ?, width = ?, height = ?, date_taken = ?,
         modified_at = ?, blur_score = ?, is_blurry = ?, dhash = ?, scan_id = ?,
         status = 'active', trashed_at = NULL, trash_name = NULL
       WHERE id = ?`,
    );

    let accepted = 0;
    const ids: string[] = [];

    for (const item of items) {
      if (!item?.relPath || !item?.name) continue;
      const existing = findByPath.get(LIBRARY_ID, item.relPath) as { id: string } | undefined;
      const id = existing?.id ?? randomUUID();
      const blurry = item.isBlurry ? 1 : 0;

      if (existing) {
        update.run(
          item.name,
          item.mime || 'image/jpeg',
          Math.round(item.sizeBytes),
          Math.round(item.width),
          Math.round(item.height),
          Math.round(item.dateTaken),
          Math.round(item.modifiedAt || item.dateTaken),
          Number(item.blurScore) || 0,
          blurry,
          item.dhash ?? '',
          scanId,
          id,
        );
      } else {
        insert.run(
          id,
          LIBRARY_ID,
          item.relPath,
          item.name,
          item.mime || 'image/jpeg',
          Math.round(item.sizeBytes),
          Math.round(item.width),
          Math.round(item.height),
          Math.round(item.dateTaken),
          Math.round(item.modifiedAt || item.dateTaken),
          Number(item.blurScore) || 0,
          blurry,
          item.dhash ?? '',
          scanId,
          now,
        );
      }

      await writeThumb(id, item.thumb);
      ids.push(id);
      accepted++;
    }

    return { accepted, ids };
  },
);

app.post<{ Params: { scanId: string } }>('/api/scans/:scanId/complete', async (request) => {
  requireLibrary();
  const scanId = request.params.scanId;

  const stale = db
    .prepare(
      `SELECT id FROM photos WHERE library_id = ? AND status = 'active' AND (scan_id IS NULL OR scan_id != ?)`,
    )
    .all(LIBRARY_ID, scanId) as unknown as Array<{ id: string }>;

  await Promise.all(stale.map((row) => removeThumb(row.id)));
  db.prepare(
    `DELETE FROM photos WHERE library_id = ? AND status = 'active' AND (scan_id IS NULL OR scan_id != ?)`,
  ).run(LIBRARY_ID, scanId);
  db.prepare(`UPDATE libraries SET last_scan_at = ? WHERE id = ?`).run(Date.now(), LIBRARY_ID);

  const remaining = db
    .prepare(`SELECT COUNT(*) AS count FROM photos WHERE library_id = ? AND status = 'active'`)
    .get(LIBRARY_ID) as { count: number };

  return { removed: stale.length, total: remaining.count };
});

// ---------------------------------------------------------------- photos

app.get<{ Querystring: { status?: string } }>('/api/photos', async (request) => {
  const status = request.query.status;
  if (status === 'trashed') return { photos: trashedPhotos().map(serialize) };
  const rows = activePhotos();
  return { photos: rows.map(serialize) };
});

app.post<{ Body: IncomingPhoto }>('/api/photos', async (request) => {
  requireLibrary();
  const item = request.body;
  if (!item?.relPath) {
    const error = new Error('relPath is required');
    (error as Error & { statusCode: number }).statusCode = 400;
    throw error;
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO photos (
       id, library_id, rel_path, name, mime, size_bytes, width, height,
       date_taken, modified_at, blur_score, is_blurry, dhash, status,
       trashed_at, trash_name, scan_id, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', NULL, NULL, 'manual', ?)
     ON CONFLICT(library_id, rel_path) DO UPDATE SET
       name = excluded.name, mime = excluded.mime, size_bytes = excluded.size_bytes,
       width = excluded.width, height = excluded.height, date_taken = excluded.date_taken,
       modified_at = excluded.modified_at, blur_score = excluded.blur_score,
       is_blurry = excluded.is_blurry, dhash = excluded.dhash,
       status = 'active', trashed_at = NULL, trash_name = NULL`,
  ).run(
    id,
    LIBRARY_ID,
    item.relPath,
    item.name,
    item.mime || 'image/jpeg',
    Math.round(item.sizeBytes),
    Math.round(item.width),
    Math.round(item.height),
    Math.round(item.dateTaken),
    Math.round(item.modifiedAt || item.dateTaken),
    Number(item.blurScore) || 0,
    item.isBlurry ? 1 : 0,
    item.dhash ?? '',
    Date.now(),
  );

  const row = db
    .prepare(`SELECT * FROM photos WHERE library_id = ? AND rel_path = ?`)
    .get(LIBRARY_ID, item.relPath) as unknown as PhotoRow;

  await writeThumb(row.id, item.thumb);
  return { photo: serialize(row) };
});

app.patch<{
  Params: { id: string };
  Body: { status?: 'active' | 'trashed'; trashName?: string | null };
}>('/api/photos/:id', async (request) => {
  const { id } = request.params;
  const status = request.body?.status;
  if (status === 'trashed') {
    db.prepare(`UPDATE photos SET status = 'trashed', trashed_at = ?, trash_name = ? WHERE id = ?`).run(
      Date.now(),
      request.body?.trashName ?? null,
      id,
    );
  } else if (status === 'active') {
    db.prepare(`UPDATE photos SET status = 'active', trashed_at = NULL, trash_name = NULL WHERE id = ?`).run(
      id,
    );
  }
  return { ok: true };
});

app.delete<{ Params: { id: string } }>('/api/photos/:id', async (request) => {
  const { id } = request.params;
  db.prepare(`DELETE FROM photos WHERE id = ?`).run(id);
  await removeThumb(id);
  return { ok: true };
});

// ------------------------------------------------------------------ stats

app.get('/api/stats', async () => {
  const rows = activePhotos();
  const trashed = trashedPhotos();
  const groups = duplicates(rows);

  const byExt = new Map<string, { count: number; bytes: number }>();
  for (const row of rows) {
    const ext = (row.name.split('.').pop() ?? 'other').toUpperCase();
    const entry = byExt.get(ext) ?? { count: 0, bytes: 0 };
    entry.count++;
    entry.bytes += row.size_bytes;
    byExt.set(ext, entry);
  }

  const blurry = rows.filter((row) => row.is_blurry === 1);
  const duplicatePhotos = new Set(groups.flatMap((group) => group.photoIds));
  const duplicateBytes = rows
    .filter((row) => duplicatePhotos.has(row.id))
    .reduce((sum, row) => sum + row.size_bytes, 0);

  return {
    totalPhotos: rows.length,
    totalBytes: rows.reduce((sum, row) => sum + row.size_bytes, 0),
    blurryCount: blurry.length,
    blurryBytes: blurry.reduce((sum, row) => sum + row.size_bytes, 0),
    duplicateGroups: groups.length,
    duplicateCount: duplicatePhotos.size,
    duplicateSavable: groups.reduce((sum, group) => sum + group.savableSize, 0),
    duplicateGroupBytes: duplicateBytes,
    trashedCount: trashed.length,
    trashedBytes: trashed.reduce((sum, row) => sum + row.size_bytes, 0),
    byExt: [...byExt.entries()]
      .map(([ext, value]) => ({ ext, ...value }))
      .sort((a, b) => b.bytes - a.bytes),
    lastScanAt: library()?.last_scan_at ?? null,
  };
});

app.get('/api/duplicates', async () => {
  const rows = activePhotos();
  const byId = new Map(rows.map((row) => [row.id, row]));
  const groups = duplicates(rows);

  return {
    groups: groups.map((group) => {
      const photos = group.photoIds.map((id) => byId.get(id)!).filter(Boolean);
      return {
        ...group,
        bestId: bestPhoto(
          photos.map((row) => ({
            id: row.id,
            fileSize: row.size_bytes,
            blurScore: row.blur_score,
            dateTaken: row.date_taken,
            dhash: row.dhash,
          })),
        ).id,
        savableSize: savableSize(
          photos.map((row) => ({
            id: row.id,
            fileSize: row.size_bytes,
            blurScore: row.blur_score,
            dateTaken: row.date_taken,
            dhash: row.dhash,
          })),
        ),
        photos: photos.map(serialize),
      };
    }),
  };
});

// --------------------------------------------------------------- settings

app.get('/api/settings', async () => {
  const rows = db.prepare(`SELECT key, value FROM settings`).all() as unknown as Array<{
    key: string;
    value: string;
  }>;
  return { settings: Object.fromEntries(rows.map((row) => [row.key, row.value])) };
});

app.put<{ Body: { key?: string; value?: string } }>('/api/settings', async (request) => {
  const key = request.body?.key;
  if (!key) {
    const error = new Error('key is required');
    (error as Error & { statusCode: number }).statusCode = 400;
    throw error;
  }
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, String(request.body?.value ?? ''));
  return { ok: true };
});

// -------------------------------------------------------------- static

await app.register(fastifyStatic, {
  root: THUMB_DIR,
  prefix: '/thumbs/',
  maxAge: '1h',
});

if (existsSync(WEB_DIST)) {
  await app.register(fastifyStatic, {
    root: WEB_DIST,
    prefix: '/',
    decorateReply: false,
  });

  app.setNotFoundHandler(async (request, reply) => {
    if (request.url.startsWith('/api/') || request.url.startsWith('/thumbs/')) {
      return reply.code(404).send({ error: 'Not found' });
    }
    return reply.type('text/html').sendFile('index.html');
  });
}

app.setErrorHandler((error, _request, reply) => {
  const failure = error as Error & { statusCode?: number };
  const status = failure.statusCode ?? 500;
  if (status >= 500) console.error(failure);
  return reply.code(status).send({ error: failure.message });
});

await app.listen({ port: PORT, host: '127.0.0.1' });
console.log(`API listening on http://127.0.0.1:${PORT}`);
if (!existsSync(WEB_DIST)) {
  console.log('web/dist not built yet - run `npm run dev` and use the Vite server on 5173');
}
