'use client';
/**
 * The visual intake (UX brief V11): one question at a time with large pictures, a summary of
 * the choices so far, a review per room, and later rooms that match, coordinate with or
 * contrast an earlier room. It comes before the room drawing (walls, openings, cabinets and
 * appliances; owner, 2026-11-08).
 *
 * A PREVIEW: answers are kept in this browser only, the user is mocked, and the pictures are
 * placeholders. The screen says so.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { can, type User } from '@/platform/index';
import { DEFINITION, type Definition, type FieldDef, type StepDef } from '../model/definition';
import { Intake, startIntake, type IntakeState, type Option } from '../model/engine';
import { lookOf, optionPicture, scene, elevation } from './pictures';
import { loadState, saveState } from './storage';
import s from './Intake.module.css';

/**
 * When the intake sits inside the design studio (the app's job flow), the studio shows the rooms
 * and the steps, and decides which room is on screen.
 */
export interface IntakeFlowLink {
  /** The room the studio has on screen, by ID; null leaves it to the intake. */
  readonly roomId: string | null;
  /** Called after every change, with the whole state (read it through `intakeHandover`). */
  readonly onChange: (state: IntakeState) => void;
  /** "Start laying out room dimensions". Returns null when it went ahead, or the reason it can't. */
  readonly onDraw: () => string | null;
  /** The job whose answers these are; each job keeps its own. */
  readonly job?: string | null;
}

export interface IntakeScreenProps {
  readonly user: User;
  /** Where the client goes after the intake when it stands alone: the room drawing. */
  readonly next: { readonly href: string; readonly label: string };
  readonly flow?: IntakeFlowLink;
}

/** IDs for rooms. Not part of any translation, so a random ID is fine here. */
const newId = (): string => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `room-${Date.now()}-${Math.round(Math.random() * 1e9)}`);

function Picture({ markup, photo, aspect, placeholder }: { markup: string; photo: boolean; aspect?: string | undefined; placeholder?: boolean }) {
  return (
    <span className={photo ? s.artPhoto : s.art} style={aspect ? { aspectRatio: aspect } : undefined}>
      <span className={s.svg} dangerouslySetInnerHTML={{ __html: markup }} />
      {placeholder && (
        <span className={s.ph} aria-hidden="true">
          Placeholder
        </span>
      )}
    </span>
  );
}

/** The check shown on a picked card. */
const Check = () => (
  <span className={s.check} aria-hidden="true">
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M2.5 6.2l2.3 2.3 4.7-5" />
    </svg>
  </span>
);

export function IntakeScreen(props: IntakeScreenProps) {
  if (!DEFINITION.ok) {
    return (
      <div className={s.screen}>
        <div className={s.blocked} role="alert">
          <h1 className={s.title}>The intake can’t open</h1>
          <pre className={s.reasons}>{DEFINITION.reason}</pre>
        </div>
      </div>
    );
  }
  if (!can(props.user, 'room.view')) {
    return (
      <div className={s.screen}>
        <div className={s.blocked}>
          <h1 className={s.title}>You don&apos;t have permission to see the intake</h1>
          <p className={s.muted}>Ask an owner or admin for the “room.view” permission.</p>
        </div>
      </div>
    );
  }
  return <IntakeFlow {...props} def={DEFINITION.value} />;
}

