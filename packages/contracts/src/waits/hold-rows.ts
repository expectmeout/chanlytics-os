/**
 * One row for one hold on the bell (decision 0048; the wiring blueprint's OW5).
 *
 * A customer who needs a person is two rows when the bell is made: one the browser derives from the Inbox's threads
 * (words and a door as live as the thread), and one the edge kept when it handed the customer over (the same fact, on the
 * server). `dedupeFeed` already hid the kept row while the derived one stands, because they said the same thing twice in two
 * voices. What it left apart was their marks: the derived row's read mark was this device's, so an owner who read it on the
 * laptop saw it unread on the phone, and the two devices' badges differed until the thread was answered. Where a kept notice
 * of the hold exists, the row is one and its marks are the server's: read, dismissed and the seen moment, the same on every
 * device. Where none exists yet, the derived row keeps this device's, as it did.
 */
import {
  applyReadState,
  conversationOfNeedsKey,
  dedupeFeed,
  serverNotificationRows,
  type NotificationDto,
  type NotificationItem,
  type NotificationReadState,
  type NotificationRow,
  type NotificationsDto,
} from "../today/notifications";
import { olderUnreadOf } from "../today/push";
import { closeSettledNotices, kindsEndedBy, NOTHING_WAITS_KNOWN, type WhatWaits } from "./notice-closes";

/** The key a derived invitation row is made with (notifications.ts buildNotificationFeed): this prefix plus the invitation's id. */
const INVITE_KEY_PREFIX = "invite:";

/**
 * The invitations the bell's kept rows say were accepted (`member_joined`, about the invitation): the derived "Invitation
 * pending" row for one of them is false from then on, whatever the Team read the browser holds still lists (task 5.2, NS-3).
 */
function acceptedInvitations(kept: NotificationsDto | null | undefined): ReadonlySet<string> {
  return new Set(
    (kept?.notifications ?? []).flatMap((n) =>
      n.kind === "member_joined" && n.subject_type === "invitation" && n.subject_id ? [n.subject_id] : [],
    ),
  );
}

/** The kinds of kept row that tell of a hold (a handoff, the deadman's second alert, a call that needs a call back): listed once. */
const HOLD_NOTICE_KINDS: readonly string[] = kindsEndedBy("hold");

/**
 * The kept notices whose marks a derived "needs you" row carries: those of the hold on its conversation, dismissed ones
 * too. None for a derived row that is not a hold's (a held draft, a missed call, an invitation), and none before the edge
 * has kept the hold. A notice the server closed belongs to a hold that ended and lends no marks: a new hold on the same
 * thread, before its own notice is kept, would otherwise read as read (00421).
 */
export function holdMarksOf(derivedKey: string, kept: NotificationsDto | null | undefined): NotificationDto[] {
  const conversationId = conversationOfNeedsKey(derivedKey);
  if (!conversationId) return [];
  return (kept?.notifications ?? []).filter(
    (n) =>
      HOLD_NOTICE_KINDS.includes(n.kind) &&
      n.subject_type === "conversation" &&
      n.subject_id === conversationId &&
      !n.closed_at,
  );
}

/**
 * The unread kept rows the bell does not list (olderUnreadOf), less the holds it already draws: a hold whose notice is past
 * the list while its thread still waits is the bell's own derived row (one row for one hold), not a second unread row
 * (NotificationsDto.older_holds; the wiring's second audit, S6-10). The bell's number, its sentence for them and Today's
 * away card read this; the phone's icon, which counts the kept rows alone, reads olderUnreadOf.
 */
export function bellOlderOf(
  dto: NotificationsDto | null | undefined,
  seenMs: number,
  drawn: ReadonlyArray<{ key: string }>,
): number {
  const older = olderUnreadOf(dto, seenMs);
  const holds = dto?.older_holds ?? [];
  if (!older || !holds.length) return older;
  const waiting = new Set(drawn.map((r) => conversationOfNeedsKey(r.key)).filter((c): c is string => !!c));
  return Math.max(0, older - holds.filter((c) => waiting.has(c)).length);
}

/**
 * The bell's rows: what the browser derives beside what the workspace keeps, once each. A derived "needs you" row whose
 * hold the edge has kept takes its marks from the kept notice, so it is unread until the owner reads it on any device (or
 * has seen everything since), and gone once it is dismissed on any; every other derived row keeps this device's marks, which
 * is the only place a row nothing stores can keep them. `device.seenAt` is the later of this device's seen moment and the
 * server's, so a Mark all read just made counts before the re-read lands.
 *
 * A kept row that announced a wait reads as read once what it announced is settled (`waits`, notice-closes.ts: a run approved
 * or skipped, a booking email dismissed or read again, a review answered), and the derived "Invitation pending" row of an
 * invitation a kept row says was accepted is gone. `waits` is what the surfaces hold of those subjects, none before they are read.
 */
export function bellFeed(input: {
  derived: readonly NotificationItem[];
  device: NotificationReadState;
  kept: NotificationsDto | null | undefined;
  waits?: WhatWaits;
}): NotificationRow[] {
  const { device, kept } = input;
  const seenMs = Math.max(device.seenAt, (kept?.seen_at ? Date.parse(kept.seen_at) : 0) || 0);
  const accepted = acceptedInvitations(kept);
  const own: NotificationRow[] = [];
  for (const item of input.derived) {
    if (item.key.startsWith(INVITE_KEY_PREFIX) && accepted.has(item.key.slice(INVITE_KEY_PREFIX.length))) continue;
    const marks = item.kind === "needs_you" ? holdMarksOf(item.key, kept) : [];
    if (marks.length === 0) {
      own.push(...applyReadState([item], device));
      continue;
    }
    // Dismissed on the server, by whichever device: the hold is not on this bell either.
    if (marks.every((n) => n.dismissed)) continue;
    own.push({
      ...item,
      unread: marks.some((n) => !n.dismissed && !n.read && Date.parse(n.created_at) > seenMs),
    });
  }
  return dedupeFeed([...own, ...closeSettledNotices(serverNotificationRows(kept), input.waits ?? NOTHING_WAITS_KNOWN)]);
}
