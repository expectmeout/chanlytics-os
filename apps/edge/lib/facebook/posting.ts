/**
 * Who posts to a business's Page (the content loop PRD's pass 5): the Page the Meta link keeps, through the link's token,
 * only where the workspace has Facebook switched on (`features.places.facebook`, the canary first) and the link may post
 * there (contracts pagePostableOf). Otherwise the post is held in Facebook's words and nothing is asked of Meta. A post
 * that went to another Page than the one kept now is asked nothing from here: a Page can leave a workspace and another come.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ON_FACEBOOK,
  metaPageOf,
  pagePostableOf,
  placeSwitchedOn,
  type PlacementToSend,
  type TenantId,
} from "@chanlytics/contracts";
import type { PagePoster } from "@chanlytics/channels/facebook";
import { findMetaInstagramRow } from "@chanlytics/db/channels";
import { listKeptPostIds, type PostRow } from "@chanlytics/db/files";
import { getTenantConfig } from "@chanlytics/db/workspace";
import type { Database } from "@chanlytics/db/types";
import { env } from "../shared/env.js";
import { readListing } from "../content/place-listing.js";
import { mediaHostOf, type Posting } from "../content/posting.js";
import type { HeldPlace, HeldPlaceOf } from "../content/posts-read.js";
import type { SendHold } from "../content/recheck.js";
import { readKeptSecret } from "../instagram/credentials.js";
import { facebookPlace, facebookPlaceListed, type FacebookPlaceDeps } from "./place.js";

type Db = SupabaseClient<Database>;

const DISCONNECTED: SendHold = { held: ON_FACEBOOK.held.disconnected, why: "disconnected" };
const LINE_OFF: SendHold = { held: ON_FACEBOOK.held.lineOff, why: "line_off" };

/** The request as a send's row keeps it: the kind and the media's host, and whether words went with it; never the words. */
const keptRequestOf = (post: PlacementToSend): Record<string, string> => ({
  kind: post.kind,
  media_host: mediaHostOf(post.mediaUrl),
  ...(post.caption ? { with_words: "true" } : {}),
});

/** The workspace's Page as the link may act for it now, with the link's token; or why not. */
async function findPage(db: Db, tenantId: TenantId): Promise<{ poster: PagePoster } | SendHold> {
  const appSecret = env.META_APP_SECRET;
  if (!appSecret) throw new Error("post: META_APP_SECRET is not set on this deployment");
  const workspace = await getTenantConfig(db, tenantId);
  if (!placeSwitchedOn(workspace?.config, "facebook")) return LINE_OFF;
  const row = await findMetaInstagramRow(db, tenantId);
  const postable = pagePostableOf(row);
  if (postable === "not_connected") return DISCONNECTED;
  const page = row ? metaPageOf(row.config) : null;
  if (!row || postable === "line_off" || !page) return LINE_OFF;
  // A Vault that cannot be read throws: the job comes back, and nothing was sent.
  const secret = await readKeptSecret(db, row.id);
  if (!secret?.access_token) return DISCONNECTED;
  return { poster: { token: secret.access_token, appSecret, pageId: page.id } };
}

/** Who posts this post to the workspace's Page, or why nobody may now. */
export async function findPagePosting(
  db: Db,
  post: PostRow,
  deps: FacebookPlaceDeps = {},
): Promise<Posting | SendHold> {
  const found = await findPage(db, post.tenant_id);
  if ("held" in found) return found;
  const { poster } = found;
  if (post.account_id && post.account_id !== poster.pageId) return DISCONNECTED;
  const place = facebookPlace(poster, {
    ...deps,
    keptElsewhere: (ids) => listKeptPostIds(db, post.tenant_id, "facebook", [...ids]),
  });
  return { place, accountId: poster.pageId, keptRequest: keptRequestOf };
}

/**
 * The workspace's Page as the daily read asks it (content/posts-read.ts): its own list of posts, and its adapter for a
 * post the list no longer names. Only a picture that went to the Page kept now is this list's: a reel is kept by its
 * video's id, which the Page's list of posts does not name, and a story ends by itself. Reading the list asks only what
 * posting already holds (contracts PAGE_POSTING_PERMISSIONS: pages_read_engagement reads a Page's own posts); where Meta
 * refuses it all the same, the read says nothing and nothing is judged.
 */
export const findPageHeld = (deps: FacebookPlaceDeps = {}): HeldPlaceOf =>
  async function pageHeld(db, tenantId): Promise<HeldPlace | { cant: string }> {
    const found = await findPage(db, tenantId);
    if ("held" in found) return { cant: found.held };
    const { poster } = found;
    const page = facebookPlaceListed(poster, {
      ...deps,
      keptElsewhere: (ids) => listKeptPostIds(db, tenantId, "facebook", [...ids]),
    });
    return {
      holds: (post) => post.kind === "picture" && post.account_id === poster.pageId,
      placeOf: () => page.place,
      list: (since, deadline) =>
        readListing((next: Parameters<typeof page.listed>[1]) => page.listed(since, next), since.getTime(), deadline),
    };
  };
