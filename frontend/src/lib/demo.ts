import { writeBlob } from './fs';

/**
 * Demo library backed by the Origin Private File System.
 *
 * It is a real `FileSystemDirectoryHandle`, so the exact same scan, trash and
 * enhance code paths run against it. Open the app with `?demo=1` to use it.
 */

const DEMO_DIR = 'demo-library';
const MANIFEST = '.manifest';

interface SeedFile {
  path: string;
  seed: number;
  width: number;
  height: number;
  quality: number;
  blur?: boolean;
  png?: boolean;
}

const SEED_FILES: SeedFile[] = [
  { path: 'IMG_2001.jpg', seed: 11, width: 1600, height: 1200, quality: 0.92 },
  { path: 'IMG_2001~2.jpg', seed: 11, width: 1400, height: 1050, quality: 0.7 },
  { path: 'IMG_2001_blur.jpg', seed: 11, width: 1600, height: 1200, quality: 0.85, blur: true },
  { path: '2025/Trip/DSC_0101.jpg', seed: 23, width: 1600, height: 1200, quality: 0.9 },
  { path: '2025/Trip/DSC_0101 (1).jpg', seed: 23, width: 1600, height: 1200, quality: 0.58 },
  { path: '2025/Trip/DSC_0202.jpg', seed: 37, width: 1600, height: 1200, quality: 0.88, blur: true },
  { path: '2025/Family/IMG_3310.jpg', seed: 41, width: 1600, height: 1200, quality: 0.9 },
  { path: '2025/Family/IMG_3310 copy.jpg', seed: 41, width: 1500, height: 1125, quality: 0.64 },
  { path: '2025/Family/IMG_3311.jpg', seed: 47, width: 1600, height: 1200, quality: 0.87 },
  { path: 'screenshots/Screenshot 1.png', seed: 55, width: 1280, height: 800, quality: 1, png: true },
  { path: 'screenshots/Screenshot 2.png', seed: 58, width: 1280, height: 800, quality: 1, png: true },
  { path: 'wallpapers/gradient.jpg', seed: 63, width: 1920, height: 1080, quality: 0.93 },
  { path: 'notes/receipt.jpg', seed: 71, width: 1200, height: 1600, quality: 0.85, blur: true },
  { path: 'notes/whiteboard.jpg', seed: 74, width: 1600, height: 1200, quality: 0.82 },
];

function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function paintScene(seedFile: SeedFile): OffscreenCanvas {
  const { width, height, seed, blur } = seedFile;
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is unavailable.');

  const random = makeRandom(seed);
  const hue = Math.round(random() * 360);

  const sky = context.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, `hsl(${hue} 55% 18%)`);
  sky.addColorStop(0.55, `hsl(${(hue + 40) % 360} 70% 52%)`);
  sky.addColorStop(1, `hsl(${(hue + 90) % 360} 80% 68%)`);
  context.fillStyle = sky;
  context.fillRect(0, 0, width, height);

  if (blur) context.filter = `blur(${Math.max(3, Math.round(Math.min(width, height) / 140))}px)`;

  // Sun.
  context.beginPath();
  context.arc(width * (0.6 + random() * 0.25), height * (0.18 + random() * 0.18), Math.min(width, height) * 0.11, 0, Math.PI * 2);
  context.fillStyle = 'rgba(255, 245, 205, 0.92)';
  context.fill();

  // Layered ridges.
  for (let layer = 0; layer < 3; layer++) {
    context.beginPath();
    context.moveTo(0, height);
    const base = height * (0.52 + layer * 0.11);
    for (let x = 0; x <= width; x += width / 18) {
      context.lineTo(x, base - random() * height * 0.14);
    }
    context.lineTo(width, height);
    context.closePath();
    context.fillStyle = `hsl(${(hue + 200) % 360} ${18 + layer * 7}% ${16 + layer * 9}%)`;
    context.fill();
  }

  // Fine detail: these lines are what the blur score measures.
  context.lineWidth = Math.max(1, Math.round(height / 900));
  for (let i = 0; i < 520; i++) {
    const x = random() * width;
    const y = height * (0.55 + random() * 0.45);
    const length = height * (0.01 + random() * 0.05);
    context.strokeStyle = `hsla(${(hue + 120) % 360} 60% ${35 + random() * 40}% / ${0.35 + random() * 0.5})`;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + (random() - 0.5) * 8, y - length);
    context.stroke();
  }

  // Typography adds crisp edges to sharp copies.
  context.font = `${Math.round(height * 0.052)}px "Segoe UI", sans-serif`;
  context.fillStyle = 'rgba(255, 255, 255, 0.94)';
  context.fillText(`IMG ${1000 + (seed % 8000)}`, width * 0.05, height * 0.9);
  context.font = `${Math.round(height * 0.03)}px "Segoe UI", sans-serif`;
  context.fillStyle = 'rgba(15, 23, 42, 0.72)';
  context.fillText('Mobile Storage Cleaner demo library', width * 0.05, height * 0.955);

  context.filter = 'none';
  return canvas;
}

export async function ensureDemoLibrary(): Promise<FileSystemDirectoryHandle> {
  if (!('storage' in navigator) || typeof navigator.storage.getDirectory !== 'function') {
    throw new Error('This browser cannot create a demo library. Use Chrome or Edge.');
  }

  const opfs = await navigator.storage.getDirectory();
  const dir = await opfs.getDirectoryHandle(DEMO_DIR, { create: true });

  const seeded = await dir
    .getFileHandle(MANIFEST)
    .then(() => true)
    .catch(() => false);

  if (seeded) return dir;

  for (const file of SEED_FILES) {
    const canvas = paintScene(file);
    const blob = await canvas.convertToBlob(
      file.png ? { type: 'image/png' } : { type: 'image/jpeg', quality: file.quality },
    );
    const segments = file.path.split('/');
    const name = segments.pop()!;
    await writeBlob(dir, segments, name, blob);
  }

  await writeBlob(dir, [], MANIFEST, new Blob([new Date().toISOString()], { type: 'text/plain' }));
  return dir;
}

export function demoRequested(): boolean {
  const params = new URLSearchParams(window.location.search);
  if (params.get('demo') === '1') {
    localStorage.setItem('msc.demo', '1');
    return true;
  }
  if (params.get('demo') === '0') {
    localStorage.removeItem('msc.demo');
    return false;
  }
  return localStorage.getItem('msc.demo') === '1';
}

export function exitDemo(): void {
  localStorage.removeItem('msc.demo');
}

export const DEMO_FOLDER_NAME = 'Demo library (sample photos)';
