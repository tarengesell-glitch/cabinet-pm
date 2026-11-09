import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { examples, JobSchema, SCHEMA_VERSION } from '@/core/index';
import { PREVIEW_SHOP } from '@/platform/index';
import { roomMasterCopy } from '../contract';
import { storageKey } from '../ui/storage';

const ROOM = 'cccccccc-0000-4000-8000-000000000001';

/** MOCKED (tests only): the browser's storage, in memory. */
beforeEach(() => {
  const items = new Map<string, string>();
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (k: string) => items.get(k) ?? null,
      setItem: (k: string, v: string) => void items.set(k, v),
      removeItem: (k: string) => void items.delete(k),
    },
  };
});
afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

const keep = (data: unknown) => window.localStorage.setItem(storageKey(ROOM), typeof data === 'string' ? data : JSON.stringify(data));

describe("a room's master copy, for saving it to the shared database", () => {
  it('brings a room drawn by an older version up to date, as the room drawing does when it opens it', () => {
    // The live site, 2026-11-09: a room saved before schema 2 (no cabinets or selections), with
    // walls that still had their own height and the old stand-in shop, was refused by the database.
    const job = structuredClone(examples.kitchen()) as unknown as Record<string, unknown> & { rooms: Record<string, unknown>[] };
    job.schema_version = 1;
    job.shop_id = PREVIEW_SHOP.retiredId;
    delete job.job_selections;
    for (const room of job.rooms) {
      delete room.items;
      delete room.room_selections;
      for (const wall of room.walls as Record<string, unknown>[]) wall.height = { value: 96 * 64, provenance: 'rough', source_mm: null };
    }
    expect(JobSchema.safeParse(job).success).toBe(false);
    keep({ job, wallDefaults: null });

    const r = roomMasterCopy(ROOM);
    expect(r.kind).toBe('found');
    if (r.kind !== 'found') return;
    expect(JobSchema.safeParse(r.job).success).toBe(true);
    expect(r.job.schema_version).toBe(SCHEMA_VERSION);
    expect(r.job.shop_id).toBe(PREVIEW_SHOP.id);
    expect(r.job.rooms[0]?.items).toEqual([]);
  });

  it('says plainly when there is no drawing, and gives the reason when it can’t be used', () => {
    expect(roomMasterCopy(ROOM)).toEqual({ kind: 'none' });
    keep('{not json');
    expect(roomMasterCopy(ROOM).kind).toBe('problem');
    keep({ job: { job_id: 'x' }, wallDefaults: null });
    const r = roomMasterCopy(ROOM);
    expect(r.kind === 'problem' && r.reason).toMatch(/^The room’s drawing in this browser can’t be used: /);
  });
});
