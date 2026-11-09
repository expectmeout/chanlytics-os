/**
 * Cold email: what steps out of the way, last. The rules are reassurance, not a setting: one row, then a sheet, said from
 * the numbers the code keeps (reachOutRuleLines). The exact instructions are for the curious, and work as they did.
 */
import { useEffect } from "react";
import { REACH_OUT_SETTINGS_WORDS, reachOutRuleLines } from "@chanlytics/contracts";
import { Icon } from "../../kit/icon/icon";
import { useRecordFold } from "../../kit/record/hooks";
import { recFolds } from "../../kit/record/registry";
import { RecordRow } from "../../kit/record/row";
import { RecordSheet } from "../../kit/record/sheet";
import { ToldRow } from "./told";

const RULE_WORDS = REACH_OUT_SETTINGS_WORDS.rules;

function RulesRow() {
  const fold = useRecordFold("rules", { dirty: false });
  useEffect(() => recFolds.drawn("rules"), []);
  return (
    <>
      <RecordRow id="rules" label={RULE_WORDS.title} act={{ label: "Open", onClick: () => fold.request() }} />
      {fold.open ? (
        <RecordSheet id="rules" title={RULE_WORDS.title} onClose={fold.close} testid="rec-rules-sheet">
          <div className="bt-stack">
            <p className="bt-fold-note">{RULE_WORDS.sub}</p>
            <ul className="ro-rules" data-testid="rec-rules">
              {reachOutRuleLines().map((line) => (
                <li key={line}>
                  <Icon name="check" size={12} />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
        </RecordSheet>
      ) : null}
    </>
  );
}

export function KeptCard({ canEdit }: { canEdit: boolean }) {
  return (
    <section className="rec-card" data-testid="rec-card-kept">
      <RulesRow />
      <ToldRow canEdit={canEdit} />
    </section>
  );
}
