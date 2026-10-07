/**
 * Appointments from the calendar (decision 0002): each hour's read of a workspace's feed is kept as its appointments,
 * so a send can ask whether the appointment it was drawn for still stands, and the record outlives the read.
 *
 * The rows are contracts' (feedAppointmentRows): every event the read names inside the season it covers (seasonHorizon:
 * ninety days back, and forward as far as the workspace books or ninety days), keyed as the calendar keeps it
 * (appointmentKeyOf), matched to the person the board would name (a number in the event, then an address, then a whole
 * name, against everyone in People now, after this sweep put the calendar's new people there), with the service its
 * title names and whether it is a consultation. The database keeps them in one transaction per workspace
 * (appointments_feed_sync, 00348): inserted or moved by key, a row the read no longer names vanished, never cancelled,
 * and never its title. A read that could not be made never reaches here, so it vanishes nothing.
 *
 * The match reads the whole of People and asks each event of it, as the board does when it opens; at a workspace's size
 * today that is the cost of one page of People an hour.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { everyoneIn, syncFeedAppointments, type AppointmentSync, type Database } from "../packages/db.js";
import {
  feedAppointmentRows,
  ownAddressesOf,
  personLikeOf,
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
  const people = (await everyoneIn(db, tenantId)).map(personLikeOf);
  const window = seasonHorizon(o.now, o.daysAhead);
  const profile = o.cfg?.brain?.profile;
  const rows = feedAppointmentRows(items, {
    people,
    own: ownAddressesOf(o.cfg),
    services: profile?.services ?? [],
    rules: profile?.booking_rules ?? null,
    window,
  });
  return syncFeedAppointments(db, {
    tenantId,
    timezone: o.timezone,
    rows,
    window: { from: new Date(window.from), to: new Date(window.to) },
    now: o.now,
  });
}
