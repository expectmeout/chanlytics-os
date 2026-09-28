/**
 * The registration's steps and their receipts: the order the saga walks them (A2P_STEPS), what it has made so far
 * (A2PState), and the next step on either registration (nextA2PStep). The saga that runs them is ../a2p-saga.ts.
 */
import type { SchemaSet } from "@chanlytics/contracts";
import type { BrandType } from "./business-record";

/* --------------------------- the state machine --------------------------- */

export type A2PStep = SchemaSet<"lines.reg_step">;
/** In the order the saga walks them; schema-agreement.ts holds them to the column. */
export const A2P_STEPS = [
  "profile",
  "business",
  "representative",
  "address",
  "document",
  "primary",
  "submit",
  "a2p_profile",
  "brand",
  "campaign",
] as const;

/** What the registration has made so far. Every field is a receipt for one step. */
export interface A2PState {
  profileSid: string | null;
  businessSid: string | null;
  representativeSid: string | null;
  addressSid: string | null;
  documentSid: string | null;
  primaryAssigned: boolean;
  profileSubmitted: boolean;
  a2pProfileSid: string | null;
  brandSid: string | null;
  campaignSid: string | null;
}

export const EMPTY_A2P_STATE: A2PState = {
  profileSid: null,
  businessSid: null,
  representativeSid: null,
  addressSid: null,
  documentSid: null,
  primaryAssigned: false,
  profileSubmitted: false,
  a2pProfileSid: null,
  brandSid: null,
  campaignSid: null,
};

/**
 * The first step whose receipt is missing; null when the registration is filed.
 *
 * TWO LISTS, because there are two registrations. A business with a tax id
 * files a company: its name, its EIN, an authorised representative who signs
 * for it, and a document proving the address. A sole proprietor files a
 * PERSON: their name, their email, their address, and the mobile the carriers
 * will text. Neither is a subset of the other, so this is a fork rather than a
 * flag -- and the shared steps (address, primary, submit, brand, campaign) are
 * genuinely shared, which is why one function still answers for both.
 */
export function nextA2PStep(s: A2PState, brandType: BrandType = "STANDARD"): A2PStep | null {
  if (brandType === "SOLE_PROPRIETOR") {
    if (!s.profileSid) return "profile";
    // The person, not a business and not a representative: the starter policy
    // asks for one end user carrying four fields.
    if (!s.businessSid) return "business";
    if (!s.addressSid) return "address";
    if (!s.documentSid) return "document";
    if (!s.primaryAssigned) return "primary";
    if (!s.profileSubmitted) return "submit";
    if (!s.a2pProfileSid) return "a2p_profile";
    if (!s.brandSid) return "brand";
    if (!s.campaignSid) return "campaign";
    return null;
  }
  if (!s.profileSid) return "profile";
  if (!s.businessSid) return "business";
  if (!s.representativeSid) return "representative";
  if (!s.addressSid) return "address";
  if (!s.documentSid) return "document";
  if (!s.primaryAssigned) return "primary";
  if (!s.profileSubmitted) return "submit";
  if (!s.a2pProfileSid) return "a2p_profile";
  if (!s.brandSid) return "brand";
  if (!s.campaignSid) return "campaign";
  return null;
}
