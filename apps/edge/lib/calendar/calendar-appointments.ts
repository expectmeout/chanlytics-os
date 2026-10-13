/**
 * Appointments from the calendar (decision 0002): each hour's read of a workspace's feed is kept as its appointments,
 * so a send can ask whether the appointment it was drawn for still stands, and the record outlives the read.
 *
 * The rows are contracts' (feedAppointmentRows): every event the read names inside the season it covers (seasonHorizon:
 * ninety days back, and forward as far as the workspace books or ninety days), keyed as the calendar keeps it
 * (appointmentKeyOf), matched to the person the board would name (a number in the event, then an address, then a whole
 * name, against everyone in People now, after this sweep put the calendar's new people there), with the service its
 * title names and whether it is a consultation; and what the bell asks of an addition (00419): whether it is one
 * occurrence of a repeating event, and whether it is the calendar's copy of a booking the record holds from its tool
 * (contracts booking-notice.ts, against the booking rows over the same season). The database keeps them in one transaction
 * per workspace (appointments_feed_sync, 00348): inserted or moved by key, a row the read no longer names vanished, never
 * cancelled, and never its title. A read that could not be made never reaches here, so it vanishes nothing.
 *
 * The match reads the whole of People and asks each event of it, as the board does when it opens; at a workspace's size
 * today that is the cost of one page of People an hour, and the season's bookings one read beside it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { everyoneIn, notedOver, syncFeedAppointments, type AppointmentSync, type Database } from "../packages/db.js";
import {
  feedAppointmentRows,
  ownAddressesOf,
  personLikeOf,
  sightingStands,
  seasonHorizon,
  type FeedItem,
  type TenantConfig,
} from "../packages/contracts.js";

export async function keepAppointments(
  db: SupabaseClient<Database>,
  tenantId: string,
  items: readonly FeedItem[],
  o: { timezone: string; cfg: TenantConfig | null; daysAhead: number; now: Date },
): Promise<AppointmentSync> {
  const window = seasonHorizon(o.now, o.daysAhead);
  const [everyone, bookings] = await Promise.all([
    everyoneIn(db, tenantId),
    notedOver(db, tenantId, new Date(window.from).toISOString(), new Date(window.to).toISOString()),
  ]);
  const profile = o.cfg?.brain?.profile;
  const rows = feedAppointmentRows(items, {
    people: everyone.map(personLikeOf),
    own: ownAddressesOf(o.cfg),
    services: profile?.services ?? [],
    rules: profile?.booking_rules ?? null,
    window,
    // Only a booking that stands has a copy (sightingStands): a visit cancelled at that time and booked again is a booking
    // of its own.
    bookings: bookings.filter(sightingStands),
  });
  return syncFeedAppointments(db, {
    tenantId,
    timezone: o.timezone,
    rows,
    window: { from: new Date(window.from), to: new Date(window.to) },
    now: o.now,
  });
}
