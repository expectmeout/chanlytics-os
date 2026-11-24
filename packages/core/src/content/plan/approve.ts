/**
 * What approving a week takes (00706, the content loop PRD's 6.2 and 8.4; 00712, 12.4): every slot that is ready, each
 * held to the checks a press is held to before the week is approved, the reason it was made for first. A slot one
 * refuses is left out of the approval and said in words; the rest go under one snapshot of what the door holds of each
 * slot: by id, where, as what, when, from which footage, and why. The owner's press (the dashboard) and a rung's job at a
 * held week's time (the edge) ask it here, so a week AI approves is the week the owner's press would have approved.
 */
import { goodUntilOf, type PlanSlotDto } from "@chanlytics/contracts";
import { evaluate, verdictWords } from "../policy/evaluate";

/** A slot's reason, asked before the week is approved (PRD 6.2, the owner approves): what refuses it, in words, or null. */
function slotRefusal(slot: PlanSlotDto, zone: string, nowMs: number): string | null {
  const verdict = evaluate({
    reason: {
      intent: slot.intent,
      goodUntil: goodUntilOf(slot.intent, zone),
      atMs: Date.parse(slot.at),
      nowMs,
      zone,
      says: [],
      services: [],
      facts: [],
      opportunities: null,
      moment: "before",
    },
  });
  return verdict.ok ? null : verdictWords(verdict);
}

/** What the approval holds of each slot, as the door holds it: by id, where, as what, when, from which footage, and why. */
type SlotApproved = Pick<PlanSlotDto, "id" | "place" | "kind" | "at" | "file_id" | "title" | "intent">;

/** A week's approval as it would be taken now: the slots that go, those left out with why, and the snapshot. */
export interface WeekApproval {
  going: PlanSlotDto[];
  leftOut: { id: string; why: string }[];
  snapshot: { slots: SlotApproved[] };
}

/** The week's approval from its slots, in the business's zone, at a moment. */
export function weekApprovalOf(slots: readonly PlanSlotDto[], zone: string, nowMs: number): WeekApproval {
  const ready = slots.filter((slot) => slot.state === "proposed");
  const leftOut = ready.flatMap((slot) => {
    const refusal = slotRefusal(slot, zone, nowMs);
    return refusal ? [{ id: slot.id, why: refusal }] : [];
  });
  const going = ready.filter((slot) => !leftOut.some((left) => left.id === slot.id));
  const snapshot = {
    slots: going.map(({ id, place, kind, at, file_id, title, intent }) => ({
      id,
      place,
      kind,
      at,
      file_id,
      title,
      intent,
    })),
  };
  return { going, leftOut, snapshot };
}
