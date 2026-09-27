/**
 * A partner (decision 0012): a person who brings a business to Chanlytics, sets its workspace up as a member of
 * its team, and earns a share of what the workspace pays for as long as it pays.
 *
 * The pure half: the code's shape, the link, the cookie the link leaves, the row as the pane reads it, and every
 * sentence the pane says. No client, no network. The share is a number on the row (share_bp), never a constant
 * here: the words print what the row holds.
 */
import { z } from "zod";
import { moneyWords } from "./billing";
import { PLATFORM_VERDICTS, platformRows, type PlatformTenantDto, type PlatformVerdict } from "./platform";
import type { Tone } from "./tone";

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
/** The share every new partner account starts with: partners.share_bp's default (00202). The offer says it before there is a row. */
export const PARTNER_SHARE_BP_DEFAULT = 2500;
/** What the sweep decides about a workspace a partner brought (0012, P3). Null until it has looked. */
export const PARTNER_STANDINGS = ["qualified", "review", "disqualified"] as const;
/** A movement on the ledger (00203): a share of a paid plan invoice, or what a refund, a dispute or a won dispute did to it. */
export const PARTNER_EARNING_KINDS = ["share", "refund", "dispute", "dispute_won"] as const;
/** Where a movement stands: held thirty days, payable once the workspace qualifies, paid (P5), void if disqualified. */
export const PARTNER_EARNING_STATES = ["held", "payable", "paid", "void"] as const;
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
  earnings: "Earnings",
  workspaces: "Your workspaces",
  open: "Open",
  readingWorkspaces: "Reading your workspaces…",
  failedWorkspaces: "your workspaces",
  noneYet: "Nothing earned yet. A share is written when a workspace that came through your link pays for its plan.",
  /** What a partner may not do for a business until it pays: the spend doors wait on its plan (maySpend). */
  spend:
    "Anything that spends a business's money, a phone number or a lead search, waits until its owner pays for a plan.",
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

/** One line of partner_balance() (00203): a currency's total in one state, and when the next held one is due. */
export interface PartnerBalanceRow {
  currency: string;
  state: string;
  earned_cents: number;
  next_payable_at: string | null;
}

/** The earnings as the pane says them: three lines, each a real sum from the ledger, a zero said as a zero. */
export interface PartnerEarningsVM {
  held: string;
  payable: string;
  paid: string;
  /** Nothing on the ledger yet: said once, instead of three zeros. */
  none: boolean;
}

const dayWords = (at: string): string =>
  new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** A currency's sums, joined when a partner has more than one: "$100.00 and €20.00". */
function sumWords(rows: readonly PartnerBalanceRow[], state: string): { words: string; cents: number } {
  const of = rows.filter((r) => r.state === state && r.earned_cents !== 0);
  if (!of.length) return { words: moneyWords(0, rows[0]?.currency ?? "usd"), cents: 0 };
  return {
    words: of.map((r) => moneyWords(r.earned_cents, r.currency)).join(" and "),
    cents: of.reduce((n, r) => n + r.earned_cents, 0),
  };
}

export function partnerEarningsWords(rows: readonly PartnerBalanceRow[] | null | undefined): PartnerEarningsVM {
  const list = rows ?? [];
  const held = sumWords(list, "held");
  const payable = sumWords(list, "payable");
  const paid = sumWords(list, "paid");
  const next = list
    .filter((r) => r.state === "held" && r.next_payable_at)
    .map((r) => r.next_payable_at as string)
    .sort()[0];
  return {
    none: list.every((r) => r.earned_cents === 0),
    held:
      held.cents === 0
        ? `Nothing held. A share is held ${PARTNER_HOLD_DAYS} days after each payment.`
        : `${held.words} held${next ? `, the first of it payable from ${dayWords(next)}` : ""}.`,
    payable:
      payable.cents < 0
        ? `${payable.words} to come off your next payout, for refunds and disputes after you were paid.`
        : `${payable.words} payable.`,
    paid: `${paid.words} paid to date.`,
  };
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
  earnings: PartnerEarningsVM;
}

