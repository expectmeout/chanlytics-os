/**
 * A post still waiting for its time, changed after it was set (Campaigns › Content's post sheet): the words it goes up with,
 * as its piece's caption changes, and its time (00621). Apart from posts.ts, which holds the placement's own doors and reads
 * and stands at the width a module may (repo/size).
 */
import { DbFailure, recordOrEmpty, type TenantId } from "@chanlytics/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types";

type Db = SupabaseClient<Database>;

/**
 * The words a post still waiting for its time goes up with, as the owner changed the caption after they set it. A post keeps
 * its own words (00611), read as its job makes it (the edge's instagram/post-ready.ts, google/post-later.ts), so only one
 * still queued takes them: once Instagram is making it ready it holds what it was made with. Never a story, which shows
 * none. The service role's alone, once the caller's own read of the file under RLS said it is theirs (the dashboard's
 * posts/caption.ts); like a move, it holds only where the post still stands queued. Answers how many took them.
 */
export async function followPostCaption(
  db: Db,
  tenantId: TenantId,
  fileId: string,
  caption: string | null,
): Promise<number> {
  const { data, error } = await db
    .from("posts")
    .update({ caption, updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("file_id", fileId)
    .eq("status", "queued")
    .neq("kind", "story")
    .select("id");
  if (error) throw new DbFailure(error, "post caption followed");
  return data.length;
}

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
