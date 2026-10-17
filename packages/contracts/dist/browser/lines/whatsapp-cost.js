const RATES_URL = "https://business.whatsapp.com/products/platform-pricing#rates";
export const WHATSAPP_COST_WORDS = {
  /**
   * Who bills it, that a card is asked for, what is free and what is charged, in one line an owner reads under the Connect row:
   * a row says one thing at a time, and the rates themselves are Meta's page (pricesLink), which says them by country and category.
   */
  summary: "Meta bills WhatsApp to the card on your WhatsApp account, not your Chanlytics bill, so add one when Meta asks: replies within 24 hours of a customer's message are free; reminders sent after that, and campaigns, are charged for each one Meta delivers.",
  pricesLink: "Meta's current prices",
  /** Meta's page of current rates: what the Billing line and the Connect row's note link. */
  ratesUrl: RATES_URL,
  /** The one line Settings > Billing says, with `pricesLink` to Meta's own page after it. */
  billingLine: "WhatsApp messages your business starts are billed by Meta to the card on your WhatsApp account, not on this bill."
};
export function whatsappCostNotes() {
  const w = WHATSAPP_COST_WORDS;
  return [{ text: w.summary, link: { label: w.pricesLink, href: RATES_URL } }];
}
export function addPaymentMethodLink(ownerBusinessId, wabaId) {
  const ids = /^\d+$/;
  if (!ownerBusinessId || !wabaId || !ids.test(ownerBusinessId) || !ids.test(wabaId)) return null;
  return `https://business.facebook.com/billing_hub/accounts/details/?business_id=${ownerBusinessId}&asset_id=${wabaId}&wizard_name=ADD_PM&account_type=whatsapp-business-account`;
}
