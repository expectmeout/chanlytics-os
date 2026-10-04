/**
 * The gates on offers by email (One message, every channel, step 4; the campaigns-on-every-channel spec, 4.5): complaints
 * above 0.1% of the last 1,000 offers that left, or hard bounces above 2% of the last 500, pause a workspace's offers by
 * email (contracts OFFER_GATES). Judged where the receipts that move them arrive (email-receipts.ts), from the receipts the
 * edge already stores (a complaint stamped on its row, a bounce its status): nothing is counted twice and no sweep is needed.
 *
 * The pause is the workspace's, and holds offers alone: reminders and replies by email, and offers by WhatsApp, go on. The
 * door reads it for every offer (core deliver, `email_offers_paused`), the composers draw it (the Campaigns head's line,
 * the Send by tick's reason), and only the back office clears it (the resume_email_offers door) once the list is fixed.
 * Both write the workspace's ledger (mailbox.offers_paused, mailbox.offers_resumed), and a resume starts the count afresh:
 * the gates are judged over the offers sent after it, and only once a gate has its minimum sample (OFFER_GATES), so a
 * resumed workspace is not paused again by the offers that paused it, nor by its first few.
 *
 * A judgement that fails is logged and never refuses the receipt: the receipt is already applied, and the next complaint or
 * bounce judges again.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { addressOf } from "../packages/channels.js";
import { offerGate, type OfferPauseReason } from "../packages/contracts.js";
import { emailOfferCounts, pauseEmailOffers, type Database } from "../packages/db.js";
import { logger, errField } from "../log.js";
import { pageOperator } from "../ops/page-operator.js";
import { campaignsDomain } from "./campaigns-domain.js";

type Db = SupabaseClient<Database>;

/**
 * Whether the gates now say this workspace's offers are to be paused, after a complaint or a bounce on an email that left
 * as `from`. Only an email from the campaigns domain is an offer: any other is a reply or a reminder, which no gate
 * touches. The reason it paused them for; null when they are not paused (the email was no offer, a gate is within bounds,
 * or the pause could not be written, which is said in the log).
 */
export async function judgeOfferGates(db: Db, tenantId: string, from: string | null): Promise<OfferPauseReason | null> {
  const campaigns = campaignsDomain();
  const host = addressOf(from)?.address.split("@")[1] ?? null;
  if (!campaigns || !host || host !== campaigns) return null;
  const log = logger({ tenant_id: tenantId });
  try {
    const counts = await emailOfferCounts(db, { tenantId, host });
    const reason = offerGate(counts);
    if (!reason) return null;
    // Once: a pause already in force keeps its first moment and reason, and says nothing twice.
    if (await pauseEmailOffers(db, { tenantId, reason, counts })) {
      log.info("email_offers_paused", { reason, ...counts });
      await pageOperator(
        { db },
        `email_offers_paused:${tenantId}`,
        "A workspace's offers by email were paused",
        `Workspace ${tenantId}: ${reason === "complaints" ? "complaints" : "hard bounces"} went over the limit on the campaigns domain ` +
          `(${counts.complaints} of the last ${counts.complaintSample} offers marked as spam; ${counts.bounces} of the last ` +
          `${counts.bounceSample} bounced). Its offers by email are held; reminders and replies go on.\n\n` +
          `Once its list is fixed: select public.resume_email_offers('${tenantId}');\n`,
      ).catch((e: unknown) => log.error("email_offers_gate_failed", { step: "page", error: errField(e) }));
    }
    return reason;
  } catch (e) {
    log.error("email_offers_gate_failed", { step: "judge", error: errField(e) });
    return null;
  }
}
