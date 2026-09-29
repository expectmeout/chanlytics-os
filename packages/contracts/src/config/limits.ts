/**
 * The day's token budget (limits.max_llm_tokens_day), as one predicate: the receptionist's answer and a reach-out
 * reply's draft (decision 0017) both ask it, so "used at or over the cap stops" is written once.
 */
import type { PolicyLimits } from "./workspace-config/policy-classes";

/**
 * The day's model budget a new workspace starts with (provision_tenant, 00277): the Autonomy pane's "1M" step. The
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
