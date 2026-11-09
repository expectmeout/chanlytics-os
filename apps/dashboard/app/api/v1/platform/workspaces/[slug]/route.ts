import { read, platform } from "@/server/shared/route";
import { AppError, CONSOLE_WORDS, SLUG } from "@chanlytics/contracts";
import { getConsoleWorkspace } from "@/server/console/console";

/**
 * GET /api/v1/platform/workspaces/:slug — one workspace in the Console, by the address /w/ says it with (decision 0066):
 * its row as Home judges it, its Setup as its owner sees it (the same function as /api/v1/setup), what happened in it,
 * what the team did there and why, what it reported and asked for, and who has it. Read-only; every act on it is a
 * route of its own that asks why.
 */
export const GET = read({
  scope: platform,
  handle: async ({ ctx, office }) => {
    const slug = typeof ctx.params.slug === "string" ? ctx.params.slug.toLowerCase() : "";
    if (!SLUG.test(slug)) throw new AppError("not_found", CONSOLE_WORDS.noSuchWorkspace, 404);
    return getConsoleWorkspace(office, slug);
  },
});
