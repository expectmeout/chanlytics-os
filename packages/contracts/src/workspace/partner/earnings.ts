/** Partner: earnings. */

import { moneyWords } from "../billing/checkout";
import { PLATFORM_VERDICTS, platformRows, type PlatformTenantDto, type PlatformVerdict } from "../platform";
import type { Tone } from "../../shell/tone";
import {
  PARTNER_HOLD_DAYS,
  PARTNER_STANDINGS,
  PARTNER_STATUSES,
  PARTNER_WORDS,
  partnerLinkFor,
  type PartnerDto,
} from "./dtos";

/** The share, as a sentence: "25% of what it pays for its plan". */
export function shareWords(shareBp: number): string {
  const pct = shareBp / 100;
  const shown = Number.isInteger(pct) ? String(pct) : pct.toFixed(1).replace(/\.0$/, "");
  return `${shown}% of what it pays for its plan`;
}

/**
 * How many workspaces have this person as their partner, as a sentence: through the link, a handover its owner took,
 * or an owner's invitation (partner_tenants). Zero is a real count and is said.
 */
export function broughtWords(count: number): string {
  if (count <= 0) return "No workspace has you as its partner yet.";
  if (count === 1) return "1 workspace has you as its partner.";
  return `${count} workspaces have you as their partner.`;
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

/** A day as the partner's pages say it: "Oct 11". */
export const partnerDayWords = (at: string): string =>
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

export function partnerEarningsWords(
  rows: readonly PartnerBalanceRow[] | null | undefined,
  nowMs = Date.now(),
): PartnerEarningsVM {
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
    // The date is the earliest a held share could be paid, never a promise: one waiting on a review, or past its
    // date and not yet judged, is said as waiting rather than given a day that has gone.
    held:
      held.cents === 0
        ? `Nothing held. A share is held ${PARTNER_HOLD_DAYS} days after each payment.`
        : next && Date.parse(next) > nowMs
          ? `${held.words} held, the first of it payable from ${partnerDayWords(next)} at the earliest.`
          : `${held.words} held, payable once each workspace it came from is qualified.`,
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
  review: "Under review: a person at Chanlytics looks at it before its share is paid. We'll write to you.",
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
  /** The partner's own status: a paused or closed partner is off every team by the platform, not by an owner. */
  status: string = "active",
): PartnerWorkspacesVM {
  const judged = platformRows(overview, nowMs);
  const moneyOf = (id: string) => money.filter((m) => m.tenant_id === id);
  const standingOf = (id: string): string | null => {
    const s = moneyOf(id)[0]?.standing ?? "pending";
    return PARTNER_STANDING_WORDS[s] ?? null;
  };
  const rows: PartnerWorkspaceVM[] = judged.map((context) => {
    const value = PLATFORM_VERDICTS[context.verdict];
    return {
      tenantId: context.tenantId,
      slug: context.slug,
      name: context.name,
      verdict: context.verdict,
      label: value.label,
      tone: value.tone,
      sentence: context.sentence,
      facts: [
        context.facts.paying,
        context.facts.answering,
        `texting ${context.facts.texting}`,
        `heard ${context.facts.heard}`,
      ].join(" · "),
      standing: standingOf(context.tenantId),
      money: moneyLine(moneyOf(context.tenantId)),
      onTeam: true,
    };
  });
  const seen = new Set(rows.map((r) => r.tenantId));
  const off = [...new Map(money.filter((m) => !seen.has(m.tenant_id)).map((m) => [m.tenant_id, m])).values()];
  for (const row of off.sort((a, b) => a.name.localeCompare(b.name))) {
    rows.push({
      tenantId: row.tenant_id,
      slug: null,
      name: row.name,
      verdict: null,
      label: "Off the team",
      tone: "plain",
      sentence:
        status === "paused"
          ? "Your partner account is paused, so you are a viewer on its team until it is looked at."
          : status === "closed"
            ? "Your partner account is closed. Its details are its owner's."
            : row.on_team
              ? "Its details could not be read just now."
              : "Its owner took you off its team. Your share goes on while it pays; its details are theirs.",
      facts: null,
      standing: standingOf(row.tenant_id),
      money: moneyLine(moneyOf(row.tenant_id)),
      onTeam: row.on_team,
    });
  }
  const total = rows.length;
  const live = rows.filter((r) => r.verdict === "live").length;
  const needs = rows.filter((r) => r.verdict !== null && NEEDS_THE_PARTNER.includes(r.verdict)).length;
  const parts = [`${total} workspace${total === 1 ? "" : "s"}`, `${live} live`];
  if (needs) parts.push(`${needs} need${needs === 1 ? "s" : ""} you`);
  return { rows, summary: total ? parts.join(" · ") : broughtWords(0) };
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

/** One line of platform_partner_workspaces() (00205, 00225): who brought a workspace, how, and its standing. */
export interface PlatformPartnerWorkspaceDto {
  tenant_id: string;
  partner_id: string;
  code: string;
  attributed_at: string;
  standing: string | null;
  standing_why: string | null;
  standing_at: string | null;
  /**
   * Who decided it: the sweep's checks ('sweep'), a person in the back office ('person'), or the rule as a partner
   * joined a workspace that was already paying ('joining', 0020). Null until it is judged.
   */
  decided_by: string | null;
  checks: Record<string, unknown> | null;
  /** How the partner came: link, handover or invite (0020). Absent from a database before 00225. */
  origin?: string | null;
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
export function partnerStatusOutcomeWords(code: string, row: { status: string; seats: number }): string {
  const seats = `${row.seats} ${row.seats === 1 ? "workspace" : "workspaces"}`;
  if (row.status === "active")
    return row.seats
      ? `${code} is restored, and a partner again on ${seats}.`
      : `${code} is restored. No seat was waiting to be given back.`;
  const subject = row.status === "closed" ? "closed" : "paused";
  return row.seats
    ? `${code} is ${subject}: a viewer on ${seats} now, and what they held there is released.`
    : `${code} is ${subject}. They held no partner seat to take.`;
}

/** The back office's partner list: one row per partner and currency, what is owed first. */
export function platformPartnerRows(rows: readonly PlatformPartnerBalanceDto[]): PlatformPartnerRowVM[] {
  const seen = new Set<string>();
  return rows.map((row) => {
    const first = !seen.has(row.partner_id);
    seen.add(row.partner_id);
    const cur = row.currency ?? "usd";
    const pct = row.share_bp / 100;
    const person = [
      row.email ?? "no address on file",
      `${row.workspaces} workspace${row.workspaces === 1 ? "" : "s"}`,
      row.under_review ? `${row.under_review} under review` : null,
      `${Number.isInteger(pct) ? pct : pct.toFixed(1).replace(/\.0$/, "")}% of what each pays`,
      row.status === "active" ? null : row.status,
    ].filter(Boolean);
    const payable = row.payable_cents;
    const money =
      row.currency === null
        ? "Nothing earned yet."
        : [
            payable < 0
              ? `${moneyWords(payable, cur)} to come off the next payout`
              : `${moneyWords(payable, cur)} payable`,
            `${moneyWords(row.held_cents, cur)} held`,
            `${moneyWords(row.paid_cents, cur)} paid to date`,
          ].join(" · ");
    return {
      partnerId: row.partner_id,
      code: row.code,
      who: person.join(" · "),
      money,
      currency: row.currency,
      payableCents: payable,
      canPay: row.currency !== null && payable > 0,
      payLabel: `Mark ${moneyWords(Math.max(payable, 0), cur)} as paid`,
      tone: row.status !== "active" ? "danger" : row.under_review ? "warn" : payable > 0 ? "info" : "plain",
      status: row.status,
      first,
      statusChoices: partnerStatusChoices(row.status).map((s) => ({ status: s, label: PARTNER_STATUS_VERBS[s] })),
    };
  });
}
