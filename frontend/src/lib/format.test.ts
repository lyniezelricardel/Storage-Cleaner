import { describe, expect, it } from 'vitest';

import { formatBytes, plural } from './format';

describe('plural', () => {
  it('includes the count in front of the word', () => {
    expect(plural(0, 'photo')).toBe('0 photos');
    expect(plural(1, 'photo')).toBe('1 photo');
    expect(plural(14, 'photo')).toBe('14 photos');
  });

  it('honours an explicit plural form', () => {
    expect(plural(1, 'copy', 'copies')).toBe('1 copy');
    expect(plural(2, 'copy', 'copies')).toBe('2 copies');
    expect(plural(2, 'duplicate group')).toBe('2 duplicate groups');
  });
});

describe('formatBytes', () => {
  it('formats each unit', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('2 KB');
    expect(formatBytes(1.4 * 1024 * 1024)).toBe('1.4 MB');
    expect(formatBytes(1024 ** 3)).toBe('1.0 GB');
  });

  it('treats invalid values as zero', () => {
    expect(formatBytes(-5)).toBe('0 B');
    expect(formatBytes(Number.NaN)).toBe('0 B');
  });
});
