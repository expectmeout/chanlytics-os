/** Notifications: feed. */

import {
  BELL_WINDOW_DAYS,
  CATCH_UP_VISITS,
  DAY_MS,
  isForReader,
  SAME_VISIT_MS,
  sameVisitOnRecord,
  sightingStands,
  type BookedVisit,
  BOOKING_VIAS,
  type BookingVia,
  type MemberJoined,
  unreadFor,
  type SchemaSet,
  recordOrEmpty,
  DbFailure,
} from "@chanlytics/contracts";
import { oneOr, type Db } from "./kept";
import type { TenantId } from "@chanlytics/contracts";

/** The sources a customer's booking comes by (contracts bookingArriving): a member's own entry (`person`) is not one. */
const BOOKING_SOURCES = BOOKING_VIAS;

/**
 * The visits of the record among `ids` that are booked and still ahead of `nowMs`, as the record says them now, and who
 * booked each: the name the booking states, else the person the visit is linked to, and nobody for a person who is erased or
 * being erased. A visit cancelled, vanished from the feed, past, or entered by a member is left out: a booking's notice
 * tells what stands. With `status` "cancelled", the cancelled ones instead, still ahead, for the notice of a time freed
 * (contracts visitChangeNews). So is a visit of the calendar's that is linked to nobody now: the owner's own entry, never a customer's
 * booking (contracts visit-news.ts asks it of the event too). A read that fails throws.
 */
export async function listBookedVisits(
  db: Db,
  tenantId: TenantId,
  ids: readonly string[],
  nowMs: number,
  status: "booked" | "cancelled" = "booked",
): Promise<BookedVisit[]> {
  if (ids.length === 0) return [];
  const { data, error } = await db
    .from("appointments")
    .select("id, starts_at, ends_at, all_day, timezone, source, client_name, service, contact_id")
    .eq("tenant_id", tenantId)
    .in("id", [...ids])
    .eq("status", status)
    .is("vanished_at", null)
    .in("source", [...BOOKING_SOURCES])
    .gt("starts_at", new Date(nowMs).toISOString());
  if (error) throw new DbFailure(error, "cannot read the visits");
  const visits = (data ?? []).filter((v) => v.source !== "calendar_feed" || v.contact_id);
  const personIds = [...new Set(visits.flatMap((v) => (v.contact_id ? [v.contact_id] : [])))];
  const people = new Map<string, { name: string | null; erased: boolean }>();
  if (personIds.length) {
    const found = await db
      .from("contacts")
      .select("id, display_name, wa_profile_name, erased_at, erasing_since")
      .eq("tenant_id", tenantId)
      .in("id", personIds);
    if (found.error) throw new DbFailure(found.error, "cannot read the people of the visits");
    for (const c of found.data ?? [])
      people.set(c.id, {
        name: c.display_name ?? c.wa_profile_name ?? null,
        erased: !!c.erased_at || !!c.erasing_since,
      });
  }
  return visits.map((visit) => {
    const person = visit.contact_id ? people.get(visit.contact_id) : undefined;
    // A visit linked to a person who is erased, or being erased, is told of with no name, whatever it once stated.
    const personName = person?.erased ? null : visit.client_name?.trim() || person?.name || null;
    return {
      id: visit.id,
      start: visit.starts_at,
      end: visit.ends_at,
      allDay: visit.all_day,
      timezone: visit.timezone,
      who: personName,
      service: visit.service?.trim() || null,
      via: visit.source as BookingVia,
    };
  });
}

/**
 * The calendar's additions one read of the owner's feed wrote in the same transaction as this event (appointments_feed_sync
 * writes them all in one, so they share the ledger's clock): the event ids, the appointments they are about and what each
 * event says of its addition (00419's facts), in event-id order, so every delivery of the group computes the same first. At
 * most CATCH_UP_VISITS + 1, enough to see that a read added more than a customer could book without reading the rest. A
 * read that fails throws.
 */
