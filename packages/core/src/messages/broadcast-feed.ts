/**
 * A visit run's reminder asks again before it goes: the record of the appointment (decision 0002) and the owner's calendar
 * feed (S1-05).
 *
 * The record is only as new as the hourly sweep: a visit cancelled in the owner's own calendar and nowhere else is `booked` on
 * it until the sweep marks it vanished, so a reminder that goes within that hour would still go. The feed drops a cancelled
 * event at once, and the edge keeps it five minutes (BroadcastBatchPorts.feed), so a batch asks it once beside the record,
 * and a person whose visit the feed no longer names is held (broadcast.ts sendOne: `appointment_changed`).
 */
import {
  appointmentHolds,
  appointmentKeysOf,
  asksTheFeed,
  feedStillNames,
  type AppointmentState,
} from "@chanlytics/contracts";
import { errField, logger } from "@chanlytics/channels";
import { rowFacts, type Work } from "./broadcast-channels";
import type { BroadcastBatchPorts, BroadcastRow, RecipientRow } from "./ports";

const askLog = logger();

/**
 * The appointments the batch's reminders were drawn for (decision 0002), one read for all of them. A read that fails is
 * none, said in the log: the people go as they did before the record, never held for a read this run could not make.
 */
export async function appointmentsOf(
  ports: BroadcastBatchPorts,
  b: BroadcastRow,
  batch: readonly RecipientRow[],
): Promise<ReadonlyMap<string, AppointmentState>> {
  const keys = appointmentKeysOf(batch);
  if (!ports.appointments || keys.length === 0) return new Map();
  return ports.appointments(keys).catch((e: unknown) => {
    askLog.warn("broadcast_appointments_unread", { broadcast_id: b.id, error: errField(e) });
    return new Map<string, AppointmentState>();
  });
}

/**
 * What the owner's calendar feed names now, asked once for the batch when a reminder in it was drawn for a calendar event.
 * Null where nothing in the batch needs it, the runtime keeps no feed or the workspace has none. A feed that cannot be read
 * is "unread", said in the log: a reminder for a calendar event whose standing is not known waits for the next batch
 * (visitStands), as every read the send cannot make does, rather than going for a visit that may be gone.
 */
export async function feedOf(
  ports: BroadcastBatchPorts,
  b: BroadcastRow,
  batch: readonly RecipientRow[],
): Promise<Work["feed"]> {
  if (!ports.feed || !batch.some((r) => asksTheFeed(rowFacts(r)))) return null;
  return ports.feed().catch((e: unknown) => {
    askLog.warn("broadcast_feed_unread", { broadcast_id: b.id, error: errField(e) });
    return "unread" as const;
  });
}

/**
 * Whether the visit this recipient's reminder was drawn for still stands, asked at the send: the record's word first
 * (contracts appointmentHolds: a visit moved, cancelled or missed holds the person), then the owner's calendar feed, which is
 * newer than the record by up to the hourly sweep (contracts feedStillNames: a calendar event the feed no longer names is
 * gone, though the record still says booked). A recipient drawn for no calendar event, and a workspace with no feed, go on the
 * record alone. THROWS when the feed could not be read and the reminder needs it: the batch's per-person guard leaves such a
 * person queued for the next batch (fail closed per person), never skipped for a read the run could not make.
 */
export function visitStands(w: Work, r: RecipientRow): boolean {
  const facts = rowFacts(r);
  if (!appointmentHolds(w.appointments, facts)) return false;
  if (!w.feed || !asksTheFeed(facts)) return true;
  if (w.feed === "unread")
    throw new Error("the calendar feed could not be read; the reminder waits for the next batch");
  return feedStillNames(w.feed, facts);
}
