/**
 * The catalog versions in use. A published version's file is never edited: a change is a new
 * version file, so a job can always be checked against the catalog as it was (BUILD_SPEC 5.3).
 * `__tests__/versions.test.ts` holds each published file's fingerprint and fails if one changes.
 */
import { readCatalog, type Catalog } from './catalog';
import v1 from '../data/catalog-v1.json';
import v2 from '../data/catalog-v2.json';

function load(data: unknown, file: string, version: number): Catalog {
  const read = readCatalog(data);
  if (!read.ok) throw new Error(read.reason);
  if (read.value.version !== version) throw new Error(`${file} says it is not version ${version}.`);
  return read.value;
}

/**
 * Version 2 (owner, 2026-11-12) adds to version 1: "Double doors" to the door opening (was
 * "Hinge side"), the Back option on cabinets with ends, the name "Integrated finished end", and
 * the garbage pull-out's new handle position. Item IDs are unchanged.
 */
const VERSIONS: ReadonlyMap<number, Catalog> = new Map([
  [1, load(v1, 'catalog-v1.json', 1)],
  [2, load(v2, 'catalog-v2.json', 2)],
]);

/** The newest catalog version. */
export const CURRENT_CATALOG: Catalog = VERSIONS.get(2)!;

/** The catalog as it was at this version, or null when there is no such version (the caller refuses). */
export function catalogVersion(version: number): Catalog | null {
  return VERSIONS.get(version) ?? null;
}
