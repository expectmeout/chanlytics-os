/**
 * What each writer of a cold email reads of Cold email (decision 0113; the config's `reach_out` section,
 * config-schema.ts), with what it reads where nothing is set: the offer is what the business says of itself (db
 * findWorkspaceWords: business_records.about, else its Google profile's or its website's words) and then the owner's goal;
 * the tone is the receptionist's; the sign-off is what the caller already knew. So a workspace that never opens the page
 * is still written for from what is known of it. The page's own words are settings.ts.
 */
import type { ReachOutConfig } from "../../config/workspace-config/reach-out-schema";
import type { OpeningWorkspace } from "./opening";

/** The config as the readers here take it: any parsed config, or a part of one. */
interface ReachOutReadable {
  reach_out?: ReachOutConfig;
  ask?: { goal?: string };
  brain?: { profile?: { tone?: string } };
}

const filled = (text: string | null | undefined): string | null => text?.trim() || null;

/** What the business does, as a cold email says it: the owner's words on the page, else its own description. */
const whatItDoesOf = (config: ReachOutReadable | null | undefined, about: string | null): string | null =>
  filled(config?.reach_out?.offer) ?? filled(about);

/**
 * What a cold email offers, as the page says it and the drafter is told it apart: what the business does, else its goal.
 * The line about each business is told less (openingWorkspaceOf).
 */
export function reachOutOfferOf(config: ReachOutReadable | null | undefined, about: string | null): string | null {
  return whatItDoesOf(config, about) ?? filled(config?.ask?.goal);
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

/**
 * The owner's side of what the line about each business is told (contracts openingUserContent), for the check that writes
 * it and for What it's told, which shows it: their name, what they do, their tone. Never the goal: it is what they are
 * working toward, and the line says what they do.
 */
export function openingWorkspaceOf(
  name: string,
  config: ReachOutReadable | null | undefined,
  about: string | null,
): OpeningWorkspace {
  return { name, what_we_do: whatItDoesOf(config, about), tone: reachOutToneOf(config) };
}
