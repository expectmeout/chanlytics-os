import { z } from "zod";
import { LOOK_WORDS } from "@chanlytics/contracts";
import { write, workspace } from "@/server/route";
import { saveAccent } from "@/server/workspace/look";

/**
 * PUT /api/v1/workspaces/accent — `{ accent }`, one #rrggbb (either case; kept lower-case): the colour the workspace's
 * emails to customers and the pages they open draw the button and the links in (00490, decision 0075). Whoever may
 * change the workspace's settings, through the workspace's one door on the member's own session, so the database
 * decides who may; the logo's own rate, since the two are changed together.
 *
 * DELETE — the colour taken away: ink stands in.
 *
 * The handle is src/server/workspace/look.ts: the route is its declaration (who may, how often), the verb is what it does.
 */
export const PUT = write({
  scope: workspace,
  role: "partner",
  rate: "workspace_logo",
  input: z.object({
    accent: z.string().regex(/^#[0-9a-fA-F]{6}$/, { error: LOOK_WORDS.unusable }),
  }),
  handle: ({ ctx, input, member }) => saveAccent(ctx, member, input.accent),
});

export const DELETE = write({
  scope: workspace,
  role: "partner",
  rate: "workspace_logo",
  handle: ({ ctx, member }) => saveAccent(ctx, member, null),
});
