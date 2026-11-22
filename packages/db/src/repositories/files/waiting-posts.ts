/**
 * A post still waiting for its time, moved to another (Campaigns › Content's post sheet, 00621). The words it goes up with,
 * as its piece's caption changes, are approvals.ts keepPieceWords (00681): the save is the approval of the new words. Apart
 * from posts.ts, which holds the placement's own doors and reads and stands at the width a module may (repo/size).
 */
import { DbFailure, recordOrEmpty } from "@chanlytics/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types";

type Db = SupabaseClient<Database>;

/** A member's Change time (00621): moved while it waits and its job is untaken, else late with where it stands. */
export async function movePostTime(
  db: Db,
  postId: string,
  when: string,
): Promise<{ fate: "moved" | "late" | "unknown" }> {
  const { data, error } = await db.rpc("post_move", { p_post_id: postId, p_when: when });
  if (error) throw new DbFailure(error, "post move");
  const fate = recordOrEmpty(data).fate;
  return { fate: fate === "moved" || fate === "late" ? fate : "unknown" };
}
