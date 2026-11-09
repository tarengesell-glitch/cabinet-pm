/**
 * Sign-in by email link (Supabase Auth). Only people the owner has invited can sign in: the link
 * is never sent to an address that has no account (`shouldCreateUser: false`). Being able to sign
 * in is not enough to see anything; the person must also be on the staff list (`signedInStaff`).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { ok, refuse, type Result } from '@/core/index';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Emails a sign-in link that brings the person back to `returnTo` (a page on this site). */
export async function sendSignInLink(client: SupabaseClient, email: string, returnTo: string): Promise<Result<void>> {
  const address = email.trim();
  if (!EMAIL.test(address)) return refuse(`"${email}" is not an email address.`);
  try {
    const { error } = await client.auth.signInWithOtp({ email: address, options: { shouldCreateUser: false, emailRedirectTo: returnTo } });
    if (error) return refuse(`The sign-in link wasn't sent: ${error.message}. Only people the owner has invited can sign in.`);
    return ok(undefined);
  } catch (e) {
    return refuse(`The sign-in link wasn't sent: the shared database couldn't be reached (${e instanceof Error ? e.message : String(e)}).`);
  }
}

export async function signOut(client: SupabaseClient): Promise<Result<void>> {
  try {
    const { error } = await client.auth.signOut();
    if (error) return refuse(`Signing out failed: ${error.message}.`);
    return ok(undefined);
  } catch (e) {
    return refuse(`Signing out failed: ${e instanceof Error ? e.message : String(e)}.`);
  }
}
