import { read, account } from "@/server/route";
import { mailboxCallback } from "@/server/connections/mailbox-connections";

/**
 * GET /api/v1/mailbox-connections/callback — back from Google or Microsoft with a code and the state (the address both
 * providers are registered with: the edge's MAILBOX_OAUTH_REDIRECT).
 *
 * Declared as a read of the account: no workspace is resolved at the door, because the signed state IS the credential
 * here. It names the workspace chosen at connect time, and this person's standing in it is judged after the state has
 * proved itself. Every outcome is a redirect to Connections with one word the block reads once.
 *
 * The handle is mailboxCallback in src/server/connections/mailbox-connections.ts.
 */
export const GET = read({
  scope: account,
  handle: ({ ctx, req }) => mailboxCallback(ctx, req),
});
