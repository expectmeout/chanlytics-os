"use client";

import { useEffect, useRef, useState } from "react";
import { SECOND_FACTOR_WORDS } from "@chanlytics/contracts";
import { createClient } from "@/lib/supabase/client";
import AuthShell from "@/auth/AuthShell";
import { confirmEnrolment, secondStep, startEnrolment, verifyFactor, type Enrolment } from "@/auth/second-factor";

/**
 * The second step (decision 0013): signed in with a password, an email code or Google, on an account that has an
 * authenticator, and not yet past its code. The session exists, so the middleware lets this page open and keeps
 * /login shut; a session that owes nothing is sent straight in. The code is checked by Supabase Auth, which raises the
 * session to aal2; nothing here stores it.
 *
 * A partner account must have one (M3): a refusal sends the tab here with `?for=partner`, and an account without an
 * authenticator sets it up on this page, scanning and then typing its first code, which raises the session as the
 * code does. No other way in, and no later (no grace, Ruben's answer).
 *
 * Sign out is on the page: a person without their phone has no other way off it, and the words say how to get back in.
 */
const W = SECOND_FACTOR_WORDS;
type Supabase = ReturnType<typeof createClient>;
type Phase = "reading" | "code" | "enrol";

const inside = () => window.location.assign("/" + window.location.hash);

export default function VerifyPage() {
  const supabase = createClient();
  const [phase, setPhase] = useState<Phase>("reading");

  useEffect(() => {
    const required = new URLSearchParams(window.location.search).has("for");
    void secondStep(supabase, required).then((step) => {
      if (step === "in") inside();
      else setPhase(step);
    });
  }, [supabase]);

  return (
    <AuthShell>
      <div className="auth-card">
        {phase === "enrol" ? (
          <EnrolStep supabase={supabase} />
        ) : (
          <CodeStep supabase={supabase} reading={phase === "reading"} />
        )}
        <form method="post" action="/auth/signout">
          <button type="submit" className="auth-linkbtn" data-testid="verify-signout">
            {W.signOut}
          </button>
        </form>
      </div>
    </AuthShell>
  );
}

/** The six digits, and what a refusal says. */
function CodeField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const field = useRef<HTMLInputElement | null>(null);
  useEffect(() => field.current?.focus(), []);
  return (
    <>
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
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid="verify-code"
      />
    </>
  );
}

function Refusal({ error }: { error: string | null }) {
  return (
    <div role="alert" aria-live="assertive">
      {error && (
        <div className="error" data-testid="verify-error">
          {error}
        </div>
      )}
    </div>
  );
}

/** An account with an authenticator: its code. */
function CodeStep({ supabase, reading }: { supabase: Supabase; reading: boolean }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || reading) return;
    setBusy(true);
    setError(null);
    const refused = await verifyFactor(supabase, code);
    setBusy(false);
    if (refused) return setError(refused);
    inside();
  }

  return (
    <>
      <h1>{W.verifyTitle}</h1>
      <p>{W.verifyBody}</p>
      <form onSubmit={submit}>
        <CodeField value={code} onChange={setCode} />
        <button disabled={busy || reading} data-testid="verify-submit">
          {busy ? W.verifying : W.verifySubmit}
        </button>
      </form>
      <Refusal error={error} />
      <p className="hint">{W.lost}</p>
    </>
  );
}

/** A partner account without one (M3): set it up here, and its first code lets them in. */
function EnrolStep({ supabase }: { supabase: Supabase }) {
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    const r = await startEnrolment(supabase);
    setBusy(false);
    if (r.ok) setEnrolment(r.enrolment);
    else if (r.unavailable) setUnavailable(true);
    else setError(r.message);
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !enrolment) return;
    setBusy(true);
    setError(null);
    const refused = await confirmEnrolment(supabase, enrolment.factorId, code);
    setBusy(false);
    if (refused) return setError(refused);
    inside();
  }

  return (
    <>
      <h1>{W.enrolTitle}</h1>
      <p>{unavailable ? W.unavailable : W.enrolBody}</p>
      {enrolment ? (
        <form onSubmit={confirm} data-testid="verify-enrol">
          <p className="hint">{W.scan}</p>
          <img src={enrolment.qr} alt="" width={176} height={176} data-testid="verify-enrol-qr" />
          <p className="hint">
            {W.keyLabel}: <code data-testid="verify-enrol-key">{enrolment.secret}</code>
          </p>
          <CodeField value={code} onChange={setCode} />
          <button disabled={busy} data-testid="verify-enrol-confirm">
            {busy ? W.confirming : W.confirm}
          </button>
        </form>
      ) : unavailable ? null : (
        <button type="button" onClick={start} disabled={busy} data-testid="verify-enrol-start">
          {busy ? W.starting : W.start}
        </button>
      )}
      <Refusal error={error} />
      <p className="hint">{W.lost}</p>
    </>
  );
}
