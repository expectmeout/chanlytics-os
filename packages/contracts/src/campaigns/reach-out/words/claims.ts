/** Words: claims. */

import { isFreeMail } from "../../../email/free-mail";
import { languageName } from "../../templates/languages";
import { siteHost } from "../../../leads/search/clean";
import { normalizeEmail } from "../../../shared/email-address";
import { isOpeningProblem, openingProblemWords } from "./opening";
import { isOneOf } from "../../../shared/unknown";

export const CHAIN_MIN_LISTINGS = 3;

/**
 * Whether a business reads like a chain (§4.4, F4): three or more of the workspace's leads share its own website, or
 * its name. The spec's "three locations on Maps" has no field; this is what the finder holds, said as measured. A page
 * on a platform (a social profile, a booking site) is nobody's own site (siteHost), so it counts nothing.
 */
export function chainOf(input: {
  website: string | null;
  site_listings: number;
  name_listings: number;
}): { by: "site" | "name"; listings: number } | null {
  if (siteHost(input.website) && input.site_listings >= CHAIN_MIN_LISTINGS)
    return { by: "site", listings: input.site_listings };
  if (input.name_listings >= CHAIN_MIN_LISTINGS) return { by: "name", listings: input.name_listings };
  return null;
}

/** The lead's address's domain when a person in People writes from it and it is nobody's free mail (F6); else null. */
export function customerDomainOf(email: string | null, sharedWithPerson: boolean): string | null {
  const address = normalizeEmail(email);
  const domain = address ? address.slice(address.lastIndexOf("@") + 1) : "";
  return sharedWithPerson && domain && !isFreeMail(domain) ? domain : null;
}

export const REACH_OUT_HOLDS = [
  "customer_domain",
  "chain",
  "language",
  "unbacked_fact",
  "reads_like_spam",
  "check_unavailable",
  // A business outside the countries cold email goes to without asking (decision 0056, 9): the owner may include it.
  "abroad",
] as const;

export type ReachOutHold = (typeof REACH_OUT_HOLDS)[number];

export function isReachOutHold(reason: string | null | undefined): reason is ReachOutHold {
  return isOneOf(REACH_OUT_HOLDS, reason ?? "");
}

export type HoldDoor = "include" | "rewrite" | "skip" | "not_a_fit";

/**
 * What a claim the reader refused is about (30 Oct 2026: an owner read "which their record doesn't hold" and could not
 * tell why, or what to do): the kinds no business's record states (reach-out/opening.ts OPENING_UNSTATED), and any
 * other detail, number or name. The reader names one; a held email says it.
 */
export const OPENING_CLAIM_KINDS = ["calls", "busy", "revenue", "feelings", "problems", "plans", "detail"] as const;

export type OpeningClaimKind = (typeof OPENING_CLAIM_KINDS)[number];

/** What a held opening's claim is, as its hold stores it: the reader's kind, or a guess code read in its words. */
export type HeldClaimKind = OpeningClaimKind | "guess";

const HELD_CLAIM_KINDS: readonly string[] = [...OPENING_CLAIM_KINDS, "guess"];

const isHeldClaimKind = (k: string): k is HeldClaimKind => HELD_CLAIM_KINDS.includes(k);

/** How much of a refused claim's words a hold keeps: with its kind, inside sequence_sends.hold_detail's 120. */
const HELD_SAID_MAX = 100;

/** An unbacked opening's hold detail: its kind and the words it said, kept as a chain's is ("site:3"). */
export function heldClaimDetail(kind: HeldClaimKind, sentence: string | null): string {
  return `${kind}:${(sentence ?? "").slice(0, HELD_SAID_MAX)}`;
}

/** An unbacked opening's hold detail read back; one stored before its kind was (its words alone) is words alone. */
export function heldClaimOf(detail: string | null): { kind: HeldClaimKind | null; said: string | null } {
  const d = detail?.trim() ?? "";
  const at = d.indexOf(":");
  const kind = at > 0 ? d.slice(0, at) : "";
  if (isHeldClaimKind(kind)) return { kind, said: d.slice(at + 1).trim() || null };
  return { kind: null, said: d || null };
}

/** What an unbacked opening guessed at, after "the opening ". */
const CLAIM_GUESSED: Record<Exclude<OpeningClaimKind, "detail">, string> = {
  calls: "guesses at their calls",
  busy: "guesses how busy they are",
  revenue: "guesses at their revenue",
  feelings: "guesses at how they feel",
  problems: "guesses at a problem they have",
  plans: "guesses at their plans",
};

const NOTHING_FOUND = "we found nothing that says so";

/** What an unbacked opening did, by its kind alone ("the opening guesses at their calls"); a hold with none, a detail. */
export function openingClaimWords(kind: HeldClaimKind | null): string {
  if (kind === "guess") return "the opening is worded as a guess";
  if (kind && kind !== "detail") return `the opening ${CLAIM_GUESSED[kind]}`;
  return "the opening says something we found nothing on";
}

