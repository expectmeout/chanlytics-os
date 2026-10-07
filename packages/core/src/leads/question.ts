/**
 * After the probe (PRD §7.2, §0.5, P4): an intent check, from the most common
 * exclusion, when fewer than 60% of the first places pass; else the main
 * phase, sized from the probe's yield. contracts' questionAfterProbe holds
 * the words and the threshold; this holds what the runner does with its
 * answer.
 */
import { questionAfterProbe, type LeadSearchPlan, type ProbeMember } from "@chanlytics/contracts";
import type { RoundQuestion } from "./ports";
import { probeYield } from "./sizing";

/** A probe member as this reads it: contracts' own shape, with what the contact standard would need. */
export type ProbeYieldMember = ProbeMember & { phone: string | null; email: string | null };

export type AfterProbe = { kind: "ask"; question: RoundQuestion } | { kind: "go"; yield: number };

export function afterProbe(plan: LeadSearchPlan, members: ProbeYieldMember[], now: Date): AfterProbe {
  const q = questionAfterProbe(plan, members);
  if (q.ask)
    return {
      kind: "ask",
      question: {
        sentence: q.sentence,
        criterionKey: q.criterionKey,
        dropTerm: q.dropTerm,
        asked_at: now.toISOString(),
      },
    };
  return { kind: "go", yield: probeYield(members) };
}
