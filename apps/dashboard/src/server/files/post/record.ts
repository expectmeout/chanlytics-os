/**
 * What a kept post remembers (decision 0099, step 3): the photo it came from and what it was asked to be, so a later version starts
 * from what this one did, and Ask keeps the look a person settled on. A member's session has no grant on `made` (00553), so the
 * service role reads it, and only after the caller's own read of the row said it is theirs to see, or for their own workspace.
 */
import "server-only";
import { postPlanOf, recordOrNull, type FileRecordDto, type PostPlan } from "@chanlytics/contracts";
import { fileMadeOf, fileOf, filePostedOf, newestMadeOf, type FileMemberRow } from "@chanlytics/db";
import { connectionFor } from "@/server/connections/google";
import { log } from "@/server/shared/log";
import { fileDtoOf } from "@/server/readers/files";
import type { Member } from "@/server/shared/route";
import { serviceDb } from "@/server/shared/service-db";
import type { RouteContext } from "@/server/shared/with-route";

/** GET files/[id]: one file, and for a post what it came from and what it was asked to be. */
export async function fileRecord(ctx: RouteContext, member: Member, row: FileMemberRow): Promise<FileRecordDto> {
  const file = fileDtoOf(row);
  if (row.source !== "made") return { file, made: null, google: null };
  const [kept, connection, posted] = await Promise.all([
    fileMadeOf(serviceDb(), member.tenantId, row.id),
    connectionFor(ctx.supabase, member.tenantId),
    filePostedOf(serviceDb(), member.tenantId, row.id),
  ]);
  const google = { connected: !!connection?.location_name, posted };
  const made = recordOrNull(kept);
  if (!made) return { file, made: null, google };
  // Read under the caller's RLS: a photo removed since, or one they can't see, is no photo to name.
  const from = typeof made.from === "string" ? await fileOf(ctx.supabase, made.from) : null;
  return {
    file,
    made: {
      from: from ? { id: from.id, name: from.name } : null,
      plan: postPlanOf(recordOrNull(made.plan) ?? {}),
    },
    google,
  };
}

/** The look a person settled on, as their newest post keeps it: what a card changed, since a card's Save keeps what was pressed. */
type PostLook = Pick<PostPlan, "voice" | "layout" | "book">;

/** What the workspace's newest post looks like, or null before its first. Never costs a turn: a failed read is no look to keep. */
export async function newestPostLookOf(tenantId: string): Promise<PostLook | null> {
  try {
    const made = recordOrNull(await newestMadeOf(serviceDb(), tenantId));
    const plan = recordOrNull(made?.plan);
    if (!plan) return null;
    const { voice, layout, book } = postPlanOf(plan);
    return { voice, layout, book };
  } catch (e) {
    log.warn("file_post_look_failed", { tenant_id: tenantId, error: e instanceof Error ? e.message : String(e) });
    return null;
  }
}
