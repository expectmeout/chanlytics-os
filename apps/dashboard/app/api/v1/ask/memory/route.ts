import { read, write, workspace } from "@/server/route";
import { keepMemoryLine, memoryPage } from "@/server/ask/companion/memory-pane";

/**
 * GET /api/v1/ask/memory — Settings › Memory: what Ask keeps about the business, newest first, who kept each line, the
 * journal's newest days (an owner's: RLS keeps them to owners), and whether the caller may change a line
 * (server/ask/companion/memory-pane.ts). Every member reads it: it is what Ask tells every member's turns.
 *
 * POST /api/v1/ask/memory — keep a line: the pane's Add, or a forgotten line kept again by its card's Undo. Body
 * { text, thread_id?, source? }. The memory's door checks the approve permission itself; the route's role is the same
 * rung, so a viewer is refused before the database is asked.
 */
export const GET = read({
  scope: workspace,
  handle: async ({ ctx, member }) => memoryPage(ctx, member),
});

export const POST = write({
  scope: workspace,
  role: "operator",
  rate: "settings",
  handle: async ({ ctx, req, member }) =>
    keepMemoryLine(
      ctx,
      member,
      (await req.json().catch(() => null)) as { text?: unknown; thread_id?: unknown; source?: unknown } | null,
    ),
});
