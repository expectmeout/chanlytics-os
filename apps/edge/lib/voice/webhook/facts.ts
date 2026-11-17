/**
 * The facts the call webhook's plan is handed that only the door can read (call-event.ts planCallEvent is pure): the
 * prices the receptionist may say on the call, and what is known of the caller. Moved out of call-webhook.ts, which is
 * the wire, as that module reached its length (17 Nov 2026). Neither read fails a delivery: each has an answer that
 * leaves the plan as strict, or as generous, as it was without it. With them, the one step of the plan that keeps a
 * call on the ledger (noteScreened, decision 0137).
 */
import type { NormalizedCall } from "@chanlytics/channels/voice";
import { callerStandingOf, priceAllowance, spokenBreach, type CallerStanding } from "@chanlytics/contracts";
import type { RoutedChannel } from "@chanlytics/db/channels";
import { emitEvent } from "@chanlytics/db/events";
import { findCallerFacts, type IngestCallResult } from "@chanlytics/db/voice";
import { logAndGoOn, logKeptGoing } from "@chanlytics/log";
import type { CallStep } from "../call-event.js";
import { logger } from "../../shared/log.js";
import type { pg } from "../../shared/pg.js";
import { loadTenantRuntime } from "../../shared/tenant-runtime.js";

type Db = NonNullable<ReturnType<typeof pg>>;

/**
 * The prices the receptionist may say on this call (contracts priceAllowance), read only when the turns name one:
 * a strict check that finds nothing has nothing an allowance could change, and a warm runtime read still costs a stamp
 * round trip on every delivery. A workspace that cannot be read is strict, never a failed delivery (decision 0051).
 * Read at the call's start, where its prompt was composed (call-start.ts): a call that runs past midnight on an offer's
 * last day is judged by what the caller's receptionist was told, the offer's note and its price included.
 */
export async function readPricesAllowed(
  db: Db,
  routed: RoutedChannel,
  call: NormalizedCall,
): Promise<ReadonlySet<string> | null> {
  if (!spokenBreach(call.transcriptObject, null)) return null;
  try {
    const rt = await loadTenantRuntime(db, routed);
    const composedAt = call.startedAtIso ? new Date(call.startedAtIso) : new Date();
    return rt.loadFailed ? null : priceAllowance(rt.brain, rt.timezone, composedAt);
  } catch (e) {
    logKeptGoing("a call's allowance", e);
    return null;
  }
}

/**
 * What is known of the caller (contracts callerStandingOf over db findCallerFacts, decision 0136), read for a customer's
 * call as it ends and as it is analysed, the two deliveries that can ask a person for a call back. Null for any other
 * delivery, for a call with no thread, and where the read failed, which is logged: the call then asks as it always did,
 * since a customer's call is never dropped by a read that did not answer.
 */
export async function readCallerStanding(
  db: Db,
  routed: RoutedChannel,
  event: string | undefined,
  normalizedCall: NormalizedCall,
  res: IngestCallResult,
): Promise<CallerStanding | null> {
  const settles = event === "call_ended" || event === "call_analyzed";
  if (!settles || normalizedCall.direction !== "inbound" || res.skipped || !res.conversation_id) return null;
  return findCallerFacts(db, routed.tenantId, res.conversation_id)
    .then(callerStandingOf)
    .catch(logAndGoOn("reading what is known of a caller", null));
}

/**
 * A call that would have asked a person for a call back and asks nobody (the plan's `screened` step), said in the log
 * as it always was (call_back_not_owed) and kept on the ledger as `call.screened` (contracts voice/screened.ts), which
 * Reports counts. The event is best effort, as every event is: a row that could not be written is logged.
 */
export async function noteScreened(
  db: Db,
  routed: RoutedChannel,
  screened: Extract<CallStep, { kind: "screened" }>,
): Promise<void> {
  logger().info("call_back_not_owed", { call_id: screened.retellCallId, why: screened.reason });
  await emitEvent(db, routed.tenantId, "call.screened", "conversation", screened.conversationId, {
    reason: screened.reason,
    call_id: screened.retellCallId,
  });
}
