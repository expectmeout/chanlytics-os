/**
 * A workspace's colour saved and taken away (00490, decision 0075): one #rrggbb its emails to customers and the pages
 * they open draw the button and the links in. Set through the workspace's own door on the member's own session, so the
 * database decides who may (whoever may change the workspace's settings), as the logo is (logo/logo.ts). The route is
 * its declaration (who may, how often); this is what it does.
 */
import "server-only";
import { AppError, LOOK_WORDS, accentOk } from "@chanlytics/contracts";
import { setWorkspaceAccent } from "@chanlytics/db";
import type { Member } from "@/server/route";
import type { RouteContext } from "@/server/with-route";
import { doorRefusal } from "./logo/logo";

/** PUT workspaces/accent: the colour, lower-cased, as the route's schema held it; DELETE: null, and ink stands in. */
export async function saveAccent(
  ctx: RouteContext,
  member: Member,
  accent: string | null,
): Promise<{ accent: string | null }> {
  const kept = accent === null ? null : accent.trim().toLowerCase();
  if (kept !== null && !accentOk(kept)) throw new AppError("validation", LOOK_WORDS.unusable);
  const { error } = await setWorkspaceAccent(ctx.supabase, member.tenantId, kept);
  if (error) throw doorRefusal(error);
  return { accent: kept };
}
