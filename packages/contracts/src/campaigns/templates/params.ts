/** Templates: params. */

import { isIdentifierName } from "../../conversations/thread-contact";

/* ---- What fills a slot ---- */

export const PARAM_SOURCES = [
  "text",
  "first_name",
  "business_name",
  "booking_link",
  "review_link",
  "visit_when",
  "visit_service",
  "proposal_link",
  "freed_when",
] as const;

export type ParamSourceKind = (typeof PARAM_SOURCES)[number];

export type ParamSpec =
  | { kind: "text"; value: string }
  | { kind: "first_name" }
  | { kind: "business_name" }
  | { kind: "booking_link" }
  /** Where a customer leaves the business a review: the link its Google listing keeps (google_listings.new_review_uri). */
  | { kind: "review_link" }
  /** A visit playbook's own words: "tomorrow at 2:00 PM", and the service. */
  | { kind: "visit_when" }
  | { kind: "visit_service" }
  /** A follow-up's own words: the link of the proposal the person's deal waits on (0006). */
  | { kind: "proposal_link" }
  /** A freed time's own words (0082): the time a cancellation freed, the same for everyone its batch reaches. */
  | { kind: "freed_when" };

export const PARAM_SOURCE_LABELS: Record<ParamSourceKind, string> = {
  text: "Type it",
  first_name: "Their first name",
  business_name: "The business name",
  booking_link: "The booking link",
  review_link: "The review link",
  visit_when: "Their booked time",
  visit_service: "Their booked service",
  proposal_link: "Their proposal's link",
  freed_when: "The freed time",
};

/**
 * Where a filled slot's words come from, beside the words themselves in a
 * composer: the example says what one person reads, this says what every
 * person's is.
 */
export const PARAM_SOURCE_HINTS: Record<Exclude<ParamSourceKind, "text">, string> = {
  first_name: "Each person's own — “there” when none is on file",
  business_name: "From Settings › Details",
  booking_link: "From Settings › Hours & booking",
  review_link: "From your Google listing",
  visit_when: "Each one's own, from the calendar",
  visit_service: "Each one's own, from the calendar",
  proposal_link: "Each proposal's own, from its deal",
  freed_when: "The freed time's own, from the calendar",
};

/**
 * A slot's spec from what a route or a card was given: a plain string is
 * typed text; "@first_name" and the like are the sources; an object with a
 * kind is itself. Null means "not a spec".
 */
export function parseParamSpec(raw: unknown): ParamSpec | null {
  if (typeof raw === "string") {
    const m =
      /^@(first_name|business_name|booking_link|review_link|visit_when|visit_service|proposal_link|freed_when)$/.exec(
        raw.trim(),
      );
    if (m) return { kind: m[1] as Exclude<ParamSourceKind, "text"> };
    return { kind: "text", value: raw };
  }
  if (raw && typeof raw === "object") {
    const value = raw as { kind?: unknown; value?: unknown };
    if (value.kind === "text") return typeof value.value === "string" ? { kind: "text", value: value.value } : null;
    if (
      value.kind === "first_name" ||
      value.kind === "business_name" ||
      value.kind === "booking_link" ||
      value.kind === "review_link" ||
      value.kind === "visit_when" ||
      value.kind === "visit_service" ||
      value.kind === "proposal_link" ||
      value.kind === "freed_when"
    )
      return { kind: value.kind };
  }
  return null;
}

/**
 * Every slot's spec from a stored row, leniently: a value nothing recognises
 * stays as typed text, so a row written before the specs were typed still
 * renders. The one reader for the four places that used to spell this out.
 */
export function parseParamSpecs(raw: unknown): ParamSpec[] {
  return Array.isArray(raw)
    ? (raw as unknown[]).map((p) => parseParamSpec(p) ?? { kind: "text" as const, value: String(p) })
    : [];
}

export function paramLabel(spec: ParamSpec): string {
  return spec.kind === "text" ? spec.value : PARAM_SOURCE_LABELS[spec.kind].toLowerCase();
}

/**
 * A slot's value as a card quotes it, the one rule every card says one by: typed words in quotes (“15% off a colour”),
 * a value a run fills by its name (paramLabel: "their first name"). What an owner approves is the words that go.
 */
export function paramSaid(spec: ParamSpec): string {
  return spec.kind === "text" ? `“${spec.value}”` : paramLabel(spec);
}

/**
 * The running playbooks that still send a template, as a refusal says it: "“Win-back” still sends this message.
 * Pause it, or give it another message, first." Deleting it would leave every later run skipped.
 */
export function playbooksStillSending(names: readonly string[]): string {
  const quoted = names.map((n) => `“${n}”`);
  if (quoted.length <= 1)
    return `${quoted[0] ?? "A campaign"} still uses this template. Pause it, or give it another, first.`;
  return `${quoted.slice(0, -1).join(", ")} and ${quoted[quoted.length - 1]} still use this template. Pause them, or give them another, first.`;
}

