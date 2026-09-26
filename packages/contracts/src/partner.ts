/**
 * A partner (decision 0011): a person who brings a business to Chanlytics, sets its workspace up as a member of
 * its team, and earns a share of what the workspace pays for as long as it pays.
 *
 * The pure half: the code's shape, the link, the cookie the link leaves, the row as the pane reads it, and every
 * sentence the pane says. No client, no network. The share is a number on the row (share_bp), never a constant
 * here: the words print what the row holds.
 */
import { z } from "zod";

/** The row, as `GET partner` answers it. */
export interface PartnerDto {
  id: string;
  code: string;
  status: "active" | "paused" | "closed";
  /** The share, in basis points: 2500 is 25%. */
  share_bp: number;
  terms_accepted_at: string | null;
  created_at: string;
}

export const PARTNER_STATUSES = ["active", "paused", "closed"] as const;
/** The share every new partner account starts with: partners.share_bp's default (00190). The offer says it before there is a row. */
export const PARTNER_SHARE_BP_DEFAULT = 2500;
/** What the sweep decides about a workspace a partner brought (0011, P3). Null until it has looked. */
export const PARTNER_STANDINGS = ["qualified", "review", "disqualified"] as const;

/* ------------------------------------------------------------------ the code */

export const PARTNER_CODE_MIN = 3;
export const PARTNER_CODE_MAX = 24;
/** Lowercase letters, digits and dashes, a letter or digit at each end: it is a path segment in a link. */
const CODE_SHAPE = /^[a-z0-9][a-z0-9-]{1,22}[a-z0-9]$/;
/** Codes that would read as Chanlytics itself, or as a page of the app. */
export const PARTNER_CODES_RESERVED = ["chanlytics", "admin", "support", "signup", "login", "partner", "partners"];

/** The code as it is stored: lowercased and trimmed. The database applies the same rule (partner_become). */
export function cleanPartnerCode(raw: unknown): { ok: true; code: string } | { ok: false; reason: string } {
  const code = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!code) return { ok: false, reason: "Choose a code for your link." };
  if (code.length < PARTNER_CODE_MIN || code.length > PARTNER_CODE_MAX)
    return { ok: false, reason: `A code is ${PARTNER_CODE_MIN} to ${PARTNER_CODE_MAX} characters.` };
  if (!CODE_SHAPE.test(code))
    return { ok: false, reason: "Letters, digits and dashes only, starting and ending with a letter or digit." };
  if (PARTNER_CODES_RESERVED.includes(code)) return { ok: false, reason: "That code is reserved. Try another." };
  return { ok: true, code };
}

/** Whether a string is a code at all: the link's route answers a bad one with no cookie and no error. */
export const isPartnerCode = (raw: unknown): raw is string => cleanPartnerCode(raw).ok;

/** POST partner: the code, and the terms said yes to. */
export const PartnerBecomeSchema = z
  .object({
    code: z.string().trim().min(1).max(64),
    terms: z.literal(true, { message: "The terms have to be accepted." }),
  })
  .strict();

/* ------------------------------------------------------------------ the link */

/** The link a partner hands out: `/p/<code>` on the app, which leaves the cookie and goes on to sign-up. */
export const partnerPathFor = (code: string): string => `/p/${encodeURIComponent(code)}`;
export const partnerLinkFor = (code: string, origin: string): string =>
  `${origin.replace(/\/+$/, "")}${partnerPathFor(code)}`;

/** The cookie the link leaves, read when a workspace is made. Thirty days, first touch wins, never cleared by hand. */
export const PARTNER_COOKIE = "chanlytics_partner";
export const PARTNER_COOKIE_DAYS = 30;

/** The code the cookie header carries, or null: a value that is not a code is no code. */
export function partnerCodeFromCookie(header: string | null | undefined): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== PARTNER_COOKIE) continue;
    let value = part.slice(eq + 1).trim();
    try {
      value = decodeURIComponent(value);
    } catch {
      return null;
    }
    const cleaned = cleanPartnerCode(value);
    return cleaned.ok ? cleaned.code : null;
  }
  return null;
}

/* ----------------------------------------------------------------- the words */

export const PARTNER_WORDS = {
  tab: "Partner",
  title: "Bring a business to Chanlytics",
  /** The offer, before the share, which is printed from the row (shareWords). */
  offer:
    "Send a business your link. When it signs up through the link and pays for its plan, you join its team as its partner: you set its receptionist up and keep it running, and Chanlytics pays you a share of what it pays for its plan, for as long as it pays.",
  codeLabel: "Your code",
  codeHint: `${PARTNER_CODE_MIN} to ${PARTNER_CODE_MAX} letters, digits or dashes. It is the end of your link, and it is yours for good.`,
  terms:
    "A share is paid on a workspace made through your link by someone other than you, thirty days after each payment of its plan, and never on a workspace of your own. Chanlytics can pause a partner account, and a workspace's owner can remove you from its team at any time.",
  termsAgree: "I agree to these terms.",
  become: "Become a partner",
  becoming: "Setting you up…",
  linkLabel: "Your link",
  copy: "Copy link",
  copied: "Copied",
  since: (at: string) =>
    `A partner since ${new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.`,
  paused: "Your partner account is paused. Write to us to have it looked at.",
  closed: "Your partner account is closed.",
  reading: "Reading your partner account…",
  failed: "your partner account",
  /** What the switcher and Team show for a workspace brought this way. */
  role: "Partner",
} as const;

/** The share, as a sentence: "25% of what it pays for its plan". */
export function shareWords(shareBp: number): string {
  const pct = shareBp / 100;
  const shown = Number.isInteger(pct) ? String(pct) : pct.toFixed(1).replace(/\.0$/, "");
  return `${shown}% of what it pays for its plan`;
}

/** How many workspaces came through the link, as a sentence. Zero is a real count and is said. */
export function broughtWords(count: number): string {
  if (count <= 0) return "No workspace has come through your link yet.";
  if (count === 1) return "1 workspace came through your link.";
  return `${count} workspaces came through your link.`;
}

export interface PartnerVM {
  code: string;
  link: string;
  status: PartnerDto["status"];
  share: string;
  since: string;
  brought: string;
  /** The line the pane leads with when the account is not active, else null. */
  standing: string | null;
}

/** The pane's sentences, from the row and the workspaces this person holds as partner (their memberships). */
export function partnerVM(dto: PartnerDto, origin: string, workspacesAsPartner: number): PartnerVM {
  return {
    code: dto.code,
    link: partnerLinkFor(dto.code, origin),
    status: dto.status,
    share: shareWords(dto.share_bp),
    since: PARTNER_WORDS.since(dto.created_at),
    brought: broughtWords(workspacesAsPartner),
    standing: dto.status === "paused" ? PARTNER_WORDS.paused : dto.status === "closed" ? PARTNER_WORDS.closed : null,
  };
}
