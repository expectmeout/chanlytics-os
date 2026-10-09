/**
 * Settings › Team: who has access to this workspace, and as what (moved from legacy/pages/settings.jsx, decision 0015
 * step 11). Settings' page draws it as the Partner pane's Team (partner/team-card.tsx), above the workspace's partner
 * card.
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
 * role change is the power to message customers.
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { inviteState, memberWords, personInitials, stateOf } from "@chanlytics/contracts";
import { teamVerbs } from "@/legacy-bridge/inbox-verbs";
import type { TeamInvite, TeamMember } from "@/legacy-bridge/surfaces/settings";
import { Confirm } from "../../kit/confirm/confirm";
import { FailedRead } from "../../kit/empty/empty";
import { Icon } from "../../kit/icon/icon";
import { MoreMenu } from "../../kit/more-menu/more-menu";
import { Segmented } from "../../kit/segmented/segmented";
import {
  actingRole,
  canDo,
  editorBox,
  focusAsDrawn,
  gate,
  gateTitle,
  meNow,
  onRolesChanged,
  setViewAs,
  viewAsRole,
  type LegacyFlash,
} from "../../legacy-verbs";
import { useSurface } from "../../use-surface";
import { EMAIL_SHAPE, roleWords } from "../shared";

type Flash = (f: LegacyFlash) => void;

/** A row of the card: a member, or an invitation nobody has taken yet. */
interface Person {
  id: string;
  name: string;
  sub: string | null;
  email: string;
  displayName: string;
  role: string;
  status: "active" | "invited";
  expiresAt?: string | null;
  isMe: boolean;
}

/** A person's own hue, from the address they are known by: the same two letters on the same disc, but one is theirs. */
const teamHue = (seed: string): number => {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
};

/** A teammate's role is a name, not a state (tone.ts `role` is plain): the one chip, in the words contracts keeps. */
function RolePill({ role }: { role: string }) {
  return (
    <span className="chip" data-role={role}>
      {stateOf("role", role).label}
    </span>
  );
}

/** The members, then the invitations: the card's whole job is saying who has access to this workspace. */
function peopleOf(team: TeamMember[], invites: TeamInvite[], me: string | null): Person[] {
  return [
    ...team.map((m) => {
      const w = memberWords({ email: m.email, display_name: m.displayName });
      return {
        id: m.membershipId,
        name: w.name,
        sub: w.sub,
        // An address the roster lacks draws as one that is empty: the face, the duplicate check and "You" read it alike.
        email: m.email ?? "",
        displayName: m.displayName || "",
        role: m.role,
        status: "active" as const,
        isMe: !!me && m.email === me,
      };
    }),
    // When an invitation stops working, the card says so, instead of "pending" for ever over a door that has closed.
    ...invites.map((i) => ({
      id: i.id,
      name: i.email,
      sub: null,
      email: i.email,
      displayName: "",
      role: i.role,
      status: "invited" as const,
      expiresAt: i.expires_at || null,
      isMe: false,
    })),
  ];
}

/** An owner's preview of a narrower role: View-as, the role store's, which every gate reads and which only narrows. */
function viewAs(myRole: string, previewing: boolean): ReactNode {
  return (
    <div className="set-viewas">
      <span className="set-viewas-label" id="set-viewas-label">
        View as
      </span>
      <Segmented
        labelledBy="set-viewas-label"
        value={myRole}
        onValueChange={(r) => setViewAs(r === "owner" ? null : r)}
        options={["owner", "operator", "viewer"].map((r) => ({ value: r, label: roleWords(r).label }))}
      />
      {previewing && (
        <span className="set-viewas-note">
          <Icon name="agents" size={10} /> Previewing — controls a {roleWords(myRole).label} wouldn&apos;t have are
          hidden
        </span>
      )}
    </div>
  );
}

/** What a row is handed: who may manage, the row armed for removal, and the card's acts. */
interface RowKit {
  canManage: boolean;
  armRemove: string | null;
  setArmRemove: (id: string | null) => void;
  teamBusy: boolean;
  remove: (m: Person) => void;
  changeRole: (m: Person, role: string) => void;
}

