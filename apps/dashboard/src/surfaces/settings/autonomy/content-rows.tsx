/**
 * Content's rows on the Autonomy pane (00714; the content loop PRD's 12.4, canvas v18 board B5): what AI does with posts,
 * a row per act (a post outside the week, Approve the week, a change to a running ad, a public answer under a comment), a
 * group of the one matrix in its own modes, headed "Content" (a desk's table, a phone's lines). A mode a row cannot honour
 * has no dot, as on every row: only the week has a runtime that acts on its own yet (contracts POLICY_CLASS_MODES).
 *
 * Under them, AI's suggested rung for Approve the week, only with its record behind it ("AI suggests Holds it: 4 weeks
 * approved with no edits", contracts rungSuggestionOf), and Use it, the owner's own press. Only the owner moves a rung:
 * the suggestion goes once it is taken.
 */
import {
  RUNG_SUGGESTION_USE,
  rungSuggestionOf,
  type RungSuggestion,
  type WeekApprovedRecord,
} from "@chanlytics/contracts";
import { dbMode, type UiRow } from "@/bridge/policy-store";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { RecordRow } from "../../kit/record/row";
import { gate } from "../../frame-verbs";
import type { RowGroup } from "./matrix";

/** The group's name, the board's. */
const CONTENT_GROUP = "Content";

/** What a press of a mode asks for: the row, and the mode as the database spells it. */
type PutMode = (r: UiRow, mode: string) => void;

/** AI's suggested rung for Approve the week, with its record, and the owner's press that takes it. */
function SuggestedRung({ row, suggestion, put }: { row: UiRow; suggestion: RungSuggestion; put: PutMode }) {
  return (
    <RecordRow
      id="aut-rung-suggestion"
      testid="aut-rung-suggestion"
      label={
        <>
          <Icon name="three" size={13} />
          {suggestion.words}
        </>
      }
      value={
        <Button size="sm" onClick={() => put(row, suggestion.mode)} {...gate("autonomy")}>
          {RUNG_SUGGESTION_USE}
        </Button>
      }
    />
  );
}

/** Content's four rows as the matrix's group, and under them AI's suggestion where it has a record; none with no rows. */
export function contentGroupOf(given: {
  rows: UiRow[];
  weeks: readonly WeekApprovedRecord[] | null;
  put: PutMode;
}): RowGroup[] {
  if (given.rows.length === 0) return [];
  const week = given.rows.find((r) => r.cls === "plan_approve");
  // Only a suggestion makes the group's foot: with none, no row is drawn under the four (it was an empty one).
  const suggestion = week && given.weeks ? rungSuggestionOf(dbMode(week.mode), given.weeks) : null;
  return [
    {
      name: CONTENT_GROUP,
      rows: given.rows,
      foot: week && suggestion ? <SuggestedRung row={week} suggestion={suggestion} put={given.put} /> : null,
    },
  ];
}