function IntakeFlow({ user, next, flow, def }: IntakeScreenProps & { def: Definition }) {
  const job = flow?.job ?? null;
  const canEdit = can(user, 'room.edit');
  const [state, setState] = useState<IntakeState | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  /** Saving is held back while unreadable saved answers are on screen, so they aren't overwritten. */
  const [saveHeld, setSaveHeld] = useState(false);
  const [notes, setNotes] = useState(false);
  const [resetArmed, setResetArmed] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  const advance = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const loaded = loadState(job);
    if (loaded.kind === 'found') setState(loaded.state);
    else {
      setState(startIntake(def, newId()));
      if (loaded.kind === 'problem') {
        setProblem(loaded.reason);
        setSaveHeld(true);
      }
    }
    return () => {
      if (advance.current) clearTimeout(advance.current);
    };
  }, [def, job]);

  /** Every change: work on a copy, keep the result, save it. */
  const act = useCallback(
    (fn: (x: Intake) => void) => {
      setState((prev) => {
        if (!prev) return prev;
        const copy = JSON.parse(JSON.stringify(prev)) as IntakeState;
        fn(new Intake(def, copy));
        changed.current = true;
        return copy;
      });
    },
    [def],
  );
  /** Saves after every change the person makes (not on load). */
  const changed = useRef(false);
  useEffect(() => {
    if (!state || !changed.current || saveHeld) return;
    changed.current = false;
    setProblem(saveState(state, job));
  }, [state, saveHeld, job]);

  const x = useMemo(() => (state ? new Intake(def, state) : null), [def, state]);

  // Inside the studio: tell it about every change, and follow the room it puts on screen.
  const onChange = flow?.onChange;
  useEffect(() => {
    if (state && onChange) onChange(state);
  }, [state, onChange]);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  const wantedRoom = flow?.roomId ?? null;
  const hasState = state !== null;
  useEffect(() => {
    const now = stateRef.current;
    if (!wantedRoom || !now) return;
    const i = now.rooms.findIndex((r) => r.id === wantedRoom);
    if (i >= 0 && i !== now.room) switchTo.current(i);
  }, [wantedRoom, hasState, act]);

  const goNext = useCallback(() => act((y) => void y.next()), [act]);
  /**
   * Switches rooms. A step waiting to move on by itself (just answered) moves on first, so it
   * belongs to the room it was answered in, not the one switched to.
   */
  const switchTo = useRef((i: number) => act((y) => y.switchRoom(i)));
  useEffect(() => {
    switchTo.current = (i: number) => {
      const pending = advance.current !== null;
      if (advance.current) clearTimeout(advance.current);
      advance.current = null;
      act((y) => {
        if (pending) y.next();
        y.switchRoom(i);
      });
    };
  }, [act]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!x || !canEdit) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey) return;
      if (x.state.pending) {
        if (e.key === 'Escape') {
          e.preventDefault();
          act((y) => y.resolve('cancel'));
        }
        return;
      }
      const { step } = x.current();
      const fields = x.fields(step);
      const only = fields.length === 1 ? fields[0] : undefined;
      if (/^[1-9]$/.test(e.key) && only && ['image', 'cards', 'chips', 'swatch'].includes(only.type)) {
        const o = x.options(only)[Number(e.key) - 1];
        if (o) {
          e.preventDefault();
          pickRef.current(only.key, o.id);
        }
      } else if (e.key === 'Enter' && !target?.closest('button, a')) {
        e.preventDefault();
        goNext();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [x, act, canEdit, goNext]);

  const pick = useCallback(
    (key: string, value: string) => {
      if (!x || !canEdit) return;
      setFinishError(null);
      // Single-question steps move on by themselves once answered (Typeform style).
      const { step } = x.current();
      act((y) => y.pick(key, value));
      const after = new Intake(def, JSON.parse(JSON.stringify(x.state)) as IntakeState);
      after.pick(key, value);
      const fields = after.state.pending ? [] : after.fields(step);
      const auto = fields.length === 1 && fields[0]?.key === key && ['image', 'cards', 'chips', 'swatch'].includes(fields[0].type) && after.missing(step) === null && !after.state.rooms[after.roomIndex]?.peek;
      if (advance.current) clearTimeout(advance.current);
      advance.current = null;
      if (auto)
        advance.current = setTimeout(() => {
          advance.current = null;
          goNext();
        }, 260);
    },
    [x, canEdit, act, def, goNext],
  );
  const pickRef = useRef(pick);
  useEffect(() => {
    pickRef.current = pick;
  }, [pick]);

  const screen = flow ? s.embedded : s.screen;
  if (!x || !state) return <div className={screen}><p className={s.loading}>Loading the intake…</p></div>;

  const { steps, index, step } = x.current();
  const fields = x.fields(step);
  const single = fields.length === 1;
  const missing = x.missing(step);
  const room = state.rooms[state.room];
  const help = x.text(step.help);

  const tabs =
    state.rooms.length > 1 && !flow ? (
      <div className={s.tabs} role="tablist" aria-label="Rooms">
        {state.rooms.map((r, i) => (
          <button key={r.id} role="tab" aria-selected={i === state.room} className={s.tab} onClick={() => switchTo.current(i)}>
            {x.roomName(i)}
            {r.done && x.roomComplete(i) ? ' ✓' : ''}
          </button>
        ))}
      </div>
    ) : null;

  return (
    <div className={screen}>
      <header className={s.header}>
        {!flow && <span className={s.brand}>Design choices</span>}
        <span className={s.pill}>Preview: saved in this browser only · placeholder pictures</span>
        {user.mocked && !flow && <span className={s.pill}>{user.name}</span>}
        <span className={s.spacer} />
        <button className={s.ghost} aria-pressed={notes} onClick={() => setNotes((n) => !n)}>
          Open questions
        </button>
        {canEdit && (
          <button
            className={s.ghost}
            onClick={() => {
              if (!resetArmed) return setResetArmed(true);
              setResetArmed(false);
              const fresh = startIntake(def, newId());
              setProblem(saveState(fresh, job));
              setSaveHeld(false);
              setState(fresh);
            }}
            onBlur={() => setResetArmed(false)}
          >
            {resetArmed ? 'Tap again to clear every room' : 'Start over'}
          </button>
        )}
      </header>
      <div className={s.progress} aria-hidden="true">
        {steps.map((st, i) => (
          <i key={st.id} className={i < index ? s.pDone : i === index ? s.pCur : s.pTodo} />
        ))}
      </div>
      {problem && (
        <p className={s.alert} role="alert">
          {problem}
        </p>
      )}
      {!canEdit && <p className={s.alert}>You can look but not change answers: this needs the “room.edit” permission.</p>}

      <div className={s.shell}>
        <main className={s.main}>
          {tabs}
          <div className={s.eyebrow}>
            {x.roomName()} · {step.section} · Step {index + 1} of {steps.length}
          </div>
          <h1 className={s.question}>{x.text(step.q)}</h1>
          {help ? <p className={s.help}>{help}</p> : <div className={s.gap} />}
          {room?.peek === step.id && x.carried() && (
            <p className={s.linked}>
              This {x.roomName().toLowerCase()} uses the design from the {x.carried()?.from.toLowerCase()}. If you change something here, you choose whether linked rooms change too.
            </p>
          )}
          {notes && step.notes && (
            <div className={s.note}>
              {step.notes.map((n) => (
                <p key={n}>
                  <b>{n}:</b> {def.intake.notes[n]}
                </p>
              ))}
            </div>
          )}
          {step.preview && <Preview markup={scene(x)} wide />}
          {step.review && (
            <Review
              x={x}
              finishError={finishError}
              canEdit={canEdit}
              next={next}
              onDraw={flow?.onDraw ?? null}
              onGo={(id) => act((y) => y.go(id))}
              onFinish={() => {
                const r = new Intake(def, JSON.parse(JSON.stringify(state)) as IntakeState).finish();
                if (!r.ok) setFinishError(r.reason);
                else act((y) => void y.finish());
              }}
              onAddRoom={() => act((y) => y.addRoom(newId()))}
            />
          )}
          {fields.map((f) => (
            <Field key={f.key} x={x} f={f} single={single} notes={notes} canEdit={canEdit} onPick={pick} onType={(k, t, part) => act((y) => y.type(k, t, part))} />
          ))}
          <nav className={s.nav} aria-label="Steps">
            <button className={s.btn} disabled={index === 0} onClick={() => act((y) => void y.back())}>
              ‹ Back
            </button>
            <span className={s.spacer} />
            {!step.review && (
              <>
                {missing && <span className={s.why}>{missing}</span>}
                <button className={s.primary} disabled={missing !== null || !canEdit} onClick={goNext}>
                  Next ›
                </button>
              </>
            )}
          </nav>
        </main>
        <aside className={s.aside}>
          <Rail x={x} step={step} onGo={(id) => act((y) => y.go(id))} />
        </aside>
      </div>
      {state.pending && <LinkedRooms x={x} onChoose={(c) => act((y) => y.resolve(c))} />}
    </div>
  );
}

