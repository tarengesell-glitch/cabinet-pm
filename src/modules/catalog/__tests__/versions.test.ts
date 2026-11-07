// A published catalog version is frozen: jobs are checked against it as it was.
// To change the catalog, add a new version file and list its fingerprint here; never edit an old one.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const PUBLISHED: Readonly<Record<string, string>> = {
  'catalog-v1.json': '1710241f888d7c14d30b9934a1cfdba1f2fa3afed354c6e5ef502c98c2023b52',
};

describe('published catalog versions', () => {
  for (const [file, fingerprint] of Object.entries(PUBLISHED)) {
    it(`${file} hasn’t changed since it was published`, () => {
      const bytes = readFileSync(fileURLToPath(new URL(`../data/${file}`, import.meta.url)));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(fingerprint);
    });
  }
});
