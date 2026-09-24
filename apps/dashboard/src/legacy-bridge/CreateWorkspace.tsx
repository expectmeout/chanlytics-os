"use client";

import { useEffect, useRef, useState } from "react";
import { SIGNUP_WORDS, type PendingWorkspace, type SignupPosture } from "@chanlytics/contracts";
import { api } from "./api";
import { joinWaitlistFrom } from "./waitlist";

/**
 * The first screen of an account that belongs to nowhere — and, from the
 * workspace menu, the screen for another one: an owner with several
 * businesses, or an agency setting workspaces up for its clients.
 *
 * Until this existed, a session with no memberships reached the shell, every
 * surface fetched and 404'd, and the status pill said "Connecting to your
 * workspace…" — forever, because there was nothing to connect to. The only way
 * out was an engineer writing SQL. That is what made a second customer an
 * engineering task rather than a signup.
 *
 * Rendered INSTEAD of the app, not inside it: with no workspace there is no
 * nav to put this in, and for another workspace the page changes anyway.
 *
 * The first workspace begins here too. Sign-up makes none: it keeps the name
 * and clock the person typed on their account, and this screen opens with
 * them filled in once they have entered the code. One press, and the
 * workspace is theirs -- made by a session that has proved the inbox, through
 * the same door as every workspace after it.
 */

export interface CreatedWorkspace {
  id: string;
  slug: string;
  name: string;
  status: string;
  timezone: string;
  locale: string;
}

/**
 * The browser's own zone as the default, because it is right far more often
 * than a fixed guess and the owner can see it before committing. It decides
 * what "are you open right now?" means, so it is shown rather than assumed.
 */
function browserZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
  } catch {
    return "America/New_York";
  }
}

const ZONES = (() => {
  const here = browserZone();
  const common = [
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Los_Angeles",
    "America/Phoenix",
    "America/Anchorage",
    "Pacific/Honolulu",
    "America/Toronto",
    "Europe/London",
    "Europe/Madrid",
    "Europe/Paris",
    "Europe/Berlin",
    "America/Mexico_City",
    "America/Bogota",
    "America/Sao_Paulo",
    "UTC",
  ];
  return [here, ...common.filter((z) => z !== here)];
})();

