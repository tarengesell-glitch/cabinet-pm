import type { Intake } from '../model/engine';

/** Answers every open question on every step of the room on screen, with `pick` overrides (tests only). */
export function answerRoom(x: Intake, pick: Record<string, string> = {}): void {
  for (let guard = 0; guard < 60; guard++) {
    const { step } = x.current();
    if (step.review) return;
    for (let pass = 0; pass < 5; pass++) {
      for (const f of x.fields(step)) {
        if (x.eff(f) !== undefined) continue;
        if (f.type === 'height') {
          x.type(f.key, '9', 'ft');
          continue;
        }
        if (f.type === 'text') {
          x.type(f.key, 'the hutch');
          continue;
        }
        const os = x.options(f);
        const want = pick[f.key] ?? os[Math.min(1, os.length - 1)]?.id;
        if (!want) throw new Error(`${f.key} has no options`);
        x.pick(f.key, want);
        if (x.state.pending) throw new Error(`unexpected linked-rooms choice on ${f.key}`);
      }
    }
    if (!x.next()) throw new Error(`stuck on ${step.id}: ${x.missing(step)}`);
  }
}
