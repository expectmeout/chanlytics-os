import { write, workspace } from "@/server/shared/route";
import { recordOrEmpty } from "@chanlytics/contracts";
import { resumeEverything, stopEverything } from "@/server/ask/act/stop";

/**
 * POST /api/v1/ask/stop — Stop everything (D22 of the answers canvas). Body { stopped: boolean }. True pauses all sending: every
 * running sequence, replies held for a person, and Ask not acting alone. False puts back exactly what it paused. Any member
 * who may act may press it: a stop is always free.
 */
export const POST = write({
  scope: workspace,
  role: "operator",
  rate: "settings",
  handle: async ({ ctx, req, member }) => {
    const body = recordOrEmpty(await req.json().catch(() => null));
    return body.stopped === false ? resumeEverything(ctx, req, member) : stopEverything(ctx, req, member);
  },
});

export const maxDuration = 60;
