# Mobile Storage Cleaner (web)

A local-first web version of the Android **Mobile Storage Cleaner** app. Point it at a
photo folder, and it scores sharpness, groups look-alike copies, enhances soft shots, and
keeps ordinary deletes restorable in a **Recently Deleted** folder.

Nothing is uploaded. The browser reads the folder you choose through the File System Access
API, and a small API on `127.0.0.1` stores only metadata and 400 px thumbnails. There is no
account, no cloud service, no AI upscaler, and no API key anywhere in the project.

## What it does

- **Dashboard** — total size, photo counts, reclaimable space, per-type breakdown, last scan.
- **Blurry photos** — Laplacian-variance sharpness score per photo, sortable grid, adjustable
  cutoff, bulk move to trash.
- **Duplicates** — 256-bit difference hashes, grouped within a Hamming distance of 24 bits.
  The **BEST** copy is picked by largest file, then sharpness, then newest date, and is never
  preselected.
- **Enhance** — two local modes:
  - **Smart**: multi-scale unsharp masking inside a painted brush mask, with strength and a
    whole-photo option.
  - **Manual**: lighting, sharpness, contrast, clarity, saturation, hue, highlights and
    temperature sliders. The preview redraws **while you drag**, not only on release.
- **Recently deleted** — restore a file to its original path or delete it from disk for good.

Enhanced copies are written to `<your folder>/Mobile Storage Cleaner/`; the trash lives in
`<your folder>/Mobile Storage Cleaner/trash/`.

## Requirements

- **Node 22.13+** (Node 24 LTS recommended). The API uses Node's built-in `node:sqlite`, so
  there is no native build step.
- **Chrome or Edge** for the real folder picker. The demo library uses origin-private storage
  and also runs in other modern browsers.

## Run it

```bash
npm install
npm run dev
```

- Web app: <http://localhost:5173> (Vite moves to 5174 or the next free port if 5173 is taken;
  check the terminal output).
- Local API: <http://127.0.0.1:8787> — bound to loopback only, never exposed to the LAN.

On first load, choose **Open a folder**, or pick **explore the demo library** (also reachable
at `/?demo=1`). The demo seeds a real folder in origin-private storage with 14 generated
photos, so the full scan → group → enhance → trash pipeline works without touching your files.

### Production build

```bash
npm run build   # builds frontend/dist
npm start       # API also serves frontend/dist
```

Then open <http://127.0.0.1:8787>. The API falls back to a single-page-app handler, so deep
links such as `/duplicates` work.

### Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | API + Vite dev server together |
| `npm run build` | Production build of the web app into `frontend/dist` |
| `npm start` | Run the API and serve the built web app |
| `npm test` | 24 web tests (Vitest) + 6 grouping tests (`node:test`) |
| `npm run typecheck` | TypeScript for both workspaces |

## How the analysis works

| Step | Setting |
| --- | --- |
| Analysis decode | capped at 1200 px on the longest side |
| Blur score | variance of a Laplacian edge filter on a 300 px grayscale copy |
| Blur cutoff | below **100** is flagged soft (fixed, to match the Android app) |
| Fingerprint | 256-bit difference hash from a 17 × 16 grayscale image |
| Duplicate grouping | Hamming distance **≤ 24 bits**, compared in buckets |
| BEST copy | largest file → higher blur score → newer `dateTaken` |
| Thumbnail sent to the API | 400 px JPEG |

Scanning, blur scoring, hashing and enhancement all run in the browser tab. Pixel loops for
enhancement run in a module Worker so slider drags stay responsive. The API is responsible
for the index, duplicate grouping and serving thumbnails.

### Enhancement pipeline

- **Preview**: 480 px frames while a slider or the brush is active, then an 800 px refinement
  when the interaction ends.
- **Save**: up to 2880 px on the longest side, JPEG quality 0.94.
- Smart Enhance blends fine and wide unsharp-mask passes through the painted mask; it can
  recover detail that is present, but it cannot invent content.
- Manual Enhance follows the Android order: light, highlights, temperature, contrast, hue,
  saturation, then detail.
- The original file is never modified. **Save copy** writes a new `*_enhanced_*.jpg`, which is
  scanned into the index immediately.

## Deletion semantics

- Moving a photo to trash renames it into `Mobile Storage Cleaner/trash/` and marks its row
  as trashed. It disappears from the library and stats but stays in Recently Deleted.
- **Restore** puts the file back at its original relative path. If something newer already
  occupies that path, the restore fails for that file and the trash copy is kept.
- **Delete forever** removes the file from the trash folder on disk. There is no automatic
  expiry and no undo — this web port does not implement the Android 30-day purge, so files
  stay restorable until you delete them yourself.

## Limitations

- **HEIC/HEIF is not supported.** Browsers cannot decode it reliably, so those files are
  counted as unsupported during a scan instead of being indexed.
- **Folder permission is per session.** Chrome requires a user gesture to re-grant access
  after a reload; the app shows a banner with a **Reconnect folder** button. The index remains
  browsable in the meantime.
- Single local user, no authentication. Do not expose port 8787 to a network.
- The library index (SQLite + thumbnails) lives in `backend/data/` and is git-ignored. The photos
  themselves always stay in the folder you chose.

## Project layout

```text
frontend/           React 18 + Vite + Tailwind front end
  src/lib/          folder access, analysis, imaging math, worker, API client
  src/pages/        Dashboard, Blurry, Duplicates, Enhance, Trash, Settings
backend/            Fastify + node:sqlite index and static serving
  src/db.ts         schema and row mapping
  src/grouping.ts   dHash grouping and BEST selection
  src/server.ts     REST endpoints, thumbnails, SPA fallback
reference/flutter/  original Android sources, kept for behaviour comparison
```

The Android app under `reference/flutter/` is not part of the build; it is reference material
for the ported pixel math and UX. See `reference/README.md` for details.

## Resetting local state

- **Settings → Clear index** removes indexed photo rows and cached thumbnails; files are
  untouched, the folder stays connected, and Recently Deleted entries remain.
- **Settings → Forget folder** also drops the stored folder handle.
- To reset everything manually, stop the API and delete `backend/data/app.db*` and
  `backend/data/thumbs/`. The next scan rebuilds the index.