/** One person: their face, their name and address, Remove asked on the row, their role, and the menu that changes it. */
function personRow(m: Person, k: RowKit): ReactNode {
  const pending = m.status === "invited";
  const invite = pending ? inviteState(m.expiresAt, Date.now()) : { expired: false, words: "invite pending" };
  // An open invitation has no membership row to change a role on: the server looks the id up among members and
  // answers "not on this team". The role was chosen when the invite was sent — revoke and re-invite to change it.
  const items = [
    ...(pending
      ? []
      : [
          { header: "Role" },
          ...["owner", "operator", "viewer"].map((r) => ({
            label: roleWords(r).label + (m.role === r ? "  ✓" : ""),
            icon: r === "owner" ? "shield" : r === "operator" ? "agents" : "users",
            onClick: () => k.changeRole(m, r),
          })),
          { divider: true },
        ]),
    { label: pending ? "Revoke invite" : "Remove", icon: "x", danger: true, onClick: () => k.setArmRemove(m.id) },
  ];
  return (
    <div
      key={m.id}
      className={`set-team-row ${pending ? "pending" : ""} ${invite.expired ? "expired" : ""}`}
      data-asking={k.armRemove === m.id ? "true" : undefined}
    >
      <span
        className="avatar set-team-face"
        aria-hidden="true"
        style={{ "--who-h": teamHue(m.email || m.name) } as CSSProperties}
      >
        {personInitials(m.displayName, m.email)}
      </span>
      <span className="set-team-body">
        <span className="set-team-name">
          {m.name}
          {m.isMe && (
            <>
              {" "}
              <span className="chip set-team-you">You</span>
            </>
          )}
        </span>
        <span className="set-team-mail">{[m.sub, pending ? invite.words : ""].filter(Boolean).join(" · ")}</span>
      </span>
      <RolePill role={m.role} />
      {k.canManage && !m.isMe ? (
        <MoreMenu btnClass="btn btn-icon btn-sm" items={items} />
      ) : (
        <span className="set-team-spacer" />
      )}
      {/* The question takes a line of its own under the row (settings.css, .set-row-ask): in the body's column it
          stood in what a phone leaves between the face and the role, its two answers pinched (Ruben, 7 Oct 2026). */}
      {k.armRemove === m.id && (
        <Confirm
          className="set-row-ask"
          question={pending ? `Revoke the invitation to ${m.email}?` : `Remove ${m.name} from the team?`}
          detail={
            pending
              ? "The link in their email stops working."
              : "They lose access at once; what they decided stays on the record."
          }
          yes={pending ? "Yes, revoke" : "Yes, remove"}
          danger
          busy={k.teamBusy}
          onYes={() => k.remove(m)}
          onNo={() => k.setArmRemove(null)}
          testid="team-remove"
        />
      )}
    </div>
  );
}

/** What each role may do, under the roster: a partner's only where one is on it. */
function rolesLegend(people: Person[]): ReactNode {
  return (
    <div className="set-roles-legend">
      {["owner", "operator", ...(people.some((m) => m.role === "partner") ? ["partner"] : []), "viewer"].map((r) => (
        <div key={r} className="set-role-def">
          <RolePill role={r} />
          <span className="set-role-can">{roleWords(r).can}</span>
        </div>
      ))}
    </div>
  );
}

/** What an invitation's answer said happened: added, already there, already invited, or emailed. */
function invitedWords(
  mail: string,
  role: string,
  d: { alreadyMember?: boolean; added?: boolean; alreadyInvited?: boolean },
) {
  // The server distinguishes these; saying "invite sent" for an account that was simply added would promise an email
  // nobody receives.
  if (d.alreadyMember)
    return (
      <>
        <b>{mail}</b> is already on the team
      </>
    );
  if (d.added)
    return (
      <>
        <b>{mail}</b> already had an account and was added as {roleWords(role).label}
      </>
    );
  if (d.alreadyInvited)
    return (
      <>
        <b>{mail}</b> already has an invitation waiting
      </>
    );
  return (
    <>
      Invitation emailed to <b>{mail}</b> as {roleWords(role).label}
    </>
  );
}

/** The card's head: its name, how many people (or that they could not be read), and Invite, the card's act. */
function teamHead(realTeam: TeamMember[] | null, inviting: boolean, open: () => void): ReactNode {
  return (
    <div className="fl-card-head">
      <h2 className="fl-card-title">Team</h2>
      <span className="fl-card-sub">
        {realTeam === null ? "Couldn't be loaded" : `${realTeam.length} ${realTeam.length === 1 ? "person" : "people"}`}
      </span>
      {/* Invite is the card's act, so a role that may not invite sees it gated, saying why when pressed, instead of a
          card with no act at all. */}
      {realTeam !== null && !inviting && (
        <button className="btn btn-sm" onClick={open} {...gate("team", "invite a teammate")}>
          <Icon name="plus" size={12} /> Invite
        </button>
      )}
    </div>
  );
}

/** The invitation being written: the address, the role it gives, Send and Cancel. */
function inviteRow(o: {
  email: string;
  setEmail: (v: string) => void;
  inviteRole: string;
  setInviteRole: (r: string) => void;
  teamBusy: boolean;
  invite: () => void;
  cancel: () => void;
}): ReactNode {
  return (
    <div className="set-invite" {...editorBox}>
      <input
        className="rec-input set-invite-email"
        type="email"
        placeholder="teammate@email.com"
        value={o.email}
        onChange={(e) => o.setEmail(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") o.invite();
        }}
        autoFocus={focusAsDrawn()}
      />
      <Segmented
        label="Invite as"
        value={o.inviteRole}
        onValueChange={o.setInviteRole}
        options={["operator", "viewer"].map((r) => ({ value: r, label: roleWords(r).label }))}
      />
      <button className="btn btn-primary btn-sm" onClick={o.invite} disabled={o.teamBusy}>
        {o.teamBusy ? "Sending…" : "Send invite"}
      </button>
      <button className="btn btn-ghost btn-icon btn-sm" onClick={o.cancel} aria-label="Cancel">
        <Icon name="x" size={12} />
      </button>
    </div>
  );
}

