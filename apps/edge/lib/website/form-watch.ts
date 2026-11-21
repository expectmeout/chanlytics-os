/**
 * A website form's entry that told nobody (00675; the Forms plan's 3.14): one accepted more than ten minutes ago whose
 * owner has no notice of it yet, the notice's step failing or never run. The health sweep (lib/ops/health-sweep.ts)
 * looks every half hour and pages the platform, once a window while it lasts: the page names how many and the oldest,
 * and the workspaces by id, never a person or what they sent. The failing step itself shows in Health, Background work,
 * by its subscriber, and Deliver again reaches it.
 */
import { MIN_MS } from "@chanlytics/contracts";
import { listUntoldFormEntries } from "@chanlytics/db/people";
import { logAndGoOn } from "@chanlytics/log";
import { pageOperator } from "../shared/alerts/page-operator.js";
import { logger } from "../shared/log.js";
import type { pg } from "../shared/pg.js";

type Db = NonNullable<ReturnType<typeof pg>>;

/** How long an accepted entry may wait for its owner's notice before the platform is paged. */
const UNTOLD_AFTER_MS = 10 * MIN_MS;

/** The most entries one look reads: enough to say how many workspaces, never everyone. */
const UNTOLD_READ = 50;

/** The entries that told nobody in time, paged; how many it found (null where the read failed, which is said). */
export async function watchFormEntries(db: Db, nowMs: number): Promise<number | null> {
  const untold = await listUntoldFormEntries(db, new Date(nowMs - UNTOLD_AFTER_MS).toISOString(), UNTOLD_READ).catch(
    logAndGoOn("reading the website entries nobody was told of", null),
  );
  if (!untold || untold.length === 0) return untold ? 0 : null;
  const oldest = untold[0]?.created_at ?? "";
  const workspaces = [...new Set(untold.map((e) => e.tenant_id))];
  logger().error("form_entry_untold", { count: untold.length, oldest, workspaces: workspaces.length });
  await pageOperator(
    { db },
    "form_entries_untold",
    `${untold.length === UNTOLD_READ ? `${UNTOLD_READ} or more` : untold.length} website form entries told nobody`,
    `Accepted more than ten minutes ago, the oldest at ${oldest}, in ${workspaces.length} workspace(s): ${workspaces.join(", ")}. ` +
      "Each one's notice step is in Health, Background work, under form entry notice; once it is mended, Deliver again tells them.",
  );
  return untold.length;
}
