import { previewNotRightBy } from "@/server/previews/preview-doors";
import { previewRoute } from "@/server/previews/public-route";

/**
 * POST /api/v1/previews/<token>/not-right — what a business says is not right on its preview (decision 0079): `{ fact,
 * said? }`, kept for the sender, never written into the receptionist. Public: the token is the authority
 * (server/previews/public-route.ts).
 */
const door = previewRoute("preview_ip", (token, body) => previewNotRightBy(token, body.fact, body.said));

/** A function of its own, as /api/v1/signup's: these doors are no route() and the typed client does not post them. */
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }): Promise<Response> {
  return door(req, ctx);
}
