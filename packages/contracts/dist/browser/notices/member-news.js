import { ROLE_WORDS } from "../shell/identity.js";
const TEAM_ROUTE = "admin/team";
export function memberJoinedBy(event) {
  return event.kind === "member.joined" && event.subject_type === "invitation" && event.subject_id ? event.subject_id : null;
}
export function memberJoinedNotice(m) {
  const role = ROLE_WORDS[m.role] ?? m.role;
  return {
    kind: "member_joined",
    route: TEAM_ROUTE,
    about: { type: "invitation", id: m.invitationId },
    subject: `${m.email} joined your team`.slice(0, 200),
    body: [
      `They accepted your invitation and joined as ${role}.`,
      "Their role can be changed, or the seat removed, under Settings > Team."
    ].join("\n"),
    redactedBody: "A teammate joined a workspace, and nobody could be told."
  };
}
export function memberLeftBy(event) {
  if (event.kind !== "member.left") return null;
  const data = event.data && typeof event.data === "object" && !Array.isArray(event.data) ? event.data : null;
  if (!data) return null;
  const { by, how, had_role: hadRole } = data;
  if (typeof by !== "string" || how !== "left" && how !== "account_deleted") return null;
  return { by, how, hadRole: typeof hadRole === "string" ? hadRole : null };
}
export function memberLeftNotice(m) {
  const who = m.email ?? "A teammate";
  const role = m.hadRole ? ROLE_WORDS[m.hadRole] ?? m.hadRole : null;
  return {
    kind: "member_left",
    route: TEAM_ROUTE,
    about: null,
    subject: (m.how === "account_deleted" ? `${who} deleted their account` : `${who} left your team`).slice(0, 200),
    body: [
      m.how === "account_deleted" ? "Their account is gone, and their seat with it." : `They left the workspace${role ? `, where they were ${role}` : ""}.`,
      "Settings > Team has who is left, and an invitation brings someone back."
    ].join("\n"),
    redactedBody: "A teammate left a workspace, and nobody could be told."
  };
}
