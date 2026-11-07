'use client';
/**
 * The visual intake (UX_BRIEF screen 04 / V11): one question at a time with large pictures,
 * a summary of answers down the side, and a review at the end.
 * - Questions, options and conditions come from data (data/kitchen.json).
 * - Images are placeholders until real ones are supplied, and the screen says so.
 * - The user is mocked (no sign-in yet), and answers are saved in this browser only. Both are shown.
 * - No prices are shown, except where the intake asks for one (the drawer level), and pricing
 *   doesn't exist yet, so that says "not available" instead of a number.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { can, type User } from '@/platform/index';
import { askedQuestions, checkSavedAnswers, describeAnswer, progress, questionState, selectedOption, setAnswer, type Answer, type Answers, type Choice, type QuestionState } from '../model/flow';
import type { CountsQuestion, Intake, IntakeQuestion, PendingQuestion, SingleQuestion } from '../model/intake';
import { OptionImage } from './OptionImage';
import { downloadJson, loadAnswers, saveAnswers } from './storage';
import s from './IntakeFlow.module.css';

/** How long a pick shows as picked before moving on (UX_BRIEF: "auto-advance after brief confirmation"). */
const ADVANCE_MS = 450;

type Status = Exclude<Answer['status'], 'selected'>;
const REVIEW = 'review';

const STATE_TEXT: Record<QuestionState, string> = {
  selected: 'Answered',
  not_sure: 'Not sure',
  skipped: 'Skipped',
  needs_follow_up: 'Needs follow-up',
  unanswered: 'Not answered',
};
const STATE_ICON: Record<QuestionState, string> = { selected: '✓', not_sure: '?', skipped: '–', needs_follow_up: '!', unanswered: '○' };

