"use client";
import { useEffect, useRef, useState } from "react";
import { PASSWORD_WORDS, SIGNUP_WORDS, deviceTimezone, passwordProblem, requestCodeWords, verifyCodeWords } from "@chanlytics/contracts";
import { createClient } from "@/lib/supabase/client";
import { clearSurfaceCache } from "@/legacy-bridge/surface-cache";
import GoogleSignIn from "@/auth/GoogleSignIn";
import CodeStep from "@/auth/CodeStep";

/**
 * Sign-up: a business name, a work email and a password. The account exists
 * once the address is confirmed, and the workspace is made on the next screen
 * by the person who confirmed it.
 *
 * THE CODE STEP IS ON THIS PAGE NOW. It used to send people to /login at the
 * code step, which was right when the code WAS the credential. It is not any
 * more: somebody who has just chosen a password and is then shown a screen
 * headed "sign in" to type six digits has been told their password did not
 * work. It did. The address is what is unproved, and this page says so.
 *
 * The sentence after submit is the same whether or not the address was
 * already known — the form is not an oracle for who has an account, and with
 * confirmation on that is Supabase's own behaviour rather than something this
 * page reconstructs (see /login for the same stance).
 */
export default function SignupPage() {
  const supabase = createClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  // null until the server says which door this is. The button stays disabled
  // meanwhile, because "Create workspace" on a page that is actually a waitlist
  // is a promise the next screen breaks.
  const [posture, setPosture] = useState<"open" | "waitlist" | "invite" | null>(null);
  const [stage, setStage] = useState<"form" | "confirm">("form");
  const [joined, setJoined] = useState(false);
  const [unsent, setUnsent] = useState<string | null>(null);
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
      .then((j: { data?: { posture?: "open" | "waitlist" | "invite"; code_required?: boolean } }) =>
        // `posture` is what this page reads now; the boolean is the fallback for
        // an API deployed before it, since the two ship separately.
        setPosture(j?.data?.posture ?? (j?.data?.code_required ? "invite" : "open")))
      .catch(() => setPosture("open"));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    // Checked here so the answer is instant and names the field, and again by
    // the route and by Supabase, where it is the rule rather than a courtesy.
    // One function, so the browser's rule and the server's cannot drift.
    const weak = posture === "waitlist" ? null : passwordProblem(password);
    if (weak) {
      setError(weak);
      setBusy(false);
      return;
    }
    try {
      const res = await fetch("/api/v1/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          // A waitlist takes details and creates no account, so it is sent no
          // credential at all.
          ...(posture === "waitlist" ? {} : { password }),
          ...(tz ? { timezone: tz } : {}),
          ...(posture === "invite" ? { code: code.trim() } : {}),
        }),
      });
      const j = (await res.json().catch(() => null)) as { ok?: boolean; data?: { next?: string | null; waitlisted?: boolean; sent?: boolean; message?: string }; error?: { message?: string } } | null;
      if (!res.ok || !j?.ok) {
        setError(j?.error?.message ?? "Something went wrong. Try again.");
        return;
      }
      // A waitlist submission has nowhere to go: no code is coming and there is
      // no screen to enter one on. Say so here rather than navigating somewhere
      // that would ask for one.
      if (j.data?.waitlisted) { setJoined(true); return; }
      // THE CODE DID NOT GO OUT. Showing the confirm step would put a person in
      // front of a box asking for six digits that are not coming.
      if (j.data?.sent === false) { setUnsent(j.data.message ?? SIGNUP_WORDS.notSent); return; }
      setStage("confirm");
    } catch {
      setError(SIGNUP_WORDS.unreachable);
    } finally {
      setBusy(false);
    }
  }

  const waiting = posture === "waitlist";

  if (unsent) {
    return (
      <main className="auth-card" data-testid="signup-unsent">
        <h1>{SIGNUP_WORDS.notSentTitle}</h1>
        <p>{unsent}</p>
        <div className="hint">
          <a href={`/login?email=${encodeURIComponent(email.trim())}`}>Go to sign-in</a> and ask for the code there.
        </div>
      </main>
    );
  }

  if (joined) {
    return (
      <main className="auth-card" data-testid="signup-joined">
        <h1>{SIGNUP_WORDS.waitlistTitle}</h1>
        <p>{SIGNUP_WORDS.waitlistSent(email.trim())}</p>
        <div className="hint">
          Already have a workspace? <a href="/login">Sign in</a>
        </div>
      </main>
    );
  }

  // The address is what is unproved, so this screen says so — and the password
  // they just chose is already theirs, which is why nothing here asks for it
  // again.
  if (stage === "confirm") {
    return (
      <main className="auth-card" data-testid="signup-confirm">
        <h1>{SIGNUP_WORDS.confirmTitle}</h1>
        <p>{SIGNUP_WORDS.confirmLead(email.trim())}</p>
        <CodeStep
          email={email.trim()}
          label="6-digit code"
          submitLabel={SIGNUP_WORDS.confirmSubmit}
          onSubmit={async (typed) => {
            const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: typed, type: "email" });
            if (error) return verifyCodeWords(error.message);
            clearSurfaceCache();
            // No workspace exists yet: the create screen opens next, with the
            // name and clock from this form already in it.
            window.location.assign("/");
            return null;
          }}
          onResend={async () => {
            // A confirmation is resent as a confirmation. Asking for a sign-in
            // code instead would be a different credential for a different
            // door, on an account that is not confirmed yet.
            const { error } = await supabase.auth.resend({ type: "signup", email: email.trim() });
            return error ? requestCodeWords(error) : null;
          }}
          onBack={() => { setStage("form"); setError(null); }}
        />
        {/* The cost of answering a known address exactly as a new one: somebody
            who already had an account is standing at a code screen waiting for
            a code nobody sent. This is the way out, and it gives nothing away —
            it is shown to everyone who reaches this step. */}
        <div className="hint">{SIGNUP_WORDS.haveOne} <a href="/login">Sign in</a></div>
        <div className="hint auth-legal"><a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></div>
      </main>
    );
  }

  return (
    <main className="auth-card" data-testid="signup" data-posture={posture ?? "unknown"}>
      <h1>{waiting ? SIGNUP_WORDS.waitlistTitle : SIGNUP_WORDS.title}</h1>
      <p>{waiting ? SIGNUP_WORDS.waitlistLead : SIGNUP_WORDS.lead}</p>
      {/* Google makes the account and the create screen names the workspace --
          and asks the invite code there, when sign-up is by invitation. Not on
          the waitlist: a list takes details, not accounts. */}
      {posture !== null && !waiting && <GoogleSignIn next="/" hint={SIGNUP_WORDS.googleNext} />}
      <form onSubmit={submit}>
        <label htmlFor="name">Business name</label>
        <input id="name" type="text" autoComplete="organization" required minLength={2} maxLength={120} ref={fieldRef} value={name} onChange={(e) => setName(e.target.value)} placeholder="Luna Studio" />
        <label htmlFor="email">Work email</label>
        <input id="email" name="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@business.com" />
        {/* Not on the waitlist, which makes no account to hold one. */}
        {!waiting && (
          <>
            <label htmlFor="password">{PASSWORD_WORDS.chooseLabel}</label>
            <input id="password" name="password" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••••••" />
            <div className="auth-field-hint">{PASSWORD_WORDS.hint}</div>
          </>
        )}
        {posture === "invite" && (
          <>
            <label htmlFor="code">Invite code</label>
            <input id="code" type="text" autoComplete="off" required value={code} onChange={(e) => setCode(e.target.value)} placeholder="From your Chanlytics contact" />
          </>
        )}
        <button disabled={busy || posture === null}>
          {busy ? (waiting ? "Adding you…" : "Creating your workspace…") : waiting ? SIGNUP_WORDS.waitlistCta : "Create workspace"}
        </button>
      </form>
      {/* The device clock is read to set the workspace's timezone. On the
          waitlist there is no workspace yet, so saying so would be noise. */}
      {tz && !waiting && <div className="hint">{SIGNUP_WORDS.clock(tz)}</div>}
      {posture === "invite" && <div className="hint">{SIGNUP_WORDS.codeRequired}</div>}
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
