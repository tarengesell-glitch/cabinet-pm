/**
 * Browser storage for the preview, like the room drawing (DECISIONS 2026-11-05): the answers live
 * only in this browser until the platform store exists. Every failure is returned so the screen
 * can show it (rule 7), never swallowed.
 */
import type { IntakeState } from '../model/engine';

const KEY = 'cabinet-pm.intake-preview.v1';

export type Loaded = { kind: 'none' } | { kind: 'found'; state: IntakeState } | { kind: 'problem'; reason: string };

const describe = (error: unknown): string => (error instanceof Error ? error.message : String(error));

function looksLikeState(v: unknown): v is IntakeState {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Partial<IntakeState>;
  return s.version === 1 && Array.isArray(s.rooms) && s.rooms.length > 0 && typeof s.room === 'number' && s.room >= 0 && s.room < s.rooms.length;
}

export function loadState(): Loaded {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch (error) {
    return { kind: 'problem', reason: `This browser won't let the intake read saved answers (${describe(error)}). Answers last only until the page closes.` };
  }
  if (raw === null) return { kind: 'none' };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    return { kind: 'problem', reason: `The saved answers can't be read (${describe(error)}). They were left as they are; Start over replaces them.` };
  }
  if (!looksLikeState(data)) return { kind: 'problem', reason: 'The saved answers are from another version and can’t be used. They were left as they are; Start over replaces them.' };
  return { kind: 'found', state: data };
}

/** Returns null when saved, or the reason it could not be saved. */
export function saveState(state: IntakeState | null): string | null {
  try {
    if (state === null) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, JSON.stringify(state));
    return null;
  } catch (error) {
    return `Your answers couldn't be saved in this browser (${describe(error)}). They last only until the page closes.`;
  }
}
