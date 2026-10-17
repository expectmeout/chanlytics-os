import { dayWords } from "./partner.js";
export const HANDOVER_DAYS = 14;
export const HANDOVER_WAITING_MAX = 10;
export const HANDOVER_WORDS = {
  start: "Set up a workspace for a business",
  intro: `Build it and show it working, then hand it to its owner: they accept it, choose a plan and pay for it, and you stay on the team as their partner. The invitation is open ${HANDOVER_DAYS} days and you can send it again. If nobody accepts it, what you set up goes with the workspace.`,
  nameLabel: "The business's name",
  emailLabel: "Its owner's email",
  emailHint: "They'll be asked to accept it when they sign in with this address.",
  make: "Set it up",
  making: "Setting it up\u2026",
  cancel: "Cancel",
  resend: "Send again",
  resendTo: "Send to",
  resending: "Sending\u2026",
  failed: "the workspace",
  failedResend: "the invitation",
  waiting: "Handed to their owners",
  sentAgain: "Sent again.",
  notSent: "The workspace is set up, but its invitation did not go. Send it again from its row below.",
  unnamed: "A workspace you set up",
  /** The accept screen. */
  title: (workspace) => `${workspace} is ready for you`,
  body: (partnerCode, workspace) => `${partnerCode} set ${workspace} up for you. Accept to become its owner: you'll choose a plan and pay for it, and ${partnerCode} stays on your team as your partner, whom you can remove in Team at any time.`,
  accept: "Accept and open it",
  accepting: "Opening\u2026",
  decline: "Decline",
  declining: "Declining\u2026",
  later: "Not now",
  failedAnswer: "your answer"
};
export function maskedEmail(email) {
  const at = email.lastIndexOf("@");
  if (at < 1) return email;
  return `${email[0]}\u2026${email.slice(at)}`;
}
export const handoverUntilWords = (expiresAt) => `Open until ${dayWords(expiresAt)}.`;
export function partnerHandoverVM(h, nowMs = Date.now()) {
  const to = maskedEmail(h.email);
  const of = (state, sentence) => ({
    tenantId: h.tenantId,
    name: h.name && h.name.trim() ? h.name.trim() : HANDOVER_WORDS.unnamed,
    email: h.email,
    state,
    sentence,
    canResend: state !== "accepted"
  });
  if (h.acceptedAt) return of("accepted", `Its owner accepted it on ${dayWords(h.acceptedAt)}.`);
  if (h.declinedAt)
    return of("declined", `Declined by ${to} on ${dayWords(h.declinedAt)}. Send it again, or to someone else.`);
  if (Date.parse(h.expiresAt) <= nowMs)
    return of("expired", `The invitation to ${to} expired on ${dayWords(h.expiresAt)}. Send it again.`);
  return of("waiting", `Waiting for its owner: sent to ${to}, open until ${dayWords(h.expiresAt)}.`);
}
export function handoverRoom(rows) {
  const waiting = rows.filter((r) => !r.acceptedAt).length;
  const full = waiting >= HANDOVER_WAITING_MAX;
  return {
    waiting,
    full,
    words: full ? `${HANDOVER_WAITING_MAX} workspaces are waiting for their owners. When one is accepted, set up the next.` : null
  };
}
export function handoverInviteEmail(h) {
  const workspace = h.workspace.trim() || "A workspace";
  return {
    subject: `${h.partnerCode} set up ${workspace} on Chanlytics for you`,
    body: [
      HANDOVER_WORDS.body(h.partnerCode, workspace),
      "",
      `Sign in to accept it or decline it: ${h.signInUrl}`,
      "",
      `${handoverUntilWords(h.expiresAt)} If you weren't expecting this, you can ignore it: nothing is yours, and nothing is charged, unless you accept.`
    ].join("\n")
  };
}
