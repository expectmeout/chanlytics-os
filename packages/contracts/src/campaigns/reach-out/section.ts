/**
 * What each writer of a cold email reads of How it reaches out (decision 0113; the config's `reach_out` section,
 * config-schema.ts), with the fallback it read before the page existed: the offer is what the business does
 * (business_records.about) and then the owner's goal; the tone is the receptionist's; the sign-off is what the caller
 * already knew. A workspace that never opens the page is written for exactly as before. What the page's boxes refuse is
 * refusals.ts; the page's own words are settings.ts.
 */
import type { ReplyOffer } from "../../config/workspace-config/config-rules";

/** The config as the readers here take it: any parsed config, or a part of one. */
interface ReachOutReadable {
  reach_out?: {
    offer?: string;
    tone?: string;
    signed_by?: string;
    signature?: string;
    phone?: string;
    proof?: readonly string[];
    reply_offer?: ReplyOffer;
  };
  ask?: { goal?: string };
  brain?: { profile?: { tone?: string } };
}

const filled = (text: string | null | undefined): string | null => text?.trim() || null;

/** What a cold email offers: the owner's words on the page, else what the business does, else its goal. */
export function reachOutOfferOf(config: ReachOutReadable | null | undefined, about: string | null): string | null {
  return filled(config?.reach_out?.offer) ?? filled(about) ?? filled(config?.ask?.goal);
}

/** The tone a cold email is written in: its own, else the receptionist's. */
export function reachOutToneOf(config: ReachOutReadable | null | undefined): string | null {
  return filled(config?.reach_out?.tone) ?? filled(config?.brain?.profile?.tone);
}

/** The name a new sequence signs with: the page's, else what the caller knew (the member's first name, the last sequence's). */
export function reachOutSignedByOf(
  config: ReachOutReadable | null | undefined,
  otherwise: string | null,
): string | null {
  return filled(config?.reach_out?.signed_by) ?? filled(otherwise);
}

/**
 * What Sign-off puts under the name a cold email signs with: the Signature row's lines, the phone as the last; null where
 * both are empty. Every email Chanlytics sends carries it through the one ending rule (rules.ts coldEndingOf), which
 * keeps a mailbox's own signature in its place where the sequence signs with the mailbox.
 */
export function reachOutSignatureOf(config: ReachOutReadable | null | undefined): string | null {
  const lines = [...(config?.reach_out?.signature ?? "").split(/\r\n|\r|\n/), config?.reach_out?.phone ?? ""]
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.length ? lines.join("\n") : null;
}

/** What may back a number in a step's own words: each claim the owner stands behind, and the business's name. */
export function reachOutBackingOf(config: ReachOutReadable | null | undefined, businessName: string | null): string[] {
  const claims = (config?.reach_out?.proof ?? []).map((c) => c.trim()).filter(Boolean);
  const name = filled(businessName);
  return name ? [...claims, name] : claims;
}
