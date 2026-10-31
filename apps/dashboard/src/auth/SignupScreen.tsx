"use client";
import { useEffect, useRef, useState } from "react";
import {
  LEAD_PREVIEW_WORDS,
  PASSWORD_WORDS,
  SIGNUP_WORDS,
  deviceTimezone,
  passwordProblem,
  previewMinePath,
  requestCodeWords,
  signupPostureFor,
  verifyCodeWords,
} from "@chanlytics/contracts";
import { createClient } from "@/lib/supabase/client";
import { clearSurfaceCache } from "@/legacy-bridge/surface-cache";
import GoogleSignIn from "@/auth/GoogleSignIn";
import CodeStep from "@/auth/CodeStep";
import AuthShell from "@/auth/AuthShell";
import { claimPreviewNow, openClaimed, type SignupPreview } from "@/auth/preview-claim";

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
 *
 * MAKE IT MINE (decision 0079). Drawn for a lead's own receptionist's link
 * (/preview/<token>/mine, which reads the preview on the server), the screen
 * says whose receptionist is waiting, with the address it was sent to filled
 * in, and the link stands for an invite code. Once the code signs them in, the
 * preview is claimed rather than a workspace made. Someone already signed in
 * makes it theirs with one press. /signup draws it with no preview.
 *
 * The screen is its parts: its state and its arrival (useSignupState), the
 * press (submitFor), and one card per outcome, in the order they win: the
 * code that did not go out, the waitlist joined, the code step, a preview's
 * head while the session is asked, the claim of someone signed in, the form.
 */
export default function SignupScreen({ preview }: { preview: SignupPreview | null }) {
  const s = useSignupState(preview);
  if (s.unsent) return unsentCard(s.unsent, s.email);
  if (s.joined) return joinedCard(s.email);
  if (s.stage === "confirm") return confirmCard(s);
  if (preview && s.signedInAs === undefined) return previewHead(preview);
  if (preview && s.signedInAs) return claimCard(s, preview, s.signedInAs);
  return formCard(s, submitFor(s));
}

/**
 * The screen's state, and the one thing it does on arrival: ask the server
 * which door this is. The hooks are called in the order the screen always
 * called them, so each keeps its place.
 */
function useSignupState(preview: SignupPreview | null) {
  const supabase = createClient();
  // From a preview's link, the business is named already and the address it was sent to is filled in.
  const [name, setName] = useState(preview?.business ?? "");
  const [email, setEmail] = useState(preview?.email ?? "");
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
  // From a preview's link, who is signed in already: undefined while it is asked, null for nobody.
  const [signedInAs, setSignedInAs] = useState<string | null | undefined>(undefined);
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
        setPosture(j?.data?.posture ?? (j?.data?.code_required ? "invite" : "open")),
      )
      .catch(() => setPosture("open"));
    // From a preview's link: someone signed in already is asked one press rather than the form.
    if (preview)
      void supabase.auth
        .getSession()
        .then(({ data }) => setSignedInAs(data.session?.user.email ?? null))
        .catch(() => setSignedInAs(null));
    // Once, on arrival: the preview is the page's, and does not change while it is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    supabase,
    name,
    setName,
    email,
    setEmail,
    password,
    setPassword,
    code,
    setCode,
    // The door this person meets: the server's, opened by a live preview's link (signupPostureFor).
    posture: posture === null ? null : signupPostureFor(posture, !!preview),
    preview,
    signedInAs,
    stage,
    setStage,
    joined,
    setJoined,
    unsent,
    setUnsent,
    busy,
    setBusy,
    error,
    setError,
    tz,
    fieldRef,
  };
}

/** One draw's state: what every part below reads. */
type SignupState = ReturnType<typeof useSignupState>;

/** What the sign-up route answers, when it answers JSON at all. */
type SignupAnswer = {
  ok?: boolean;
  data?: { next?: string | null; waitlisted?: boolean; sent?: boolean; message?: string };
  error?: { message?: string };
} | null;

/** The form's press, over one draw's state: the password checked, the details sent, the answer taken. */
function submitFor(s: SignupState) {
  return async function submit(e: React.SyntheticEvent) {
    e.preventDefault();
    s.setBusy(true);
    s.setError(null);
    // Checked here so the answer is instant and names the field, and again by
    // the route and by Supabase, where it is the rule rather than a courtesy.
    // One function, so the browser's rule and the server's cannot drift.
    const weak = s.posture === "waitlist" ? null : passwordProblem(s.password);
    if (weak) {
      s.setError(weak);
      s.setBusy(false);
      return;
    }
    try {
      const res = await fetch("/api/v1/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: signupBody(s),
      });
      const j = (await res.json().catch(() => null)) as SignupAnswer;
      takeSignupAnswer(s, res, j);
    } catch {
      s.setError(SIGNUP_WORDS.unreachable);
    } finally {
      s.setBusy(false);
    }
  };
}

