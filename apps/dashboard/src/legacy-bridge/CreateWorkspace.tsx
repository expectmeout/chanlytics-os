"use client";

import { useState } from "react";
import type { PendingWorkspace } from "@chanlytics/contracts";
import { api } from "./api";

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
    "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
    "America/Phoenix", "America/Anchorage", "Pacific/Honolulu", "America/Toronto",
    "Europe/London", "Europe/Madrid", "Europe/Paris", "Europe/Berlin",
    "America/Mexico_City", "America/Bogota", "America/Sao_Paulo", "UTC",
  ];
  return [here, ...common.filter((z) => z !== here)];
})();

export default function CreateWorkspace({
  email,
  initial,
  onCreated,
  onCancel,
}: {
  email: string | null;
  /** What sign-up kept for this person, when it did: the form opens with it. */
  initial?: PendingWorkspace | null;
  onCreated: (w: CreatedWorkspace) => void;
  /** Present when there is somewhere to go back to: this is another workspace, not the first. */
  onCancel?: () => void;
}) {
  const another = !!onCancel;
  const [name, setName] = useState(initial?.name ?? "");
  const [timezone, setTimezone] = useState(initial?.timezone || browserZone());
  // A zone sign-up kept that the short list does not carry is still the one
  // they chose, so it heads the list rather than vanishing into it.
  const [zones] = useState(() => (initial?.timezone && !ZONES.includes(initial.timezone) ? [initial.timezone, ...ZONES] : ZONES));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setBusy(true);
    setError(null);
    const r = await api()("POST workspaces/create", { body: { name: trimmed, timezone } });
    if (!r.ok) {
      // The server's message is written for a person to read — "Unknown
      // timezone: Mars/Olympus", "This account already owns 10 workspaces" —
      // so it is shown rather than replaced with something generic.
      setError(r.message);
      setBusy(false);
      return;
    }
    onCreated(r.data.workspace);
  };

  return (
    <div className="cw-screen" data-testid="create-workspace">
      <form className="cw-card" onSubmit={submit}>
        <h1 className="cw-title">{another ? "New workspace" : "Create your workspace"}</h1>
        <p className="cw-lede">
          {another
            ? <>Another business, another workspace: its own receptionist, conversations and team. You become its owner{email ? <> as <b>{email}</b></> : null}.</>
            : <>One business, one workspace. It holds your receptionist, your conversations and your team{email ? <> — signed in as <b>{email}</b></> : null}.</>}
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
              <option key={z} value={z}>{z.replace(/_/g, " ")}</option>
            ))}
          </select>
          {/* Not a formality: this is the clock the receptionist answers
              "are you open right now?" against. */}
          <span className="cw-hint">Your opening hours are read in this timezone.</span>
        </label>

        {error && <div className="cw-error" role="alert">{error}</div>}

        <button className="cw-submit" type="submit" disabled={busy}>
          {busy ? "Creating…" : "Create workspace"}
        </button>
        {onCancel && (
          <button className="cw-back" type="button" onClick={onCancel} disabled={busy} data-testid="create-workspace-back">
            Back
          </button>
        )}

        {!another && (
          <p className="cw-foot">
            Been invited to a workspace? Ask whoever invited you to send it again — an
            invitation is accepted the first time you sign in.
          </p>
        )}
      </form>
    </div>
  );
}
