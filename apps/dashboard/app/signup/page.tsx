"use client";
import { useEffect, useRef, useState } from "react";
import { SIGNUP_WORDS, deviceTimezone } from "@chanlytics/contracts";
import GoogleSignIn from "@/auth/GoogleSignIn";

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
  // null until the server says which door this is. The button stays disabled
  // meanwhile, because "Create workspace" on a page that is actually a waitlist
  // is a promise the next screen breaks.
  const [posture, setPosture] = useState<"open" | "waitlist" | "invite" | null>(null);
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
    try {
      const res = await fetch("/api/v1/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), ...(tz ? { timezone: tz } : {}), ...(posture === "invite" ? { code: code.trim() } : {}) }),
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
      // THE CODE DID NOT GO OUT, and nothing was made yet. Navigating to
      // /login?sent=1 would put a person in front of a box asking for six digits
      // that are not coming — the same reason a waitlist submission stops here
      // rather than going somewhere that asks for one. The fallback destination
      // below hardcodes `sent=1`, so this has to come first.
      if (j.data?.sent === false) { setUnsent(j.data.message ?? SIGNUP_WORDS.notSent); return; }
      window.location.assign(j.data?.next ?? `/login?email=${encodeURIComponent(email.trim())}&sent=1`);
    } catch {
      setError("Could not reach Chanlytics just now. Try again.");
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
        <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@business.com" />
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
