"use client";
import { useEffect, useRef, useState } from "react";
import { SIGNUP_WORDS, deviceTimezone } from "@chanlytics/contracts";

/**
 * Sign-up: a business name and a work email, and the workspace exists with
 * this person as its owner before they have signed in once. The code that
 * opens it is the same code sign-in uses, so the next screen is /login at
 * the code step. The sentence after submit is the same whether or not the
 * address was already known — the form is not an oracle for who has an
 * account (see /login for the same stance).
 */
export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeRequired, setCodeRequired] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tz, setTz] = useState<string | undefined>(undefined);
  const fieldRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    fieldRef.current?.focus();
    setTz(deviceTimezone());
    // Whether an invite code is asked for is the server's to say; the field
    // appears only when it is, so an open sign-up never shows a blank the
    // person cannot fill.
    fetch("/api/v1/signup", { method: "GET", headers: { accept: "application/json" } })
      .then((r) => r.json())
      .then((j: { data?: { code_required?: boolean } }) => setCodeRequired(!!j?.data?.code_required))
      .catch(() => setCodeRequired(false));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), ...(tz ? { timezone: tz } : {}), ...(codeRequired ? { code: code.trim() } : {}) }),
      });
      const j = (await res.json().catch(() => null)) as { ok?: boolean; data?: { next?: string }; error?: { message?: string } } | null;
      if (!res.ok || !j?.ok) {
        setError(j?.error?.message ?? "Something went wrong. Try again.");
        return;
      }
      window.location.assign(j.data?.next ?? `/login?email=${encodeURIComponent(email.trim())}&sent=1`);
    } catch {
      setError("Could not reach Chanlytics just now. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-card" data-testid="signup">
      <h1>{SIGNUP_WORDS.title}</h1>
      <p>{SIGNUP_WORDS.lead}</p>
      <form onSubmit={submit}>
        <label htmlFor="name">Business name</label>
        <input id="name" type="text" autoComplete="organization" required minLength={2} maxLength={120} ref={fieldRef} value={name} onChange={(e) => setName(e.target.value)} placeholder="Luna Studio" />
        <label htmlFor="email">Work email</label>
        <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@business.com" />
        {codeRequired && (
          <>
            <label htmlFor="code">Invite code</label>
            <input id="code" type="text" autoComplete="off" required value={code} onChange={(e) => setCode(e.target.value)} placeholder="From your Chanlytics contact" />
          </>
        )}
        <button disabled={busy || codeRequired === null}>{busy ? "Creating your workspace…" : "Create workspace"}</button>
      </form>
      {tz && <div className="hint">{SIGNUP_WORDS.clock(tz)}</div>}
      {codeRequired && <div className="hint">{SIGNUP_WORDS.codeRequired}</div>}
      <div role="alert" aria-live="assertive">
        {error && <div className="error">{error}</div>}
      </div>
      <div className="hint">
        {SIGNUP_WORDS.haveOne} <a href="/login">Sign in</a>
      </div>
      <div className="hint auth-legal"><a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></div>
    </main>
  );
}
