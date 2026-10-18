export const TOKENS_DAY_DEFAULT = 1e6;
export function tokenCapOf(limits) {
  return typeof limits.max_llm_tokens_day === "number" ? limits.max_llm_tokens_day : 0;
}
export function tokenBudgetSpent(limits, used) {
  const cap = tokenCapOf(limits);
  return cap > 0 && used >= cap;
}
const BUDGET_SAMPLE_MIN = 10;
export function tokensPerReply(r) {
  if (!r || r.replies < BUDGET_SAMPLE_MIN || r.tokens <= 0) return null;
  return Math.round(r.tokens / r.replies);
}
function repliesFor(cap, perReply) {
  const n = cap / perReply;
  const step = n < 100 ? 5 : 10;
  return Math.max(1, Math.round(n / step) * step);
}
export const BUDGET_WORDS = {
  inReplies: "Replies in a day, in all",
  inTokens: "Model tokens in a day",
  /** A cap of 0: none, so it never stops for the day. */
  none: "No limit",
  stops: "Over it, it stops for the day and every new message lands in Needs you.",
  sized: (perReply) => `A reply here is about ${perReply.toLocaleString("en-US")} model tokens, over the last week.`,
  unsized: "Said in replies once it has answered a few."
};
const tokensWord = (cap) => cap >= 1e6 ? `${Math.round(cap / 1e5) / 10}M` : `${Math.round(cap / 1e3)}k`;
export function budgetDial(caps, perReply) {
  const word = (c, inReplies2) => c <= 0 ? BUDGET_WORDS.none : inReplies2 && perReply ? `~${repliesFor(c, perReply)}` : tokensWord(c);
  const said = caps.map((c) => [word(c, true), c]);
  const inReplies = perReply !== null && new Set(said.map(([w]) => w)).size === said.length;
  return {
    label: inReplies ? BUDGET_WORDS.inReplies : BUDGET_WORDS.inTokens,
    note: `${perReply ? BUDGET_WORDS.sized(perReply) : BUDGET_WORDS.unsized} ${BUDGET_WORDS.stops}`,
    steps: inReplies ? said : caps.map((c) => [word(c, false), c])
  };
}
