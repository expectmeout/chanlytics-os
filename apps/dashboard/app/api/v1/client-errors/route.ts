import { write, account } from "@/server/route";
import { ClientErrorInput } from "@chanlytics/contracts";
import { log } from "@/server/log";

/**
 * POST /api/v1/client-errors — {boundary, page, name, message, stack, digest}: an error a page hit in this member's
 * browser, sent by the boundary that caught it (src/client/client-error.ts). Logged as `client_error` through the one
 * logger, under the request's name and beside the member, so a page that broke for someone is a line to search for,
 * not a silence. Yours, not a workspace's, so it is declared on the account; counted, since a page in a render loop
 * would otherwise send the same error for ever.
 *
 * Nothing is kept but the line: the report carries the error, never the person or what they were doing
 * (contracts shell/client-error.ts), and the logger redacts by key what an exception's words might carry.
 */
export const POST = write({
  scope: account,
  role: null,
  rate: "client_errors",
  input: ClientErrorInput,
  handle: async ({ ctx, input }) => {
    log.error("client_error", {
      user: ctx.userId,
      boundary: input.boundary,
      page: input.page,
      name: input.name,
      message: input.message,
      stack: input.stack,
      digest: input.digest,
    });
    return { logged: true };
  },
});
