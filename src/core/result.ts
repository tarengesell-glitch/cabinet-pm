/**
 * The result of anything that can be refused. Core never throws for bad input:
 * it returns a plain-language reason the caller must show (rule 7).
 */
export type Result<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: string };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const refuse = <T = never>(reason: string): Result<T> => ({ ok: false, reason });
