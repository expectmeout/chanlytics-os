/**
 * A2P 10DLC: registering one workspace with the carriers, as pure parts.
 *
 * The shape of it, from Twilio's ISV walkthrough: the business on record
 * becomes a secondary customer profile under Chanlytics' own approved
 * primary profile, that profile carries the business, the person who
 * signs for it and the address, it is evaluated and submitted, an A2P
 * messaging profile is built beside it, a brand is registered from the
 * two, and a campaign is attached to the line's Messaging Service. Each
 * step records what it made before the next runs, so a resumed
 * registration repeats nothing and pays nothing twice.
 *
 * Policy ids read from Twilio's own Policies endpoint on 2026-09-08, not
 * copied from a blog. Request shapes verified the same day against the
 * ISV onboarding guide, the BrandRegistrations resource and the
 * UsAppToPerson resource.
 *
 * WHOSE ACCOUNT. Every call here is made as the WORKSPACE'S OWN subaccount,
 * which is what Twilio's ISV guide asks for: "create a Secondary Customer
 * Profile under the customer's subaccount and register a Brand under the
 * customer's subaccount". A brand registered on the parent is not shared
 * with the subaccount that owns the Messaging Service, and the campaign is
 * refused with 21717 — after the brand is registered and, on a real filing,
 * paid for. Chanlytics' own primary profile is not moved into the
 * subaccount; it is REFERENCED by sid, and that reference is the whole
 * declaration that this business is ours.
 *
 * This module holds the wire's own vocabulary: the Trust Hub policies, the two
 * hosts, and a request and how its form is written. The requests themselves are
 * trust-hub.ts (the profiles, the end users, the address) and brand-campaign.ts
 * (the brand and the campaign); the business they describe is
 * business-record.ts; the saga's steps are steps.ts and what the carriers
 * answer is verdict.ts.
 */

/** Trust Hub policies, by the names Twilio gives them. */
export const A2P_POLICIES = {
  /** The bundle one customer of an ISV gets. */
  secondaryCustomerProfile: "RNdfbf3fae0e1107f8aded0e7cead80bf5",
  /** The messaging profile a brand is registered from. */
  a2pMessaging: "RNb0d4771c2c98518d916a3d4cd70a8f8b",
  /**
   * A customer with no tax id registers on a PAIR of these instead, and it is
   * a pair -- half of it was here for months and the other half was missing,
   * which is why the path was refused rather than built.
   *
   * Verified against the live Policies API on 2026-09-09, because filing
   * against the wrong policy produces a registration that is refused after it
   * has been paid for:
   *
   *   RN806dd6... "Starter Customer Profile of type Business"
   *   RN670d5d... "Sole Proprietor TrustProduct"
   */
  starterCustomerProfile: "RN806dd6cd175f314e1f96a9727ee271f4",
  soleProprietor: "RN670d5d2e282a6130ae063b234b6019c8",
} as const;

export const TRUSTHUB = "https://trusthub.twilio.com/v1";
export const MESSAGING = "https://messaging.twilio.com/v1";

export interface A2PRequest {
  url: string;
  method: "GET" | "POST" | "DELETE";
  /**
   * Form fields; the caller encodes them. A list is sent as REPEATED keys —
   * `MessageSamples=a&MessageSamples=b` — which is the only shape Twilio
   * parses. Indexed keys (`MessageSamples[0]`) come back as
   * "Unable to process JSON".
   */
  form?: Record<string, string | string[]>;
}

/** One place that knows how a list is written on the wire. */
export function encodeForm(form: Record<string, string | string[]>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(form)) {
    if (Array.isArray(v)) v.forEach((one) => q.append(k, one));
    else q.append(k, v);
  }
  return q.toString();
}
