"use client";

import { useEffect, useRef, useState } from "react";
import { PASSWORD_WORDS, SIGNUP_WORDS, requestCodeWords, verifyCodeWords } from "@chanlytics/contracts";
import { createClient } from "@/lib/supabase/client";
import { clearSurfaceCache } from "@/legacy-bridge/surface-cache";
import GoogleSignIn from "@/auth/GoogleSignIn";
import CodeStep from "@/auth/CodeStep";

// The words for each failure and the resend wait live in contracts
// (requestCodeWords, verifyCodeWords, resendLeft), where they are executed;
// the page only shows them.

/**
 * Sign-in: a password, with Google above it and a code below it.
 *
 * THE CODE DOOR IS NOT DECORATION AND IS NOT DEPRECATED. Every account that
 * existed before the password shipped has no password at all -- the operators
 * inside today, and everyone an owner has ever invited, since an invitation
 * creates an account with no credential. A password-only sign-in page locks
 * all of them out on the morning it deploys. It is also how a person on a
 * borrowed machine gets in, and it is what a reset is made of.
 *
 * Neither form says whether an address has an account. The password door
 * cannot: Supabase answers an unknown address, a wrong password and a
 * Google-only account with the same error, and this page keeps it that way.
 * The code door must not: it reaches the code step on the failure path too,
 * so "no such account" and "code sent" look identical from outside.
 */
export default function LoginPage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [stage, setStage] = useState<"password" | "code">("password");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nudge, setNudge] = useState(false);
  const fieldRef = useRef<HTMLInputElement | null>(null);

  // autoFocus is a no-op under SSR: the input already exists in the server
  // HTML, so React hydrates the node and never calls .focus(). Focus
  // explicitly on mount and again when the code step hands back — otherwise
  // returning to this form starts with a dead click into the page.
  useEffect(() => { fieldRef.current?.focus(); }, [stage]);

  // Back from Google without a session: the callback says so once, here.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("error") === "oauth") {
      setError(SIGNUP_WORDS.googleFailed);
      window.history.replaceState(null, "", window.location.pathname + window.location.hash);
    }
    const e = q.get("email");
    if (e) {
      setEmail(e);
      window.history.replaceState(null, "", window.location.pathname + window.location.hash);
    }
  }, []);

  /** In, whichever door opened. Deep links survive: the browser carries the
   *  hash through the middleware's redirect, and a full navigation re-runs it. */
  function landed() {
    // Whoever signs in next must not inherit the previous account's cached
    // conversations. Sign-out already clears this; sign-in is the other half.
    clearSurfaceCache();
    window.location.assign("/" + window.location.hash);
  }

  async function signInWithPassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNudge(false);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) {
      // One sentence for all three cases Supabase refuses to distinguish: an
      // address nobody has, a wrong password, and an account that only ever
      // arrived through Google. Every improvement to this sentence would be an
      // oracle for who has an account; the nudge below is shown to everybody,
      // so it helps the third case without answering for the first.
      setError(PASSWORD_WORDS.wrong);
      setNudge(true);
      return;
    }
    landed();
  }

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      // Belt and braces: the project refuses signups at this endpoint server-side
      // too, so this flag is not the only thing keeping the code door shut to
      // addresses nobody has.
      options: { shouldCreateUser: false },
    });
    setBusy(false);

    const shown = error ? requestCodeWords(error) : null;
    if (shown) {
      setError(shown);
      return;
    }
    // Advance on success AND on a swallowed "no such account", so the two are
    // indistinguishable from the outside. Someone who cannot read that inbox
    // learns nothing; someone who can gets their code.
    setError(null);
    setStage("code");
  }

  return (
    <main className="auth-card">
      <h1>Chanlytics OS</h1>
      <p>
        {stage === "code"
          ? "We sent a one-time code to your work email."
          : "Sign in to your workspace."}
      </p>

      {stage === "password" && <GoogleSignIn next={() => "/" + window.location.hash} />}

      {stage === "password" ? (
        <form onSubmit={signInWithPassword}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            ref={fieldRef}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@business.com"
          />
          <label htmlFor="password">{PASSWORD_WORDS.label}</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••••••"
          />
          <button disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
          <div className="auth-row">
            <button type="button" className="auth-linkbtn" onClick={() => void sendCode()} disabled={busy || !email.trim()}>
              {PASSWORD_WORDS.codeInstead}
            </button>
            <a href={`/reset-password${email.trim() ? `?email=${encodeURIComponent(email.trim())}` : ""}`}>
              {PASSWORD_WORDS.forgot}
            </a>
          </div>
        </form>
      ) : (
        <CodeStep
          email={email.trim()}
          label={`Enter the 6-digit code sent to ${email.trim()}`}
          submitLabel="Sign in"
          onSubmit={async (typed) => {
            const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: typed, type: "email" });
            if (error) return verifyCodeWords(error.message);
            landed();
            return null;
          }}
          onResend={async () => {
            const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: false } });
            return error ? requestCodeWords(error) : null;
          }}
          onBack={() => { setStage("password"); setError(null); }}
          backLabel={PASSWORD_WORDS.passwordInstead}
        />
      )}

      {/* role=alert: a refused sign-in must be ANNOUNCED, not just painted — a
          screen-reader user otherwise hears nothing and resubmits into
          silence. The region stays mounted so repeat errors re-fire. */}
      <div role="alert" aria-live="assertive">
        {error && <div className="error">{error}</div>}
        {nudge && <div className="hint">{PASSWORD_WORDS.wrongNudge}</div>}
      </div>
      <div className="hint">{SIGNUP_WORDS.newHere} <a href="/signup">Create your workspace</a></div>
      <div className="hint auth-legal"><a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></div>
    </main>
  );
}
