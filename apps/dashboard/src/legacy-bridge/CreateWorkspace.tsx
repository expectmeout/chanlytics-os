"use client";

import { useState } from "react";

/**
 * The first screen of an account that belongs to nowhere.
 *
 * Until this existed, a session with no memberships reached the shell, every
 * surface fetched and 404'd, and the status pill said "Connecting to your
 * workspace…" — forever, because there was nothing to connect to. The only way
 * out was an engineer writing SQL. That is what made a second customer an
 * engineering task rather than a signup.
 *
 * Rendered INSTEAD of the app, not inside it: there is no workspace, so there
 * is no inbox, no settings and no nav to put this in.
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
  onCreated,
}: {
  email: string | null;
  onCreated: (w: CreatedWorkspace) => void;
}) {
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState(browserZone());
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
    try {
      const res = await fetch("/api/v1/workspaces/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: trimmed, timezone }),
      });
      const body = (await res.json().catch(() => null)) as
        | { ok: boolean; data?: { workspace: CreatedWorkspace }; error?: { message?: string } }
        | null;
      if (!body?.ok || !body.data?.workspace) {
        // The server's message is written for a person to read — "Unknown
        // timezone: Mars/Olympus", "This account already owns 10 workspaces" —
        // so it is shown rather than replaced with something generic.
        setError(body?.error?.message ?? `Could not create the workspace (${res.status}).`);
        setBusy(false);
        return;
      }
      onCreated(body.data.workspace);
    } catch {
      setError("Network error — the workspace was not created.");
      setBusy(false);
    }
  };

  return (
    <div className="cw-screen">
      <form className="cw-card" onSubmit={submit}>
        <h1 className="cw-title">Create your workspace</h1>
        <p className="cw-lede">
          One business, one workspace. It holds your receptionist, your conversations
          and your team{email ? <> — signed in as <b>{email}</b></> : null}.
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
            {ZONES.map((z) => (
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

        <p className="cw-foot">
          Been invited to a workspace? Ask whoever invited you to send it again — an
          invitation is accepted the first time you sign in.
        </p>
      </form>
    </div>
  );
}
