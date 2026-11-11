/**
 * What a post is drawn from (decision 0099, step 3): the photo, or one moment of a video kept as a still in its folder, what the
 * look found, and the business's colour, mark and number, read afresh but for what can't change under it. A person changing a
 * post's words draws the same photo again and again, and most of a picture's time was reading it, so this process holds the last
 * few a while: a file's bytes never change (its folder is its own uuid), and each is reached only after the caller's row was read
 * under RLS, so a file removed is never drawn from memory.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AppError,
  FILE_WORDS as W,
  MIN_MS,
  WORKSPACE_LOGOS_BUCKET,
  fileFramePathOf,
  filePathOf,
  recordOrNull,
} from "@chanlytics/contracts";
import { findWorkspaceLook } from "@chanlytics/db/look";
import type { Database } from "@chanlytics/db/types";
import type { FileMemberRow } from "@chanlytics/db/files";
import { log } from "@/server/shared/log";
import { load, readerContext } from "@/server/shared/reader";
import * as readers from "@/server/readers/facts";
import type { Member } from "@/server/shared/route";
import { serviceDb } from "@/server/shared/service-db";
import type { RouteContext } from "@/server/shared/with-route";
import { keepVideoFrame } from "../files/copies";
import { bucket } from "../files/file";
import { asPng } from "./compose";
import { postPhoneOf } from "./phone";
import type { TenantId } from "@chanlytics/contracts";

/** The widest a photo is read at: enough for the tallest shape, and every kind it may be kept in comes back as one the code reads. */
const PHOTO_READ_WIDTH = 2000;
/** How many of what was read are held, and how long: enough for a person changing one post, or two. */
const HELD_MOST = 6;
const PHOTO_HELD_MS = 5 * MIN_MS;
/** A logo can be replaced at its address, so it is held only for the length of a pause. */
const LOGO_HELD_MS = MIN_MS;

interface Held {
  at: number;
  value: Promise<unknown>;
}

/** Held by the client that read it, so a process holds one store and a test's new world starts with none. */
const heldBy = new WeakMap<SupabaseClient<Database>, Map<string, Held>>();

/** What was read a moment ago, or read now. A read that fails is not held. */
function heldRead<T>(key: string, forMs: number, read: () => Promise<T>): Promise<T> {
  const db = serviceDb();
  const held = heldBy.get(db) ?? new Map<string, Held>();
  heldBy.set(db, held);
  const result = held.get(key);
  if (result && Date.now() - result.at < forMs) return result.value as Promise<T>;
  const value = read();
  // Last in the order, so the oldest is the first to go.
  held.delete(key);
  held.set(key, { at: Date.now(), value });
  value.catch(() => held.delete(key));
  for (const old of held.keys()) {
    if (held.size <= HELD_MOST) break;
    held.delete(old);
  }
  return value;
}

/** What a post is drawn from. */
export interface PostMaterial {
  photo: Buffer;
  subject: readonly [number, number, number, number] | null;
  accent: string | null;
  logo: string | null;
  phone: string | null;
}

const asFour = (v: unknown): readonly [number, number, number, number] | null =>
  Array.isArray(v) && v.length === 4 && v.every((n) => typeof n === "number")
    ? (v as [number, number, number, number])
    : null;

/** The business's mark, ready to draw, or none. A mark that can't be read costs the mark, never the post. */
async function logoRead(tenantId: TenantId, path: string): Promise<string | null> {
  const read = await serviceDb().storage.from(WORKSPACE_LOGOS_BUCKET).download(path);
  if (read.error || !read.data) {
    log.warn("file_post_logo_failed", { tenant_id: tenantId, error: read.error?.message ?? "no bytes" });
    return null;
  }
  const mark = await asPng(Buffer.from(await read.data.arrayBuffer()));
  if (!mark) log.warn("file_post_logo_failed", { tenant_id: tenantId, error: "unreadable" });
  return mark ? `data:image/png;base64,${mark.toString("base64")}` : null;
}

/** A photo's bytes, in a kind the code reads, at the widest a drawing needs. */
export async function readPhoto(file: FileMemberRow): Promise<Buffer> {
  const path = filePathOf(file.tenant_id, file.id, file.mime);
  const read = await bucket().download(path, { transform: { width: PHOTO_READ_WIDTH, resize: "contain" } });
  if (read.error || !read.data) {
    log.error("file_post_read_failed", { tenant_id: file.tenant_id, error: read.error?.message ?? "no bytes" });
    throw new AppError("unavailable", W.failedRead);
  }
  return Buffer.from(await read.data.arrayBuffer());
}

/** What a post's photo is read from: a photo, or one moment of a video (`at`, in seconds from its start). */
interface PostFrom {
  file: FileMemberRow;
  at: number | null;
}

/**
 * One moment of a video, as the still its folder keeps of it. Where it is not there yet the edge cuts it, since Stream's keys are
 * the edge's, and it is read again: once kept, every later drawing of the post reads Storage alone.
 */
export async function readFrame(
  ctx: RouteContext,
  tenantId: TenantId,
  file: FileMemberRow,
  at: number,
): Promise<Buffer> {
  const path = fileFramePathOf(tenantId, file.id, at);
  const unread = (reason: string): never => {
    log.error("file_post_read_failed", { tenant_id: tenantId, error: reason });
    throw new AppError("unavailable", W.failedRead);
  };
  const kept = await bucket().download(path);
  if (!kept.error) return Buffer.from(await kept.data.arrayBuffer());
  const cut = await keepVideoFrame({ tenantId, userId: ctx.userId }, { id: file.id, at });
  if ("wont" in cut) return unread(cut.wont);
  const read = await bucket().download(path);
  if (read.error) return unread(read.error.message);
  return Buffer.from(await read.data.arrayBuffer());
}

/** What a post is drawn from, for whoever holds the workspace's settings: a route by its member, Ask's act by its turn's read. */
export async function postMaterialFrom(
  ctx: RouteContext,
  tenantId: TenantId,
  { file, at }: PostFrom,
  configOf: () => Promise<unknown>,
): Promise<PostMaterial> {
  const [photo, look, config] = await Promise.all([
    heldRead(`photo:${file.id}:${at ?? ""}`, PHOTO_HELD_MS, () =>
      file.kind === "video" && at !== null ? readFrame(ctx, tenantId, file, at) : readPhoto(file),
    ),
    findWorkspaceLook(ctx.supabase, tenantId),
    configOf(),
  ]);
  const logoPath = look?.logo_path ?? null;
  const [logo, phone] = await Promise.all([
    logoPath ? heldRead(`logo:${logoPath}`, LOGO_HELD_MS, () => logoRead(tenantId, logoPath)) : null,
    postPhoneOf(ctx, tenantId, config),
  ]);
  return { photo, subject: asFour(recordOrNull(file.look)?.subject), accent: look?.accent ?? null, logo, phone };
}

export const getMaterial = (ctx: RouteContext, member: Member, from: PostFrom): Promise<PostMaterial> =>
  postMaterialFrom(ctx, member.tenantId, from, () =>
    load(readerContext(ctx, member), readers.config, undefined).then((r) => r.data?.config ?? null),
  );
