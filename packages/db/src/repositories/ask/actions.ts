/**
 * What Ask did, and why it was allowed (ask_actions, 00581): one row per card acted on, written under the member's own
 * session. It holds closed sets and ids alone, the words stay on the turn. Every write here is said to the caller as what it
 * managed, never raised over a press: a press that went and whose record failed still went, and a database before the table
 * reads as no record (isMissingDoor).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { DAY_MS, DbFailure, WEEK_MS, type TenantId } from "@chanlytics/contracts";
import type { Database } from "../../types";
import { isMissingDoor } from "../../shared/missing-door";

type Db = SupabaseClient<Database>;

/** A table this database does not have yet, as PostgREST and Postgres each say it. */
const isMissing = (error: { code: string | null }): boolean =>
  isMissingDoor(error) || error.code === "42P01" || error.code === "PGRST205";

export interface AskActionStart {
  tenantId: TenantId;
  userId: string;
  messageId: string;
  proposalId: string;
  kind: string;
  by: "press" | "yes" | "row" | "lock_screen" | "mail";
  originBy: string | null;
  strangers: boolean;
  reason: string | null;
}

/**
 * A row for a card about to be acted on. False where this card already has one (a press sent twice), or where the table is
 * not on this database yet: the caller goes on, since the verb's own key is what makes a press act once.
 */
export async function startAskAction(db: Db, a: AskActionStart): Promise<{ id: string | null; again: boolean }> {
  const { data, error } = await db
    .from("ask_actions")
    .insert({
      tenant_id: a.tenantId,
      user_id: a.userId,
      message_id: a.messageId,
      proposal_id: a.proposalId,
      kind: a.kind,
      by: a.by,
      origin_by: a.originBy,
      strangers: a.strangers,
      reason: a.reason,
    })
    .select("id")
    .maybeSingle();
  if (error) {
    if (error.code === "23505") return { id: null, again: true };
    if (isMissing(error)) return { id: null, again: false };
    throw new DbFailure(error, "ask_actions");
  }
  return { id: data?.id ?? null, again: false };
}

/** How a card's act ended. */
export async function finishAskAction(
  db: Db,
  id: string,
  end: { state: "done" | "failed" | "undone"; madeKind?: string | null; madeId?: string | null; code?: string | null },
): Promise<void> {
  const { error } = await db
    .from("ask_actions")
    .update({
      state: end.state,
      made_kind: end.madeKind ?? null,
      made_id: end.madeId ?? null,
      code: end.code ?? null,
      finished_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error && !isMissing(error)) throw new DbFailure(error, "ask_actions");
}

/** A card's undo: its row, however it was acted on. */
export async function markAskActionUndone(
  db: Db,
  tenantId: TenantId,
  messageId: string,
  proposalId: string,
): Promise<void> {
  const { error } = await db
    .from("ask_actions")
    .update({ state: "undone", finished_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("message_id", messageId)
    .eq("proposal_id", proposalId);
  if (error && !isMissing(error)) throw new DbFailure(error, "ask_actions");
}

/**
 * What the freedom check counts (contracts freedomOf): what Ask did alone in the last day, and how many of what it did alone
 * this week were undone. Nothing where the table is not there yet.
 */
export async function askAloneCounts(db: Db, tenantId: TenantId, now: Date): Promise<{ today: number; undos: number }> {
  const dayAgo = new Date(now.getTime() - DAY_MS).toISOString();
  const weekAgo = new Date(now.getTime() - WEEK_MS).toISOString();
  const [today, undos] = await Promise.all([
    db
      .from("ask_actions")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("by", "row")
      .gte("at", dayAgo),
    db
      .from("ask_actions")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("by", "row")
      .eq("state", "undone")
      .gte("at", weekAgo),
  ]);
  if (today.error && !isMissing(today.error)) throw new DbFailure(today.error, "ask_actions");
  if (undos.error && !isMissing(undos.error)) throw new DbFailure(undos.error, "ask_actions");
  return { today: today.count ?? 0, undos: undos.count ?? 0 };
}

/** What Ask did since a moment, newest first: the Activity of what it did and why (kinds, reasons and ids alone). */
export async function listAskActions(db: Db, tenantId: TenantId, since: string, limit: number) {
  const { data, error } = await db
    .from("ask_actions")
    .select(
      "id, user_id, message_id, proposal_id, kind, by, origin_by, strangers, reason, state, made_kind, made_id, at, finished_at",
    )
    .eq("tenant_id", tenantId)
    .gte("at", since)
    .order("at", { ascending: false })
    .limit(limit);
  if (error) {
    if (isMissing(error)) return [];
    throw new DbFailure(error, "ask_actions");
  }
  return data ?? [];
}
