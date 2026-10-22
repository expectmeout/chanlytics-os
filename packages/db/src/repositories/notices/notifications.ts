/**
 * What a person is told, as the edge reads and writes it, and the one line the dashboard writes (a member's morning cards
 * from Ask, askCardsTold): a kept notification taken back (apps/edge/lib/ops/notify.ts),
 * what each notice is read from (a hold's, a customer's no, a booking's, a teammate's), the bell's number for each reader
 * (unreadOfReaders: the push job's badge, and the older rows the page does not list), and the warnings a mend closes
 * (closeMendedNotices). The members' phones and their choices for them are member-alerts.ts. A read or write that fails
 * throws.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BELL_WINDOW_DAYS,
  CATCH_UP_VISITS,
  DAY_MS,
  HOUR_MS,
  isForReader,
  MIN_MS,
  SAME_VISIT_MS,
  sameVisitOnRecord,
  sightingStands,
  type BookedVisit,
  type BookingVia,
  type MemberJoined,
  type OptOutPerson,
  unreadFor,
} from "@chanlytics/contracts";
import type { Database } from "../../database.types";
import { DELIVERED } from "../thread";

type Db = SupabaseClient<Database>;

/**
 * The one place a bell's row is taken back: a notice told exactly once (notifyOnce) that nothing can find again takes its
 * row back when its mail failed, so asking again leaves no twin on the bell. A notice that can be found again (it keeps
 * the event it answers, or says what it is about) is never taken back: its mail is owed instead (`mail_due_at`, 00409),
 * and the retry sends the mail alone.
 */
export async function forgetNotification(db: Db, p: { tenantId: string; id: string }): Promise<void> {
  const { error } = await db.from("notifications").delete().eq("tenant_id", p.tenantId).eq("id", p.id);
  if (error) throw new Error(`cannot take the notification back: ${error.message}`);
}

/**
 * A member's morning cards on their own bell (decision 0070, kind ask_cards): one line addressed to them alone, opening
 * Today, about the morning's thread. Told once a morning: the morning's door records the count once (ask_morning_write's
 * answered) and only the call it answered `recorded` tells. Written with the service role, since a member writes no
 * bell row: the line is the member's own, and the route that asks has already checked who they are. No phone is told:
 * the member asked for the morning by arriving on Today.
 */
export async function askCardsTold(
  db: Db,
  p: { tenantId: string; userId: string; threadId: string; title: string; body: string },
): Promise<void> {
  const { error } = await db.from("notifications").insert({
    tenant_id: p.tenantId,
    kind: "ask_cards",
    title: p.title.slice(0, 200),
    body: p.body.slice(0, 4000),
    route: "today",
    subject_type: "ask_thread",
    subject_id: p.threadId,
    recipient_user_id: p.userId,
  });
  if (error) throw new Error(`cannot tell the member their morning: ${error.message}`);
}

/** A kept notice as its retry finds it: which row, and whether its mail is still owed. */
export interface KeptNotice {
  id: string;
  kind: string;
  /** The row and the phones were told; the mail has not gone (`notifications.mail_due_at` is set). */
  mailOwed: boolean;
}

/**
 * The notice a retry of a told-once notice finishes, if one was kept: the row answering this event (whatever its mail
 * stands at), else, for a notice with no event, the newest row of that kind and title about that subject whose mail is
 * still owed. Null when none is kept, or when nothing names what to look for (an event, or a subject and a title): such
 * a notice has no second chance to be told apart from a new one. A read that fails throws: "could not check" is not
 * "never told".
 */
export async function noticeFor(
  db: Db,
  p: {
    tenantId: string;
    sourceEvent?: string | null;
    kind: string;
    subjectType?: string | null;
    subjectId?: string | null;
    /** The notice's title as kept: a retry of the same notice says the same, so a different notice about the subject is not taken for it. */
    title?: string;
  },
): Promise<KeptNotice | null> {
  const base = db.from("notifications").select("id, kind, mail_due_at").eq("tenant_id", p.tenantId);
  const found = p.sourceEvent
    ? await base.eq("source_event", p.sourceEvent).limit(1)
    : p.subjectType && p.subjectId && p.title
      ? await base
          .eq("kind", p.kind)
          .eq("subject_type", p.subjectType)
          .eq("subject_id", p.subjectId)
          .eq("title", p.title)
          .not("mail_due_at", "is", null)
          .order("created_at", { ascending: false })
          .limit(1)
      : null;
  if (!found) return null;
  if (found.error) throw new Error(`cannot read what the workspace was told: ${found.error.message}`);
  const row = (found.data ?? [])[0];
  return row ? { id: row.id, kind: row.kind, mailOwed: row.mail_due_at !== null } : null;
}

