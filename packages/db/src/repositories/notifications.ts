/**
 * What a person is told, as the edge reads and writes it: a kept notification taken back (apps/edge/lib/ops/notify.ts),
 * and the phones a call in progress is shown on (apps/edge/lib/voice/call-activity.ts). A read or write that fails
 * throws.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { HOUR_MS, MIN_MS } from "@chanlytics/contracts";
import type { Database } from "../database.types";

type Db = SupabaseClient<Database>;

/**
 * The one place a bell's row is taken back: a notice told exactly once (notifyOnce) whose mail failed takes its row
 * back, so asking again leaves no twin on the bell.
 */
export async function forgetNotification(db: Db, p: { tenantId: string; id: string }): Promise<void> {
  const { error } = await db.from("notifications").delete().eq("tenant_id", p.tenantId).eq("id", p.id);
  if (error) throw new Error(`cannot take the notification back: ${error.message}`);
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
 * Whether the workspace was already told of this hold: the notice answering this event, or (while an edge from before
 * decision 0043 still tells inline) a handoff about this thread kept within a minute of the event. A read that fails
 * throws: "could not check" is not "never told".
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
    .gte("created_at", since)
    .limit(1);
  if (inline.error) throw new Error(`cannot read what the workspace was told: ${inline.error.message}`);
  return (inline.data ?? []).length > 0;
}
