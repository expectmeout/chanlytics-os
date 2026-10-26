/**
 * The calendar sweep: every hour, a bounded page of the workspaces with a calendar connected has the people its
 * appointments name put in People -- a phone in the event is the key, the name as the event gives it, consent
 * untouched.
 *
 * The route is api/cron/calendar.ts: sweepDoor (lib/ops/sweep-door.ts) names the request, finds the database and checks
 * the sweep key, then hands this its tick, so nothing below runs for a knock without the key.
 *
 * The page is only what is due, judged in the database (00245 calendars_due, through calendarDue in
 * lib/ops/sweep-rotation.ts): CALENDAR_PER_TICK workspaces whose settings carry a feed address
 * (config.calendar.ical_url) or a calendar read through a connected mailbox (config.calendar_grant, 00478, decision 0073
 * R20: contracts calendarFeedKeyOf, the grant first), the never-read first, then the least recently read, none read
 * again within calendarDue's minAgeMs. Each read that works is noted on the imports ledger as the calendar's (the visits
 * before today and those coming, how far back), which the first run's Bringing it in, Today and Connections say; a
 * mailbox connected with its calendar asks for one read at once (readOneCalendar, through its history import). Each feed is read as the receptionists read it (feedItemsFor: one fetch per five minutes, parsed once) in
 * the workspace's own zone, and a pure extraction (peopleFromItems) picks the people. This sweep is the one path that adds
 * them on its own: opening the Calendar adds nobody (a read never writes, decision 0047 lane 6), and the board offers "Add
 * to People" for a visit it cannot match, through the door a hand uses, so a person is created once whichever path saw
 * them first. addPeopleFromCalendar
 * gets or creates by phone: a name fills only an empty one, an address only where there is none, someone who asked to
 * be erased is not brought back by their own appointment, and each person made gets a `contact.added` event that says
 * where they came from. The owner hears it as a row on the bell (kind calendar_people), never as a mail. The same
 * appointments' addresses and numbers go to the booking door (bookedFromCalendar, reach_out_booked, 00227), which
 * stops a reach-out to a business that booked after it was written to; if the door fails that is logged and counts
 * nothing, and People has been filled all the same.
 *
 * The same read is then kept as the workspace's appointments (keepAppointments, lib/calendar/calendar-appointments.ts,
 * decision 0002): inserted or moved by the calendar's own key, a row the read no longer names vanished, never
 * cancelled; a read older than the one the workspace last had is refused (stale). A keep that fails is logged
 * (calendar_appointments_failed) and counts the workspace as read: People has been filled, and the next hour's read
 * keeps what this one could not.
 *
 * A workspace read is stamped (markCalendarChecked, tenant_config.calendar_checked_at). So is one that could not be
 * read (a feed that fails, settings that do not parse, no address, a throw): it is retried next hour, behind the feeds
 * that can be read, instead of holding the first place of the page every hour. A link that does not answer also keeps
 * since when (tenant_config.calendar_failed_since, 00435, written with that stamp on the change, and cleared by the
 * first read that works), and its owner is told once its failures are a day old; the read that works closes the notice
 * (calendar-notice.ts, the wiring's second audit, R11 S11-4).
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
import { json } from "../http.js";
import {
  calendarDue,
  markCalendarChecked,
  noteBacklog,
  CALENDAR_PER_TICK,
  CALENDAR_SWEEP_BUDGET_MS,
} from "../ops/sweep-rotation.js";
import { feedItemsFor } from "./availability.js";
import { addPeopleFromCalendar } from "./calendar-people.js";
import { markCalendarFeedKept } from "../packages/db.js";
import { keepAppointments } from "./calendar-appointments.js";
import { bookedFromCalendar } from "./reach-out-booked.js";
import { recordNotification } from "../ops/notify.js";
import { readableAgain, tellUnreadable } from "./calendar-notice.js";
import {
  BOOKING_DEFAULTS,
  calendarFeedKeyOf,
  ownAddressesOf,
  parseTenantConfig,
  peopleFromItems,
  type FeedItem,
  type TenantConfig,
} from "../packages/contracts.js";
import { noteImport, type DueCalendar } from "../packages/db.js";
import type { SweepTick } from "../ops/sweep-door.js";

/** What the reads kept as appointments, for the tick's log line. */
export type Kept = { added: number; moved: number; back: number; vanished: number; seen: number; stale: number };

