/**
 * The chips at the head of a class (moved from legacy/pages/leads-bench.jsx, decision 0015): what each criterion left out
 * under Excluded, and what would resolve each group under Needs review.
 */
import { leadCriterionWords, type LeadReviewGroup, type LeadRowVM } from "@chanlytics/contracts";
import { holdStill } from "../../legacy-verbs";

/**
 * The Excluded view's head: what each criterion left out, most first, each one narrowing the view (§8.7). A chip names its
 * criterion by its key (lead_search_members.excluded_by), which the read narrows by (00500), and says it in words. The
 * counts are the server's over the view without its filters (lead_view_counts), so a chip picked leaves the others'
 * counts as they were; where the server did not count them, the loaded rows' own.
 */
export const ldExcludedChips = (rows: readonly LeadRowVM[], counted: Readonly<Record<string, number>> | null) => {
  const by = new Map<string, number>();
  if (counted) {
    for (const [key, n] of Object.entries(counted)) if (n > 0) by.set(key, n);
  } else
    for (const l of rows)
      if (l.cls === "excluded" && l.excludedKey) by.set(l.excludedKey, (by.get(l.excludedKey) || 0) + 1);
  return [...by.entries()]
    .map(([key, count]) => ({ key, label: leadCriterionWords(key), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
};

export const LeadExcludedChips = ({
  chips,
  active,
  onPick,
}: {
  chips: readonly { key: string; label: string; count: number }[];
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
          data-testid={`lead-chip-${c.label}`}
        >
          {c.label} <span className="count">{c.count}</span>
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
