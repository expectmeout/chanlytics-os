import { previewListen } from "@/server/previews/doors";
import { previewRoute } from "@/server/previews/public-route";

/**
 * POST /api/v1/previews/<token>/listen — a lead's own greeting, heard with no microphone (decision 0079): a call to
 * the preview's AI that the page only listens to, made at the provider by the edge's rehearsal door as a call it makes
 * is, with `{ rehearsal_id, call, max_ms, left_ms }` back for the browser to join receive-only
 * (bridge/rehearse/call.ts). Its seconds count against the preview's six minutes, and it is no call anyone made. Public:
 * the token is the authority, a listen is its own bucket per network, and one at a time a preview
 * (server/previews/public-route.ts, doors.ts).
 */
const door = previewRoute({ bucket: "preview_listen_ip", spends: true }, (token) => previewListen(token));

/** A function of its own, as /api/v1/signup's: these doors are no route() and the typed client does not post them. */
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }): Promise<Response> {
  return door(req, ctx);
}
