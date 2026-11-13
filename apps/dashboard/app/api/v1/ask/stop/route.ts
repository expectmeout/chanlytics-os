import { z } from "zod";
import { write, workspace } from "@/server/shared/route";
import { resumeEverything, stopEverything } from "@/server/ask/act/stop";

/**
 * POST /api/v1/ask/stop — Stop everything (D22 of the answers canvas). Body { stopped: boolean }. True pauses all sending: every
 * running sequence, replies held for a person, and Ask not acting alone; the answer says what it could not stop, and pressed
 * again it tries that again. False puts back exactly what it paused, and keeps what did not come back. Any member who may
 * act may press it: a stop is always free.
 */
export const POST = write({
  scope: workspace,
  role: "operator",
  rate: "settings",
  input: z.object({ stopped: z.boolean().optional() }),
  handle: ({ ctx, req, member, input }) =>
    input.stopped === false ? resumeEverything(ctx, req, member) : stopEverything(ctx, req, member),
});

export const maxDuration = 60;