export default function CreateWorkspace({
  email,
  initial,
  onCreated,
  onCancel,
  posture = "open",
}: {
  email: string | null;
  /** What sign-up kept for this person, when it did: the form opens with it. */
  initial?: PendingWorkspace | null;
  /**
   * The door a FIRST workspace meets: the sign-up posture, from the workspace
   * read that opened this screen. An account that arrived through Google never
   * saw the sign-up form, so the invite code is asked here, or the list shown.
   */
  posture?: SignupPosture;
  onCreated: (w: CreatedWorkspace) => void;
  /** Present when there is somewhere to go back to: this is another workspace, not the first. */
  onCancel?: () => void;
}) {
  const another = !!onCancel;
  const [name, setName] = useState(initial?.name ?? "");
  const [timezone, setTimezone] = useState(initial?.timezone || browserZone());
  // A zone sign-up kept that the short list does not carry is still the one
  // they chose, so it heads the list rather than vanishing into it.
  const [zones] = useState(() =>
    initial?.timezone && !ZONES.includes(initial.timezone) ? [initial.timezone, ...ZONES] : ZONES,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // THE DOOR, for a first workspace: the invite code when sign-up is by
  // invitation, the list when it is a waitlist. Another workspace for somebody
  // already inside has no door.
  const door: SignupPosture = another ? "open" : posture;
  const [code, setCode] = useState("");
  // Behind a waitlist: the list's own sentence, once it has taken them.
  const [joined, setJoined] = useState<string | null>(null);

  // CREATE ONCE (F5): a first workspace whose name sign-up kept is made as the
  // screen opens, from that name and clock -- and the invite code sign-up
  // checked, which the create route reads for itself -- so there is no second
  // screen. A refusal (a name taken, a code that changed since) leaves the
  // form, filled in, with the server's sentence, as a press on it would.
  const kept = !another && door !== "waitlist" ? (initial?.name ?? "").trim() : "";
  const [making, setMaking] = useState(kept.length >= 2);
  const started = useRef(false);

  /** Make the workspace: the press's and the arrival's one way. True once it is made. */
  const create = async (trimmed: string, typed: string): Promise<boolean> => {
    setBusy(true);
    setError(null);
    const r = await api()("POST workspaces/create", {
      body: { name: trimmed, timezone, ...(door === "invite" && typed ? { code: typed } : {}) },
      // Nothing here is read again: the tab leaves for the new workspace at once (onCreated).
      refresh: false,
    });
    if (!r.ok) {
      // The server's message is written for a person to read — "Unknown
      // timezone: Mars/Olympus", "This account already owns 10 workspaces" —
      // so it is shown rather than replaced with something generic.
      setError(r.message);
      setBusy(false);
      return false;
    }
    onCreated(r.data.workspace);
    return true;
  };

  useEffect(() => {
    if (!making || started.current) return;
    started.current = true;
    void create(kept, "").then((made) => {
      if (!made) setMaking(false);
    });
    // Once, on arrival: its inputs are sign-up's, and they do not change while the screen is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const trimmed = name.trim();
    // Checked here so the answer is instant and names the field, and again in
    // the database, where it is the rule rather than a courtesy.
    if (trimmed.length < 2) {
      setError("Give the workspace a name — the receptionist introduces itself with it.");
      return;
    }
    await create(trimmed, code.trim());
  };

  // Joining the list, from here. The button sent a signed-in person to /signup,
  // and the middleware sends a signed-in person away from /signup, back to this
  // screen: a loop (the wiring audit's N1). The list takes the business's name
  // and the address they signed in with, and makes nothing.
  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = await joinWaitlistFrom(window, { name, email: email ?? "" });
    setBusy(false);
    if (r.ok) setJoined(r.sentence);
    else setError(r.message);
  };

  // A first workspace's way out, and the pages signing up agreed to. The screen
  // had neither, so somebody signed in with the wrong account could only close
  // the tab (N2). Another workspace, opened from inside the app, has Back and
  // the app's own menu.
  const leave = another ? null : (
    <p className="cw-legal">
      <button
        className="cw-link"
        type="button"
        onClick={() => window.__shell?.signOut()}
        data-testid="create-workspace-signout"
      >
        Sign out
      </button>
      <span aria-hidden="true">·</span>
      <a href="/terms">Terms of service</a>
      <span aria-hidden="true">·</span>
      <a href="/privacy">Privacy policy</a>
    </p>
  );

  // Being made, from what sign-up kept: nothing to ask, so nothing asked.
  if (making) {
    return (
      <div className="cw-screen">
        <div className="cw-card" role="status" aria-live="polite" data-testid="cw-making">
          <h1 className="cw-title">{kept}</h1>
          <p className="cw-lede">{SIGNUP_WORDS.making}</p>
        </div>
      </div>
    );
  }

  // The list, not the workspace form: a waitlist takes details and makes
  // nothing, and a first workspace behind one is refused by the route anyway.
  if (door === "waitlist") {
    return (
      <div className="cw-screen" data-testid="create-workspace-waitlist">
        <form className="cw-card" onSubmit={join}>
          <h1 className="cw-title">{SIGNUP_WORDS.waitlistTitle}</h1>
          {joined ? (
            <p className="cw-lede" role="status" data-testid="create-workspace-joined">
              {joined}
            </p>
          ) : (
            <>
              <p className="cw-lede">{SIGNUP_WORDS.waitlistLead}</p>
              <label className="cw-field">
                <span className="cw-label">Business name</span>
                <input
                  className="cw-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="The name customers know you by"
                  autoFocus
                  maxLength={120}
                  aria-label="Business name"
                />
                {email && <span className="cw-hint">{SIGNUP_WORDS.waitlistWriteTo(email)}</span>}
              </label>
              {error && (
                <div className="cw-error" role="alert">
                  {error}
                </div>
              )}
              <button className="cw-submit" type="submit" disabled={busy} data-testid="create-workspace-join">
                {busy ? "Joining…" : SIGNUP_WORDS.waitlistCta}
              </button>
            </>
          )}
          {leave}
        </form>
      </div>
    );
  }

  return (
    <div className="cw-screen" data-testid="create-workspace">
      <form className="cw-card" onSubmit={submit}>
        <h1 className="cw-title">{another ? "New workspace" : "Create your workspace"}</h1>
        <p className="cw-lede">
          {another ? (
            <>
              Another business, another workspace: its own receptionist, conversations and team. You become its owner
              {email ? (
                <>
                  {" "}
                  as <b>{email}</b>
                </>
              ) : null}
              .
            </>
          ) : (
            <>
              One business, one workspace. It holds your receptionist, your conversations and your team
              {email ? (
                <>
                  {" "}
                  — signed in as <b>{email}</b>
                </>
              ) : null}
              .
            </>
          )}
        </p>

        <label className="cw-field">
          <span className="cw-label">Business name</span>
          <input
            className="cw-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="The name customers know you by"
            autoFocus
            maxLength={120}
            aria-label="Business name"
          />
        </label>

        <label className="cw-field">
          <span className="cw-label">Timezone</span>
          <select
            className="cw-input"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            aria-label="Timezone"
          >
            {zones.map((z) => (
              <option key={z} value={z}>
                {z.replace(/_/g, " ")}
              </option>
            ))}
          </select>
          {/* Not a formality: this is the clock the receptionist answers
              "are you open right now?" against. */}
          <span className="cw-hint">Your opening hours are read in this timezone.</span>
        </label>

        {door === "invite" && (
          <label className="cw-field">
            <span className="cw-label">Invite code</span>
            <input
              className="cw-input"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="From your Chanlytics contact"
              autoComplete="off"
              maxLength={80}
              aria-label="Invite code"
            />
            <span className="cw-hint">{SIGNUP_WORDS.firstWorkspaceCode}</span>
          </label>
        )}

        {error && (
          <div className="cw-error" role="alert">
            {error}
          </div>
        )}

        <button className="cw-submit" type="submit" disabled={busy}>
          {busy ? "Creating…" : "Create workspace"}
        </button>
        {onCancel && (
          <button
            className="cw-back"
            type="button"
            onClick={onCancel}
            disabled={busy}
            data-testid="create-workspace-back"
          >
            Back
          </button>
        )}

        {!another && (
          <p className="cw-foot">
            Been invited to a workspace? Ask whoever invited you to send it again — an invitation is accepted the first
            time you sign in.
          </p>
        )}
        {leave}
      </form>
    </div>
  );
}
