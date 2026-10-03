/**
 * Offers by email (One message, every channel, step 4; the campaigns-on-every-channel spec, 4.1, 4.5 and 4.6): when a
 * workspace may send one, what pauses them, and every sentence a page says about either. Pure.
 *
 * An offer by email goes only where all three hold:
 *   - the deployment has its campaigns domain set up and verified: the From domain offers leave from, apart from the one
 *     replies and visit messages use, so a complaint about an offer never touches the reply domain (the edge says it:
 *     apps/edge lib/email/campaigns-domain.ts, through its readiness door);
 *   - the business has a postal address on file, because every offer's foot names it (templates/email-foot.ts), and the
 *     law asks for it (CAN-SPAM);
 *   - the workspace's offers are not paused by the gates below.
 * Whoever may receive one is the rule's (consent.ts mayMessageFor: no unsubscribe, and a relationship on record or their
 * own yes); this is the workspace's side. Visit messages and replies by email are never held by any of it.
 */

/** What a tick, a refusal and the Campaigns head say of offers by email. One owner for each sentence. */
export const OFFERS_BY_EMAIL_WORDS = {
  /** The deployment's campaigns domain is not set up or not verified yet. */
  noCampaignsDomain: "Offers by email start once the campaigns domain is set up.",
  /** The business has no postal address on file, which every offer's foot names. */
  noAddress: "Add your business's address to send offers by email.",
  /** The workspace's offers are paused by a gate. */
  paused: "Offers by email are paused while complaints and bounces settle.",
} as const;

/* ---------------------------------------------------------------- gates -- */

/**
 * The gates on offers by email (the spec's 4.5): complaints above 0.1% of the last 1,000 offers that went, or hard
 * bounces above 2% of the last 500, pause the workspace's offers by email. The pause is the workspace's, and it holds
 * offers alone: reminders and replies by email, and offers by WhatsApp, go on. Read from the receipts the edge stores
 * (apps/edge lib/email/email-receipts.ts), judged where a receipt arrives, cleared by the back office once the list is fixed.
 *
 * `minimum` is the fewest offers a gate judges at all (the spec names none; a rate over a handful of sends is noise: one
 * complaint on the first offer is 100%). Below it the gate says nothing, and a gate is judged over the offers sent since
 * the workspace's last resume (`offers_resumed_at`, 00288), so a resumed workspace starts a fresh count and is not paused
 * again by the offers that paused it. At 200 offers a single complaint is 0.5%, above the line; at 100 offers it takes
 * three bounces, which are 3%.
 */
export const OFFER_GATES = {
  complaints: { window: 1000, above: 0.001, minimum: 200 },
  bounces: { window: 500, above: 0.02, minimum: 100 },
} as const;

/** Why a workspace's offers by email are paused: a closed set, kept on the mailbox beside when. */
const OFFER_PAUSE_REASONS = ["complaints", "bounces"] as const;
export type OfferPauseReason = (typeof OFFER_PAUSE_REASONS)[number];

/**
 * What the database counts of a workspace's offers by email, among those that left (sent, delivered, or failed by a
 * bounce): the last `OFFER_GATES.complaints.window` of them and the complaints among them, and the last
 * `OFFER_GATES.bounces.window` and the hard bounces among them (email_offer_counts, 00288).
 */
export interface OfferCounts {
  complaintSample: number;
  complaints: number;
  bounceSample: number;
  bounces: number;
}

/**
 * Whether the counts trip a gate, and which: complaints first, since a person marking an offer as spam is the worse
 * signal. A gate is judged only over at least its `minimum` offers (OFFER_GATES), so null while both rates are within
 * bounds, and for a workspace that has sent too few to say (none, or since its last resume).
 */
export function offerGate(c: OfferCounts): OfferPauseReason | null {
  const { complaints, bounces } = OFFER_GATES;
  if (c.complaintSample >= complaints.minimum && c.complaints / c.complaintSample > complaints.above)
    return "complaints";
  if (c.bounceSample >= bounces.minimum && c.bounces / c.bounceSample > bounces.above) return "bounces";
  return null;
}

/** A workspace's offers by email paused: since when, and why where it is known. */
export interface OfferPause {
  at: string;
  reason: OfferPauseReason | null;
}

/** The pause as the mailbox keeps it (`offers_paused_at`, `offers_paused_reason`, 00288): null while offers are not paused. */
export function offerPauseOf(at: string | null | undefined, reason: string | null | undefined): OfferPause | null {
  if (!at) return null;
  return {
    at,
    reason: (OFFER_PAUSE_REASONS as readonly string[]).includes(reason ?? "") ? (reason as OfferPauseReason) : null,
  };
}

/** The Campaigns head's and Connections' words for a pause: what it holds, why, and what it does not. */
export const OFFERS_PAUSED_WORDS = {
  head: (reason: OfferPauseReason | null): string => {
    const why =
      reason === "complaints"
        ? "too many people marked offers as spam"
        : reason === "bounces"
          ? "too many offers went to addresses that did not accept them"
          : "complaints and bounces need a look";
    return `Offers by email are paused: ${why}. Appointment messages and replies still go by email.`;
  },
  /** Where it is told once more, to the person who can do something about it. */
  fix: "Check your list for old or wrong addresses. We'll turn offers by email back on once it looks right.",
} as const;

/* ------------------------------------------------------------ readiness -- */

/** Whether a workspace's offers by email can go now, and the sentence that says why not. */
export interface EmailOffers {
  ok: boolean;
  why: string | null;
  /** A gate holds them (the others are the deployment's and the business's to set up): the Campaigns head says so. */
  paused: OfferPause | null;
}

/**
 * The facts offers by email are judged by: whether the deployment's campaigns domain is verified (the edge's answer; null
 * when it could not be asked, which is not a yes), whether the business has a postal address, and the mailbox's pause.
 */
export interface OfferFacts {
  campaigns: boolean | null;
  address: boolean;
  paused: OfferPause | null;
}

/**
 * Whether offers by email can go, in the order a person can act on: the deployment's domain first (not the owner's to
 * fix), then the address (theirs), then a pause (nobody's, until the list is fixed). An edge that could not be asked is
 * "could not be checked", never ready: the page says so and offers nothing.
 */
export function emailOffersOpen(f: OfferFacts, couldNotBeChecked: string): EmailOffers {
  if (f.campaigns === null) return { ok: false, why: couldNotBeChecked, paused: f.paused };
  if (!f.campaigns) return { ok: false, why: OFFERS_BY_EMAIL_WORDS.noCampaignsDomain, paused: f.paused };
  if (!f.address) return { ok: false, why: OFFERS_BY_EMAIL_WORDS.noAddress, paused: f.paused };
  if (f.paused) return { ok: false, why: OFFERS_BY_EMAIL_WORDS.paused, paused: f.paused };
  return { ok: true, why: null, paused: null };
}

/** The Campaigns head's line while offers by email are paused, else null (a quiet page says nothing). */
export function offersPausedLine(offers: Pick<EmailOffers, "paused"> | null | undefined): string | null {
  return offers?.paused ? OFFERS_PAUSED_WORDS.head(offers.paused.reason) : null;
}
