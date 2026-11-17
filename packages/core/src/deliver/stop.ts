/**
 * Stop everything, at the send door (deliver.ts). Why a workspace sends nothing by itself is said once here: billing
 * paused it (`tenants.status`), or its owner pressed Stop everything (`tenants.sending_stopped_at`). Either way a
 * person's own reply still goes. The two differ in what follows. Billing's pause refuses and cancels what it meets,
 * since nobody knows when it ends. A stop lets the words the rules require through (a STOP's confirmation), and HOLDS
 * what was going out by itself, to go once sending is resumed. Pure, so the door reads one answer.
 */
import type { DeliveryRefusal, SendPurpose } from "@chanlytics/contracts";

type SendingHold = "paused" | "stopped";

/**
 * The hold a workspace's row says, or null: its status, and when sending was stopped where the read asked for it.
 * Billing's pause is said first where both stand: resuming sending starts nothing while billing is paused.
 */
export function sendingHoldOf(
  row: { status?: string | null; sending_stopped_at?: string | null } | null | undefined,
): SendingHold | null {
  if (row?.status === "paused") return "paused";
  return row?.sending_stopped_at ? "stopped" : null;
}

/**
 * What a hold refuses of a send that is no person's own reply (the door passes that before it asks): billing's pause
 * everything, a stop everything but the words the rules require of us (`system`: a STOP's confirmation is owed whatever
 * the owner stopped).
 */
export function sendingRefusal(hold: SendingHold | null, kind: string): "paused" | "stopped" | null {
  if (hold === "paused") return "paused";
  return hold === "stopped" && kind !== "system" ? "stopped" : null;
}

/** Whether a send that names its own last moment (the job's `stale_after`, 0089, epoch ms) is past it. */
const pastItsTime = (staleAfter: number | undefined, nowMs: number): boolean =>
  staleAfter !== undefined && Number.isFinite(staleAfter) && nowMs > staleAfter;

/**
 * A send the door refused. `held`: Stop everything holds it. Nothing was canceled and nothing written, its queued row is
 * still queued, and the caller leaves its work waiting for the day sending is resumed.
 */
export interface Refused {
  outcome: "refused";
  reason: DeliveryRefusal;
  messageId: string | null;
  held?: true;
}

/** The door's answer for a send Stop everything holds. */
export const heldRefusal = (messageId: string | null | undefined): Refused => ({
  outcome: "refused",
  reason: "stopped",
  messageId: messageId ?? null,
  held: true,
});

/** What of a send the stop asks: its purpose, whether it starts a conversation, and its last moment. */
interface Stopped {
  purpose: SendPurpose;
  proactive: boolean;
  staleAfter?: number;
}

/**
 * The door's refusal once Stop everything is asked: `held`, or the refusal to act on. What was going out by itself (a
 * campaign's send, a sequence's message to one person: a broadcast, or anything proactive) is `held`: nothing is
 * canceled, so it goes by itself once sending is resumed; unless its own time has passed, when it is `too_late` as it
 * would be with no stop. A reply somebody is waiting for (the receptionist's answer, its queued draft) stays `stopped`:
 * the door refuses it as it refuses any other, its row canceled with the reason and its words kept for a person to
 * send. So does a cold email: its clock plans a send again only from a row the door canceled with a wait (contracts
 * OUTREACH_WAIT_REFUSALS), as it does for billing's pause. Any other refusal passes through as it came.
 */
export function stopOf(
  send: Stopped,
  kind: string,
  refusal: DeliveryRefusal | null,
  nowMs: number,
): DeliveryRefusal | "held" | null {
  if (refusal !== "stopped" || send.purpose === "outreach") return refusal;
  if (kind !== "broadcast" && !send.proactive) return refusal;
  return pastItsTime(send.staleAfter, nowMs) ? "too_late" : "held";
}
