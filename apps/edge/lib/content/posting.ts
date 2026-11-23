/**
 * Who posts a placement at its place (the content loop PRD's 7: the adapter contract): the place's adapter over the
 * workspace's connection, the place's own account the post goes to (posts.account_id), and the request as a send's row
 * keeps it. The post jobs (instagram/post-ready.ts, post-send.ts) work through one of these whichever the place is: each
 * place finds its own (Instagram's account through the Meta link; a Page through the same link, facebook/posting.ts), and
 * says in its own words why it cannot post now.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlaceAdapter, PlacementToSend } from "@chanlytics/contracts";
import type { PostRow } from "@chanlytics/db/files";
import type { Database } from "@chanlytics/db/types";
import type { SendHold } from "./recheck.js";

type Db = SupabaseClient<Database>;

export interface Posting {
  place: PlaceAdapter;
  /** The place's own account the post goes to: an Instagram account's id, a Page's id. */
  accountId: string;
  /** The request as a send's row keeps it: what is sent, the media's host alone, never its signed address or a token. */
  keptRequest: (post: PlacementToSend) => Record<string, string>;
}

/** A place's own way to find who posts a placement there, or why it may not now (not connected, posting not allowed). */
export type PostingFinder = (db: Db, post: PostRow) => Promise<Posting | SendHold>;

/** A media address as a send's row keeps it: its host alone. */
export const mediaHostOf = (link: string): string => {
  try {
    return new URL(link).host;
  } catch {
    // No address a browser would open: nothing of it is kept.
    return "";
  }
};
