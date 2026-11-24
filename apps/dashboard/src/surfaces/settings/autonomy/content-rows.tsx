/**
 * Content's rows on the Autonomy pane (00712; the content loop PRD's 12.4, canvas v18 board B5): what AI does with posts,
 * a row per act (a post outside the week, Approve the week, a change to a running ad, a public answer under a comment), in
 * the matrix's own modes, a table at a desk and a line each on a phone. A mode a row cannot honour has no dot, as on every
 * row: only the week has a runtime that acts on its own yet (contracts POLICY_CLASS_MODES).
 *
 * Under Approve the week, AI's suggested rung, only with its record behind it ("AI suggests Holds it: 4 weeks approved
 * with no edits", contracts rungSuggestionOf), and Use it, the owner's own press. Only the owner moves a rung: the
 * suggestion goes once it is taken.
 */
import { RUNG_SUGGESTION_USE, rungSuggestionOf, type WeekApprovedRecord } from "@chanlytics/contracts";
import { dbMode, type UiRow } from "@/bridge/policy-store";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { RecordRow } from "../../kit/record/row";
import { gate } from "../../frame-verbs";
import { PolPhoneRows, PolicyTable } from "./matrix";

/** The rows Content's card draws, as the pane hands them, and what a press of a mode asks. */
interface ContentRowsProps {
  phone: boolean;
  rows: UiRow[];
  put: (r: UiRow, mode: string) => void;
  busy: string | null;
  /** The weeks approved, newest first: AI's suggestion's record; null where unread. */
  weeks: readonly WeekApprovedRecord[] | null;
}

/** AI's suggested rung for Approve the week, with its record, and the owner's press that takes it. */
function RungSuggestion({
  row,
  weeks,
  put,
}: {
  row: UiRow;
  weeks: readonly WeekApprovedRecord[];
  put: ContentRowsProps["put"];
}) {
  const suggestion = rungSuggestionOf(dbMode(row.mode), weeks);
  if (!suggestion) return null;
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

/** The card: Content's four rows, and under them AI's suggestion where it has a record. */
export function AutContentRows({ phone, rows, put, busy, weeks }: ContentRowsProps) {
  if (rows.length === 0) return null;
  const week = rows.find((r) => r.cls === "plan_approve");
  return (
    <section className="rec-card set-card" data-testid="aut-content">
      <div className="rec-card-head">
        <h2 className="rec-card-title">Content</h2>
        <span className="rec-card-sub">What AI does with your posts, a sentence for each kind</span>
      </div>
      {phone ? <PolPhoneRows rows={rows} put={put} busy={busy} /> : <PolicyTable rows={rows} put={put} busy={busy} />}
      {week && weeks ? <RungSuggestion row={week} weeks={weeks} put={put} /> : null}
    </section>
  );
}
