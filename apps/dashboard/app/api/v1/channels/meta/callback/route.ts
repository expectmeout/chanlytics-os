import { read, account } from "@/server/shared/route";
import { handleMetaCallback } from "@/server/connections/meta";

/**
 * GET /api/v1/channels/meta/callback — back from Meta with a code and the state.
 *
 * Declared as a read of the account: no workspace is resolved at the door, because the signed state IS the credential
 * here. It names the workspace chosen at connect time, and this person's standing in it is judged after the state has
 * proved itself, in the order the proof demands. Every outcome is a redirect to Connections with one word the row reads.
 */
export const GET = read({
  scope: account,
  handle: ({ ctx, req }) => handleMetaCallback(ctx, req),
});
