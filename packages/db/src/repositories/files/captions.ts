/**
 * A made piece's caption, as the owner wrote it where it stands (Campaigns › Content, Details): kept with how the piece was
 * made, for the service role alone, which a member's session has no grant to write (00553, 00613). The caller has read the
 * file under the member's own RLS first, so a caption is only ever kept for a piece of their own workspace.
 */
import { DbFailure, recordOrNull, type TenantId } from "@chanlytics/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types";
import { jsonCopyOf } from "../../shared/json";

type Db = SupabaseClient<Database>;

/** A post's: on how it was made (`files.made`), beside its plan. Answers whether there was a post to keep it on. */
export async function keepPostCaption(db: Db, tenantId: TenantId, id: string, caption: string): Promise<boolean> {
  const { data, error } = await db
    .from("files")
    .select("made")
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .eq("source", "made")
    .is("removed_at", null)
    .maybeSingle();
  if (error) throw new DbFailure(error, "post caption");
  const made = recordOrNull(data?.made);
  if (!made) return false;
  const { error: kept } = await db
    .from("files")
    .update({ made: jsonCopyOf({ ...made, caption }), updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("id", id);
  if (kept) throw new DbFailure(kept, "post caption kept");
  return true;
}

/**
 * A video's: on the plan it was drawn by, the newest should a card's try before have named the file too, where the page and
 * Ask already read its caption (pieces.ts findPiecePlanOfFile). Answers whether there was a plan to keep it on.
 */
export async function keepVideoCaption(db: Db, tenantId: TenantId, fileId: string, caption: string): Promise<boolean> {
  const { data, error } = await db
    .from("pieces")
    .select("id, plan")
    .eq("tenant_id", tenantId)
    .eq("file_id", fileId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new DbFailure(error, "video caption");
  const plan = recordOrNull(data?.plan);
  if (!data || !plan) return false;
  const { error: kept } = await db
    .from("pieces")
    .update({ plan: jsonCopyOf({ ...plan, caption }), updated_at: new Date().toISOString() })
    .eq("id", data.id);
  if (kept) throw new DbFailure(kept, "video caption kept");
  return true;
}
