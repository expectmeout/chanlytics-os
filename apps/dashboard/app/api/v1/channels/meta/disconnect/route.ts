import { z } from "zod";
import { write, workspace } from "@/server/shared/route";
import { disconnectMeta } from "@/server/connections/meta";

const Body = z.object({ channel_id: z.uuid() });

/**
 * POST /api/v1/channels/meta/disconnect — the workspace's Instagram account connected through Meta turned off: nothing it
 * is sent routes, nothing leaves it, and its webhook subscription is removed, until it is connected again. Owners and
 * managers (the settings rung).
 */
export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "settings",
  input: Body,
  handle: ({ ctx, member, input }) => disconnectMeta(ctx, member, input.channel_id),
});
