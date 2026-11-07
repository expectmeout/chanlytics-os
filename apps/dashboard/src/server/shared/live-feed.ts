/**
 * What the workspace's live feed told since a moment (decision 0019 step 4; the page-open PRD of 3 Nov 2026, L5): the
 * catch-up a tab asks for as it joins its workspace's topic, since its load began, and as it joins again, since its feed
 * went quiet. Read as the session: workspace_notices_since admits a member to their workspace's notices under the one
 * policy that admits them to its topic (00265, 00508).
 */
import { z } from "zod";
import { DAY_MS } from "@chanlytics/contracts";
import { getNoticesSince, type ToldNotice } from "@chanlytics/db/realtime";
import type { MemberContext, RouteContext } from "./with-route";

/** `since`: an ISO 8601 moment with its offset. */
export const ChangesQuerySchema = z.object({ since: z.iso.datetime({ offset: true }) });

/** What a catch-up answers: the notices, and whether they are all of them (false: the tab reads everything again). */
export interface Changes {
  notices: ToldNotice[];
  whole: boolean;
}

/**
 * The notices since `since`. Past a day the topic's partitions are being dropped (Realtime keeps a day's at a time), so a
 * moment that old answers none and `whole: false`, and the tab reads everything as it did before step 4.
 */
export async function getChangesSince(
  ctx: Pick<RouteContext, "supabase">,
  member: Pick<MemberContext, "tenantId">,
  input: { since: string },
  now: number = Date.now(),
): Promise<Changes> {
  const since = Date.parse(input.since);
  if (!Number.isFinite(since) || now - since > DAY_MS) return { notices: [], whole: false };
  return getNoticesSince(ctx.supabase, member.tenantId, new Date(since).toISOString());
}
