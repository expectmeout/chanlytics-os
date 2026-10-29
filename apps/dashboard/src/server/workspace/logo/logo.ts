/**
 * A workspace's logo saved and taken away (00407). The picture is made in the browser and remade here from its pixels
 * (png.ts), stored by the service role in the public workspace-logos bucket under a name no earlier picture had, and its
 * address set through the workspace's one door on the member's own session, so the database decides who may: whoever may
 * change the workspace's settings, a partner only on a session that showed its second factor. The door answers the
 * address it held, and that file is removed once the new one is the workspace's, never before and never another
 * workspace's. A picture stored for a save the door refused is removed at once, so nothing is left public that no
 * workspace wears.
 */
import "server-only";
import { randomUUID } from "node:crypto";
import {
  AppError,
  LOGO_WORDS,
  WORKSPACE_LOGOS_BUCKET,
  isLogoPathOf,
  workspaceLogoPath,
  workspaceLogoSrc,
} from "@chanlytics/contracts";
import { setWorkspaceLogo } from "@chanlytics/db";
import { serviceDb } from "@/server/service-db";
import { env } from "@/server/env";
import { log } from "@/server/log";
import type { Member } from "@/server/route";
import type { RouteContext } from "@/server/with-route";
import { remadeLogo } from "@chanlytics/channels";

/** A day: a replaced picture has a new name, so only a removed one is held this long in a browser that saw it. */
const CACHE_S = String(24 * 60 * 60);

/** What the bucket is to the service role. The dashboard's other storage call is the same client (people/erasure.ts). */
const bucket = () => serviceDb().storage.from(WORKSPACE_LOGOS_BUCKET);

/** The database's refusal, in the words the row shows; the colour's door (../look.ts) is refused the same way. */
export function doorRefusal(error: { code?: string; message: string }): AppError {
  if (error.code === "42501") return new AppError("forbidden", error.message, 403);
  if (error.code === "22023") return new AppError("validation", error.message);
  if (error.code === "P0002") return new AppError("not_found", error.message, 404);
  return new AppError("internal", LOGO_WORDS.notSaved, 500);
}

/** A file no workspace wears any more, removed; a failure is said, never thrown: the save it follows stands. */
async function removeFile(tenantId: string, path: string, why: "replaced" | "refused" | "removed"): Promise<void> {
  const { error } = await bucket()
    .remove([path])
    .catch((e: unknown) => ({ error: { message: String(e instanceof Error ? e.message : e) } }));
  if (error) log.warn("workspace_logo_remove_failed", { tenant_id: tenantId, why, error: error.message.slice(0, 200) });
}

/** Point the workspace at `path` (or at nothing, ""), and let go of the file it wore before. */
async function wear(ctx: RouteContext, member: Member, path: string): Promise<void> {
  const { data, error } = await setWorkspaceLogo(ctx.supabase, member.tenantId, path);
  if (error) {
    if (path) await removeFile(member.tenantId, path, "refused");
    throw doorRefusal(error);
  }
  const before = typeof data === "string" ? data : null;
  if (before !== path && isLogoPathOf(member.tenantId, before)) await removeFile(member.tenantId, before, "replaced");
}

/** PUT workspaces/logo: the picture the page made, as base64 (the route's schema has held its alphabet and length). */
export async function saveLogo(ctx: RouteContext, member: Member, image: string): Promise<{ logo_url: string | null }> {
  const made = remadeLogo(new Uint8Array(Buffer.from(image, "base64")));
  if (!made.ok) throw new AppError("validation", LOGO_WORDS.unusable);
  const path = workspaceLogoPath(member.tenantId, randomUUID());
  const { error } = await bucket().upload(path, made.png, {
    contentType: "image/png",
    cacheControl: CACHE_S,
    upsert: false,
  });
  if (error) {
    log.error("workspace_logo_store_failed", { tenant_id: member.tenantId, error: error.message.slice(0, 200) });
    throw new AppError("internal", LOGO_WORDS.notSaved, 503);
  }
  await wear(ctx, member, path);
  return { logo_url: workspaceLogoSrc(env.NEXT_PUBLIC_SUPABASE_URL, path) };
}

/** DELETE workspaces/logo: the workspace's initials stand in again. */
export async function removeLogo(ctx: RouteContext, member: Member): Promise<{ logo_url: null }> {
  await wear(ctx, member, "");
  return { logo_url: null };
}
