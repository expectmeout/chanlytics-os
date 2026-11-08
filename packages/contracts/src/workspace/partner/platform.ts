/** Partner: platform. */

import { moneyWords } from "../billing/checkout";
import type { Tone } from "../../shell/tone";
import type { PartnerLetterNews } from "../partner-schema";
import {
  PARTNER_STANDING_VERBS,
  partnerDayWords,
  partnerEarningsWords,
  partnerStandingChoices,
  type PartnerBalanceRow,
  type PlatformPartnerBalanceDto,
  type PlatformPartnerWorkspaceDto,
} from "./earnings";
import {
  PARTNER_HOLD_DAYS,
  PARTNER_REVERSAL_KINDS,
  PARTNER_WORDS,
  type PARTNER_EARNING_KINDS,
  type PARTNER_STANDINGS,
  type PARTNER_STATUSES,
} from "./dtos";
import { entryOf } from "../../shared/unknown";

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
  /** "Brought by ada-co", "Set up and handed over by ada-co", "ada-co, asked in by its owner" */
  by: string;
  /** Its standing and why, in words: "Under review: The card that pays for it also pays for a workspace the partner owns." */
  standing: string;
  tone: Tone;
  /** The decisions a person may take from here, with their words. */
  choices: { standing: (typeof PARTNER_STANDINGS)[number]; label: string }[];
}

const STANDING_LABELS: Record<(typeof PARTNER_STANDINGS)[number], string> = {
  qualified: "Qualified",
  review: "Under review",
  disqualified: "Disqualified",
};

/** A standing as the back office says it; a standing the set does not know, as stored. */
const standingLabel = (standing: string): string => entryOf(STANDING_LABELS, standing) ?? standing;

/** Who decided a standing, after its label: nothing for one that has not been. */
const DECIDED_BY_WORDS: Record<string, string> = {
  person: " (decided by a person)",
  sweep: " (the nightly check)",
  joining: " (as the partner joined)",
};

/** How the partner came to the workspace, for its row: "Brought by ada-co". */
const BY_ORIGIN: Record<string, (code: string) => string> = {
  link: (code) => `Brought by ${code}`,
  handover: (code) => `Set up and handed over by ${code}`,
  invite: (code) => `${code}, asked in by its owner`,
};

/** A workspace's partner, for its row in the back office. */
export function platformPartnerStanding(partnerWorkspace: PlatformPartnerWorkspaceDto): PlatformPartnerStandingVM {
  const label = partnerWorkspace.standing ? standingLabel(partnerWorkspace.standing) : "Not judged yet";
  const owner = (partnerWorkspace.decided_by && DECIDED_BY_WORDS[partnerWorkspace.decided_by]) ?? "";
  const reason = partnerWorkspace.standing
    ? partnerWorkspace.standing_why
      ? `: ${partnerWorkspace.standing_why}`
      : ""
    : ": judged once it has paid";
  return {
    by: (BY_ORIGIN[partnerWorkspace.origin ?? "link"] ?? BY_ORIGIN.link)?.(partnerWorkspace.code) ?? "",
    standing: `${label}${owner}${reason}`,
    tone:
      partnerWorkspace.standing === "review"
        ? "warn"
        : partnerWorkspace.standing === "disqualified"
          ? "danger"
          : partnerWorkspace.standing === "qualified"
            ? "ok"
            : "plain",
    choices: partnerStandingChoices(partnerWorkspace.standing).map((s) => ({
      standing: s,
      label: PARTNER_STANDING_VERBS[s],
    })),
  };
}

/**
 * Why a code a workspace was made with credited nobody (00202 `partner.code_ignored`'s `why`): the code names no partner,
 * or the partner it names is not active (their status), or it was the code of the person making the workspace.
 */
const CODE_IGNORED_WHY: Record<"unknown" | Exclude<(typeof PARTNER_STATUSES)[number], "active"> | "self", string> = {
  unknown: "no partner has that code",
  paused: "that partner's account is paused",
  closed: "that partner's account is closed",
  self: "it was their own code",
};

/** What came off a share, or came back (00203, 00207 `partner.reversed`'s `kind`), without an amount. */
const REVERSED_WORDS: Record<Exclude<(typeof PARTNER_EARNING_KINDS)[number], "share">, string> = {
  refund: "a payment was refunded",
  dispute: "a payment was disputed",
  dispute_won: "a dispute was won",
};

/**
 * What an event of the partner programme says beyond its kind's words in the workspace's own activity log: the one or two
 * fields a sentence names, and never an amount, an invoice or a partner's id. Read from what each writer files (migrations
 * 00202, 00203, 00207, 00214, 00218, 00225): why a code was not used, what came off a share, a handover sent again, a
 * partner who joined a workspace already paying. A field it does not know says nothing. A share's standing is not here:
 * it is between the platform and the partner, and the owner's log says only that it was judged (activity.ts).
 */
