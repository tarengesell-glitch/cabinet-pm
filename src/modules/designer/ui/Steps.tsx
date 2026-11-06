'use client';
/**
 * The room-drawing steps as an accordion in the side panel (owner, 2026-11-06): 1 Walls ·
 * 2 Openings · 3 Cabinets & islands · 4 Appliances. Clicking a step opens its options directly
 * under it; any step can be reopened at any time (not a locked wizard), and steps already
 * visited show a tick.
 */
import type { ReactNode } from 'react';
import s from './RoomCapture.module.css';

export type StepId = 'walls' | 'openings' | 'cabinets' | 'appliances';

export const STEP_LABEL: Readonly<Record<StepId, string>> = {
  walls: 'Walls',
  openings: 'Openings',
  cabinets: 'Cabinets & islands',
  appliances: 'Appliances',
};
export const STEP_ORDER: readonly StepId[] = ['walls', 'openings', 'cabinets', 'appliances'];

export function StepList(props: {
  open: StepId | null;
  visited: ReadonlySet<StepId>;
  onOpen: (step: StepId) => void;
  content: (step: StepId) => ReactNode;
}) {
  return (
    <ol className={s.steps} aria-label="Steps">
      {STEP_ORDER.map((id, i) => {
        const isOpen = props.open === id;
        const done = !isOpen && props.visited.has(id);
        return (
          <li key={id} className={s.stepItem}>
            <button
              className={isOpen ? s.stepOpen : s.step}
              aria-expanded={isOpen}
              aria-controls={`step-${id}`}
              aria-current={isOpen ? 'step' : undefined}
              aria-label={STEP_LABEL[id]}
              onClick={() => props.onOpen(id)}
            >
              <span className={done ? s.stepNumDone : isOpen ? s.stepNumOpen : s.stepNum} aria-hidden="true">
                {done ? '✓' : i + 1}
              </span>
              <span>{STEP_LABEL[id]}</span>
            </button>
            {isOpen && (
              <div className={s.stepBody} id={`step-${id}`}>
                {props.content(id)}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