/** The pane's sentences, from the row, the ledger's sums, and the workspaces this person holds as partner. */
export function partnerVM(
  dto: PartnerDto,
  origin: string,
  workspacesAsPartner: number,
  balance: readonly PartnerBalanceRow[] = [],
): PartnerVM {
  return {
    code: dto.code,
    link: partnerLinkFor(dto.code, origin),
    status: dto.status,
    share: shareWords(dto.share_bp),
    since: PARTNER_WORDS.since(dto.created_at),
    brought: broughtWords(workspacesAsPartner),
    standing: dto.status === "paused" ? PARTNER_WORDS.paused : dto.status === "closed" ? PARTNER_WORDS.closed : null,
    earnings: partnerEarningsWords(balance),
  };
}

/* ---------------------------------------------------------- the workspaces a partner brought (P4) */

/** One line of partner_workspace_money() (00204): a workspace the caller brought, its standing, and its money. */
export interface PartnerWorkspaceMoneyDto {
  tenant_id: string;
  name: string;
  on_team: boolean;
  standing: string | null;
  currency: string;
  held_cents: number;
  payable_cents: number;
  paid_cents: number;
  month_cents: number;
}

/** What the partner reads about a workspace's standing: nothing while it qualifies, since that is the rule. */
export const PARTNER_STANDING_WORDS: Record<string, string | null> = {
  pending: "Its share is judged once it has paid.",
  qualified: null,
  review: "Under review: its card or its listing matches one of yours. We'll write to you.",
  disqualified: "Not eligible for a share.",
};

export interface PartnerWorkspaceVM {
  tenantId: string;
  slug: string | null;
  name: string;
  /** The back office's verdict for it, in its words and tone; null when the partner is no longer on its team. */
  verdict: PlatformVerdict | null;
  label: string;
  tone: Tone;
  /** What to do about it, the back office's own sentence, or why the partner cannot see it any more. */
  sentence: string;
  /** Paying · answering · texting · heard: the back office's four facts, joined; null off the team. */
  facts: string | null;
  standing: string | null;
  /** What it earned the partner: this month's payments, and to date. */
  money: string;
  onTeam: boolean;
}

export interface PartnerWorkspacesVM {
  rows: PartnerWorkspaceVM[];
  /** "3 workspaces · 2 live · 1 needs you", counted, never estimated. */
  summary: string;
}

const NEEDS_THE_PARTNER: readonly PlatformVerdict[] = ["broken", "stalled", "waiting_owner", "billing", "rehearsal"];

function moneyLine(lines: readonly PartnerWorkspaceMoneyDto[]): string {
  if (!lines.length) return "Nothing earned from it yet.";
  const say = (pick: (l: PartnerWorkspaceMoneyDto) => number): string =>
    lines.map((l) => moneyWords(pick(l), l.currency)).join(" and ");
  const toDate = lines.reduce((n, l) => n + l.held_cents + l.payable_cents + l.paid_cents, 0);
  const month = lines.reduce((n, l) => n + l.month_cents, 0);
  if (toDate === 0 && month === 0) return "Nothing earned from it yet.";
  return `${say((l) => l.month_cents)} from this month's payments · ${say((l) => l.held_cents + l.payable_cents + l.paid_cents)} to date`;
}

/**
 * The partner's table: each workspace they brought, judged by the back office's own rule (platformRows) where they
 * still sit on its team, with its standing and what it earned them. A workspace whose owner removed them keeps its
 * money line and says why it shows nothing else. The back office's order: what needs someone first.
 */
