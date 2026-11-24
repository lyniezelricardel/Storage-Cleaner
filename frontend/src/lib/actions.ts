import { api, type Photo } from './api';
import { analyzeImage } from './analysis';
import {
  OUTPUT_FOLDER,
  TRASH_FOLDER,
  deleteFile,
  deleteTrashEntry,
  fileExists,
  readFile,
  splitPath,
  uniqueName,
  writeBlob,
} from './fs';

export interface BatchResult {
  completed: number;
  failed: Array<{ name: string; reason: string }>;
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

/** Ordinary delete: copy into the app's trash folder, then remove the original. */
export async function moveToTrash(
  root: FileSystemDirectoryHandle,
  photos: Photo[],
): Promise<BatchResult> {
  const result: BatchResult = { completed: 0, failed: [] };

  for (const photo of photos) {
    let trashName: string | null = null;
    try {
      const file = await readFile(root, photo.relPath);
      trashName = uniqueName(photo.name, photo.id);
      await writeBlob(root, [OUTPUT_FOLDER, TRASH_FOLDER], trashName, file);
      await deleteFile(root, photo.relPath);
      await api.setPhotoStatus(photo.id, 'trashed', trashName);
      result.completed++;
    } catch (error) {
      // Put the file back if the index update failed, so the two never diverge.
      if (trashName) {
        try {
          const { segments, name } = splitPath(photo.relPath);
          const trashDir = await root.getDirectoryHandle(OUTPUT_FOLDER).then((dir) =>
            dir.getDirectoryHandle(TRASH_FOLDER),
          );
          const handle = await trashDir.getFileHandle(trashName);
          const blob = await handle.getFile();
          await writeBlob(root, segments, name, blob);
          await deleteTrashEntry(root, trashName);
        } catch {
          // Leave the copy in the trash folder; the user can restore manually.
        }
      }
      result.failed.push({ name: photo.name, reason: reason(error) });
    }
  }

  return result;
}

export async function restoreFromTrash(
  root: FileSystemDirectoryHandle,
  photos: Photo[],
): Promise<BatchResult> {
  const result: BatchResult = { completed: 0, failed: [] };

  for (const photo of photos) {
    const trashName = photo.trashName;
    if (!trashName) {
      result.failed.push({ name: photo.name, reason: 'Missing trash record' });
      continue;
    }

    try {
      const trashDir = await root.getDirectoryHandle(OUTPUT_FOLDER).then((dir) =>
        dir.getDirectoryHandle(TRASH_FOLDER),
      );
      const handle = await trashDir.getFileHandle(trashName);
      const file = await handle.getFile();
      const { segments, name } = splitPath(photo.relPath);

      if (await fileExists(root, photo.relPath)) {
        throw new Error(`A file already exists at ${photo.relPath}`);
      }

      await writeBlob(root, segments, name, file);
      await deleteTrashEntry(root, trashName);
      await api.setPhotoStatus(photo.id, 'active');
      result.completed++;
    } catch (error) {
      result.failed.push({ name: photo.name, reason: reason(error) });
    }
  }

  return result;
}

/** Only the Recently Deleted screen can call this. */
export async function deleteForever(
  root: FileSystemDirectoryHandle,
  photos: Photo[],
): Promise<BatchResult> {
  const result: BatchResult = { completed: 0, failed: [] };

  for (const photo of photos) {
    try {
      if (photo.trashName) {
        await deleteTrashEntry(root, photo.trashName).catch(() => undefined);
      }
      await api.deletePhoto(photo.id);
      result.completed++;
    } catch (error) {
      result.failed.push({ name: photo.name, reason: reason(error) });
    }
  }

  return result;
}

export interface SavedCopy {
  name: string;
  relPath: string;
}

/** Writes an enhanced JPEG next to the library, in `Mobile Storage Cleaner/`. */
export async function saveEnhancedCopy(
  root: FileSystemDirectoryHandle,
  blob: Blob,
  originalName: string,
): Promise<SavedCopy> {
  const base = originalName.replace(/\.[^.]+$/, '');
  const stamp = Date.now();
  const name = `${base}_enhanced_${stamp}.jpg`;
  const relPath = `${OUTPUT_FOLDER}/${name}`;

  await writeBlob(root, [OUTPUT_FOLDER], name, blob);

  const analysis = await analyzeImage(blob);
  await api.addPhoto({
    relPath,
    name,
    mime: 'image/jpeg',
    sizeBytes: blob.size,
    width: analysis.width,
    height: analysis.height,
    dateTaken: stamp,
    modifiedAt: stamp,
    blurScore: analysis.blurScore,
    isBlurry: analysis.isBlurry,
    dhash: analysis.dhash,
    thumb: analysis.thumb,
  });

  return { name, relPath };
}
