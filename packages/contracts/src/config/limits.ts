/**
 * The day's token budget (limits.max_llm_tokens_day), as one predicate: the receptionist's answer and a reach-out
 * reply's draft (decision 0017) both ask it, so "used at or over the cap stops" is written once.
 */
import type { PolicyLimits } from "./workspace-config/policy-limits-schema";

/**
 * The day's model budget a new workspace starts with (provision_tenant, 00274): the Autonomy pane's "1M" step. The
 * owner moves it, or turns it off (0); a workspace made before it keeps what it had.
 */
export const TOKENS_DAY_DEFAULT = 1_000_000;

/** The cap in force: 0 when none is set, which is off. */
export function tokenCapOf(limits: Pick<PolicyLimits, "max_llm_tokens_day">): number {
  return typeof limits.max_llm_tokens_day === "number" ? limits.max_llm_tokens_day : 0;
}

/** Whether the day's tokens are spent: never with no cap, and at the cap or over it. */
export function tokenBudgetSpent(limits: Pick<PolicyLimits, "max_llm_tokens_day">, used: number): boolean {
  const cap = tokenCapOf(limits);
  return cap > 0 && used >= cap;
}

/** How many of a workspace's replies say what a reply is at its size: fewer, and the budget is said in tokens. */
const BUDGET_SAMPLE_MIN = 10;

/**
 * A reply's model tokens, in and out, at this workspace's own size (its usage events over the last week, db
 * replyTokensSince): what the budget counts, so a cap divided by it is the replies it buys. Null with too few replies.
 */
export function tokensPerReply(r: { replies: number; tokens: number } | null | undefined): number | null {
  if (!r || r.replies < BUDGET_SAMPLE_MIN || r.tokens <= 0) return null;
  return Math.round(r.tokens / r.replies);
}

/** About how many replies a cap buys, rounded as a person says it: to five under a hundred, to ten past it. */
function repliesFor(cap: number, perReply: number): number {
  const n = cap / perReply;
  const step = n < 100 ? 5 : 10;
  return Math.max(1, Math.round(n / step) * step);
}

/**
 * The day's budget in the owner's words (the Settings wiring review, item 12, 18 Oct 2026): it was "100k" and "1M" of
 * model tokens, which only a developer reads. Kept in tokens, which is what is counted and stopped at; said in the
 * replies a step buys at this workspace's own size of reply, and in tokens until it has answered a few. Dollars are not
 * said: a reply's event records its uncached tokens alone, so a price worked from them would be a guess.
 */
export const BUDGET_WORDS = {
  inReplies: "Replies in a day, in all",
  inTokens: "Model tokens in a day",
  /** A cap of 0: none, so it never stops for the day. */
  none: "No limit",
  stops: "Over it, it stops for the day and every new message lands in Needs you.",
  sized: (perReply: number) =>
    `A reply here is about ${perReply.toLocaleString("en-US")} model tokens, over the last week.`,
  unsized: "Said in replies once it has answered a few.",
} as const;

/** A cap in tokens, as a person reads it: "250k", "1M". */
const tokensWord = (cap: number): string =>
  cap >= 1_000_000 ? `${Math.round(cap / 100_000) / 10}M` : `${Math.round(cap / 1000)}k`;

/** The budget's dial: its label, its note, and each cap said as the label says it. */
export interface BudgetDial {
  label: string;
  note: string;
  steps: Array<readonly [string, number]>;
}

/**
 * The budget's dial over these caps: in the replies each buys ("~40") where the size of a reply is known, in tokens
 * ("250k") where it is not, or where two caps would read alike (a reply so large that both buy the same few), since a
 * dial of two equal words cannot be read.
 */
export function budgetDial(caps: readonly number[], perReply: number | null): BudgetDial {
  const word = (c: number, inReplies: boolean) =>
    c <= 0 ? BUDGET_WORDS.none : inReplies && perReply ? `~${repliesFor(c, perReply)}` : tokensWord(c);
  const said = caps.map((c) => [word(c, true), c] as const);
  const inReplies = perReply !== null && new Set(said.map(([w]) => w)).size === said.length;
  return {
    label: inReplies ? BUDGET_WORDS.inReplies : BUDGET_WORDS.inTokens,
    note: `${perReply ? BUDGET_WORDS.sized(perReply) : BUDGET_WORDS.unsized} ${BUDGET_WORDS.stops}`,
    steps: inReplies ? said : caps.map((c) => [word(c, false), c] as const),
  };
}
