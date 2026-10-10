/**
 * Settings › Team, read: the members and the invitations nobody has taken yet, each as its row says it. Pure, so the
 * card and its tests read one list.
 *
 * A member is the name they gave with the address under it, or the address alone (contracts memberWords: never the
 * address's local part dressed as a name), the day they joined, and whether they are emailed when the receptionist needs
 * a person (contracts memberGetsAlerts, the Notifications list). An invitation is its address, the role it gives, when it
 * went and how long it has, or that it expired. You come first; the rest stay in the roster's order.
 */
import { invitationWords, joinedWords, memberGetsAlerts, memberWords, personInitials } from "@chanlytics/contracts";
import type { TeamInvite, TeamMember } from "@/legacy-bridge/surfaces/settings";

/** One row of the card: a member, or an invitation. */
export interface TeamPerson {
  id: string;
  kind: "member" | "invite";
  /** The name they gave, or the address. */
  name: string;
  /** The address under the name, where a name was given. */
  sub: string | null;
  email: string;
  initials: string;
  role: string;
  isMe: boolean;
  /** A member's "Joined Oct 1"; an invitation's "invited Oct 7"; null where the read did not say. */
  when: string | null;
  /** An open invitation's "5 days left" or "expires today". */
  left: string | null;
  expired: boolean;
  /** Emailed when the receptionist needs a person. */
  alerts: boolean;
}

/** What the card reads the people from: the roster, its invitations, who is looking, the alert list and the clock. */
interface TeamRead {
  team: TeamMember[];
  invites: TeamInvite[];
  me: string | null;
  notifications: { escalation_emails?: readonly string[] | null } | null | undefined;
  tz: string;
  now: number;
}

const sameAddress = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/** The card's two lists: the members, you first, and the invitations waiting. */
export function teamPeopleOf(r: TeamRead): { members: TeamPerson[]; waiting: TeamPerson[] } {
  const members = r.team.map((m): TeamPerson => {
    const w = memberWords({ email: m.email, display_name: m.displayName });
    const email = m.email ?? "";
    return {
      id: m.membershipId,
      kind: "member",
      name: w.name,
      sub: w.sub,
      // An address the roster lacks draws as one that is empty: the face, the duplicate check and "You" read it alike.
      email,
      initials: personInitials(m.displayName, m.email),
      role: m.role,
      isMe: sameAddress(m.email, r.me),
      when: joinedWords(m.joinedAt, r.tz, r.now),
      left: null,
      expired: false,
      alerts: memberGetsAlerts(email, r.notifications),
    };
  });
  const waiting = r.invites.map((i): TeamPerson => {
    const state = invitationWords({ createdAt: i.created_at, expiresAt: i.expires_at }, r.tz, r.now);
    return {
      id: i.id,
      kind: "invite",
      name: i.email,
      sub: null,
      email: i.email,
      initials: personInitials("", i.email),
      role: i.role,
      isMe: false,
      when: state.sent,
      left: state.left,
      expired: state.expired,
      alerts: false,
    };
  });
  return { members: [...members.filter((m) => m.isMe), ...members.filter((m) => !m.isMe)], waiting };
}

/** The owners, as an Operator or a Viewer is told whom to ask. */
export const ownersOf = (members: readonly TeamPerson[]) => members.filter((m) => m.role === "owner");

/** Whether this member is the workspace's only owner: their role holds, and they may not leave. */
export const isLastOwner = (members: readonly TeamPerson[], m: TeamPerson) =>
  m.role === "owner" && ownersOf(members).length <= 1;

/** Whether an address is already on the card, as a member or an invitation. */
export const onTheCard = (people: readonly TeamPerson[], email: string) =>
  people.some((p) => sameAddress(p.email, email));
