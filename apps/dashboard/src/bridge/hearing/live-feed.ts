/**
 * The runner's live feed: the workspace's topic, over this browser's Supabase client, whose code is a chunk of its own
 * (lib/supabase/browser-client.ts). Its fetch starts as this module loads, beside the boot's first reads, so it is in
 * long before who is looking is known, which is when the runner joins (surface-runner.ts joinFeedEarly): the feed has no
 * backfill, and a join that waited on the code past the boot's reads would miss what landed between them. A fetch that
 * fails says so as the feed's own failure does, and the runner's next join asks for the code again.
 */
import { subscribeWorkspaceChanges } from "@chanlytics/db/realtime";
import { browserClient, clientCode } from "@/lib/supabase/browser-client";
import { api, serversClockOf } from "../api";
import type { JoinLiveFeed } from "../surface-runner";
import type { CatchUp } from "./catch-up";

if (typeof window !== "undefined") clientCode.warm();

export const joinLiveFeed: JoinLiveFeed = (onChange, opts) => {
  let left = false;
  let stop: (() => void) | null = null;
  browserClient().then(
    (client) => {
      if (!left) stop = subscribeWorkspaceChanges(client, onChange, opts);
    },
    () => {
      if (!left) opts.onStatus?.("CHANNEL_ERROR");
    },
  );
  return () => {
    left = true;
    stop?.();
  };
};

/**
 * What the feed told since a moment, read back from the workspace's topic (GET changes; decision 0019 step 4): every notice
 * the tab missed while it loaded or while its feed was down, or null where the answer could not say them all or failed, and
 * the runner reads everything again as it did before. The moment is put on the servers' clock first, on the early side.
 */
export const catchUpLiveFeed: CatchUp = async (sinceMs) => {
  const r = await api()("GET changes", { query: { since: new Date(serversClockOf(sinceMs)).toISOString() } });
  return r.ok && r.data.whole ? r.data.notices : null;
};
