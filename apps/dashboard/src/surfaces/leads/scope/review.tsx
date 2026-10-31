/**
 * Needs review on a phone is rows, like every other list (Ruben, 25 Sep; moved from legacy/pages/leads-scope.jsx,
 * decision 0015): the same cards, in the pile's order, in groups under one quiet line each -- the group's words, its count
 * and its acts -- with no bench, no card restating the reason and no buttons on rows. A row's own act is a slide
 * (ldCardCell) or a selection into the bar; a group's acts press the doors the bench and the bar press. The desktop keeps
 * its workbench.
 */
import { LEAD_REVIEW_ACT_WORDS, type LeadReviewAct, type LeadReviewGroup, type LeadRowVM } from "@chanlytics/contracts";
import { gate } from "../../legacy-verbs";
import type { TableSection } from "../../kit/table/groups";
import type { ReviewDoors } from "../bench/types";

export function ldReviewSections(p: {
  benchGroups: readonly LeadReviewGroup[];
  rows: readonly LeadRowVM[];
  review: ReviewDoors | null;
  canFind: boolean;
}): TableSection<LeadRowVM>[] {
  const words = LEAD_REVIEW_ACT_WORDS;
  const review = p.review;
  const can = (a: LeadReviewAct) => (a === "check_again" ? !!review?.canCheckAgain : true);
  const press = (a: LeadReviewAct, ids: string[]) =>
    a === "check_again" ? review?.onCheckAgain(ids) : a === "keep" ? review?.onKeep(ids) : review?.onExclude(ids);
  const gated = p.canFind ? {} : gate("find", "work these leads");
  return p.benchGroups.map((g) => {
    const acts = g.acts.filter(can);
    return {
      key: g.key,
      label: g.label,
      rows: p.rows.filter((l) => g.ids.indexOf(l.id) >= 0),
      meta: acts.length ? (
        <span className="ld-sec-acts">
          {acts.map((a) => (
            <button
              key={a}
              type="button"
              className="ld-sec-act"
              onClick={() => press(a, g.ids)}
              data-testid={`review-sec-${a}`}
              {...gated}
            >
              {a === "keep" || a === "exclude" ? `${words[a]} all` : words[a]}
            </button>
          ))}
        </span>
      ) : null,
    };
  });
}
