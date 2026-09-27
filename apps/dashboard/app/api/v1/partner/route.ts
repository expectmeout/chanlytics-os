import { read, write, account } from "@/server/route";
import {
  AppError,
  PartnerBecomeSchema,
  PartnerLettersSchema,
  cleanPartnerCode,
  type PartnerBalanceRow,
  type PartnerDto,
} from "@chanlytics/contracts";
import {
  becomePartner,
  getOwnPartner,
  getPartnerBalance,
  getPartnerBroughtCount,
  getPartnerLetters,
  setPartnerLetters,
} from "@chanlytics/db";

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
    // The count of workspaces brought is the ledger's (partner_tenants), not the seats held now: a pause or an owner
    // taking the partner off a team changes the seats, never how many the link brought.
    const [balance, brought, letters] = await Promise.all([
      getPartnerBalance(ctx.supabase),
      getPartnerBroughtCount(ctx.supabase, row.id),
      getPartnerLetters(ctx.supabase),
    ]);
    return { partner: { ...(row as PartnerDto), brought, letters }, balance };
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

/**
 * PATCH /api/v1/partner — {letters}: the caller's daily letter on or off (decision 0014, 00208 partner_letters_set).
 * On starts from now, so turning it back on sends no backlog. The caller's own row alone; no workspace, no role.
 */
export const PATCH = write({
  scope: account,
  role: null,
  rate: "partner_letters",
  input: PartnerLettersSchema,
  handle: async ({ ctx, input }): Promise<{ letters: boolean }> => {
    const r = await setPartnerLetters(ctx.supabase, input.letters);
    if (!r.ok) {
      if (r.code === "P0002") throw new AppError("not_found", r.message, 404);
      if (r.code === "28000") throw new AppError("forbidden", r.message, 403);
      throw new Error(r.message);
    }
    return { letters: r.letters };
  },
});
