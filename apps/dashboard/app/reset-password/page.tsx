"use client";

import { useEffect, useRef, useState } from "react";
import { PASSWORD_WORDS, passwordProblem, requestCodeWords } from "@chanlytics/contracts";
import { createClient } from "@/lib/supabase/client";
import { clearSurfaceCache } from "@/legacy-bridge/surface-cache";
import CodeStep from "@/auth/CodeStep";

/**
 * Forgetting a password: a code, then the new password, on one public page.
 *
 * WHY A CODE AND NOT A LINK. A recovery link is exchanged with a secret the
 * browser that STARTED the reset is holding, so opening the mail on a phone
 * after filling the form on a laptop fails -- which is most of the time a
 * person resets a password. A code has no such coupling, and this product
 * already has a screen for one.
 *
 * The verification is what creates the session, and the new password is
 * written on that session. So this page is public (nobody resetting a
 * password has a session to show) and is deliberately NOT on the middleware's
 * "a signed-in person has no business here" list: by its own second half the
 * person is signed in, and bouncing them then would break the step that
 * matters.
 *
 * The first step says the same sentence whether or not the address is known.
 */
export default function ResetPasswordPage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [stage, setStage] = useState<"ask" | "set">("ask");
  // Whether the recovery code has already been spent on a session. A ref, not
  // state: it must survive a re-render caused by the error it exists to handle.
  const codeAccepted = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fieldRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => { fieldRef.current?.focus(); }, [stage]);

  // Arriving from the sign-in page, which carries whatever was typed there so
  // nobody types their address twice.
  useEffect(() => {
    const e = new URLSearchParams(window.location.search).get("email");
    if (e) {
      setEmail(e);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    setBusy(false);
    // Same stance as the sign-in code door: only a problem the person can act
    // on stops the form. Anything that would distinguish a known address from
    // an unknown one is swallowed, and the next screen is shown either way.
    const shown = error ? requestCodeWords(error) : null;
    if (shown) {
      setError(shown);
      return;
    }
    setStage("set");
  }

  if (stage === "ask") {
    return (
      <main className="auth-card" data-testid="reset-ask">
        <h1>{PASSWORD_WORDS.resetTitle}</h1>
        <p>{PASSWORD_WORDS.resetLead}</p>
        <form onSubmit={ask}>
          <label htmlFor="email">Work email</label>
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
          <button disabled={busy}>{busy ? "Sending code…" : "Email me a code"}</button>
        </form>
        <div role="alert" aria-live="assertive">
          {error && <div className="error">{error}</div>}
        </div>
        <div className="hint"><a href="/login">{PASSWORD_WORDS.backToSignIn}</a></div>
        <div className="hint auth-legal"><a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></div>
      </main>
    );
  }

  return (
    <main className="auth-card" data-testid="reset-set">
      <h1>{PASSWORD_WORDS.resetTitle}</h1>
      <p>{PASSWORD_WORDS.resetSent(email.trim())}</p>
      <CodeStep
        email={email.trim()}
        label="6-digit code"
        submitLabel={PASSWORD_WORDS.resetSubmit}
        onSubmit={async (typed) => {
          // Checked here so the answer is instant and names the field, and
          // again by Supabase, where the floor and the breach list are the
          // rule rather than a courtesy.
          const weak = passwordProblem(password);
          if (weak) return weak;
          // The code is what creates the session; the new password is written
          // on it. A code that does not verify has changed nothing -- but one
          // that DOES is spent, and the session it made is ours from then on.
          // Verifying again on every submit stranded anyone whose password
          // passed the check above and was then refused by Supabase (the breach
          // list, or a project floor higher than ours): they were signed in,
          // facing a code box, and every retry failed at verifyOtp and blamed
          // the code. Once it is accepted, retries go straight to the password.
          if (!codeAccepted.current) {
            const verified = await supabase.auth.verifyOtp({ email: email.trim(), token: typed, type: "recovery" });
            if (verified.error) return PASSWORD_WORDS.resetBadCode;
            codeAccepted.current = true;
          }
          const saved = await supabase.auth.updateUser({ password });
          // Signed in but the password did not take (too short for the
          // project, or on the breach list). Say so rather than landing them
          // inside believing it changed.
          if (saved.error) return saved.error.message;
          clearSurfaceCache();
          window.location.assign("/");
          return null;
        }}
        onResend={async () => {
          const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
          // A fresh code is a fresh verification.
          if (!error) codeAccepted.current = false;
          return error ? requestCodeWords(error) : null;
        }}
        onBack={() => { setStage("ask"); setError(null); }}
        backLabel="Use a different email"
      >
        <label htmlFor="new-password">{PASSWORD_WORDS.newLabel}</label>
        <input
          id="new-password"
          name="new-password"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••••••"
        />
        <div className="auth-field-hint">{PASSWORD_WORDS.hint}</div>
      </CodeStep>
      <div className="hint"><a href="/login">{PASSWORD_WORDS.backToSignIn}</a></div>
      <div className="hint auth-legal"><a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></div>
    </main>
  );
}
