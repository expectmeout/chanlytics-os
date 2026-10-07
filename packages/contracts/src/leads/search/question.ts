/**
 * The question after the probe (P4): when too many of the probe's places were excluded, the round waits and asks
 * the owner whether its most common exclusion is what they meant, and may drop the term that brought them. Its
 * threshold and its evidence are caps.ts's.
 */
import type { LeadMemberClass } from "./sets";
import { LEAD_QUESTION_MIN_EVIDENCE, LEAD_QUESTION_THRESHOLD } from "./caps";
import type { LeadSearchPlan } from "./plan";
import { lowerFirst } from "./sentence";

/* --------------------------------------------- the question after 25 (P4) -- */

export interface ProbeMember {
  class: LeadMemberClass;
  excluded_by: string | null;
  term?: string | null;
}
export type LeadQuestion =
  { ask: true; sentence: string; criterionKey: string; dropTerm: string | null } | { ask: false };

/**
 * An intent check, never an accuracy measure (P4). Measured by exclusion, not
 * by qualification: under an email standard almost nothing is Qualified yet
 * while the mailbox checks are still out, so Review must never read as a no.
 * Over the probe's places, when more than 1 − LEAD_QUESTION_THRESHOLD were
 * excluded, the round waits and asks whether the search matches what the
 * owner meant, from the most common exclusion. Only an exclusion's own tally
 * can be the topic: Include lifts an exclusion, and must never be offered
 * against a real requirement, so a place excluded by a required criterion is
 * not counted here. The sentence's own lead word ("Most"/"Half"/"Some") comes
 * from that chip's own share of the first n, never from everything excluded
 * for any reason (P2, S12: a line claims only what it names); when more
 * places were excluded than the chip accounts for, the sentence says so with
 * "and other kinds of places". A term is dropped first when it is demonstrably the
 * problem and at least one other term with enough places is demonstrably
 * working; never when every term is bad, and never on the strength of a term
 * nobody else has tried. It never asks the owner to relax a fact.
 */
export function questionAfterProbe(plan: LeadSearchPlan, members: ProbeMember[]): LeadQuestion {
  const n = members.length;
  if (n < LEAD_QUESTION_MIN_EVIDENCE) return { ask: false };
  const excluded = members.filter((m) => m.class === "excluded").length;
  if (excluded / n <= 1 - LEAD_QUESTION_THRESHOLD) return { ask: false };
  const exclusionKeys = new Set(plan.exclusions.map((e) => e.key));
  const tally = new Map<string, number>();
  for (const m of members)
    if (m.class === "excluded" && m.excluded_by && exclusionKeys.has(m.excluded_by))
      tally.set(m.excluded_by, (tally.get(m.excluded_by) ?? 0) + 1);
  const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!top) return { ask: false };
  const textOf = (key: string) =>
    lowerFirst(
      plan.exclusions.find((e) => e.key === key)?.text ?? plan.criteria.find((c) => c.key === key)?.text ?? key,
    );
  const namedShare = top[1] / n;
  const lead = namedShare >= 2 / 3 ? "Most" : namedShare >= 0.5 ? "Half" : "Some";
  const what = excluded > top[1] ? `${textOf(top[0])} and other kinds of places` : textOf(top[0]);
  let dropTerm: string | null = null;
  if (plan.terms.length > 1) {
    const statOf = (term: string) => {
      const of = members.filter((m) => m.term === term);
      return {
        count: of.length,
        excludedShare: of.length ? of.filter((m) => m.class === "excluded").length / of.length : 0,
      };
    };
    for (const term of plan.terms) {
      const s = statOf(term);
      if (s.count < 5 || s.excludedShare < 2 / 3) continue;
      const anotherWorks = plan.terms.some(
        (other) =>
          other !== term &&
          (() => {
            const o = statOf(other);
            return o.count >= 5 && o.excludedShare < 2 / 3;
          })(),
      );
      if (anotherWorks) {
        dropTerm = term;
        break;
      }
    }
  }
  const drop = dropTerm ? ` I'm dropping "${dropTerm}": it mostly returned those.` : "";
  return {
    ask: true,
    sentence: `${lead} of the first ${n} are ${what}, which I'm leaving out. Is that what you meant?${drop}`,
    criterionKey: top[0],
    dropTerm,
  };
}
