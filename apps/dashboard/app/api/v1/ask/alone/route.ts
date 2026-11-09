import { z } from "zod";
import { write, workspace } from "@/server/shared/route";
import { setAskAlone } from "@/server/ask/act/stop";

/**
 * POST /api/v1/ask/alone — the switch (D10 of the answers canvas). Body { on: boolean }. On, what Ask proposes follows the
 * Autonomy rows without a press, within the freedom check. Off by default. An owner's or a partner's: it changes how the
 * business runs.
 */
export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "settings",
  input: z.object({ on: z.boolean() }),
  handle: ({ ctx, member, input }) => setAskAlone(ctx, member, input.on),
});
