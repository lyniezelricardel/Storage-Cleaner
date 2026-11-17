import assert from 'node:assert/strict';
import test from 'node:test';

import { bestPhoto, groupDuplicates, savableSize, type HashablePhoto } from './grouping.ts';

function photo(id: string, dhash: string, overrides: Partial<HashablePhoto> = {}): HashablePhoto {
  return { id, dhash, fileSize: 1000, blurScore: 50, dateTaken: 0, ...overrides };
}

const hashA = '0'.repeat(256);

test('identical hashes form one group', () => {
  const groups = groupDuplicates([photo('a', hashA), photo('b', hashA)]);
  assert.equal(groups.length, 1);
  assert.deepEqual(new Set(groups[0].photoIds), new Set(['a', 'b']));
  assert.equal(groups[0].isExact, true);
  assert.equal(groups[0].similarity, 1);
});

test('unrelated hashes are not grouped', () => {
  const groups = groupDuplicates([photo('a', hashA), photo('b', '1'.repeat(256))]);
  assert.equal(groups.length, 0);
});

test('hashes within the threshold are grouped, beyond it are not', () => {
  const near = '0'.repeat(256 - 20) + '1'.repeat(20);
  const far = '0'.repeat(256 - 40) + '1'.repeat(40);
  assert.equal(groupDuplicates([photo('a', hashA), photo('b', near)]).length, 1);
  assert.equal(groupDuplicates([photo('a', hashA), photo('b', far)]).length, 0);
});

test('BEST prefers the largest file, then sharpness, then newest', () => {
  const best = bestPhoto([
    photo('small', hashA, { fileSize: 100, blurScore: 900, dateTaken: 3 }),
    photo('large', hashA, { fileSize: 900, blurScore: 10, dateTaken: 1 }),
  ]);
  assert.equal(best.id, 'large');

  const sharper = bestPhoto([
    photo('soft', hashA, { fileSize: 900, blurScore: 10, dateTaken: 1 }),
    photo('sharp', hashA, { fileSize: 900, blurScore: 80, dateTaken: 1 }),
  ]);
  assert.equal(sharper.id, 'sharp');

  const newer = bestPhoto([
    photo('old', hashA, { fileSize: 900, blurScore: 80, dateTaken: 1 }),
    photo('new', hashA, { fileSize: 900, blurScore: 80, dateTaken: 9 }),
  ]);
  assert.equal(newer.id, 'new');
});

test('savable size excludes the kept copy', () => {
  const group = [
    photo('keep', hashA, { fileSize: 500 }),
    photo('copy-a', hashA, { fileSize: 200 }),
    photo('copy-b', hashA, { fileSize: 300 }),
  ];
  assert.equal(savableSize(group), 500);
  assert.equal(bestPhoto(group).id, 'keep');
});

test('groups are sorted by reclaimable bytes', () => {
  const small = '0'.repeat(256);
  const other = '1'.repeat(256);
  const groups = groupDuplicates([
    photo('a1', small, { fileSize: 100 }),
    photo('a2', small, { fileSize: 100 }),
    photo('b1', other, { fileSize: 5000 }),
    photo('b2', other, { fileSize: 5000 }),
  ]);
  assert.equal(groups[0].savableSize, 5000);
});
