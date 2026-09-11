"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SIGNIN_RESEND_COOLDOWN_S, SIGNUP_WORDS, requestCodeWords, resendLeft, verifyCodeWords } from "@chanlytics/contracts";
import { createClient } from "@/lib/supabase/client";
import { clearSurfaceCache } from "@/legacy-bridge/surface-cache";
import GoogleSignIn from "@/auth/GoogleSignIn";

// The words for each failure and the resend wait live in contracts
// (requestCodeWords, verifyCodeWords, resendLeft), where they are executed;
// the page only shows them.

/**
 * Email OTP-code sign-in (no magic-link redirect allowlist to manage).
 * Step 1: email -> Supabase sends a 6-digit code. Step 2: verify the code.
 */
export default function LoginPage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const cooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const sentAt = useRef<number | null>(null);
  const fieldRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => () => { if (cooldownTimer.current) clearInterval(cooldownTimer.current); }, []);

  // autoFocus is a no-op under SSR: the input already exists in the server
  // HTML, so React hydrates the node and never calls .focus(). Focus
  // explicitly on mount and again when the email step hands off to the code
  // step — otherwise every sign-in starts with a dead click into the page.
  useEffect(() => { fieldRef.current?.focus(); }, [stage]);

  const startCooldown = useCallback(() => {
    sentAt.current = Date.now();
    setCooldown(SIGNIN_RESEND_COOLDOWN_S);
    if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    // The wait is counted from when the code went, not from ticks: a tab that
    // slept counts what really passed.
    cooldownTimer.current = setInterval(() => {
      const left = resendLeft(sentAt.current, Date.now());
      setCooldown(left);
      if (left <= 0 && cooldownTimer.current) clearInterval(cooldownTimer.current);
    }, 1000);
  }, []);

  // Arriving from sign-up: the code is already on its way to this address, so
  // the page opens at the code step for it. Read on the client, once; the
  // query never reaches a server log of this page's own making.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    // Back from Google without a session: the callback says so once, here.
    if (q.get("error") === "oauth") {
      setError(SIGNUP_WORDS.googleFailed);
      window.history.replaceState(null, "", window.location.pathname + window.location.hash);
    }
    const e = q.get("email");
    if (e && q.get("sent") === "1") {
      setEmail(e);
      setStage("code");
      startCooldown();
      window.history.replaceState(null, "", window.location.pathname + window.location.hash);
    }
  }, [startCooldown]);

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      // Belt and braces: the project now refuses signups server-side too, so
      // this flag is no longer the only thing making the product invite-only.
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
    startCooldown();
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: "email",
    });
    setBusy(false);
    if (error) setError(verifyCodeWords(error.message));
    else {
      // Whoever signs in next must not inherit the previous account's cached
      // conversations. Sign-out already clears this; sign-in is the other half
      // (a session can also expire without anyone pressing anything).
      clearSurfaceCache();
      // Deep links survive sign-in: the middleware redirect keeps the #/route
      // fragment (browsers carry the hash through redirects), but
      // router.replace("/") threw it away — anyone following a link to a
      // specific thread landed on Today instead. A full navigation also
      // re-runs the middleware naturally, which router.refresh() was
      // compensating for.
      window.location.assign("/" + window.location.hash);
    }
  }

  return (
    <main className="auth-card">
      <h1>Chanlytics OS</h1>
      <p>Sign in with Google, or with a code sent to your work email.</p>
      {/* Deep links survive Google too: the hash rides in `next`, and the
          callback lands on it. */}
      {stage === "email" && <GoogleSignIn next={() => "/" + window.location.hash} />}
      {stage === "email" ? (
        <form onSubmit={sendCode}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            ref={fieldRef}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@business.com"
          />
          <button disabled={busy}>{busy ? "Sending code…" : "Email me a code"}</button>
        </form>
      ) : (
        <form onSubmit={verifyCode}>
          <label htmlFor="code">Enter the 6-digit code sent to {email.trim()}</label>
          <input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
            ref={fieldRef}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123456"
          />
          <button disabled={busy}>{busy ? "Verifying…" : "Sign in"}</button>
          <div className="hint">
            {cooldown > 0 ? (
              <span>Didn&apos;t get it? Resend in {cooldown}s. </span>
            ) : (
              <button
                type="button"
                onClick={() => void sendCode()}
                disabled={busy}
                style={{ background: "none", border: "none", color: "inherit", textDecoration: "underline", cursor: "pointer", padding: 0, font: "inherit", width: "auto" }}
              >
                Resend code
              </button>
            )}
            <button
              type="button"
              onClick={() => { setStage("email"); setCode(""); setError(null); }}
              style={{ background: "none", border: "none", color: "inherit", textDecoration: "underline", cursor: "pointer", padding: 0, font: "inherit", width: "auto", marginLeft: 8 }}
            >
              Use a different email
            </button>
          </div>
        </form>
      )}
      {/* role=alert: a wrong code must be ANNOUNCED, not just painted — a
          screen-reader user otherwise hears nothing and resubmits into
          silence. aria-live region stays mounted so repeat errors re-fire. */}
      <div role="alert" aria-live="assertive">
        {error && <div className="error">{error}</div>}
      </div>
      <div className="hint">New to Chanlytics? <a href="/signup">Create your workspace</a></div>
      <div className="hint auth-legal"><a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></div>
    </main>
  );
}