/**
 * The mail of a kept notice has gone (or nothing is owed any more): its row says so, and a retry sends nothing. With
 * `words`, the row takes the words the mail went with: a retry said the notice again as it stands now (the hours a
 * customer has waited, the day a number goes back), and the bell says what the mail said. A write that fails throws.
 */
export async function mailSent(
  db: Db,
  p: { tenantId: string; id: string; words?: { title: string; body: string } },
): Promise<void> {
  const { error } = await db
    .from("notifications")
    .update({
      mail_due_at: null,
      ...(p.words ? { title: p.words.title.slice(0, 200), body: p.words.body.slice(0, 4000) } : {}),
    })
    .eq("tenant_id", p.tenantId)
    .eq("id", p.id);
  if (error) throw new Error(`cannot record that the notice was mailed: ${error.message}`);
}

/**
 * Whether the workspace has already kept a notice of this kind about this subject (`subject_type`, `subject_id`). The
 * notification door keeps no memory of what it told, so news owed once a day -- a playbook that could not run, said at the
 * day's last chance -- is keyed by what it is about and asked here first. A read that fails throws: "could not check" is
 * not "never told".
 */
export async function noticeKept(
  db: Db,
  p: { tenantId: string; kind: string; subjectType: string; subjectId: string },
): Promise<boolean> {
  const { data, error } = await db
    .from("notifications")
    .select("id")
    .eq("tenant_id", p.tenantId)
    .eq("kind", p.kind)
    .eq("subject_type", p.subjectType)
    .eq("subject_id", p.subjectId)
    .limit(1);
  if (error) throw new Error(`cannot read what the workspace was told: ${error.message}`);
  return (data ?? []).length > 0;
}

/**
 * The push-to-start tokens of the phones whose people hold one of `roles` in the workspace (00191), each once. Throws
 * when the people or their phones cannot be read.
 */
/**
 * The rows a workspace's reviews are on record under, by Google's own id for each: what a review's notice is kept about and
 * opens (contracts reviewRoute), where the first notices were kept about Google's id (00411). A read that fails throws.
 */
/** A row id: a review's notice may be kept about its row or about Google's own id for it (00411). */
const ROW_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The reviews the bell's notices name, by their row or by Google's own id, with whether each has a reply: what Ask's read of
 * the notices judges a new review's row by (contracts noticeStillWaits), as the bell does by Google's read (the wiring's
 * second audit, R13 X5-1). A read that fails throws.
 */
export async function reviewsNamed(
  db: Db,
  tenantId: string,
  ids: readonly string[],
): Promise<{ id: string; reviewId: string; replied: boolean }[]> {
  if (!ids.length) return [];
  const rowIds = ids.filter((id) => ROW_ID.test(id));
  const read = (column: "id" | "review_id", values: readonly string[]) =>
    db
      .from("google_reviews")
      .select("id, review_id, reply_text")
      .eq("tenant_id", tenantId)
      .in(column, [...values]);
  const [byRow, byGoogle] = await Promise.all([
    rowIds.length ? read("id", rowIds) : Promise.resolve({ data: [], error: null }),
    read("review_id", ids),
  ]);
  const error = byRow.error ?? byGoogle.error;
  if (error) throw new Error(`cannot read the reviews the notices name: ${error.message}`);
  const seen = new Map<string, { id: string; reviewId: string; replied: boolean }>();
  for (const r of [...(byRow.data ?? []), ...(byGoogle.data ?? [])])
    seen.set(r.id, { id: r.id, reviewId: r.review_id, replied: !!r.reply_text?.trim() });
  return [...seen.values()];
}

export async function reviewRowsByGoogleId(
  db: Db,
  tenantId: string,
  googleIds: readonly string[],
): Promise<Map<string, string>> {
  if (!googleIds.length) return new Map();
  const { data, error } = await db
    .from("google_reviews")
    .select("id, review_id")
    .eq("tenant_id", tenantId)
    .in("review_id", [...googleIds]);
  if (error) throw new Error(`cannot read the reviews on record: ${error.message}`);
  return new Map((data ?? []).map((r) => [r.review_id, r.id]));
}