export function partnerEventBits(kind: string, record: Record<string, unknown>): string[] {
  const textOf = (k: string): string | null => (typeof record[k] === "string" && record[k] ? record[k] : null);
  const known = (words: Record<string, string>, k: string): string[] => {
    const sentence = textOf(k);
    const word = sentence !== null && Object.hasOwn(words, sentence) ? (words[sentence] ?? null) : null;
    return word === null ? [] : [word];
  };
  switch (kind) {
    case "partner.code_ignored":
      return known(CODE_IGNORED_WHY, "why");
    case "partner.reversed":
      return known(REVERSED_WORDS, "kind");
    case "partner.handover_sent":
      return record.again === true ? ["sent again"] : [];
    case "partner.invite_accepted":
      return record.earns === false ? ["it was already paying, so it earns no share"] : [];
    default:
      return [];
  }
}

/** What partner_payout_mark answered, as the toast says it. */
export function partnerPayoutOutcomeWords(
  code: string,
  row: { paid: boolean; changed?: boolean; total_cents: number; currency: string; earnings?: number },
): string {
  if (row.changed)
    return `Nothing was recorded: what is payable to ${code} is now ${moneyWords(row.total_cents, row.currency)}, not what the card showed. Read the card again before you mark it.`;
  if (row.paid)
    return `Recorded: ${moneyWords(row.total_cents, row.currency)} paid to ${code}, settling ${row.earnings ?? 0} ledger ${row.earnings === 1 ? "line" : "lines"}.`;
  if (row.total_cents < 0)
    return `Nothing to pay: refunds since the last payout take ${moneyWords(-row.total_cents, row.currency)}, which comes off their next share.`;
  return "Nothing is payable to them in that currency, so nothing was recorded.";
}

/** What partner_standing_set answered, as the toast says it. */
export function partnerStandingOutcomeWords(row: { standing: string; voided: number; matured: number }): string {
  const label = standingLabel(row.standing).toLowerCase();
  if (row.standing === "disqualified")
    return row.voided
      ? `Disqualified. What it still held (${row.voided} ${row.voided === 1 ? "share" : "shares"}) is void; what was paid stays paid.`
      : "Disqualified. It earns nothing from now on; what was paid stays paid.";
  if (row.standing === "qualified")
    return row.matured
      ? `Qualified. ${row.matured} ${row.matured === 1 ? "share" : "shares"} past the hold ${row.matured === 1 ? "is" : "are"} payable now.`
      : "Qualified. Its shares become payable as each one's hold ends.";
  return `Now ${label}. What it holds waits until a person decides.`;
}

/** Where the letter sends the partner: their pane, on whichever workspace the dashboard opens. */
export const partnerPaneUrl = (origin: string): string => `${origin.replace(/\/+$/, "")}/#/admin/partner`;

const money = (rows: readonly { currency: string; cents: number }[]): string =>
  rows.map((r) => moneyWords(Math.abs(r.cents), r.currency)).join(" and ");

const workspaceWords = (name: string | null): string => (name && name.trim() ? name.trim() : "A workspace you brought");

const setUpWords = (name: string | null): string => (name && name.trim() ? name.trim() : "A workspace you set up");

const whyWords = (reason: string | null): string => (reason && reason.trim() ? ` Why: ${reason.trim()}` : "");

/** Each reversal kind's line: what came off, or what came back. */
const REVERSAL_LINES: Record<string, (n: number, amount: string) => string> = {
  refund: (n, a) => `${n === 1 ? "A refund" : `${n} refunds`} took back ${a}.`,
  dispute: (n, a) =>
    `${n === 1 ? "A dispute" : `${n} disputes`} took back ${a} while ${n === 1 ? "it is" : "they are"} settled.`,
  dispute_won: (n, a) => `${n === 1 ? "A dispute" : `${n} disputes`} settled in the business's favor gave back ${a}.`,
};

/** The line for a workspace's standing, as the partner reads it. */
function standingLine(s: PartnerLetterNews["standing"][number]): string {
  const name = workspaceWords(s.workspace);
  if (s.standing === "review")
    return `${name} is under review: a person at Chanlytics looks at it before its share is paid.${whyWords(s.why)}`;
  if (s.standing === "disqualified") return `${name} is not eligible for a share.${whyWords(s.why)}`;
  return `${name} qualified: its shares are paid as each one's hold ends.${whyWords(s.why)}`;
}

function statusLine(s: NonNullable<PartnerLetterNews["status"]>): string {
  if (s.status === "paused")
    return `Your partner account is paused.${whyWords(s.why)} On the teams you joined you can read, not change, until it is restored.`;
  if (s.status === "closed") return `Your partner account is closed.${whyWords(s.why)}`;
  return "Your partner account is active again.";
}