export async function listFeedAdditionsWith(
  db: Db,
  tenantId: TenantId,
  event: { id: string; at: string },
): Promise<Array<{ eventId: string; appointmentId: string; data: unknown }>> {
  const { data, error } = await db
    .from("events")
    .select("id, subject_id, data")
    .eq("tenant_id", tenantId)
    .eq("kind", "appointment.changed")
    .eq("created_at", event.at)
    .eq("data->>source", "calendar_feed")
    .eq("data->>change", "added")
    .order("id")
    .limit(CATCH_UP_VISITS + 1);
  if (error) throw new DbFailure(error, "cannot read the calendar's additions");
  return (data ?? []).flatMap((e) =>
    e.subject_id ? [{ eventId: e.id, appointmentId: e.subject_id, data: e.data }] : [],
  );
}

/** The other sightings of a visit: a booking's row and the calendar's copy of it (contracts booking-notice.ts). */
const BOOKING_ROWS: readonly BookingVia[] = ["booking_email", "booking_tool"];

/**
 * Whether a visit that arrived was told already as its other sighting: for a booking from its tool's email or its tool,
 * the calendar's copy of it; for the calendar's addition, the booking's own row. The other sighting is a row of the same
 * visit (contracts booking-notice.ts sameVisitOnRecord: one person, starting as near) whose arrival the bell answered. The
 * copy is told first when the email was held and read again after the hourly sweep found the visit; the booking first
 * when the sweep read the calendar before the booking's row existed, so it could not mark the copy (`twin`). Either way
 * the visit is told once. A visit linked to nobody cannot be matched, and is told. A sighting told inside a group line
 * (several additions of one read) is not found by its own event, and the visit is told: a twice-told visit is the cheaper
 * error than a booking never told; so is the narrow case of two deliveries running side by side, each reading before the
 * other told. A read that fails throws.
 */
export async function wasTwinTold(db: Db, tenantId: TenantId, appointmentId: string): Promise<boolean> {
  const visit = oneOr(
    await db
      .from("appointments")
      .select("source, contact_id, starts_at")
      .eq("tenant_id", tenantId)
      .eq("id", appointmentId)
      .limit(1),
    "the visit",
  );
  if (!visit?.contact_id) return false;
  const others = visit.source === "calendar_feed" ? BOOKING_ROWS : ["calendar_feed" as const];
  const at = Date.parse(visit.starts_at);
  const sightings = await db
    .from("appointments")
    .select("id, contact_id, starts_at, status, vanished_at")
    .eq("tenant_id", tenantId)
    .in("source", [...others])
    .eq("contact_id", visit.contact_id)
    .gte("starts_at", new Date(at - SAME_VISIT_MS).toISOString())
    .lte("starts_at", new Date(at + SAME_VISIT_MS).toISOString());
  if (sightings.error) throw new DbFailure(sightings.error, "cannot read the visit's other sightings");
  // Only a sighting that stands (contracts sightingStands): one cancelled or gone at that time, and booked again, is a
  // visit of its own, told as one.
  const ids = (sightings.data ?? []).filter((c) => sightingStands(c) && sameVisitOnRecord(visit, c)).map((c) => c.id);
  if (!ids.length) return false;
  const arrived = await db
    .from("events")
    .select("id, data")
    .eq("tenant_id", tenantId)
    .eq("kind", "appointment.changed")
    .in("subject_id", ids);
  if (arrived.error) throw new DbFailure(arrived.error, "cannot read how the visit arrived");
  const events = (arrived.data ?? []).flatMap((e) => {
    const change = recordOrEmpty(e.data).change;
    return change === "added" || change === "confirmed" ? [e.id] : [];
  });
  if (!events.length) return false;
  const notice = await db
    .from("notifications")
    .select("id")
    .eq("tenant_id", tenantId)
    .in("source_event", events)
    .limit(1);
  if (notice.error) throw new DbFailure(notice.error, "cannot read what the workspace was told");
  return (notice.data ?? []).length > 0;
}

/**
 * The invitation a member.joined event is about, as it stands: the address that accepted it and the role it seated them as.
 * Null when the invitation is gone. A read that fails throws.
 */
