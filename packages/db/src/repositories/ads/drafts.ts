/**
 * A workspace's draft of a new ad (ad_drafts, 00659; the Ads plan's 4.6, 6.2 and G18): the one place the table is
 * typed, the ad writer out for its words (00669), and the owner's most an ad may cost (G6), kept on the ad account. A
 * member reads their workspace's draft under its row rules; each write is a member's door, called as the member signed
 * in, which decides who may. A database that has not run 00659 keeps no draft and holds none, which is how New ad stood
 * before it; one that has not run 00669 marks no writer and keeps as before (either deploy order).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { DbFailure, recordOrEmpty, type TenantId } from "@chanlytics/contracts";
import { isMissingDoor } from "../../shared/missing-door";
import { tenantDb } from "../../shared/tenant-db";
import type { Database, Json } from "../../types";

type Db = SupabaseClient<Database>;

/** The workspace's kept draft, as much of its row as New ad reads: with the writer out for its words, while one is. */
export type AdDraftRow = Pick<
  Database["public"]["Tables"]["ad_drafts"]["Row"],
  "id" | "account_id" | "draft" | "kept_by" | "updated_at" | "writing_ask" | "writing_until"
>;

const DRAFT_COLUMNS = "id, account_id, draft, kept_by, updated_at";

/** The workspace's one kept draft, or null where none is kept. */
export async function findAdDraft(db: Db, tenantId: TenantId): Promise<AdDraftRow | null> {
  const { data, error } = await tenantDb(db, tenantId)
    .from("ad_drafts")
    .select(`${DRAFT_COLUMNS}, writing_ask, writing_until`)
    .maybeSingle();
  if (!error) return data ?? null;
  // A database that has not run 00659 keeps none; one before 00669 has no writer to say.
  if (error.code === "42P01" || error.code === "PGRST205") return null;
  if (error.code !== "42703") throw new DbFailure(error, "ad draft");
  const before = await tenantDb(db, tenantId).from("ad_drafts").select(DRAFT_COLUMNS).maybeSingle();
  if (before.error) throw new DbFailure(before.error, "ad draft");
  return before.data ? { ...before.data, writing_ask: null, writing_until: null } : null;
}

/** What keeping a draft came to: whether it was kept, its row, and how many owners' bells it rang. */
export interface AdDraftKept {
  kept: boolean;
  draftId: string | null;
  rung: number;
  /** Not kept: the draft read before is no longer the one kept, or is gone (its keep named it, `readAt`). */
  newer: boolean;
}

/**
 * The draft kept for an ad account of the workspace's, in place of the one before (ad_draft_keep): as the member
 * signed in, whom the door asks may draft, and who rings the owner's bell by leaving it. With `readAt`, the kept
 * draft's `updated_at` as it was read (null where none was kept), nothing is written over another kept since, nor is
 * one gone since brought back: the answer says `newer`. Null where the door is not there yet.
 */
export async function keepAdDraft(
  db: Db,
  tenantId: TenantId,
  draft: { accountId: string; draft: Json; readAt?: string | null },
): Promise<AdDraftKept | null> {
  const args = { p_tenant_id: tenantId, p_account_id: draft.accountId, p_draft: draft.draft };
  const named = draft.readAt === undefined ? args : { ...args, p_read_at: draft.readAt ?? "-infinity" };
  let { data, error } = await db.rpc("ad_draft_keep", named);
  // A database before 00669 takes no p_read_at: kept as before.
  if (error && isMissingDoor(error) && named !== args) ({ data, error } = await db.rpc("ad_draft_keep", args));
  if (error) {
    if (isMissingDoor(error)) return null;
    throw new DbFailure(error, "ad_draft_keep");
  }
  const answer = recordOrEmpty(data);
  return {
    kept: answer.kept === true,
    draftId: typeof answer.draft_id === "string" ? answer.draft_id : null,
    rung: typeof answer.rung === "number" ? answer.rung : 0,
    newer: answer.newer === true,
  };
}

/** The ad writer an ask is, out for a draft's words: the ask, the words it writes, and until when it is waited for. */
export interface AdDraftWriting {
  ask: string;
  for: string;
  until: string;
}

/** What marking a writer came to: marked; another ask out for the same words, to wait for; or no draft to mark. */
export type AdDraftWriter = { held: true } | { held: false; out: { ask: string; until: string } | null };

/**
 * An ask marks itself the kept draft's writer (ad_draft_writing, 00669), unless another is out for the same words in
 * its time, which it answers. Null where the door is not there yet: no writer is marked, and none waited for.
 */
export async function markAdDraftWriting(
  db: Db,
  tenantId: TenantId,
  writing: AdDraftWriting,
): Promise<AdDraftWriter | null> {
  const { data, error } = await db.rpc("ad_draft_writing", {
    p_tenant_id: tenantId,
    p_ask: writing.ask,
    p_for: writing.for,
    p_until: writing.until,
  });
  if (error) {
    if (isMissingDoor(error)) return null;
    throw new DbFailure(error, "ad_draft_writing");
  }
  const answer = recordOrEmpty(data);
  if (answer.held === true) return { held: true };
  const out =
    typeof answer.ask === "string" && typeof answer.until === "string"
      ? { ask: answer.ask, until: answer.until }
      : null;
  return { held: false, out };
}

/** The writer an ask marked is back: its mark goes, where it is still that ask's (ad_draft_written, 00669). */
export async function endAdDraftWriting(db: Db, tenantId: TenantId, ask: string): Promise<void> {
  const { error } = await db.rpc("ad_draft_written", { p_tenant_id: tenantId, p_ask: ask });
  if (error && !isMissingDoor(error)) throw new DbFailure(error, "ad_draft_written");
}

/**
 * The most any ad may cost, as the owner said it, kept on the connected account in its minor units (ad_account_most).
 * The owner's alone, which the door asks. Whether a connected account took it; null where the door is not there yet.
 */
export async function keepAdMost(db: Db, tenantId: TenantId, mostMinor: number): Promise<boolean | null> {
  const { data, error } = await db.rpc("ad_account_most", { p_tenant_id: tenantId, p_most_minor: mostMinor });
  if (error) {
    if (isMissingDoor(error)) return null;
    throw new DbFailure(error, "ad_account_most");
  }
  return data === true;
}