/** One currency's sums as the pane's rows, so the letter's standing says what the pane says. */
function balanceRows(balance: PartnerLetterNews["balance"]): PartnerBalanceRow[] {
  return balance.flatMap((b) => [
    { currency: b.currency, state: "held", earned_cents: b.held, next_payable_at: b.next_payable_at },
    { currency: b.currency, state: "payable", earned_cents: b.payable, next_payable_at: null },
    { currency: b.currency, state: "paid", earned_cents: b.paid, next_payable_at: null },
  ]);
}

/**
 * The daily letter (0014): what changed, one line each, then where the partner stands, in the pane's own sentences.
 * The subject names the change that matters most. Every figure is a sum partner_letters_due read; nothing is promised.
 */
export function partnerLetter(
  news: PartnerLetterNews,
  opts: { origin: string; since: string; nowMs?: number },
): { subject: string; body: string } {
  const stand = partnerEarningsWords(balanceRows(news.balance), opts.nowMs);
  const body = [
    `Since ${partnerDayWords(opts.since)}:`,
    "",
    ...letterLines(news).map((l) => `- ${l}`),
    "",
    "Where you stand:",
    ...(stand.none ? [`- ${PARTNER_WORDS.noneYet}`] : [stand.held, stand.payable, stand.paid].map((l) => `- ${l}`)),
    "",
    `See it all: ${partnerPaneUrl(opts.origin)}`,
    "",
    "You get this email when something changes, at most once a day. To stop it, turn it off in Settings › Partner.",
  ].join("\n");
  return { subject: letterSubject(news), body };
}

const sharesOf = (news: PartnerLetterNews) => news.written.filter((w) => w.kind === "share");

const countOf = (rows: readonly { count: number }[]): number => rows.reduce((k, w) => k + w.count, 0);

const nonZero = <T extends { cents: number }>(rows: readonly T[]): T[] => rows.filter((r) => r.cents !== 0);

/** One line per change, in the order the letter says them: the account, the money that moved, then the workspaces. */
function letterLines(news: PartnerLetterNews): string[] {
  const lines: string[] = [];
  if (news.status) lines.push(statusLine(news.status));
  for (const p of news.paid)
    lines.push(`Paid: ${moneyWords(p.cents, p.currency)} on ${partnerDayWords(p.sent_at)}, reference ${p.reference}.`);
  const shares = sharesOf(news);
  if (shares.length) {
    const n = countOf(shares);
    lines.push(
      `You earned ${money(shares)} from ${n === 1 ? "1 payment" : `${n} payments`}, held ${PARTNER_HOLD_DAYS} days.`,
    );
  }
  for (const kind of PARTNER_REVERSAL_KINDS) {
    const of = news.written.filter((w) => w.kind === kind);
    if (of.length) lines.push(REVERSAL_LINES[kind]?.(countOf(of), money(of)) ?? "");
  }
  const matured = nonZero(news.matured);
  if (matured.length) lines.push(`${money(matured)} became payable.`);
  const voided = nonZero(news.voided);
  if (voided.length) lines.push(`${money(voided)} held will not be paid: its workspace is not eligible.`);
  for (const s of news.standing) lines.push(standingLine(s));
  for (const b of news.brought)
    lines.push(`${b && b.trim() ? b.trim() : "A new workspace"} signed up through your link.`);
  // A news object written before 0016 has neither: nothing to say.
  for (const a of news.accepted ?? [])
    lines.push(`${setUpWords(a)} has its owner now: they accepted it. Its share runs from its first payment.`);
  for (const d of news.declined ?? [])
    lines.push(`${setUpWords(d)} was declined by the owner you sent it to. Send it again, or to someone else.`);
  return lines;
}

/** The subject names the change that matters most: the first of these that holds. */
const LETTER_SUBJECTS: readonly [(news: PartnerLetterNews) => boolean, (news: PartnerLetterNews) => string][] = [
  [(n) => n.status?.status === "closed", () => "Your Chanlytics partner account is closed"],
  [(n) => n.status?.status === "paused", () => "Your Chanlytics partner account is paused"],
  [(n) => n.paid.length > 0, (n) => `Chanlytics paid you ${money(n.paid)}`],
  [
    (n) => n.standing.some((s) => s.standing === "disqualified"),
    () => "A workspace you brought is not eligible for a share",
  ],
  [(n) => n.standing.some((s) => s.standing === "review"), () => "A workspace you brought is under review"],
  [(n) => (n.declined ?? []).length > 0, () => "A business declined the workspace you set up"],
  [(n) => (n.accepted ?? []).length > 0, () => "A business took over the workspace you set up"],
  [(n) => sharesOf(n).length > 0, (n) => `You earned ${money(sharesOf(n))}`],
];

function letterSubject(news: PartnerLetterNews): string {
  const rule = LETTER_SUBJECTS.find(([holds]) => holds(news));
  return rule ? rule[1](news) : "What changed in your partner account";
}