export function partnerWorkspacesVM(
  overview: readonly PlatformTenantDto[],
  money: readonly PartnerWorkspaceMoneyDto[],
  nowMs = Date.now(),
): PartnerWorkspacesVM {
  const judged = platformRows(overview, nowMs);
  const moneyOf = (id: string) => money.filter((m) => m.tenant_id === id);
  const standingOf = (id: string): string | null => {
    const s = moneyOf(id)[0]?.standing ?? "pending";
    return PARTNER_STANDING_WORDS[s] ?? null;
  };
  const rows: PartnerWorkspaceVM[] = judged.map((r) => {
    const v = PLATFORM_VERDICTS[r.verdict];
    return {
      tenantId: r.tenantId,
      slug: r.slug,
      name: r.name,
      verdict: r.verdict,
      label: v.label,
      tone: v.tone,
      sentence: r.sentence,
      facts: [r.facts.paying, r.facts.answering, `texting ${r.facts.texting}`, `heard ${r.facts.heard}`].join(" · "),
      standing: standingOf(r.tenantId),
      money: moneyLine(moneyOf(r.tenantId)),
      onTeam: true,
    };
  });
  const seen = new Set(rows.map((r) => r.tenantId));
  const off = [...new Map(money.filter((m) => !seen.has(m.tenant_id)).map((m) => [m.tenant_id, m])).values()];
  for (const m of off.sort((a, b) => a.name.localeCompare(b.name))) {
    rows.push({
      tenantId: m.tenant_id,
      slug: null,
      name: m.name,
      verdict: null,
      label: "Off the team",
      tone: "plain",
      sentence: m.on_team
        ? "Its details could not be read just now."
        : "Its owner took you off its team. Your share goes on while it pays; its details are theirs.",
      facts: null,
      standing: standingOf(m.tenant_id),
      money: moneyLine(moneyOf(m.tenant_id)),
      onTeam: m.on_team,
    });
  }
  const total = rows.length;
  const live = rows.filter((r) => r.verdict === "live").length;
  const needs = rows.filter((r) => r.verdict !== null && NEEDS_THE_PARTNER.includes(r.verdict)).length;
  const parts = [`${total} workspace${total === 1 ? "" : "s"}`, `${live} live`];
  if (needs) parts.push(`${needs} need${needs === 1 ? "s" : ""} you`);
  return { rows, summary: total ? parts.join(" · ") : "No workspace has come through your link yet." };
}

/* ---------------------------------------------------------------------------------- the back office (0012, P5) */

/** One line of platform_partner_balances() (00205): a partner, and one currency of what they earned. */
export interface PlatformPartnerBalanceDto {
  partner_id: string;
  code: string;
  email: string | null;
  status: string;
  share_bp: number;
  joined_at: string;
  workspaces: number;
  under_review: number;
  /** Null for a partner with nothing on the ledger yet. */
  currency: string | null;
  held_cents: number;
  payable_cents: number;
  paid_cents: number;
  last_paid_at: string | null;
}

/** One line of platform_partner_workspaces() (00205): who brought a workspace, and its standing. */
export interface PlatformPartnerWorkspaceDto {
  tenant_id: string;
  partner_id: string;
  code: string;
  attributed_at: string;
  standing: string | null;
  standing_why: string | null;
  standing_at: string | null;
  /** Who decided it: the sweep's checks, or a person in the back office. Null until it is judged. */
  decided_by: string | null;
  checks: Record<string, unknown> | null;
}

/** A person's three decisions, as the back office's buttons say them. */
export const PARTNER_STANDING_VERBS: Record<(typeof PARTNER_STANDINGS)[number], string> = {
  qualified: "Qualify",
  review: "Hold for review",
  disqualified: "Disqualify",
};

/** What a person may decide from each standing: never the one it already has. */
export function partnerStandingChoices(standing: string | null): (typeof PARTNER_STANDINGS)[number][] {
  return PARTNER_STANDINGS.filter((s) => s !== standing);
}

