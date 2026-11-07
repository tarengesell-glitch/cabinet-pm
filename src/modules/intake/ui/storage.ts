/**
 * Browser storage for the intake preview: the answers live only in this browser until jobs and
 * the platform store exist (as the room preview does, DECISIONS 2026-11-05). Every failure is
 * reported to the screen, never swallowed.
 */
import type { Answers } from '../model/flow';

const key = (roomType: string) => `cabinet-pm.intake-preview.${roomType}.v0`;

export type Loaded =
  | { kind: 'none' }
  | { kind: 'found'; answers: unknown }
  | { kind: 'problem'; reason: string };

export function loadAnswers(roomType: string): Loaded {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(key(roomType));
  } catch (error) {
    return { kind: 'problem', reason: `This browser won't let the page read saved answers: ${describe(error)}` };
  }
  if (raw === null) return { kind: 'none' };
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== 'object' || data === null || !('answers' in data)) return { kind: 'problem', reason: 'The saved answers are not in the right shape, so none could be used.' };
    return { kind: 'found', answers: data.answers };
  } catch (error) {
    return { kind: 'problem', reason: `The saved answers can't be read: ${describe(error)}` };
  }
}

/** Returns null when saved, or the reason it could not be saved. */
export function saveAnswers(roomType: string, answers: Answers): string | null {
  try {
    window.localStorage.setItem(key(roomType), JSON.stringify({ room_type: roomType, answers }));
    return null;
  } catch (error) {
    return `Not saved: ${describe(error)}`;
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function downloadJson(filename: string, data: unknown): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
