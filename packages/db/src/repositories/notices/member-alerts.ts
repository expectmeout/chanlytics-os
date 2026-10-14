/**
 * The members' phones and what each chose for them, as the edge and Settings › Notifications read and write them: the
 * phones a call in progress is shown on (apps/edge/lib/voice/call-activity.ts), the phones a sign-out forgets (00431),
 * the kinds a member's phones are not told (memberships.push_off, 00372), who a push is for and whether it names its
 * business. Moved out of notifications.ts whole, which had grown past a file's length. A read or write that fails
 * throws, except where a database before a migration is said to read as before.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../database.types";

type Db = SupabaseClient<Database>;

/** The activity tokens of the phones whose people hold one of `roles` in the workspace (00191), each once. */
export async function activityTokensOf(db: Db, tenantId: string, roles: readonly string[]): Promise<string[]> {
  const { data: members, error: me } = await db
    .from("memberships")
    .select("user_id, push_off")
    .eq("tenant_id", tenantId)
    .in("role", [...roles]);
  if (me) throw new Error(`cannot read who is in the workspace: ${me.message}`);
  // A member who switched calls off for their phone (Settings › Notifications, push_off 'call') is not shown a call on
  // the Lock Screen either: the caller's name came up there all the same (the wiring's second audit, R11 S8-8).
  const people = (members ?? []).filter((m) => !(m.push_off ?? []).includes("call")).map((m) => m.user_id);
  if (!people.length) return [];
  const { data: devices, error: de } = await db
    .from("push_devices")
    .select("activity_token")
    .in("user_id", people)
    .not("activity_token", "is", null);
  if (de) throw new Error(`cannot read the phones: ${de.message}`);
  return [...new Set((devices ?? []).map((d) => d.activity_token).filter((t): t is string => !!t))];
}

/**
 * Forget every phone of the person signed in, as they sign out (00431; the wiring's second audit, R11 S8-3): a sign-out
 * ends every session of theirs, and their phones went on being pushed the customer's words. On the person's own session,
 * before it ends. Answers how many were forgotten, or null on a database 00431 has not reached; another failure throws.
 */
export async function forgetEveryPhone(db: Db): Promise<number | null> {
  const { data, error } = await db.rpc("push_devices_forget_all");
  if (error) {
    if (error.code === "PGRST202") return null;
    throw new Error(`cannot forget the phones: ${error.message}`);
  }
  const forgotten = (data as { forgotten?: unknown } | null)?.forgotten;
  return typeof forgotten === "number" ? forgotten : 0;
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

/**
 * Of these people, the ones who belong to more than one workspace, and the name of this one: a push to them names the
 * business it is about and leaves their icon's number as it was (contracts PushTarget; the wiring's second audit, R11
 * S8-7). On the service role, which reads every membership. A failed read throws.
 */
export async function pushNamesFor(
  db: Db,
  p: { tenantId: string; userIds: readonly string[] },
): Promise<{ inMany: ReadonlySet<string>; business: string | null }> {
  if (!p.userIds.length) return { inMany: new Set(), business: null };
  const [members, tenant] = await Promise.all([
    db
      .from("memberships")
      .select("user_id, tenant_id")
      .in("user_id", [...p.userIds]),
    db.from("tenants").select("name").eq("id", p.tenantId).maybeSingle(),
  ]);
  if (members.error) throw new Error(`cannot read whose workspaces these are: ${members.error.message}`);
  if (tenant.error) throw new Error(`cannot read the workspace's name: ${tenant.error.message}`);
  const workspaces = new Map<string, Set<string>>();
  for (const m of members.data ?? []) {
    const own = workspaces.get(m.user_id) ?? new Set<string>();
    own.add(m.tenant_id);
    workspaces.set(m.user_id, own);
  }
  return {
    inMany: new Set([...workspaces].filter(([, own]) => own.size > 1).map(([user]) => user)),
    business: tenant.data?.name?.trim() || null,
  };
}