export interface ParamFacts {
  firstName: string | null;
  businessName: string;
  bookingLink: string | null;
  /**
   * The link the workspace's Google listing keeps for a review (00415), as a broadcast's send reads it; absent where
   * nothing fills a review slot: the Inbox and a call's booking link turn such a template away (inbox-templates
   * slotToWrite).
   */
  reviewLink?: string | null;
  /** A visit playbook's words for this person, resolved when the run was made; absent elsewhere. */
  visitWhen?: string | null;
  visitService?: string | null;
  /** A follow-up's link for this person, frozen when the run was made (0006); absent elsewhere. */
  proposalLink?: string | null;
  /** The freed time as its batch kept it for the send (0082); absent elsewhere. */
  freedWhen?: string | null;
}

/**
 * The first name a message may use, or null when all that is on file is a number or an address (isIdentifierName, the one
 * test). And null for a name a person was given by their business or by the engine and nobody has looked at (0052): a
 * stand-in named for the business they work at (name source `lead`) is "there", never "Bloom"; a name taken from a
 * reply's signature or a wire without a member's press waits until a member settles it. A name whose source is not
 * known (`nameSource` absent or null) is greeted as before.
 */
export function firstNameOf(
  displayName: string | null | undefined,
  waProfileName: string | null | undefined,
  name?: { source: string | null | undefined; settled: boolean } | null,
): string | null {
  if (displayName && name) {
    if (name.source === "lead") return null;
    if ((name.source === "signature" || name.source === "wire") && !name.settled) return null;
  }
  const raw = (displayName || waProfileName || "").trim();
  if (!raw || isIdentifierName(raw)) return null;
  const first = raw.split(/\s+/)[0].replace(/[^\p{L}\p{M}'’-]/gu, "");
  return first ? first.slice(0, 30) : null;
}

/**
 * The words that go into the slots for one person. A first name nobody has
 * on file becomes "there" ("Hi there"); a booking link the workspace has not
 * set becomes empty, which the route refuses before any broadcast is made.
 */
export function resolveParams(specs: readonly ParamSpec[], paramFacts: ParamFacts): string[] {
  return specs.map((spec) => {
    switch (spec.kind) {
      case "text":
        return spec.value;
      case "first_name":
        return paramFacts.firstName || "there";
      case "business_name":
        return paramFacts.businessName;
      case "booking_link":
        return paramFacts.bookingLink ?? "";
      case "review_link":
        return paramFacts.reviewLink ?? "";
      case "visit_when":
        return paramFacts.visitWhen ?? "";
      case "visit_service":
        return paramFacts.visitService ?? "";
      case "proposal_link":
        return paramFacts.proposalLink ?? "";
      case "freed_when":
        return paramFacts.freedWhen ?? "";
    }
  });
}

/** What an example fills the slots that are not a person's own with. */
const exampleFacts = (businessName: string) => ({
  businessName,
  bookingLink: "your booking link",
  reviewLink: "your review link",
  visitWhen: "tomorrow at 2:00 PM",
  visitService: "a consultation",
  proposalLink: "their proposal's link",
  freedWhen: "tomorrow at 2:00 PM",
});

/** Example words for a preview: what a real person would see. */
export function exampleParams(specs: readonly ParamSpec[], businessName: string): string[] {
  return resolveParams(specs, { firstName: "Dani", ...exampleFacts(businessName) });
}

/**
 * The example words as one real person reads them: their own first name, by the wire's rule (firstNameOf: none is
 * "there", as "Hi there"), and the example's for every other slot. What a step's preview shows as someone of its batch.
 */
export function exampleParamsFor(
  specs: readonly ParamSpec[],
  businessName: string,
  firstName: string | null,
): string[] {
  return resolveParams(specs, { firstName, ...exampleFacts(businessName) });
}

/** The words a person's row keeps for the slots that take them (core wordsKeptOnRow), by the slot facts they fill. */
const KEPT_ON_ROW = {
  visit_when: "visitWhen",
  visit_service: "visitService",
  proposal_link: "proposalLink",
  freed_when: "freedWhen",
} as const;

/**
 * What Send me a test fills a message for: the example person's words (exampleParams), with the workspace's own booking
 * link where it has one, and a link only a real person or the listing has said in brackets, since a plain email marks no
 * value as a stand-in (3 Nov 2026: "their proposal's link" read as a slot left unfilled). `facts` is the row an example
 * person's send would keep for the slots it names, which says its foot's reason as a real row says it.
 */
export function testParamsOf(
  specs: readonly ParamSpec[],
  options: { businessName: string; bookingLink: string | null },
): { who: string; values: string[]; facts: Record<string, string> } {
  const fields = {
    firstName: "Dani",
    ...exampleFacts(options.businessName),
    bookingLink: options.bookingLink?.trim() || "[your booking link]",
    reviewLink: "[your review link]",
    proposalLink: "[their proposal's link]",
  };
  const facts: Record<string, string> = {};
  for (const s of specs)
    if (s.kind in KEPT_ON_ROW) facts[s.kind] = fields[KEPT_ON_ROW[s.kind as keyof typeof KEPT_ON_ROW]];
  return { who: fields.firstName, values: resolveParams(specs, fields), facts };
}
