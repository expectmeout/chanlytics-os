"use client";

import { useEffect, useRef, useState } from "react";
import {
  PASSWORD_WORDS,
  SIGNUP_WORDS,
  emailNotConfirmed,
  requestCodeWords,
  verifyCodeWords,
} from "@chanlytics/contracts";
import { createClient } from "@/lib/supabase/client";
import { clearSurfaceCache } from "@/legacy-bridge/surface-cache";
import GoogleSignIn from "@/auth/GoogleSignIn";
import CodeStep from "@/auth/CodeStep";
import AuthShell from "@/auth/AuthShell";
import { authErrorInHash, OAUTH_CANCELLED } from "@/auth/hash-error";
import { pathAfterSignIn } from "@/auth/second-factor";

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
  // Reached the code step because the ADDRESS was never confirmed, not because
  // they asked for a code. The two want different resends and different words.
  const [unconfirmed, setUnconfirmed] = useState(false);
  const fieldRef = useRef<HTMLInputElement | null>(null);

  // autoFocus is a no-op under SSR: the input already exists in the server
  // HTML, so React hydrates the node and never calls .focus(). Focus
  // explicitly on mount and again when the code step hands back — otherwise
  // returning to this form starts with a dead click into the page.
  useEffect(() => {
    fieldRef.current?.focus();
  }, [stage]);

  // Back from Google without a session: the callback says so once, here.
  useEffect(() => {
    // The provider's own refusal arrives in the FRAGMENT, which no server ever
    // saw (src/auth/hash-error.ts). It rode the callback's redirect to get
    // here, so this is the first code that can read it -- and it must come off
    // the address before the branches below, which deliberately KEEP the hash.
    const refused = authErrorInHash(window.location.hash);
    if (refused) {
      // Pressing Cancel is not a failure to apologise for.
      if (refused.error !== OAUTH_CANCELLED) setError(SIGNUP_WORDS.googleFailed);
      console.warn("oauth_provider_refused", JSON.stringify(refused));
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    const q = new URLSearchParams(window.location.search);
    if (q.get("error") === "oauth") {
      setError(SIGNUP_WORDS.googleFailed);
      window.history.replaceState(null, "", window.location.pathname + window.location.hash);
    }
    const e = q.get("email");
    if (e) {
      setEmail(e);
      // ...and the hash, like the branch above it. landed() navigates to
      // "/" + window.location.hash, so dropping it here sent anyone arriving
      // from /signup or a reset link -- both of which build `?email=` URLs --
      // to the home surface instead of the thread they were sent to.
      window.history.replaceState(null, "", window.location.pathname + window.location.hash);
    }
  }, []);

  /** In, whichever door opened, or to the second step first when the account has an authenticator (0013). Deep
   *  links survive: the browser carries the hash through the middleware's redirect, and a full navigation re-runs it. */
  async function landed() {
    // Whoever signs in next must not inherit the previous account's cached
    // conversations. Sign-out already clears this; sign-in is the other half.
    clearSurfaceCache();
    window.location.assign((await pathAfterSignIn(supabase)) + window.location.hash);
  }

  async function signInWithPassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNudge(false);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) {
      // THE ONE REFUSAL THAT IS SAFE TO EXPLAIN. Requiring confirmation created
      // a state where the password is right and the address was never proved,
      // and the neutral sentence below would send that person off to reset a
      // password that is not the problem. Only a caller who already supplied
      // the correct password for an existing account gets here, so they learn
      // nothing they did not know. Send a fresh confirmation and show it.
      if (emailNotConfirmed(error)) {
        // The resend's own answer decides whether to show the code box. It was
        // discarded, so a refusal -- Supabase rate-limits confirmation mail to
        // one a minute, which is exactly the window someone who just signed up
        // is in -- still put the person in front of six digits that were not
        // coming. /api/v1/signup refuses to do this on the route beside it for
        // the same reason.
        const { error: resendErr } = await supabase.auth.resend({ type: "signup", email: email.trim() });
        if (resendErr) {
          setError(requestCodeWords(resendErr));
          return;
        }
        setUnconfirmed(true);
        setStage("code");
        return;
      }
      // One sentence for all three cases Supabase refuses to distinguish: an
      // address nobody has, a wrong password, and an account that only ever
      // arrived through Google. Every improvement to this sentence would be an
      // oracle for who has an account; the nudge below is shown to everybody,
      // so it helps the third case without answering for the first.
      setError(PASSWORD_WORDS.wrong);
      setNudge(true);
      return;
    }
    await landed();
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
    <AuthShell>
      <div className="auth-card">
        {/* Not "Sign in": the button says that, and the sentence under it said
            it a third time. This door is for somebody who has been here. */}
        <h1>{stage === "code" ? "Check your email" : "Welcome back"}</h1>
        <p>
          {stage !== "code"
            ? "Sign in to your workspace."
            : unconfirmed
              ? SIGNUP_WORDS.confirmFromSignIn(email.trim())
              : "We sent a one-time code to your work email."}
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
              <button
                type="button"
                className="auth-linkbtn"
                onClick={() => void sendCode()}
                disabled={busy || !email.trim()}
              >
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
              await landed();
              return null;
            }}
            onResend={async () => {
              // An unconfirmed account is resent a CONFIRMATION; asking for a
              // sign-in code instead would be a different credential for a door
              // this account has not opened yet.
              const { error } = unconfirmed
                ? await supabase.auth.resend({ type: "signup", email: email.trim() })
                : await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: false } });
              return error ? requestCodeWords(error) : null;
            }}
            onBack={() => {
              setStage("password");
              setError(null);
              setUnconfirmed(false);
            }}
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
        <div className="hint">
          {SIGNUP_WORDS.newHere} <a href="/signup">Create your workspace</a>
        </div>
      </div>
    </AuthShell>
  );
}
