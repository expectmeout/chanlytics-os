import { z } from "zod";
import { LOGO_BASE64_MAX, LOGO_WORDS } from "@chanlytics/contracts";
import { write, workspace } from "@/server/route";
import { removeLogo, saveLogo } from "@/server/workspace/logo/logo";

/**
 * PUT /api/v1/workspaces/logo — `{ image }`, the square PNG the page made of the chosen or found picture, as base64.
 * Whoever may change the workspace's settings; its own bucket, since each save stores a file and removes one.
 *
 * The page made the picture, but nothing is assumed of what arrives: its alphabet and its length are held here, and
 * the server reads the file to its end and remakes it from its pixels before anything is stored (00407;
 * server/workspace/logo/png.ts). The address is set through the workspace's one door on the member's own session, so
 * the database decides who may, and the picture it wore before is removed once this one is the workspace's.
 *
 * DELETE — the logo taken away: the workspace's initials stand in again.
 *
 * The handles are in src/server/workspace/logo/logo.ts: the route is its declaration (who may, how often), the verb is
 * what it does.
 */
export const PUT = write({
  scope: workspace,
  role: "partner",
  rate: "workspace_logo",
  input: z.object({
    image: z
      .string({ error: LOGO_WORDS.unusable })
      .min(1, { error: LOGO_WORDS.unusable })
      .max(LOGO_BASE64_MAX, { error: LOGO_WORDS.unusable })
      .regex(/^[A-Za-z0-9+/]+={0,2}$/, { error: LOGO_WORDS.unusable })
      .refine((s) => s.length % 4 === 0, { error: LOGO_WORDS.unusable }),
  }),
  handle: ({ ctx, input, member }) => saveLogo(ctx, member, input.image),
});

export const DELETE = write({
  scope: workspace,
  role: "partner",
  rate: "workspace_logo",
  handle: ({ ctx, member }) => removeLogo(ctx, member),
});
