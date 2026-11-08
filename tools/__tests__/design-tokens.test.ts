import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { COLOR_TOKENS } from '../../src/core/design-system/tokens';

// The design tokens are written in three places (UX_BRIEF Part 4, tokens.css, tokens.ts). They must agree.
const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const css = read('../../src/core/design-system/tokens.css');
const brief = read('../../docs/ux/UX_BRIEF.md');

function cssVar(name: string): string | undefined {
  return new RegExp(`--ds-${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(css)?.[1]?.toLowerCase();
}

function briefRows(): Map<string, string> {
  const part4 = brief.slice(brief.indexOf('## Part 4'), brief.indexOf('## Part 5'));
  const rows = new Map<string, string>();
  for (const m of part4.matchAll(/^\|\s*([a-z-]+)\s*\|\s*(#[0-9A-Fa-f]{6})\s*\|/gm)) rows.set(m[1]!, m[2]!.toLowerCase());
  return rows;
}

describe('design tokens', () => {
  const rows = briefRows();

  it('lists the same colour tokens in UX_BRIEF Part 4 and tokens.ts', () => {
    expect([...rows.keys()].sort()).toEqual(Object.keys(COLOR_TOKENS).sort());
  });

  for (const [name, token] of Object.entries(COLOR_TOKENS)) {
    it(`${name} has one value everywhere`, () => {
      expect(cssVar(name), `tokens.css --ds-${name}`).toBe(token.value);
      expect(rows.get(name), `UX_BRIEF Part 4 ${name}`).toBe(token.value);
    });
  }

  it('keeps the owner-approved brand colours (closet-builder tokens.md, 2026-10-07)', () => {
    expect(COLOR_TOKENS.navy.value).toBe('#1a3045');
    expect(COLOR_TOKENS.gold.value).toBe('#d4b57f');
  });
});
