/**
 * Stream's storage, watched for the platform, never an owner (decision 0099, stage B). Every workspace's videos share one
 * account's allowance, and a full one refuses every new upload ("Videos can't be added just now"), so each health sweep reads
 * what it holds and pages from 80% of it, before it is full, as the page reader's credits are (imports/site-reader-watch.ts):
 * through the pager, so Health's "What paged us" shows it and the platform's mail says it. A read that fails is logged, and the
 * sweep's other checks stand.
 *
 * Nothing here is shown to an owner, so the vendor's name is fine in what it says.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { readStreamUsage, type StreamAccount, type StreamUsage } from "@chanlytics/channels";
import type { Database } from "@chanlytics/db";
import { logger } from "../shared/log.js";
import { pageOperator, type PagePorts } from "../ops/page-operator.js";
import { streamAccount } from "./video-keys.js";

type Db = SupabaseClient<Database>;

/** Paged from this share of the allowance: the bundle's 1,000 minutes hold about sixteen full workspaces. */
const STREAM_FULL_SHARE = 0.8;

/** Each health sweep: the account's minutes against its allowance, and a page from 80% of it. Answers the minutes read. */
export async function watchStream(
  db: Db,
  read: (account: StreamAccount) => Promise<StreamUsage | null> = readStreamUsage,
  pager: Omit<PagePorts, "db"> = {},
): Promise<number | null> {
  const account = streamAccount();
  if (!account) return null;
  const log = logger({ sweep: "health" });
  const usage = await read(account);
  if (!usage) {
    log.warn("stream_usage_unreadable", {});
    return null;
  }
  log.info("stream_usage", { minutes: usage.minutes, limit: usage.limit, videos: usage.videos });
  if (usage.limit && usage.minutes >= usage.limit * STREAM_FULL_SHARE) {
    const full = usage.minutes >= usage.limit;
    await pageOperator(
      { db, ...pager },
      "stream_storage",
      full
        ? `Stream is full: ${Math.round(usage.minutes)} of ${usage.limit} minutes`
        : `Stream is filling: ${Math.round(usage.minutes)} of ${usage.limit} minutes, ${usage.videos} videos`,
      `Cloudflare Stream holds ${Math.round(usage.minutes)} of the account's ${usage.limit} stored minutes, in ` +
        `${usage.videos} videos. ${full ? "Every new video is refused until there is room" : "When it is full every new video is refused"}: ` +
        `a business's Files page says videos can't be added just now. Raise the allowance in the Cloudflare dashboard ` +
        `(Stream, Plans), or ask why one workspace holds so much.\n`,
    );
  }
  return usage.minutes;
}
