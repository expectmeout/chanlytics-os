/**
 * What the calendar sweep hands the booking door (Reach out Part 5, PR 9; G19, N3): every address and number the
 * feed's appointments carry, each with when its appointment starts. The door (00227 reach_out_booked) converts a lead a
 * reach-out wrote to whose address or number, or its person's, is one of them, on an appointment starting after an
 * email of the reach-out left. The extraction is the one People's import runs (extractContacts), here for every item,
 * not only those with one number.
 */
import type { FeedItem } from "../calendar/availability";
import { extractContacts, type OwnAddresses } from "../calendar/calendar-people";

/** One address or number an appointment carries, and when it starts (ISO). A type, not an interface, so it is JSON to the rpc. */
export type BookedSeen = {
  email?: string;
  phone?: string;
  start: string;
};

/** The most a workspace's feed hands the door in one tick; the door reads no more than this either. */
export const BOOKED_SEEN_CAP = 500;

/**
 * The feed's contacts for the booking door: each address and each number of each appointment, the business's own and
 * the organiser's left out as People's import leaves them, the earliest appointments first, at most `BOOKED_SEEN_CAP`.
 */
export function bookedSeenOf(items: readonly FeedItem[], own: OwnAddresses): BookedSeen[] {
  const out: BookedSeen[] = [];
  const byStart = [...items].sort((a, b) => a.start - b.start);
  for (const it of byStart) {
    const c = extractContacts(it, own);
    const start = new Date(it.start).toISOString();
    for (const email of c.emails) out.push({ email, start });
    for (const phone of c.phones) out.push({ phone, start });
    if (out.length >= BOOKED_SEEN_CAP) break;
  }
  return out.slice(0, BOOKED_SEEN_CAP);
}
