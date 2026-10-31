import { write, workspace } from "@/server/route";
import { lookupLogo } from "@/server/workspace/logo/lookup";

/**
 * POST /api/v1/workspaces/logo/lookup — a look for the logo on the business's own website, on the owner's press:
 * `{ outcome, host, image? }`, the picture found travelling back as base64 for the page to make the circle from.
 * Nothing is stored: only the PUT beside this keeps a picture. A POST because each one asks another server for a page
 * and up to three images; its own small bucket for the same reason. Whoever may change the workspace's settings.
 *
 * The handle is lookupLogo in src/server/workspace/logo/lookup.ts: the route is its declaration (who may, how often),
 * the verb is what it does.
 */
/**
 * The edge's look: up to two page reads (the website as typed, then its other spelling; 6 s each) and three
 * image reads (4 s each).
 */
export const maxDuration = 30;

export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "workspace_logo_lookup",
  handle: ({ ctx, member }) => lookupLogo(ctx, member),
});
