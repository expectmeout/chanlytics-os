/**
 * Settings › Team: who has access to this workspace, and as what (moved from legacy/pages/settings.jsx, decision 0015
 * step 11; redesigned 9 Oct 2026). Settings' page draws it as the Partner pane's Team (partner/team-card.tsx).
 *
 * The people first: the members, you at the top, then the invitations waiting to be taken. Under them the roles, with
 * Compare and an owner's Preview as, then the workspace's partner, so one card says who has access. View as stood at
 * the top as large as the roster and read like a filter on it; it is a menu on the roles' row now, and while it is on,
 * the shell's status line says so on every page.
 *
 * The real roster and its open invitations, from the settings read (the seam's `team` and `invites`). It rendered four
 * invented colleagues once -- and put YOU beside one of them, on a real owner's own settings page -- and a failed read
 * fell through to the same seeds: a team that could not be read is a card that says so, never a team of four strangers.
 * The API has no display names, only emails: the name they gave with the email under it, or the email alone, and never
 * the email's local part dressed as a name.
 *
 * Every write goes to the server and the card shows what the server says afterwards. These handlers once mutated the
 * seeded roster and toasted success on a pane fed by live data: an owner read "Invite sent to x as Operator" and nothing
 * was sent, stored or audited. There is no optimistic update and no undo: an invitation email cannot be recalled, and a
 * role change is the power to message customers. What each press does is acts.tsx.
 */
import { useEffect, useState, type ReactNode } from "react";
import { pageClock } from "@/legacy-bridge/zone";
import { Button } from "../../kit/button/button";
import { FailedRead } from "../../kit/empty/empty";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import {
  actingRole,
  canDo,
  gate,
  gateTitle,
  meNow,
  navigate,
  onRolesChanged,
  routeDoor,
  viewAsRole,
  type LegacyFlash,
} from "../../legacy-verbs";
import { useSurface } from "../../use-surface";
import { alertsHeldFor, saveAlerts, teamActs, teamConfigOf } from "./acts";
import { TeamInvite } from "./invite";
import { PartnerRow } from "./partner";
import { isLastOwner, ownersOf, teamPeopleOf } from "./people";
import { RolesRow } from "./roles";
import { inviteRow, memberRow, type RowActs, type TeamAsk } from "./rows";
import { PersonSheet } from "./sheet";

type Flash = (f: LegacyFlash) => void;

/** The card's head: its name, how many people (or that they could not be read), Activity and Invite. */
function teamHead(o: { count: string; activity: boolean; invite: ReactNode }): ReactNode {
  return (
    <div className="rec-card-head">
      <h2 className="rec-card-title" id="set-team-title">
        Team
      </h2>
      <span className="rec-card-sub">{o.count}</span>
      {o.activity && (
        <LinkButton {...routeDoor("admin/activity/team")} className="set-team-history" data-testid="team-activity">
          <Icon name="clock" size={12} /> Activity
        </LinkButton>
      )}
      {o.invite}
    </div>
  );
}

/** "3 people · 2 waiting", or that the roster could not be read. */
function countWords(members: number, waiting: number, failed: boolean): string {
  if (failed) return "Couldn't be loaded";
  const people = `${members} ${members === 1 ? "person" : "people"}`;
  return waiting ? `${people} · ${waiting} waiting` : people;
}

