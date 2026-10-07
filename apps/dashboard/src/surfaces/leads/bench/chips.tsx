/**
 * The chips at the head of a class (moved from legacy/pages/leads-bench.jsx, decision 0015): what each criterion left out
 * under Excluded, and what would resolve each group under Needs review.
 */
import type { LeadReviewGroup, LeadRowVM } from "@chanlytics/contracts";
import { holdStill } from "../../legacy-verbs";

/**
 * The Excluded view's head: what each criterion left out, most first, each one narrowing the rows (§8.7). The counts are
 * the loaded rows' own `excludedBy` (lead_search_members.excluded_by, said in words by toLeadRowVM), so the chips say
 * what is on screen.
 */
export const ldExcludedChips = (rows: readonly LeadRowVM[]) => {
  const by = new Map<string, number>();
  for (const l of rows) if (l.cls === "excluded" && l.excludedBy) by.set(l.excludedBy, (by.get(l.excludedBy) || 0) + 1);
  return [...by.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
};

export const LeadExcludedChips = ({
  chips,
  active,
  onPick,
}: {
  chips: readonly { key: string; count: number }[];
  active: string | null;
  onPick: (key: string | null) => void;
}) =>
  chips.length === 0 ? null : (
    <div className="ld-chips" data-testid="lead-excluded-chips">
      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          className={`ld-chip ${active === c.key ? "on" : ""}`}
          aria-pressed={active === c.key}
          onClick={(e) => holdStill(e && e.currentTarget, () => onPick(active === c.key ? null : c.key))}
          data-testid={`lead-chip-${c.key}`}
        >
          {c.key} <span className="count">{c.count}</span>
        </button>
      ))}
    </div>
  );

/**
 * The Needs review view's head (D3): one chip per thing that would resolve the leads in it, most first, each selecting its
 * leads so the bulk bar can resolve them at once. The groups are contracts' (leadReviewGroups, off the rows' own reason
 * tokens), so the chip, the bar and the door agree on what a group is.
 */
export const LeadReviewGroups = ({
  groups,
  onPick,
}: {
  groups: readonly LeadReviewGroup[];
  onPick: (ids: string[]) => void;
}) =>
  groups.length === 0 ? null : (
    <div className="ld-chips" data-testid="lead-review-groups">
      {groups.map((g) => (
        <button
          key={g.key}
          type="button"
          className="ld-chip"
          onClick={() => onPick(g.ids)}
          data-testid={`review-group-${g.key}`}
        >
          {g.label} <span className="count">{g.ids.length}</span>
        </button>
      ))}
    </div>
  );
