/**
 * The calendar sweep: every hour, every workspace with a calendar connected
 * has the people its appointments name put in People — a phone in the
 * event is the key, the name as the event gives it, consent untouched.
 *
 * The same read the receptionists use (one fetch per five minutes, parsed
 * once), the same pure extraction the dashboard applies when an owner opens
 * the Calendar, so a person is created once whichever path saw them first.
 * The same appointments' addresses and numbers go to the booking door, which
 * stops a reach-out to a business that booked after it was written to.
 *
 * Auth: x-cron-key against the Vault-held sweep key, like the other sweeps;
 * pg_cron calls this from the database.
 */
import { json, refuse } from "../../lib/http.js";
import { authorizeCron } from "../../lib/cron-auth.js";
import { pg } from "../../lib/pg.js";
import { logger } from "../../lib/log.js";
import { calendarDue, markCalendarChecked, noteBacklog, CALENDAR_PER_TICK } from "../../lib/ops/sweep-rotation.js";
import { feedItemsFor } from "../../lib/calendar/availability.js";
import { addPeopleFromCalendar } from "../../lib/calendar/calendar-people.js";
import { bookedFromCalendar } from "../../lib/calendar/reach-out-booked.js";
import { recordNotification } from "../../lib/ops/notify.js";
import { ownAddressesOf, parseTenantConfig, peopleFromItems } from "../../lib/packages/contracts.js";

export async function POST(request: Request): Promise<Response> {
  const L = logger({ sweep: "calendar" });
  const db = pg();
  if (!db) return refuse(503, "no_database");
  const denied = await authorizeCron(request, db, L);
  if (denied) return denied;

  const now = new Date();
  // A BOUNDED, ROTATING page OF WHAT IS DUE rather than every row, judged in
  // the database (00193 calendars_due): a feed's address on the row, never
  // read or not read this hour, the never-read first. This read every config
  // and then fetched a feed per workspace, serially, inside a sixty-second
  // function -- so past a few hundred tenants it ran out of tick part way
  // through, and since the order never changed the same early workspaces were
  // served every hour while the rest were never served at all. `remaining` is
  // exactly the due feeds beyond the page, and nothing that is not a feed.
  let page;
  try {
    page = await calendarDue(db, now, CALENDAR_PER_TICK);
  } catch (e) {
    L.error("calendar_configs_read_failed", { error: e instanceof Error ? e.message : String(e) });
    return json(500, { ok: false });
  }

  const out = { tenants: 0, seen: 0, added: 0, named: 0, emailed: 0, booked: 0, failed: 0, remaining: page.remaining };
  for (const row of page.rows) {
    const cfg = parseTenantConfig(row.config);
    const url = cfg?.calendar?.ical_url ?? null;
    if (!url) continue;
    out.tenants += 1;
    try {
      // The zone comes with the page (00193): the workspace's own, UTC when that is a name nobody knows.
      const tz = row.timezone;
      const items = await feedItemsFor(
        row.tenant_id,
        url,
        tz,
        now,
        cfg?.brain?.profile?.booking_rules?.max_days_ahead ?? 14,
      );
      if (!items) {
        out.failed += 1;
        continue;
      }
      const people = peopleFromItems(
        items,
        (cfg?.brain?.profile?.services ?? []).map((s) => s.name),
        now.getTime(),
      );
      const r = await addPeopleFromCalendar(db, row.tenant_id, people);
      out.seen += r.seen;
      out.added += r.added;
      out.named += r.named;
      out.emailed += r.emailed;
      out.booked += await bookedFromCalendar(db, row.tenant_id, items, ownAddressesOf(cfg));
      // Stamped only on SUCCESS. A failure leaves the row due, so the next tick
      // retries it instead of skipping a workspace for an hour because its feed
      // was briefly unreachable.
      await markCalendarChecked(db, row.tenant_id, now);
      if (r.added || r.named || r.emailed) L.info("calendar_people_added", { tenant_id: row.tenant_id, ...r });
      // A row on the bell, not an email: people arriving is good news, not an alarm.
      if (r.added)
        await recordNotification(row.tenant_id, {
          kind: "calendar_people",
          title: `${r.added} ${r.added === 1 ? "person" : "people"} added from your calendar`,
          body: `${r.added === 1 ? "An appointment" : "Appointments"} on your calendar carried a phone number nobody in People had. ${r.added === 1 ? "They are" : "They are all"} in People now, with consent unknown.`,
          route: "clients",
        });
    } catch (e) {
      out.failed += 1;
      L.error("calendar_sweep_failed", { tenant_id: row.tenant_id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  const backlog = await noteBacklog(db, "calendar", page.remaining);
  L.info("calendar_sweep", { ...out, backlog_ticks: backlog.ticks });
  // One tick with work left over is the cap doing its job. Three in a row is
  // the queue growing faster than this sweep drains it, which sweep_health
  // turns red and mails -- a capacity fact a person has to hear before a
  // customer notices the receptionist offering times that are already taken.
  if (backlog.alarm) {
    return json(503, { ok: false, error: "calendar_backlog", backlog_ticks: backlog.ticks, ...out });
  }
  return json(200, { ok: true, ...out });
}
