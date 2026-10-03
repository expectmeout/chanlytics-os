import { read, write, account } from "@/server/route";
import { PartnerBecomeSchema, PartnerLettersSchema } from "@chanlytics/contracts";
import { readPartnerAccount, becomeAPartner, setPartnerLettersOf } from "@/server/workspace/partner-account";

/**
 * GET /api/v1/partner — the caller's partner account (decision 0012), or null, and what the ledger holds for them:
 * held, payable and paid, by currency (00203 partner_balance). On the account, not a workspace: a partner is a
 * person, and the pane that shows it is the person's. The database answers about the caller alone.
 *
 * The handle is readPartnerAccount in src/server/workspace/partner-account.ts: the route is its declaration (who may,
 * how often), the verb is what it does.
 */
export const GET = read({
  scope: account,
  handle: ({ ctx }) => readPartnerAccount(ctx),
});

/**
 * POST /api/v1/partner — {code, terms: true}: the caller becomes a partner, once. The code is judged here first in
 * contracts' words, then by the function, whose own words (taken, reserved, already one) reach the pane as they are.
 *
 * The handle is becomeAPartner in src/server/workspace/partner-account.ts: the route is its declaration (who may, how
 * often), the verb is what it does.
 */
export const POST = write({
  scope: account,
  role: null,
  rate: "partner_become",
  input: PartnerBecomeSchema,
  handle: ({ ctx, input }) => becomeAPartner(ctx, input),
});

/**
 * PATCH /api/v1/partner — {letters}: the caller's daily letter on or off (decision 0014, 00209 partner_letters_set).
 * On starts from now, so turning it back on sends no backlog. The caller's own row alone; no workspace, no role.
 *
 * The handle is setPartnerLettersOf in src/server/workspace/partner-account.ts: the route is its declaration (who may,
 * how often), the verb is what it does.
 */
export const PATCH = write({
  scope: account,
  role: null,
  rate: "partner_letters",
  input: PartnerLettersSchema,
  handle: ({ ctx, input }) => setPartnerLettersOf(ctx, input),
});
