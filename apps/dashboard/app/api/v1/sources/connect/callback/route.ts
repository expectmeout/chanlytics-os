import { read, account } from "@/server/shared/route";
import { handleSourceCallback } from "@/server/files/sources";

/**
 * GET /api/v1/sources/connect/callback — back from Google's window with a code and the state (the address Google is
 * registered with: the edge's SOURCES_OAUTH_REDIRECT).
 *
 * Declared as a read of the account: no workspace is resolved at the door, because the signed state IS the credential
 * here. It names the workspace chosen when Connect was pressed, and this person's standing in it is judged after the
 * state has proved itself. Every outcome is a redirect to Connections with one word its row reads once.
 */
export const GET = read({
  scope: account,
  handle: ({ ctx, req: request }) => handleSourceCallback(ctx, request),
});
