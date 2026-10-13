/**
 * What a person is told, as the edge reads and writes it: a kept notification taken back (apps/edge/lib/ops/notify.ts),
 * and the phones a call in progress is shown on (apps/edge/lib/voice/call-activity.ts). A read or write that fails
 * throws.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CATCH_UP_VISITS,
  HOUR_MS,
  MIN_MS,
  SAME_VISIT_MS,
  sameVisitOnRecord,
  sightingStands,
  type BookedVisit,
  type BookingVia,
  type MemberJoined,
  type OptOutPerson,
} from "@chanlytics/contracts";
import type { Database } from "../database.types";
import { DELIVERED } from "./thread";

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

export async function activityTokensOf(db: Db, tenantId: string, roles: readonly string[]): Promise<string[]> {
  const { data: members, error: me } = await db
    .from("memberships")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .in("role", [...roles]);
  if (me) throw new Error(`cannot read who is in the workspace: ${me.message}`);
  const people = (members ?? []).map((m) => m.user_id);
  if (!people.length) return [];
  const { data: devices, error: de } = await db
    .from("push_devices")
    .select("activity_token")
    .in("user_id", people)
    .not("activity_token", "is", null);
  if (de) throw new Error(`cannot read the phones: ${de.message}`);
  return [...new Set((devices ?? []).map((d) => d.activity_token).filter((t): t is string => !!t))];
}

/** Forget activity tokens Apple says are gone (410), so no later call tries them again. */
export async function forgetActivityTokens(db: Db, tokens: readonly string[]): Promise<void> {
  if (!tokens.length) return;
  const { error } = await db
    .from("push_devices")
    .update({ activity_token: null })
    .in("activity_token", [...tokens]);
  if (error) throw new Error(`cannot forget the gone activity tokens: ${error.message}`);
}

/** What a member chose for their phones in one workspace, and their phones, as Settings › Notifications reads them. */
export interface MemberAlertsRow {
  /** The kinds their phones are not told (memberships.push_off, 00372), as stored; contracts reads them leniently. */
  pushOff: string[];
  phones: { platform: string; app_version: string | null; last_seen_at: string | null }[];
  /** False where 00372 is not applied yet: the column is not there to read, so there is no choice to save. */
  choosable: boolean;
}

/** A column the database does not have yet (Postgres' undefined_column): a migration not applied. */
const UNDEFINED_COLUMN = "42703";

/**
 * The member's phone choices in one workspace and their phones, on the SESSION client: their own membership row and
 * their own phones are what its row policies let them read (memberships_self_select, push_devices_own_select). A read
 * that fails throws, except the one a database without 00372 answers, which reads as no choice yet.
 */
export async function memberAlertsOf(db: Db, p: { tenantId: string; userId: string }): Promise<MemberAlertsRow> {
  const [mine, phones] = await Promise.all([
    db.from("memberships").select("push_off").eq("tenant_id", p.tenantId).eq("user_id", p.userId).maybeSingle(),
    db
      .from("push_devices")
      .select("platform, app_version, last_seen_at")
      .eq("user_id", p.userId)
      .order("last_seen_at", { ascending: false, nullsFirst: false }),
  ]);
  if (phones.error) throw new Error(`cannot read your phones: ${phones.error.message}`);
  if (mine.error && mine.error.code !== UNDEFINED_COLUMN)
    throw new Error(`cannot read your alert choices: ${mine.error.message}`);
  return {
    pushOff: mine.error ? [] : (mine.data?.push_off ?? []),
    phones: (phones.data ?? []).map((d) => ({
      platform: d.platform,
      app_version: d.app_version,
      last_seen_at: d.last_seen_at,
    })),
    choosable: !mine.error,
  };
}

/** Save the kinds the caller's phones are not told in one workspace (member_push_off_set): the list as kept. Throws its refusal. */
export async function setMemberPushOff(db: Db, p: { tenantId: string; kinds: readonly string[] }): Promise<string[]> {
  const { data, error } = await db.rpc("member_push_off_set", { p_tenant_id: p.tenantId, p_kinds: [...p.kinds] });
  if (error) throw error;
  return data ?? [];
}

/**
 * Which members' phones are told a row of this kind: everyone in the workspace (`userIds` null) or the members named
 * (a note's one reader), less each who turned the kind off for their phones (memberships.push_off, 00372). On a
 * database without 00372 the column is not there, and every one of them is told, as before. A failed read throws.
 */
export async function membersPushedFor(
  db: Db,
  p: { tenantId: string; userIds: readonly string[] | null; kind: string },
): Promise<string[]> {
  if (p.userIds && !p.userIds.length) return [];
  const ids = p.userIds ? [...p.userIds] : null;
  const chosen = ids
    ? await db.from("memberships").select("user_id, push_off").eq("tenant_id", p.tenantId).in("user_id", ids)
    : await db.from("memberships").select("user_id, push_off").eq("tenant_id", p.tenantId);
  if (!chosen.error)
    return (chosen.data ?? []).filter((m) => !(m.push_off ?? []).includes(p.kind)).map((m) => m.user_id);
  if (chosen.error.code !== UNDEFINED_COLUMN)
    throw new Error(`cannot read who is in the workspace: ${chosen.error.message}`);
  // Before 00372: everyone named, or everyone in the workspace, as before there was a choice.
  if (ids) return ids;
  const all = await db.from("memberships").select("user_id").eq("tenant_id", p.tenantId);
  if (all.error) throw new Error(`cannot read who is in the workspace: ${all.error.message}`);
  return (all.data ?? []).map((m) => m.user_id);
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
 * tells what stands. So is a visit of the calendar's that is linked to nobody now: the owner's own entry, never a customer's
 * booking (contracts visit-news.ts asks it of the event too). A read that fails throws.
 */
export async function bookedVisitsOf(
  db: Db,
  tenantId: string,
  ids: readonly string[],
  nowMs: number,
): Promise<BookedVisit[]> {
  if (ids.length === 0) return [];
  const { data, error } = await db
    .from("appointments")
    .select("id, starts_at, ends_at, all_day, timezone, source, client_name, service, contact_id")
    .eq("tenant_id", tenantId)
    .in("id", [...ids])
    .eq("status", "booked")
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