function Preview({ markup, wide }: { markup: string; wide?: boolean }) {
  return (
    <div className={wide ? s.previewWide : s.preview}>
      <Picture markup={markup} photo aspect="8/5" placeholder />
    </div>
  );
}

function Field(props: {
  x: Intake;
  f: FieldDef;
  single: boolean;
  notes: boolean;
  canEdit: boolean;
  onPick: (key: string, value: string) => void;
  onType: (key: string, text: string, part?: 'ft' | 'in') => void;
}) {
  const { x, f, single, notes, canEdit, onPick } = props;
  const v = x.eff(f);
  const os = x.options(f);
  const sample = notes && f.sample ? <span className={s.sample}>Sample options</span> : null;
  const head =
    f.label || sample ? (
      <div className={s.flabel}>
        {f.label}
        {f.sub && <small>{f.sub}</small>}
        {sample}
      </div>
    ) : null;
  const pressed = (o: Option) => (Array.isArray(v) ? v.includes(o.id) : v === o.id);
  const chips = (
    <div className={s.chips}>
      {os.map((o) => (
        <button key={o.id} className={s.chip} aria-pressed={pressed(o)} disabled={!canEdit} onClick={() => onPick(f.key, o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );

  if (f.type === 'count') {
    return (
      <div className={s.row}>
        <span className={s.rowName}>{f.label}</span>
        {chips}
      </div>
    );
  }

  let body: ReactNode;
  if (f.type === 'image' || f.type === 'cards') {
    body = (
      <div className={f.size ? s.tilesSm : s.tiles} style={{ ['--min' as string]: f.min ?? (f.size ? '150px' : '200px') }}>
        {os.map((o, k) => (
          <button key={o.id} className={f.type === 'cards' ? s.card : s.tile} aria-pressed={v === o.id} disabled={!canEdit} onClick={() => onPick(f.key, o.id)}>
            <Check />
            {f.type === 'image' && <Picture markup={optionPicture(x, f, o)} photo={f.fidelity === 'photo'} aspect={f.aspect} placeholder />}
            {single && k < 9 && <span className={s.key} aria-hidden="true">{k + 1}</span>}
            <span className={s.tl}>
              {o.rec && <span className={s.rec}>Recommended</span>}
              <b>{o.label}</b>
              {o.desc && <span>{o.desc}</span>}
              {o.def?.price_note && <span className={s.notConnected}>Drawer cost: live pricing not connected yet</span>}
            </span>
          </button>
        ))}
      </div>
    );
  } else if (f.type === 'chips' || f.type === 'multi') body = chips;
  else if (f.type === 'swatch') {
    body = (
      <>
        {os.length === 0 && <p className={s.why}>Pick a colour tone first.</p>}
        <div className={s.swatches}>
          {os.map((o) => (
            <button key={o.id} className={s.swatch} aria-pressed={v === o.id} aria-label={o.label} disabled={!canEdit} onClick={() => onPick(f.key, o.id)}>
              <i style={{ background: o.hex }} />
              <span>{o.label}</span>
            </button>
          ))}
        </div>
      </>
    );
  } else if (f.type === 'text') {
    const raw = x.state.rooms[x.roomIndex]?.answers[f.key];
    body = (
      <input
        className={s.text}
        aria-label={f.label}
        placeholder={f.placeholder}
        value={typeof raw === 'string' ? raw : ''}
        disabled={!canEdit}
        onChange={(e) => props.onType(f.key, e.target.value)}
      />
    );
  } else if (f.type === 'height') {
    const raw = x.state.rooms[x.roomIndex]?.answers[f.key];
    const h = typeof raw === 'object' && !Array.isArray(raw) ? (raw as { ft: string; in: string }) : { ft: '', in: '' };
    body = (
      <div className={s.height}>
        <label>
          <input className={s.text} inputMode="decimal" aria-label="Feet" value={h.ft} disabled={!canEdit} onChange={(e) => props.onType(f.key, e.target.value, 'ft')} />
          <span>ft</span>
        </label>
        <label>
          <input className={s.text} inputMode="decimal" aria-label="Inches" value={h.in} disabled={!canEdit} onChange={(e) => props.onType(f.key, e.target.value, 'in')} />
          <span>in</span>
        </label>
      </div>
    );
  }
  return (
    <div className={f.indent ? s.fieldIndent : s.field}>
      {head}
      {body}
    </div>
  );
}

function Rail({ x, step, onGo }: { x: Intake; step: StepDef; onGo: (id: string) => void }) {
  let done = 0;
  let total = 0;
  const rows: ReactNode[] = [];
  let section = '';
  for (const st of x.steps()) {
    if (st.review) continue;
    for (const f of x.fields(st)) {
      if (f.in_summary === false) continue;
      total++;
      const l = x.label(f);
      if (l) done++;
      if (st.section !== section) {
        section = st.section;
        rows.push(<h4 key={`h-${st.id}-${f.key}`}>{section}</h4>);
      }
      rows.push(<SumRow key={f.key} k={f.short ?? f.label ?? st.section} v={l} current={st.id === step.id} onClick={() => onGo(st.id)} />);
    }
  }
  const c = x.carried();
  if (c) {
    rows.push(<h4 key="h-carried">Design · from {c.from}</h4>);
    for (const f of c.fields) {
      total++;
      const l = x.label(f);
      if (l) done++;
      rows.push(<SumRow key={`c-${f.key}`} k={f.short ?? f.label ?? f.key} v={l} current={false} onClick={() => onGo(x.def.stepOf.get(f.key) ?? 'basis')} />);
    }
  }
  return (
    <div className={s.rail}>
      <Preview markup={elevation(lookOf(x))} />
      <div className={s.railHead}>
        <b>Your choices</b>
        <span>
          {done} of {total}
        </span>
      </div>
      <div className={s.sum}>{rows}</div>
    </div>
  );
}

function SumRow({ k, v, current, onClick }: { k: string; v: string | null; current: boolean; onClick: () => void }) {
  return (
    <button className={current ? s.sumCur : s.sumRow} onClick={onClick}>
      <span className={s.sumK}>{k}</span>
      <span className={v ? s.sumV : s.sumMiss}>{v ?? 'Not answered'}</span>
    </button>
  );
}

function Review(props: {
  x: Intake;
  canEdit: boolean;
  finishError: string | null;
  next: IntakeScreenProps['next'];
  /** Inside the studio: moves on to the room drawing (or says why it can't). */
  onDraw: (() => string | null) | null;
  onGo: (id: string) => void;
  onFinish: () => void;
  onAddRoom: () => void;
}) {
  const { x } = props;
  const missing: { step: string; text: string }[] = [];
  const bySection = new Map<string, StepDef[]>();
  for (const st of x.steps()) {
    if (st.review) continue;
    bySection.set(st.section, [...(bySection.get(st.section) ?? []), st]);
  }
  const cards: ReactNode[] = [];
  for (const [section, steps] of bySection) {
    const rows: ReactNode[] = [];
    for (const st of steps)
      for (const f of x.fields(st)) {
        if (f.in_summary === false) continue;
        const l = x.label(f);
        if (!l) missing.push({ step: st.id, text: `${section}: ${f.short ?? f.label ?? x.text(st.q)}` });
        rows.push(
          <div key={f.key} className={s.dlRow}>
            <dt>{f.short ?? f.label ?? section}</dt>
            <dd className={l ? undefined : s.missText}>{l ?? 'Not answered'}</dd>
          </div>,
        );
      }
    cards.push(
      <div key={section} className={s.rcard}>
        <h3>
          {section}
          <button onClick={() => props.onGo(steps[0]?.id ?? 'review')}>Change</button>
        </h3>
        <dl>{rows}</dl>
      </div>,
    );
  }
  const c = x.carried();
  if (c) {
    cards.push(
      <div key="carried" className={s.rcard}>
        <h3>
          Design from {c.from}
          <button onClick={() => props.onGo('basis')}>Change</button>
        </h3>
        <dl>
          {c.fields.map((f) => {
            const l = x.label(f);
            if (!l) missing.push({ step: 'basis', text: `Design: ${f.short ?? f.label ?? f.key}` });
            return (
              <div key={f.key} className={s.dlRow}>
                <dt>{f.short ?? f.label}</dt>
                <dd>
                  <button className={s.link} onClick={() => props.onGo(x.def.stepOf.get(f.key) ?? 'basis')}>
                    {l ?? 'Not answered'}
                  </button>
                </dd>
              </div>
            );
          })}
        </dl>
      </div>,
    );
  }
  const room = x.state.rooms[x.roomIndex];
  // Each room type can be added once per job (owner, 2026-11-08).
  const roomsLeft = props.canEdit && x.def.intake.room_types.types.some((t) => !x.state.rooms.some((r) => r.answers['room_type'] === t.id));
  return (
    <>
      <Preview markup={scene(x)} wide />
      {missing.length > 0 && (
        <div className={s.missList} role="status">
          <b>
            {missing.length} {missing.length === 1 ? 'choice is' : 'choices are'} still missing.
          </b>{' '}
          This room can’t be finished until they’re answered.
          <ul>
            {missing.map((m) => (
              <li key={m.text}>
                <button className={s.link} onClick={() => props.onGo(m.step)}>
                  {m.text}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className={s.review}>{cards}</div>
      {room?.done && missing.length === 0 ? (
        <Between x={x} canAdd={roomsLeft} next={props.next} onDraw={props.onDraw} onAddRoom={props.onAddRoom} />
      ) : (
        <div className={s.acts}>
          <button className={s.primary} disabled={missing.length > 0 || !props.canEdit} onClick={props.onFinish}>
            Finish {x.roomName().toLowerCase()}
          </button>
          {props.finishError && (
            <span className={s.why} role="alert">
              {props.finishError}
            </span>
          )}
        </div>
      )}
    </>
  );
}

export function LinkedRooms({ x, onChoose }: { x: Intake; onChoose: (c: 'all' | 'one' | 'cancel') => void }) {
  const t = x.pendingText();
  const first = useRef<HTMLButtonElement | null>(null);
  useEffect(() => first.current?.focus(), []);
  if (!t) return null;
  return (
    <div className={s.modalBg}>
      <div className={s.modal} role="dialog" aria-modal="true" aria-labelledby="linked-title">
        <h2 id="linked-title">This change affects linked rooms</h2>
        <p>
          {t.change} {t.intro}
        </p>
        <div className={s.mopts}>
          {t.all && (
            <button ref={first} className={s.mopt} onClick={() => onChoose('all')}>
              <b>Match currently linked rooms</b>
              <span>{t.all}</span>
            </button>
          )}
          <button ref={t.all ? undefined : first} className={s.mopt} onClick={() => onChoose('one')}>
            <b>{t.one}</b>
            <span>{t.oneDetail}</span>
          </button>
        </div>
        <button className={s.btn} onClick={() => onChoose('cancel')}>
          Cancel the change
        </button>
      </div>
    </div>
  );
}

/** A finished room: what's next, as two big choices (from the owner's Kitchen Studio prototype). */
function Between(props: { x: Intake; canAdd: boolean; next: IntakeScreenProps['next']; onDraw: (() => string | null) | null; onAddRoom: () => void }) {
  const { x } = props;
  const [drawError, setDrawError] = useState<string | null>(null);
  const count = x.state.rooms.length;
  const drawIcon = (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M4 4h16v16H4z" />
      <path d="M4 9h5v11M14 4v6h6" />
    </svg>
  );
  const drawNote = `Draw ${count === 1 ? 'the room' : `all ${count} rooms`}: walls, doors and windows, cabinet runs and appliances.`;
  return (
    <section className={s.between} aria-label="What's next">
      <h2 className={s.doneTitle}>{x.roomName()} finished.</h2>
      <p className={s.doneText}>These answers go to the design as the client’s wishes. Add every room in this project first, or start drawing.</p>
      <div className={s.nextCards}>
        {props.canAdd && (
          <button className={s.nextCard} onClick={props.onAddRoom}>
            <span className={s.nextIc} aria-hidden="true">
              +
            </span>
            <span className={s.nextName}>Add another room</span>
            <span className={s.nextNote}>Bath, mudroom, laundry, closet, office and more. Match, coordinate, contrast or start from scratch.</span>
          </button>
        )}
        {props.onDraw ? (
          <button className={s.nextCardPrimary} onClick={() => setDrawError(props.onDraw?.() ?? null)}>
            <span className={s.nextIc}>{drawIcon}</span>
            <span className={s.nextName}>Start laying out room dimensions</span>
            <span className={s.nextNote}>{drawNote}</span>
          </button>
        ) : (
          <a className={s.nextCardPrimary} href={props.next.href}>
            <span className={s.nextIc}>{drawIcon}</span>
            <span className={s.nextName}>{props.next.label} ›</span>
            <span className={s.nextNote}>{drawNote}</span>
          </a>
        )}
      </div>
      {drawError && (
        <p className={s.alert} role="alert" style={{ margin: 0 }}>
          {drawError}
        </p>
      )}
      <p className={s.why}>In this preview the answers are kept in this browser only.</p>
    </section>
  );
}
