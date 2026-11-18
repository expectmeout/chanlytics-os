import { previewHeard } from "@/server/previews/doors";
import { previewRoute } from "@/server/previews/public-route";

/**
 * POST /api/v1/previews/<token>/heard — a call to a lead's own preview, read back (decision 0079): `{ call }` names
 * the call the page made (the rehearsal's id its call door answered), and `{ lines, ended, got, writing }` comes back:
 * the words said so far, whether it has ended, the card the business would get after a real one once its write-up is
 * there, and whether one may still come. The page asks every two seconds while a call runs and a few times after it.
 * Public: the token is the authority, the call is found in its own workspace, and the read is its own bucket per
 * network (server/previews/public-route.ts). A POST as its siblings are, so the same-origin check holds it.
 */
const door = previewRoute({ bucket: "preview_heard_ip", spends: false }, (token, body) =>
  previewHeard(token, body.call),
);

/** A function of its own, as /api/v1/signup's: these doors are no route() and the typed client does not post them. */
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }): Promise<Response> {
  return door(req, ctx);
}
