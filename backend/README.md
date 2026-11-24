# Mobile Storage Cleaner — Backend (Fastify API)

Local-only API that indexes photo metadata, groups duplicates, and serves cached
thumbnails. It never receives original photo files.

## Requirements
- Node 22.13+ (Node 24 LTS recommended). Uses Node's built-in `node:sqlite`, so
  there is no native build step.

## Run
From the project root:

```bash
npm --workspace backend run dev      # http://127.0.0.1:8787 (watch mode)
npm --workspace backend run start    # http://127.0.0.1:8787
npm --workspace backend run typecheck
npm --workspace backend run test     # grouping tests (node:test)
```

Or run everything at once from the root with `npm run dev`.

## Environment
No `.env` is required. Optional overrides:
- `PORT` (default `8787`) — the port to listen on.
- `VITE_API_URL` is a frontend concern; the API always binds to `127.0.0.1`.

The API binds to `127.0.0.1` only and is never exposed to the LAN.

## Data
- SQLite index: `backend/data/app.db` (git-ignored).
- Cached thumbnails: `backend/data/thumbs/` (git-ignored).
- Built frontend served from `backend/../frontend/dist` when present.

To reset everything: stop the API, then delete `backend/data/app.db*` and
`backend/data/thumbs/`. The next scan rebuilds the index.

## Endpoints
Health: `GET /api/health`
Library: `GET /api/library`, `POST /api/library`, `DELETE /api/library`,
`POST /api/library/clear`
Scans: `POST /api/scans`, `POST /api/scans/:scanId/photos`,
`POST /api/scans/:scanId/complete`
Photos: `GET /api/photos`, `POST /api/photos`, `PUT /api/photos/:id`,
`DELETE /api/photos/:id`
Stats: `GET /api/stats`
Duplicates: `GET /api/duplicates`
Settings: `GET /api/settings`, `PUT /api/settings`
Thumbnails: `GET /thumbs/:id.jpg` (static)

## Layout
- `src/db.ts` — schema, row mapping, data paths.
- `src/grouping.ts` — dHash grouping and BEST selection.
- `src/server.ts` — REST routes, static serving, SPA fallback.
- `src/grouping.test.ts` — grouping tests.
