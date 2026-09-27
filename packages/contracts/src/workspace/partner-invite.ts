/**
 * An existing workspace brings in a partner (decision 0018).
 *
 * The pure half: what the owner types, what the owner's card and the partner's pane say, and the email the partner
 * is sent. The fourteen days and the rule on credit are the database's (00219); they are restated here only to be
 * said, never enforced.
 */
import { z } from "zod";
import { dayWords } from "./partner";

/** How long an owner's invitation to a partner is open (00219). */
export const PARTNER_INVITE_DAYS = 14;

/**
 * A partner's code as the owner may give it: the code itself, or the partner's whole link, whose last segment after
 * `/p/` is the code. Anything else is passed on as typed, for the database to say it names nobody.
 */
export function partnerCodeFrom(raw: string): string {
  const typed = raw.trim();
  const inLink = /\/p\/([^/?#\s]+)/i.exec(typed);
  return (inLink ? decodeURIComponent(inLink[1]) : typed).toLowerCase();
}

/** `POST team/partner`: the partner's code, or their link. */
export const PartnerInviteSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(1, "Enter your partner's code, or paste their link.")
      .max(200, "That is too long for a partner's code or link."),
  })
  .strict();

/** The workspace's partner and the invitation waiting, as `GET team/partner` carries them to its owner. */
export interface WorkspacePartnerDto {
  /** `seated`: whether they are still on the team; the credit stays when an owner removes them (0012). */
  partner: { code: string; origin: string; since: string; seated: boolean } | null;
  invitation: { code: string; sentAt: string; expiresAt: string; declinedAt: string | null } | null;
}

/** A workspace asking the partner to join it, as `GET partner/invitations` carries it. */
export interface PartnerInvitationDto {
  tenantId: string;
  workspace: string;
  sentAt: string;
  expiresAt: string;
}

export const PARTNER_INVITE_WORDS = {
  /** Settings › Team, the owner's card. */
  title: "Your partner",
  intro: `A partner is someone who sets up and runs your receptionist with you: they join your team with the partner role, and never touch billing, the team or exports. Ask one by their code, the end of their link. They have ${PARTNER_INVITE_DAYS} days to accept.`,
  codeLabel: "Their code or link",
  codePlaceholder: "their-code",
  invite: "Ask them",
  inviting: "Asking…",
  withdraw: "Take it back",
  withdrawing: "Taking it back…",
  askAgain: "Ask again",
  askSomeone: "Ask someone else",
  failed: "your partner",
  failedAnswer: "the invitation",
  /** Settings › Partner, the partner's pane. */
  invitationsTitle: "Workspaces asking for you",
  accept: "Join",
  accepting: "Joining…",
  decline: "Decline",
  declining: "Declining…",
} as const;

const ORIGIN_WORDS: Record<string, string> = {
  link: "came to you through their link",
  handover: "set this workspace up for you",
  invite: "joined at your invitation",
};

export type WorkspacePartnerState = "none" | "partner" | "waiting" | "declined" | "expired";

/** The owner's card, said: who the partner is, or where the invitation stands, and what may be pressed. */
export interface WorkspacePartnerVM {
  state: WorkspacePartnerState;
  sentence: string | null;
  /** The code field and "Ask": while the workspace has no partner and nobody is being asked. */
  canInvite: boolean;
  /** "Take it back": while an invitation waits for its answer. */
  canWithdraw: boolean;
}

export function workspacePartnerVM(dto: WorkspacePartnerDto, nowMs: number = Date.now()): WorkspacePartnerVM {
  const p = dto.partner;
  if (p)
    return {
      state: "partner",
      sentence: p.seated
        ? `${p.code} is your partner: they ${ORIGIN_WORDS[p.origin] ?? "joined"}, on ${dayWords(p.since)}. Remove them in the team above at any time.`
        : `${p.code} was your partner: they ${ORIGIN_WORDS[p.origin] ?? "joined"}, on ${dayWords(p.since)}, and are no longer on your team. A workspace has one partner.`,
      canInvite: false,
      canWithdraw: false,
    };
  const i = dto.invitation;
  if (!i) return { state: "none", sentence: null, canInvite: true, canWithdraw: false };
  if (i.declinedAt)
    return {
      state: "declined",
      sentence: `${i.code} declined on ${dayWords(i.declinedAt)}.`,
      canInvite: true,
      canWithdraw: false,
    };
  if (Date.parse(i.expiresAt) <= nowMs)
    return {
      state: "expired",
      sentence: `Your invitation to ${i.code} expired on ${dayWords(i.expiresAt)}.`,
      canInvite: true,
      canWithdraw: false,
    };
  return {
    state: "waiting",
    sentence: `Waiting for ${i.code} to accept: asked on ${dayWords(i.sentAt)}, open until ${dayWords(i.expiresAt)}.`,
    canInvite: false,
    canWithdraw: true,
  };
}

/** A workspace asking the partner, as its row on their pane says it. */
export const partnerInvitationWords = (i: PartnerInvitationDto): string =>
  `${i.workspace.trim() || "A workspace"} asks you to be its partner. Open until ${dayWords(i.expiresAt)}.`;

/** What joining did, in the partner's flash: whether its plan earns them a share. */
export function partnerJoinedWords(workspace: string, earns: boolean): string {
  const name = workspace.trim() || "The workspace";
  return earns
    ? `You're ${name}'s partner. When it pays for its plan, your share is written as for a workspace you brought.`
    : `You're ${name}'s partner. It was already paying when you joined, so it earns you no share; the owner's team is yours to help run.`;
}

/**
 * The email a partner is sent when a workspace asks for them: which workspace, what joining means, and where to
 * answer. Plain text; every fact is the invitation's own.
 */
export function partnerInviteEmail(i: { workspace: string; expiresAt: string; signInUrl: string }): {
  subject: string;
  body: string;
} {
  const workspace = i.workspace.trim() || "A workspace";
  return {
    subject: `${workspace} asks you to be its partner on Chanlytics`,
    body: [
      `${workspace} asked you to join its team as its partner: you'd set up and run its receptionist with its owner, and never touch its billing, its team or its exports.`,
      "",
      "A workspace that has not paid for a plan yet earns you your share once it does, as one you brought. One that was already paying earns you none.",
      "",
      `Sign in and open Settings › Partner to join or decline: ${i.signInUrl}`,
      "",
      `Open until ${dayWords(i.expiresAt)}. If you weren't expecting this, you can ignore it: nothing changes unless you join.`,
    ].join("\n"),
  };
}
