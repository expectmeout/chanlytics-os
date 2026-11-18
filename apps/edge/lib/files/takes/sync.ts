/**
 * What a take needs of the sync (the footage sources plan: the sync keeps a folder's list and holds its account's
 * grant; the take brings in what it lists). Two things only: a folder made ready for a job, which is where an hour's
 * key comes from, and one item's own record at its provider.
 *
 * It is a seam so there is one reader of an account's token, the sync's: the refresh token stays in Vault behind it,
 * and neither the take nor the relay's key door reads a credential by itself. A folder that may not be read (paused,
 * its account signed out, whoever connected it gone) answers `skipped`, and nothing of it is fetched.
 */
import type { SourceItemRecord, SourceReply, TenantId } from "@chanlytics/contracts";
import type { Database } from "@chanlytics/db/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Logger } from "../../shared/log.js";

type Db = SupabaseClient<Database>;

/** An hour's key to the folder's account, or why the folder is not one to read now. */
type TakeKey = { ok: true; accessToken: string } | { ok: false; skipped: string };

export interface TakeSync {
  /** The item's folder made ready for a job: an hour's key for its account, or why it is not read now. */
  open(db: Db, named: { tenantId: TenantId; sourceId: string }, log: Logger): Promise<TakeKey>;
  /** One item's own record at its provider (5 of Google's units). */
  record(accessToken: string, providerId: string): Promise<SourceReply<SourceItemRecord>>;
}

/**
 * The deployment's sync: what a take and the key door read through unless one is handed in (a test's pretend one).
 * Until the sync itself is on this deployment, no folder is read: every take waits, and the key door opens nothing.
 */
export const takeSync: TakeSync = {
  open: () => Promise.resolve({ ok: false, skipped: "no folder is read on this deployment" }),
  record: () => Promise.reject(new Error("source_take: no folder is read on this deployment")),
};