/**
 * One read kept as the workspace's appointments (keepAppointments), its counts added to the tick's, and the workspace's
 * first read kept stamped (00419), so the next read's additions are no first read. A keep that fails, or a stamp, is
 * logged: People has been filled, and the next hour's read keeps what this one could not; a stamp that fails leaves the
 * read kept, and the next read is taken for the first and tells none of its own.
 */
async function keepTheRead(
  db: SweepTick["db"],
  read: { tenantId: string; items: Parameters<typeof keepAppointments>[2]; now: Date; L: SweepTick["L"] },
  how: Parameters<typeof keepAppointments>[3],
  kept: Kept,
): Promise<void> {
  const { tenantId, items, now, L } = read;
  const errorOf = (e: unknown) => (e instanceof Error ? e.message : String(e));
  let r;
  try {
    r = await keepAppointments(db, tenantId, items, how);
  } catch (e) {
    L.error("calendar_appointments_failed", { tenant_id: tenantId, error: errorOf(e) });
    return;
  }
  for (const k of Object.keys(kept) as (keyof Kept)[]) kept[k] += r[k];
  if (!r.first) return;
  await markCalendarFeedKept(db, tenantId, now).catch((e: unknown) =>
    L.error("calendar_first_read_stamp_failed", { tenant_id: tenantId, error: errorOf(e) }),
  );
}

/**
 * What a read brought, on the imports ledger as the calendar's (decision 0073, R23): the visits before now and those
 * coming (an occurrence of a series is each its own visit), how far back the oldest reaches, and where it was read
 * from (a grant's provider, or the link). Set whole on every read: the calendar is the calendar as it stands. A note
 * that fails is logged; the read is kept all the same.
 */