/** What a hold's notice is read from: the hold by its thread (an opened one's event) or by its own id (a change's). */
type HoldRef = { conversationId: string } | { escalationId: string };

/** The rows a hold's notice says (contracts HoldFacts), or null when the thread no longer waits for a person. */
interface HoldFactsRow {
  conversationId: string;
  reason: string;
  details: string | null;
  who: string | null;
  address: string | null;
  channel: string | null;
  customerWords: string | null;
  replyWords: string | null;
  pausedHours: number | null;
  erased: boolean;
}

/** One row of a read, or null; a read that fails throws with what it read. */
const oneOr = <T>(r: { data: T[] | null; error: { message: string } | null }, what: string): T | null => {
  if (r.error) throw new Error(`cannot read ${what}: ${r.error.message}`);
  return r.data?.[0] ?? null;
};

/**
 * A hold's notice, read from its rows (decision 0043): the open hold (by its thread, or by its own id for a change), the
 * person, their latest words in the thread and what the receptionist wrote after them, and the pause when it runs.
 * Null when the hold is no longer open: a hold answered before its notice tells nobody. A read that fails throws.
 */
export async function holdFactsOf(db: Db, tenantId: string, ref: HoldRef, nowMs: number): Promise<HoldFactsRow | null> {
  const holds = db
    .from("escalations")
    .select("id, conversation_id, reason, details")
    .eq("tenant_id", tenantId)
    .eq("state", "open");
  const hold = oneOr(
    await (
      "conversationId" in ref ? holds.eq("conversation_id", ref.conversationId) : holds.eq("id", ref.escalationId)
    ).limit(1),
    "the hold",
  );
  if (!hold) return null;
  const thread = oneOr(
    await db
      .from("conversations")
      .select("contact_id, paused_until")
      .eq("tenant_id", tenantId)
      .eq("id", hold.conversation_id)
      .limit(1),
    "the thread",
  );
  if (!thread) return null;
  const person = oneOr(
    await db
      .from("contacts")
      .select("display_name, wa_profile_name, phone_e164, email, erased_at, erasing_since")
      .eq("tenant_id", tenantId)
      .eq("id", thread.contact_id)
      .limit(1),
    "the person",
  );
  const theirs = oneOr(
    await db
      .from("messages")
      .select("body, channel, created_at")
      .eq("tenant_id", tenantId)
      .eq("conversation_id", hold.conversation_id)
      .eq("direction", "inbound")
      .eq("sender", "customer")
      .order("created_at", { ascending: false })
      .limit(1),
    "their words",
  );
  const reply = theirs
    ? oneOr(
        await db
          .from("messages")
          .select("body")
          .eq("tenant_id", tenantId)
          .eq("conversation_id", hold.conversation_id)
          .eq("direction", "outbound")
          .eq("sender", "ai")
          // Words that reached them: a held draft, a failed or a withdrawn reply was never said.
          .in("status", DELIVERED)
          .gte("created_at", theirs.created_at)
          .order("created_at", { ascending: false })
          .limit(1),
        "the receptionist's reply",
      )
    : null;
  const pausedMs = thread.paused_until ? Date.parse(thread.paused_until) - nowMs : 0;
  return {
    conversationId: hold.conversation_id,
    reason: hold.reason,
    details: hold.details,
    who: person?.display_name ?? person?.wa_profile_name ?? null,
    address: person?.phone_e164 ?? person?.email ?? null,
    channel: theirs?.channel ?? null,
    customerWords: theirs?.body ?? null,
    replyWords: reply?.body ?? null,
    pausedHours: pausedMs > 0 ? Math.max(1, Math.round(pausedMs / HOUR_MS)) : null,
    erased: !person || !!person.erased_at || !!person.erasing_since,
  };
}

/**
 * Whether the workspace was already told of this hold in full: the notice answering this event with its mail gone or not
 * owed, or (while an edge from before decision 0043 still tells inline) a handoff about this thread kept within a minute of
 * the event and answering no event: a notice this subscriber kept for an earlier event of the thread is that event's, and a
 * hold that changed its reason a moment later is news of its own. A notice kept whose mail is still owed (the row and the
 * phones went, the mail did not: `mail_due_at`, 00409) is "bell told, mail owed": not told in full, so the subscriber
 * tells again and the notice door sends the mail alone. A read that fails throws: "could not check" is not "never told".
 */
