/**
 * A plan's steps as a commit reads them (the marketing manager's spec §5.4): the token a step names what an earlier step
 * makes by (`@step:n`), filled from what the plan made, and that made read back from its cards' outcomes. Apart from the
 * plan itself (plan.ts, which reads the starters, the lists and the journey to make the steps), so the browser's commit
 * runner (legacy-bridge/ask/commit.ts) reads these and nothing of how a plan is made.
 */
import type { AskProposal } from "./ask";

/**
 * Every step of a plan committed so far, by step, as a card's commit fills its tokens from it and a press of the plan
 * skips it: its card's kind and the id its spec says it made (ProposalSpec.made), null where it made nothing a token
 * names (a note, a change); or that the step was undone, so what it made is gone, a card naming it is refused
 * (PROPOSAL_WORDS.planUndone) and the plan's press never runs it again. A step absent is not committed yet.
 */
export type PlanMade = Record<number, { kind: string; id: string | null } | { undone: true }>;

/** The token a step's input names what an earlier step makes by: `@step:1` is step 1's message. */
export const STEP_TOKEN = /^@step:(\d+)$/;

export function stepToken(n: number): string {
  return `@step:${n}`;
}

/**
 * Every `@step:n` in a step's input, at any depth, filled with the id step n made; or the first step it names that
 * names nothing: not committed yet, committed with nothing a token names (its id null), or undone. The input it is
 * given is left as it was.
 */
export function resolveSteps(
  payload: Record<string, unknown>,
  made: PlanMade,
): Record<string, unknown> | { unresolved: number } {
  let unresolved: number | null = null;
  const fill = (v: unknown): unknown => {
    if (typeof v === "string") {
      const m = STEP_TOKEN.exec(v);
      if (!m) return v;
      const n = Number(m[1]);
      const step = made[n];
      if (step && !("undone" in step) && step.id !== null) return step.id;
      unresolved ??= n;
      return v;
    }
    if (Array.isArray(v)) return v.map(fill);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(x)]));
    return v;
  };
  const out = Object.fromEntries(Object.entries(payload).map(([k, x]) => [k, fill(x)]));
  return unresolved === null ? out : { unresolved };
}

/**
 * A plan's made, read back from what became of its cards, in one pass (a reload, another tab): a step whose card was
 * approved is committed, with the id its outcome kept (null where it made nothing a token names, or an outcome saved
 * before outcomes kept it); one whose card was undone is undone. A card dismissed, failed or not acted on is not
 * committed. Only the cards of plan `planId` are read.
 */
export function planMadeOf(planId: string, cards: readonly Pick<AskProposal, "kind" | "plan" | "outcome">[]): PlanMade {
  const made: PlanMade = {};
  for (const p of cards) {
    if (p.plan?.id !== planId || !p.outcome) continue;
    if (p.outcome.state === "done") made[p.plan.step] = { kind: p.kind, id: p.outcome.made?.id ?? null };
    else if (p.outcome.state === "undone") made[p.plan.step] = { undone: true };
  }
  return made;
}
