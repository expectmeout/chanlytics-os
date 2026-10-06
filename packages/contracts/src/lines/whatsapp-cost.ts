/**
 * What WhatsApp costs and who bills it, in the owner's words: one place, said under the WhatsApp row before it is connected and
 * after, and in one line on Settings > Billing, so nobody learns from a statement that Meta bills its own messages to the card on
 * the WhatsApp account and not on the Chanlytics bill.
 *
 * The facts are Meta's (its pricing documentation, 6 October 2026): per-message pricing since 1 July 2025; an account is charged
 * only when a template message is delivered; free are every message that is not a template inside an open customer service window
 * (24 hours after the customer's last message), utility templates delivered inside an open window, and every message inside a
 * 72-hour free entry point window; charged are marketing templates, and utility and authentication templates outside a window; the
 * rate depends on the recipient's country calling code, the category and the month's volume. NO RATE IS WRITTEN HERE: a rate moves
 * when Meta's does, so the words link Meta's own page for them.
 */
import type { ConnectionNote } from "./connection-note";

/** Meta's page of current rates, by country and category. */
const RATES_URL = "https://business.whatsapp.com/products/platform-pricing#rates";

export const WHATSAPP_COST_WORDS = {
  /** What the explainer is called where a page links to it. */
  title: "What WhatsApp costs",
  billed: "WhatsApp is billed by Meta, straight to the card on your WhatsApp account — not on your Chanlytics bill.",
  free: "Free: replies to a customer within 24 hours of their last message — the receptionist's and yours.",
  charged:
    "Charged by Meta for each one delivered: reminders and notices sent after those 24 hours, and every campaign or offer.",
  prices: "Prices depend on the customer's country.",
  pricesLink: "Meta's current prices",
  /** The one line Settings > Billing says, with `title` as the link to the explainer on Connections. */
  billingLine:
    "WhatsApp messages your business starts are billed by Meta to the card on your WhatsApp account, not on this bill.",
} as const;

/** The explainer as a row's notes: four lines, the last with the link to Meta's rates. */
export function whatsappCostNotes(): ConnectionNote[] {
  const w = WHATSAPP_COST_WORDS;
  return [
    { text: w.billed },
    { text: w.free },
    { text: w.charged },
    { text: w.prices, link: { label: w.pricesLink, href: RATES_URL } },
  ];
}

/**
 * Meta's page for adding a payment method to a WhatsApp Business Account, opened on the business that owns the account and on the
 * account (a payment method is the business's own: Chanlytics cannot add one for it). Null where either id is not known or is not
 * digits, so the note points at Meta Business Suite instead of at a link that would open on nothing.
 */
export function addPaymentMethodLink(ownerBusinessId: string | null, wabaId: string | null): string | null {
  const ids = /^\d+$/;
  if (!ownerBusinessId || !wabaId || !ids.test(ownerBusinessId) || !ids.test(wabaId)) return null;
  return `https://business.facebook.com/billing_hub/accounts/details/?business_id=${ownerBusinessId}&asset_id=${wabaId}&wizard_name=ADD_PM&account_type=whatsapp-business-account`;
}
