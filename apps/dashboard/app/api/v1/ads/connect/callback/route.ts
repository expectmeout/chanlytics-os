import { read, account } from "@/server/shared/route";
import { handleAdsCallback } from "@/server/ads/account";

/**
 * GET /api/v1/ads/connect/callback — back from Meta's window with a code and the state.
 *
 * Declared as a read of the account: no workspace is resolved at the door, because the signed state IS the credential
 * here. It names the workspace chosen when Connect was pressed, and this person's standing in it (the owner's alone) is
 * judged after the state has proved itself, in the order the proof demands. Every outcome is a redirect to the Ads page
 * with one word its card reads.
 */
export const GET = read({
  scope: account,
  handle: ({ ctx, req }) => handleAdsCallback(ctx, req),
});
