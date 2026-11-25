/**
 * A post on the business's own Google profile (decision 0099, step 3), and off it again. Only on a person's press: the dashboard's
 * route holds who may, and nothing here runs by itself. It goes as the owner, with the token the connection holds, and the ledger keeps
 * Google's name for it, which is how a sheet says it is up and how it comes down.
 */
import {
  PlacesError,
  createLocalPost,
  deleteLocalPost,
  readLocalPost,
  reviewParent,
  type GbpPostAsked,
} from "@chanlytics/channels/google";
import type { EdgeRefusal, RemoteState, TenantId } from "@chanlytics/contracts";
import { emitEvent } from "@chanlytics/db/events";
import { connectionOf, type Db } from "../shared/google/rows.js";
import { http } from "../shared/google/places.js";
import { tokenFor } from "../shared/google/credentials.js";
import { logAndGoOn } from "@chanlytics/log";

/** The connection and a token good now, or why not. */
export async function asTheOwner(db: Db, tenantId: TenantId, now: Date) {
  const conn = await connectionOf(db, tenantId);
  if (!conn || !conn.location_name) return { ok: false as const, error: "not_connected" as const };
  const t = await tokenFor(db, tenantId, now.getTime());
  if (!t.ok) return { ok: false as const, error: "no_token" as const, detail: t.detail ?? t.error };
  return { ok: true as const, token: t.token, parent: reviewParent(conn.account_name, conn.location_name) };
}

const googleSaid = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Google turned the ask away for now and made nothing: too many asks (429) or not able to take one this minute (503). Any
 * other answer, or none, may have put the post up, and is never asked again blind.
 */
const BUSY_STATUSES: readonly number[] = [429, 503];

export async function postOnProfile(
  db: Db,
  tenantId: TenantId,
  input: { fileId: string; by: string | null; post: GbpPostAsked },
  now = new Date(),
): Promise<
  { ok: true; name: string; search_url: string | null; state: string | null } | (EdgeRefusal & { busy?: true })
> {
  const owner = await asTheOwner(db, tenantId, now);
  if (!owner.ok) return owner;
  let created;
  try {
    created = await createLocalPost(http, owner.token, owner.parent, input.post);
  } catch (e) {
    const busy = e instanceof PlacesError && BUSY_STATUSES.includes(e.status);
    return { ok: false, error: "google_refused", detail: googleSaid(e), ...(busy ? { busy: true as const } : {}) };
  }
  await emitEvent(db, tenantId, "file.posted", "workspace", tenantId, {
    file_id: input.fileId,
    post_name: created.name,
    search_url: created.search_url,
    by: input.by,
  }).catch(logAndGoOn("event file.posted"));
  return { ok: true, ...created };
}

export async function unpostOnProfile(
  db: Db,
  tenantId: TenantId,
  input: { fileId: string; by: string | null; name: string },
  now = new Date(),
): Promise<{ ok: true } | EdgeRefusal> {
  const owner = await asTheOwner(db, tenantId, now);
  if (!owner.ok) return owner;
  // Its name says whose it is: this connection's location, and no other's, whatever a caller sends.
  if (!input.name.startsWith(`${owner.parent}/localPosts/`)) return { ok: false, error: "not_found" };
  try {
    await deleteLocalPost(http, owner.token, input.name);
  } catch (e) {
    return { ok: false, error: "google_refused", detail: googleSaid(e) };
  }
  await emitEvent(db, tenantId, "file.unposted", "workspace", tenantId, {
    file_id: input.fileId,
    post_name: input.name,
    by: input.by,
  }).catch(logAndGoOn("event file.unposted"));
  return { ok: true };
}

/** Google's word for a post it took off the profile itself ("rejected due to content policy violation"). */
export const GOOGLE_POST_REJECTED = "REJECTED";

/**
 * Whether the profile still holds a post, asked by Google's own name for it (the daily read's question, content/posts-read.ts).
 * Not up where Google no longer has it, or holds it as rejected; up where it shows or is still being looked at. A post
 * of another location than the one connected now, a connection that cannot be asked, and any other answer say nothing.
 * A refusal throws, named, and whoever asks reads that as no answer.
 */
export async function findOnProfile(
  db: Db,
  tenantId: TenantId,
  name: string | null,
  now = new Date(),
): Promise<RemoteState> {
  const unsaid = { status: null, json: null };
  if (!name) return { is: "unknown", kept: unsaid };
  const owner = await asTheOwner(db, tenantId, now);
  if (!owner.ok || !name.startsWith(`${owner.parent}/localPosts/`)) return { is: "unknown", kept: unsaid };
  const post = await readLocalPost(http, owner.token, name);
  if (!post) return { is: "not_up", kept: { status: 404, json: null } };
  const kept = { status: 200, json: null };
  if (post.state === GOOGLE_POST_REJECTED) return { is: "not_up", kept };
  return { is: "up", media: { externalId: post.name, permalink: post.search_url, publishedAt: post.created_at }, kept };
}
