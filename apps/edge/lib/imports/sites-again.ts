/**
 * A business's website read again on its own, once a month (decision 0134, amended: E4), so the photos and videos it shows
 * since come into the Library with no link pasted, and what Check offers follows the site as it stands. The health sweep's
 * pass, every half hour: a few of the workspaces whose site was last tried a month ago or more, the longest waiting first
 * (db listSitesToReadAgain), each read as an owner's save reads it (website_read), a little apart. Saving a new website reads
 * it at once already (the dashboard's settings write); this is the read nobody asks for.
 *
 * A monthly read that fails keeps nothing (readWebsite's `again`): the last good read stands, and the try is on the ledger,
 * so the site waits another month. A workspace that names no website now has that said on the ledger, for the same reason.
 *
 * Its reach: SITES_AGAIN_TAKES a pass, 48 passes a day, so 480 sites a day and 14,400 a month: past that many workspaces the
 * month stretches until this is raised. Each read is a few pages and one small model call, platform-spent.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { DAY_MS, SECOND_MS, WEBSITE_UNREAD_WORDS, feedUrlOk } from "@chanlytics/contracts";
import { listSitesToReadAgain, noteImport } from "@chanlytics/db/imports";
import type { Database } from "@chanlytics/db/types";
import { scheduleJobOnce } from "@chanlytics/jobs";
import { errField, logger } from "../shared/log.js";
import { findWorkspaceWebsite } from "./website-read.js";

type Db = SupabaseClient<Database>;

/** How long a site waits between its reads on their own. */
export const SITE_READ_AGAIN_MS = 30 * DAY_MS;
/** The most sites one pass asks to be read. */
export const SITES_AGAIN_TAKES = 10;
/** How far apart a pass's reads start, so ten sites are not read in one minute. */
const SITES_AGAIN_PACE_MS = 30 * SECOND_MS;

/**
 * The pass: the sites due, each asked to be read again, or said on the ledger to have no website now. Answers how many were
 * asked. It catches its own failure: nothing else the sweep does waits on it.
 */
export async function readSitesAgain(db: Db, nowMs = Date.now()): Promise<number> {
  try {
    const due = await listSitesToReadAgain(db, {
      triedBefore: new Date(nowMs - SITE_READ_AGAIN_MS).toISOString(),
      limit: SITES_AGAIN_TAKES,
    });
    let readsAsked = 0;
    for (const tenantId of due) {
      const url = feedUrlOk(await findWorkspaceWebsite(db, tenantId));
      if (!url) {
        // Its run's start is stamped as a try, so it waits a month like any other.
        await noteImport(db, { tenantId, source: "website_media", state: "queued" });
        await noteImport(db, {
          tenantId,
          source: "website_media",
          state: "failed",
          error: WEBSITE_UNREAD_WORDS.address,
        });
        continue;
      }
      await scheduleJobOnce(db, {
        tenantId,
        kind: "website_read",
        dueAt: new Date(nowMs + readsAsked * SITES_AGAIN_PACE_MS),
        payload: { url, again: true },
      });
      readsAsked += 1;
    }
    return readsAsked;
  } catch (e) {
    logger({}).error("sites_again_failed", { error: errField(e) });
    return 0;
  }
}
