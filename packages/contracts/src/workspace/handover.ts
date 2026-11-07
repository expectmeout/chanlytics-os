/**
 * A partner sets up a workspace and hands it to its owner (decision 0016).
 *
 * The pure half: what the partner sends, what the addressee is asked, and every sentence the partner's form, the
 * waiting row and the accept screen say. The fourteen days and the ten waiting are the database's (00214); they are
 * restated here only to be said, never enforced.
 */
import { partnerDayWords } from "./partner/earnings";

/** How long a handover is open, and how many workspaces a partner may have waiting for an owner (00214). */
export const HANDOVER_DAYS = 14;
export const HANDOVER_WAITING_MAX = 10;

/** A handover waiting for the signed-in person, as `GET workspaces` carries it on the person. */
export interface OpenHandoverDto {
  tenantId: string;
  workspace: string;
  partnerCode: string;
  expiresAt: string;
}

/** A workspace the partner set up, and where its handover stands, as `GET partner/workspaces` carries it. */
export interface PartnerHandoverDto {
  tenantId: string;
  /** The workspace's name, while the partner can still read it (they sit on its team); null once they cannot. */
  name: string | null;
  email: string;
  sentAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  declinedAt: string | null;
}

export const HANDOVER_WORDS = {
  start: "Set up a workspace for a business",
  intro: `Build it and show it working, then hand it to its owner: they accept it, choose a plan and pay for it, and you stay on the team as their partner. The invitation is open ${HANDOVER_DAYS} days and you can send it again. If nobody accepts it, what you set up goes with the workspace.`,
  nameLabel: "The business's name",
  emailLabel: "Its owner's email",
  emailHint: "They'll be asked to accept it when they sign in with this address.",
  make: "Set it up",
  making: "Setting it up…",
  cancel: "Cancel",
  resend: "Send again",
  resendTo: "Send to",
  resending: "Sending…",
  failed: "the workspace",
  failedResend: "the invitation",
  waiting: "Handed to their owners",
  sentAgain: "Sent again.",
  notSent: "The workspace is set up, but its invitation did not go. Send it again from its row below.",
  unnamed: "A workspace you set up",
  /** The accept screen. */
  title: (workspace: string) => `${workspace} is ready for you`,
  body: (partnerCode: string, workspace: string) =>
    `${partnerCode} set ${workspace} up for you. Accept to become its owner: you'll choose a plan and pay for it, and ${partnerCode} stays on your team as your partner, whom you can remove in Team at any time.`,
  accept: "Accept and open it",
  accepting: "Opening…",
  decline: "Decline",
  declining: "Declining…",
  later: "Not now",
  failedAnswer: "your answer",
} as const;

/** An address as the waiting row shows it: the first letter and the domain, "a…@example.com". */
export function maskedEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 1) return email;
  return `${email[0]}…${email.slice(at)}`;
}

/** Until when the accept screen says the invitation is open. */
export const handoverUntilWords = (expiresAt: string): string => `Open until ${partnerDayWords(expiresAt)}.`;

export type HandoverState = "waiting" | "expired" | "declined" | "accepted";

/** A workspace the partner set up, as its row on the pane says it. */
export interface PartnerHandoverVM {
  tenantId: string;
  name: string;
  /** The address it was last sent to, whole: the partner typed it, and Send again starts from it. */
  email: string;
  state: HandoverState;
  sentence: string;
  /** Whether "Send again" is offered: until an owner accepts it. */
  canResend: boolean;
}

export function partnerHandoverVM(partnerHandover: PartnerHandoverDto, nowMs: number = Date.now()): PartnerHandoverVM {
  const to = maskedEmail(partnerHandover.email);
  const of = (state: HandoverState, sentence: string): PartnerHandoverVM => ({
    tenantId: partnerHandover.tenantId,
    name: partnerHandover.name && partnerHandover.name.trim() ? partnerHandover.name.trim() : HANDOVER_WORDS.unnamed,
    email: partnerHandover.email,
    state,
    sentence,
    canResend: state !== "accepted",
  });
  if (partnerHandover.acceptedAt)
    return of("accepted", `Its owner accepted it on ${partnerDayWords(partnerHandover.acceptedAt)}.`);
  if (partnerHandover.declinedAt)
    return of(
      "declined",
      `Declined by ${to} on ${partnerDayWords(partnerHandover.declinedAt)}. Send it again, or to someone else.`,
    );
  if (Date.parse(partnerHandover.expiresAt) <= nowMs)
    return of(
      "expired",
      `The invitation to ${to} expired on ${partnerDayWords(partnerHandover.expiresAt)}. Send it again.`,
    );
  return of(
    "waiting",
    `Waiting for its owner: sent to ${to}, open until ${partnerDayWords(partnerHandover.expiresAt)}.`,
  );
}

/** How many of the partner's workspaces wait for an owner, and whether another may be set up. */
export function handoverRoom(rows: readonly PartnerHandoverDto[]): {
  waiting: number;
  full: boolean;
  words: string | null;
} {
  const waiting = rows.filter((r) => !r.acceptedAt).length;
  const full = waiting >= HANDOVER_WAITING_MAX;
  return {
    waiting,
    full,
    words: full
      ? `${HANDOVER_WAITING_MAX} workspaces are waiting for their owners. When one is accepted, set up the next.`
      : null,
  };
}

/**
 * The invitation an existing account is sent (a new address gets the platform's own invitation, as a teammate's does):
 * who set up what, what accepting means, and where to sign in. Plain text; every fact is the handover's own.
 */
export function handoverInviteEmail(input: {
  partnerCode: string;
  workspace: string;
  expiresAt: string;
  signInUrl: string;
}): { subject: string; body: string } {
  const workspace = input.workspace.trim() || "A workspace";
  return {
    subject: `${input.partnerCode} set up ${workspace} on Chanlytics for you`,
    body: [
      HANDOVER_WORDS.body(input.partnerCode, workspace),
      "",
      `Sign in to accept it or decline it: ${input.signInUrl}`,
      "",
      `${handoverUntilWords(input.expiresAt)} If you weren't expecting this, you can ignore it: nothing is yours, and nothing is charged, unless you accept.`,
    ].join("\n"),
  };
}
