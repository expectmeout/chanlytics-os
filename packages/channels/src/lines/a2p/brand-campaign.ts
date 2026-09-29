/**
 * The Messaging API half of a registration, as requests: the brand registered from the two profiles, and the
 * campaign on the line's Messaging Service, filed, corrected in place or taken off. The profiles are trust-hub.ts;
 * the policies, the hosts and the request's shape are wire.ts.
 */
import type { BrandType } from "./business-record";
import { MESSAGING, type A2PRequest } from "./wire";

/**
 * The brand. `mock` registers against Twilio's test registry: free, never
 * routes a real message, and gone after thirty days — which is how this
 * whole path is exercised before a customer pays for anything.
 */
/**
 * `skipVetting` is a MONEY decision, so it is stated rather than defaulted.
 *
 * Twilio runs an automatic secondary vetting on a standard brand unless told
 * not to, and it is the expensive half of registering a business: the first
 * real filing this product made cost $46.00 in two one-time events, of which
 * the brand registration itself is $4.
 *
 * What the vetting buys is a brand SCORE, and a score only buys throughput --
 * T-Mobile's higher daily tiers. That filing came back with a score of 46,
 * below the threshold where the tier changes, on a LOW_VOLUME campaign whose
 * whole point is that it sends a handful of messages a day. So it bought
 * nothing, for every customer, for ever.
 *
 * A brand can be vetted later (the Vettings endpoint) if a workspace ever needs
 * the throughput. Paying up front for every salon, in case one of them turns
 * into a sender, is the wrong way round.
 */
export function brandRequest(o: {
  customerProfileBundleSid: string;
  a2pProfileBundleSid: string;
  brandType: BrandType;
  mock: boolean;
  skipVetting: boolean;
}): A2PRequest {
  return {
    url: `${MESSAGING}/a2p/BrandRegistrations`,
    method: "POST",
    form: {
      CustomerProfileBundleSid: o.customerProfileBundleSid,
      A2PProfileBundleSid: o.a2pProfileBundleSid,
      BrandType: o.brandType,
      ...(o.skipVetting ? { SkipAutomaticSecVet: "true" } : {}),
      ...(o.mock ? { Mock: "true" } : {}),
    },
  };
}

/** What the campaign says about the messages this workspace will send. */
export interface CampaignFacts {
  brandSid: string;
  messagingServiceSid: string;
  /** What the receptionist does, in a reviewer's words. */
  description: string;
  /** How a customer comes to be on the list. */
  messageFlow: string;
  /** Two to five real examples. */
  samples: string[];
  optInMessage: string;
  optInKeywords: string[];
  privacyPolicyUrl: string;
  termsUrl: string;
  useCase: string;
}

/**
 * A keyword is one word.
 *
 * The carriers refuse anything with a space — "Opt In Keywords must contain
 * either alphanumeric or accented characters" — and they refuse it at the
 * campaign, after the brand is registered. Our own opt-in phrase is two
 * words ("YES OFFERS"), which belongs in the message flow, where it is
 * explained, and not in this field. So only single words are declared, and
 * only ones the product actually honours.
 */
export function keywordsFor(words: readonly string[]): string[] {
  return words.map((w) => w.trim()).filter((w) => /^[A-Za-z0-9]+$/.test(w));
}

/**
 * Twilio's code for a small business sending a bit of everything.
 *
 * The same use case for both registrations. A sole proprietor's ceiling is set
 * by the BRAND -- one campaign, one number, a thousand messages a day on
 * T-Mobile: SOLE_PROP_LIMITS, in contracts -- not by the use case, so there is
 * nothing to choose here, and choosing anyway would be a second place for the
 * two paths to disagree.
 */
export const LOW_VOLUME_USECASE = "LOW_VOLUME";

