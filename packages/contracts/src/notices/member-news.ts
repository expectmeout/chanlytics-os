/**
 * A teammate who joined, told to the owner once on the bell (the wiring plan's task 2.4, S1-19): the pure half of core's
 * team_notice subscriber. An invitation accepted turns into a seat when the invited person next signs in, and nothing
 * reached the owner: no bell row, mail or push said they had joined, and the bell's "Invitation pending" row, derived
 * from the Team read, stayed until that read was repeated. The seat's `member.joined` event is written by the read that
 * took it (apps/dashboard server/workspace/team.ts acceptOpenInvites) and the notice follows that event, once.
 *
 * News, so a line on the bell with its door on Settings > Team; no mail, no phone. The invitation's email is who joined:
 * a name is what a person gave, and the invitation holds none.
 */
import { ROLE_WORDS } from "../shell/identity";
import type { JobNews } from "../today/notifications";

/** Where Settings > Team opens: the pane the invitation lived on, and where the new seat's role is changed. */
const TEAM_ROUTE = "admin/team";

/** The slice of a delivered event the reading needs. */
interface EventLike {
  kind: string;
  subject_type: string | null;
  subject_id: string | null;
}

/** The invitation a `member.joined` event is about (its subject), or null for every other event. */
export function memberJoinedBy(event: EventLike): string | null {
  return event.kind === "member.joined" && event.subject_type === "invitation" && event.subject_id
    ? event.subject_id
    : null;
}

/** Who joined, as the invitation they accepted says it. */
export interface MemberJoined {
  invitationId: string;
  email: string;
  role: string;
}

/** The owner's notice of a teammate who joined: who, as what, and the pane where the seat is looked after. */
export function memberJoinedNotice(m: MemberJoined): Omit<JobNews, "sourceEvent"> {
  const role = ROLE_WORDS[m.role] ?? m.role;
  return {
    kind: "member_joined",
    route: TEAM_ROUTE,
    about: { type: "invitation", id: m.invitationId },
    subject: `${m.email} joined your team`.slice(0, 200),
    body: [
      `They accepted your invitation and joined as ${role}.`,
      "Their role can be changed, or the seat removed, under Settings > Team.",
    ].join("\n"),
    redactedBody: "A teammate joined a workspace, and nobody could be told.",
  };
}