/** What the form sends: trimmed, the device's zone when it gave one, the code behind the invite door, the preview's link. */
function signupBody({ name, email, password, code, posture, tz, preview }: SignupState) {
  return JSON.stringify({
    name: name.trim(),
    email: email.trim(),
    // A waitlist takes details and creates no account, so it is sent no
    // credential at all.
    ...(posture === "waitlist" ? {} : { password }),
    ...(tz ? { timezone: tz } : {}),
    ...(posture === "invite" ? { code: code.trim() } : {}),
    ...(preview ? { preview: preview.token } : {}),
  });
}

/** Where the route's answer leaves the screen: its refusal's words, the waitlist, the code not sent, or the code step. */
function takeSignupAnswer({ setError, setJoined, setUnsent, setStage }: SignupState, res: Response, j: SignupAnswer) {
  if (!res.ok || !j?.ok) {
    setError(j?.error?.message ?? "Something went wrong. Try again.");
    return;
  }
  // A waitlist submission has nowhere to go: no code is coming and there is
  // no screen to enter one on. Say so here rather than navigating somewhere
  // that would ask for one.
  if (j.data?.waitlisted) {
    setJoined(true);
    return;
  }
  // THE CODE DID NOT GO OUT. Showing the confirm step would put a person in
  // front of a box asking for six digits that are not coming.
  if (j.data?.sent === false) {
    setUnsent(j.data.message ?? SIGNUP_WORDS.notSent);
    return;
  }
  setStage("confirm");
}

/** The code did not go out: the route's sentence, and the way to ask for it at sign-in. */
function unsentCard(unsent: string, email: string) {
  return (
    <AuthShell>
      <div className="auth-card" data-testid="signup-unsent">
        <h1>{SIGNUP_WORDS.notSentTitle}</h1>
        <p>{unsent}</p>
        <div className="hint">
          <a href={`/login?email=${encodeURIComponent(email.trim())}`}>Go to sign-in</a> and ask for the code there.
        </div>
      </div>
    </AuthShell>
  );
}

/** On the waitlist: the address it will hear at, and nothing more to do here. */
function joinedCard(email: string) {
  return (
    <AuthShell>
      <div className="auth-card" data-testid="signup-joined">
        <h1>{SIGNUP_WORDS.waitlistTitle}</h1>
        <p>{SIGNUP_WORDS.waitlistSent(email.trim())}</p>
        <div className="hint">
          Already have a workspace? <a href="/login">Sign in</a>
        </div>
      </div>
    </AuthShell>
  );
}

/**
 * The code step. The address is what is unproved, so this screen says so --
 * and the password they just chose is already theirs, which is why nothing
 * here asks for it again.
 */
function confirmCard({ supabase, email, setStage, setError, preview }: SignupState) {
  return (
    <AuthShell>
      <div className="auth-card" data-testid="signup-confirm">
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
            // From a preview's link: signed in now, so it is made theirs and
            // its first run opens. A claim refused goes home with the rest,
            // where the first screen asks it again and says why.
            const claimed = preview ? await claimPreviewNow(preview.token) : null;
            if (claimed?.ok) {
              openClaimed(claimed.workspace.slug);
              return null;
            }
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
          onBack={() => {
            setStage("form");
            setError(null);
          }}
        />
        {/* The cost of answering a known address exactly as a new one: somebody
            who already had an account is standing at a code screen waiting for
            a code nobody sent. This is the way out, and it gives nothing away —
            it is shown to everyone who reaches this step. */}
        <div className="hint">
          {SIGNUP_WORDS.haveOne} <a href="/login">Sign in</a>
        </div>
      </div>
    </AuthShell>
  );
}

/** A preview's head, while the screen asks who is signed in: whose receptionist, and nothing to press yet. */
function previewHead(preview: SignupPreview) {
  return (
    <AuthShell>
      <div className="auth-card" data-testid="signup-preview">
        <h1>{LEAD_PREVIEW_WORDS.signup.title(preview.business)}</h1>
        <p>{LEAD_PREVIEW_WORDS.signup.lead}</p>
      </div>
    </AuthShell>
  );
}

