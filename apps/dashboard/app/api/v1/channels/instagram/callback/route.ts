import { read, account } from "@/server/route";
import { instagramCallback } from "@/server/connections/instagram";

/**
 * GET /api/v1/channels/instagram/callback — back from Instagram with a code and the state.
 *
 * Declared as a read of the account: no workspace is resolved at the door, because the signed state IS the credential
 * here. It names the workspace chosen at connect time, and this person's standing in it is judged after the state has
 * proved itself, in the order the proof demands. Every outcome is a redirect to Connections with one word the row reads.
 */
export const GET = read({
  scope: account,
  handle: ({ ctx, req }) => instagramCallback(ctx, req),
});
