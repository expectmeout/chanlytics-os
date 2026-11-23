/**
 * Instagram's adapter for what a post says back (00696; the content loop PRD's pass 2): its numbers, read with the
 * Meta link's `insights` line, and a public answer under a comment, posted with its `comments` line. Asked of the account
 * the post went to (posts.account_id), and only while that account is the workspace's, connected, with the line on: a
 * post of an account that has since left is asked nothing from here, and that is said, never guessed.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { metaLinesOf, ON_INSTAGRAM, recordOrEmpty, type PlaceAdapter } from "@chanlytics/contracts";
import { findMetaInstagramRow } from "@chanlytics/db/channels";
import type { PostRow } from "@chanlytics/db/files";
import type { Database } from "@chanlytics/db/types";
import { env } from "../shared/env.js";
import { readKeptSecret } from "./credentials.js";
import { instagramPlace } from "./place.js";

type Db = SupabaseClient<Database>;

/** The Meta link's line a result needs: a post's numbers, or answering its comments. */
type ResultsLine = "insights" | "comments";

/** Instagram's adapter for this post's account with that line on, or why it cannot be asked from here now. */
export async function findResultsPlace(
  db: Db,
  post: PostRow,
  line: ResultsLine,
): Promise<PlaceAdapter | { cant: string }> {
  const appSecret = env.META_APP_SECRET;
  if (!appSecret) throw new Error("results: META_APP_SECRET is not set on this deployment");
  const row = await findMetaInstagramRow(db, post.tenant_id);
  if (!row) return { cant: ON_INSTAGRAM.held.disconnected };
  const config = recordOrEmpty(row.config);
  if (config.token_lapsed_at) return { cant: ON_INSTAGRAM.held.disconnected };
  if (!metaLinesOf(config.scopes)[line]) return { cant: ON_INSTAGRAM.held.lineOff };
  // The post went to another account than the one connected now (#2507: an account can leave and another come).
  if (post.account_id && post.account_id !== row.external_id) return { cant: ON_INSTAGRAM.held.disconnected };
  // A Vault that cannot be read throws: the job comes back, and nothing was asked.
  const secret = await readKeptSecret(db, row.id);
  if (!secret?.access_token) return { cant: ON_INSTAGRAM.held.disconnected };
  return instagramPlace({ token: secret.access_token, appSecret, accountId: row.external_id });
}
