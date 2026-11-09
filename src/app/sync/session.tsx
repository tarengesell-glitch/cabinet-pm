'use client';
/**
 * Who is using the site. With the shared database set up (the live site), only signed-in staff
 * get past the gate. Without it (a developer's machine, the automated tests), the site keeps
 * work in the browser only and says so on screen, with the labelled preview user (rule 14).
 */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { PREVIEW_USER, sendSignInLink, signedInStaff, signOut, supabaseBackend, supabaseClient, supabaseSettings, type StoreBackend, type User } from '@/platform/index';
import s from './sync.module.css';

export type Session =
  | { readonly mode: 'browser_only'; readonly user: User }
  | { readonly mode: 'database'; readonly user: User; readonly backend: StoreBackend; readonly signOut: () => void };

/** Decided when the site is built: the settings are written into the pages then. */
export const DATABASE_SET_UP = supabaseSettings().ok;

const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const s = useContext(SessionContext);
  if (!s) throw new Error('This screen must sit inside the staff gate.');
  return s;
}

type GateState =
  | { readonly kind: 'checking' }
  | { readonly kind: 'signed_out' }
  | { readonly kind: 'refused'; readonly reason: string }
  | { readonly kind: 'in'; readonly session: Session };

/** Shows its children only to signed-in staff (or, without the database, to the preview user). */
export function StaffGate({ children }: { children: ReactNode }) {
  if (!DATABASE_SET_UP) {
    return <SessionContext.Provider value={{ mode: 'browser_only', user: PREVIEW_USER }}>{children}</SessionContext.Provider>;
  }
  return <DatabaseGate>{children}</DatabaseGate>;
}

function DatabaseGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>({ kind: 'checking' });

  const check = useCallback(async () => {
    const client = supabaseClient();
    if (!client.ok) return setState({ kind: 'refused', reason: client.reason });
    const backend = supabaseBackend(client.value);
    const staff = await signedInStaff(backend);
    if (staff.ok) {
      const out = () => {
        void signOut(client.value).then((r) => (r.ok ? setState({ kind: 'signed_out' }) : setState({ kind: 'refused', reason: r.reason })));
      };
      return setState({ kind: 'in', session: { mode: 'database', user: staff.value, backend, signOut: out } });
    }
    const session = await client.value.auth.getSession().catch(() => null);
    setState(session?.data.session ? { kind: 'refused', reason: staff.reason } : { kind: 'signed_out' });
  }, []);

  useEffect(() => {
    void check();
    const client = supabaseClient();
    if (!client.ok) return;
    // Opening the emailed link signs the person in on this page; check again when it does.
    const { data } = client.value.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') void check();
    });
    return () => data.subscription.unsubscribe();
  }, [check]);

  if (state.kind === 'checking') return <p className={s.centre}>Checking who is signed in…</p>;
  if (state.kind === 'signed_out') return <SignIn />;
  if (state.kind === 'refused') return <Refused reason={state.reason} />;
  return <SessionContext.Provider value={state.session}>{children}</SessionContext.Provider>;
}

function SignIn() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const send = async () => {
    const client = supabaseClient();
    if (!client.ok) return setProblem(client.reason);
    setBusy(true);
    const r = await sendSignInLink(client.value, email, window.location.href);
    setBusy(false);
    if (r.ok) setSent(true);
    else setProblem(r.reason);
  };
  return (
    <main className={s.card}>
      <h1 className={s.heading}>Sign in</h1>
      {sent ? (
        <p role="status">
          A sign-in link is on its way to <strong>{email.trim()}</strong>. Open it on this device; it brings you back here, signed in.
        </p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <label className={s.label} htmlFor="sign-in-email">
            Your email
          </label>
          <input id="sign-in-email" className={s.input} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className={s.primary} type="submit" disabled={busy || email.trim() === ''}>
            {busy ? 'Sending…' : 'Email me a sign-in link'}
          </button>
          <p className={s.hint}>Only people the owner has invited can sign in.</p>
        </form>
      )}
      {problem && (
        <p className={s.error} role="alert">
          {problem}
        </p>
      )}
    </main>
  );
}

function Refused({ reason }: { reason: string }) {
  return (
    <main className={s.card}>
      <h1 className={s.heading}>Can’t open the platform</h1>
      <p className={s.error} role="alert">
        {reason}
      </p>
      <button
        className={s.secondary}
        onClick={() => {
          const client = supabaseClient();
          if (client.ok) void signOut(client.value).then(() => window.location.reload());
          else window.location.reload();
        }}
      >
        Sign out and try another account
      </button>
    </main>
  );
}

/** "Signed in as …" with a sign-out button, or the browser-only label. */
export function WhoIsIn() {
  const session = useSession();
  if (session.mode === 'browser_only') return <span className={s.who}>{session.user.name}</span>;
  return (
    <span className={s.who}>
      {session.user.name} ·{' '}
      <button className={s.link} onClick={session.signOut}>
        Sign out
      </button>
    </span>
  );
}
