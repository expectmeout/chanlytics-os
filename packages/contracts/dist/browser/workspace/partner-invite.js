import { dayWords } from "./partner.js";
export const PARTNER_INVITE_DAYS = 14;
const CODE_IN_LINK = /\/p\/([a-z0-9-]+)/i;
const AROUND_A_CODE = /^[^a-z0-9]+|[^a-z0-9]+$/gi;
export function partnerCodeFrom(raw) {
  const typed = raw.trim();
  const inLink = CODE_IN_LINK.exec(typed);
  return (inLink ? inLink[1] : typed).replace(AROUND_A_CODE, "").toLowerCase();
}
export const PARTNER_INVITE_WORDS = {
  /** Settings › Team, the owner's card. */
  title: "Your partner",
  intro: `Someone who sets up and runs your receptionist with you, never billing or the team. Ask one by their code; they have ${PARTNER_INVITE_DAYS} days to accept.`,
  codeLabel: "Their code or link",
  codePlaceholder: "their-code",
  invite: "Ask them",
  inviting: "Asking\u2026",
  withdraw: "Take it back",
  withdrawing: "Taking it back\u2026",
  /** The ask was kept but its email did not go: where the partner sees it, and how to send it again. */
  notSent: "Asked, but their email didn't go. It is on their Partner page when they sign in; to send the email again, take it back and ask again.",
  failed: "your partner",
  failedAnswer: "the invitation",
  /** Settings › Partner, the partner's pane. */
  invitationsTitle: "Workspaces asking for you",
  failedInvitations: "the workspaces asking for you",
  accept: "Join",
  accepting: "Joining\u2026",
  decline: "Decline",
  declining: "Declining\u2026"
};
const ORIGIN_WORDS = {
  link: "came to you through their link",
  handover: "set this workspace up for you",
  invite: "joined at your invitation"
};
export function workspacePartnerVM(dto, nowMs = Date.now()) {
  const p = dto.partner;
  if (p)
    return {
      state: "partner",
      sentence: p.seated ? `${p.code} is your partner: they ${ORIGIN_WORDS[p.origin] ?? "joined"}, on ${dayWords(p.since)}. Remove them in the team above at any time.` : `${p.code} was your partner: they ${ORIGIN_WORDS[p.origin] ?? "joined"}, on ${dayWords(p.since)}, and are no longer on your team. A workspace has one partner.`,
      canInvite: false,
      canWithdraw: false,
      seated: p.seated
    };
  const i = dto.invitation;
  if (!i) return { state: "none", sentence: null, canInvite: true, canWithdraw: false, seated: false };
  if (i.declinedAt)
    return {
      state: "declined",
      sentence: `${i.code} declined on ${dayWords(i.declinedAt)}.`,
      canInvite: true,
      canWithdraw: false,
      seated: false
    };
  if (Date.parse(i.expiresAt) <= nowMs)
    return {
      state: "expired",
      sentence: `Your invitation to ${i.code} expired on ${dayWords(i.expiresAt)}.`,
      canInvite: true,
      canWithdraw: false,
      seated: false
    };
  return {
    state: "waiting",
    sentence: `Waiting for ${i.code} to accept: asked on ${dayWords(i.sentAt)}, open until ${dayWords(i.expiresAt)}.`,
    canInvite: false,
    canWithdraw: true,
    seated: false
  };
}
export const partnerInvitationWords = (i) => `${i.workspace.trim() || "A workspace"} asks you to be its partner. Open until ${dayWords(i.expiresAt)}.`;
export function partnerJoinedWords(workspace, earns) {
  const name = workspace.trim() || "The workspace";
  return earns ? `You're ${name}'s partner. When it pays for its plan, your share is written as for a workspace you brought.` : `You're ${name}'s partner. It was already paying when you joined, so it earns you no share; the owner's team is yours to help run.`;
}
export function partnerInviteEmail(i) {
  const workspace = i.workspace.trim() || "A workspace";
  return {
    subject: `${workspace} asks you to be its partner on Chanlytics`,
    body: [
      `${workspace} asked you to join its team as its partner: you'd set up and run its receptionist with its owner, and never touch its billing or its team.`,
      "",
      "A workspace that has not paid for a plan yet earns you your share once it does, as one you brought. One that was already paying earns you none.",
      "",
      `Sign in and open Settings \u203A Partner to join or decline: ${i.signInUrl}`,
      "",
      `Open until ${dayWords(i.expiresAt)}. If you weren't expecting this, you can ignore it: nothing changes unless you join.`
    ].join("\n")
  };
}
