/**
 * Duplicate grouping, ported from the Android app's
 * `lib/services/duplicate_detector.dart` so both versions agree on which photos
 * are grouped and which copy is kept.
 *
 * Hashes are 256-bit dHash strings. Instead of comparing every pair, each hash
 * is split into `threshold + 1` chunks. By the pigeonhole principle, two hashes
 * within the Hamming threshold must share at least one identical chunk, so only
 * photos sharing a bucket need a full comparison.
 */

export const HASH_LENGTH = 256;
export const SIMILARITY_THRESHOLD = 24;

export interface HashablePhoto {
  id: string;
  fileSize: number;
  blurScore: number;
  dateTaken: number;
  dhash: string;
}

export interface DuplicateGroupResult {
  groupId: string;
  photoIds: string[];
  bestId: string;
  isExact: boolean;
  similarity: number;
  totalSize: number;
  savableSize: number;
}

/** Hamming distance, or null as soon as it exceeds the threshold. */
export function distanceWithin(
  a: string,
  b: string,
  threshold = SIMILARITY_THRESHOLD,
): number | null {
  if (a.length !== b.length) return null;
  let distance = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      distance++;
      if (distance > threshold) return null;
    }
  }
  return distance;
}

/** Same rule as the app: largest file, then sharper, then newer. */
export function isBetter(candidate: HashablePhoto, current: HashablePhoto): boolean {
  if (candidate.fileSize !== current.fileSize) return candidate.fileSize > current.fileSize;
  if (candidate.blurScore !== current.blurScore) return candidate.blurScore > current.blurScore;
  return candidate.dateTaken > current.dateTaken;
}

export function bestPhoto<T extends HashablePhoto>(photos: T[]): T {
  return photos.reduce((best, candidate) => (isBetter(candidate, best) ? candidate : best));
}

export function savableSize<T extends HashablePhoto>(photos: T[]): number {
  if (photos.length <= 1) return 0;
  const best = bestPhoto(photos);
  return photos
    .filter((photo) => photo.id !== best.id)
    .reduce((sum, photo) => sum + photo.fileSize, 0);
}

export function groupDuplicates<T extends HashablePhoto>(photos: T[]): DuplicateGroupResult[] {
  const usable = photos.filter((photo) => photo.dhash.length === HASH_LENGTH);
  if (usable.length < 2) return [];

  const chunkCount = SIMILARITY_THRESHOLD + 1;
  const baseLength = Math.floor(HASH_LENGTH / chunkCount);
  const remainder = HASH_LENGTH % chunkCount;

  const chunkRanges: Array<[number, number]> = [];
  let cursor = 0;
  for (let chunk = 0; chunk < chunkCount; chunk++) {
    const length = baseLength + (chunk < remainder ? 1 : 0);
    chunkRanges.push([cursor, cursor + length]);
    cursor += length;
  }

  const buckets = new Map<string, number[]>();
  for (let i = 0; i < usable.length; i++) {
    const hash = usable[i].dhash;
    for (const [start, end] of chunkRanges) {
      const key = `${start}:${hash.slice(start, end)}`;
      const list = buckets.get(key);
      if (list) list.push(i);
      else buckets.set(key, [i]);
    }
  }

  const groups: DuplicateGroupResult[] = [];
  const assigned = new Set<string>();

  for (let i = 0; i < usable.length; i++) {
    const photoA = usable[i];
    if (assigned.has(photoA.id)) continue;

    const groupPhotos = [photoA];
    assigned.add(photoA.id);

    const hashA = photoA.dhash;
    let distanceSum = 0;

    const candidateIndices = new Set<number>();
    for (const [start, end] of chunkRanges) {
      const key = `${start}:${hashA.slice(start, end)}`;
      for (const index of buckets.get(key) ?? []) {
        if (index > i && !assigned.has(usable[index].id)) candidateIndices.add(index);
      }
    }

    for (const j of [...candidateIndices].sort((x, y) => x - y)) {
      const photoB = usable[j];
      const distance = distanceWithin(hashA, photoB.dhash);
      if (distance === null) continue;
      groupPhotos.push(photoB);
      assigned.add(photoB.id);
      distanceSum += distance;
    }

    if (groupPhotos.length > 1) {
      const averageDistance = distanceSum / (groupPhotos.length - 1);
      const best = bestPhoto(groupPhotos);
      groups.push({
        groupId: photoA.id,
        photoIds: groupPhotos.map((photo) => photo.id),
        bestId: best.id,
        isExact: distanceSum === 0,
        similarity: Math.min(1, Math.max(0, 1 - averageDistance / HASH_LENGTH)),
        totalSize: groupPhotos.reduce((sum, photo) => sum + photo.fileSize, 0),
        savableSize: savableSize(groupPhotos),
      });
    }
  }

  groups.sort((a, b) => b.savableSize - a.savableSize);
  return groups;
}
