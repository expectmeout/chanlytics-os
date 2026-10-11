/**
 * New ad, step 1: what should people do? The three doors as rows (a 22px ring, one verb, one plain line, where it runs), one
 * chosen; under the chosen one what it needs, as dot rows with the door that fixes an amber one. The rows are the model's: they
 * are derived from the account's checks and the door's needs, never typed per example. Book online is the fourth, quiet and
 * not pressable, with its reason. Nothing here spends anything.
 */
import { Fragment } from "react";
import type { AdDoor } from "@chanlytics/contracts";
import { BOOK_ONLINE, DOOR, DOOR_ORDER, NEW_AD } from "@chanlytics/contracts/ads-page";
import { DotRows, PickRow, DoorRing, Cap } from "./new-bits";
import type { DotRow, StepProps } from "./new-bits";

/** What the chosen door needs, under its row. */
function Needs({ rows, door }: { rows: readonly DotRow[]; door: AdDoor }) {
  return (
    <div className="ads-new-needs" data-testid="ads-new-needs">
      <h4 className="ads-new-sec-k">{NEW_AD.needs}</h4>
      <DotRows rows={rows} />
      {door === "form" ? <Cap>{NEW_AD.step1.formNote}</Cap> : null}
    </div>
  );
}

export function StepDoor({ vm, state, patch }: StepProps) {
  const picked = state.draft.door;
  return (
    <div className="ads-new-doors" role="group" aria-label={NEW_AD.steps.at(0)}>
      {DOOR_ORDER.map((door) => (
        <Fragment key={door}>
          <PickRow
            chosen={door === picked}
            onPick={() => patch({ door })}
            lead={<DoorRing glyph={DOOR[door].glyph} chosen={door === picked} />}
            testid={`ads-new-door-${door}`}
          >
            <span className="ads-new-pick-verb">{DOOR[door].label}</span>
            <span className="ads-new-pick-line">{DOOR[door].line}</span>
            <span className="ads-new-pick-runs">{DOOR[door].runsOn}</span>
          </PickRow>
          {door === picked ? <Needs rows={vm.needs} door={door} /> : null}
        </Fragment>
      ))}
      <p className="ads-new-later" data-testid="ads-new-later">
        <DoorRing glyph="calendar" />
        <span className="ads-new-pick-words">
          <span className="ads-new-pick-line">{BOOK_ONLINE}</span>
        </span>
      </p>
    </div>
  );
}
