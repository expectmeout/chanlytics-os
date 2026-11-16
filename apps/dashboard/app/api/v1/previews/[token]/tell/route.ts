import { tellPreviewBy } from "@/server/previews/doors";
import { previewRoute } from "@/server/previews/public-route";

/**
 * POST /api/v1/previews/<token>/tell — a thing a business tells its own preview (decision 0079; the canvas's call P4):
 * `{ text }`, kept in the preview's record so its next answer uses it, three at most, and told to the sender. Public: the
 * token is the authority (server/previews/public-route.ts). It writes what AI is told and spends nothing.
 */
const door = previewRoute({ bucket: "preview_ip", spends: false }, (token, body) => tellPreviewBy(token, body.text));

/** A function of its own, as /api/v1/signup's: these doors are no route() and the typed client does not post them. */
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }): Promise<Response> {
  return door(req, ctx);
}
