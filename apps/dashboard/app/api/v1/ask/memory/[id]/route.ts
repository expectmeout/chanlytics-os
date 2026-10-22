import { write, workspace } from "@/server/route";
import { changeMemoryLine, forgetMemoryLine } from "@/server/ask/companion/memory-pane";

/**
 * One line of what Ask remembers (server/ask/companion/memory-pane.ts), through the memory's one door, which checks the
 * caller itself; a line the caller may not touch is not found.
 *
 * PATCH /api/v1/ask/memory/:id — its words changed, { text }: the settings permission (a partner or an owner).
 * DELETE /api/v1/ask/memory/:id — forgotten: the settings permission forgets any line, the member who kept one their
 * own (Ask's card's Undo), so the route lets an operator ask and the door decides. Kept as forgotten, never deleted.
 */
export const PATCH = write({
  scope: workspace,
  role: "partner",
  rate: "settings",
  handle: async ({ ctx, req, member }) =>
    changeMemoryLine(ctx, member, ctx.params.id, (await req.json().catch(() => null)) as { text?: unknown } | null),
});

export const DELETE = write({
  scope: workspace,
  role: "operator",
  rate: "settings",
  handle: async ({ ctx, member }) => forgetMemoryLine(ctx, member, ctx.params.id),
});
