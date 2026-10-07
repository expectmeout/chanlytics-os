"use client";

import { useEffect, useState } from "react";
import { SIGNUP_WORDS, googleCallbackUrl } from "@chanlytics/contracts";
import { createClient } from "@/lib/supabase/client";
import { publicEnv } from "@/lib/public-env";

/**
 * Whether the hosted project has the Google provider switched on. Supabase's
 * public settings say (`external.google`), so the door is shown only when it
 * opens: the button ships before the client id and secret are in the
 * dashboard, and a button that can only fail teaches somebody to ignore
 * buttons. Asked once per page load, and "could not ask" is "not shown".
 */
let known: Promise<boolean> | null = null;
function googleEnabled(): Promise<boolean> {
  known ??= fetch(`${publicEnv.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
    headers: { apikey: publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
  })
    .then((r) => r.json())
    .then((j: { external?: { google?: boolean } }) => j?.external?.google === true)
    .catch(() => false);
  return known;
}

/**
 * Sign in with Google, on both doors.
 *
 * The browser client runs the PKCE flow: it keeps a code verifier in a cookie
 * and sends the person to Google; Google returns them to Supabase, and Supabase
 * to /auth/callback with a code, which the server exchanges for the session
 * cookie every route reads. Nothing of Google's is kept: no refresh token, no
 * scopes beyond the profile, because the product only needs to know who this
 * is. `select_account` so a person with two Google accounts is asked which.
 *
 * On success the browser has already left for Google; only a failure returns
 * to this component.
 */
export default function GoogleSignIn({ next = "/", hint }: { next?: string | (() => string); hint?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    void googleEnabled().then((on) => {
      if (alive) setEnabled(on);
    });
    return () => {
      alive = false;
    };
  }, []);
  if (!enabled) return null;

  async function go() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: googleCallbackUrl(window.location.origin, typeof next === "function" ? next() : next),
        queryParams: { prompt: "select_account" },
      },
    });
    if (error) {
      setError(SIGNUP_WORDS.googleFailed);
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="auth-google"
        onClick={() => void go()}
        disabled={busy}
        data-testid="google-sign-in"
      >
        <GoogleG />
        <span>{busy ? "Opening Google…" : SIGNUP_WORDS.google}</span>
      </button>
      {hint && <div className="hint auth-google-hint">{hint}</div>}
      <div role="alert" aria-live="assertive">
        {error && <div className="error">{error}</div>}
      </div>
      <div className="auth-or" aria-hidden="true">
        {SIGNUP_WORDS.or}
      </div>
    </>
  );
}

/** Google's "G", in its four colours, as their branding guidelines draw it. */
function GoogleG() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}
