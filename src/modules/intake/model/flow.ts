/**
 * Answers and the order of the intake. Pure functions: no clock, no storage. The screen passes
 * in who answered and when. Option IDs are the source of truth, never labels (DATA_MODEL "intake").
 */
import type { Intake, IntakeQuestion } from './intake';

/** DATA_MODEL "intake_answers". "confirmed" is set later by a designer, not in the intake itself. */
export type AnswerStatus = 'selected' | 'not_sure' | 'skipped' | 'needs_follow_up';

export type Choice = { readonly kind: 'option'; readonly option: string } | { readonly kind: 'counts'; readonly counts: Readonly<Record<string, number>> };

export type Answer =
  | { readonly status: 'selected'; readonly choice: Choice; readonly by: string; readonly at: string }
  | { readonly status: 'not_sure' | 'skipped' | 'needs_follow_up'; readonly by: string; readonly at: string };

/** Keyed by question ID. */
export type Answers = Readonly<Record<string, Answer>>;

/** The selected option of a pick-one question, or null. */
export function selectedOption(answers: Answers, questionId: string): string | null {
  const a = answers[questionId];
  return a?.status === 'selected' && a.choice.kind === 'option' ? a.choice.option : null;
}

/**
 * The questions asked, in order, given the answers so far. A question is asked when each of its
 * conditions names an asked question whose selected option is in the list. An answer to a question
 * no longer asked is kept (it comes back if the earlier answer changes back) but doesn't count.
 */
export function askedQuestions(intake: Intake, answers: Answers): readonly IntakeQuestion[] {
  const asked = new Set<string>();
  const result: IntakeQuestion[] = [];
  for (const q of intake.questions) {
    const holds = q.show_if.every((c) => {
      const picked = selectedOption(answers, c.question);
      return asked.has(c.question) && picked !== null && c.any_of.includes(picked);
    });
    if (!holds) continue;
    asked.add(q.id);
    result.push(q);
  }
  return result;
}

/** Which answers a question can take. A pending question has no options, so it can't be "selected". */
export function allowedStatuses(question: IntakeQuestion): readonly AnswerStatus[] {
  return question.kind === 'pending' ? ['needs_follow_up', 'skipped'] : ['selected', 'not_sure', 'skipped', 'needs_follow_up'];
}

/** Why this answer doesn't fit the question, or null if it does. */
export function answerProblem(question: IntakeQuestion, answer: Answer): string | null {
  if (!allowedStatuses(question).includes(answer.status)) return `"${question.label}" can't be marked ${answer.status.replaceAll('_', ' ')}`;
  if (answer.status !== 'selected') return null;
  const { choice } = answer;
  if (question.kind === 'single') {
    if (choice.kind !== 'option') return `"${question.label}" needs one option picked`;
    if (!question.options.some((o) => o.id === choice.option)) return `"${question.label}" has no option "${choice.option}"`;
    return null;
  }
  if (question.kind === 'counts') {
    if (choice.kind !== 'counts') return `"${question.label}" needs a number for each item`;
    for (const item of question.items) {
      const n = choice.counts[item.id];
      if (n === undefined) return `"${question.label}" has no number for ${item.label}`;
      if (!Number.isInteger(n) || n < 0) return `"${question.label}": ${item.label} must be a whole number, 0 or more`;
    }
    for (const id of Object.keys(choice.counts)) {
      if (!question.items.some((i) => i.id === id)) return `"${question.label}" has no item "${id}"`;
    }
    return null;
  }
  return `"${question.label}" has no options yet`;
}

/** Sets one answer, refusing one that doesn't fit the question. */
export function setAnswer(intake: Intake, answers: Answers, questionId: string, answer: Answer): { ok: true; value: Answers } | { ok: false; reason: string } {
  const question = intake.questions.find((q) => q.id === questionId);
  if (!question) return { ok: false, reason: `There is no question "${questionId}"` };
  const problem = answerProblem(question, answer);
  if (problem) return { ok: false, reason: problem };
  return { ok: true, value: { ...answers, [questionId]: answer } };
}

const AnswerShape = (value: unknown): value is Answer => {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.by !== 'string' || typeof v.at !== 'string') return false;
  if (v.status === 'not_sure' || v.status === 'skipped' || v.status === 'needs_follow_up') return true;
  if (v.status !== 'selected' || typeof v.choice !== 'object' || v.choice === null) return false;
  const c = v.choice as Record<string, unknown>;
  if (c.kind === 'option') return typeof c.option === 'string';
  return c.kind === 'counts' && typeof c.counts === 'object' && c.counts !== null && Object.values(c.counts).every((n) => typeof n === 'number');
};

/**
 * Checks saved answers against the intake (it may have changed since they were saved).
 * Answers that no longer fit are not used, and each one is listed as a problem to show.
 */
export function checkSavedAnswers(intake: Intake, saved: unknown): { answers: Answers; problems: readonly string[] } {
  if (typeof saved !== 'object' || saved === null || Array.isArray(saved)) return { answers: {}, problems: ['The saved answers are not in the right shape, so none could be used.'] };
  const answers: Record<string, Answer> = {};
  const problems: string[] = [];
  for (const [id, value] of Object.entries(saved)) {
    const question = intake.questions.find((q) => q.id === id);
    if (!question) {
      problems.push(`A saved answer is for "${id}", which is no longer asked.`);
      continue;
    }
    if (!AnswerShape(value)) {
      problems.push(`The saved answer for "${question.label}" can't be read.`);
      continue;
    }
    const problem = answerProblem(question, value);
    if (problem) {
      problems.push(`The saved answer for "${question.label}" no longer fits: ${problem}.`);
      continue;
    }
    answers[id] = value;
  }
  return { answers, problems };
}

export type QuestionState = AnswerStatus | 'unanswered';

export interface Progress {
  readonly asked: number;
  readonly counts: Readonly<Record<QuestionState, number>>;
  /** True only when every question asked has a picked answer. */
  readonly complete: boolean;
}

export function questionState(answers: Answers, questionId: string): QuestionState {
  return answers[questionId]?.status ?? 'unanswered';
}

export function progress(intake: Intake, answers: Answers): Progress {
  const asked = askedQuestions(intake, answers);
  const counts: Record<QuestionState, number> = { selected: 0, not_sure: 0, skipped: 0, needs_follow_up: 0, unanswered: 0 };
  for (const q of asked) counts[questionState(answers, q.id)] += 1;
  return { asked: asked.length, counts, complete: asked.length > 0 && counts.selected === asked.length };
}

/** The answer in words, for the summary. */
export function describeAnswer(question: IntakeQuestion, answer: Answer | undefined): string {
  if (!answer) return 'Not answered';
  if (answer.status !== 'selected') return { not_sure: 'Not sure', skipped: 'Skipped', needs_follow_up: 'Needs follow-up' }[answer.status];
  const { choice } = answer;
  if (choice.kind === 'option' && question.kind === 'single') return question.options.find((o) => o.id === choice.option)?.label ?? choice.option;
  if (choice.kind === 'counts' && question.kind === 'counts') {
    const picked = question.items.filter((i) => (choice.counts[i.id] ?? 0) > 0).map((i) => `${choice.counts[i.id]} ${i.label.toLowerCase()}`);
    return picked.length > 0 ? picked.join(', ') : 'None';
  }
  return 'Answered';
}
