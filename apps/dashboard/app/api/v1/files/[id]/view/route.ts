import { read } from "@/server/shared/route";
import { fileScope, viewFile } from "@/server/files/file";

/**
 * GET /api/v1/files/:id/view — a redirect to the picture: `?w=` a resized copy for a page, `?download` the original. The
 * page's <img> points straight at this address, as a thread's <audio> does at a recording's: the file is the row, read
 * under RLS, so one the caller cannot see is a 404, and the service role signs only for a row it found.
 *
 * The handle is in src/server/files/file.ts.
 */
export const GET = read({
  scope: fileScope,
  handle: ({ req, row }) => viewFile(row, new URL(req.url)),
});
