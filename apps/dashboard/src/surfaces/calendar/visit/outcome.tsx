/**
 * A word said in a visit's sheet, answered in the sheet (12 Nov 2026), as Today's row answers it. The sheet took Kept,
 * said a small grey "Kept" under the question it had just been answered, and dropped what the door said follows (which
 * sequence writes to them, and when: decisions 0119 and 0123); a Missed then led with "Ask for a new time" whatever
 * followed, so a customer a sequence was about to ask could be asked twice.
 *
 * The sheet keeps the door's answer while it stands on the visit (useVisitOutcome), every word said in it goes through
 * the one keeper (sayHere), and its foot says what the word sets going and offers the other word as the way back
 * (VisitOutcome). What it says and offers is the view model's (sheet-view.ts sheetOutcomeOf).
 */
import { useState } from "react";
import { VISIT_ASK_WORDS, type CalendarBlockVM, type VisitFollowUp, type VisitWord } from "@chanlytics/contracts";
import type { VisitCtx } from "./context";
import type { VisitSheetOutcome } from "./sheet-view";
import { LinkButton } from "../../kit/link-button/link-button";
import { gate } from "../../frame-verbs";
import { sayVisit } from "../../visit-line";

/** What the sheet keeps of a word said in it: the door's answer, and how the board's block stood when it was said. */
interface KeptOutcome extends VisitSheetOutcome {
  from: string | null;
}

/**
 * A word said in the sheet, kept while the sheet stands on its visit (the Calendar keys it by the visit). The door has
 * written it, and the board reads again behind the answer: until that read lands the block still stands as it did, so the
 * sheet draws it as it was told, and no question is asked a second time of a visit that has its answer. Once the board
 * has read, the board's word is the one drawn.
 */
export function useVisitOutcome(block: CalendarBlockVM): {
  block: CalendarBlockVM;
  outcome: VisitSheetOutcome | null;
  settle: VisitCtx["settle"];
} {
  const [outcome, setOutcome] = useState<KeptOutcome | null>(null);
  const standing = block.visit?.status ?? null;
  const settle = (word: VisitWord, follows: VisitFollowUp | null) => setOutcome({ word, follows, from: standing });
  const waits = outcome !== null && block.visit !== null && standing === outcome.from;
  return {
    block: waits && block.visit ? { ...block, visit: { ...block.visit, status: outcome.word } } : block,
    outcome,
    settle,
  };
}

/** A word said on the visit through the Calendar's one door, its answer kept for the sheet; null with no row to say it on. */
export async function sayHere(
  visitCtx: VisitCtx,
  word: VisitWord,
): Promise<Awaited<ReturnType<typeof sayVisit>> | null> {
  const mark = visitCtx.vm.line.mark;
  if (!mark) return null;
  const answer = await sayVisit(mark.id, word);
  if (answer.ok) visitCtx.settle(word, answer.follows);
  return answer;
}

/**
 * A word said in this sheet, answered where it was said: the word and what it sets going, and the other word as the way
 * back, in one press through the same door. A Kept cannot be taken back to unmarked, only changed to Missed, and a Missed
 * to Kept; a change inside the sequence's few minutes of grace takes its message back too. The way back is words that
 * press, as their name is: a button's ground under what was just said read as a second act.
 */
export function VisitOutcome({ visit }: { visit: VisitCtx }) {
  const outcome = visit.vm.outcome;
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  if (!outcome) return null;
  const change = outcome.change;
  const press = async (word: VisitWord) => {
    setBusy(true);
    setProblem(null);
    try {
      const answer = await sayHere(visit, word);
      if (answer && !answer.ok) setProblem(answer.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="cal-visit-outcome" data-testid="cal-visit-outcome">
      <p className="cal-visit-outcome-words" role="status">
        {outcome.words}
      </p>
      {change ? (
        <LinkButton
          className="cal-visit-change"
          disabled={busy}
          onClick={() => void press(change.word)}
          data-testid="cal-visit-change"
          {...gate("approve", VISIT_ASK_WORDS.gate)}
        >
          {change.label}
        </LinkButton>
      ) : null}
      {problem ? (
        <p className="cal-visit-refused" role="alert">
          {problem}
        </p>
      ) : null}
    </div>
  );
}
