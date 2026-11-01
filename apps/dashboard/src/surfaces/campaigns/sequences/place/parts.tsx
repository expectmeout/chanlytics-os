/**
 * A lead's place, said the same in every window (the canvas's "One place, two windows", 18 Oct 2026): the word beside a
 * name and its line (PlaceWord: Leads' cell and the picker), and the read of one lead's place both windows share
 * (useLeadPlace, GET leads/:id/place, cached as the record's reads are).
 */
import { placeWordOf, type SequencePlaceRowDto, type SequenceState } from "@chanlytics/contracts";
import { StatePill } from "../../../kit/pill/state-pill";
import { useSequenceRead } from "../use-record";
import { sequenceVerbs as verbs } from "../verbs";

/** The word beside a name and the line under it, in the place's tone: amber needs you, green while in it, plain once over. */
export function PlaceWord(p: {
  place: Pick<SequencePlaceRowDto, "group" | "place" | "at" | "why">;
  sequence: { name: string; state: SequenceState };
  tz: string;
  /** Leads' cell names the sequence in the word; the sheet's head, which says it below, does not. */
  named?: boolean;
  /** The line under the word, where there is room for it. */
  line?: boolean;
  testid?: string;
}) {
  const w = placeWordOf(p.place, p.sequence, { tz: p.tz, nowMs: Date.now() }, p.named ?? true);
  return (
    <span className="lw-place" data-testid={p.testid ?? "place-word"}>
      <StatePill kind="tone" value={w.tone} label={w.word} />
      {p.line !== false && w.line ? <span className="lw-place-l">{w.line}</span> : null}
    </span>
  );
}

/** One lead's place (GET leads/:id/place): painted from the last answer this tab holds, read again behind, and after a press. */
export function useLeadPlace(leadId: string | null, again: number) {
  const read = useSequenceRead(leadId, verbs.place, verbs.peekPlace, { again });
  return read.state === "read" ? { read: true, place: read.data } : { read: false, place: null };
}