export function IntakeFlow({ user, intake, title }: { user: User; intake: Intake; title: string }) {
  const canView = can(user, 'intake.view');
  const canAnswer = can(user, 'intake.answer');

  const [answers, setAnswers] = useState<Answers>({});
  const [loaded, setLoaded] = useState(false);
  const [loadProblems, setLoadProblems] = useState<readonly string[]>([]);
  const [saveProblem, setSaveProblem] = useState<string | null>(null);
  const [actionProblem, setActionProblem] = useState<string | null>(null);
  const [current, setCurrent] = useState<string>(intake.questions[0]?.id ?? REVIEW);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const order = useMemo(() => new Map(intake.questions.map((q, i) => [q.id, i])), [intake]);
  const asked = useMemo(() => askedQuestions(intake, answers), [intake, answers]);

  /** The first asked question after this one (by the intake's order), or the review. */
  const nextAfter = useCallback(
    (id: string, now: Answers): string => {
      const from = order.get(id) ?? -1;
      return askedQuestions(intake, now).find((q) => (order.get(q.id) ?? 0) > from)?.id ?? REVIEW;
    },
    [intake, order],
  );

  // Load saved answers once, in the browser. Anything that no longer fits is listed, not dropped quietly.
  useEffect(() => {
    const stored = loadAnswers(intake.room_type);
    let start: Answers = {};
    if (stored.kind === 'problem') setLoadProblems([stored.reason]);
    if (stored.kind === 'found') {
      const checked = checkSavedAnswers(intake, stored.answers);
      start = checked.answers;
      setLoadProblems(checked.problems);
    }
    setAnswers(start);
    const firstOpen = askedQuestions(intake, start).find((q) => questionState(start, q.id) === 'unanswered');
    setCurrent(firstOpen?.id ?? REVIEW);
    setLoaded(true);
  }, [intake]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const go = useCallback((id: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setActionProblem(null);
    setCurrent(id);
  }, []);

  /** Records an answer and saves it. Returns the new answers, or null if refused. */
  const record = useCallback(
    (questionId: string, answer: { status: 'selected'; choice: Choice } | { status: Status }): Answers | null => {
      if (!canAnswer) return null;
      const result = setAnswer(intake, answers, questionId, { ...answer, by: user.id, at: new Date().toISOString() } as Answer);
      if (!result.ok) {
        setActionProblem(result.reason);
        return null;
      }
      setActionProblem(null);
      setAnswers(result.value);
      setSaveProblem(saveAnswers(intake.room_type, result.value));
      return result.value;
    },
    [answers, canAnswer, intake, user.id],
  );

  const pick = useCallback(
    (question: SingleQuestion, optionId: string) => {
      const now = record(question.id, { status: 'selected', choice: { kind: 'option', option: optionId } });
      if (!now) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        setCurrent(nextAfter(question.id, now));
      }, ADVANCE_MS);
    },
    [nextAfter, record],
  );

  const mark = useCallback(
    (question: IntakeQuestion, status: Status) => {
      const now = record(question.id, { status });
      if (now) go(nextAfter(question.id, now));
    },
    [go, nextAfter, record],
  );

  const question = current === REVIEW ? null : (asked.find((q) => q.id === current) ?? null);
  // A question that stops being asked (an earlier answer changed) moves on to the next one.
  useEffect(() => {
    if (loaded && current !== REVIEW && !question) setCurrent(nextAfter(current, answers));
  }, [answers, current, loaded, nextAfter, question]);

  const index = question ? asked.indexOf(question) : asked.length;
  const back = useCallback(() => {
    const prev = index > 0 ? asked[index - 1] : undefined;
    if (prev) go(prev.id);
  }, [asked, go, index]);
  const forward = useCallback(() => {
    if (question) go(nextAfter(question.id, answers));
  }, [answers, go, nextAfter, question]);

  // Number keys pick options; arrows move back and forward.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowLeft') back();
      else if (e.key === 'ArrowRight' && question && questionState(answers, question.id) !== 'unanswered') forward();
      else if (question?.kind === 'single' && /^[1-9]$/.test(e.key)) {
        const option = question.options[Number(e.key) - 1];
        if (option) pick(question, option.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [answers, back, forward, pick, question]);

  const startOver = () => {
    if (!window.confirm('Clear every answer and start the intake again?')) return;
    setAnswers({});
    setLoadProblems([]);
    setSaveProblem(saveAnswers(intake.room_type, {}));
    go(intake.questions[0]?.id ?? REVIEW);
  };

  if (!canView) {
    return (
      <div className={s.screen}>
        <main className={s.denied}>
          <h1>{title}</h1>
          <p>You don’t have permission to see the intake. Ask an owner or admin for the “intake.view” permission.</p>
        </main>
      </div>
    );
  }

  const sectionLabel = (id: string) => intake.sections.find((x) => x.id === id)?.label ?? id;
  const done = progress(intake, answers);

  return (
    <div className={s.screen}>
      <header className={s.header}>
        <h1 className={s.title}>{title}</h1>
        <span className={s.step}>{question ? `Question ${index + 1} of ${asked.length}` : 'Review'}</span>
        <span className={s.banner}>Preview: saved in this browser only</span>
        <span className={s.bannerWarn} title={intake.images_note}>
          Placeholder images
        </span>
        {!canAnswer && <span className={s.bannerWarn}>View only</span>}
        {saveProblem && (
          <span className={s.bannerDanger} role="alert">
            {saveProblem}
          </span>
        )}
        <span className={s.spacer} />
        <span className={s.mockNote}>{user.mocked && user.name}</span>
        <button type="button" className={s.ghost} onClick={() => go(REVIEW)} disabled={current === REVIEW}>
          Review answers
        </button>
        {canAnswer && (
          <button type="button" className={s.ghost} onClick={startOver}>
            Start over
          </button>
        )}
      </header>

      {loadProblems.length > 0 && (
        <div className={s.alert} role="alert">
          <strong>Some saved answers couldn’t be used. Those questions are shown as not answered.</strong>
          <ul>
            {loadProblems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      <div className={s.body}>
        <main className={s.workspace}>
          {!loaded ? (
            <p className={s.muted}>Loading saved answers…</p>
          ) : question ? (
            <section className={s.question} aria-labelledby="intake-prompt">
              <p className={s.section}>{sectionLabel(question.section)}</p>
              <h2 id="intake-prompt" className={s.prompt}>
                {question.prompt}
              </h2>
              {question.kind === 'single' && <SingleStep question={question} answers={answers} disabled={!canAnswer} onPick={(id) => pick(question, id)} />}
              {question.kind === 'counts' && (
                <CountsStep key={question.id} question={question} answers={answers} disabled={!canAnswer} onSave={(counts) => {
                  const now = record(question.id, { status: 'selected', choice: { kind: 'counts', counts } });
                  if (now) go(nextAfter(question.id, now));
                }} />
              )}
              {question.kind === 'pending' && <PendingStep question={question} state={questionState(answers, question.id)} disabled={!canAnswer} onFlag={() => mark(question, 'needs_follow_up')} />}
              {actionProblem && (
                <p className={s.error} role="alert">
                  {actionProblem}
                </p>
              )}
              <footer className={s.footer}>
                <button type="button" className={s.ghost} onClick={back} disabled={index === 0}>
                  ← Back
                </button>
                <span className={s.spacer} />
                {question.kind !== 'pending' && (
                  <button type="button" className={s.ghost} onClick={() => mark(question, 'not_sure')} disabled={!canAnswer} aria-pressed={questionState(answers, question.id) === 'not_sure'}>
                    Not sure
                  </button>
                )}
                <button type="button" className={s.ghost} onClick={() => mark(question, 'skipped')} disabled={!canAnswer} aria-pressed={questionState(answers, question.id) === 'skipped'}>
                  Skip
                </button>
                {questionState(answers, question.id) !== 'unanswered' && (
                  <button type="button" className={s.ghost} onClick={forward}>
                    Next →
                  </button>
                )}
              </footer>
            </section>
          ) : (
            <Review intake={intake} answers={answers} asked={asked} onGo={go} />
          )}
        </main>

        <aside className={s.summary} aria-label="Your answers">
          <p className={s.summaryHead}>
            {done.counts.selected} of {done.asked} answered
          </p>
          {intake.sections.map((section) => {
            const inSection = asked.filter((q) => q.section === section.id);
            if (inSection.length === 0) return null;
            return (
              <div key={section.id} className={s.summarySection}>
                <p className={s.summarySectionLabel}>{section.label}</p>
                {inSection.map((q) => {
                  const state = questionState(answers, q.id);
                  const picked = q.kind === 'single' ? q.options.find((o) => o.id === selectedOption(answers, q.id)) : undefined;
                  return (
                    <button key={q.id} type="button" className={`${s.summaryRow} ${q.id === current ? s.summaryRowCurrent : ''}`} onClick={() => go(q.id)} aria-current={q.id === current ? 'step' : undefined}>
                      {picked ? <OptionImage option={picked} fidelity={q.kind === 'single' ? q.fidelity : null} small /> : <span className={`${s.stateIcon} ${s[`state_${state}`] ?? ''}`} aria-hidden="true">{STATE_ICON[state]}</span>}
                      <span className={s.summaryText}>
                        <span className={s.summaryLabel}>{q.label}</span>
                        <span className={s.summaryAnswer}>{describeAnswer(q, answers[q.id])}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </aside>
      </div>
    </div>
  );
}

function SingleStep({ question, answers, disabled, onPick }: { question: SingleQuestion; answers: Answers; disabled: boolean; onPick: (optionId: string) => void }) {
  const picked = selectedOption(answers, question.id);
  const n = question.options.length;
  const columns = n <= 4 ? n : n <= 6 ? 3 : 4;
  return (
    // Many options get wider, shorter pictures so the whole question fits on one screen (UX_BRIEF screen 04).
    <div className={`${s.grid} ${n > 6 ? s.dense : ''}`} style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, ${n <= 2 ? '400px' : '1fr'}))` }} role="group" aria-label={question.prompt}>
      {question.options.map((option, i) => {
        const selected = option.id === picked;
        return (
          <button key={option.id} type="button" className={`${s.card} ${selected ? s.cardSelected : ''}`} aria-label={option.label} aria-pressed={selected} disabled={disabled} onClick={() => onPick(option.id)}>
            <OptionImage option={option} fidelity={question.fidelity} />
            <span className={s.cardLabel}>
              {i < 9 && <kbd className={s.key}>{i + 1}</kbd>}
              {option.label}
              {selected && <span className={s.check}>✓ Selected</span>}
            </span>
            {option.description && <span className={s.cardDescription}>{option.description}</span>}
            {option.shows_price && <span className={s.priceMissing}>⚠ Cost of drawers: not available yet. Live pricing isn’t built.</span>}
          </button>
        );
      })}
    </div>
  );
}

function CountsStep({ question, answers, disabled, onSave }: { question: CountsQuestion; answers: Answers; disabled: boolean; onSave: (counts: Record<string, number>) => void }) {
  const saved = answers[question.id];
  const [counts, setCounts] = useState<Record<string, number>>(() => {
    const start: Record<string, number> = {};
    for (const item of question.items) start[item.id] = saved?.status === 'selected' && saved.choice.kind === 'counts' ? (saved.choice.counts[item.id] ?? 0) : 0;
    return start;
  });
  const change = (id: string, by: number) => setCounts((c) => ({ ...c, [id]: Math.max(0, (c[id] ?? 0) + by) }));
  return (
    <div className={s.counts}>
      {question.items.map((item) => (
        <div key={item.id} className={s.countRow} role="group" aria-label={item.label}>
          <span className={s.countLabel}>{item.label}</span>
          <button type="button" className={s.stepper} aria-label={`Fewer: ${item.label}`} disabled={disabled || (counts[item.id] ?? 0) === 0} onClick={() => change(item.id, -1)}>
            −
          </button>
          <output className={s.countValue} aria-label={`${item.label} count`}>
            {counts[item.id] ?? 0}
          </output>
          <button type="button" className={s.stepper} aria-label={`More: ${item.label}`} disabled={disabled} onClick={() => change(item.id, 1)}>
            +
          </button>
          <span className={s.muted}>{(counts[item.id] ?? 0) === 0 ? 'None' : ''}</span>
        </div>
      ))}
      <div>
        <button type="button" className={s.primary} disabled={disabled} onClick={() => onSave(counts)}>
          Save and continue
        </button>
      </div>
    </div>
  );
}

function PendingStep({ question, state, disabled, onFlag }: { question: PendingQuestion; state: QuestionState; disabled: boolean; onFlag: () => void }) {
  return (
    <div className={s.pending}>
      <p className={s.pendingTitle}>⚠ Options not supplied yet</p>
      <p>{question.waiting_on}</p>
      {state === 'needs_follow_up' ? (
        <p className={s.flagged}>! Flagged for follow-up</p>
      ) : (
        <button type="button" className={s.primary} disabled={disabled} onClick={onFlag}>
          Flag for follow-up
        </button>
      )}
    </div>
  );
}

function Review({ intake, answers, asked, onGo }: { intake: Intake; answers: Answers; asked: readonly IntakeQuestion[]; onGo: (id: string) => void }) {
  const p = progress(intake, answers);
  const open = asked.filter((q) => questionState(answers, q.id) !== 'selected');
  const parts = (['needs_follow_up', 'not_sure', 'skipped', 'unanswered'] as const).filter((k) => p.counts[k] > 0).map((k) => `${p.counts[k]} ${STATE_TEXT[k].toLowerCase()}`);
  return (
    <section className={s.question} aria-labelledby="intake-review">
      <p className={s.section}>Review</p>
      <h2 id="intake-review" className={s.prompt}>
        {p.complete ? `All ${p.asked} questions answered` : `${p.counts.selected} of ${p.asked} questions answered`}
      </h2>
      {parts.length > 0 && <p className={s.reviewParts}>{parts.join(' · ')}</p>}
      {open.length > 0 && (
        <ul className={s.openList} aria-label="Still open">
          {open.map((q) => {
            const state = questionState(answers, q.id);
            return (
              <li key={q.id}>
                <span className={`${s.stateIcon} ${s[`state_${state}`] ?? ''}`} aria-hidden="true">
                  {STATE_ICON[state]}
                </span>
                <span className={s.openText}>
                  {q.label} <span className={s.muted}>({STATE_TEXT[state]})</span>
                </span>
                <button type="button" className={s.ghost} onClick={() => onGo(q.id)}>
                  Go to
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <footer className={s.footer}>
        <span className={s.muted}>Not sent anywhere yet: there are no jobs to attach these answers to.</span>
        <span className={s.spacer} />
        <button
          type="button"
          className={s.primary}
          onClick={() =>
            downloadJson(`${intake.room_type}-intake-answers.json`, {
              room_type: intake.room_type,
              asked: asked.map((q) => q.id),
              answers: Object.fromEntries(asked.filter((q) => answers[q.id]).map((q) => [q.id, answers[q.id]])),
            })
          }
        >
          Download answers
        </button>
      </footer>
    </section>
  );
}
