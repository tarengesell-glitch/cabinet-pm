/**
 * The catalog versions in use. A published version's file is never edited: a change is a new
 * version file, so a job can always be checked against the catalog as it was (BUILD_SPEC 5.3).
 * `__tests__/versions.test.ts` holds each published file's fingerprint and fails if one changes.
 */
import { readCatalog, type Catalog } from './catalog';
import v1 from '../data/catalog-v1.json';

const read = readCatalog(v1);
if (!read.ok) throw new Error(read.reason);
if (read.value.version !== 1) throw new Error('catalog-v1.json says it is not version 1.');

const VERSIONS: ReadonlyMap<number, Catalog> = new Map([[1, read.value]]);

/** The newest catalog version. */
export const CURRENT_CATALOG: Catalog = read.value;

/** The catalog as it was at this version, or null when there is no such version (the caller refuses). */
export function catalogVersion(version: number): Catalog | null {
  return VERSIONS.get(version) ?? null;
}