export const TeamSection = ({ flash }: { flash: Flash }) => {
  const read = useSurface("settings");
  // The role store's View-as moves what this card offers: it draws again when the store says so.
  const [, setTick] = useState(0);
  useEffect(() => onRolesChanged(() => setTick((n) => n + 1)), []);
  const [inviting, setInviting] = useState(false);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("operator");
  const [teamBusy, setTeamBusy] = useState(false);
  // Removing a teammate, or revoking an invitation, is armed first (the audit's D13: it fired straight from a menu
  // item). The row asks.
  const [armRemove, setArmRemove] = useState<string | null>(null);
  // Before the settings read there is nothing of this workspace's team to say; the route waits for it.
  if (!read || read.team === undefined) return null;
  const realTeam = read.team;
  const teamUnavailable = realTeam === null;
  const me = meNow()?.email || null;
  const people = realTeam ? peopleOf(realTeam, Array.isArray(read.invites) ? read.invites : [], me) : [];
  // The caller's REAL role decides what they may do; View-as previews a narrower one, and can only ever narrow. When
  // only the TEAM read failed, the settings read still gave the caller's real role.
  const serverRole = (read.settings && read.settings.role) || null;
  const myRole = realTeam ? viewAsRole() || serverRole || actingRole() : serverRole || actingRole();
  const canManage = canDo("team");
  const isOwner = serverRole === "owner";
  const previewing = !!viewAsRole();

  const invite = async () => {
    const mail = email.trim().toLowerCase();
    if (!EMAIL_SHAPE.test(mail)) {
      flash({ tone: "warn", msg: <>That doesn&apos;t look like an email — check the address</> });
      return;
    }
    if (people.some((m) => m.email.toLowerCase() === mail)) {
      flash({
        tone: "warn",
        msg: (
          <>
            <b>{mail}</b> is already on the team
          </>
        ),
      });
      return;
    }
    setTeamBusy(true);
    const r = await teamVerbs.invite(mail, inviteRole === "viewer" ? "viewer" : "operator");
    setTeamBusy(false);
    if (!r.ok) {
      flash({ tone: "danger", msg: <>{r.message}</> });
      return;
    }
    setEmail("");
    setInviting(false);
    flash({ msg: invitedWords(mail, inviteRole, r.data || {}) });
  };
  // The last-owner rule is enforced in the database and its message comes back from there.
  const changeRole = async (m: Person, role: string) => {
    if (m.role === role) return;
    setTeamBusy(true);
    const r = await teamVerbs.setRole(m.id, role);
    setTeamBusy(false);
    flash({
      tone: r.ok ? "ok" : "danger",
      msg: r.ok ? (
        <>
          <b>{m.name}</b> is now {roleWords(role).label}
        </>
      ) : (
        <>{r.message}</>
      ),
    });
  };
  const remove = async (m: Person) => {
    setTeamBusy(true);
    const r = await teamVerbs.remove(m.id);
    setTeamBusy(false);
    setArmRemove(null);
    const revoked = r.ok && !!(r.data as { revokedInvite?: boolean } | null)?.revokedInvite;
    flash({
      tone: r.ok ? "ok" : "danger",
      msg: r.ok ? (
        <>
          <b>{m.name}</b> {revoked ? "invitation revoked" : "removed from the team"}
        </>
      ) : (
        <>{r.message}</>
      ),
    });
  };
  const kit: RowKit = {
    canManage,
    armRemove,
    setArmRemove,
    teamBusy,
    remove: (m) => void remove(m),
    changeRole: (m, role) => void changeRole(m, role),
  };

  return (
    <section className="fl-card set-card">
      {teamHead(realTeam, inviting, () => setInviting(true))}

      {isOwner && viewAs(myRole, previewing)}

      {inviting &&
        canManage &&
        inviteRow({
          email,
          setEmail,
          inviteRole,
          setInviteRole,
          teamBusy,
          invite: () => void invite(),
          cancel: () => {
            setInviting(false);
            setEmail("");
          },
        })}

      {/* A team we could not read is not a team of four strangers. */}
      {teamUnavailable && (
        <FailedRead
          kind="card"
          what="your team"
          body="Everything else on this page is current — only the member list failed to load."
          surface="settings"
          testid="team-failed"
        />
      )}

      {!teamUnavailable && people.map((m) => personRow(m, kit))}

      {rolesLegend(people)}

      {!canManage && (
        <div className="set-team-gated" data-testid="team-gated">
          <Icon name="shield" size={11} /> {gateTitle("team", "change the team")}
        </div>
      )}
    </section>
  );
};
