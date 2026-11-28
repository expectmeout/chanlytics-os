/**
 * A post on the business's own Google profile (decision 0099, step 3), and off it again. Only on a person's press: the dashboard's
 * route holds who may, and nothing here runs by itself. It goes as the owner, with the token the connection holds, and the ledger keeps
 * Google's name for it, which is how a sheet says it is up and how it comes down.
 *
 * An ask Google refused (a 4xx) made nothing. Any other failure, or no answer at all, may have put the post up: it is said
 * as `unanswered`, and the profile is asked what it holds (listSentOnProfile) before anything is sent again (post-later.ts).
 */
import {
  PlacesError,
  createLocalPost,
  deleteLocalPost,
  listLocalPosts,
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
async function asTheOwner(db: Db, tenantId: TenantId, now: Date) {
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

/** Google answered and said no (a 4xx): it made nothing. Anything else is not known to have made nothing. */
const saidNo = (failure: unknown): boolean =>
  failure instanceof PlacesError && failure.status >= 400 && failure.status < 500;

/**
 * The ask never left: the wire to Google is resting after its failures (channels provider-fetch, `breaker_open`, which
 * the Google wire raises by that word). Nothing was made, as when Google says it is too busy.
 */
const wireRested = (failure: unknown): boolean => failure instanceof Error && failure.message.endsWith("breaker_open");

/**
 * An ask to post that failed, as its callers read it: too busy to take it (nothing made, asked once more), a plain no
 * (nothing made), or neither, where Google may hold the post: said `unanswered`, and never read as a refusal that made
 * nothing.
 */
function postRefusedOf(failure: unknown): EdgeRefusal & { busy?: true; unanswered?: true } {
  const busy = wireRested(failure) || (failure instanceof PlacesError && BUSY_STATUSES.includes(failure.status));
  const unanswered = !busy && !saidNo(failure);
  return {
    ok: false,
    error: "google_refused",
    detail: googleSaid(failure),
    ...(busy ? { busy: true as const } : {}),
    ...(unanswered ? { unanswered: true as const } : {}),
  };
}

export async function postOnProfile(
  db: Db,
  tenantId: TenantId,
  input: { fileId: string; by: string | null; post: GbpPostAsked },
  now = new Date(),
): Promise<
  | { ok: true; name: string; search_url: string | null; state: string | null }
  | (EdgeRefusal & { busy?: true; unanswered?: true })
> {
  const owner = await asTheOwner(db, tenantId, now);
  if (!owner.ok) return owner;
  let created;
  try {
    created = await createLocalPost(http, owner.token, owner.parent, input.post);
  } catch (e) {
    return postRefusedOf(e);
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

/** The most pages of the profile's posts one ask reads: at a hundred a page, its newest thousand. */
const SENT_PAGES_MAX = 10;

/** A post the profile holds that was made since a time: Google's name for it, where it shows and where it stands. */
export interface SentOnProfile {
  name: string;
  search_url: string | null;
  rejected: boolean;
  atMs: number;
}

/**
 * The posts the profile holds that were made since a time, oldest first (a send that got no answer asks this before
 * anything is sent again, post-later.ts). The whole list is read: Google states no order for it, and "none" is said
 * only of a list read to its end. Null where the connection cannot be asked now, or the list runs past what one ask
 * reads; a page Google refuses throws, named. Either says nothing of any post, and is never read as "none".
 */
export async function listSentOnProfile(
  db: Db,
  tenantId: TenantId,
  since: Date,
  now = new Date(),
): Promise<SentOnProfile[] | null> {
  const owner = await asTheOwner(db, tenantId, now);
  if (!owner.ok) return null;
  const sent: SentOnProfile[] = [];
  let pageToken: string | null = null;
  for (let page = 0; page < SENT_PAGES_MAX; page += 1) {
    const listed = await listLocalPosts(http, owner.token, owner.parent, pageToken);
    for (const post of listed.posts) {
      const atMs = post.created_at ? Date.parse(post.created_at) : Number.NaN;
      if (atMs >= since.getTime())
        sent.push({
          name: post.name,
          search_url: post.search_url,
          rejected: post.state === GOOGLE_POST_REJECTED,
          atMs,
        });
    }
    if (!listed.next_page_token) return sent.sort((first, second) => first.atMs - second.atMs);
    pageToken = listed.next_page_token;
  }
  return null;
}

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