async function noteTheRead(
  db: SweepTick["db"],
  p: { tenantId: string; items: readonly FeedItem[]; cfg: TenantConfig | null; now: Date; L: SweepTick["L"] },
): Promise<void> {
  const nowMs = p.now.getTime();
  const seen = new Set<string>();
  let past = 0;
  let coming = 0;
  let oldest: number | null = null;
  for (const it of p.items) {
    const key = `${it.uid ?? it.title}|${it.start}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (it.start < nowMs) past++;
    else coming++;
    oldest = oldest === null ? it.start : Math.min(oldest, it.start);
  }
  await noteImport(db, {
    tenantId: p.tenantId,
    source: "calendar",
    state: "done",
    counts: { past, coming },
    oldest: oldest === null ? null : new Date(oldest).toISOString(),
    via: p.cfg?.calendar_grant?.provider ?? "link",
  }).catch((e: unknown) =>
    p.L.error("calendar_ledger_failed", { tenant_id: p.tenantId, error: e instanceof Error ? e.message : String(e) }),
  );
}

/** What one workspace's read came to, for the tick's counts. */
interface CalendarRead {
  /** none: nothing to read (no link and no grant, or settings that do not parse); failed: it could not be read. */
  outcome: "read" | "none" | "failed";
  seen: number;
  added: number;
  named: number;
  emailed: number;
  booked: number;
}

const NOTHING_READ = { seen: 0, added: 0, named: 0, emailed: 0, booked: 0 };

/**
 * One workspace's calendar read, as the sweep reads each on its page and as a mailbox connected with its calendar asks
 * at once: its people into People, its bookings to the booking door, the read kept as its appointments and noted on the
 * ledger, and the workspace stamped as read, a read that failed included (its failures' stamp and notice as the sweep
 * has always kept them).
 */
export async function readOneCalendar(
  db: SweepTick["db"],
  row: DueCalendar,
  now: Date,
  L: SweepTick["L"],
  kept: Kept,
): Promise<CalendarRead> {
  // Since when this link's reads have failed (00435): null while they work, undefined where the database keeps no
  // such stamp, which is then never written. A link that does not answer starts the stamp; one already failing keeps it.
  const failing = row.failed_since;
  const tried = (unreadable = false) =>
    markCalendarChecked(db, row.tenant_id, now, unreadable && failing === null ? { failedSince: now } : {}).catch(
      () => undefined,
    );
  const cfg = parseTenantConfig(row.config);
  // The grant's calendar where one is read, else the link (contracts calendarFeedKeyOf): one key, read one way.
  const url = calendarFeedKeyOf(cfg);
  if (!url) {
    await tried();
    return { outcome: "none", ...NOTHING_READ };
  }
  // The zone comes with the page (00245): the workspace's own, UTC when that is a name nobody knows.
  const tz = row.timezone;
  const daysAhead = cfg?.brain?.profile?.booking_rules?.max_days_ahead ?? BOOKING_DEFAULTS.max_days_ahead;
  const items = await feedItemsFor(row.tenant_id, url, tz, now, daysAhead);
  if (!items) {
    await tried(true);
    // The owner is told once the failures are old enough; the first failure has only just started the stamp.
    if (failing) await tellUnreadable(db, row.tenant_id, failing, now, L);
    return { outcome: "failed", ...NOTHING_READ };
  }
  const people = peopleFromItems(
    items,
    (cfg?.brain?.profile?.services ?? []).map((s) => s.name),
    now.getTime(),
  );
  const r = await addPeopleFromCalendar(db, row.tenant_id, people);
  const booked = await bookedFromCalendar(db, row.tenant_id, items, ownAddressesOf(cfg));
  // After the people, so an appointment names the person this read just put in People.
  await keepTheRead(db, { tenantId: row.tenant_id, items, now, L }, { timezone: tz, cfg, daysAhead, now }, kept);
  await noteTheRead(db, { tenantId: row.tenant_id, items, cfg, now, L });
  // A link that answers again: the stamp of its failures is cleared with the read's, and the notice closes.
  await markCalendarChecked(db, row.tenant_id, now, failing ? { failedSince: null } : {});
  if (failing) await readableAgain(db, row.tenant_id);
  await tellPeopleAdded(row.tenant_id, r, L);
  return { outcome: "read", seen: r.seen, added: r.added, named: r.named, emailed: r.emailed, booked };
}

/** The people a read put in People, logged, and the owner told on the bell: good news, never an email. */
async function tellPeopleAdded(
  tenantId: string,
  r: Awaited<ReturnType<typeof addPeopleFromCalendar>>,
  L: SweepTick["L"],
): Promise<void> {
  if (r.added || r.named || r.emailed) L.info("calendar_people_added", { tenant_id: tenantId, ...r });
  if (!r.added) return;
  const one = r.added === 1;
  await recordNotification(tenantId, {
    kind: "calendar_people",
    title: `${r.added} ${one ? "person" : "people"} added from your calendar`,
    body: `${one ? "An event" : "Events"} on your calendar carried a phone number nobody in People had. ${one ? "They are" : "They are all"} in People now, with consent unknown.`,
    route: "clients",
  });
}

export async function sweepCalendar({ db, L }: SweepTick): Promise<Response> {
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

  const out = {
    tenants: 0,
    seen: 0,
    added: 0,
    named: 0,
    emailed: 0,
    booked: 0,
    failed: 0,
    remaining: page.remaining,
  };
  // What the reads kept as appointments, for the tick's log line: the answer stays the sweep's own counts.
  const kept: Kept = { added: 0, moved: 0, back: 0, vanished: 0, seen: 0, stale: 0 };
  const startedAt = Date.now();
  for (const [i, row] of page.rows.entries()) {
    // Out of time: the rest of the page is remaining, not read, and not stamped.
    if (Date.now() - startedAt > CALENDAR_SWEEP_BUDGET_MS) {
      out.remaining += page.rows.length - i;
      L.warn("calendar_sweep_over_budget", { unread: page.rows.length - i });
      break;
    }
    // A feed that could not be read, or a configuration that does not parse, is stamped as tried: retried the next
    // hour (the page's own gap), behind the feeds that can be read. Unstamped it kept the first place every hour, and
    // forty dead feeds held the page for every workspace (readOneCalendar).
    try {
      const r = await readOneCalendar(db, row, now, L, kept);
      if (r.outcome === "none") continue;
      out.tenants += 1;
      if (r.outcome === "failed") out.failed += 1;
      out.seen += r.seen;
      out.added += r.added;
      out.named += r.named;
      out.emailed += r.emailed;
      out.booked += r.booked;
    } catch (e) {
      out.tenants += 1;
      out.failed += 1;
      L.error("calendar_sweep_failed", { tenant_id: row.tenant_id, error: e instanceof Error ? e.message : String(e) });
      await markCalendarChecked(db, row.tenant_id, now).catch(() => undefined);
    }
  }
  const backlog = await noteBacklog(db, "calendar", out.remaining);
  L.info("calendar_sweep", { ...out, appointments: kept, backlog_ticks: backlog.ticks });
  // One tick with work left over is the cap doing its job. Three in a row is
  // the queue growing faster than this sweep drains it, which sweep_health
  // turns red and mails -- a capacity fact a person has to hear before a
  // customer notices the receptionist offering times that are already taken.
  if (backlog.alarm) {
    return json(503, { ok: false, error: "calendar_backlog", backlog_ticks: backlog.ticks, ...out });
  }
  return json(200, { ok: true, ...out });
}
