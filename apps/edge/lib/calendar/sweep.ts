/**
 * The calendar sweep: every hour, each workspace with a calendar connected and due is handed a job (decision 0115, 00569),
 * and that job has the people its appointments name put in People -- a phone in the event is the key, the name as the event gives it, consent
 * untouched.
 *
 * The route is api/cron/calendar.ts: sweepDoor (lib/ops/sweep-door.ts) names the request, finds the database and checks
 * the sweep key, then hands this its tick, so nothing below runs for a knock without the key.
 *
 * What is due is judged in the database (00245 calendars_due): a workspace whose settings carry a feed address
 * (config.calendar.ical_url) or a calendar read through a connected mailbox (config.calendar_grant, 00478, decision 0073
 * R20: contracts calendarFeedKeyOf, the grant first), none read again within CALENDAR_REST_MS. Each read that works is noted on the imports ledger as the calendar's (the visits
 * before today and those coming, how far back), which the first run's Bringing it in, Today and Connections say; a
 * mailbox connected with its calendar asks for one read at once (readOneCalendar, through its history import). Each feed is read as the receptionists read it (listFeedItems: one fetch per five minutes, parsed once) in
 * the workspace's own zone, and a pure extraction (peopleFromItems) picks the people. This sweep is the one path that adds
 * them on its own: opening the Calendar adds nobody (a read never writes, decision 0047 lane 6), and the board offers "Add
 * to People" for a visit it cannot match, through the door a hand uses, so a person is created once whichever path saw
 * them first. addPeopleFromCalendar
 * gets or creates by phone: a name fills only an empty one, an address only where there is none, someone who asked to
 * be erased is not brought back by their own appointment, and each person made gets a `contact.added` event that says
 * where they came from. The owner hears it as a row on the bell (kind calendar_people), never as a mail. The same
 * appointments' addresses and numbers go to the booking door (recordBookedFromCalendar, reach_out_booked, 00227), which
 * stops a reach-out to a business that booked after it was written to; if the door fails that is logged and counts
 * nothing, and People has been filled all the same.
 *
 * The same read is then kept as the workspace's appointments (keepAppointments, lib/calendar/appointments.ts,
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
 * (calendar/notice.ts, the wiring's second audit, R11 S11-4).
 *
 * Called by pg_cron at :23 ('calendar-people-sweep', 00053) through trigger_calendar_sweep (request_sweep, 00086),
 * with the Vault sweep key in x-cron-key (authorizeCron). The request is recorded in sweep_status and sweep_health()
 * judges the answer (registered in 00107). Its lines carry `sweep: "calendar"`; the tick ends in one calendar_sweep with
 * how many it handed out, and each job in one calendar_read with what it came to.
 */
