# Mobile Storage Cleaner — Frontend (React + Vite)

React 18 + Vite + Tailwind UI. All analysis (blur score, dHash, enhancement) runs
in the browser; the backend only stores metadata and thumbnails.

## Requirements
- Node 22.13+ (Node 24 LTS recommended).

## Run
From the project root:

```bash
npm --workspace frontend run dev         # http://localhost:5173 (or next free port)
npm --workspace frontend run build       # production build into frontend/dist
npm --workspace frontend run preview     # preview the production build
npm --workspace frontend run typecheck
npm --workspace frontend run test        # Vitest
```

Or run everything at once from the root with `npm run dev`.

## Environment
Copy `.env.example` to `.env` if you need to override the API URL:

```
VITE_API_URL=http://localhost:8787/api
```

Set `VITE_MOCK=1` to run the UI standalone against sample data (no backend).

## Layout
- `src/lib/` — folder access (File System Access API), analysis, imaging math,
  worker, API client.
- `src/pages/` — Dashboard, Blurry, Duplicates, Enhance, Trash, Settings.
- `src/components/` — shared UI kit and icons.
- `src/context/` — app state (library, scan, theme, toasts).
- `public/favicon.svg` — app icon.