export async function holdTold(
  db: Db,
  p: { tenantId: string; eventId: string; conversationId: string; at: string },
): Promise<boolean> {
  const answered = await db
    .from("notifications")
    .select("id")
    .eq("tenant_id", p.tenantId)
    .eq("source_event", p.eventId)
    .is("mail_due_at", null)
    .limit(1);
  if (answered.error) throw new Error(`cannot read what the workspace was told: ${answered.error.message}`);
  if ((answered.data ?? []).length) return true;
  const since = new Date(Date.parse(p.at) - MIN_MS).toISOString();
  const inline = await db
    .from("notifications")
    .select("id")
    .eq("tenant_id", p.tenantId)
    .eq("kind", "handoff")
    .eq("subject_type", "conversation")
    .eq("subject_id", p.conversationId)
    .is("source_event", null)
    .gte("created_at", since)
    .limit(1);
  if (inline.error) throw new Error(`cannot read what the workspace was told: ${inline.error.message}`);
  return (inline.data ?? []).length > 0;
}

/**
 * The person a consent change is about, as their record says it (contracts OptOutPerson): the name they are known by, their
 * number or address, and whether they are erased or being erased (then the notice names no one). Null when there is no such
 * person in the workspace. A read that fails throws.
 */
export async function personFactsOf(db: Db, tenantId: string, contactId: string): Promise<OptOutPerson | null> {
  const person = oneOr(
    await db
      .from("contacts")
      .select("display_name, wa_profile_name, phone_e164, email, erased_at, erasing_since")
      .eq("tenant_id", tenantId)
      .eq("id", contactId)
      .limit(1),
    "the person",
  );
  if (!person) return null;
  return {
    who: person.display_name ?? person.wa_profile_name ?? null,
    address: person.phone_e164 ?? person.email ?? null,
    erased: !!person.erased_at || !!person.erasing_since,
  };
}

/**
 * Whether the workspace was already told of this no in full (core SUBSCRIBERS.consent_notice): the notice answering this
 * event with its mail gone or not owed, or another notice of a customer's no about the same person kept within a minute of the
 * event. One press of "Stop all messages" writes two events (the STOP and the unsubscribe), and the owner is told of the
 * person once. A notice whose own mail is still owed is not told in full: the subscriber tells again and the door sends the
 * mail alone. A read that fails throws: "could not check" is not "never told".
 */
export async function optOutTold(
  db: Db,
  p: { tenantId: string; eventId: string; contactId: string; at: string },
): Promise<boolean> {
  const answered = await db
    .from("notifications")
    .select("id")
    .eq("tenant_id", p.tenantId)
    .eq("source_event", p.eventId)
    .is("mail_due_at", null)
    .limit(1);
  if (answered.error) throw new Error(`cannot read what the workspace was told: ${answered.error.message}`);
  if ((answered.data ?? []).length) return true;
  const since = new Date(Date.parse(p.at) - MIN_MS).toISOString();
  const twin = await db
    .from("notifications")
    .select("id")
    .eq("tenant_id", p.tenantId)
    .eq("kind", "opted_out")
    .eq("subject_type", "contact")
    .eq("subject_id", p.contactId)
    .neq("source_event", p.eventId)
    .gte("created_at", since)
    .limit(1);
  if (twin.error) throw new Error(`cannot read what the workspace was told: ${twin.error.message}`);
  return (twin.data ?? []).length > 0;
}

/**
 * Whether the workspace was already told of this event in full: a notice answering it (`source_event`), with its mail gone
 * or not owed. The test of news that has no twin to look for but its own earlier delivery (core SUBSCRIBERS.visit_notice
 * and team_notice): a second run of the delivery finds the notice and tells nobody. A read that fails throws: "could not
 * check" is not "never told".
 */
export async function eventTold(db: Db, p: { tenantId: string; eventId: string }): Promise<boolean> {
  const answered = await db
    .from("notifications")
    .select("id")
    .eq("tenant_id", p.tenantId)
    .eq("source_event", p.eventId)
    .is("mail_due_at", null)
    .limit(1);
  if (answered.error) throw new Error(`cannot read what the workspace was told: ${answered.error.message}`);
  return (answered.data ?? []).length > 0;
}

/** The sources a customer's booking comes by (contracts bookingArriving): a member's own entry (`person`) is not one. */
const BOOKING_SOURCES: readonly BookingVia[] = ["booking_email", "booking_tool", "calendar_feed"];

