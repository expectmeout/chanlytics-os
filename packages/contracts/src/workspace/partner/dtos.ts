/** Partner: dtos. */

/** The row, as `GET partner` answers it. */
export interface PartnerDto {
  id: string;
  code: string;
  status: "active" | "paused" | "closed";
  /** The share, in basis points: 2500 is 25%. */
  share_bp: number;
  terms_accepted_at: string | null;
  created_at: string;
  /** How many workspaces came through the link, on a team or not (GET partner); absent from an older server. */
  brought?: number | null;
  /** Whether the daily letter is on (0014); null on a database without it, absent from an older server. */
  letters?: boolean | null;
}

export const PARTNER_STATUSES = ["active", "paused", "closed"] as const;

/** The share every new partner account starts with: partners.share_bp's default (00202). The offer says it before there is a row. */
export const PARTNER_SHARE_BP_DEFAULT = 2500;

/** What the sweep decides about a workspace a partner brought (0012, P3). Null until it has looked. */
export const PARTNER_STANDINGS = ["qualified", "review", "disqualified"] as const;

/** A movement on the ledger (00203): a share of a paid plan invoice, or what a refund, a dispute or a won dispute did to it. */
export const PARTNER_EARNING_KINDS = ["share", "refund", "dispute", "dispute_won"] as const;

/** Where a movement stands: held thirty days, payable once the workspace qualifies, paid (P5), void if disqualified. */
export const PARTNER_EARNING_STATES = ["held", "payable", "paid", "void"] as const;

/** What can happen to a share after it is written: a refund, a dispute, a dispute won (00203; waiting, 00207). */
export const PARTNER_REVERSAL_KINDS = ["refund", "dispute", "dispute_won"] as const;

/** Days a share is held before it may be paid: what 00203 adds to the invoice's paid_at. */
export const PARTNER_HOLD_DAYS = 30;

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
    "Send a business your link. When it signs up through the link and pays for its plan, you join its team as its partner: you set its receptionist up and keep it running, and Chanlytics pays you a share of what it pays for its plan, for as long as it pays. A business already on Chanlytics can ask you in by your code: if it has not paid for a plan yet, the same share is yours once it does.",
  codeLabel: "Your code",
  codeHint: `${PARTNER_CODE_MIN} to ${PARTNER_CODE_MAX} letters, digits or dashes. It ends your link, for good.`,
  terms:
    "A share is paid on a workspace someone other than you brought you onto: made through your link, set up by you and handed to its owner, or one whose owner asked you in before it had paid for a plan. It is paid thirty days after each payment of its plan, and never on a workspace of your own. Chanlytics can pause a partner account, and a workspace's owner can remove you from its team at any time.",
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
  earnings: "Earnings",
  workspaces: "Your workspaces",
  open: "Open",
  readingWorkspaces: "Reading your workspaces…",
  failedWorkspaces: "your workspaces",
  noneYet: "Nothing earned yet. A share is written when a workspace you brought pays for its plan.",
  /**
   * The create screen's question when a partner's link brought the person (0012): nobody joins a team without the
   * owner's yes. Their price does not change; the share is Chanlytics'.
   */
  joinAsk: (code: string) =>
    `Add ${code}, who sent you here, to your team as your partner? They set your receptionist up for you, and Chanlytics pays them a share of your plan: your price is the same. You can remove them in Team at any time.`,
  /** What a partner may not do for a business until it pays: the spend doors wait on its plan (maySpend). */
  spend:
    "Anything that spends a business's money, a phone number or a lead search, waits until its owner pays for a plan.",
  /** The pane's switch for the daily letter (0014). */
  letters: "Email me when something changes in my earnings or my workspaces' standing, at most once a day.",
  lettersFailed: "your email setting",
} as const;