export interface PlatformPartnerRowVM {
  partnerId: string;
  code: string;
  /** "ada@example.com · 3 workspaces · 1 under review · 25% · paused" */
  who: string;
  /** "$125.00 payable · $50.00 held · $1,200.00 paid to date", a zero said as a zero. */
  money: string;
  currency: string | null;
  payableCents: number;
  /** A payout can be recorded: the net payable in this currency is above zero. */
  canPay: boolean;
  /** The button's words, with the amount: "Mark $125.00 as paid". */
  payLabel: string;
  tone: Tone;
  status: string;
  /** The first line of this partner: where the partner's own actions (pause, close, restore) are drawn, once. */
  first: boolean;
  statusChoices: { status: (typeof PARTNER_STATUSES)[number]; label: string }[];
}

/** A platform admin's three decisions about a partner, as the back office's buttons say them. */
export const PARTNER_STATUS_VERBS: Record<(typeof PARTNER_STATUSES)[number], string> = {
  active: "Restore",
  paused: "Pause",
  closed: "Close",
};

/** What may be decided about a partner from their status: never the one they have. */
export function partnerStatusChoices(status: string): (typeof PARTNER_STATUSES)[number][] {
  return PARTNER_STATUSES.filter((s) => s !== status);
}

/** What partner_status_set answered, as the toast says it. */
export function partnerStatusOutcomeWords(code: string, r: { status: string; seats: number }): string {
  const seats = `${r.seats} ${r.seats === 1 ? "workspace" : "workspaces"}`;
  if (r.status === "active")
    return r.seats
      ? `${code} is restored, and a partner again on ${seats}.`
      : `${code} is restored. No seat was waiting to be given back.`;
  const what = r.status === "closed" ? "closed" : "paused";
  return r.seats
    ? `${code} is ${what}: a viewer on ${seats} now, and what they held there is released.`
    : `${code} is ${what}. They held no partner seat to take.`;
}

/** The back office's partner list: one row per partner and currency, what is owed first. */
export function platformPartnerRows(rows: readonly PlatformPartnerBalanceDto[]): PlatformPartnerRowVM[] {
  const seen = new Set<string>();
  return rows.map((r) => {
    const first = !seen.has(r.partner_id);
    seen.add(r.partner_id);
    const cur = r.currency ?? "usd";
    const pct = r.share_bp / 100;
    const who = [
      r.email ?? "no address on file",
      `${r.workspaces} workspace${r.workspaces === 1 ? "" : "s"}`,
      r.under_review ? `${r.under_review} under review` : null,
      `${Number.isInteger(pct) ? pct : pct.toFixed(1).replace(/\.0$/, "")}% of what each pays`,
      r.status === "active" ? null : r.status,
    ].filter(Boolean);
    const payable = r.payable_cents;
    const money =
      r.currency === null
        ? "Nothing earned yet."
        : [
            payable < 0
              ? `${moneyWords(payable, cur)} to come off the next payout`
              : `${moneyWords(payable, cur)} payable`,
            `${moneyWords(r.held_cents, cur)} held`,
            `${moneyWords(r.paid_cents, cur)} paid to date`,
          ].join(" · ");
    return {
      partnerId: r.partner_id,
      code: r.code,
      who: who.join(" · "),
      money,
      currency: r.currency,
      payableCents: payable,
      canPay: r.currency !== null && payable > 0,
      payLabel: `Mark ${moneyWords(Math.max(payable, 0), cur)} as paid`,
      tone: r.status !== "active" ? "danger" : r.under_review ? "warn" : payable > 0 ? "info" : "plain",
      status: r.status,
      first,
      statusChoices: partnerStatusChoices(r.status).map((s) => ({ status: s, label: PARTNER_STATUS_VERBS[s] })),
    };
  });
}