export function campaignRequest(f: CampaignFacts): A2PRequest {
  const form: Record<string, string | string[]> = {
    BrandRegistrationSid: f.brandSid,
    Description: f.description,
    MessageFlow: f.messageFlow,
    UsAppToPersonUsecase: f.useCase,
    HasEmbeddedLinks: "true",
    HasEmbeddedPhone: "true",
    SubscriberOptIn: "true",
    AgeGated: "false",
    DirectLending: "false",
    OptInMessage: f.optInMessage,
    PrivacyPolicyUrl: f.privacyPolicyUrl,
    TermsAndConditionsUrl: f.termsUrl,
  };
  // Repeated keys, the way Twilio's form encoding takes a list.
  form.MessageSamples = f.samples.slice(0, 5);
  const keywords = keywordsFor(f.optInKeywords);
  if (keywords.length) form.OptInKeywords = keywords;
  else delete form.OptInMessage;
  return { url: `${MESSAGING}/Services/${f.messagingServiceSid}/Compliance/Usa2p`, method: "POST", form };
}

/**
 * Correct a campaign the carriers sent back, and resubmit it.
 *
 * NOT a delete and a re-create, and the difference is money. Twilio assesses
 * the campaign vetting fee ONCE PER CAMPAIGN, at its first vetting decision:
 *
 *   "A vetting fee is assessed only once per Campaign. So if a Campaign is
 *    rejected its important to resubmit it rather than deleting and recreating
 *    a new campaign."
 *
 * A replacement campaign is a new submission and is charged again ($15 on the
 * first one this product filed). An edit of the same QE resource is not. So a
 * rejection costs nothing to answer, however many times it takes -- which is
 * the right shape anyway, because a rejection is a correction request and the
 * corrections are usually one line of copy.
 *
 * All seven fields are required on every update, including the four booleans;
 * a campaign TCR has already approved may not change those, so they are passed
 * back exactly as they were sent.
 */
/**
 * Correct a campaign in place, which is the whole remedy for a refused one.
 *
 * EVERYTHING TWILIO WILL ACCEPT, and no more. Their documentation is explicit
 * about both halves: the update takes the description, the message flow, the
 * samples, the four booleans and the two policy URLs -- and "any parameters
 * included in the original Campaign CREATE call, but not specifically mentioned
 * in the update table, cannot be edited under any circumstances", naming opt-in,
 * opt-out and help information and the use case. Those need a delete and a
 * recreate, which is a second vetting fee.
 *
 * The two URLs were being dropped, and the map of this file called that out:
 * seven of the fourteen fields the create sends were written once and could
 * never be corrected. Two of them can be, and now are. A campaign filed from an
 * edge deployment whose DASHBOARD_ORIGIN was unset carries a wrong privacy URL
 * permanently otherwise.
 *
 * Editing a FAILED campaign is free: "a vetting fee is assessed only once per
 * Campaign."
 */
export function updateCampaignRequest(
  messagingServiceSid: string,
  campaignSid: string,
  f: Pick<CampaignFacts, "description" | "messageFlow" | "samples" | "privacyPolicyUrl" | "termsUrl">,
): A2PRequest {
  const form: Record<string, string | string[]> = {
    Description: f.description,
    MessageFlow: f.messageFlow,
    HasEmbeddedLinks: "true",
    HasEmbeddedPhone: "true",
    AgeGated: "false",
    DirectLending: "false",
    PrivacyPolicyUrl: f.privacyPolicyUrl,
    TermsAndConditionsUrl: f.termsUrl,
  };
  form.MessageSamples = f.samples.slice(0, 5);
  return { url: `${MESSAGING}/Services/${messagingServiceSid}/Compliance/Usa2p/${campaignSid}`, method: "POST", form };
}

/**
 * Take the campaign off a Messaging Service.
 *
 * A service holds ONE campaign, so a second POST is refused while the first is
 * there. That is only a problem for the one case this exists for: a filing made
 * against Twilio's mock registry, which never routes a real message and expires
 * in thirty days, being replaced by a real one. A real campaign is never
 * deleted from here — it was paid for and vetted, and the caller refuses the
 * whole operation before reaching this.
 *
 * The INSTANCE url, not the collection. The collection answers 405 with error
 * 20004 ("does not support the attempted HTTP method DELETE"), which the caller
 * treated as best-effort and swallowed — so the mock campaign stayed on the
 * service and the refile went on to be refused a step later. Verified against
 * the live API on 2026-09-09: the instance url answers 204 and the service's
 * compliance list is then empty.
 */
export function deleteCampaignRequest(messagingServiceSid: string, campaignSid: string): A2PRequest {
  return { url: `${MESSAGING}/Services/${messagingServiceSid}/Compliance/Usa2p/${campaignSid}`, method: "DELETE" };
}
