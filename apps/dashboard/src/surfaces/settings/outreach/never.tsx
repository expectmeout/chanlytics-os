/**
 * Cold email: Who never hears from you. Customers and people who said no were already kept off, on a list nobody could
 * see. Its rows are scrambled, so the page says how many, never who (db countLeadSuppressions). A count that could not be
 * read is left out, never a made-up 0.
 */
import { useEffect } from "react";
import { REACH_OUT_SETTINGS_WORDS } from "@chanlytics/contracts";
import { useRecordFold } from "../../kit/record/hooks";
import { recFolds } from "../../kit/record/registry";
import { RecordRow } from "../../kit/record/row";
import { RecordSheet } from "../../kit/record/sheet";
import { OutreachCard, type OutreachShared } from "./card";

const NEVER_WORDS = REACH_OUT_SETTINGS_WORDS.never;

export function NeverCard(shared: OutreachShared) {
  const fold = useRecordFold("never", { dirty: false });
  useEffect(() => recFolds.drawn("never"), []);
  const never = shared.read?.never ?? null;
  const kept = never ? never.said_no + never.asked_to_stop + never.customers : 0;
  return (
    <OutreachCard id="never" title={NEVER_WORDS.title}>
      <RecordRow
        id="never"
        stacked
        label={NEVER_WORDS.row}
        value={kept > 0 ? NEVER_WORDS.soFar(kept) : null}
        act={{ label: REACH_OUT_SETTINGS_WORDS.acts.seeHow, onClick: () => fold.request() }}
      />
      {fold.open ? (
        <RecordSheet id="never" title={NEVER_WORDS.title} onClose={fold.close} testid="rec-never-sheet">
          <div className="bt-stack">
            <p className="bt-fold-note">{NEVER_WORDS.sheetSub}</p>
            {never ? (
              <>
                <RecordRow id="never_customers" label={NEVER_WORDS.customers} value={String(never.customers)} />
                <RecordRow id="never_said_no" label={NEVER_WORDS.saidNo} value={String(never.said_no)} />
                <RecordRow id="never_stopped" label={NEVER_WORDS.askedToStop} value={String(never.asked_to_stop)} />
              </>
            ) : (
              <RecordRow id="never_customers" label={NEVER_WORDS.customers} value={NEVER_WORDS.customersValue} />
            )}
            <p className="bt-fold-note">{NEVER_WORDS.scrambled}</p>
          </div>
        </RecordSheet>
      ) : null}
    </OutreachCard>
  );
}
