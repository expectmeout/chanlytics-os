import { z } from "zod";
import { write, workspace } from "@/server/route";
import { disconnectInstagram } from "@/server/connections/instagram";

const Body = z.object({ channel_id: z.uuid() });

/**
 * POST /api/v1/channels/instagram/disconnect — the workspace's Instagram account turned off: nothing it is sent routes,
 * and nothing leaves it, until it is connected again. Owners and managers (the settings rung).
 */
export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "settings",
  input: Body,
  handle: ({ ctx, member, input }) => disconnectInstagram(ctx, member, input.channel_id),
});
