/**
 * What a take needs of the sync (the footage sources plan: the sync keeps a folder's list and holds its account's
 * grant; the take brings in what it lists). Two things only: a folder made ready for a job, which is where an hour's
 * key comes from, and one item's own record at its provider.
 *
 * It is a seam so there is one reader of an account's token, the sync's: the refresh token stays in Vault behind it,
 * and neither the take nor the relay's key door reads a credential by itself. A folder that may not be read (paused,
 * its account signed out, whoever connected it gone) answers `skipped`, and nothing of it is fetched.
 *
 * A key its provider then refuses (a 401, a missing scope) is the sync's to settle too, by its own rule: asked for
 * anew once, and only a grant refused for good signs the account out and pauses its folders (standing.ts).
 */
import { driveSource } from "@chanlytics/channels/files";
import type { SourceItemRecord, SourceReply, TenantId } from "@chanlytics/contracts";
import type { Database } from "@chanlytics/db/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Logger } from "../../shared/log.js";
import { leaveRefusedKey, openSource, type SourceClosedBy } from "../sources/standing.js";

type Db = SupabaseClient<Database>;

/** An hour's key to the folder's account, or why the folder is not one to read now, and whose that is to mend. */
type TakeKey =
  | {
      ok: true;
      accessToken: string;
      /**
       * Whatever a call under this key threw, settled as the sync settles it for its own jobs: answers why the folder
       * is no longer read where the account is now signed out, and throws anything else on, to be tried again.
       */
      refused(error: unknown): Promise<{ skipped: string }>;
    }
  | { ok: false; skipped: string; cause: SourceClosedBy };

/** What a folder is opened for: a file taken in, or a clip that came in brought back. */
export type TakeRoad = "take" | "return";

export interface TakeSync {
  /** The item's folder made ready for a job on its road: an hour's key for its account, or why it is not read now. */
  open(db: Db, named: { tenantId: TenantId; sourceId: string }, log: Logger, road: TakeRoad): Promise<TakeKey>;
  /** One item's own record at its provider (5 of Google's units, which its asker counts). */
  record(accessToken: string, providerId: string): Promise<SourceReply<SourceItemRecord>>;
}

/**
 * The states a folder is opened in, by road. A file is taken only from a folder watched, or being set up (its first
 * walk asks for the newest as it ends). A clip that came in is brought back from those, and from a folder that was
 * stopped: its original is still read through its account's key while that account reads (the content loop PRD's F1,
 * Ruben's call 1 of 21 Nov 2026), and the sync never reads it again otherwise.
 */
const OPENED_FROM = {
  take: ["setting_up", "watching"],
  return: ["setting_up", "watching", "stopped"],
} as const satisfies Record<TakeRoad, readonly string[]>;

/**
 * The deployment's sync: what a take, a return and the key door read through unless one is handed in (a test's pretend
 * one). The folder is opened by the sync's own opener, so a take pauses what a walk or a read would pause, and reads a
 * token nowhere else.
 */
export const takeSync: TakeSync = {
  open: async (db, named, log, road) => {
    const opened = await openSource(db, named, OPENED_FROM[road], log);
    if (!opened.ok) return opened;
    return {
      ok: true,
      accessToken: opened.open.token,
      refused: (error) => leaveRefusedKey(opened.open, error),
    };
  },
  // The take counts its own units, a record's and a download's, and writes them once as its job ends.
  record: (accessToken, providerId) => driveSource().getItem(accessToken, providerId),
};
