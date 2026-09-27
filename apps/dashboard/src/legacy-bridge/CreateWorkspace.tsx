"use client";

import { useEffect, useRef, useState } from "react";
import {
  FIRST_RUN_ROUTE,
  HANDOVER_WORDS,
  handoverUntilWords,
  PARTNER_COOKIE,
  PARTNER_WORDS,
  SIGNUP_WORDS,
  firstRunKicker,
  partnerCodeFromCookie,
  type PendingWorkspace,
  type OpenHandoverDto,
  type SignupPosture,
} from "@chanlytics/contracts";
import { api } from "./api";
import { joinWaitlistFrom } from "./waitlist";
import { switchWorkspace } from "./surface-data";

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
 *
 * A first workspace with no name kept (an account that arrived through Google
 * never saw the sign-up form) is the first run's first step begun (canvas V1):
 * "What's your business called?", the invite code while sign-up is by
 * invitation, and Find it, which makes the workspace and opens the first run
 * on Find, already searched for that name. The clock is the device's, as
 * email sign-up keeps it; the first run's business step shows it.
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
  // A partner's link brought them (0012): the partner joins the team only if they say yes here, so the screen asks
  // rather than making the workspace on arrival, and the yes is the default they can take back.
  const [partnerCode] = useState(() =>
    typeof document === "undefined" ? null : partnerCodeFromCookie(document.cookie),
  );
  const [withPartner, setWithPartner] = useState(true);

  // CREATE ONCE (F5): a first workspace whose name sign-up kept is made as the
  // screen opens, from that name and clock -- and the invite code sign-up
  // checked, which the create route reads for itself -- so there is no second
  // screen. A refusal (a name taken, a code that changed since) leaves the
  // form, filled in, with the server's sentence, as a press on it would.
  const kept = !another && door !== "waitlist" && !partnerCode ? (initial?.name ?? "").trim() : "";
  const [making, setMaking] = useState(kept.length >= 2);
  const started = useRef(false);

  /** Make the workspace: the press's and the arrival's one way. True once it is made. */
  const create = async (trimmed: string, typedCode: string): Promise<boolean> => {
    setBusy(true);
    setError(null);
    const r = await api()("POST workspaces/create", {
      body: {
        name: trimmed,
        timezone,
        ...(door === "invite" && typedCode ? { code: typedCode } : {}),
        ...(partnerCode && withPartner ? { partner: partnerCode } : {}),
      },
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
    // The link's cookie has done its one job, yes or no: a later workspace is not credited to it.
    if (partnerCode) document.cookie = `${PARTNER_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax; Secure`;
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

  // One form. A first workspace is the first run's first step, begun (V1): its step line, the business asked for, and
  // the device's zone. Another, from inside the app, keeps its own head, its zone and Back.
  return (
    <div className="cw-screen" data-testid="create-workspace">
      <form className="cw-card" onSubmit={submit}>
        <div className="cw-head">
          {!another && (
            <p className="cw-kicker" data-testid="cw-kicker">
              {firstRunKicker("business")}
            </p>
          )}
          <h1 className="cw-title">{another ? "New workspace" : SIGNUP_WORDS.nameTitle}</h1>
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
              SIGNUP_WORDS.nameLead
            )}
          </p>
        </div>

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

        {another && (
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
        )}

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

        {partnerCode && (
          <label className="cw-field cw-check" data-testid="create-workspace-partner">
            <input
              type="checkbox"
              checked={withPartner}
              onChange={(e) => setWithPartner(e.target.checked)}
              disabled={busy}
              data-testid="create-workspace-partner-yes"
            />
            <span className="cw-hint">{PARTNER_WORDS.joinAsk(partnerCode)}</span>
          </label>
        )}

        {error && (
          <div className="cw-error" role="alert">
            {error}
          </div>
        )}

        <button className="cw-submit" type="submit" disabled={busy}>
          {another ? (busy ? "Creating…" : "Create workspace") : busy ? SIGNUP_WORDS.making : SIGNUP_WORDS.nameCta}
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

/**
 * A workspace a partner set up and handed to this person (decision 0015), asked before anything else opens: the
 * create screen for an account with no workspace yet, the app for one with some. Ownership comes with the bill, so it
 * is accepted, never assumed: Accept makes them its owner and opens it at its first run; Decline says no, and the
 * partner hears it; Not now leaves it open until its fourteen days end, and the app opens as it would have.
 *
 * Rendered INSTEAD of the app, as the create screen is. One handover at a time, the oldest first.
 */
function Handover({ handover, onDone }: { handover: OpenHandoverDto; onDone: () => void }) {
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const H = HANDOVER_WORDS;

  const accept = async () => {
    if (busy) return;
    setBusy("accept");
    setError(null);
    const r = await api()("POST handovers/[id]/accept", { params: { id: handover.tenantId } });
    if (!r.ok) {
      setBusy(null);
      setError(r.message);
      return;
    }
    // Into it at its first run, by its slug: it is not on the switcher's list yet.
    switchWorkspace(r.data.workspace.id, r.data.workspace.slug, `#/${FIRST_RUN_ROUTE}`);
  };

  const decline = async () => {
    if (busy) return;
    setBusy("decline");
    setError(null);
    const r = await api()("POST handovers/[id]/decline", { params: { id: handover.tenantId } });
    setBusy(null);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    onDone();
  };

  return (
    <div className="cw-screen" data-testid="handover">
      <div className="cw-card">
        <h1 className="cw-title">{H.title(handover.workspace)}</h1>
        <p className="cw-lede" data-testid="handover-body">
          {H.body(handover.partnerCode, handover.workspace)}
        </p>
        <p className="cw-hint" data-testid="handover-until">
          {handoverUntilWords(handover.expiresAt)}
        </p>
        {error ? (
          <p className="cw-error" role="alert" data-testid="handover-error">
            {error}
          </p>
        ) : null}
        <button
          className="cw-submit"
          type="button"
          onClick={accept}
          disabled={busy !== null}
          aria-busy={busy === "accept" || undefined}
          data-testid="handover-accept"
        >
          {busy === "accept" ? H.accepting : H.accept}
        </button>
        <p className="cw-legal">
          <button
            className="cw-link"
            type="button"
            onClick={decline}
            disabled={busy !== null}
            data-testid="handover-decline"
          >
            {busy === "decline" ? H.declining : H.decline}
          </button>
          <span aria-hidden="true">·</span>
          <button
            className="cw-link"
            type="button"
            onClick={onDone}
            disabled={busy !== null}
            data-testid="handover-later"
          >
            {H.later}
          </button>
        </p>
      </div>
    </div>
  );
}

/**
 * The ask the shell makes before anything else (0015), once the workspace list is read: the oldest handover waiting
 * for this person (GET workspaces, on the person) that they have not passed over this visit, or null. Not now and
 * Decline pass it over; Accept leaves.
 */
export function useHandoverAsk(ready: boolean, handovers: OpenHandoverDto[] | undefined): React.ReactElement | null {
  const [passed, setPassed] = useState<string[]>([]);
  if (!ready) return null;
  const next = (handovers ?? []).find((h) => !passed.includes(h.tenantId));
  if (!next) return null;
  return <Handover handover={next} onDone={() => setPassed((p) => [...p, next.tenantId])} />;
}
