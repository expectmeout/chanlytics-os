/**
 * The watch on cold email's receipts (Reach out, Part 2.5): run by the domains sweep, with no clock of its own.
 *
 * Cold email's receipts come from the second mail account, signed with RESEND_COLD_WEBHOOK_SECRET. Set wrong, the
 * webhook refuses every one of them and nothing else says so: the emails still leave, each stays `sent` for ever,
 * and a bounce or a complaint never reaches the domain it left from. So a domain whose emails of the last day have
 * heard nothing back at all pages the platform (00179's cold_receipts_owed, by when each email was sent). A bounce is
 * a receipt too, so a domain whose receipts arrive is never paged for the few still on their way. The page names
 * counts, never an address or a business, and the pager says it once in its window.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { coldReceiptsOwed, type Database } from "../packages/db.js";
import { errField, type Logger } from "../log.js";

/** The window a delivery receipt must have come in: back a day, and two hours for the slowest server. */
export const RECEIPTS_FROM_MS = 26 * 3600_000;
export const RECEIPTS_TO_MS = 2 * 3600_000;
/** Fewer emails than this say nothing: one slow server is not a secret set wrong. */
export const RECEIPTS_AT_LEAST = 3;

export const COLD_RECEIPTS_PAGE = "email_cold_receipts_missing";

export interface ColdReceiptPorts {
  db: SupabaseClient<Database>;
  now: () => number;
  log: Logger;
  /** The platform's pager (ops/page-operator.ts). */
  page: (key: string, subject: string, body: string) => Promise<unknown>;
}

/**
 * How many own domains heard nothing back, and how many emails they sent in the window; null when that could not be
 * read (logged; the sweep's own answer does not change, since the domains were read either way).
 */
export async function watchColdReceipts(p: ColdReceiptPorts): Promise<{ domains: number; emails: number } | null> {
  const now = p.now();
  let rows;
  try {
    rows = await coldReceiptsOwed(p.db, new Date(now - RECEIPTS_FROM_MS), new Date(now - RECEIPTS_TO_MS));
  } catch (e) {
    p.log.error("domains_receipts_unreadable", { error: errField(e) });
    return null;
  }
  const silent = rows.filter((r) => r.sent >= RECEIPTS_AT_LEAST && r.unanswered === r.sent);
  const out = { domains: silent.length, emails: silent.reduce((n, r) => n + r.sent, 0) };
  if (!out.domains) return out;
  p.log.error("domains_cold_receipts_missing", out);
  await p.page(
    COLD_RECEIPTS_PAGE,
    "Cold email: no receipts are arriving",
    `${out.emails} emails left ${out.domains === 1 ? "one own domain" : `${out.domains} own domains`} between 2 and ` +
      `26 hours ago, and not one has had a delivery receipt.\n\n` +
      `The cold account's webhook is most likely refused: check that RESEND_COLD_WEBHOOK_SECRET on the edge is that ` +
      `webhook's signing secret, and that the webhook points at /api/resend-webhook. Until it is, a bounce or a ` +
      `complaint on cold email is not counted against the domain it left from.\n\n` +
      `Fixed in the last day? The emails sent before the fix never hear back, so this can come again until the ` +
      `domain's new emails have their receipts.`,
  );
  return out;
}