/** Someone signed in, from a preview's link: whose receptionist, the account it becomes theirs in, and one press. */
function claimCard(s: SignupState, preview: SignupPreview, email: string) {
  const W = LEAD_PREVIEW_WORDS.signup;
  const claim = async () => {
    s.setBusy(true);
    s.setError(null);
    const r = await claimPreviewNow(preview.token);
    if (r.ok) {
      clearSurfaceCache();
      openClaimed(r.workspace.slug);
      return;
    }
    s.setError(r.message);
    s.setBusy(false);
  };
  // Another account: signed out, and the page is the form again, with the address the preview was sent to in it.
  const other = async () => {
    await s.supabase.auth.signOut();
    clearSurfaceCache();
    window.location.reload();
  };
  return (
    <AuthShell>
      <div className="auth-card" data-testid="signup-claim">
        <h1>{W.title(preview.business)}</h1>
        <p>{W.signedIn(email)}</p>
        <button type="button" disabled={s.busy} onClick={() => void claim()} data-testid="signup-claim-press">
          {s.busy ? W.claiming : W.claim}
        </button>
        <div role="alert" aria-live="assertive">
          {s.error && <div className="error">{s.error}</div>}
        </div>
        <div className="hint">
          <button type="button" className="auth-linkbtn" disabled={s.busy} onClick={() => void other()}>
            {W.other}
          </button>
        </div>
      </div>
    </AuthShell>
  );
}

/** The form, in the posture the server named: its words, Google's door, the fields and the hints. */
function formCard(s: SignupState, submit: (e: React.SyntheticEvent) => Promise<void>) {
  const { posture, tz, error, preview } = s;
  const waiting = posture === "waitlist";
  // From a preview's link, Google comes back here, signed in, to the one press.
  const googleNext = preview ? previewMinePath(preview.token) : "/";
  const title = waiting ? SIGNUP_WORDS.waitlistTitle : SIGNUP_WORDS.title;
  const lead = waiting ? SIGNUP_WORDS.waitlistLead : SIGNUP_WORDS.lead;
  return (
    <AuthShell>
      <div className="auth-card" data-testid="signup" data-posture={posture ?? "unknown"}>
        <h1>{preview ? LEAD_PREVIEW_WORDS.signup.title(preview.business) : title}</h1>
        <p>{preview ? LEAD_PREVIEW_WORDS.signup.lead : lead}</p>
        {/* Google makes the account and the create screen names the workspace --
            and asks the invite code there, when sign-up is by invitation. Not on
            the waitlist: a list takes details, not accounts. */}
        {posture !== null && !waiting && (
          <GoogleSignIn
            next={googleNext}
            hint={preview ? LEAD_PREVIEW_WORDS.signup.googleNext : SIGNUP_WORDS.googleNext}
          />
        )}
        {detailsForm(s, submit)}
        {/* The device clock is read to set the workspace's timezone. On the
            waitlist there is no workspace yet, so saying so would be noise; a
            preview keeps the clock it was set up with, its business's own. */}
        {tz && !waiting && !preview && <div className="hint">{SIGNUP_WORDS.clock(tz)}</div>}
        {posture === "invite" && <div className="hint">{SIGNUP_WORDS.codeRequired}</div>}
        <div role="alert" aria-live="assertive">
          {error && <div className="error">{error}</div>}
        </div>
        <div className="hint">
          {SIGNUP_WORDS.haveOne} <a href="/login">Sign in</a>
        </div>
      </div>
    </AuthShell>
  );
}

/** The fields: a name and an address always, a password where an account is made, a code behind the invite door. */
function detailsForm(s: SignupState, submit: (e: React.SyntheticEvent) => Promise<void>) {
  const { name, setName, email, setEmail, code, setCode, posture, busy, fieldRef, preview } = s;
  const waiting = posture === "waitlist";
  return (
    <form onSubmit={submit}>
      {/* A preview's business is named already: the workspace is that one, made theirs. */}
      {!preview && (
        <>
          <label htmlFor="name">Business name</label>
          <input
            id="name"
            type="text"
            autoComplete="organization"
            required
            minLength={2}
            maxLength={120}
            ref={fieldRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Luna Studio"
          />
        </>
      )}
      <label htmlFor="email">Work email</label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="username"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@business.com"
      />
      {/* Not on the waitlist, which makes no account to hold one. */}
      {!waiting && passwordFields(s)}
      {posture === "invite" && (
        <>
          <label htmlFor="code">Invite code</label>
          <input
            id="code"
            type="text"
            autoComplete="off"
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="From your Chanlytics contact"
          />
        </>
      )}
      <button disabled={busy || posture === null}>
        {/* From a preview's link, the press is Make it mine: the code that follows makes it theirs. */}
        {preview
          ? busy
            ? LEAD_PREVIEW_WORDS.signup.claiming
            : LEAD_PREVIEW_WORDS.signup.claim
          : busy
            ? waiting
              ? "Adding you…"
              : "Creating your workspace…"
            : waiting
              ? SIGNUP_WORDS.waitlistCta
              : "Create workspace"}
      </button>
    </form>
  );
}

/** The password an account is made with, and the rule it is held to. */
function passwordFields({ password, setPassword }: SignupState) {
  return (
    <>
      <label htmlFor="password">{PASSWORD_WORDS.chooseLabel}</label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="••••••••••••"
      />
      <div className="auth-field-hint">{PASSWORD_WORDS.hint}</div>
    </>
  );
}
