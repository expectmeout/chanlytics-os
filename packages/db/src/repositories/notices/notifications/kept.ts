/** Notifications: kept. */

import type { SupabaseClient } from "@supabase/supabase-js";
import { HOUR_MS, MIN_MS, type OptOutPerson, UUID } from "@chanlytics/contracts";
import type { Database } from "../../../database.types";
import { DELIVERED } from "../../conversations/thread/history";

export type Db = SupabaseClient<Database>;

/**
 * The one place a bell's row is taken back: a notice told exactly once (notifyOnce) that nothing can find again takes its
 * row back when its mail failed, so asking again leaves no twin on the bell. A notice that can be found again (it keeps
 * the event it answers, or says what it is about) is never taken back: its mail is owed instead (`mail_due_at`, 00409),
 * and the retry sends the mail alone.
 */
export async function forgetNotification(db: Db, params: { tenantId: string; id: string }): Promise<void> {
  const { error } = await db.from("notifications").delete().eq("tenant_id", params.tenantId).eq("id", params.id);
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
  params: { tenantId: string; userId: string; threadId: string; title: string; body: string },
): Promise<void> {
  const { error } = await db.from("notifications").insert({
    tenant_id: params.tenantId,
    kind: "ask_cards",
    title: params.title.slice(0, 200),
    body: params.body.slice(0, 4000),
    route: "today",
    subject_type: "ask_thread",
    subject_id: params.threadId,
    recipient_user_id: params.userId,
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
export async function findNotice(
  db: Db,
  params: {
    tenantId: string;
    sourceEvent?: string | null;
    kind: string;
    subjectType?: string | null;
    subjectId?: string | null;
    /** The notice's title as kept: a retry of the same notice says the same, so a different notice about the subject is not taken for it. */
    title?: string;
  },
): Promise<KeptNotice | null> {
  const base = db.from("notifications").select("id, kind, mail_due_at").eq("tenant_id", params.tenantId);
  const found = params.sourceEvent
    ? await base.eq("source_event", params.sourceEvent).limit(1)
    : params.subjectType && params.subjectId && params.title
      ? await base
          .eq("kind", params.kind)
          .eq("subject_type", params.subjectType)
          .eq("subject_id", params.subjectId)
          .eq("title", params.title)
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
export async function recordMailSent(
  db: Db,
  params: { tenantId: string; id: string; words?: { title: string; body: string } },
): Promise<void> {
  const { error } = await db
    .from("notifications")
    .update({
      mail_due_at: null,
      ...(params.words ? { title: params.words.title.slice(0, 200), body: params.words.body.slice(0, 4000) } : {}),
    })
    .eq("tenant_id", params.tenantId)
    .eq("id", params.id);
  if (error) throw new Error(`cannot record that the notice was mailed: ${error.message}`);
}

/**
 * Whether the workspace has already kept a notice of this kind about this subject (`subject_type`, `subject_id`). The
 * notification door keeps no memory of what it told, so news owed once a day -- a playbook that could not run, said at the
 * day's last chance -- is keyed by what it is about and asked here first. A read that fails throws: "could not check" is
 * not "never told".
 */
export async function wasNoticeKept(
  db: Db,
  params: { tenantId: string; kind: string; subjectType: string; subjectId: string },
): Promise<boolean> {
  const { data, error } = await db
    .from("notifications")
    .select("id")
    .eq("tenant_id", params.tenantId)
    .eq("kind", params.kind)
    .eq("subject_type", params.subjectType)
    .eq("subject_id", params.subjectId)
    .limit(1);
  if (error) throw new Error(`cannot read what the workspace was told: ${error.message}`);
  return (data ?? []).length > 0;
}

/**
 * The reviews the bell's notices name, by their row or by Google's own id, with whether each has a reply: what Ask's read of
 * the notices judges a new review's row by (contracts noticeStillWaits), as the bell does by Google's read (the wiring's
 * second audit, R13 X5-1). A read that fails throws.
 */
export async function listReviewsNamed(
  db: Db,
  tenantId: string,
  ids: readonly string[],
): Promise<{ id: string; reviewId: string; replied: boolean }[]> {
  if (!ids.length) return [];
  const rowIds = ids.filter((id) => UUID.test(id));
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
interface HoldFactsRead {
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
export const oneOr = <T>(r: { data: T[] | null; error: { message: string } | null }, text: string): T | null => {
  if (r.error) throw new Error(`cannot read ${text}: ${r.error.message}`);
  return r.data?.[0] ?? null;
};

/**
 * A hold's notice, read from its rows (decision 0043): the open hold (by its thread, or by its own id for a change), the
 * person, their latest words in the thread and what the receptionist wrote after them, and the pause when it runs.
 * Null when the hold is no longer open: a hold answered before its notice tells nobody. A read that fails throws.
 */
export async function holdFactsOf(
  db: Db,
  tenantId: string,
  ref: HoldRef,
  nowMs: number,
): Promise<HoldFactsRead | null> {
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
  params: { tenantId: string; eventId: string; conversationId: string; at: string },
): Promise<boolean> {
  const answered = await db
    .from("notifications")
    .select("id")
    .eq("tenant_id", params.tenantId)
    .eq("source_event", params.eventId)
    .is("mail_due_at", null)
    .limit(1);
  if (answered.error) throw new Error(`cannot read what the workspace was told: ${answered.error.message}`);
  if ((answered.data ?? []).length) return true;
  const since = new Date(Date.parse(params.at) - MIN_MS).toISOString();
  const inline = await db
    .from("notifications")
    .select("id")
    .eq("tenant_id", params.tenantId)
    .eq("kind", "handoff")
    .eq("subject_type", "conversation")
    .eq("subject_id", params.conversationId)
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
export async function findPersonFacts(db: Db, tenantId: string, contactId: string): Promise<OptOutPerson | null> {
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
export async function wasOptOutTold(
  db: Db,
  params: { tenantId: string; eventId: string; contactId: string; at: string },
): Promise<boolean> {
  const answered = await db
    .from("notifications")
    .select("id")
    .eq("tenant_id", params.tenantId)
    .eq("source_event", params.eventId)
    .is("mail_due_at", null)
    .limit(1);
  if (answered.error) throw new Error(`cannot read what the workspace was told: ${answered.error.message}`);
  if ((answered.data ?? []).length) return true;
  const since = new Date(Date.parse(params.at) - MIN_MS).toISOString();
  const twin = await db
    .from("notifications")
    .select("id")
    .eq("tenant_id", params.tenantId)
    .eq("kind", "opted_out")
    .eq("subject_type", "contact")
    .eq("subject_id", params.contactId)
    .neq("source_event", params.eventId)
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
export async function wasEventTold(db: Db, params: { tenantId: string; eventId: string }): Promise<boolean> {
  const answered = await db
    .from("notifications")
    .select("id")
    .eq("tenant_id", params.tenantId)
    .eq("source_event", params.eventId)
    .is("mail_due_at", null)
    .limit(1);
  if (answered.error) throw new Error(`cannot read what the workspace was told: ${answered.error.message}`);
  return (answered.data ?? []).length > 0;
}

/** A notice put on the workspace's bell, its id back. */
export const insertNotification = async (db: Db, row: Database["public"]["Tables"]["notifications"]["Insert"]) =>
  db.from("notifications").insert(row).select("id").single();
