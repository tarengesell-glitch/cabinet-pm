'use client';
/**
 * The AI design step: a PLACEHOLDER (owner, 2026-11-08: "a placeholder AI design animation (with
 * no actual AI design)"). No AI model is called. While the animation runs, the designer's fixed
 * recipe lays out each room in turn; once every room is done it moves on to the customize screens.
 * A room that can't be laid out stops the step with the reason (rule 7).
 */
import { useEffect, useRef, useState } from 'react';
import { draftRoom, type DraftPreferences } from '@/modules/designer/contract';
import { PlanThumb } from '@/modules/designer/ui/index';
import s from './Studio.module.css';

const STEP_MS = 1500;
const DONE_MS = 1100;

export function AiStep(props: {
  rooms: readonly { id: string; name: string; prefs: DraftPreferences }[];
  /** Every room already has a design: show it as done, and only draft again when asked. */
  alreadyDesigned: boolean;
  /** The person running the step, recorded in each room's history. */
  userId: string;
  onDrafted: () => void;
  onOpen: () => void;
}) {
  const { rooms, onDrafted, onOpen } = props;
  const [run, setRun] = useState(props.alreadyDesigned ? 0 : 1);
  const [at, setAt] = useState(props.alreadyDesigned ? rooms.length : 0);
  const [error, setError] = useState<string | null>(null);
  const roomsRef = useRef(rooms);
  const done = at >= rooms.length && error === null;

  useEffect(() => {
    if (run === 0) return;
    roomsRef.current = rooms;
    setAt(0);
    setError(null);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const wait = reduce ? 150 : STEP_MS;
    let i = 0;
    let timer = 0;
    const tick = () => {
      const room = roomsRef.current[i];
      if (!room) return;
      const r = draftRoom(room.id, room.prefs, props.userId);
      if (!r.ok) {
        setError(`The ${room.name.toLowerCase()} couldn’t be laid out: ${r.reason}`);
        return;
      }
      onDrafted();
      i++;
      setAt(i);
      if (i >= roomsRef.current.length) timer = window.setTimeout(onOpen, reduce ? 0 : DONE_MS);
      else timer = window.setTimeout(tick, wait);
    };
    timer = window.setTimeout(tick, wait);
    return () => window.clearTimeout(timer);
    // Runs once per "run": the rooms are read from the ref.
  }, [run]);

  const n = rooms.length;
  const pct = n ? Math.round((Math.min(at, n) / n) * 100) : 100;
  return (
    <div className={s.aiWait}>
      <div className={done ? s.orbDone : s.orb} aria-hidden="true">
        <span />
        <span />
        <span />
        {done && (
          <svg width="34" height="34" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4">
            <path d="M2.5 6.2l2.3 2.3L9.5 3.8" />
          </svg>
        )}
      </div>
      <p className={s.eyebrow}>AI design</p>
      <h2 className={s.aiTitle}>{error ? 'The design stopped' : done ? 'Your design is ready' : `Designing ${n === 1 ? 'your room' : `your ${n} rooms`}…`}</h2>
      <div className={s.aiBar} role="progressbar" aria-label="Design progress" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <span style={{ width: `${pct}%` }} />
      </div>
      <div className={s.aiRooms}>
        {rooms.map((r, i) => {
          const isDone = i < at;
          const on = i === at && !done && !error;
          return (
            <div key={r.id} className={isDone ? s.aiRoomDone : on ? s.aiRoomOn : s.aiRoom}>
              <div className={s.aiPlan}>
                <PlanThumb roomKey={r.id} showDesign={isDone} version={at} />
                {on && <span className={s.scan} />}
              </div>
              <span className={s.aiRoomName}>{r.name}</span>
              <span className={s.aiRoomState}>{isDone ? 'Designed' : on ? 'Designing…' : 'Waiting'}</span>
            </div>
          );
        })}
      </div>
      {error && (
        <p className={s.alert} role="alert">
          {error}
        </p>
      )}
      <p className={s.mocked}>
        <strong>Placeholder.</strong> This animation stands in for the AI design step. No AI model is called: a fixed recipe lays the rooms out with catalog cabinets so the customize
        screens can be tried. The result is kept in this browser and is not in the master copy yet.
      </p>
      {(done || error) && (
        <div className={s.aiActions}>
          {done && (
            <button className={s.primary} onClick={onOpen}>
              Open the customizer
            </button>
          )}
          {props.alreadyDesigned || error ? (
            <button className={s.secondary} onClick={() => setRun((k) => k + 1)}>
              {error ? 'Try again' : 'Lay out again (replaces any changes)'}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