export const TeamSection = ({ flash }: { flash: Flash }) => {
  const read = useSurface("settings");
  // The role store's View-as moves what this card offers: it draws again when the store says so.
  const [, setTick] = useState(0);
  useEffect(() => onRolesChanged(() => setTick((n) => n + 1)), []);
  const [inviting, setInviting] = useState(false);
  const [ask, setAsk] = useState<TeamAsk | null>(null);
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState<string | null>(null);
  const [sheet, setSheet] = useState<string | null>(null);
  // Before the settings read there is nothing of this workspace's team to say; the route waits for it.
  if (!read || read.team === undefined) return null;
  const realTeam = read.team;
  const failed = realTeam === null;
  const clock = pageClock();
  const cfg = teamConfigOf(read);
  const { members, waiting } = teamPeopleOf({
    team: realTeam ?? [],
    invites: Array.isArray(read.invites) ? read.invites : [],
    me: meNow()?.email || null,
    notifications: cfg && cfg.notifications,
    tz: clock.zone(),
    now: Date.now(),
  });
  const everyone = [...members, ...waiting];
  // The caller's REAL role decides what they may do; View-as previews a narrower one, and can only ever narrow. When
  // only the TEAM read failed, the settings read still gave the caller's real role.
  const serverRole = (read.settings && read.settings.role) || actingRole();
  const previewing = viewAsRole();
  const canManage = canDo("team");
  const acts = teamActs({ read, flash, everyone, ask, setAsk, setBusy, resending, setResending });
  const k: RowActs = {
    canManage,
    mayAlerts: canDo("settings") && !!cfg,
    ask,
    busy,
    resending,
    lastOwner: (m) => isLastOwner(members, m),
    alertsHeld: (m) => alertsHeldFor(cfg, m),
    pickRole: (m, role) => {
      if (role === m.role) return;
      // Owner is billing, the team and the power to remove anyone, the caller included: asked first, on the row.
      if (role === "owner") setAsk({ kind: "promote", id: m.id });
      else void acts.changeRole(m, role);
    },
    // One alerts save at a time: a second goes out on the version read before the first landed, and is refused as
    // somebody else's change (the settings save re-reads the version before it answers).
    setAlerts: (m, on) => {
      if (busy) return;
      setBusy(true);
      void saveAlerts(read, m, on, { flash }).finally(() => setBusy(false));
    },
    arm: (a) => setAsk(a),
    answer: (yes) => void acts.answer(yes),
    setStopAlerts: (on) => setAsk((a) => (a && a.kind === "remove" ? { ...a, stopAlerts: on } : a)),
    resend: (i) => void acts.resend(i),
    toProfile: () => navigate("admin/profile"),
    open: (p) => setSheet(p.id),
  };

  // Whom to ask, by name: the gate's sentence says only an owner may, and a member should not have to find out who.
  const askWho = ownersOf(members)
    .filter((o) => !o.isMe)
    .map((o) => o.name)
    .join(" or ");
  const open = sheet ? everyone.find((p) => p.id === sheet) : undefined;
  return (
    <section className="rec-card set-card set-team" data-testid="set-team" aria-labelledby="set-team-title">
      {teamHead({
        count: countWords(members.length, waiting.length, failed),
        activity: canDo("export"),
        // Invite is the card's act, so a role that may not invite sees it gated, saying why when pressed, instead of a
        // card with no act at all.
        invite:
          !failed && !inviting ? (
            <Button
              size="sm"
              onClick={() => setInviting(true)}
              data-testid="team-invite-open"
              {...gate("team", "invite a teammate")}
            >
              <Icon name="plus" size={12} /> Invite
            </Button>
          ) : null,
      })}

      {inviting && canManage && (
        <TeamInvite
          people={everyone}
          flash={flash}
          onResend={(id) => {
            const i = waiting.find((w) => w.id === id);
            if (i) void acts.resend(i);
          }}
          onClose={() => setInviting(false)}
        />
      )}

      {/* A team we could not read is not a team of four strangers. */}
      {failed && (
        <FailedRead
          kind="card"
          what="your team"
          body="Everything else on this page is current — only the member list failed to load."
          surface="settings"
          testid="team-failed"
        />
      )}

      {members.map((m) => memberRow(m, k))}

      {waiting.length > 0 && (
        <>
          <h3 className="set-team-group" data-testid="team-waiting">
            Waiting to join
          </h3>
          {waiting.map((i) => inviteRow(i, k))}
        </>
      )}

      <RolesRow
        isOwner={serverRole === "owner"}
        previewing={previewing && previewing !== "owner" ? previewing : null}
        withPartner={members.some((m) => m.role === "partner")}
      />

      <PartnerRow flash={flash} previewing={!!previewing && previewing !== "owner"} />

      {!canManage && !failed && (
        <p className="set-team-ask-owner" data-testid="team-gated">
          {gateTitle("team", "change the team")}
          {askWho ? ` Ask ${askWho}.` : null}
        </p>
      )}

      {open && <PersonSheet person={open} k={k} onClose={() => setSheet(null)} />}
    </section>
  );
};
