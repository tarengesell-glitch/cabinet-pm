import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../model/sha256';

const node = (text: string): string => createHash('sha256').update(text).digest('hex');

describe('the brief fingerprint hash (SHA-256)', () => {
  it('gives the standard test vectors (FIPS 180-4)', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });

  it('matches Node\'s own hash at every padding edge and for non-English text', () => {
    for (const n of [0, 1, 54, 55, 56, 57, 63, 64, 65, 119, 120, 128, 1000]) expect(sha256Hex('x'.repeat(n))).toBe(node('x'.repeat(n)));
    expect(sha256Hex('8′ · 5″ · é · 🪵')).toBe(node('8′ · 5″ · é · 🪵'));
  });
});
