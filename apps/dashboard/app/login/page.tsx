"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { clearSurfaceCache } from "@/legacy-bridge/surface-cache";

const RESEND_COOLDOWN_S = 60;

/** Raw Supabase auth errors, translated for humans. */
function friendlyError(message: string): string {
  if (/signups not allowed/i.test(message)) {
    return "This email isn't on a Chanlytics workspace yet — ask your Chanlytics contact to add you.";
  }
  const wait = /after (\d+) seconds/.exec(message);
  if (/security purposes/i.test(message) && wait) {
    return `Please wait ${wait[1]}s before requesting another code.`;
  }
  if (/expired|invalid/i.test(message) && /token|otp/i.test(message)) {
    return "That code didn't match or has expired — request a new one.";
  }
  return message;
}

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
  const fieldRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => () => { if (cooldownTimer.current) clearInterval(cooldownTimer.current); }, []);

  // autoFocus is a no-op under SSR: the input already exists in the server
  // HTML, so React hydrates the node and never calls .focus(). Focus
  // explicitly on mount and again when the email step hands off to the code
  // step — otherwise every sign-in starts with a dead click into the page.
  useEffect(() => { fieldRef.current?.focus(); }, [stage]);

  function startCooldown() {
    setCooldown(RESEND_COOLDOWN_S);
    if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    cooldownTimer.current = setInterval(() => {
      setCooldown((s) => {
        if (s <= 1 && cooldownTimer.current) clearInterval(cooldownTimer.current);
        return Math.max(0, s - 1);
      });
    }, 1000);
  }

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false },
    });
    setBusy(false);
    if (error) setError(friendlyError(error.message));
    else {
      setStage("code");
      startCooldown();
    }
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
    if (error) setError(friendlyError(error.message));
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
      <p>Sign in with your work email.</p>
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
      <div className="hint">Access is invite-only. Ask your Chanlytics contact to add you.</div>
    </main>
  );
}