export async function findMemberJoined(db: Db, tenantId: TenantId, invitationId: string): Promise<MemberJoined | null> {
  const invite = oneOr(
    await db.from("invitations").select("id, email, role").eq("tenant_id", tenantId).eq("id", invitationId).limit(1),
    "the invitation",
  );
  return invite ? { invitationId: invite.id, email: invite.email, role: invite.role } : null;
}

/**
 * The address of a person who left a workspace, from the platform's identity store (auth.users, as the service role):
 * what the owner's notice of them names (contracts memberLeftNotice). Null for an account that is gone; a read that fails
 * throws.
 */
export async function findMemberEmail(db: Db, userId: string): Promise<string | null> {
  const userById = await db.auth.admin.getUserById(userId);
  if (userById.error) {
    if (userById.error.status === 404) return null;
    throw new DbFailure(userById.error, "cannot read who left");
  }
  return userById.data.user?.email ?? null;
}

/** PostgREST's answer to one read is a thousand rows at most; a bigger set is read a page at a time. */
const BELL_READ_PAGE = 1000;

/** How many uuids one `in` list carries: measured, about two hundred is where the URL becomes too long. */
const BELL_IN_BATCH = 100;

/**
 * The bell's number for each reader (contracts unreadFor) over the rows bellRowsOf reads, by each reader's seen moment and
 * marks, less the rows the server closed: the push job's badge counts a reader's whole window by it, and the bell's read the
 * older rows it does not list (getOlderUnread), so the page and the phone count by one implementation.
 */
export async function getUnreadOfReaders(db: Db, bellRange: BellRange): Promise<Map<string, number>> {
  const { rows, seen, marks } = await bellRowsOf(db, bellRange);
  const out = new Map<string, number>();
  for (const u of bellRange.readers) out.set(u, unreadForReader(rows, seen, marks, u).length);
  return out;
}

/**
 * One reader's unread rows past the bell's list (getUnreadOfReaders' rule): how many, and the threads of those that are a
 * hold's notice (`holdKinds`), which the bell draws as its own row while the hold waits (contracts bellOlderOf, S6-10).
 */
export async function getOlderUnread(
  db: Db,
  params: {
    tenantId: TenantId;
    reader: string;
    fromIso: string;
    throughIso: string;
    leaving: ReadonlySet<string>;
    holdKinds: readonly string[];
  },
): Promise<{ unread: number; holdThreads: string[] }> {
  const { rows, seen, marks } = await bellRowsOf(db, { ...params, readers: [params.reader] });
  const mine = unreadForReader(rows, seen, marks, params.reader);
  const holdThreads = mine.flatMap((r) =>
    params.holdKinds.includes(r.kind) && r.subject_type === "conversation" && r.subject_id ? [r.subject_id] : [],
  );
  return { unread: mine.length, holdThreads: [...new Set(holdThreads)] };
}

/** The rows a bell's count is of: a workspace's, from a moment (through another), less those counted where listed. */
interface BellRange {
  tenantId: TenantId;
  readers: readonly string[];
  fromIso: string;
  throughIso?: string | null;
  leaving?: ReadonlySet<string>;
}

/** A kept row as the bell's counts read it. */
interface BellCountRow {
  id: string;
  created_at: string;
  recipient_user_id: string | null;
  closed_at: string | null;
  kind: string;
  subject_type: string | null;
  subject_id: string | null;
}

type BellMark = { notification_id: string; user_id: string; read_at: string | null; dismissed_at: string | null };

/** One reader's unread rows (contracts unreadFor, row by row), less a note left for another member (00158, isForReader). */
function unreadForReader(
  rows: readonly BellCountRow[],
  seen: ReadonlyArray<{ user_id: string; seen_at: string | null }>,
  marks: readonly BellMark[],
  reader: string,
): BellCountRow[] {
  const seenAt = seen.find((s) => s.user_id === reader)?.seen_at ?? null;
  const own = marks.filter((m) => m.user_id === reader);
  return rows.filter((r) => isForReader(r, reader) && unreadFor([r], seenAt, own) === 1);
}

/**
 * The workspace's kept rows from `fromIso` (through `throughIso`) less those in `leaving` (counted where they are listed), a
 * page at a time, with the readers' seen moments and their marks on those rows, in batches read together.
 */
