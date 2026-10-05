import { read, account } from "@/server/route";
import { googleCallback } from "@/server/connections/google-actions";

/**
 * GET /api/v1/google/callback — back from Google with a code and the state.
 *
 * Nothing here is trusted until the state proves itself: signed with the
 * dashboard's key, unexpired, and naming the person who is signed in right
 * now. Then the code goes to the edge, which holds the client secret and
 * does the exchange. Every outcome is a redirect to Integrations with one
 * word the card reads once — the browser is a person's browser, not a
 * client that reads JSON.
 *
 * Declared as a read of the account: no workspace is resolved at the door,
 * because the signed state IS the credential here. It names the workspace
 * chosen at connect time, and this person's standing in it is judged below,
 * after the state has proved itself — its own door, in the order the proof
 * demands.
 *
 * The handle is googleCallback in src/server/connections/google-actions.ts: the route is its declaration (who may, how
 * often), the verb is what it does.
 */
export const GET = read({
  scope: account,
  handle: ({ ctx, req }) => googleCallback(ctx, req),
});
