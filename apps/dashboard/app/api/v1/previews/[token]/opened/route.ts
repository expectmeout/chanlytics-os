import { previewOpenedBy } from "@/server/previews/preview-doors";
import { previewRoute } from "@/server/previews/public-route";

/**
 * POST /api/v1/previews/<token>/opened — a lead's own receptionist's page drawn in a browser (decision 0079), posted by
 * the page's own script once it has drawn, so a mail scanner fetching the link is no open. Public: the token is the
 * authority (server/previews/public-route.ts).
 */
const door = previewRoute("preview_ip", (token) => previewOpenedBy(token));

/** A function of its own, as /api/v1/signup's: these doors are no route() and the typed client does not post them. */
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }): Promise<Response> {
  return door(req, ctx);
}
