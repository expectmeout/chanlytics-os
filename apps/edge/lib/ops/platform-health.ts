/**
 * What GET /api/health judges, read: each clock's health and the job ledger's backlog, side by side (packages/db ops),
 * and beside them whether this build can draw a video at all. The door holds no client of its own (DOOR_FORBIDS), so the
 * read is here and the judgement stays the door's.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { PIECE_TEMPLATE } from "@chanlytics/contracts";
import { findPieceImage } from "@chanlytics/db/files";
import type { Database } from "@chanlytics/db/types";
import { readJobsBacklog, readSweepHealth } from "@chanlytics/db/ops";
import { logAndGoOn } from "@chanlytics/log";

/** The client's calls the judgement needs, so a test can hand it a fake that answers them. */
export type HealthDb = Pick<SupabaseClient<Database>, "rpc" | "from">;

/**
 * Whether the machine image the videos are drawn on is on record for the template this build draws with (decisions 0122
 * and 0126). A person builds and records one for each edition of the template (tooling/video/README.md), before the
 * change that needs it merges; a build that got ahead of its image can make no video, and each one asked for waits half
 * an hour and fails (lib/files/piece-make.ts). Null where it could not be read: unknown is not missing.
 */
function readVideoMachine(db: HealthDb): Promise<boolean | null> {
  return findPieceImage(db, PIECE_TEMPLATE.edition).then(
    (image) => image !== null,
    logAndGoOn("reading the machine image the videos are drawn on", null),
  );
}

/** Each clock's health and the job ledger's backlog, and whether the videos' machine image is on record, read side by side. */
export function readPlatformHealth(db: HealthDb) {
  return Promise.all([readSweepHealth(db), readJobsBacklog(db), readVideoMachine(db)]);
}
