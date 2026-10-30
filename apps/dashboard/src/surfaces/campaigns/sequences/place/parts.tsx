/**
 * A lead's place, said and decided the same in every window (the canvas's "One place, two windows", 18 Oct 2026): the word
 * beside a name and its line (PlaceWord: Leads' cell, the lead sheet's head, the picker), a held email's choices by why it
 * was held (HeldChoices: the record's Leads tab, the sheet's dock), and the read of one lead's place both windows share
 * (useLeadPlace, GET leads/:id/place, cached as the record's reads are). Every press is the sequence's own verb through
 * `pressed`, so the receipt and the undo are one wherever it was pressed.
 */
import { useState } from "react";
import {
  heldChoicesOf,
  placeWordOf,
  type HoldDoor,
  type SequencePlaceRowDto,
  type SequenceState,
} from "@chanlytics/contracts";
import { Button } from "../../../kit/button/button";
import { StatePill } from "../../../kit/pill/state-pill";
import { canDo, gate } from "../../../legacy-verbs";
import type { LegacyFlash } from "../../../legacy-verbs";
import { useSequenceRead } from "../use-record";
import { pressed, sequenceVerbs as verbs } from "../verbs";

type Flash = (flash: LegacyFlash) => void;

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

/** What a held email's choice presses: the send, its batch, the lead's name and the sequence it is in. */
interface HeldEmail {
  sendId: string;
  batchId: string | null;
  hold: string | null;
  /** The step it is, from 1: Skip this email from step 2. */
  place: number | null;
  name: string;
}

/**
 * A held email's choices (contracts heldChoicesOf: by why it was held, Skip from step 2), each the decide verb the record
 * and Sent press: Send anyway, Rewrite the opening, Skip this email, Not a fit. The first is the primary where they
 * stand in a dock (`dock`); a row's are quiet. A member who may not decide sees none.
 */
export function HeldChoices(p: {
  held: HeldEmail;
  flash: Flash;
  onDecided: () => void;
  dock?: boolean;
  busy?: boolean;
  testid?: string;
}) {
  const [busy, setBusy] = useState<HoldDoor | null>(null);
  if (!canDo("approve")) return null;
  const choices = heldChoicesOf(p.held.hold, p.held.place);
  const decide = async (door: HoldDoor) => {
    setBusy(door);
    await pressed(
      "sequence_send_decide",
      { send_id: p.held.sendId, decision: door, name: p.held.name, run_id: p.held.batchId },
      p.flash,
      p.onDecided,
    );
    setBusy(null);
  };
  // In a dock the primary stands last, as every dock's does: the first choice the hold offers.
  const order = p.dock ? [...choices.slice(1), ...choices.slice(0, 1)] : choices;
  return (
    <span className={p.dock ? "lw-held" : "lw-held is-row"} data-testid={p.testid ?? "held-choices"}>
      {order.map(([door, words], i) => (
        <Button
          key={door}
          size={p.dock ? undefined : "sm"}
          variant={p.dock && i === order.length - 1 ? "primary" : p.dock ? "secondary" : "quiet"}
          disabled={busy !== null || !!p.busy}
          aria-busy={busy === door || undefined}
          onClick={() => void decide(door)}
          data-testid={`held-${door}`}
          {...gate("approve", "decide a held email")}
        >
          {words}
        </Button>
      ))}
    </span>
  );
}

/** One lead's place (GET leads/:id/place): painted from the last answer this tab holds, read again behind, and after a press. */
export function useLeadPlace(leadId: string | null, again: number) {
  const read = useSequenceRead(leadId, verbs.place, verbs.peekPlace, { again });
  return read.state === "read" ? { read: true, place: read.data } : { read: false, place: null };
}
