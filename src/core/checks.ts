/**
 * The check interface (BUILD_SPEC section 7, ARCHITECTURE "Validation").
 * Core defines it; each module provides its own checks through its contract,
 * and the app registers them, so Core never knows who they are.
 */
import type { Job } from './schema/master-copy';

/** BUILD_SPEC section 7 layers, plus the release layer (OA-5). */
export type Layer = 'layout' | 'buildability' | 'design_rules' | 'translation_preflight' | 'approval' | 'release';

export type Severity = 'block' | 'warn';

export interface IssueRef {
  readonly kind: 'job' | 'room' | 'wall' | 'opening' | 'obstacle' | 'run' | 'appliance' | 'item';
  readonly id: string;
}

export interface Issue {
  readonly check_id: string;
  readonly severity: Severity;
  /** Plain language, for the designer. */
  readonly message: string;
  readonly ref: IssueRef;
}

/** Anything a check needs beyond the master copy (catalog, shop settings…), passed in. */
export type CheckContext = Readonly<Record<string, unknown>>;

export interface Check<Ctx extends CheckContext = CheckContext> {
  readonly id: string;
  readonly layer: Layer;
  /** One line saying what the check looks for. */
  readonly description: string;
  run(job: Job, context: Ctx): readonly Issue[];
}

export interface CheckRun {
  readonly issues: readonly Issue[];
  /** True only when no issue blocks. Warnings don't block. */
  readonly passed: boolean;
}

/**
 * Runs every check. Fails closed: a check that crashes, or two checks sharing an ID,
 * becomes a blocking issue instead of being skipped.
 */
export function runChecks<Ctx extends CheckContext>(
  checks: readonly Check<Ctx>[],
  job: Job,
  context: Ctx,
): CheckRun {
  const issues: Issue[] = [];
  const ids = new Set<string>();
  for (const check of checks) {
    if (ids.has(check.id)) {
      issues.push({
        check_id: check.id,
        severity: 'block',
        message: `Two checks share the ID "${check.id}", so their results can't be told apart. This is a software fault.`,
        ref: { kind: 'job', id: job.job_id },
      });
      continue;
    }
    ids.add(check.id);
    try {
      issues.push(...check.run(job, context));
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error);
      issues.push({
        check_id: check.id,
        severity: 'block',
        message: `The check "${check.description}" could not run (${why}). The job can't pass until it does.`,
        ref: { kind: 'job', id: job.job_id },
      });
    }
  }
  return { issues, passed: !issues.some((i) => i.severity === 'block') };
}
