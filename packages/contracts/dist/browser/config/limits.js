export const TOKENS_DAY_DEFAULT = 1e6;
export function tokenCapOf(limits) {
  return typeof limits.max_llm_tokens_day === "number" ? limits.max_llm_tokens_day : 0;
}
export function tokenBudgetSpent(limits, used) {
  const cap = tokenCapOf(limits);
  return cap > 0 && used >= cap;
}