/**
 * The visits of the record among `ids` that are booked and still ahead of `nowMs`, as the record says them now, and who
 * booked each: the name the booking states, else the person the visit is linked to, and nobody for a person who is erased or
 * being erased. A visit cancelled, vanished from the feed, past, or entered by a member is left out: a booking's notice
 * tells what stands. With `status` "cancelled", the cancelled ones instead, still ahead, for the notice of a time freed
 * (contracts visitChangeNews). So is a visit of the calendar's that is linked to nobody now: the owner's own entry, never a customer's
 * booking (contracts visit-news.ts asks it of the event too). A read that fails throws.
 */
export async function bookedVisitsOf(
  db: Db,
  tenantId: string,
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
  if (error) throw new Error(`cannot read the visits: ${error.message}`);
  const visits = (data ?? []).filter((v) => v.source !== "calendar_feed" || v.contact_id);
  const personIds = [...new Set(visits.flatMap((v) => (v.contact_id ? [v.contact_id] : [])))];
  const people = new Map<string, { name: string | null; erased: boolean }>();
  if (personIds.length) {
    const found = await db
      .from("contacts")
      .select("id, display_name, wa_profile_name, erased_at, erasing_since")
      .eq("tenant_id", tenantId)
      .in("id", personIds);
    if (found.error) throw new Error(`cannot read the people of the visits: ${found.error.message}`);
    for (const c of found.data ?? [])
      people.set(c.id, {
        name: c.display_name ?? c.wa_profile_name ?? null,
        erased: !!c.erased_at || !!c.erasing_since,
      });
  }
  return visits.map((v) => {
    const person = v.contact_id ? people.get(v.contact_id) : undefined;
    // A visit linked to a person who is erased, or being erased, is told of with no name, whatever it once stated.
    const who = person?.erased ? null : v.client_name?.trim() || person?.name || null;
    return {
      id: v.id,
      start: v.starts_at,
      end: v.ends_at,
      allDay: v.all_day,
      timezone: v.timezone,
      who,
      service: v.service?.trim() || null,
      via: v.source as BookingVia,
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
export async function feedAdditionsWith(
  db: Db,
  tenantId: string,
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
  if (error) throw new Error(`cannot read the calendar's additions: ${error.message}`);
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
export async function twinTold(db: Db, tenantId: string, appointmentId: string): Promise<boolean> {
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
  if (sightings.error) throw new Error(`cannot read the visit's other sightings: ${sightings.error.message}`);
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
  if (arrived.error) throw new Error(`cannot read how the visit arrived: ${arrived.error.message}`);
  const events = (arrived.data ?? []).flatMap((e) => {
    const change =
      e.data && typeof e.data === "object" && !Array.isArray(e.data) ? (e.data as { change?: unknown }).change : null;
    return change === "added" || change === "confirmed" ? [e.id] : [];
  });
  if (!events.length) return false;
  const told = await db
    .from("notifications")
    .select("id")
    .eq("tenant_id", tenantId)
    .in("source_event", events)
    .limit(1);
  if (told.error) throw new Error(`cannot read what the workspace was told: ${told.error.message}`);
  return (told.data ?? []).length > 0;
}

/**
 * The invitation a member.joined event is about, as it stands: the address that accepted it and the role it seated them as.
 * Null when the invitation is gone. A read that fails throws.
 */
export async function memberJoinedOf(db: Db, tenantId: string, invitationId: string): Promise<MemberJoined | null> {
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
export async function memberEmailOf(db: Db, userId: string): Promise<string | null> {
  const who = await db.auth.admin.getUserById(userId);
  if (who.error) {
    if (who.error.status === 404) return null;
    throw new Error(`cannot read who left: ${who.error.message}`);
  }
  return who.data.user?.email ?? null;
}

/** PostgREST's answer to one read is a thousand rows at most; a bigger set is read a page at a time. */
const BELL_READ_PAGE = 1000;
/** How many uuids one `in` list carries: measured, about two hundred is where the URL becomes too long. */
const BELL_IN_BATCH = 100;

/**
 * The bell's number for each reader (contracts unreadFor) over the rows bellRowsOf reads, by each reader's seen moment and
 * marks, less the rows the server closed: the push job's badge counts a reader's whole window by it, and the bell's read the
 * older rows it does not list (olderUnreadFor), so the page and the phone count by one implementation.
 */
export async function unreadOfReaders(db: Db, p: BellRange): Promise<Map<string, number>> {
  const { rows, seen, marks } = await bellRowsOf(db, p);
  const out = new Map<string, number>();
  for (const u of p.readers) out.set(u, unreadForReader(rows, seen, marks, u).length);
  return out;
}

/**
 * One reader's unread rows past the bell's list (unreadOfReaders' rule): how many, and the threads of those that are a
 * hold's notice (`holdKinds`), which the bell draws as its own row while the hold waits (contracts bellOlderOf, S6-10).
 */
export async function olderUnreadFor(
  db: Db,
  p: {
    tenantId: string;
    reader: string;
    fromIso: string;
    throughIso: string;
    leaving: ReadonlySet<string>;
    holdKinds: readonly string[];
  },
): Promise<{ unread: number; holdThreads: string[] }> {
  const { rows, seen, marks } = await bellRowsOf(db, { ...p, readers: [p.reader] });
  const mine = unreadForReader(rows, seen, marks, p.reader);
  const holdThreads = mine
    .filter((r) => p.holdKinds.includes(r.kind) && r.subject_type === "conversation" && r.subject_id)
    .map((r) => r.subject_id as string);
  return { unread: mine.length, holdThreads: [...new Set(holdThreads)] };
}

/** The rows a bell's count is of: a workspace's, from a moment (through another), less those counted where listed. */
interface BellRange {
  tenantId: string;
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
  p: BellRange,
): Promise<{ rows: BellCountRow[]; seen: Array<{ user_id: string; seen_at: string | null }>; marks: BellMark[] }> {
  const rows: BellCountRow[] = [];
  for (let from = 0; ; from += BELL_READ_PAGE) {
    let q = db
      .from("notifications")
      .select("id, created_at, recipient_user_id, closed_at, kind, subject_type, subject_id")
      .eq("tenant_id", p.tenantId)
      .gte("created_at", p.fromIso);
    if (p.throughIso) q = q.lte("created_at", p.throughIso);
    const page = await q.order("created_at", { ascending: true }).range(from, from + BELL_READ_PAGE - 1);
    if (page.error) throw new Error(`cannot read the bell: ${page.error.message}`);
    rows.push(...(page.data ?? []).filter((r) => !p.leaving?.has(r.id)));
    if ((page.data ?? []).length < BELL_READ_PAGE) break;
  }
  const seen = await db
    .from("notification_reads")
    .select("user_id, seen_at")
    .eq("tenant_id", p.tenantId)
    .in("user_id", [...p.readers]);
  if (seen.error) throw new Error(`cannot read when the bell was opened: ${seen.error.message}`);
  const batches: string[][] = [];
  for (let i = 0; i < rows.length; i += BELL_IN_BATCH) batches.push(rows.slice(i, i + BELL_IN_BATCH).map((r) => r.id));
  const reads = await Promise.all(
    batches.map((ids) =>
      db
        .from("notification_marks")
        .select("notification_id, user_id, read_at, dismissed_at")
        .in("user_id", [...p.readers])
        .in("notification_id", ids),
    ),
  );
  const marks: BellMark[] = [];
  for (const r of reads) {
    if (r.error) throw new Error(`cannot read the bell's marks: ${r.error.message}`);
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
  p: {
    tenantId: string;
    warnings: ReadonlyArray<{ kind: string; title: RegExp; sameSubject: boolean }>;
    subject: { type: string; id: string } | null;
    keptId: string | null;
    nowMs: number;
  },
): Promise<number> {
  let closed = 0;
  for (const w of p.warnings) {
    if (w.sameSubject && !p.subject) continue;
    let q = db
      .from("notifications")
      .select("id, title")
      .eq("tenant_id", p.tenantId)
      .eq("kind", w.kind)
      .is("closed_at", null)
      .gte("created_at", bellWindowFrom(p.nowMs));
    if (w.sameSubject && p.subject) q = q.eq("subject_type", p.subject.type).eq("subject_id", p.subject.id);
    const found = await q;
    if (found.error) throw new Error(`cannot read the warnings a mend closes: ${found.error.message}`);
    const ids = (found.data ?? []).filter((r) => r.id !== p.keptId && w.title.test(r.title)).map((r) => r.id);
    if (!ids.length) continue;
    const up = await db
      .from("notifications")
      .update({ closed_at: new Date(p.nowMs).toISOString() })
      .eq("tenant_id", p.tenantId)
      .in("id", ids)
      .is("closed_at", null)
      .select("id");
    if (up.error) throw new Error(`cannot close the mended warnings: ${up.error.message}`);
    closed += (up.data ?? []).length;
  }
  return closed;
}
