export const OFFERS_BY_EMAIL_WORDS = {
  /** The deployment's campaigns domain is not set up or not verified yet. */
  noCampaignsDomain: "Offers by email start once the campaigns domain is set up.",
  /** The business has no postal address on file, which every offer's foot names. */
  noAddress: "Add your business's address to send offers by email.",
  /** The workspace's offers are paused by a gate. */
  paused: "Offers by email are paused while complaints and bounces settle."
};
export const OFFER_GATES = {
  complaints: { window: 1e3, above: 1e-3, minimum: 200 },
  bounces: { window: 500, above: 0.02, minimum: 100 }
};
const OFFER_PAUSE_REASONS = ["complaints", "bounces"];
export function offerGate(c) {
  const { complaints, bounces } = OFFER_GATES;
  if (c.complaintSample >= complaints.minimum && c.complaints / c.complaintSample > complaints.above)
    return "complaints";
  if (c.bounceSample >= bounces.minimum && c.bounces / c.bounceSample > bounces.above) return "bounces";
  return null;
}
export function offerPauseOf(at, reason) {
  if (!at) return null;
  return {
    at,
    reason: OFFER_PAUSE_REASONS.includes(reason ?? "") ? reason : null
  };
}
const pausedBecause = (reason) => reason === "complaints" ? "too many people marked offers as spam" : reason === "bounces" ? "too many offers went to addresses that did not accept them" : "complaints and bounces need a look";
export const OFFERS_PAUSED_WORDS = {
  head: (reason) => `Offers and news by email are paused: ${pausedBecause(reason)}. Reminders, confirmations and replies still go by email.`,
  /** Where it is told once more, to the person who can do something about it. */
  fix: "Check your list for old or wrong addresses. We'll turn them back on once it looks right."
};
export const OFFERS_NOTICE_WORDS = {
  paused: (reason) => ({
    title: "Offers and news by email are paused",
    body: `We paused your offers and news by email: ${pausedBecause(reason)}. They wait until it is fixed: a broadcast or a campaign that goes only by email stops when it reaches them, and one that also goes another way skips the people it would reach by email and goes on for everyone else. Reminders, confirmations, replies by email and everything on WhatsApp go on. ${OFFERS_PAUSED_WORDS.fix}`
  })
};
export function emailOffersOpen(f, couldNotBeChecked) {
  if (f.campaigns === null) return { ok: false, why: couldNotBeChecked, paused: f.paused };
  if (!f.campaigns) return { ok: false, why: OFFERS_BY_EMAIL_WORDS.noCampaignsDomain, paused: f.paused };
  if (!f.address) return { ok: false, why: OFFERS_BY_EMAIL_WORDS.noAddress, paused: f.paused };
  if (f.paused) return { ok: false, why: OFFERS_BY_EMAIL_WORDS.paused, paused: f.paused };
  return { ok: true, why: null, paused: null };
}
export function offersPausedLine(offers) {
  return offers?.paused ? OFFERS_PAUSED_WORDS.head(offers.paused.reason) : null;
}
