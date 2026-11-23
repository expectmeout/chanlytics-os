import { write, workspace } from "@/server/shared/route";
import { aimsInput, keepAimsFor } from "@/server/content/claims";

/**
 * PUT /api/v1/content/aims — `{ goals?, content? }`: what the posts are for and how often they go up (00702; the content
 * loop PRD's 21.1, Settings › Content): the goals kept as one set, and the cadence, quiet days and languages written onto
 * the workspace's config beside what it holds. Each part optional; only what is given changes. Whoever may change the
 * business's settings. Answers `{ goals, content }`.
 *
 * The handle is in src/server/content/claims.ts.
 */
export const PUT = write({
  scope: workspace,
  role: "partner",
  rate: "settings",
  input: aimsInput,
  handle: ({ ctx, input, member }) => keepAimsFor(ctx, member, input),
});
