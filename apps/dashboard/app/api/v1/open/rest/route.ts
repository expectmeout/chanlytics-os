import { z } from "zod";
import { read, workspace } from "@/server/shared/route";
import { openRest, restKeysOf, REST_READS_TEXT_MAX } from "@/server/workspace/page-open";
import { openReadOf } from "../reads";

/**
 * GET /api/v1/open/rest?reads=<key>,<key>… — the rest of a load's reads, answered as one streamed request ("Pages that
 * open at once", piece 8; server/workspace/page-open.ts openRest): the reads of the pages not on screen, which the boot
 * asks for once the page on screen is drawn, one JSON line each as it settles, as GET open answers a page's own. `reads`
 * is each read's key as the client spells it before its workspace (`contacts?sort=name`), each URI-encoded, joined by
 * commas. Each is answered by its own route, past the session check this request made once (the routes are named in
 * ../reads.ts); a key none of them answers has no line, and the client asks for it alone.
 */
const Query = z.object({ reads: z.string().min(1).max(REST_READS_TEXT_MAX) });

export const GET = read({
  scope: workspace,
  query: Query,
  // The answer streams: the Response is handed back at once, and each read writes its line as it settles.
  handle: ({ ctx, req, input }) => Promise.resolve(openRest(ctx, req, restKeysOf(input.reads, openReadOf), openReadOf)),
});
