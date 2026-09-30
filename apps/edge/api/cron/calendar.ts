/**
 * The calendar sweep: every hour, a bounded page of the workspaces with a calendar connected has the people its
 * appointments name put in People -- a phone in the event is the key, the name as the event gives it, consent
 * untouched.
 *
 * The page is only what is due, judged in the database (00245 calendars_due, through calendarDue in
 * lib/ops/sweep-rotation.ts): CALENDAR_PER_TICK workspaces whose settings carry a feed address
 * (config.calendar.ical_url), the never-read first, then the least recently read, none read again within calendarDue's
 * minAgeMs. Each feed is read as the receptionists read it (feedItemsFor: one fetch per five minutes, parsed once) in
 * the workspace's own zone, and the same pure extraction the dashboard applies when an owner opens the Calendar
 * (peopleFromItems) picks the people, so a person is created once whichever path saw them first. addPeopleFromCalendar
 * gets or creates by phone: a name fills only an empty one, an address only where there is none, someone who asked to
 * be erased is not brought back by their own appointment, and each person made gets a `contact.added` event that says
 * where they came from. The owner hears it as a row on the bell (kind calendar_people), never as a mail. The same
 * appointments' addresses and numbers go to the booking door (bookedFromCalendar, reach_out_booked, 00227), which
 * stops a reach-out to a business that booked after it was written to; if the door fails that is logged and counts
 * nothing, and People has been filled all the same.
 *
 * A workspace read is stamped (markCalendarChecked, tenant_config.calendar_checked_at). So is one that could not be
 * read (a feed that fails, settings that do not parse, no address, a throw): it is retried next hour, behind the feeds
 * that can be read, instead of holding the first place of the page every hour.
 *
 * `remaining` is the due feeds beyond the page. noteBacklog (note_sweep_backlog, 00089) counts the ticks in a row that
 * left some; at BACKLOG_TICKS_BEFORE_ALARM the sweep still does its tick and answers 503 (calendar_backlog), which
 * sweep_health() reads and the health sweep mails to the platform: a queue growing faster than this drains it. A page
 * that cannot be read is a 500 (an edge deployed ahead of 00245 is loud, not quiet).
 *
 * Called by pg_cron at :23 ('calendar-people-sweep', 00053) through trigger_calendar_sweep (request_sweep, 00086),
 * with the Vault sweep key in x-cron-key (authorizeCron). The request is recorded in sweep_status and sweep_health()
 * judges the answer (registered in 00107). Its lines carry `sweep: "calendar"` and, per workspace, `tenant_id`; the
 * tick ends in one calendar_sweep with the counts.
 */
import { json, refuse } from "../../lib/http.js";
import { authorizeCron } from "../../lib/cron-auth.js";
import { pg } from "../../lib/pg.js";
import { logger, door } from "../../lib/log.js";
import { calendarDue, markCalendarChecked, noteBacklog, CALENDAR_PER_TICK } from "../../lib/ops/sweep-rotation.js";
import { feedItemsFor } from "../../lib/calendar/availability.js";
import { addPeopleFromCalendar } from "../../lib/calendar/calendar-people.js";
import { bookedFromCalendar } from "../../lib/calendar/reach-out-booked.js";
import { recordNotification } from "../../lib/ops/notify.js";
import { ownAddressesOf, parseTenantConfig, peopleFromItems } from "../../lib/packages/contracts.js";

export const POST = door(async function POST(request: Request): Promise<Response> {
  const L = logger({ sweep: "calendar" });
  const db = pg();
  if (!db) return refuse(503, "no_database");
  const denied = await authorizeCron(request, db, L);
  if (denied) return denied;

  const now = new Date();
  // A BOUNDED, ROTATING page OF WHAT IS DUE rather than every row, judged in
  // the database (00245 calendars_due): a feed's address on the row, never
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
    // A feed that could not be read, or a configuration that does not parse, is stamped as tried: retried the next
    // hour (the page's own gap), behind the feeds that can be read. Unstamped it kept the first place every hour, and
    // forty dead feeds held the page for every workspace.
    const tried = () => markCalendarChecked(db, row.tenant_id, now).catch(() => undefined);
    const cfg = parseTenantConfig(row.config);
    const url = cfg?.calendar?.ical_url ?? null;
    if (!url) {
      await tried();
      continue;
    }
    out.tenants += 1;
    try {
      // The zone comes with the page (00245): the workspace's own, UTC when that is a name nobody knows.
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
        await tried();
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
      await tried();
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
});
