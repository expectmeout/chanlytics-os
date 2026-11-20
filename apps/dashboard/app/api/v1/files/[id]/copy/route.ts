import { read } from "@/server/shared/route";
import { copyOfFile, fileScope } from "@/server/files/file";

/**
 * GET /api/v1/files/:id/copy — `{ copy, copy_why }`: where a watched clip's video stands now (at hand, on its way back,
 * kept with its provider, or its original gone), read off the file's own row under RLS. A page waiting for a clip to
 * come back asks this while it waits. It asks for nothing, so waiting never spends one of the day's returns.
 *
 * The handle is in src/server/files/file.ts.
 */
export const GET = read({
  scope: fileScope,
  handle: ({ row }) => Promise.resolve(copyOfFile(row)),
});