async function bellRowsOf(
  db: Db,
  bellRange: BellRange,
): Promise<{ rows: BellCountRow[]; seen: Array<{ user_id: string; seen_at: string | null }>; marks: BellMark[] }> {
  const rows: BellCountRow[] = [];
  for (let from = 0; ; from += BELL_READ_PAGE) {
    let query = db
      .from("notifications")
      .select("id, created_at, recipient_user_id, closed_at, kind, subject_type, subject_id")
      .eq("tenant_id", bellRange.tenantId)
      .gte("created_at", bellRange.fromIso);
    if (bellRange.throughIso) query = query.lte("created_at", bellRange.throughIso);
    const page = await query.order("created_at", { ascending: true }).range(from, from + BELL_READ_PAGE - 1);
    if (page.error) throw new DbFailure(page.error, "cannot read the bell");
    rows.push(...(page.data ?? []).filter((r) => !bellRange.leaving?.has(r.id)));
    if ((page.data ?? []).length < BELL_READ_PAGE) break;
  }
  const seen = await db
    .from("notification_reads")
    .select("user_id, seen_at")
    .eq("tenant_id", bellRange.tenantId)
    .in("user_id", [...bellRange.readers]);
  if (seen.error) throw new DbFailure(seen.error, "cannot read when the bell was opened");
  const batches: string[][] = [];
  for (let i = 0; i < rows.length; i += BELL_IN_BATCH) batches.push(rows.slice(i, i + BELL_IN_BATCH).map((r) => r.id));
  const reads = await Promise.all(
    batches.map((ids) =>
      db
        .from("notification_marks")
        .select("notification_id, user_id, read_at, dismissed_at")
        .in("user_id", [...bellRange.readers])
        .in("notification_id", ids),
    ),
  );
  const marks: BellMark[] = [];
  for (const r of reads) {
    if (r.error) throw new DbFailure(r.error, "cannot read the bell's marks");
    marks.push(...(r.data ?? []));
  }
  return { rows, seen: seen.data ?? [], marks };
}

/** The bell's window from a moment, as the edge and the page read it (contracts BELL_WINDOW_DAYS). */
const bellWindowFrom = (nowMs: number): string => new Date(nowMs - BELL_WINDOW_DAYS * DAY_MS).toISOString();

/**
 * The warnings a mend closes (contracts NOTICE_MENDS, warningsMendedBy): for each, the workspace's open rows of its kind in
 * the bell's window (about the same subject where the pair must be; none where it must and no subject is known), less the
 * row just kept, whose title its rule matches, closed (closed_at). The titles are matched here, never in SQL, so the rule
 * stays in contracts. Answers how many it closed.
 */
export async function closeMendedNotices(
  db: Db,
  params: {
    tenantId: TenantId;
    warnings: ReadonlyArray<{ kind: SchemaSet<"notifications.kind">; title: RegExp; sameSubject: boolean }>;
    subject: { type: string; id: string } | null;
    keptId: string | null;
    nowMs: number;
  },
): Promise<number> {
  let closed = 0;
  for (const warning of params.warnings) {
    if (warning.sameSubject && !params.subject) continue;
    let query = db
      .from("notifications")
      .select("id, title")
      .eq("tenant_id", params.tenantId)
      .eq("kind", warning.kind)
      .is("closed_at", null)
      .gte("created_at", bellWindowFrom(params.nowMs));
    if (warning.sameSubject && params.subject)
      query = query.eq("subject_type", params.subject.type).eq("subject_id", params.subject.id);
    const found = await query;
    if (found.error) throw new DbFailure(found.error, "cannot read the warnings a mend closes");
    const ids = (found.data ?? [])
      .filter((r) => r.id !== params.keptId && warning.title.test(r.title))
      .map((r) => r.id);
    if (!ids.length) continue;
    const up = await db
      .from("notifications")
      .update({ closed_at: new Date(params.nowMs).toISOString() })
      .eq("tenant_id", params.tenantId)
      .in("id", ids)
      .is("closed_at", null)
      .select("id");
    if (up.error) throw new DbFailure(up.error, "cannot close the mended warnings");
    closed += (up.data ?? []).length;
  }
  return closed;
}
