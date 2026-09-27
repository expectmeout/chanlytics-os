"use client";

import { useEffect, useRef, useState } from "react";
import { SECOND_FACTOR_WORDS } from "@chanlytics/contracts";
import { createClient } from "@/lib/supabase/client";
import AuthShell from "@/auth/AuthShell";
import { owesFactor, verifyFactor } from "@/auth/second-factor";

/**
 * The second step (decision 0013): signed in with a password, an email code or Google, on an account that has an
 * authenticator, and not yet past its code. The session exists, so the middleware lets this page open and keeps
 * /login shut; a session that owes nothing is sent straight in. The code is checked by Supabase Auth, which raises the
 * session to aal2; nothing here stores it.
 *
 * Sign out is on the page: a person without their phone has no other way off it, and the words say how to get back in.
 */
export default function VerifyPage() {
  const supabase = createClient();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const field = useRef<HTMLInputElement | null>(null);
  const W = SECOND_FACTOR_WORDS;

  const inside = () => window.location.assign("/" + window.location.hash);

  useEffect(() => {
    field.current?.focus();
    void owesFactor(supabase).then((owes) => {
      if (!owes) inside();
    });
  }, [supabase]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const refused = await verifyFactor(supabase, code);
    setBusy(false);
    if (refused) {
      setError(refused);
      return;
    }
    inside();
  }

  return (
    <AuthShell>
      <div className="auth-card">
        <h1>{W.verifyTitle}</h1>
        <p>{W.verifyBody}</p>
        <form onSubmit={submit}>
          <label htmlFor="code">{W.codeLabel}</label>
          <input
            id="code"
            name="code"
            ref={field}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]*"
            maxLength={7}
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            data-testid="verify-code"
          />
          <button disabled={busy} data-testid="verify-submit">
            {busy ? W.verifying : W.verifySubmit}
          </button>
        </form>
        <div role="alert" aria-live="assertive">
          {error && (
            <div className="error" data-testid="verify-error">
              {error}
            </div>
          )}
        </div>
        <p className="hint">{W.lost}</p>
        <form method="post" action="/auth/signout">
          <button type="submit" className="auth-linkbtn" data-testid="verify-signout">
            {W.signOut}
          </button>
        </form>
      </div>
    </AuthShell>
  );
}
