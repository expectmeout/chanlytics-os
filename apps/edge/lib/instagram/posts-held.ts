/**
 * Instagram as the daily read asks it (content/posts-read.ts): the account the Meta link keeps for the workspace, its own
 * list of posts a page at a time, and its adapter for a post the list no longer names. Reading the list needs only what
 * every Meta link's token carries (`instagram_basic`), so no line is asked for: a token Meta no longer takes is refused
 * there, and a refused read says nothing.
 *
 * A post is this list's only where it went to the account connected now: one that went to an account that has since
 * left (#2507), or whose account was never kept, is asked nothing from here.
 */
import { ON_INSTAGRAM, recordOrEmpty } from "@chanlytics/contracts";
import {
  callInstagram,
  metaMediaSinceRequest,
  parseMetaListedPage,
  type InstagramDeps,
} from "@chanlytics/channels/instagram";
import { findMetaInstagramRow } from "@chanlytics/db/channels";
import { listedPageOfMeta, readListing } from "../content/place-listing.js";
import type { HeldPlace, HeldPlaceOf } from "../content/posts-read.js";
import { env } from "../shared/env.js";
import { readKeptSecret } from "./credentials.js";
import { INSTAGRAM_CALL_MS, instagramPlace } from "./place.js";

/** The workspace's Instagram account as the daily read asks it, or why it cannot be asked now. */
export const findInstagramHeld = (deps: InstagramDeps = {}): HeldPlaceOf =>
  async function instagramHeld(db, tenantId): Promise<HeldPlace | { cant: string }> {
    const appSecret = env.META_APP_SECRET;
    if (!appSecret) throw new Error("posts read: META_APP_SECRET is not set on this deployment");
    const row = await findMetaInstagramRow(db, tenantId);
    if (!row || recordOrEmpty(row.config).token_lapsed_at) return { cant: ON_INSTAGRAM.held.disconnected };
    // A Vault that cannot be read throws: this place is said to have failed, and tomorrow's read asks again.
    const secret = await readKeptSecret(db, row.id);
    if (!secret?.access_token) return { cant: ON_INSTAGRAM.held.disconnected };
    const poster = { token: secret.access_token, appSecret, accountId: row.external_id };
    const place = instagramPlace(poster, deps);
    return {
      holds: (post) => post.account_id === row.external_id,
      placeOf: () => place,
      list: (since, deadline) =>
        readListing(
          async (next: Parameters<typeof metaMediaSinceRequest>[1]["next"]) =>
            listedPageOfMeta(
              await callInstagram(
                metaMediaSinceRequest(poster, { since, next }),
                { timeoutMs: INSTAGRAM_CALL_MS },
                deps,
              ),
              parseMetaListedPage,
            ),
          since.getTime(),
          deadline,
        ),
    };
  };