import { json } from "../shared/http.js";
import {
  listCalendarsDue,
  markCalendarChecked,
  CALENDAR_REST_MS,
  HAND_OUT_SPREAD_SECONDS,
} from "../shared/sweep-rotation.js";
import { logger } from "../shared/log.js";
import { listFeedItems } from "./availability.js";
import { addPeopleFromCalendar } from "./people.js";
import { markCalendarFeedKept } from "@chanlytics/db/workspace";
import { keepAppointments } from "./appointments.js";
import { recordBookedFromCalendar } from "./reach-out-booked.js";
import { recordNotification } from "../shared/alerts/notify.js";
import { makeReadableAgain, tellUnreadable } from "./notice.js";
import {
  BOOKING_DEFAULTS,
  calendarFeedKeyOf,
  ownAddressesOf,
  parseTenantConfig,
  peopleFromItems,
  type FeedItem,
  type TenantConfig,
  keysOf,
} from "@chanlytics/contracts";
import { noteImport } from "@chanlytics/db/imports";
import { handOutCalendarsDue, type DueCalendar } from "@chanlytics/db/jobs";
import type { SweepTick } from "../ops/sweep-door.js";
import type { TenantId } from "@chanlytics/contracts";
import { logAndGoOn } from "@chanlytics/log";

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
  read: { tenantId: TenantId; items: Parameters<typeof keepAppointments>[2]; now: Date; L: SweepTick["L"] },
  how: Parameters<typeof keepAppointments>[3],
  kept: Kept,
): Promise<void> {
  const { tenantId, items, now, L } = read;
  const errorOf = (e: unknown) => (e instanceof Error ? e.message : String(e));
  let item;
  try {
    item = await keepAppointments(db, tenantId, items, how);
  } catch (e) {
    L.error("calendar_appointments_failed", { tenant_id: tenantId, error: errorOf(e) });
    return;
  }
  for (const k of keysOf(kept)) kept[k] += item[k];
  if (!item.first) return;
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
  params: { tenantId: TenantId; items: readonly FeedItem[]; cfg: TenantConfig | null; now: Date; L: SweepTick["L"] },
): Promise<void> {
  const nowMs = params.now.getTime();
  const seen = new Set<string>();
  let past = 0;
  let coming = 0;
  let oldest: number | null = null;
  for (const it of params.items) {
    const key = `${it.uid ?? it.title}|${it.start}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (it.start < nowMs) past++;
    else coming++;
    oldest = oldest === null ? it.start : Math.min(oldest, it.start);
  }
  await noteImport(db, {
    tenantId: params.tenantId,
    source: "calendar",
    state: "done",
    counts: { past, coming },
    oldest: oldest === null ? null : new Date(oldest).toISOString(),
    via: params.cfg?.calendar_grant?.provider ?? "link",
  }).catch((e: unknown) =>
    params.L.error("calendar_ledger_failed", {
      tenant_id: params.tenantId,
      error: e instanceof Error ? e.message : String(e),
    }),
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
  log: SweepTick["L"],
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
  const items = await listFeedItems(row.tenant_id, url, tz, now, daysAhead);
  if (!items) {
    await tried(true);
    // The owner is told once the failures are old enough; the first failure has only just started the stamp.
    if (failing) await tellUnreadable(db, row.tenant_id, failing, now, log);
    return { outcome: "failed", ...NOTHING_READ };
  }
  const people = peopleFromItems(
    items,
    (cfg?.brain?.profile?.services ?? []).map((s) => s.name),
    now.getTime(),
  );
  const result = await addPeopleFromCalendar(db, row.tenant_id, people);
  const booked = await recordBookedFromCalendar(db, row.tenant_id, items, ownAddressesOf(cfg));
  // After the people, so an appointment names the person this read just put in People.
  await keepTheRead(db, { tenantId: row.tenant_id, items, now, L: log }, { timezone: tz, cfg, daysAhead, now }, kept);
  await noteTheRead(db, { tenantId: row.tenant_id, items, cfg, now, L: log });
  // A link that answers again: the stamp of its failures is cleared with the read's, and the notice closes.
  await markCalendarChecked(db, row.tenant_id, now, failing ? { failedSince: null } : {});
  if (failing) await makeReadableAgain(db, row.tenant_id);
  await tellPeopleAdded(row.tenant_id, result, log);
  return {
    outcome: "read",
    seen: result.seen,
    added: result.added,
    named: result.named,
    emailed: result.emailed,
    booked,
  };
}

/** The people a read put in People, logged, and the owner told on the bell: good news, never an email. */
async function tellPeopleAdded(
  tenantId: TenantId,
  item: Awaited<ReturnType<typeof addPeopleFromCalendar>>,
  log: SweepTick["L"],
): Promise<void> {
  if (item.added || item.named || item.emailed) log.info("calendar_people_added", { tenant_id: tenantId, ...item });
  if (!item.added) return;
  const one = item.added === 1;
  await recordNotification(tenantId, {
    kind: "calendar_people",
    title: `${item.added} ${one ? "person" : "people"} added from your calendar`,
    body: `${one ? "An event" : "Events"} on your calendar carried a phone number nobody in People had. ${one ? "They are" : "They are all"} in People now, with consent unknown.`,
    route: "clients",
  });
}

/**
 * The hour's calendars handed out: a calendar_read job for each workspace whose calendar is due (00569 calendars_hand_out,
 * judged by calendars_due). This read them itself, forty an hour and no more inside a sixty-second function, so at a
 * thousand workspaces a calendar was read once a day and the receptionist offered times taken that morning. A hand-out that
 * cannot be written is a 500 (an edge deployed ahead of 00569 is loud, not quiet).
 */
export async function sweepCalendar({ db, L }: SweepTick): Promise<Response> {
  let handed: number;
  try {
    handed = await handOutCalendarsDue(db, {
      before: new Date(Date.now() - CALENDAR_REST_MS),
      spreadSeconds: HAND_OUT_SPREAD_SECONDS,
    });
  } catch (e) {
    L.error("calendar_configs_read_failed", { error: e instanceof Error ? e.message : String(e) });
    return json(500, { ok: false });
  }
  L.info("calendar_sweep", { handed });
  return json(200, { ok: true, handed });
}

/**
 * One workspace's calendar_read: what is due is asked again, of this workspace alone, when the job runs, since "Read now" may
 * have read it since the sweep. A feed that could not be read, or a configuration that does not parse, is stamped as tried and
 * read again next hour (readOneCalendar); a throw part way is stamped and said the same, so a dead feed never fails the job.
 * Only a page that cannot be read throws, and the ledger tries that again.
 */
async function readWorkspaceCalendar(
  db: SweepTick["db"],
  tenantId: TenantId,
  log: SweepTick["L"],
): Promise<CalendarRead | null> {
  const now = new Date();
  const page = await listCalendarsDue(db, now, 1, tenantId);
  const row = page.rows.at(0);
  if (!row) return null;
  const kept: Kept = { added: 0, moved: 0, back: 0, vanished: 0, seen: 0, stale: 0 };
  try {
    const read = await readOneCalendar(db, row, now, log, kept);
    log.info("calendar_read", { tenant_id: tenantId, ...read, appointments: kept });
    return read;
  } catch (e) {
    log.error("calendar_sweep_failed", { tenant_id: tenantId, error: e instanceof Error ? e.message : String(e) });
    await markCalendarChecked(db, tenantId, now).catch(logAndGoOn("markCalendarChecked"));
    return { outcome: "failed", ...NOTHING_READ };
  }
}

/** calendar_read as the job runner takes it. */
export const calendarReader =
  (db: SweepTick["db"]) =>
  async (job: { tenant_id: TenantId }): Promise<{ read: CalendarRead } | { skipped: string }> => {
    const read = await readWorkspaceCalendar(db, job.tenant_id, logger({ tenant_id: job.tenant_id }));
    return read ? { read } : { skipped: "not due" };
  };
