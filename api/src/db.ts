import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const here = path.dirname(fileURLToPath(import.meta.url));

export const DATA_DIR = path.resolve(here, '..', 'data');
export const THUMB_DIR = path.join(DATA_DIR, 'thumbs');
export const WEB_DIST = path.resolve(here, '..', '..', 'web', 'dist');

mkdirSync(THUMB_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, 'app.db'));

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS libraries (
    id           TEXT PRIMARY KEY,
    folder_name  TEXT NOT NULL,
    created_at   INTEGER NOT NULL,
    last_scan_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS photos (
    id          TEXT PRIMARY KEY,
    library_id  TEXT NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
    rel_path    TEXT NOT NULL,
    name        TEXT NOT NULL,
    mime        TEXT NOT NULL,
    size_bytes  INTEGER NOT NULL,
    width       INTEGER NOT NULL,
    height      INTEGER NOT NULL,
    date_taken  INTEGER NOT NULL,
    modified_at INTEGER NOT NULL,
    blur_score  REAL NOT NULL DEFAULT 0,
    is_blurry   INTEGER NOT NULL DEFAULT 0,
    dhash       TEXT NOT NULL DEFAULT '',
    status      TEXT NOT NULL DEFAULT 'active',
    trashed_at  INTEGER,
    trash_name  TEXT,
    scan_id     TEXT,
    created_at  INTEGER NOT NULL,
    UNIQUE(library_id, rel_path)
  );

  CREATE INDEX IF NOT EXISTS photos_by_library ON photos(library_id, status);
  CREATE INDEX IF NOT EXISTS photos_by_path ON photos(library_id, rel_path);

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

export interface PhotoRow {
  id: string;
  library_id: string;
  rel_path: string;
  name: string;
  mime: string;
  size_bytes: number;
  width: number;
  height: number;
  date_taken: number;
  modified_at: number;
  blur_score: number;
  is_blurry: number;
  dhash: string;
  status: 'active' | 'trashed';
  trashed_at: number | null;
  trash_name: string | null;
  scan_id: string | null;
  created_at: number;
}
