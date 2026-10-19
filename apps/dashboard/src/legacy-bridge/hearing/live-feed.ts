/**
 * The runner's live feed: the workspace's topic, over this browser's Supabase client, whose code is a chunk of its own
 * (lib/supabase/browser-client.ts). Its fetch starts as this module loads, beside the boot's first reads, so it is in
 * long before who is looking is known, which is when the runner joins (surface-runner.ts joinFeedEarly): the feed has no
 * backfill, and a join that waited on the code past the boot's reads would miss what landed between them. A fetch that
 * fails says so as the feed's own failure does, and the runner's next join asks for the code again.
 */
import { subscribeWorkspaceChanges } from "@chanlytics/db/realtime";
import { browserClient, clientCode } from "@/lib/supabase/browser-client";
import type { JoinLiveFeed } from "../surface-runner";

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
