import { read, write, account } from "@/server/route";
import {
  AppError,
  PartnerBecomeSchema,
  cleanPartnerCode,
  type PartnerBalanceRow,
  type PartnerDto,
} from "@chanlytics/contracts";
import { becomePartner, getOwnPartner, getPartnerBalance } from "@chanlytics/db";

/**
 * GET /api/v1/partner — the caller's partner account (decision 0012), or null, and what the ledger holds for them:
 * held, payable and paid, by currency (00203 partner_balance). On the account, not a workspace: a partner is a
 * person, and the pane that shows it is the person's. The database answers about the caller alone.
 */
export const GET = read({
  scope: account,
  handle: async ({ ctx }): Promise<{ partner: PartnerDto | null; balance: PartnerBalanceRow[] }> => {
    const row = await getOwnPartner(ctx.supabase);
    if (!row) return { partner: null, balance: [] };
    return { partner: row as PartnerDto, balance: await getPartnerBalance(ctx.supabase) };
  },
});

/** Postgres error codes partner_become raises deliberately, mapped to the wire. */
const RAISED: Record<string, { code: "validation" | "conflict" | "forbidden"; status: number }> = {
  "22023": { code: "validation", status: 400 }, // the code's shape, a reserved word
  "23505": { code: "conflict", status: 409 }, // already a partner, or the code is taken
  "28000": { code: "forbidden", status: 403 }, // no auth.uid() behind the session
};

/**
 * POST /api/v1/partner — {code, terms: true}: the caller becomes a partner, once. The code is judged here first in
 * contracts' words, then by the function, whose own words (taken, reserved, already one) reach the pane as they are.
 */
export const POST = write({
  scope: account,
  role: null,
  rate: "partner_become",
  input: PartnerBecomeSchema,
  handle: async ({ ctx, input }): Promise<{ partner: PartnerDto }> => {
    const cleaned = cleanPartnerCode(input.code);
    if (!cleaned.ok) throw new AppError("validation", cleaned.reason);
    const r = await becomePartner(ctx.supabase, cleaned.code);
    if (!r.ok) {
      const mapped = RAISED[r.code];
      if (mapped) throw new AppError(mapped.code, r.message, mapped.status);
      throw new Error(r.message);
    }
    return { partner: r.row as PartnerDto };
  },
});