function unbackedWords(c: { kind: HeldClaimKind | null; said: string | null }): string {
  if (c.kind === "guess") return c.said ? `${openingClaimWords("guess")}: “${c.said}”` : openingClaimWords("guess");
  if (c.kind && c.kind !== "detail") return `${openingClaimWords(c.kind)}; ${NOTHING_FOUND}`;
  return c.said ? `the opening says “${c.said}”; ${NOTHING_FOUND}` : openingClaimWords(null);
}

/**
 * A held send, said in a line (F3). The detail is what the check stored beside the reason: "site:3" or "name:4" for a
 * chain, the language's code, a customer's domain, the reader's words for an unbacked claim, the code rule an
 * opening broke (an OpeningProblem) for a pitch or an opening that could not be written.
 */
export function holdWords(reachOutHold: ReachOutHold, detail: string | null, stepLanguage = "en"): string {
  switch (reachOutHold) {
    case "customer_domain":
      return `a person in People writes from ${detail || "their domain"}`;
    case "chain": {
      const [by, n] = (detail ?? "").split(":");
      return n
        ? `reads like a chain: ${n} listings share their ${by === "name" ? "name" : "website"}`
        : "reads like a chain";
    }
    case "language":
      return `their listing reads in ${languageName(detail || "?")}; the email is in ${languageName(stepLanguage)}`;
    case "unbacked_fact":
      return unbackedWords(heldClaimOf(detail));
    case "reads_like_spam":
      return isOpeningProblem(detail)
        ? `the opening read like a pitch: ${openingProblemWords(detail)}`
        : "the opening read like a pitch";
    case "check_unavailable":
      return isOpeningProblem(detail)
        ? `the opening couldn't be written to the rules: ${openingProblemWords(detail)}`
        : "the check couldn't run";
    case "abroad":
      return `they're in ${countryWords(detail)}, where writing to a business first may need its say`;
  }
}

/** The countries a cold email goes to without asking (decision 0056, 9): the US, Canada and the United Kingdom. */
export const REACH_OUT_COUNTRIES_FREE: ReadonlySet<string> = new Set(["US", "CA", "GB"]);

/** The countries a cold email never goes to, even business to business: their law asks consent first. */
export const REACH_OUT_COUNTRIES_REFUSED: ReadonlySet<string> = new Set(["DE", "AT"]);

/**
 * Where a lead's country puts it (decision 0056, 9): free to write to, held for its owner's say, or never written to.
 * A lead with no country is the finder's, which searches the United States.
 */
export function reachOutCountryOf(country: string | null | undefined): "free" | "held" | "refused" {
  const c = (country ?? "US").trim().toUpperCase() || "US";
  if (REACH_OUT_COUNTRIES_REFUSED.has(c)) return "refused";
  return REACH_OUT_COUNTRIES_FREE.has(c) ? "free" : "held";
}

const COUNTRY_NAMES = new Intl.DisplayNames(["en"], { type: "region" });

/** A country's name, from its code; the code itself when it is not one. */
function countryWords(code: string | null): string {
  const c = (code ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return "another country";
  try {
    return COUNTRY_NAMES.of(c) ?? c;
  } catch {
    // A zone or a code the runtime does not know.
    return c;
  }
}

/** What an owner can do about a held send: only the doors that answer its reason. */
export function holdDoors(reachOutHold: ReachOutHold): HoldDoor[] {
  switch (reachOutHold) {
    case "customer_domain":
      return ["skip", "include"];
    // Not a fit closes the lead; Skip lets this email go unsent and keeps the lead, as every other hold's no does.
    case "chain":
      return ["include", "not_a_fit", "skip"];
    case "language":
      return ["include", "skip"];
    case "unbacked_fact":
    case "reads_like_spam":
      return ["rewrite", "include", "skip"];
    case "check_unavailable":
      return ["rewrite", "skip"];
    case "abroad":
      return ["include", "skip"];
  }
}

/**
 * The holds an owner's Include carries past this one email to the lead's later sends in the chain (R7). These four are
 * facts about the business, the same at every step: a person in People writes from its domain, it reads like a chain,
 * its listing reads in another language, it is abroad. The two word holds, unbacked_fact and reads_like_spam, are about
 * one opening's words, and every step's opening is written fresh: an Include past them vouches for that email alone,
 * and a later step's opening is read as any other. check_unavailable is never included (reach_out_send_decide refuses).
 */
export const HOLDS_INCLUDED_FOR_CHAIN: ReadonlySet<ReachOutHold> = new Set<ReachOutHold>([
  "customer_domain",
  "chain",
  "language",
  "abroad",
]);

/** A held email's doors, in one meaning each (the lead-to-sequence canvas): it goes as it reads, or this one is skipped. */
export const HOLD_DOOR_WORDS: Record<HoldDoor, string> = {
  include: "Send anyway",
  rewrite: "Rewrite the opening",
  skip: "Skip this email",
  not_a_fit: "Not a fit",
};
