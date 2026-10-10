/**
 * Settings › Team, what its presses do: each goes to the server through the bridge's team doors, and the card says what
 * the server answered. A role change, a removal (and the alerts that go with it), a member's own leave, an invitation
 * sent again, and the answer to whatever a row asked.
 *
 * Who gets alerts is the Notifications list's (contracts alerts.ts), changed through the save that pane makes, the
 * rest of its section kept.
 */
import type { ReactNode } from "react";
import { ALERT_REFUSED_WORDS, roleSays, withAlertAddress } from "@chanlytics/contracts";
import { saveSettings, teamVerbs } from "@/legacy-bridge/inbox-verbs";
import type { SettingsSurface, WorkspaceSettings } from "@/legacy-bridge/surfaces/settings";
import { rememberWorkspace } from "@/legacy-bridge/workspace";
import type { LegacyFlash } from "../../legacy-verbs";
import type { TeamPerson } from "./people";
import type { TeamAsk } from "./rows";

type Flash = (f: LegacyFlash) => void;

/** The config as the card reads it: the alerts section beside whatever else the workspace holds. */
type TeamConfig = WorkspaceSettings & { notifications?: { escalation_emails?: string[] } };

/** The config the settings read holds, or null where it was not read or is broken. */
export const teamConfigOf = (read: SettingsSurface): TeamConfig | null => read.settings?.config ?? null;

/** Why this member's alerts may not be turned off (the last address), or null where they may. */
export function alertsHeldFor(cfg: TeamConfig | null, m: TeamPerson): string | null {
  const off = withAlertAddress(cfg && cfg.notifications, m.email, false);
  return off.ok ? null : ALERT_REFUSED_WORDS[off.reason];
}

/**
 * Who gets alerts, changed through the settings save (the Notifications pane's), the rest of its section kept. True
 * when the list says what was asked. `failed` is what a failure says instead of the server's sentence alone, where the
 * press was part of something else (a removal, a leave) that the owner must hear about whole.
 */
export async function saveAlerts(
  read: SettingsSurface,
  m: TeamPerson,
  on: boolean,
  said: { flash: Flash; failed?: ReactNode },
): Promise<boolean> {
  const { flash, failed = null } = said;
  const record = read.settings;
  const cfg = teamConfigOf(read);
  const refuse = (why: ReactNode): false => {
    flash({ tone: "warn", msg: failed ?? why });
    return false;
  };
  if (!record || !cfg) return refuse(<>Alerts can&apos;t be changed while the settings can&apos;t be read.</>);
  const next = withAlertAddress(cfg.notifications, m.email, on);
  if (!next.ok) return refuse(<>{ALERT_REFUSED_WORDS[next.reason]}</>);
  if (!next.changed) return true;
  const r = await saveSettings({ ...cfg, notifications: next.notifications }, record.version);
  if (!r.ok) return refuse(<>{r.message}</>);
  flash({
    tone: "ok",
    msg: (
      <>
        <b>{m.email}</b> {on ? "gets alerts now" : "no longer gets alerts"}
      </>
    ),
  });
  return true;
}

/** What the server's answer to a team change said, as the card flashes it. */
const flashOf = (r: { ok: boolean; message?: string }, done: ReactNode): LegacyFlash =>
  r.ok ? { tone: "ok", msg: done } : { tone: "danger", msg: <>{r.message}</> };

/** What the card's presses do, over its state's setters. */
export function teamActs(o: {
  read: SettingsSurface;
  flash: Flash;
  everyone: readonly TeamPerson[];
  ask: TeamAsk | null;
  setAsk: (a: TeamAsk | null) => void;
  setBusy: (b: boolean) => void;
  /** The invitation being sent again, if one is: one at a time, so a second press waits for the first. */
  resending: string | null;
  setResending: (id: string | null) => void;
}) {
  const { read, flash, setAsk, setBusy } = o;
  // The last-owner rule is enforced in the database and its message comes back from there.
  const changeRole = async (m: TeamPerson, role: string) => {
    setBusy(true);
    const r = await teamVerbs.setRole(m.id, role);
    setBusy(false);
    setAsk(null);
    flash(
      flashOf(
        r,
        <>
          <b>{m.name}</b> is now {roleSays(role).one}
        </>,
      ),
    );
  };
  const remove = async (p: TeamPerson, stopAlerts: boolean) => {
    setBusy(true);
    const r = await teamVerbs.remove(p.id);
    setBusy(false);
    setAsk(null);
    const revoked = r.ok && !!(r.data as { revokedInvite?: boolean } | null)?.revokedInvite;
    flash(
      flashOf(
        r,
        <>
          <b>{p.name}</b> {revoked ? "invitation revoked" : "removed from the team"}
        </>,
      ),
    );
    // Their address leaves the alerts too, where the owner left that on: removed, they would still be emailed every
    // time the receptionist needs a person. If that save fails, the owner hears both halves: they are off the team,
    // and still on the list, and where to take them off.
    if (r.ok && !revoked && stopAlerts)
      await saveAlerts(read, p, false, {
        flash,
        failed: (
          <>
            <b>{p.name}</b> was removed, but still gets alerts. Take {p.email} off on Notifications.
          </>
        ),
      });
  };
  const leave = async (p: TeamPerson, dropAlerts: boolean) => {
    setBusy(true);
    // Their own address leaves the alerts first, where they may change them: once they are gone, only an owner could.
    if (
      dropAlerts &&
      !(await saveAlerts(read, p, false, {
        flash,
        failed: <>Your address couldn&apos;t be taken off the alerts, so you haven&apos;t left yet. Try again.</>,
      }))
    ) {
      setBusy(false);
      return;
    }
    const r = await teamVerbs.leave();
    setBusy(false);
    setAsk(null);
    if (!r.ok) {
      flash({ tone: "danger", msg: <>{r.message}</> });
      return;
    }
    // Nothing of this workspace is theirs to read any more: the app opens on the workspaces they still have, and not on
    // the one the device remembers (LegacyHost opens the remembered workspace first).
    rememberWorkspace(null);
    window.location.assign("/");
  };
  const resend = async (i: TeamPerson) => {
    if (o.resending) return;
    o.setResending(i.id);
    const r = await teamVerbs.resend(i.id);
    o.setResending(null);
    flash(
      flashOf(
        r,
        <>
          Invitation sent to <b>{i.email}</b> again
        </>,
      ),
    );
  };
  const answer = async (yes: boolean) => {
    const a = o.ask;
    const p = a && o.everyone.find((x) => x.id === a.id);
    if (!yes || !a || !p) {
      setAsk(null);
      return;
    }
    if (a.kind === "promote") await changeRole(p, "owner");
    else if (a.kind === "leave") await leave(p, a.dropAlerts);
    else await remove(p, a.kind === "remove" && a.stopAlerts);
  };
  return { changeRole, remove, leave, resend, answer };
}
