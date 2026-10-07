/**
 * The key an appointment from the owner's calendar is kept under (decision 0002): the event's own UID, and for one
 * occurrence of a repeating event the UID with the occurrence's original start, which is what a moved occurrence's
 * RECURRENCE-ID names, so a moved appointment is the same row moved and never a new one. An event with no UID (the
 * format requires one; a hand-written feed may not have it) is keyed by its start alone.
 *
 * Apart from appointments.ts so calendar-people.ts can give a visit its key without importing what reads people.
 */
import type { FeedItem } from "./feed";

export function appointmentKeyOf(item: Pick<FeedItem, "uid" | "start" | "occurrence">): string {
  if (!item.uid) return `ev:${item.start}`;
  return item.occurrence === undefined ? item.uid : `${item.uid}:${item.occurrence}`;
}
