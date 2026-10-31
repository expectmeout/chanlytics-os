import { previewCall } from "@/server/previews/preview-doors";
import { previewRoute } from "@/server/previews/public-route";

/**
 * POST /api/v1/previews/<token>/call — a call in the browser to a lead's own receptionist (decision 0079): made at the
 * provider by the edge's rehearsal door, counted against the preview's six minutes, three at most a call; `{ rehearsal_id,
 * call, max_ms, left_ms }` back, which the browser joins (legacy-bridge/rehearse/call.ts). Public: the token is the
 * authority, and a call is its own bucket per network (server/previews/public-route.ts).
 */
const door = previewRoute("preview_call_ip", (token) => previewCall(token));

/** A function of its own, as /api/v1/signup's: these doors are no route() and the typed client does not post them. */
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }): Promise<Response> {
  return door(req, ctx);
}
