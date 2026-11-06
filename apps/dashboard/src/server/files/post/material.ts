/**
 * What a post is drawn from (decision 0099, step 3): the photo, what the look found, and the business's colour, mark and number,
 * read afresh but for what can't change under it. A person changing a post's words draws the same photo again and again, and most of a
 * picture's time was reading it, so this process holds the last few a while: a file's bytes never change (its folder is its own
 * uuid), and each is reached only after the caller's row was read under RLS, so a file removed is never drawn from memory.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AppError,
  FILE_WORDS as W,
  MIN_MS,
  WORKSPACE_LOGOS_BUCKET,
  filePathOf,
  recordOrNull,
  type FileMime,
} from "@chanlytics/contracts";
import { workspaceLookOf, type Database, type FileMemberRow } from "@chanlytics/db";
import { log } from "@/server/log";
import { load, readerContext } from "@/server/readers";
import * as readers from "@/server/readers/facts";
import type { Member } from "@/server/route";
import { serviceDb } from "@/server/service-db";
import type { RouteContext } from "@/server/with-route";
import { bucket } from "../file";
import { asPng } from "./compose";
import { postPhoneOf } from "./phone";

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
  const got = held.get(key);
  if (got && Date.now() - got.at < forMs) return got.value as Promise<T>;
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
async function logoRead(tenantId: string, path: string): Promise<string | null> {
  const read = await serviceDb().storage.from(WORKSPACE_LOGOS_BUCKET).download(path);
  if (read.error || !read.data) {
    log.warn("file_post_logo_failed", { tenant_id: tenantId, error: read.error?.message ?? "no bytes" });
    return null;
  }
  const mark = await asPng(Buffer.from(await read.data.arrayBuffer()));
  if (!mark) log.warn("file_post_logo_failed", { tenant_id: tenantId, error: "unreadable" });
  return mark ? `data:image/png;base64,${mark.toString("base64")}` : null;
}

async function photoRead(file: FileMemberRow): Promise<Buffer> {
  const path = filePathOf(file.tenant_id, file.id, file.mime as FileMime);
  const read = await bucket().download(path, { transform: { width: PHOTO_READ_WIDTH, resize: "contain" } });
  if (read.error || !read.data) {
    log.error("file_post_read_failed", { tenant_id: file.tenant_id, error: read.error?.message ?? "no bytes" });
    throw new AppError("internal", W.failedRead, 503);
  }
  return Buffer.from(await read.data.arrayBuffer());
}

export async function materialOf(ctx: RouteContext, member: Member, file: FileMemberRow): Promise<PostMaterial> {
  const [photo, look, config] = await Promise.all([
    heldRead(`photo:${file.id}`, PHOTO_HELD_MS, () => photoRead(file)),
    workspaceLookOf(ctx.supabase, member.tenantId),
    load(readerContext(ctx, member), readers.config, undefined).then((r) => r.data),
  ]);
  const logoPath = look?.logo_path ?? null;
  const [logo, phone] = await Promise.all([
    logoPath ? heldRead(`logo:${logoPath}`, LOGO_HELD_MS, () => logoRead(member.tenantId, logoPath)) : null,
    postPhoneOf(ctx, member.tenantId, config?.config ?? null),
  ]);
  return { photo, subject: asFour(recordOrNull(file.look)?.subject), accent: look?.accent ?? null, logo, phone };
}
