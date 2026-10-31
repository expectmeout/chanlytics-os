import { previewMessage } from "@/server/previews/preview-doors";
import { previewRoute } from "@/server/previews/public-route";

/**
 * POST /api/v1/previews/<token>/message — a message to a lead's own receptionist (decision 0079), answered as a live
 * chat would and kept with its answer: `{ text }` in, `{ turn, left }` back. Public: the token is the authority
 * (server/previews/public-route.ts says what each of these doors keeps instead of a session).
 */
const door = previewRoute({ bucket: "preview_ip", spends: true }, (token, body) => previewMessage(token, body.text));

/** A function of its own, as /api/v1/signup's: these doors are no route() and the typed client does not post them. */
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }): Promise<Response> {
  return door(req, ctx);
}
