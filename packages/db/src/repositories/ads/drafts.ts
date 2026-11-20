/**
 * A workspace's draft of a new ad (ad_drafts, 00659; the Ads plan's 4.6, 6.2 and G18): the one place the table is
 * typed, and the owner's most an ad may cost (G6), kept on the ad account. A member reads their workspace's draft
 * under its row rules; each write is a member's door, called as the member signed in, which decides who may. A
 * database that has not run 00659 keeps no draft and holds none, which is how New ad stood before it (either deploy
 * order).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { DbFailure, recordOrEmpty, type TenantId } from "@chanlytics/contracts";
import { isMissingDoor } from "../../shared/missing-door";
import { tenantDb } from "../../shared/tenant-db";
import type { Database, Json } from "../../types";

type Db = SupabaseClient<Database>;

/** The workspace's kept draft, as much of its row as New ad reads. */
export type AdDraftRow = Pick<
  Database["public"]["Tables"]["ad_drafts"]["Row"],
  "id" | "account_id" | "draft" | "kept_by" | "updated_at"
>;

/** The workspace's one kept draft, or null where none is kept. */
export async function findAdDraft(db: Db, tenantId: TenantId): Promise<AdDraftRow | null> {
  const { data, error } = await tenantDb(db, tenantId)
    .from("ad_drafts")
    .select("id, account_id, draft, kept_by, updated_at")
    .maybeSingle();
  if (error) {
    // A database that has not run 00659 keeps none.
    if (error.code === "42P01" || error.code === "PGRST205") return null;
    throw new DbFailure(error, "ad draft");
  }
  return data ?? null;
}

/** What keeping a draft came to: whether it was kept, its row, and how many owners' bells it rang. */
export interface AdDraftKept {
  kept: boolean;
  draftId: string | null;
  rung: number;
}

/**
 * The draft kept for an ad account of the workspace's, in place of the one before (ad_draft_keep): as the member
 * signed in, whom the door asks may draft, and who rings the owner's bell by leaving it. Null where the door is not
 * there yet.
 */
export async function keepAdDraft(
  db: Db,
  tenantId: TenantId,
  draft: { accountId: string; draft: Json },
): Promise<AdDraftKept | null> {
  const { data, error } = await db.rpc("ad_draft_keep", {
    p_tenant_id: tenantId,
    p_account_id: draft.accountId,
    p_draft: draft.draft,
  });
  if (error) {
    if (isMissingDoor(error)) return null;
    throw new DbFailure(error, "ad_draft_keep");
  }
  const answer = recordOrEmpty(data);
  return {
    kept: answer.kept === true,
    draftId: typeof answer.draft_id === "string" ? answer.draft_id : null,
    rung: typeof answer.rung === "number" ? answer.rung : 0,
  };
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