/** The card's one line: "2 partners · $125.00 payable · 1 workspace under review", counted from the rows. */
export function platformPartnerSummary(rows: readonly PlatformPartnerBalanceDto[]): string {
  const partners = new Set(rows.map((r) => r.partner_id)).size;
  if (!partners) return "No partners yet.";
  const byCur = new Map<string, number>();
  for (const r of rows)
    if (r.currency && r.payable_cents > 0) byCur.set(r.currency, (byCur.get(r.currency) ?? 0) + r.payable_cents);
  const review = [...new Map(rows.map((r) => [r.partner_id, r.under_review])).values()].reduce((n, v) => n + v, 0);
  const parts = [`${partners} partner${partners === 1 ? "" : "s"}`];
  parts.push(byCur.size ? `${[...byCur].map(([c, n]) => moneyWords(n, c)).join(" and ")} payable` : "nothing payable");
  if (review) parts.push(`${review} workspace${review === 1 ? "" : "s"} under review`);
  return parts.join(" · ");
}

export interface PlatformPartnerStandingVM {
  /** "Brought by ada-co" */
  by: string;
  /** Its standing and why, in words: "Under review: The card that pays for it also pays for a workspace the partner owns." */
  standing: string;
  tone: Tone;
  /** The decisions a person may take from here, with their words. */
  choices: { standing: (typeof PARTNER_STANDINGS)[number]; label: string }[];
}

const STANDING_LABELS: Record<string, string> = {
  qualified: "Qualified",
  review: "Under review",
  disqualified: "Disqualified",
};

/** A workspace's partner, for its row in the back office. */
export function platformPartnerStanding(w: PlatformPartnerWorkspaceDto): PlatformPartnerStandingVM {
  const label = w.standing ? (STANDING_LABELS[w.standing] ?? w.standing) : "Not judged yet";
  const whose =
    w.decided_by === "person" ? " (decided by a person)" : w.decided_by === "sweep" ? " (the nightly check)" : "";
  const why = w.standing ? (w.standing_why ? `: ${w.standing_why}` : "") : ": judged once it has paid";
  return {
    by: `Brought by ${w.code}`,
    standing: `${label}${whose}${why}`,
    tone:
      w.standing === "review"
        ? "warn"
        : w.standing === "disqualified"
          ? "danger"
          : w.standing === "qualified"
            ? "ok"
            : "plain",
    choices: partnerStandingChoices(w.standing).map((s) => ({ standing: s, label: PARTNER_STANDING_VERBS[s] })),
  };
}

/** What partner_payout_mark answered, as the toast says it. */
export function partnerPayoutOutcomeWords(
  code: string,
  r: { paid: boolean; changed?: boolean; total_cents: number; currency: string; earnings?: number },
): string {
  if (r.changed)
    return `Nothing was recorded: what is payable to ${code} is now ${moneyWords(r.total_cents, r.currency)}, not what the card showed. Read the card again before you mark it.`;
  if (r.paid)
    return `Recorded: ${moneyWords(r.total_cents, r.currency)} paid to ${code}, settling ${r.earnings ?? 0} ledger ${r.earnings === 1 ? "line" : "lines"}.`;
  if (r.total_cents < 0)
    return `Nothing to pay: refunds since the last payout take ${moneyWords(-r.total_cents, r.currency)}, which comes off their next share.`;
  return "Nothing is payable to them in that currency, so nothing was recorded.";
}

/** What partner_standing_set answered, as the toast says it. */
export function partnerStandingOutcomeWords(r: { standing: string; voided: number; matured: number }): string {
  const label = (STANDING_LABELS[r.standing] ?? r.standing).toLowerCase();
  if (r.standing === "disqualified")
    return r.voided
      ? `Disqualified. What it still held (${r.voided} ${r.voided === 1 ? "share" : "shares"}) is void; what was paid stays paid.`
      : "Disqualified. It earns nothing from now on; what was paid stays paid.";
  if (r.standing === "qualified")
    return r.matured
      ? `Qualified. ${r.matured} ${r.matured === 1 ? "share" : "shares"} past the hold ${r.matured === 1 ? "is" : "are"} payable now.`
      : "Qualified. Its shares become payable as each one's hold ends.";
  return `Now ${label}. What it holds waits until a person decides.`;
}
