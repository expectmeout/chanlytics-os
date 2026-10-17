import { LEAD_QUESTION_MIN_EVIDENCE, LEAD_QUESTION_THRESHOLD } from "./caps.js";
import { lowerFirst } from "./sentence.js";
export function questionAfterProbe(plan, members) {
  const n = members.length;
  if (n < LEAD_QUESTION_MIN_EVIDENCE) return { ask: false };
  const excluded = members.filter((m) => m.class === "excluded").length;
  if (excluded / n <= 1 - LEAD_QUESTION_THRESHOLD) return { ask: false };
  const exclusionKeys = new Set(plan.exclusions.map((e) => e.key));
  const tally = /* @__PURE__ */ new Map();
  for (const m of members)
    if (m.class === "excluded" && m.excluded_by && exclusionKeys.has(m.excluded_by))
      tally.set(m.excluded_by, (tally.get(m.excluded_by) ?? 0) + 1);
  const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!top) return { ask: false };
  const textOf = (key) => lowerFirst(
    plan.exclusions.find((e) => e.key === key)?.text ?? plan.criteria.find((c) => c.key === key)?.text ?? key
  );
  const namedShare = top[1] / n;
  const lead = namedShare >= 2 / 3 ? "Most" : namedShare >= 0.5 ? "Half" : "Some";
  const what = excluded > top[1] ? `${textOf(top[0])} and other kinds of places` : textOf(top[0]);
  let dropTerm = null;
  if (plan.terms.length > 1) {
    const statOf = (term) => {
      const of = members.filter((m) => m.term === term);
      return {
        count: of.length,
        excludedShare: of.length ? of.filter((m) => m.class === "excluded").length / of.length : 0
      };
    };
    for (const term of plan.terms) {
      const s = statOf(term);
      if (s.count < 5 || s.excludedShare < 2 / 3) continue;
      const anotherWorks = plan.terms.some(
        (other) => other !== term && (() => {
          const o = statOf(other);
          return o.count >= 5 && o.excludedShare < 2 / 3;
        })()
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
    dropTerm
  };
}
