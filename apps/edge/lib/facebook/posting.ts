/**
 * Who posts to a business's Page (the content loop PRD's pass 5): the Page the Meta link keeps, through the link's token,
 * only where the workspace has Facebook switched on (`features.places.facebook`, the canary first) and the link may post
 * there (contracts pagePostableOf). Otherwise the post is held in Facebook's words and nothing is asked of Meta. A post
 * that went to another Page than the one kept now is asked nothing from here: a Page can leave a workspace and another come.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { ON_FACEBOOK, metaPageOf, pagePostableOf, placeSwitchedOn, type PlacementToSend } from "@chanlytics/contracts";
import { findMetaInstagramRow } from "@chanlytics/db/channels";
import { listKeptPostIds, type PostRow } from "@chanlytics/db/files";
import { getTenantConfig } from "@chanlytics/db/workspace";
import type { Database } from "@chanlytics/db/types";
import { env } from "../shared/env.js";
import { mediaHostOf, type Posting } from "../content/posting.js";
import type { SendHold } from "../content/recheck.js";
import { readKeptSecret } from "../instagram/credentials.js";
import { facebookPlace, type FacebookPlaceDeps } from "./place.js";

type Db = SupabaseClient<Database>;

const DISCONNECTED: SendHold = { held: ON_FACEBOOK.held.disconnected, why: "disconnected" };
const LINE_OFF: SendHold = { held: ON_FACEBOOK.held.lineOff, why: "line_off" };

/** The request as a send's row keeps it: the kind and the media's host, and whether words went with it; never the words. */
const keptRequestOf = (post: PlacementToSend): Record<string, string> => ({
  kind: post.kind,
  media_host: mediaHostOf(post.mediaUrl),
  ...(post.caption ? { with_words: "true" } : {}),
});

/** Who posts this post to the workspace's Page, or why nobody may now. */
export async function findPagePosting(
  db: Db,
  post: PostRow,
  deps: FacebookPlaceDeps = {},
): Promise<Posting | SendHold> {
  const appSecret = env.META_APP_SECRET;
  if (!appSecret) throw new Error("post: META_APP_SECRET is not set on this deployment");
  const workspace = await getTenantConfig(db, post.tenant_id);
  if (!placeSwitchedOn(workspace?.config, "facebook")) return LINE_OFF;
  const row = await findMetaInstagramRow(db, post.tenant_id);
  const postable = pagePostableOf(row);
  if (postable === "not_connected") return DISCONNECTED;
  const page = row ? metaPageOf(row.config) : null;
  if (!row || postable === "line_off" || !page) return LINE_OFF;
  if (post.account_id && post.account_id !== page.id) return DISCONNECTED;
  // A Vault that cannot be read throws: the job comes back, and nothing was sent.
  const secret = await readKeptSecret(db, row.id);
  if (!secret?.access_token) return DISCONNECTED;
  const place = facebookPlace(
    { token: secret.access_token, appSecret, pageId: page.id },
    { ...deps, keptElsewhere: (ids) => listKeptPostIds(db, post.tenant_id, "facebook", [...ids]) },
  );
  return { place, accountId: page.id, keptRequest: keptRequestOf };
}
